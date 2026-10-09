/**
 * Debug: Verificar peso de productos en órdenes específicas
 */
const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'enar-b2b'
});
const db = admin.firestore();

async function main() {
  const ordenesIds = [
    'ORD-260311-78162', // peso 0
    'ORD-260309-41864', // peso 0
    'ORD-260311-52606', // peso errado
    'ORD-260310-08536'  // peso errado
  ];

  for (const numOrden of ordenesIds) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`ORDEN: ${numOrden}`);
    console.log('='.repeat(60));

    const snap = await db.collection('ordenes')
      .where('numero_orden', '==', numOrden)
      .limit(1)
      .get();

    if (snap.empty) {
      console.log('  ❌ No encontrada');
      continue;
    }

    const orden = snap.docs[0].data();
    const items = orden.items || orden.productos || [];

    console.log(`  Items: ${items.length}`);

    for (const item of items) {
      const cod = item.cod_interno || item.sku || '?';
      console.log(`\n  📦 ${cod} — ${item.titulo || item.nombre}`);
      console.log(`     cantidad: ${item.cantidad}`);
      console.log(`     peso_kg en item: ${JSON.stringify(item.peso_kg)}`);

      // Buscar producto en Firestore
      const prodDoc = await db.collection('productos').doc(cod).get();
      if (prodDoc.exists) {
        const p = prodDoc.data();
        console.log(`     Producto en Firestore:`);
        console.log(`       Peso_Kg:    ${JSON.stringify(p.Peso_Kg)}`);
        console.log(`       peso_kg:    ${JSON.stringify(p.peso_kg)}`);
        console.log(`       peso:       ${JSON.stringify(p.peso)}`);
        console.log(`       Peso:       ${JSON.stringify(p.Peso)}`);
        console.log(`       activo:     ${JSON.stringify(p.activo)}`);
        console.log(`       titulo:     ${p.titulo}`);
        // Show all fields containing "peso" (case insensitive)
        const pesoFields = Object.keys(p).filter(k => k.toLowerCase().includes('peso'));
        if (pesoFields.length > 0) {
          console.log(`       Campos con "peso": ${JSON.stringify(pesoFields.map(k => `${k}=${p[k]}`))}`);
        } else {
          console.log(`       ⚠️  NO hay campos con "peso" en este producto`);
        }
      } else {
        console.log(`     ⚠️  Producto ${cod} NO EXISTE en Firestore`);
      }
    }

    // Calcular peso total como lo hace despachos
    const pesoTotal = items.reduce((sum, i) => sum + ((i.peso_kg || 0) * (i.cantidad || 0)), 0);
    console.log(`\n  🏋️ Peso total calculado (items): ${pesoTotal} kg`);
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
