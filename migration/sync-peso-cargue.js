/**
 * ENAR - Sincronizar Peso_Kg y Orden_Cargue desde Sheet a Firestore
 *
 * Uso:
 *   node sync-peso-cargue.js --test       (dry-run, solo muestra qué haría)
 *   node sync-peso-cargue.js --ejecutar   (aplica cambios en Firestore)
 */

const admin = require('firebase-admin');
const { google } = require('googleapis');
const cliProgress = require('cli-progress');
const chalk = require('chalk');

// ============================================
// CONFIGURACIÓN
// ============================================

const SPREADSHEET_ID = '1a-cy3_OSegXeDwEmud7V3SRDlht4S8OAOblg74bPhMw';
const SHEET_RANGE = 'Productos!A4:X';
const BATCH_SIZE = 500;

const MODE_TEST = process.argv.includes('--test');
const MODE_EJECUTAR = process.argv.includes('--ejecutar');

if (!MODE_TEST && !MODE_EJECUTAR) {
  console.log(chalk.red('\n❌ Debes especificar un modo:\n'));
  console.log(chalk.cyan('   node sync-peso-cargue.js --test      ') + '(dry-run)');
  console.log(chalk.cyan('   node sync-peso-cargue.js --ejecutar   ') + '(aplica cambios)\n');
  process.exit(1);
}

console.log(chalk.blue.bold('\n📦 ENAR - Sincronizar Peso y Orden de Cargue\n'));

if (MODE_TEST) {
  console.log(chalk.yellow('⚠️  MODO TEST (dry-run) — No se modificará Firestore\n'));
} else {
  console.log(chalk.red.bold('🔴 MODO EJECUTAR — Se actualizará Firestore\n'));
}

// ============================================
// INICIALIZAR FIREBASE + SHEETS
// ============================================

try {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'enar-b2b'
  });
  console.log(chalk.green('✅ Firebase Admin inicializado'));
} catch (error) {
  console.error(chalk.red('❌ Error Firebase: ' + error.message));
  process.exit(1);
}

const db = admin.firestore();

let sheets;
try {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });
  sheets = google.sheets({ version: 'v4', auth });
  console.log(chalk.green('✅ Google Sheets API inicializada\n'));
} catch (error) {
  console.error(chalk.red('❌ Error Sheets API: ' + error.message));
  process.exit(1);
}

// ============================================
// Parsear número con coma o punto decimal
// ============================================
function parseNum(val) {
  if (val === undefined || val === null || val === '') return 0;
  // Reemplazar coma por punto para formato colombiano
  const clean = String(val).replace(',', '.');
  return parseFloat(clean) || 0;
}

// ============================================
// MAIN
// ============================================

async function main() {
  const startTime = Date.now();

  try {
    // --- Paso 1: Leer Sheet ---
    console.log(chalk.blue.bold('📖 Paso 1: Leyendo hoja Productos...\n'));

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: SHEET_RANGE
    });

    const rows = response.data.values || [];
    console.log(chalk.green(`   ✅ ${rows.length} filas en el Sheet\n`));

    // Parsear datos del Sheet
    const sheetData = {};
    for (const row of rows) {
      const id = (row[0] || '').trim();
      if (!id) continue;
      const pesoKg = parseNum(row[22]);     // Columna W (index 22)
      const ordenCargue = (row[23] || '').trim(); // Columna X (index 23) — texto
      sheetData[id] = { pesoKg, ordenCargue, nombre: row[1] || '' };
    }

    const idsSheet = Object.keys(sheetData);
    console.log(chalk.green(`   ✅ ${idsSheet.length} productos parseados del Sheet\n`));

    // --- Paso 2: Leer productos de Firestore ---
    console.log(chalk.blue.bold('📦 Paso 2: Leyendo productos de Firestore...\n'));

    const productosSnap = await db.collection('productos').get();
    console.log(chalk.green(`   ✅ ${productosSnap.size} productos en Firestore\n`));

    // --- Paso 3: Comparar y detectar cambios ---
    console.log(chalk.blue.bold('🔍 Paso 3: Comparando...\n'));

    const cambios = [];
    let sinCambio = 0;
    let soloEnSheet = 0;

    for (const id of idsSheet) {
      const docRef = productosSnap.docs.find(d => d.id === id);
      if (!docRef) {
        soloEnSheet++;
        continue;
      }

      const data = docRef.data();
      const sheet = sheetData[id];

      const pesoActual = data.peso || 0;
      const ordenActual = data.Orden_Cargue || '';

      const cambiarPeso = Math.abs(pesoActual - sheet.pesoKg) > 0.001;
      const cambiarOrden = ordenActual !== sheet.ordenCargue;

      if (cambiarPeso || cambiarOrden) {
        cambios.push({
          id,
          nombre: sheet.nombre || data.titulo || id,
          pesoAnterior: pesoActual,
          pesoNuevo: sheet.pesoKg,
          ordenAnterior: ordenActual,
          ordenNuevo: sheet.ordenCargue,
          cambiarPeso,
          cambiarOrden
        });
      } else {
        sinCambio++;
      }
    }

    const cambiosPeso = cambios.filter(c => c.cambiarPeso).length;
    const cambiosOrden = cambios.filter(c => c.cambiarOrden).length;

    console.log(chalk.green(`   ✅ Sin cambio:         ${sinCambio}`));
    console.log(chalk.cyan(`   📝 Total cambios:      ${cambios.length}`));
    console.log(chalk.cyan(`      - Peso:             ${cambiosPeso}`));
    console.log(chalk.cyan(`      - Orden de Cargue:  ${cambiosOrden}`));
    if (soloEnSheet > 0) {
      console.log(chalk.yellow(`   ⚠️  Solo en Sheet:     ${soloEnSheet}`));
    }
    console.log('');

    // Mostrar detalle de cambios de peso
    if (cambiosPeso > 0) {
      console.log(chalk.cyan.bold('Cambios de PESO:'));
      cambios.filter(c => c.cambiarPeso).forEach((c, i) => {
        console.log(chalk.cyan(`   ${i + 1}. ${c.id} — ${c.nombre}:  ${c.pesoAnterior} → ${c.pesoNuevo} kg`));
      });
      console.log('');
    }

    // Mostrar detalle de cambios de orden (solo primeros 30)
    if (cambiosOrden > 0) {
      const muestra = cambios.filter(c => c.cambiarOrden).slice(0, 30);
      console.log(chalk.cyan.bold(`Cambios de ORDEN DE CARGUE (${cambiosOrden > 30 ? 'primeros 30' : 'todos'}):`));
      muestra.forEach((c, i) => {
        console.log(chalk.cyan(`   ${i + 1}. ${c.id} — ${c.nombre}:  ${c.ordenAnterior} → ${c.ordenNuevo}`));
      });
      if (cambiosOrden > 30) console.log(chalk.gray(`   ... y ${cambiosOrden - 30} más`));
      console.log('');
    }

    // --- Paso 4: Aplicar ---
    if (MODE_TEST) {
      console.log(chalk.yellow.bold('═══════════════════════════════════════'));
      console.log(chalk.yellow.bold('   DRY-RUN COMPLETADO — Sin cambios'));
      console.log(chalk.yellow.bold('═══════════════════════════════════════\n'));
      console.log(chalk.cyan('Para aplicar: node sync-peso-cargue.js --ejecutar\n'));
    } else if (cambios.length === 0) {
      console.log(chalk.green('   No hay cambios que aplicar.\n'));
    } else {
      console.log(chalk.blue.bold('✏️  Paso 4: Actualizando Firestore...\n'));

      const progressBar = new cliProgress.SingleBar({
        format: 'Progreso |' + chalk.cyan('{bar}') + '| {percentage}% || {value}/{total}',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true
      });

      progressBar.start(cambios.length, 0);
      let procesados = 0;

      for (let i = 0; i < cambios.length; i += BATCH_SIZE) {
        const chunk = cambios.slice(i, i + BATCH_SIZE);
        const batch = db.batch();

        for (const c of chunk) {
          const ref = db.collection('productos').doc(c.id);
          const update = { updated_at: admin.firestore.FieldValue.serverTimestamp() };
          if (c.cambiarPeso) update.peso = c.pesoNuevo;
          if (c.cambiarOrden) update.Orden_Cargue = c.ordenNuevo;
          batch.update(ref, update);
        }

        await batch.commit();
        procesados += chunk.length;
        progressBar.update(procesados);
      }

      progressBar.stop();
      console.log('');

      console.log(chalk.green.bold('═══════════════════════════════════════'));
      console.log(chalk.green.bold('   ✅ SINCRONIZACIÓN COMPLETADA'));
      console.log(chalk.green.bold('═══════════════════════════════════════\n'));
    }

    // Reporte final
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(chalk.cyan('📊 Resumen:'));
    console.log(chalk.cyan(`   • Productos en Sheet:     ${idsSheet.length}`));
    console.log(chalk.cyan(`   • Productos en Firestore: ${productosSnap.size}`));
    console.log(chalk.cyan(`   • Peso actualizado:       ${cambiosPeso}`));
    console.log(chalk.cyan(`   • Orden actualizado:      ${cambiosOrden}`));
    console.log(chalk.cyan(`   • Sin cambio:             ${sinCambio}`));
    console.log(chalk.cyan(`   • Tiempo:                 ${elapsed}s\n`));

  } catch (error) {
    console.error(chalk.red.bold('\n❌ ERROR:'));
    console.error(chalk.red(error.message));
    console.error(error.stack);
    process.exit(1);
  }

  process.exit(0);
}

main();
