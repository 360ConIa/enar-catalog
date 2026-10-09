const admin = require('firebase-admin');

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'enar-b2b' });
const db = admin.firestore();

async function main() {
  const asignaciones = {
    'P12': 'BA',
    'P13': 'CF',
    'P15': 'BA',
    'R-AG5': 'CG',
    'VT300': 'AA'
  };

  const batch = db.batch();

  for (const [id, orden] of Object.entries(asignaciones)) {
    const ref = db.collection('productos').doc(id);
    batch.update(ref, {
      Orden_Cargue: orden,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`   ✅ ${id} → Orden_Cargue = "${orden}"`);
  }

  await batch.commit();
  console.log(`\n✅ ${Object.keys(asignaciones).length} productos actualizados.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
