/**
 * Recuperar clientes en limbo (Firestore borrado, Auth no recreado)
 * Lee el CSV backup del batch fallido y recrea Auth + Firestore
 */
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'enar-b2b' });
const db = admin.firestore();
const fs = require('fs');

const csvFile = process.argv[2];
if (!csvFile) {
  console.log('Uso: node recuperar-limbo.js batch-800-2026-03-15.csv');
  process.exit(0);
}

async function run() {
  const csv = fs.readFileSync(csvFile, 'utf8');
  const lines = csv.trim().split('\n');
  console.log(`CSV: ${csvFile} (${lines.length - 1} registros)\n`);

  // Detectar cuáles están en limbo (no tienen doc en Firestore)
  const allUsers = await db.collection('usuarios').get();
  const existingEmails = new Set(allUsers.docs.map(d => d.data().email));

  const limbo = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    const email = parts[0];
    if (!existingEmails.has(email)) limbo.push(parts);
  }

  console.log(`En limbo (sin Firestore): ${limbo.length}\n`);
  if (limbo.length === 0) { console.log('Nada que recuperar.'); process.exit(0); }

  let authCreated = 0, authExisted = 0, authErr = 0, fsCreated = 0;

  for (let i = 0; i < limbo.length; i++) {
    const [email, nombre, nit, telefono, tipo, estado, ubicacion, direccion, lista, creado] = limbo[i];

    if (!nit || nit.length < 6) {
      console.log(`  SKIP: ${email} — NIT corto: "${nit}"`);
      continue;
    }

    // Limpiar Auth viejo si existe
    try {
      const old = await admin.auth().getUserByEmail(email);
      await admin.auth().deleteUser(old.uid);
    } catch (e) { /* no existe, OK */ }

    // Crear Auth nuevo
    let newUid;
    try {
      const newUser = await admin.auth().createUser({
        email, password: nit, displayName: nombre || ''
      });
      newUid = newUser.uid;
      authCreated++;
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        try {
          const existing = await admin.auth().getUserByEmail(email);
          newUid = existing.uid;
          authExisted++;
        } catch (e2) {
          console.log(`  ERR Auth: ${email} - ${e2.message}`);
          authErr++;
          continue;
        }
      } else {
        console.log(`  ERR Auth: ${email} - ${err.message}`);
        authErr++;
        continue;
      }
    }

    // Crear Firestore
    await db.collection('usuarios').doc(newUid).set({
      uid: newUid,
      email,
      nombre: nombre || '',
      telefono: telefono || '',
      tipo_cliente: tipo || 'Persona Natural',
      estado: 'aprobado',
      rol: 'cliente',
      razon_social: '',
      nit: nit || '',
      direccion: direccion || '',
      ubicacion: ubicacion || '',
      lista_precios: lista || '',
      creado_por: creado || 'import-masivo',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      aprobado_en: new Date().toISOString(),
      importado: true
    });
    fsCreated++;

    if ((i + 1) % 50 === 0 || i === limbo.length - 1)
      console.log(`  Procesados: ${i + 1}/${limbo.length}...`);
  }

  console.log('\n=== RESULTADO ===');
  console.log(`  Auth creados: ${authCreated}`);
  console.log(`  Auth ya existían: ${authExisted}`);
  console.log(`  Auth errores: ${authErr}`);
  console.log(`  Firestore creados: ${fsCreated}`);
  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
