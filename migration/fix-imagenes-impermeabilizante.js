/**
 * Fix: Asignar imágenes a productos Impermeabilizante
 *
 * 1. Imagen de IG917 → 7 Impermeabilizante Cuñete (IC100, IC300, IC500, IC400, IC201, IC917, IC600)
 * 2. Imagen de IC300 → 7 Impermeabilizante Galón (buscar por título)
 */
const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'enar-b2b'
});

const db = admin.firestore();

async function fix() {
  // 1. Obtener imagen de IG917
  const ig917Doc = await db.collection('productos').doc('IG917').get();
  if (!ig917Doc.exists) {
    console.error('❌ No se encontró producto IG917');
    process.exit(1);
  }
  const imgCuñete = ig917Doc.data().imagen_principal;
  console.log(`📷 Imagen IG917: ${imgCuñete ? imgCuñete.substring(0, 80) + '...' : 'NO TIENE'}`);

  // 2. Obtener imagen de IC300
  const ic300Doc = await db.collection('productos').doc('IC300').get();
  if (!ic300Doc.exists) {
    console.error('❌ No se encontró producto IC300');
    process.exit(1);
  }
  const imgGalon = ic300Doc.data().imagen_principal;
  console.log(`📷 Imagen IC300: ${imgGalon ? imgGalon.substring(0, 80) + '...' : 'NO TIENE'}`);

  // --- Tarea 1: Imagen IG917 → 7 Impermeabilizante Cuñete ---
  const idsCuñete = ['IC100', 'IC300', 'IC500', 'IC400', 'IC201', 'IC917', 'IC600'];
  console.log('\n--- Asignando imagen IG917 a Impermeabilizante Cuñete ---');
  for (const id of idsCuñete) {
    const doc = await db.collection('productos').doc(id).get();
    if (doc.exists) {
      await doc.ref.update({ imagen_principal: imgCuñete });
      console.log(`  ✅ ${id} | ${doc.data().titulo}`);
    } else {
      console.log(`  ⚠️  ${id} no encontrado`);
    }
  }

  // --- Tarea 2: Imagen IC300 → 7 Impermeabilizante Galón ---
  console.log('\n--- Asignando imagen IC300 a Impermeabilizante Galón ---');
  const snap = await db.collection('productos')
    .where('titulo', '>=', 'Impermeabilizante Galón')
    .where('titulo', '<=', 'Impermeabilizante Galón\uf8ff')
    .get();

  console.log(`  Encontrados: ${snap.size} productos Impermeabilizante Galón`);
  let count = 0;
  for (const doc of snap.docs) {
    await doc.ref.update({ imagen_principal: imgGalon });
    console.log(`  ✅ ${doc.id} | ${doc.data().titulo}`);
    count++;
  }

  console.log(`\n✅ Total: ${idsCuñete.length} Cuñete + ${count} Galón actualizados`);
  process.exit(0);
}

fix().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
