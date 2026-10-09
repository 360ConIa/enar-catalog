const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'enar-b2b' });
const db = admin.firestore();

async function run() {
  const snap = await db.collection('productos').get();

  console.log('=== ANOLOC (destino) ===');
  for (const doc of snap.docs) {
    const t = (doc.data().titulo || '').toLowerCase();
    if (t.includes('anoloc')) {
      console.log(doc.id + ' | ' + doc.data().titulo + ' | img: ' + (doc.data().imagen_principal ? 'SI' : 'NO'));
    }
  }

  console.log('\n=== FUENTES ===');
  for (const doc of snap.docs) {
    const t = (doc.data().titulo || '').toLowerCase();
    const isSource =
      (t.includes('esmalte') && t.includes('1/16') && t.includes('negro mate')) ||
      (t.includes('esmalte') && t.includes('1/4') && t.includes('amarillo') && !t.includes('anoloc')) ||
      (t.includes('esmalte') && t.includes('1/8') && t.includes('blanco mate'));
    if (isSource) {
      const img = doc.data().imagen_principal || 'NO';
      console.log(doc.id + ' | ' + doc.data().titulo + ' | img: ' + (typeof img === 'string' ? img.substring(0, 70) : img));
    }
  }

  // Mapping: destino titulo keyword -> source titulo keyword
  const groups = [
    { destKeywords: ['anoloc', '1/16'], srcKeywords: ['1/16', 'negro mate'] },
    { destKeywords: ['anoloc', '1/4'], srcKeywords: ['1/4', 'amarillo'] },
    { destKeywords: ['anoloc', '1/8'], srcKeywords: ['1/8', 'blanco mate'] }
  ];

  console.log('\n=== ASIGNANDO ===');
  let count = 0;

  for (const g of groups) {
    // Find source
    let srcImg = null;
    for (const doc of snap.docs) {
      const t = (doc.data().titulo || '').toLowerCase();
      if (t.includes('esmalte') && !t.includes('anoloc') &&
          g.srcKeywords.every(k => t.includes(k)) && doc.data().imagen_principal) {
        srcImg = doc.data().imagen_principal;
        console.log('  Fuente: ' + doc.id + ' | ' + doc.data().titulo);
        break;
      }
    }

    if (!srcImg) {
      console.log('  NO encontrada fuente para: ' + g.srcKeywords.join(', '));
      continue;
    }

    // Find and update destinations
    for (const doc of snap.docs) {
      const t = (doc.data().titulo || '').toLowerCase();
      if (t.includes('anoloc') && g.destKeywords.every(k => t.includes(k))) {
        await doc.ref.update({ imagen_principal: srcImg });
        console.log('  OK ' + doc.id + ' | ' + doc.data().titulo);
        count++;
      }
    }
  }

  console.log('\nActualizados: ' + count);
  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
