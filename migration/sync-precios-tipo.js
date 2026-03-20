/**
 * ENAR - Sync precios por tipo de cliente
 * Calcula precio_mayorista, precio_negocio y precio_persona_natural
 * a partir de precio_lista.
 *
 * Fórmulas:
 *   Mayorista:       precio_lista × (1 - 48%) × (1 - 3%) × 1.19 IVA
 *                    = precio_lista × 0.52 × 0.97 × 1.19
 *   Negocio:         = Mayorista (con 3%), excepto IDs específicos que van sin 3%
 *                    General: precio_lista × 0.52 × 0.97 × 1.19
 *                    Excepción: precio_lista × 0.52 × 1.19
 *   Persona Natural: precio_lista × 60% × 1.19 IVA
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

// Fórmulas:
// Mayorista:        (P.Lista × 0.52 × 0.97) × 1.19
// Negocio caso 1:   (P.Lista × 0.52 × 0.97) × 1.19  (igual a mayorista)
// Negocio caso 2:   (P.Lista × 0.52) × 1.19          (sin descuento 3%, para IDs específicos)
// Persona Natural:  (P.Lista × 0.60) × 1.19
const DESCUENTO_BASE = 0.52;       // 100% - 48%
const DESCUENTO_EXTRA = 0.97;      // 100% - 3%
const FACTOR_PERSONA_NATURAL = 0.54;
const IVA = 1.19;

// IDs que NO llevan el descuento extra del 3% en precio negocio (caso 2)
const IDS_NEGOCIO_SIN_3 = new Set([
  'RR','RS','RÑ','RD','RZ','RX',
  'IG201','IG300','IG500','IG100','IG600','IG917','IG400',
  'EQ','EX','EG','EC',
  'R-AR','R-AS','R-AÑ','R-AD','R-AZ','R-AX',
  'TG500','TG01','TG100','TG600','TG300','TG200','TG400','TG201',
  '-B-G','-Q-X','-Q-G','-Q-C',
  '-O-G500','-O-G01','-O-G400','-O-G300','-O-G600','-O-G200','-O-G100','-O-G06'
]);

const BATCH_SIZE = 500;

const MODE_TEST = process.argv.includes('--test');
const MODE_EJECUTAR = process.argv.includes('--ejecutar');

if (!MODE_TEST && !MODE_EJECUTAR) {
  console.log(chalk.red('\n❌ Debes especificar: --test o --ejecutar\n'));
  process.exit(1);
}

console.log(chalk.blue.bold('\n💰 ENAR - Sync Precios por Tipo de Cliente\n'));
console.log(chalk.gray('   Mayorista:       (P.Lista × 52% × 97%) × 1.19'));
console.log(chalk.gray('   Negocio caso 1:  (P.Lista × 52% × 97%) × 1.19 (igual mayorista)'));
console.log(chalk.gray('   Negocio caso 2:  (P.Lista × 52%) × 1.19 (sin 3%, ' + IDS_NEGOCIO_SIN_3.size + ' IDs)'));
console.log(chalk.gray('   Persona Natural: (P.Lista × 54%) × 1.19\n'));

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

    const esSin3 = IDS_NEGOCIO_SIN_3.has(docSnap.id);

    // Mayorista: siempre con descuento base + extra 3%
    const nuevoMay = Math.round(pl * DESCUENTO_BASE * DESCUENTO_EXTRA * IVA);
    // Negocio: caso 2 (sin 3%) o caso 1 (con 3%, igual a mayorista)
    const nuevoNeg = esSin3
      ? Math.round(pl * DESCUENTO_BASE * IVA)
      : Math.round(pl * DESCUENTO_BASE * DESCUENTO_EXTRA * IVA);
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
      esSin3,
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
  const sin3Products = cambios.filter(c => c.esSin3);
  const normalProducts = cambios.filter(c => !c.esSin3);

  if (sin3Products.length > 0) {
    console.log(chalk.cyan.bold('IDs negocio sin 3% (' + sin3Products.length + '):'));
    sin3Products.forEach(c => {
      console.log(chalk.cyan('   ' + c.id + ' | lista: ' + c.precio_lista + ' → may: ' + c.updates.precio_mayorista + ' | neg: ' + c.updates.precio_negocio + ' (sin 3%) | nat: ' + c.updates.precio_persona_natural));
    });
    console.log('');
  }

  if (normalProducts.length > 0) {
    const mostrar = MODE_TEST ? normalProducts.slice(0, 15) : normalProducts.slice(0, 5);
    console.log(chalk.cyan.bold('Productos con neg=may (' + normalProducts.length + '):'));
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
