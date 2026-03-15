const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'enar-b2b' });
const db = admin.firestore();

async function diagnose() {
  const keywords = ['FENERGY', 'MARINA RODRIGUEZ', 'LESCANO'];

  const allUsers = await db.collection('usuarios').get();

  for (const kw of keywords) {
    console.log(`\n--- Buscando "${kw}" ---`);
    let found = false;
    for (const doc of allUsers.docs) {
      const d = doc.data();
      const haystack = `${d.nombre || ''} ${d.razon_social || ''} ${d.email || ''}`.toUpperCase();
      if (haystack.includes(kw.toUpperCase())) {
        found = true;
        console.log(`  Doc ID: ${doc.id}`);
        console.log(`  nombre: ${d.nombre || '-'}`);
        console.log(`  razon_social: ${d.razon_social || '-'}`);
        console.log(`  email: ${d.email || '-'}`);
        console.log(`  estado: ${d.estado}`);
        console.log(`  migrado: ${d.migrated_from_sheets ? 'SI' : 'NO'}`);

        // Check Firebase Auth
        if (d.email) {
          try {
            const authUser = await admin.auth().getUserByEmail(d.email);
            console.log(`  Auth: SI (uid: ${authUser.uid}, match: ${authUser.uid === doc.id})`);
          } catch (err) {
            console.log(`  Auth: ${err.code === 'auth/user-not-found' ? 'NO TIENE CUENTA' : err.message}`);
          }
        }
      }
    }
    if (!found) console.log('  NO ENCONTRADO en ningún campo');
  }

  // Contar cuántos tienen email temporal
  let temporal = 0, real = 0, noAuth = 0, withAuth = 0;
  const sample = [];
  for (const doc of allUsers.docs) {
    const d = doc.data();
    if (!d.migrated_from_sheets) continue;
    if (d.email && d.email.includes('@enar-temporal.com')) {
      temporal++;
    } else {
      real++;
    }
  }

  // Verificar Auth en 10 migrados aleatorios con email real
  const migrados = allUsers.docs.filter(d => d.data().migrated_from_sheets && d.data().email && !d.data().email.includes('@enar-temporal'));
  const muestra = migrados.slice(0, 10);
  console.log(`\n=== MUESTRA: 10 migrados con email real ===`);
  for (const doc of muestra) {
    const d = doc.data();
    try {
      const authUser = await admin.auth().getUserByEmail(d.email);
      console.log(`  Auth SI: ${d.email} (uid match: ${authUser.uid === doc.id})`);
      withAuth++;
    } catch (err) {
      console.log(`  Auth NO: ${d.email}`);
      noAuth++;
    }
  }

  console.log(`\n=== RESUMEN EMAILS MIGRADOS ===`);
  console.log(`  Email real: ${real}`);
  console.log(`  Email temporal: ${temporal}`);
  console.log(`  Muestra con Auth: ${withAuth}/10`);
  console.log(`  Muestra sin Auth: ${noAuth}/10`);

  process.exit(0);
}

diagnose().catch(e => { console.error(e.message); process.exit(1); });
