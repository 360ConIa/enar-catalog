/**
 * ENAR - Fuerza a los navegadores a pedir de nuevo imágenes reemplazadas en Storage
 *
 * Las imágenes se sirven con Cache-Control de 7 días y URL sin token
 * (…/o/<ruta>?alt=media). Si se reemplaza un archivo en la misma ruta, quien ya lo vio
 * sigue viendo el anterior. Este script agrega &v=<VERSION> a imagen_principal e
 * imagen_miniatura de los productos que usan las imágenes de migration/imagenes-encuadre.json
 * (rutas de imagenes-web/manifest.json). Idempotente.
 *
 * Uso (desde migration/, con ADC):
 *   node versionar-urls-imagenes.js 20261027              (dry-run)
 *   node versionar-urls-imagenes.js 20261027 --ejecutar   (escribe)
 */
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'enar-b2b' });
const db = admin.firestore();
const VERSION = process.argv[2];
const EJECUTAR = process.argv.includes('--ejecutar');
if (!/^\d{8}[a-z]?$/.test(VERSION || '')) { console.error('Uso: node versionar-urls-imagenes.js AAAAMMDD [--ejecutar]'); process.exit(1); }

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'imagenes-web', 'manifest.json'), 'utf8'));
const lista = JSON.parse(fs.readFileSync(path.join(__dirname, 'imagenes-encuadre.json'), 'utf8')).imagenes;
const rutas = new Set(lista.flatMap(rel => manifest[rel] ? [manifest[rel].imagen, manifest[rel].miniatura] : []));
const conVersion = (url) => {
  const ruta = decodeURIComponent((url.split('/o/')[1] || '').split('?')[0]);
  if (!rutas.has(ruta)) return null;
  const base = url.replace(/&v=[^&]*/, '');
  return `${base}&v=${VERSION}`;
};

(async () => {
  const snap = await db.collection('productos').get();
  const cambios = [];
  snap.forEach(d => {
    const p = d.data(); const upd = {};
    for (const campo of ['imagen_principal', 'imagen_miniatura']) {
      const nueva = p[campo] && conVersion(p[campo]);
      if (nueva && nueva !== p[campo]) upd[campo] = nueva;
    }
    if (Object.keys(upd).length) cambios.push({ ref: d.ref, id: d.id, titulo: p.titulo, upd });
  });
  console.log(`Modo: ${EJECUTAR ? 'EJECUTAR' : 'DRY-RUN'} · imágenes: ${rutas.size / 2} · productos a actualizar: ${cambios.length}`);
  cambios.forEach(c => console.log(` ${c.id.padEnd(9)} ${String(c.titulo).slice(0, 48).padEnd(48)} ${Object.keys(c.upd).join(', ')}`));
  if (EJECUTAR) {
    const batch = db.batch();
    cambios.forEach(c => batch.update(c.ref, c.upd));
    await batch.commit();
    console.log(`Actualizados: ${cambios.length}`);
  } else console.log('\nDRY-RUN: no se escribió nada.');
  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
