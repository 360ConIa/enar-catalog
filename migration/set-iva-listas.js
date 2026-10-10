/**
 * ENAR - Fija el campo `iva` de las 4 listas de configuracion/listas_precios
 *
 * Transaccional. Solo toca `iva`: aborta si cualquier otro campo cambiaría,
 * si no hay exactamente 4 listas, o si los ids no son los esperados.
 * Imprime antes y después.
 *
 * Uso:
 *   node set-iva-listas.js 19    (aplicar IVA 19%)
 *   node set-iva-listas.js 0     (REVERSA: volver a precios sin IVA)
 *
 * Tras cambiarlo hay que recalcular: node recalcular-precios-listas.js --ejecutar
 * Ver docs/plan-iva-19.md, pasos 5 y 6.
 */
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'enar-b2b' });
const db = admin.firestore();
const IVA_NUEVO = Number(process.argv[2]);
const ESPERADAS = ['mayorista','negocio','persona_natural','nuevos'];
if (!Number.isFinite(IVA_NUEVO)) { console.error('Uso: node set-iva-listas.js <0|19>'); process.exit(1); }

const ref = db.collection('configuracion').doc('listas_precios');
const dump = (et, listas) => {
  console.log(`\n  ─── ${et} ───`);
  listas.forEach(l => console.log(
    `    cod=${String(l.codigo_erp).padEnd(2)} ${String(l.id).padEnd(17)} inc=${String(l.incremento).padEnd(3)} ` +
    `inc_exc=${String(l.incremento_excepcion).padEnd(3)} iva=${String(l.iva).padEnd(3)} ` +
    `campo=${String(l.campo_firestore).padEnd(24)} activa=${l.activa} sistema=${l.sistema} ` +
    `skus=${JSON.stringify(l.skus_excepcion||[])} claves=${Object.keys(l).length}`
  ));
};

(async () => {
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('configuracion/listas_precios no existe');
    const listas = snap.data().listas || [];
    if (listas.length !== 4) throw new Error(`se esperaban 4 listas, hay ${listas.length}`);
    const ids = listas.map(l => l.id).sort();
    if (JSON.stringify(ids) !== JSON.stringify([...ESPERADAS].sort()))
      throw new Error(`ids inesperados: ${ids.join(', ')}`);

    dump('ANTES', listas);

    // Solo se toca `iva`. Todo lo demás se preserva con spread.
    const nuevas = listas.map(l => ({ ...l, iva: IVA_NUEVO }));

    // Verificar que no cambió nada más
    nuevas.forEach((n, i) => {
      const a = listas[i];
      for (const k of new Set([...Object.keys(a), ...Object.keys(n)])) {
        if (k === 'iva') continue;
        if (JSON.stringify(a[k]) !== JSON.stringify(n[k]))
          throw new Error(`${n.id}: el campo ${k} cambió, abortando`);
      }
    });

    tx.update(ref, { listas: nuevas });
    dump(`DESPUÉS (iva: ${IVA_NUEVO})`, nuevas);
  });
  const fin = await ref.get();
  console.log('\n  ✅ Escrito. Relectura de confirmación:');
  dump('EN FIRESTORE', fin.data().listas || []);
  process.exit(0);
})().catch(e => { console.error('\n❌ ' + e.message + '\n   La transacción se revirtió.'); process.exit(1); });
