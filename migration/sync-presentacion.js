/**
 * ENAR - Sync Presentación, UxT y P.Lista desde ID_Producto_final
 * Lee columnas A:D (ID_PRODUCTO, PRESENTACIÓN, UxT, P.LISTA) y actualiza Firestore
 *
 * Uso:
 *   node sync-presentacion.js --test       (dry-run, solo muestra qué haría)
 *   node sync-presentacion.js --ejecutar   (aplica cambios en Firestore)
 */

const admin = require('firebase-admin');
const { google } = require('googleapis');
const cliProgress = require('cli-progress');
const chalk = require('chalk');

// ============================================
// CONFIGURACIÓN
// ============================================

const SPREADSHEET_ID = '1a-cy3_OSegXeDwEmud7V3SRDlht4S8OAOblg74bPhMw';
const SHEET_RANGE = 'ID_Producto_final!A2:D';
const BATCH_SIZE = 500;

const MODE_TEST = process.argv.includes('--test');
const MODE_EJECUTAR = process.argv.includes('--ejecutar');

if (!MODE_TEST && !MODE_EJECUTAR) {
  console.log(chalk.red('\n❌ Debes especificar un modo:\n'));
  console.log(chalk.cyan('   node sync-presentacion.js --test      ') + '(dry-run, solo muestra qué haría)');
  console.log(chalk.cyan('   node sync-presentacion.js --ejecutar   ') + '(aplica cambios en Firestore)\n');
  process.exit(1);
}

console.log(chalk.blue.bold('\n📦 ENAR - Sync Presentación, UxT y P.Lista\n'));

if (MODE_TEST) {
  console.log(chalk.yellow('⚠️  MODO TEST (dry-run) — No se modificará Firestore\n'));
} else {
  console.log(chalk.red.bold('🔴 MODO EJECUTAR — Se actualizará Firestore\n'));
}

// ============================================
// INICIALIZAR FIREBASE
// ============================================

try {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'enar-b2b'
  });
  console.log(chalk.green('✅ Firebase Admin inicializado con ADC'));
} catch (error) {
  console.error(chalk.red('❌ Error inicializando Firebase: ' + error.message));
  process.exit(1);
}

const db = admin.firestore();

// ============================================
// INICIALIZAR GOOGLE SHEETS API
// ============================================

let sheets;
try {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });
  sheets = google.sheets({ version: 'v4', auth });
  console.log(chalk.green('✅ Google Sheets API inicializada\n'));
} catch (error) {
  console.error(chalk.red('❌ Error cargando credenciales Sheets API: ' + error.message));
  process.exit(1);
}

// ============================================
// MAIN
// ============================================

async function main() {
  const startTime = Date.now();

  try {
    // --- Paso 1: Leer datos del Sheet ---
    console.log(chalk.blue.bold('📖 Paso 1: Leyendo datos del Sheet (A:D)...\n'));

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: SHEET_RANGE
    });

    const rows = response.data.values || [];
    const datosSheet = new Map();

    for (const row of rows) {
      const id = (row[0] || '').trim();
      if (!id) continue;

      const presentacion = (row[1] || '').trim();
      const uxt = (row[2] || '').trim();
      // Formato colombiano: $139.945 o $20.000,00 → punto=miles, coma=decimales
      const pListaRaw = (row[3] || '0').replace(/[$\s]/g, '').split(',')[0].replace(/\./g, '');
      const pLista = parseInt(pListaRaw, 10) || 0;

      datosSheet.set(id, { presentacion, embalaje: uxt, precio_lista: pLista });
    }

    console.log(chalk.green(`   ✅ ${datosSheet.size} productos leídos del Sheet\n`));

    // --- Paso 2: Leer productos activos de Firestore ---
    console.log(chalk.blue.bold('📦 Paso 2: Leyendo productos activos de Firestore...\n'));

    const productosSnap = await db.collection('productos').where('activo', '==', true).get();
    console.log(chalk.green(`   ✅ ${productosSnap.size} productos activos en Firestore\n`));

    // --- Paso 3: Comparar y detectar cambios ---
    console.log(chalk.blue.bold('🔍 Paso 3: Comparando campos...\n'));

    const cambios = [];
    let sinCambio = 0;
    let sinDatosSheet = 0;

    productosSnap.forEach(docSnap => {
      const data = docSnap.data();
      const sheetData = datosSheet.get(docSnap.id);

      if (!sheetData) {
        sinDatosSheet++;
        return;
      }

      const updates = {};
      let hayCambio = false;

      if ((data.presentacion || '') !== sheetData.presentacion) {
        updates.presentacion = sheetData.presentacion;
        hayCambio = true;
      }

      if ((data.embalaje || '') !== sheetData.embalaje) {
        updates.embalaje = sheetData.embalaje;
        hayCambio = true;
      }

      if ((data.precio_lista || 0) !== sheetData.precio_lista) {
        updates.precio_lista = sheetData.precio_lista;
        hayCambio = true;
      }

      if (hayCambio) {
        cambios.push({
          id: docSnap.id,
          nombre: data.titulo || data.cod_interno || docSnap.id,
          updates,
          antes: {
            presentacion: data.presentacion || '',
            embalaje: data.embalaje || '',
            precio_lista: data.precio_lista || 0
          }
        });
      } else {
        sinCambio++;
      }
    });

    console.log(chalk.green(`   ✅ Con cambios:      ${cambios.length} productos`));
    console.log(chalk.gray(`   ⚪ Sin cambio:       ${sinCambio} productos`));
    if (sinDatosSheet > 0) {
      console.log(chalk.yellow(`   ⚠️  Sin datos Sheet:  ${sinDatosSheet} productos`));
    }
    console.log('');

    // Mostrar detalle de cambios (máx 20 en test)
    if (cambios.length > 0) {
      const mostrar = MODE_TEST ? cambios.slice(0, 30) : cambios.slice(0, 10);
      console.log(chalk.cyan.bold('Muestra de cambios:'));
      mostrar.forEach((c, i) => {
        const campos = Object.keys(c.updates).map(k => {
          return `${k}: "${c.antes[k]}" → "${c.updates[k]}"`;
        }).join(', ');
        console.log(chalk.cyan(`   ${i + 1}. ${c.id} — ${campos}`));
      });
      if (cambios.length > mostrar.length) {
        console.log(chalk.gray(`   ... y ${cambios.length - mostrar.length} más`));
      }
      console.log('');
    }

    // --- Paso 4: Aplicar cambios ---
    if (MODE_TEST) {
      console.log(chalk.yellow.bold('═══════════════════════════════════════'));
      console.log(chalk.yellow.bold('   DRY-RUN COMPLETADO — Sin cambios'));
      console.log(chalk.yellow.bold('═══════════════════════════════════════\n'));
      console.log(chalk.cyan('Para aplicar cambios ejecuta:'));
      console.log(chalk.cyan('   node sync-presentacion.js --ejecutar\n'));
    } else {
      console.log(chalk.blue.bold('✏️  Paso 4: Actualizando Firestore...\n'));

      if (cambios.length === 0) {
        console.log(chalk.green('   No hay cambios que aplicar.\n'));
      } else {
        const progressBar = new cliProgress.SingleBar({
          format: 'Progreso |' + chalk.cyan('{bar}') + '| {percentage}% || {value}/{total}',
          barCompleteChar: '\u2588',
          barIncompleteChar: '\u2591',
          hideCursor: true
        });

        progressBar.start(cambios.length, 0);
        let procesados = 0;

        for (let i = 0; i < cambios.length; i += BATCH_SIZE) {
          const batch = db.batch();
          const chunk = cambios.slice(i, i + BATCH_SIZE);

          for (const c of chunk) {
            batch.update(db.collection('productos').doc(c.id), c.updates);
          }

          await batch.commit();
          procesados += chunk.length;
          progressBar.update(procesados);
        }

        progressBar.stop();
        console.log(chalk.green(`\n   ✅ ${procesados} productos actualizados en Firestore\n`));
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(chalk.gray(`⏱️  Tiempo: ${elapsed}s\n`));

  } catch (error) {
    console.error(chalk.red('\n❌ Error: ' + error.message));
    console.error(error);
    process.exit(1);
  }
}

main();
