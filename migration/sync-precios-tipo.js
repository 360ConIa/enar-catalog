/**
 * ENAR - Sync precios por tipo de cliente
 * Calcula precio_mayorista, precio_negocio y precio_persona_natural
 * a partir de precio_lista usando factores multiplicadores.
 *
 * Factores:
 *   Mayorista:       precio_lista × 49.56%
 *   Negocio:         precio_lista × 49.56% (o 51.56% para IDs específicos)
 *   Persona Natural: precio_lista × 60%
 *
 * Uso:
 *   node sync-precios-tipo.js --test       (dry-run)
 *   node sync-precios-tipo.js --ejecutar   (aplica cambios)
 */

const admin = require('firebase-admin');
const cliProgress = require('cli-progress');
const chalk = require('chalk');

// ============================================
// CONFIGURACIÓN DE FACTORES
// ============================================

const FACTOR_MAYORISTA = 0.4956;
const FACTOR_NEGOCIO = 0.4956;
const FACTOR_NEGOCIO_PLUS = 0.5156; // +2% para IDs específicos
const FACTOR_PERSONA_NATURAL = 0.60;
const IVA = 1.19;

// IDs que llevan el +2% en precio negocio
// TODO: Actualizar con lista definitiva
const IDS_NEGOCIO_PLUS = new Set([
  '-Z-G',
  '-Z-G5',
  '-Z-E-',
  '-Z-I'
]);

const BATCH_SIZE = 500;

const MODE_TEST = process.argv.includes('--test');
const MODE_EJECUTAR = process.argv.includes('--ejecutar');

if (!MODE_TEST && !MODE_EJECUTAR) {
  console.log(chalk.red('\n❌ Debes especificar: --test o --ejecutar\n'));
  process.exit(1);
}

console.log(chalk.blue.bold('\n💰 ENAR - Sync Precios por Tipo de Cliente\n'));
console.log(chalk.gray('   Mayorista:       precio_lista × ' + (FACTOR_MAYORISTA * 100).toFixed(2) + '%'));
console.log(chalk.gray('   Negocio:         precio_lista × ' + (FACTOR_NEGOCIO * 100).toFixed(2) + '% (o ' + (FACTOR_NEGOCIO_PLUS * 100).toFixed(2) + '% para ' + IDS_NEGOCIO_PLUS.size + ' IDs específicos)'));
console.log(chalk.gray('   Persona Natural: precio_lista × ' + (FACTOR_PERSONA_NATURAL * 100).toFixed(2) + '%\n'));

if (MODE_TEST) {
  console.log(chalk.yellow('⚠️  MODO TEST (dry-run)\n'));
} else {
  console.log(chalk.red.bold('🔴 MODO EJECUTAR\n'));
}

// ============================================
// INICIALIZAR FIREBASE
// ============================================

try {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'enar-b2b'
  });
  console.log(chalk.green('✅ Firebase Admin inicializado'));
} catch (error) {
  console.error(chalk.red('❌ Error: ' + error.message));
  process.exit(1);
}

const db = admin.firestore();

// ============================================
// MAIN
// ============================================

async function main() {
  const startTime = Date.now();

  // Leer productos activos
  console.log(chalk.blue.bold('\n📦 Leyendo productos activos...\n'));
  const snap = await db.collection('productos').where('activo', '==', true).get();
  console.log(chalk.green('   ✅ ' + snap.size + ' productos activos\n'));

  const cambios = [];
  let sinPrecioLista = 0;
  let sinCambio = 0;

  snap.forEach(docSnap => {
    const data = docSnap.data();
    const pl = data.precio_lista || 0;

    if (pl === 0) {
      sinPrecioLista++;
      return;
    }

    const esPlus = IDS_NEGOCIO_PLUS.has(docSnap.id);
    const factorNeg = esPlus ? FACTOR_NEGOCIO_PLUS : FACTOR_NEGOCIO;

    const nuevoMay = Math.round(pl * FACTOR_MAYORISTA * IVA);
    const nuevoNeg = Math.round(pl * factorNeg * IVA);
    const nuevoNat = Math.round(pl * FACTOR_PERSONA_NATURAL * IVA);

    const actualMay = Math.round(data.precio_mayorista || 0);
    const actualNeg = Math.round(data.precio_negocio || 0);
    const actualNat = Math.round(data.precio_persona_natural || 0);

    if (actualMay === nuevoMay && actualNeg === nuevoNeg && actualNat === nuevoNat) {
      sinCambio++;
      return;
    }

    cambios.push({
      id: docSnap.id,
      titulo: data.titulo || docSnap.id,
      precio_lista: pl,
      esPlus,
      updates: {
        precio_mayorista: nuevoMay,
        precio_negocio: nuevoNeg,
        precio_persona_natural: nuevoNat
      },
      antes: {
        precio_mayorista: actualMay,
        precio_negocio: actualNeg,
        precio_persona_natural: actualNat
      }
    });
  });

  console.log(chalk.green('   ✅ Con cambios:       ' + cambios.length));
  console.log(chalk.gray('   ⚪ Sin cambio:        ' + sinCambio));
  if (sinPrecioLista > 0) {
    console.log(chalk.yellow('   ⚠️  Sin precio_lista:  ' + sinPrecioLista));
  }
  console.log('');

  // Mostrar muestra
  const plusProducts = cambios.filter(c => c.esPlus);
  const normalProducts = cambios.filter(c => !c.esPlus);

  if (plusProducts.length > 0) {
    console.log(chalk.cyan.bold('IDs con +2% negocio (' + plusProducts.length + '):'));
    plusProducts.forEach(c => {
      console.log(chalk.cyan('   ' + c.id + ' | lista: ' + c.precio_lista + ' → may: ' + c.updates.precio_mayorista + ' | neg: ' + c.updates.precio_negocio + ' (+2%) | nat: ' + c.updates.precio_persona_natural));
    });
    console.log('');
  }

  if (normalProducts.length > 0) {
    const mostrar = MODE_TEST ? normalProducts.slice(0, 15) : normalProducts.slice(0, 5);
    console.log(chalk.cyan.bold('Muestra productos normales:'));
    mostrar.forEach(c => {
      console.log(chalk.cyan('   ' + c.id + ' | lista: ' + c.precio_lista + ' → may: ' + c.updates.precio_mayorista + ' | neg: ' + c.updates.precio_negocio + ' | nat: ' + c.updates.precio_persona_natural));
    });
    if (normalProducts.length > mostrar.length) {
      console.log(chalk.gray('   ... y ' + (normalProducts.length - mostrar.length) + ' más'));
    }
    console.log('');
  }

  // Ejecutar
  if (MODE_TEST) {
    console.log(chalk.yellow.bold('═══════════════════════════════════════'));
    console.log(chalk.yellow.bold('   DRY-RUN COMPLETADO — Sin cambios'));
    console.log(chalk.yellow.bold('═══════════════════════════════════════\n'));
    console.log(chalk.cyan('Para aplicar: node sync-precios-tipo.js --ejecutar\n'));
  } else {
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
      console.log(chalk.green('\n   ✅ ' + procesados + ' productos actualizados\n'));
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(chalk.gray('⏱️  Tiempo: ' + elapsed + 's\n'));
}

main().catch(e => { console.error(chalk.red('❌ ' + e.message)); process.exit(1); });
