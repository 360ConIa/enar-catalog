/**
 * ENAR - Recalcula los 4 precios por lista en todos los productos
 *
 * Usa la MISMA fórmula del panel admin (calcularDerivadosProducto,
 * public/admin.html:3757-3771), leyendo incremento, iva y skus_excepcion de
 * configuracion/listas_precios. No tiene factores propios: la configuración es
 * la única fuente.
 *
 *   precio_<lista> = round(precio_lista × (1 + incremento/100) × (1 + iva/100))
 *
 * Los SKU cuyo cod_interno termina en un sufijo de skus_excepcion usan
 * incremento_excepcion. Sella updated_at. Salta productos sin precio_lista.
 *
 * Uso:
 *   node recalcular-precios-listas.js             (dry-run)
 *   node recalcular-precios-listas.js --ejecutar  (aplica en lotes de 500)
 *
 * Ver docs/plan-iva-19.md, pasos 5 y 6.
 */
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'enar-b2b' });
const db = admin.firestore();
const EJECUTAR = process.argv.includes('--ejecutar');
const TESTIGOS = ['-B-G','-C-G','--KQ','UT'];

(async () => {
  const cfg = await db.collection('configuracion').doc('listas_precios').get();
  const listas = (cfg.data().listas || []).filter(l => l.activa !== false && l.campo_firestore);
  console.log(`Listas a aplicar: ${listas.map(l => `${l.campo_firestore}(+${l.incremento}%, iva ${l.iva}%)`).join(' · ')}`);
  console.log(`Modo: ${EJECUTAR ? 'EJECUTAR' : 'DRY-RUN'}\n`);

  const snap = await db.collection('productos').get();
  const cambios = [];
  let sinBase = 0, yaOk = 0, act = 0, inact = 0;
  const testigos = {};

  snap.forEach(d => {
    const p = d.data();
    const cod = String(p.cod_interno || d.id);
    if (!p.precio_lista || p.precio_lista <= 0) { sinBase++; return; }

    const updates = {};
    const antes = {}, despues = {};
    for (const l of listas) {
      // MISMA fórmula del panel: calcularDerivadosProducto()
      const skus = l.skus_excepcion || [];
      const esExcep = skus.length > 0 && skus.some(s => cod.endsWith(s));
      const incremento = esExcep ? (l.incremento_excepcion || l.incremento || 0) : (l.incremento || 0);
      const iva = 1 + (l.iva || 0) / 100;
      const nuevo = Math.round(p.precio_lista * (1 + incremento / 100) * iva);
      antes[l.campo_firestore] = p[l.campo_firestore] ?? null;
      despues[l.campo_firestore] = nuevo;
      if (Math.round(p[l.campo_firestore] ?? NaN) !== nuevo) updates[l.campo_firestore] = nuevo;
    }
    if (TESTIGOS.includes(cod)) testigos[cod] = { precio_lista: p.precio_lista, antes, despues, activo: p.activo };
    if (Object.keys(updates).length === 0) { yaOk++; return; }
    updates.updated_at = new Date().toISOString();
    cambios.push({ ref: d.ref, cod, activo: p.activo, updates });
    if (p.activo === true) act++; else inact++;
  });

  console.log(`Productos: ${snap.size} · con cambios: ${cambios.length} (activos ${act}, no activos ${inact}) · ya correctos: ${yaOk} · sin precio_lista: ${sinBase}`);

  console.log('\n=== Testigos ===');
  for (const cod of TESTIGOS) {
    const t = testigos[cod]; if (!t) { console.log(`  ${cod}: no encontrado`); continue; }
    console.log(`\n  ${cod}  (activo=${t.activo})  precio_lista=${t.precio_lista.toLocaleString('es-CO')}`);
    for (const k of Object.keys(t.despues)) {
      const a = t.antes[k], b = t.despues[k];
      const pct = (a != null && a !== 0) ? ` (${((b-a)/a*100) >= 0 ? '+' : ''}${((b-a)/a*100).toFixed(2)}%)` : ' (nuevo)';
      console.log(`    ${k.padEnd(24)} ${String(a ?? 'AUSENTE').padStart(12)}  →  ${String(b).padStart(12)}${pct}`);
    }
  }

  if (!EJECUTAR) { console.log('\nDRY-RUN: no se escribió nada.'); process.exit(0); }

  const LOTE = 500;
  let hechos = 0;
  for (let i = 0; i < cambios.length; i += LOTE) {
    const batch = db.batch();
    const chunk = cambios.slice(i, i + LOTE);
    chunk.forEach(c => batch.update(c.ref, c.updates));
    await batch.commit();
    hechos += chunk.length;
    console.log(`  lote confirmado: ${hechos}/${cambios.length}`);
  }
  console.log(`\n✅ ${hechos} productos actualizados.`);
  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
