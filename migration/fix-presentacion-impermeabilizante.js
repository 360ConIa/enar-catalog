/**
 * Fix: Cambiar presentacion de "Galón" a "Cuñete" en 7 productos Impermeabilizante Cuñete
 */
const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'enar-b2b'
});

const db = admin.firestore();

async function fix() {
  const snap = await db.collection('productos')
    .where('titulo', '>=', 'Impermeabilizante Cuñete')
    .where('titulo', '<=', 'Impermeabilizante Cuñete\uf8ff')
    .get();

  console.log(`Encontrados: ${snap.size} productos`);

  let count = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    const pres = (data.presentacion || '').toLowerCase();
    if (pres === 'galón' || pres === 'galon') {
      console.log(`  ✏️  ${doc.id} | ${data.titulo} | "${data.presentacion}" → "Cuñete"`);
      await doc.ref.update({ presentacion: 'Cuñete' });
      count++;
    } else {
      console.log(`  ⏭️  ${doc.id} | ${data.titulo} | presentacion="${data.presentacion}" (sin cambio)`);
    }
  }

  console.log(`\n✅ Actualizados: ${count} productos`);
  process.exit(0);
}

fix().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
