/**
 * ENAR - Asigna a cada producto activo su imagen de Firebase Storage
 *
 * Fuente: docs/revision-imagenes.csv (una fila por producto activo) +
 * imagenes-web/manifest.json. Por cada fila decide el archivo:
 *
 *   archivo_correcto = <ruta>     usa esa ruta (relativa a imagenes-originales/)
 *   archivo_correcto = ok         acepta archivo_propuesto (debe ser uno solo)
 *   archivo_correcto = ninguna    el producto queda sin imagen
 *   archivo_correcto vacío        exacta: usa archivo_propuesto
 *                                 suposición/ambiguo: PENDIENTE (solo se retira la URL
 *                                 de Drive, para que muestre el placeholder)
 *
 * Escribe en el producto:
 *   imagen_principal       URL WebP 1200 px (se borra si queda sin imagen)
 *   imagen_miniatura       URL WebP 300 px
 *   imagen_tipo            'exacta' (un solo envase del mismo producto y tamaño)
 *   imagen_drive_anterior  la URL de Drive que tenía, solo si aún no estaba guardada
 *   updated_at
 *
 * Regla: cada producto muestra un solo envase. Aborta si el CSV usa una imagen
 * de migration/imagenes-prohibidas.json (fotos de varios envases o etiquetas
 * planas) o si aparece el tipo 'familia', que ya no existe.
 *
 * Antes de escribir comprueba que cada archivo existe en Storage. Solo toca
 * productos activos que estén en el CSV.
 *
 * Uso (desde migration/):
 *   node asignar-imagenes-productos.js             (dry-run)
 *   node asignar-imagenes-productos.js --ejecutar  (aplica en lotes de 500)
 */
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const BUCKET = 'enar-b2b.firebasestorage.app';
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'enar-b2b', storageBucket: BUCKET });
const db = admin.firestore();
const bucket = admin.storage().bucket();
const { FieldValue } = admin.firestore;
const EJECUTAR = process.argv.includes('--ejecutar');
const RAIZ = path.join(__dirname, '..');

const url = ruta => `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(ruta)}?alt=media`;
const conVersionDe = (nueva, actual) => (actual || '').replace(/&v=[^&]*$/, '') === nueva ? actual : nueva;
const esDrive = u => typeof u === 'string' && /googleusercontent\.com|drive\.google\.com/.test(u);

// CSV con todos los campos entre comillas (formato de docs/*.csv)
function leerCSV(archivo) {
  const filas = [];
  let campo = '', fila = [], comillas = false;
  const txt = fs.readFileSync(archivo, 'utf8').replace(/^﻿/, '');
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (comillas) {
      if (c === '"' && txt[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && txt[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.some(v => v !== '')) filas.push(fila);
      fila = [];
    } else campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  const [cab, ...datos] = filas;
  return datos.map(f => Object.fromEntries(cab.map((k, i) => [k, (f[i] || '').trim()])));
}

(async () => {
  const filas = leerCSV(path.join(RAIZ, 'docs', 'revision-imagenes.csv'));
  const manifest = JSON.parse(fs.readFileSync(path.join(RAIZ, 'imagenes-web', 'manifest.json'), 'utf8'));

  const prohibidas = JSON.parse(fs.readFileSync(path.join(__dirname, 'imagenes-prohibidas.json'), 'utf8'));
  const PROHIBIDAS = new Set([...prohibidas.varios_envases, ...prohibidas.etiquetas_planas]);

  const plan = [], pendientes = [], errores = [];
  for (const f of filas) {
    const correcto = f.archivo_correcto;
    let archivo = null, decision;
    if (correcto.toLowerCase() === 'ninguna') decision = 'sin imagen';
    else if (correcto.toLowerCase() === 'ok') {
      if (f.archivo_propuesto.includes('|') || !f.archivo_propuesto) { errores.push(`${f.cod_interno}: "ok" sobre una propuesta que no es un solo archivo`); continue; }
      archivo = f.archivo_propuesto;
    } else if (correcto) archivo = correcto;
    else if (f.tipo === 'familia') { errores.push(`${f.cod_interno}: el tipo "familia" ya no existe (un solo envase por producto)`); continue; }
    else if (f.tipo === 'exacta') archivo = f.archivo_propuesto;
    else if (f.tipo === 'sin imagen') decision = 'sin imagen';
    else { pendientes.push(`${f.cod_interno} (${f.tipo})`); plan.push({ cod: f.cod_interno, archivo: null, tipo: 'pendiente' }); continue; }

    if (archivo) {
      if (!manifest[archivo]) { errores.push(`${f.cod_interno}: "${archivo}" no está en imagenes-web/manifest.json`); continue; }
      if (PROHIBIDAS.has(archivo)) { errores.push(`${f.cod_interno}: "${archivo}" muestra varios envases o es una etiqueta plana`); continue; }
      decision = 'exacta';
    }
    plan.push({ cod: f.cod_interno, archivo, tipo: decision });
  }

  if (errores.length) {
    console.error(`${errores.length} errores en el CSV, no se aplica nada:\n  ` + errores.join('\n  '));
    process.exit(1);
  }

  // Comprobar en Storage cada archivo usado
  const usados = [...new Set(plan.filter(p => p.archivo).flatMap(p => [manifest[p.archivo].imagen, manifest[p.archivo].miniatura]))];
  const [hayBucket] = await bucket.exists();
  if (!hayBucket) {
    console.error(`El bucket ${BUCKET} no existe: activa Storage y ejecuta subir-imagenes-storage.js primero.`);
    process.exit(1);
  }
  const faltan = [];
  for (const r of usados) { const [ok] = await bucket.file(r).exists(); if (!ok) faltan.push(r); }
  if (faltan.length) {
    console.error(`${faltan.length} archivos no están en Storage (ejecuta subir-imagenes-storage.js --ejecutar):\n  ` + faltan.slice(0, 10).join('\n  '));
    process.exit(1);
  }

  // Preparar cambios contra el estado actual de cada producto
  const cambios = [];
  const noEncontrados = [], inactivos = [];
  for (const p of plan) {
    const ref = db.collection('productos').doc(p.cod);
    const snap = await ref.get();
    if (!snap.exists) { noEncontrados.push(p.cod); continue; }
    const d = snap.data();
    if (d.activo !== true) { inactivos.push(p.cod); continue; }
    if (p.tipo === 'pendiente') {
      // Sin decisión aún: solo retirar la URL de Drive rota; nunca tocar una imagen de Storage
      if (!esDrive(d.imagen_principal)) continue;
      const u = { updated_at: new Date().toISOString(), imagen_principal: FieldValue.delete() };
      if (!d.imagen_drive_anterior) u.imagen_drive_anterior = d.imagen_principal;
      cambios.push({ ref, p, u });
      continue;
    }
    const u = { updated_at: new Date().toISOString() };
    if (esDrive(d.imagen_principal) && !d.imagen_drive_anterior) u.imagen_drive_anterior = d.imagen_principal;
    if (p.archivo) {
      // Conserva el &v= de versionar-urls-imagenes.js si el archivo no cambió
      u.imagen_principal = conVersionDe(url(manifest[p.archivo].imagen), d.imagen_principal);
      u.imagen_miniatura = conVersionDe(url(manifest[p.archivo].miniatura), d.imagen_miniatura);
      u.imagen_tipo = p.tipo;
    } else {
      u.imagen_principal = FieldValue.delete();
      u.imagen_miniatura = FieldValue.delete();
      u.imagen_tipo = FieldValue.delete();
    }
    const igual = p.archivo
      ? d.imagen_principal === u.imagen_principal && d.imagen_miniatura === u.imagen_miniatura && d.imagen_tipo === u.imagen_tipo && !u.imagen_drive_anterior
      : !d.imagen_principal && !d.imagen_miniatura && !d.imagen_tipo;
    if (!igual) cambios.push({ ref, p, u });
  }

  const cuenta = t => plan.filter(p => p.tipo === t).length;
  console.log(`Modo: ${EJECUTAR ? 'EJECUTAR' : 'DRY-RUN'}`);
  console.log(`CSV: ${filas.length} filas · exacta ${cuenta('exacta')} · sin imagen ${cuenta('sin imagen')} · pendientes de revisión ${pendientes.length} (se les retira la URL de Drive)`);
  console.log(`Productos con cambios: ${cambios.length} (pendientes: ${cambios.filter(c => c.p.tipo === 'pendiente').length}) · ya al día: ${plan.length - cambios.length - noEncontrados.length - inactivos.length}`);
  if (noEncontrados.length) console.log(`No existen en Firestore: ${noEncontrados.join(', ')}`);
  if (inactivos.length) console.log(`Ya no están activos (no se tocan): ${inactivos.join(', ')}`);
  if (pendientes.length) console.log(`\nPendientes (rellena archivo_correcto en el CSV):\n  ${pendientes.join(', ')}`);
  console.log('\nMuestra:');
  cambios.slice(0, 5).forEach(c => console.log(`  ${c.p.cod.padEnd(10)} ${c.p.tipo.padEnd(10)} ${c.p.archivo || '(sin imagen)'}`));

  if (!EJECUTAR) { console.log('\nDRY-RUN: no se escribió nada.'); process.exit(0); }

  for (let i = 0; i < cambios.length; i += 500) {
    const batch = db.batch();
    cambios.slice(i, i + 500).forEach(c => batch.update(c.ref, c.u));
    await batch.commit();
    console.log(`  lote confirmado: ${Math.min(i + 500, cambios.length)}/${cambios.length}`);
  }
  console.log(`\n✅ ${cambios.length} productos actualizados.`);
  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
