/**
 * ENAR - Fix productos faltantes del catálogo ID_Producto_final
 * 1. Reactiva 7 productos inactivos que están en el Sheet
 * 2. Crea 2 productos que existen en hoja Productos pero no en Firestore
 * 3. Crea 8 productos que solo existen en ID_Producto_final (datos mínimos)
 *
 * Uso:
 *   node fix-missing-productos.js --test       (dry-run)
 *   node fix-missing-productos.js --ejecutar   (aplica cambios)
 */

const admin = require('firebase-admin');
const { google } = require('googleapis');
const chalk = require('chalk');

const MODE_TEST = process.argv.includes('--test');
const MODE_EJECUTAR = process.argv.includes('--ejecutar');

if (!MODE_TEST && !MODE_EJECUTAR) {
  console.log(chalk.red('\n❌ Debes especificar: --test o --ejecutar\n'));
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'enar-b2b' });
const db = admin.firestore();

const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
const sheets = google.sheets({ version: 'v4', auth });

const SPREADSHEET_ID = '1a-cy3_OSegXeDwEmud7V3SRDlht4S8OAOblg74bPhMw';

async function main() {
  console.log(chalk.blue.bold('\n🔧 ENAR - Fix productos faltantes\n'));
  console.log(MODE_TEST ? chalk.yellow('⚠️  MODO TEST\n') : chalk.red.bold('🔴 MODO EJECUTAR\n'));

  // 1. Leer ID_Producto_final (A:D)
  const resFinal = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'ID_Producto_final!A2:D'
  });
  const finalRows = resFinal.data.values || [];
  const sheetData = new Map();
  for (const row of finalRows) {
    const id = (row[0] || '').trim();
    if (!id) continue;
    const pListaRaw = (row[3] || '0').replace(/[$\s]/g, '').split(',')[0].replace(/\./g, '');
    sheetData.set(id, {
      presentacion: (row[1] || '').trim(),
      embalaje: (row[2] || '').trim(),
      precio_lista: parseInt(pListaRaw, 10) || 0
    });
  }
  console.log(chalk.green('✅ ' + sheetData.size + ' productos en ID_Producto_final'));

  // 2. Leer hoja Productos para datos completos de los que faltan
  const resProd = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Productos!A4:W2000'
  });
  const prodRows = resProd.data.values || [];
  const prodData = new Map();
  for (const row of prodRows) {
    const id = (row[0] || '').trim();
    if (!id) continue;
    const precioRealRaw = (row[9] || '0').replace(/[$\s]/g, '').split(',')[0].replace(/\./g, '');
    prodData.set(id, {
      titulo: (row[1] || '').trim(),
      categoria: (row[2] || '').trim(),
      p_real: parseInt(precioRealRaw, 10) || 0,
      cantidad: parseInt(row[10] || '0', 10) || 0,
      ean: (row[19] || '').trim(),
      imagen_principal: (row[21] || '').trim()
    });
  }
  console.log(chalk.green('✅ ' + prodData.size + ' productos en hoja Productos'));

  // 3. Leer Firestore
  const snap = await db.collection('productos').get();
  const firestoreIds = new Set();
  const inactivos = new Map();
  snap.forEach(doc => {
    firestoreIds.add(doc.id);
    if (doc.data().activo === false) inactivos.set(doc.id, doc.data());
  });
  console.log(chalk.green('✅ ' + snap.size + ' productos en Firestore\n'));

  const batch = db.batch();
  let ops = 0;

  // --- A: Reactivar inactivos ---
  const reactivar = [];
  for (const [id] of sheetData) {
    if (inactivos.has(id)) {
      reactivar.push({ id, titulo: inactivos.get(id).titulo });
      const sd = sheetData.get(id);
      if (!MODE_TEST) {
        batch.update(db.collection('productos').doc(id), {
          activo: true,
          presentacion: sd.presentacion,
          embalaje: sd.embalaje,
          precio_lista: sd.precio_lista
        });
        ops++;
      }
    }
  }

  console.log(chalk.cyan.bold('📗 Reactivar (' + reactivar.length + '):'));
  reactivar.forEach(p => console.log(chalk.cyan('   ' + p.id + ' — ' + p.titulo)));
  console.log('');

  // --- B: Crear nuevos (con datos de hoja Productos si disponible) ---
  const crear = [];
  for (const [id, sd] of sheetData) {
    if (!firestoreIds.has(id)) {
      const pd = prodData.get(id);
      const doc = {
        cod_interno: id,
        activo: true,
        presentacion: sd.presentacion,
        embalaje: sd.embalaje,
        precio_lista: sd.precio_lista,
        created_at: new Date().toISOString()
      };

      if (pd) {
        doc.titulo = pd.titulo;
        doc.categoria = pd.categoria;
        doc.p_real = pd.p_real;
        doc.cantidad = pd.cantidad;
        doc.ean = pd.ean;
        doc.imagen_principal = pd.imagen_principal;
      } else {
        doc.titulo = id; // placeholder
        doc.categoria = 'Por clasificar';
        doc.cantidad = 0;
      }

      crear.push({ id, titulo: doc.titulo, tieneData: !!pd });
      if (!MODE_TEST) {
        batch.set(db.collection('productos').doc(id), doc);
        ops++;
      }
    }
  }

  console.log(chalk.green.bold('📦 Crear nuevos (' + crear.length + '):'));
  crear.forEach(p => {
    const tag = p.tieneData ? chalk.green('✓ datos completos') : chalk.yellow('⚠ solo ID_Producto_final');
    console.log('   ' + p.id + ' — ' + p.titulo + ' ' + tag);
  });
  console.log('');

  // --- Ejecutar ---
  if (MODE_TEST) {
    console.log(chalk.yellow.bold('═══════════════════════════════════════'));
    console.log(chalk.yellow.bold('   DRY-RUN — Sin cambios aplicados'));
    console.log(chalk.yellow.bold('═══════════════════════════════════════\n'));
  } else {
    await batch.commit();
    console.log(chalk.green.bold('✅ ' + ops + ' operaciones ejecutadas en Firestore\n'));
  }
}

main().catch(e => { console.error(chalk.red('❌ ' + e.message)); process.exit(1); });
