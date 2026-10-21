/**
 * ENAR - Retira las URL de imagen de Google Drive de los productos NO activos
 *
 * Las URL de Drive dejaron de responder al cancelar Google Workspace. Los
 * productos activos ya se migraron a Storage (asignar-imagenes-productos.js);
 * este script hace lo mismo que se hizo con los activos sin imagen: mueve la URL
 * de Drive de imagen_principal a imagen_drive_anterior (si aún no estaba) y
 * borra imagen_principal. Sella updated_at.
 *
 * Solo toca productos con activo !== true cuya imagen_principal sea de Drive.
 * Nunca toca productos activos ni imágenes de Storage. No toca ficha_tecnica_url.
 *
 * Uso (desde migration/):
 *   node limpiar-drive-inactivos.js             (dry-run)
 *   node limpiar-drive-inactivos.js --ejecutar  (aplica en lotes de 500)
 */
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'enar-b2b' });
const db = admin.firestore();
const { FieldValue } = admin.firestore;
const EJECUTAR = process.argv.includes('--ejecutar');

const esDrive = u => typeof u === 'string' && /googleusercontent\.com|drive\.google\.com/.test(u);

(async () => {
  const snap = await db.collection('productos').get();
  const cambios = [];
  let activos = 0, inactivos = 0, yaGuardada = 0;
  snap.forEach(d => {
    const p = d.data();
    if (p.activo === true) { activos++; return; }
    inactivos++;
    if (!esDrive(p.imagen_principal)) return;
    const u = { imagen_principal: FieldValue.delete(), updated_at: new Date().toISOString() };
    if (p.imagen_drive_anterior) yaGuardada++;
    else u.imagen_drive_anterior = p.imagen_principal;
    cambios.push({ ref: d.ref, cod: String(p.cod_interno || d.id), u });
  });

  console.log(`Modo: ${EJECUTAR ? 'EJECUTAR' : 'DRY-RUN'}`);
  console.log(`Productos: ${snap.size} · activos ${activos} (no se tocan) · no activos ${inactivos}`);
  console.log(`No activos con imagen de Drive: ${cambios.length} (ya tenían imagen_drive_anterior: ${yaGuardada})`);
  console.log(`Muestra: ${cambios.slice(0, 8).map(c => c.cod).join(', ')}`);

  if (!EJECUTAR) { console.log('\nDRY-RUN: no se escribió nada.'); process.exit(0); }

  for (let i = 0; i < cambios.length; i += 500) {
    const batch = db.batch();
    cambios.slice(i, i + 500).forEach(c => batch.update(c.ref, c.u));
    await batch.commit();
    console.log(`  lote confirmado: ${Math.min(i + 500, cambios.length)}/${cambios.length}`);
  }
  console.log(`\n✅ ${cambios.length} productos no activos sin URL de Drive en imagen_principal.`);
  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
