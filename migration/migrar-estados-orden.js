/**
 * Migra los estados de orden al esquema del 2026-10-26 (js/estados-orden.js):
 *   en_proceso → aprobada · terminada → cerrada · completada/completo → cerrada + completa
 *   parcial → cerrada + parcial. Cerrada lleva subestado (completa | parcial).
 * Subestado de una cerrada: el que ya tenga, el del nombre anterior, resultado_alistamiento
 * (completada → completa, parcial → parcial) o, si no hay, se deduce de los ítems.
 * También: historial[].estado con los nombres nuevos, terminada_por → cerrada_por,
 * fecha_terminada → fecha_cerrada, y se quita resultado_alistamiento (queda en subestado).
 *
 * Uso (desde migration/, con ADC):
 *   node migrar-estados-orden.js            # ensayo: solo cuenta, no escribe
 *   node migrar-estados-orden.js --aplicar  # respaldo en respaldos/ y luego escribe
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

admin.initializeApp({ projectId: 'enar-b2b' });
const db = admin.firestore();
const { FieldValue } = admin.firestore;
const APLICAR = process.argv.includes('--aplicar');

const VIGENTES = ['pendiente', 'aprobada', 'alistamiento', 'cerrada', 'cancelada'];
const LEGADO = {
  en_proceso: { estado: 'aprobada' },
  terminada: { estado: 'cerrada' },
  completada: { estado: 'cerrada', subestado: 'completa' },
  completo: { estado: 'cerrada', subestado: 'completa' },
  parcial: { estado: 'cerrada', subestado: 'parcial' },
};
const SUB = { completa: 'completa', completada: 'completa', completo: 'completa', parcial: 'parcial' };
const normal = (e) => LEGADO[e]?.estado || e;

// Igual que subestadoAlCerrar() de js/estados-orden.js
function subestadoPorItems(items = []) {
  const marcados = items.filter(i => ['comp', 'parcial', 'sinstock'].includes(i.estado_alistamiento));
  if (marcados.length === 0) return 'completa';
  return items.every(i => i.estado_alistamiento === 'comp') ? 'completa' : 'parcial';
}

function plan(o) {
  const cambios = {};
  const motivo = [];
  const estado = normal(o.estado);
  if (!VIGENTES.includes(estado)) return { error: `estado desconocido: ${o.estado}` };
  if (estado !== o.estado) { cambios.estado = estado; motivo.push(`${o.estado}→${estado}`); }

  if (estado === 'cerrada') {
    let sub = SUB[o.subestado], fuente = 'subestado';
    if (!sub && LEGADO[o.estado]?.subestado) { sub = LEGADO[o.estado].subestado; fuente = 'estado anterior'; }
    if (!sub && SUB[o.resultado_alistamiento]) { sub = SUB[o.resultado_alistamiento]; fuente = 'resultado_alistamiento'; }
    if (!sub) { sub = subestadoPorItems(o.items || o.productos || []); fuente = 'ítems'; }
    if (o.subestado !== sub) { cambios.subestado = sub; motivo.push(`subestado=${sub} (${fuente})`); }
  } else if (o.subestado != null) {
    cambios.subestado = null; motivo.push('subestado quitado (no cerrada)');
  }

  if ('resultado_alistamiento' in o) { cambios.resultado_alistamiento = FieldValue.delete(); motivo.push('sin resultado_alistamiento'); }
  if ('terminada_por' in o) { cambios.cerrada_por = o.terminada_por; cambios.terminada_por = FieldValue.delete(); }
  if ('fecha_terminada' in o) { cambios.fecha_cerrada = o.fecha_terminada; cambios.fecha_terminada = FieldValue.delete(); }

  const hist = o.historial || [];
  const nHist = hist.filter(h => h && LEGADO[h.estado]).length;
  if (nHist) {
    cambios.historial = hist.map(h => (h && LEGADO[h.estado]) ? { ...h, estado: LEGADO[h.estado].estado } : h);
    motivo.push(`historial ${nHist}`);
  }
  return { cambios, motivo, nHist, estadoFinal: estado, subFinal: cambios.subestado ?? o.subestado ?? null };
}

(async () => {
  const snap = await db.collection('ordenes').get();
  const conteo = {}, fuentes = {}, finales = {}, errores = [];
  let aCambiar = [], hist = 0;
  snap.forEach(d => {
    const o = d.data();
    const p = plan(o);
    if (p.error) { errores.push(`${d.id}: ${p.error}`); return; }
    const fin = p.estadoFinal + (p.subFinal ? `/${p.subFinal}` : '');
    finales[fin] = (finales[fin] || 0) + 1;
    if (Object.keys(p.cambios).length === 0) return;
    aCambiar.push({ id: d.id, ref: d.ref, original: o, cambios: p.cambios });
    hist += p.nHist;
    const k = `${o.estado} → ${fin}`;
    conteo[k] = (conteo[k] || 0) + 1;
    const f = p.motivo.find(m => m.startsWith('subestado='));
    if (f) { const fu = f.replace(/^subestado=\w+ /, ''); fuentes[`${p.subFinal} ${fu}`] = (fuentes[`${p.subFinal} ${fu}`] || 0) + 1; }
  });

  console.log(`Órdenes: ${snap.size} · a modificar: ${aCambiar.length} · entradas de historial renombradas: ${hist}`);
  console.log('\nCambio de estado (antes → después):'); console.table(conteo);
  console.log('Origen del subestado:'); console.table(fuentes);
  console.log('Resultado final por estado/subestado:'); console.table(finales);
  if (errores.length) { console.log('Errores (no se tocan):', errores); }

  if (!APLICAR) { console.log('\nEnsayo: no se escribió nada. Para aplicar: --aplicar'); return; }
  if (errores.length) { console.log('Hay errores: no se aplica.'); process.exit(1); }

  const dir = path.join(__dirname, 'respaldos');
  fs.mkdirSync(dir, { recursive: true });
  const archivo = path.join(dir, `ordenes-estados-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(archivo, JSON.stringify(aCambiar.map(x => ({ id: x.id, data: x.original })), null, 1));
  console.log(`\nRespaldo: ${archivo} (${aCambiar.length} órdenes, datos completos antes del cambio)`);

  for (let i = 0; i < aCambiar.length; i += 400) {
    const batch = db.batch();
    aCambiar.slice(i, i + 400).forEach(x => batch.update(x.ref, x.cambios));
    await batch.commit();
  }
  console.log(`Aplicado: ${aCambiar.length} órdenes actualizadas.`);
})().catch(e => { console.error(e); process.exit(1); });
