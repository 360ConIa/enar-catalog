/**
 * ENAR CRM - Limpieza de Productos Obsoletos
 * Marca activo:false en productos que NO están en la hoja ID_Producto_final
 *
 * Uso:
 *   node limpiar-productos.js --test       (dry-run, solo muestra qué haría)
 *   node limpiar-productos.js --ejecutar   (aplica cambios en Firestore)
 */

const admin = require('firebase-admin');
const { google } = require('googleapis');
const cliProgress = require('cli-progress');
const chalk = require('chalk');

// ============================================
// CONFIGURACIÓN
// ============================================

const SPREADSHEET_ID = '1a-cy3_OSegXeDwEmud7V3SRDlht4S8OAOblg74bPhMw';
const SHEET_RANGE = 'ID_Producto_final!A2:B';
const BATCH_SIZE = 500; // Máximo de Firestore por batch

const MODE_TEST = process.argv.includes('--test');
const MODE_EJECUTAR = process.argv.includes('--ejecutar');

if (!MODE_TEST && !MODE_EJECUTAR) {
  console.log(chalk.red('\n❌ Debes especificar un modo:\n'));
  console.log(chalk.cyan('   node limpiar-productos.js --test      ') + '(dry-run, solo muestra qué haría)');
  console.log(chalk.cyan('   node limpiar-productos.js --ejecutar   ') + '(aplica cambios en Firestore)\n');
  process.exit(1);
}

console.log(chalk.blue.bold('\n🧹 ENAR - Limpieza de Productos Obsoletos\n'));

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
    // --- Paso 1: Leer IDs válidos del Sheet ---
    console.log(chalk.blue.bold('📖 Paso 1: Leyendo productos válidos del Sheet...\n'));

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: SHEET_RANGE
    });

    const rows = response.data.values || [];
    const idsValidos = new Set();

    for (const row of rows) {
      const id = (row[0] || '').trim();
      if (id) idsValidos.add(id);
    }

    console.log(chalk.green(`   ✅ ${idsValidos.size} productos válidos en el Sheet\n`));

    // --- Paso 2: Leer TODOS los productos de Firestore ---
    console.log(chalk.blue.bold('📦 Paso 2: Leyendo productos de Firestore...\n'));

    const productosSnap = await db.collection('productos').get();
    console.log(chalk.green(`   ✅ ${productosSnap.size} productos en Firestore\n`));

    // --- Paso 3: Comparar y clasificar ---
    console.log(chalk.blue.bold('🔍 Paso 3: Comparando...\n'));

    const activar = [];   // IDs que deben tener activo: true
    const desactivar = []; // IDs que deben tener activo: false
    const yaCorrectos = 0;
    let sinCambio = 0;

    productosSnap.forEach(doc => {
      const data = doc.data();
      const enSheet = idsValidos.has(doc.id);
      const activoActual = data.activo !== false; // undefined o true = activo

      if (enSheet && !activoActual) {
        activar.push({ id: doc.id, nombre: data.titulo || data.cod_interno || doc.id });
      } else if (!enSheet && activoActual) {
        desactivar.push({ id: doc.id, nombre: data.titulo || data.cod_interno || doc.id });
      } else {
        sinCambio++;
      }
    });

    // IDs en Sheet que no existen en Firestore
    const idsFirestore = new Set();
    productosSnap.forEach(doc => idsFirestore.add(doc.id));
    const soloEnSheet = [...idsValidos].filter(id => !idsFirestore.has(id));

    console.log(chalk.green(`   ✅ Activar:     ${activar.length} productos`));
    console.log(chalk.red(`   🔴 Desactivar:  ${desactivar.length} productos`));
    console.log(chalk.gray(`   ⚪ Sin cambio:  ${sinCambio} productos`));
    if (soloEnSheet.length > 0) {
      console.log(chalk.yellow(`   ⚠️  Solo en Sheet (no en Firestore): ${soloEnSheet.length}`));
    }
    console.log('');

    // Mostrar lista de productos a desactivar
    if (desactivar.length > 0) {
      console.log(chalk.red.bold('Productos a DESACTIVAR:'));
      desactivar.forEach((p, i) => {
        console.log(chalk.red(`   ${i + 1}. ${p.id} — ${p.nombre}`));
      });
      console.log('');
    }

    // Mostrar lista de productos a activar
    if (activar.length > 0) {
      console.log(chalk.green.bold('Productos a ACTIVAR:'));
      activar.forEach((p, i) => {
        console.log(chalk.green(`   ${i + 1}. ${p.id} — ${p.nombre}`));
      });
      console.log('');
    }

    // Mostrar IDs solo en Sheet
    if (soloEnSheet.length > 0 && soloEnSheet.length <= 20) {
      console.log(chalk.yellow.bold('IDs en Sheet sin documento en Firestore:'));
      soloEnSheet.forEach(id => {
        console.log(chalk.yellow(`   - ${id}`));
      });
      console.log('');
    }

    // --- Paso 4: Aplicar cambios (solo en modo --ejecutar) ---
    if (MODE_TEST) {
      console.log(chalk.yellow.bold('═══════════════════════════════════════'));
      console.log(chalk.yellow.bold('   DRY-RUN COMPLETADO — Sin cambios'));
      console.log(chalk.yellow.bold('═══════════════════════════════════════\n'));
      console.log(chalk.cyan('Para aplicar cambios ejecuta:'));
      console.log(chalk.cyan('   node limpiar-productos.js --ejecutar\n'));
    } else {
      console.log(chalk.blue.bold('✏️  Paso 4: Actualizando Firestore...\n'));

      const totalCambios = activar.length + desactivar.length;

      if (totalCambios === 0) {
        console.log(chalk.green('   No hay cambios que aplicar.\n'));
      } else {
        const progressBar = new cliProgress.SingleBar({
          format: 'Progreso |' + chalk.cyan('{bar}') + '| {percentage}% || {value}/{total}',
          barCompleteChar: '\u2588',
          barIncompleteChar: '\u2591',
          hideCursor: true
        });

        progressBar.start(totalCambios, 0);
        let procesados = 0;

        // Procesar en batches de 500
        const todosLosCambios = [
          ...desactivar.map(p => ({ id: p.id, activo: false })),
          ...activar.map(p => ({ id: p.id, activo: true }))
        ];

        for (let i = 0; i < todosLosCambios.length; i += BATCH_SIZE) {
          const chunk = todosLosCambios.slice(i, i + BATCH_SIZE);
          const batch = db.batch();

          for (const cambio of chunk) {
            const ref = db.collection('productos').doc(cambio.id);
            batch.update(ref, {
              activo: cambio.activo,
              updated_at: admin.firestore.FieldValue.serverTimestamp()
            });
          }

          await batch.commit();
          procesados += chunk.length;
          progressBar.update(procesados);
        }

        progressBar.stop();
        console.log('');
      }

      console.log(chalk.green.bold('═══════════════════════════════════════'));
      console.log(chalk.green.bold('   ✅ LIMPIEZA COMPLETADA'));
      console.log(chalk.green.bold('═══════════════════════════════════════\n'));
    }

    // --- Paso 5: Reporte final ---
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    console.log(chalk.cyan('📊 Resumen:'));
    console.log(chalk.cyan(`   • Productos en Sheet:     ${idsValidos.size}`));
    console.log(chalk.cyan(`   • Productos en Firestore: ${productosSnap.size}`));
    console.log(chalk.green(`   • Activados:              ${activar.length}`));
    console.log(chalk.red(`   • Desactivados:           ${desactivar.length}`));
    console.log(chalk.gray(`   • Sin cambio:             ${sinCambio}`));
    if (soloEnSheet.length > 0) {
      console.log(chalk.yellow(`   • Solo en Sheet:          ${soloEnSheet.length}`));
    }
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
