const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'enar-b2b' });
const db = admin.firestore();

async function fix() {
  const src = await db.collection('productos').doc('TG300').get();
  if (!src.exists) { console.error('TG300 no encontrado'); process.exit(1); }
  const img = src.data().imagen_principal;
  console.log('Imagen TG300:', img ? img.substring(0,80)+'...' : 'NO TIENE');

  const ids = ['TG201','TG600','TG500','TG400','TG100','TG01','TG700','TG200'];
  for (const id of ids) {
    const doc = await db.collection('productos').doc(id).get();
    if (doc.exists) {
      await doc.ref.update({ imagen_principal: img });
      console.log('  OK', id, '|', doc.data().titulo);
    } else {
      console.log('  --', id, 'no encontrado');
    }
  }
  console.log('\nActualizados:', ids.length);
  process.exit(0);
}
fix().catch(e => { console.error(e.message); process.exit(1); });
