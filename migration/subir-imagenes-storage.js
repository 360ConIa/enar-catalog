/**
 * ENAR - Sube las imágenes WebP de imagenes-web/ a Firebase Storage
 *
 * Lee imagenes-web/manifest.json (generado por convertir-imagenes-webp.py) y
 * sube cada imagen (1200 px) y su miniatura (300 px) a las rutas productos/...
 * del bucket. Idempotente: salta los archivos que ya están con el mismo MD5.
 *
 * Las URL públicas son permanentes y dependen de storage.rules (lectura pública
 * en productos/), no de tokens:
 *   https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<ruta>?alt=media
 *
 * Uso (desde migration/):
 *   node subir-imagenes-storage.js             (dry-run)
 *   node subir-imagenes-storage.js --ejecutar  (sube)
 */
const admin = require('firebase-admin');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const BUCKET = 'enar-b2b.firebasestorage.app';
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'enar-b2b', storageBucket: BUCKET });
const bucket = admin.storage().bucket();
const EJECUTAR = process.argv.includes('--ejecutar');
const WEB = path.join(__dirname, '..', 'imagenes-web');

const md5 = f => crypto.createHash('md5').update(fs.readFileSync(f)).digest('base64');

(async () => {
  const [existe] = await bucket.exists();
  if (!existe) {
    console.error(`El bucket ${BUCKET} no existe: activa Storage en la consola de Firebase primero.`);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(WEB, 'manifest.json'), 'utf8'));
  const rutas = Object.values(manifest).flatMap(m => [m.imagen, m.miniatura]);
  console.log(`Modo: ${EJECUTAR ? 'EJECUTAR' : 'DRY-RUN'} · ${rutas.length} archivos (${rutas.length / 2} imágenes + miniaturas)\n`);

  let subidos = 0, iguales = 0, bytes = 0;
  for (const ruta of rutas) {
    const local = path.join(WEB, ruta);
    const archivo = bucket.file(ruta);
    const [ya] = await archivo.exists();
    if (ya) {
      const [meta] = await archivo.getMetadata();
      if (meta.md5Hash === md5(local)) { iguales++; continue; }
    }
    bytes += fs.statSync(local).size;
    if (EJECUTAR) {
      await bucket.upload(local, {
        destination: ruta,
        metadata: { contentType: 'image/webp', cacheControl: 'public, max-age=604800' },
      });
    }
    subidos++;
  }
  console.log(`${EJECUTAR ? 'Subidos' : 'Por subir'}: ${subidos} (${(bytes / 1048576).toFixed(1)} MB) · ya iguales en Storage: ${iguales}`);
  if (!EJECUTAR) console.log('\nDRY-RUN: no se subió nada.');
  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
