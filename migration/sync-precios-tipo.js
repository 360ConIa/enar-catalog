/**
 * ENAR - Sync precios por tipo de cliente
 * Calcula precio_mayorista, precio_negocio, precio_persona_natural y precio_nuevos
 * a partir de precio_lista (precio base).
 *
 * Fórmulas (incremento sobre precio base, sin IVA):
 *   Mayorista:        precio_lista × 1.30  (+30%)
 *   Negocio:          precio_lista × 1.35  (+35%)
 *   Persona Natural:  precio_lista × 1.40  (+40%)
 *   Nuevos:           precio_lista × 1.45  (+45%)
 *
 * Excepción: SKUs que terminan en --KQ → 30% fijo en las 4 listas
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

const FACTOR_MAYORISTA = 1.30;       // +30%
const FACTOR_NEGOCIO = 1.35;         // +35%
const FACTOR_PERSONA_NATURAL = 1.40; // +40%
const FACTOR_NUEVOS = 1.45;          // +45%
const FACTOR_EXCEPCION = 1.30;       // +30% fijo para excepciones

// Sufijos de SKU que usan el incremento de excepción (30% fijo en todas las listas)
const SUFIJOS_EXCEPCION = ['--KQ'];

const BATCH_SIZE = 500;

const MODE_TEST = process.argv.includes('--test');
const MODE_EJECUTAR = process.argv.includes('--ejecutar');

if (!MODE_TEST && !MODE_EJECUTAR) {
  console.log(chalk.red('\n❌ Debes especificar: --test o --ejecutar\n'));
  process.exit(1);
}

console.log(chalk.blue.bold('\n💰 ENAR - Sync Precios por Tipo de Cliente\n'));
console.log(chalk.gray('   Mayorista:        precio_base × 1.30 (+30%)'));
console.log(chalk.gray('   Negocio:          precio_base × 1.35 (+35%)'));
console.log(chalk.gray('   Persona Natural:  precio_base × 1.40 (+40%)'));
console.log(chalk.gray('   Nuevos:           precio_base × 1.45 (+45%)'));
console.log(chalk.gray('   Excepción (--KQ): precio_base × 1.30 (+30% fijo en todas)\n'));

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

function esExcepcion(codInterno) {
  return SUFIJOS_EXCEPCION.some(suffix => codInterno.endsWith(suffix));
}

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

    const codInterno = data.cod_interno || docSnap.id;
    const esExcep = esExcepcion(codInterno);

    const nuevoMay = Math.round(pl * (esExcep ? FACTOR_EXCEPCION : FACTOR_MAYORISTA));
    const nuevoNeg = Math.round(pl * (esExcep ? FACTOR_EXCEPCION : FACTOR_NEGOCIO));
    const nuevoNat = Math.round(pl * (esExcep ? FACTOR_EXCEPCION : FACTOR_PERSONA_NATURAL));
    const nuevoNuevos = Math.round(pl * (esExcep ? FACTOR_EXCEPCION : FACTOR_NUEVOS));

    const actualMay = Math.round(data.precio_mayorista || 0);
    const actualNeg = Math.round(data.precio_negocio || 0);
    const actualNat = Math.round(data.precio_persona_natural || 0);
    const actualNuevos = Math.round(data.precio_nuevos || 0);

    if (actualMay === nuevoMay && actualNeg === nuevoNeg && actualNat === nuevoNat && actualNuevos === nuevoNuevos) {
      sinCambio++;
      return;
    }

    cambios.push({
      id: docSnap.id,
      cod_interno: codInterno,
      titulo: data.titulo || docSnap.id,
      precio_lista: pl,
      esExcep,
      updates: {
        precio_mayorista: nuevoMay,
        precio_negocio: nuevoNeg,
        precio_persona_natural: nuevoNat,
        precio_nuevos: nuevoNuevos
      },
      antes: {
        precio_mayorista: actualMay,
        precio_negocio: actualNeg,
        precio_persona_natural: actualNat,
        precio_nuevos: actualNuevos
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
  const excepProducts = cambios.filter(c => c.esExcep);
  const normalProducts = cambios.filter(c => !c.esExcep);

  if (excepProducts.length > 0) {
    console.log(chalk.cyan.bold('SKUs excepción --KQ (' + excepProducts.length + '):'));
    excepProducts.forEach(c => {
      console.log(chalk.cyan('   ' + c.cod_interno + ' | base: ' + c.precio_lista + ' → may: ' + c.updates.precio_mayorista + ' | neg: ' + c.updates.precio_negocio + ' | nat: ' + c.updates.precio_persona_natural + ' | nuev: ' + c.updates.precio_nuevos + ' (30% fijo)'));
    });
    console.log('');
  }

  if (normalProducts.length > 0) {
    const mostrar = MODE_TEST ? normalProducts.slice(0, 15) : normalProducts.slice(0, 5);
    console.log(chalk.cyan.bold('Productos normales (' + normalProducts.length + '):'));
    mostrar.forEach(c => {
      console.log(chalk.cyan('   ' + c.cod_interno + ' | base: ' + c.precio_lista + ' → may: ' + c.updates.precio_mayorista + ' | neg: ' + c.updates.precio_negocio + ' | nat: ' + c.updates.precio_persona_natural + ' | nuev: ' + c.updates.precio_nuevos));
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
