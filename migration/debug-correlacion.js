const admin = require('firebase-admin');

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'enar-b2b' });
const db = admin.firestore();

async function main() {
  const snap = await db.collection('productos').where('activo', '==', true).get();

  // Indexar todos los productos activos con peso y orden
  const productos = [];
  snap.forEach(d => {
    const p = d.data();
    productos.push({ id: d.id, titulo: p.titulo || '', peso: p.peso || 0, orden: p.Orden_Cargue || '' });
  });

  // Los 5 sin orden de cargue
  const sinOrden = [
    { id: 'P12', peso: 13 },
    { id: 'P13', peso: 11 },
    { id: 'P15', peso: 12 },
    { id: 'R-AG5', peso: 16.5 },
    { id: 'VT300', peso: 180 }
  ];

  // Productos CON orden, agrupados por orden
  const conOrden = productos.filter(p => p.orden !== '' && p.orden !== 0);
  const porOrden = {};
  conOrden.forEach(p => {
    if (!porOrden[p.orden]) porOrden[p.orden] = [];
    porOrden[p.orden].push(p);
  });

  // Para cada grupo de orden, calcular rango de peso
  console.log('\n📊 Grupos de Orden de Cargue y sus rangos de peso:\n');
  console.log('Orden'.padEnd(8) + 'Cant'.padEnd(6) + 'Peso Mín'.padEnd(12) + 'Peso Máx'.padEnd(12) + 'Peso Prom'.padEnd(12) + 'Ejemplo');
  console.log('-'.repeat(90));

  const gruposOrdenados = Object.keys(porOrden).sort();
  for (const orden of gruposOrdenados) {
    const grupo = porOrden[orden];
    const pesos = grupo.map(p => p.peso).filter(p => p > 0);
    if (pesos.length === 0) continue;
    const min = Math.min(...pesos);
    const max = Math.max(...pesos);
    const prom = pesos.reduce((a, b) => a + b, 0) / pesos.length;
    console.log(
      orden.padEnd(8) +
      String(grupo.length).padEnd(6) +
      String(min).padEnd(12) +
      String(max).padEnd(12) +
      String(Math.round(prom * 10) / 10).padEnd(12) +
      grupo[0].titulo.substring(0, 40)
    );
  }

  // Para cada producto sin orden, encontrar los 5 más similares en peso
  for (const target of sinOrden) {
    const info = productos.find(p => p.id === target.id);
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🔍 ${target.id} — ${info.titulo} — Peso: ${target.peso} kg`);
    console.log('='.repeat(70));

    const similares = conOrden
      .filter(p => p.peso > 0)
      .map(p => ({ ...p, diff: Math.abs(p.peso - target.peso) }))
      .sort((a, b) => a.diff - b.diff)
      .slice(0, 8);

    console.log('\nProductos más similares en peso:');
    console.log('ID'.padEnd(12) + 'Peso'.padEnd(10) + 'Diff'.padEnd(10) + 'Orden'.padEnd(8) + 'Titulo');
    console.log('-'.repeat(70));
    similares.forEach(p => {
      console.log(
        p.id.padEnd(12) +
        String(p.peso).padEnd(10) +
        String(Math.round(p.diff * 10) / 10).padEnd(10) +
        p.orden.padEnd(8) +
        p.titulo.substring(0, 40)
      );
    });

    // Sugerencia: orden más frecuente entre los similares
    const frecuencia = {};
    similares.forEach(p => { frecuencia[p.orden] = (frecuencia[p.orden] || 0) + 1; });
    const sugerido = Object.entries(frecuencia).sort((a, b) => b[1] - a[1])[0];
    console.log(`\n   ➡️  Sugerencia: Orden_Cargue = "${sugerido[0]}" (${sugerido[1]}/8 similares)`);
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
