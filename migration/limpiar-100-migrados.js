/**
 * Limpiar Auth + Firestore de los primeros 100 clientes migrados (email real)
 * Genera CSV con la lista antes de borrar
 */
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'enar-b2b' });
const db = admin.firestore();
const fs = require('fs');

const PREVIEW = process.argv.includes('--preview');
const EXECUTE = process.argv.includes('--execute');

if (!PREVIEW && !EXECUTE) {
  console.log('Uso:');
  console.log('  node limpiar-100-migrados.js --preview   (genera CSV, no borra)');
  console.log('  node limpiar-100-migrados.js --execute    (genera CSV + borra Auth y Firestore)');
  process.exit(0);
}

async function run() {
  const snap = await db.collection('usuarios')
    .where('migrated_from_sheets', '==', true)
    .get();

  // Filtrar solo emails reales, tomar primeros 100
  const migrados = snap.docs
    .filter(d => d.data().email && !d.data().email.includes('@enar-temporal.com'))
    .slice(0, 100);

  console.log(`Seleccionados: ${migrados.length} clientes\n`);

  // Generar CSV
  const csvLines = ['ID_Firestore,Nombre,Email,NIT,Telefono,Tipo_Cliente,Estado,Ubicacion,Direccion,Lista_Precios,Creado_Por'];
  for (const doc of migrados) {
    const d = doc.data();
    const line = [
      doc.id,
      (d.nombre || '').replace(/,/g, ';'),
      d.email || '',
      (d.nit || '').replace(/,/g, ';'),
      d.telefono || '',
      d.tipo_cliente || '',
      d.estado || '',
      (d.ubicacion || '').replace(/,/g, ';'),
      (d.direccion || '').replace(/,/g, ';'),
      d.lista_precios || '',
      (d.creado_por || '').replace(/,/g, ';')
    ].join(',');
    csvLines.push(line);
  }

  const csvPath = '/Users/jota2002/Proyectos_ENAR/enar-catalog/migration/100-clientes-migrados.csv';
  fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf8');
  console.log(`CSV generado: ${csvPath}\n`);

  if (PREVIEW) {
    // Mostrar lista
    for (const doc of migrados) {
      const d = doc.data();
      console.log(`  ${doc.id} | ${d.nombre} | ${d.email}`);
    }
    console.log(`\nTotal: ${migrados.length} (solo preview, nada borrado)`);
    process.exit(0);
  }

  // EXECUTE: borrar Auth + Firestore
  let authOk = 0, authNotFound = 0, authErr = 0, fsOk = 0;

  for (let i = 0; i < migrados.length; i++) {
    const doc = migrados[i];
    const d = doc.data();

    // Borrar Auth
    try {
      const authUser = await admin.auth().getUserByEmail(d.email);
      await admin.auth().deleteUser(authUser.uid);
      authOk++;
    } catch (err) {
      if (err.code === 'auth/user-not-found') authNotFound++;
      else { console.log(`  ERR Auth: ${d.email} - ${err.message}`); authErr++; }
    }

    // Borrar Firestore
    await doc.ref.delete();
    fsOk++;

    if ((i + 1) % 25 === 0) console.log(`  Procesados: ${i + 1}/100...`);
  }

  console.log('\n=== RESULTADO ===');
  console.log(`  Auth eliminadas: ${authOk}`);
  console.log(`  Auth no existían: ${authNotFound}`);
  console.log(`  Auth errores: ${authErr}`);
  console.log(`  Firestore eliminados: ${fsOk}`);
  console.log(`\nEmails liberados. Listos para crear desde CRM o B2B.`);

  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
