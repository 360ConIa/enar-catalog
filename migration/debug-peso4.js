const admin = require('firebase-admin');

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'enar-b2b' });
const db = admin.firestore();

async function main() {
  const snap = await db.collection('productos').where('activo', '==', true).get();

  let pesoCero = [];
  let ordenVacio = [];
  let ambos = [];

  snap.forEach(d => {
    const p = d.data();
    const peso = p.peso || 0;
    const orden = p.Orden_Cargue || '';

    const sinPeso = peso === 0;
    const sinOrden = orden === '' || orden === 0;

    if (sinPeso && sinOrden) {
      ambos.push({ id: d.id, titulo: p.titulo || '' });
    } else if (sinPeso) {
      pesoCero.push({ id: d.id, titulo: p.titulo || '', orden });
    } else if (sinOrden) {
      ordenVacio.push({ id: d.id, titulo: p.titulo || '', peso });
    }
  });

  console.log(`\nProductos activos: ${snap.size}\n`);

  console.log(`❌ Sin peso Y sin orden de cargue (${ambos.length}):`);
  ambos.forEach(p => console.log(`   ${p.id.padEnd(12)} ${p.titulo}`));

  console.log(`\n⚠️  Peso = 0 (pero SÍ tienen orden) (${pesoCero.length}):`);
  pesoCero.forEach(p => console.log(`   ${p.id.padEnd(12)} ${p.titulo.padEnd(50)} Orden: ${p.orden}`));

  console.log(`\n⚠️  Orden vacío (pero SÍ tienen peso) (${ordenVacio.length}):`);
  ordenVacio.forEach(p => console.log(`   ${p.id.padEnd(12)} ${p.titulo.padEnd(50)} Peso: ${p.peso}`));

  console.log(`\n📊 Resumen:`);
  console.log(`   Activos totales:          ${snap.size}`);
  console.log(`   Completos (peso + orden): ${snap.size - ambos.length - pesoCero.length - ordenVacio.length}`);
  console.log(`   Sin peso:                 ${ambos.length + pesoCero.length}`);
  console.log(`   Sin orden de cargue:      ${ambos.length + ordenVacio.length}`);
  console.log(`   Sin ambos:                ${ambos.length}`);

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
