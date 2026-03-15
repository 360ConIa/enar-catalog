/**
 * Recrear clientes migrados en batches (Admin SDK — server-side)
 *
 * Flujo: Query migrados → CSV backup → Delete Auth+Firestore → Recrear Auth+Firestore
 * Password = NIT del cliente
 *
 * Uso:
 *   node recrear-clientes-batch.js --preview --batch=200       (muestra lista, no hace nada)
 *   node recrear-clientes-batch.js --execute --batch=200       (ejecuta batch de 200)
 *   node recrear-clientes-batch.js --execute --batch=400       (ejecuta batch de 400)
 */
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'enar-b2b' });
const db = admin.firestore();
const fs = require('fs');

const PREVIEW = process.argv.includes('--preview');
const EXECUTE = process.argv.includes('--execute');
const batchArg = process.argv.find(a => a.startsWith('--batch='));
const BATCH_SIZE = batchArg ? parseInt(batchArg.split('=')[1]) : 0;

if ((!PREVIEW && !EXECUTE) || !BATCH_SIZE) {
  console.log('Uso:');
  console.log('  node recrear-clientes-batch.js --preview --batch=200');
  console.log('  node recrear-clientes-batch.js --execute --batch=200');
  process.exit(0);
}

async function run() {
  console.log(`=== RECREAR CLIENTES MIGRADOS ===`);
  console.log(`Batch: ${BATCH_SIZE} | Modo: ${PREVIEW ? 'PREVIEW' : 'EXECUTE'}\n`);

  // 1. Query migrados con email real (excluir temporales y ya importados)
  const snap = await db.collection('usuarios')
    .where('migrated_from_sheets', '==', true)
    .get();

  const migrados = snap.docs.filter(d => {
    const data = d.data();
    return data.email
      && !data.email.includes('@enar-temporal.com')
      && !data.importado;  // Excluir los ya recreados
  });

  const batch = migrados.slice(0, BATCH_SIZE);
  console.log(`Migrados pendientes: ${migrados.length}`);
  console.log(`Este batch: ${batch.length}\n`);

  if (batch.length === 0) {
    console.log('No hay más clientes migrados pendientes.');
    process.exit(0);
  }

  // 2. Generar CSV backup
  const timestamp = new Date().toISOString().slice(0, 10);
  const csvPath = `batch-${BATCH_SIZE}-${timestamp}.csv`;
  const csvLines = ['Email,Nombre,NIT,Telefono,Tipo_Cliente,Estado,Ubicacion,Direccion,Lista_Precios,Creado_Por'];

  for (const doc of batch) {
    const d = doc.data();
    csvLines.push([
      d.email || '',
      (d.nombre || '').replace(/,/g, ';'),
      (d.nit || '').replace(/,/g, ';'),
      d.telefono || '',
      d.tipo_cliente || '',
      d.estado || '',
      (d.ubicacion || '').replace(/,/g, ';'),
      (d.direccion || '').replace(/,/g, ';'),
      d.lista_precios || '',
      (d.creado_por || '').replace(/,/g, ';')
    ].join(','));
  }

  fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf8');
  console.log(`CSV backup: ${csvPath}\n`);

  if (PREVIEW) {
    for (const doc of batch) {
      const d = doc.data();
      console.log(`  ${d.email} | ${d.nombre} | NIT: ${d.nit}`);
    }
    console.log(`\nTotal: ${batch.length} (preview, nada ejecutado)`);
    process.exit(0);
  }

  // 3. EXECUTE: Delete + Recrear
  let deleteAuthOk = 0, deleteAuthNotFound = 0, deleteAuthErr = 0;
  let deleteFsOk = 0;
  let createAuthOk = 0, createAuthErr = 0;
  let createFsOk = 0;
  const errores = [];

  for (let i = 0; i < batch.length; i++) {
    const doc = batch[i];
    const d = doc.data();
    const email = d.email;
    const nit = d.nit || '';

    // Validar que tenga NIT de al menos 6 chars para password
    if (!nit || nit.length < 6) {
      console.log(`  SKIP: ${email} — NIT muy corto: "${nit}"`);
      errores.push({ email, error: 'NIT < 6 chars' });
      continue;
    }

    // --- FASE 1: Eliminar Auth existente ---
    try {
      const authUser = await admin.auth().getUserByEmail(email);
      await admin.auth().deleteUser(authUser.uid);
      deleteAuthOk++;
    } catch (err) {
      if (err.code === 'auth/user-not-found') deleteAuthNotFound++;
      else { deleteAuthErr++; console.log(`  ERR delete Auth: ${email} - ${err.message}`); }
    }

    // --- FASE 2: Eliminar Firestore ---
    await doc.ref.delete();
    deleteFsOk++;

    // --- FASE 3: Crear Auth con NIT como password ---
    let newUid;
    try {
      const newUser = await admin.auth().createUser({
        email: email,
        password: nit,
        displayName: d.nombre || ''
      });
      newUid = newUser.uid;
      createAuthOk++;
    } catch (err) {
      console.log(`  ERR create Auth: ${email} - ${err.message}`);
      createAuthErr++;
      errores.push({ email, error: err.message });
      continue;
    }

    // --- FASE 4: Crear Firestore con datos originales ---
    const userData = {
      uid: newUid,
      email: email,
      nombre: d.nombre || '',
      telefono: d.telefono || '',
      tipo_cliente: d.tipo_cliente || 'Persona Natural',
      estado: 'aprobado',
      rol: 'cliente',
      razon_social: d.razon_social || '',
      nit: nit,
      direccion: d.direccion || '',
      ubicacion: d.ubicacion || '',
      lista_precios: d.lista_precios || '',
      creado_por: d.creado_por || 'import-masivo',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      aprobado_en: new Date().toISOString(),
      importado: true
    };

    // Preservar campos extra si existen
    if (d.sheets_id_cliente) userData.sheets_id_cliente = d.sheets_id_cliente;
    if (d.departamento) userData.departamento = d.departamento;
    if (d.ciudad) userData.ciudad = d.ciudad;

    await db.collection('usuarios').doc(newUid).set(userData);
    createFsOk++;

    // Progreso
    if ((i + 1) % 50 === 0 || i === batch.length - 1) {
      console.log(`  Procesados: ${i + 1}/${batch.length}...`);
    }
  }

  // Resumen
  console.log('\n=== RESULTADO ===');
  console.log(`  Auth eliminados: ${deleteAuthOk} (no existían: ${deleteAuthNotFound}, errores: ${deleteAuthErr})`);
  console.log(`  Firestore eliminados: ${deleteFsOk}`);
  console.log(`  Auth creados: ${createAuthOk} (errores: ${createAuthErr})`);
  console.log(`  Firestore creados: ${createFsOk}`);

  if (errores.length > 0) {
    console.log(`\n  ERRORES (${errores.length}):`);
    errores.forEach(e => console.log(`    ${e.email}: ${e.error}`));
  }

  // Cuántos quedan
  const restantes = migrados.length - batch.length;
  console.log(`\n  Pendientes después de este batch: ${restantes}`);

  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
