/**
 * Limpiar cuentas Firebase Auth de clientes migrados
 *
 * Elimina las cuentas Auth (libera emails) y opcionalmente los docs Firestore
 * para que los clientes puedan ser creados correctamente desde CRM o B2B.
 *
 * Uso:
 *   node limpiar-auth-migrados.js --preview          (solo muestra, no borra)
 *   node limpiar-auth-migrados.js --auth-only         (solo elimina Auth, conserva Firestore)
 *   node limpiar-auth-migrados.js --full               (elimina Auth + Firestore)
 */
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'enar-b2b' });
const db = admin.firestore();

const PREVIEW = process.argv.includes('--preview');
const AUTH_ONLY = process.argv.includes('--auth-only');
const FULL = process.argv.includes('--full');

if (!PREVIEW && !AUTH_ONLY && !FULL) {
  console.log('Uso:');
  console.log('  node limpiar-auth-migrados.js --preview     (solo muestra)');
  console.log('  node limpiar-auth-migrados.js --auth-only   (elimina Auth, conserva Firestore)');
  console.log('  node limpiar-auth-migrados.js --full        (elimina Auth + Firestore)');
  process.exit(0);
}

async function run() {
  // Obtener todos los usuarios migrados
  const snap = await db.collection('usuarios')
    .where('migrated_from_sheets', '==', true)
    .get();

  console.log(`Total migrados en Firestore: ${snap.size}`);
  console.log(`Modo: ${PREVIEW ? 'PREVIEW (no borra nada)' : AUTH_ONLY ? 'AUTH-ONLY' : 'FULL'}\n`);

  let authDeleted = 0, authNotFound = 0, authError = 0;
  let firestoreDeleted = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    const email = d.email || '';

    // Saltar emails temporales
    if (email.includes('@enar-temporal.com')) continue;

    if (PREVIEW) {
      console.log(`  ${doc.id} | ${d.nombre} | ${email} | ${d.estado}`);
      authDeleted++;
      continue;
    }

    // Eliminar cuenta Auth
    try {
      const authUser = await admin.auth().getUserByEmail(email);
      await admin.auth().deleteUser(authUser.uid);
      authDeleted++;
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        authNotFound++;
      } else {
        console.log(`  ERROR Auth ${email}: ${err.message}`);
        authError++;
        continue;
      }
    }

    // Eliminar doc Firestore si es modo FULL
    if (FULL) {
      await doc.ref.delete();
      firestoreDeleted++;
    }

    // Progreso cada 100
    const total = authDeleted + authNotFound + authError;
    if (total % 100 === 0) {
      console.log(`  Procesados: ${total}...`);
    }
  }

  console.log('\n=== RESULTADO ===');
  console.log(`  Auth eliminadas: ${authDeleted}`);
  console.log(`  Auth no existían: ${authNotFound}`);
  console.log(`  Auth errores: ${authError}`);
  if (FULL) console.log(`  Firestore eliminados: ${firestoreDeleted}`);

  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
