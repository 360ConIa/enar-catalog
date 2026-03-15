/**
 * Diagnóstico: Verificar si clientes migrados tienen cuenta Firebase Auth
 */
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'enar-b2b' });
const db = admin.firestore();

const CLIENTES_TEST = [
  'Romero Gutierrez Andres Felipe',
  'FENERGY SAS',
  'FABRICACION Y DISTRIBUCION MARINA RODRIGUEZ S.A.S',
  'LESCANO PORTELA HERNEY'
];

async function diagnose() {
  console.log('=== DIAGNÓSTICO CLIENTES ===\n');

  for (const nombre of CLIENTES_TEST) {
    console.log(`--- ${nombre} ---`);

    // Buscar en Firestore por nombre
    const snap = await db.collection('usuarios')
      .where('nombre', '==', nombre)
      .limit(1)
      .get();

    if (snap.empty) {
      // Intentar por razon_social
      const snap2 = await db.collection('usuarios')
        .where('razon_social', '==', nombre)
        .limit(1)
        .get();

      if (snap2.empty) {
        console.log('  Firestore: NO ENCONTRADO');
        console.log('');
        continue;
      }
      snap2.forEach(doc => processDoc(doc));
    } else {
      snap.forEach(doc => processDoc(doc));
    }
    console.log('');
  }

  // Contar clientes sin campo 'migrated_from_sheets' vs con él
  const allUsers = await db.collection('usuarios').get();
  let migrated = 0, crm = 0, selfReg = 0, noEmail = 0;
  for (const doc of allUsers.docs) {
    const d = doc.data();
    if (d.migrated_from_sheets) migrated++;
    else if (d.creado_por) crm++;
    else selfReg++;
    if (!d.email) noEmail++;
  }
  console.log(`=== RESUMEN USUARIOS: ${allUsers.size} total ===`);
  console.log(`  Migrados (sheets): ${migrated}`);
  console.log(`  Creados por CRM: ${crm}`);
  console.log(`  Auto-registrados: ${selfReg}`);
  console.log(`  Sin email: ${noEmail}`);

  process.exit(0);
}

async function processDoc(doc) {
  const d = doc.data();
  console.log(`  Firestore ID: ${doc.id}`);
  console.log(`  Email: ${d.email || 'NO TIENE'}`);
  console.log(`  Estado: ${d.estado}`);
  console.log(`  Rol: ${d.rol || 'sin rol'}`);
  console.log(`  Migrado: ${d.migrated_from_sheets ? 'SI' : 'NO'}`);
  console.log(`  Creado por: ${d.creado_por || 'auto-registro'}`);
  console.log(`  Tiene UID: ${d.uid ? 'SI' : 'NO'}`);

  // Verificar si tiene cuenta Firebase Auth
  if (d.email) {
    try {
      const authUser = await admin.auth().getUserByEmail(d.email);
      console.log(`  Firebase Auth: SI (uid: ${authUser.uid})`);
      console.log(`  Auth UID == Doc ID: ${authUser.uid === doc.id ? 'SI' : 'NO (' + authUser.uid + ' vs ' + doc.id + ')'}`);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        console.log(`  Firebase Auth: NO - NO TIENE CUENTA AUTH`);
      } else {
        console.log(`  Firebase Auth: ERROR - ${err.message}`);
      }
    }
  }
}

diagnose().catch(e => { console.error(e.message); process.exit(1); });
