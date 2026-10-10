/**
 * ENAR - Normalización de los 16 productos con esquema PVP de proveedor
 * ====================================================================
 *
 * Estos 16 productos tienen `precio_lista` cargado como PRECIO DE LISTA DEL
 * PROVEEDOR (PVP), no como costo base. Sus precios por lista se calcularon con
 * una cadena de descuentos:
 *
 *   precio_mayorista = PVP × 0,97 × 0,40 × 1,19 × 1,30
 *                            └3%┘  └60%┘  └IVA┘ └margen┘
 *
 * El resto del catálogo (1.718 productos) usa `precio_lista` como costo base
 * sin IVA. Este script alinea los 16 al mismo esquema:
 *
 *   precio_pvp_proveedor = precio_lista (valor actual, se conserva)
 *   precio_lista         = round(precio_pvp_proveedor × 0,388)
 *
 * Tras la normalización, la fórmula estándar del panel con `iva: 19`
 * reproduce el `precio_mayorista` actual al peso, porque es la misma cadena
 * reagrupada:
 *
 *   hoy:         PVP × 0,97 × 0,40 × 1,19 × 1,30
 *   normalizado: (PVP × 0,388) × 1,30 × 1,19      ← idéntico
 *
 * NO toca precio_mayorista, precio_negocio, precio_persona_natural ni
 * precio_nuevos. Eso lo hace el paso 5 del plan con todo el catálogo, desde
 * el panel admin.
 *
 * Ver docs/plan-iva-19.md, paso 3.
 *
 * Uso:
 *   node normalizar-pvp-proveedor.js --test       (dry-run, no escribe)
 *   node normalizar-pvp-proveedor.js --ejecutar   (aplica en una transacción)
 */

const admin = require('firebase-admin');
const chalk = require('chalk');

// ============================================
// CONFIGURACIÓN
// ============================================

// 0,97 (−3%) × 0,40 (−60%) = 0,388
const FACTOR_NORMALIZACION = 0.388;

// Factor esperado de precio_mayorista / precio_lista en el esquema PVP:
// 0,97 × 0,40 × 1,19 × 1,30
const FACTOR_PVP_MAYORISTA = 0.97 * 0.40 * 1.19 * 1.30; // 0,600236
const TOLERANCIA = 0.0005;

// Los 16 productos del esquema PVP: 9 activos + 7 inactivos
const CODIGOS = [
  // activos
  '--DC01', '--DG503', '-O-G06', '-Ñ-G910', 'ET', 'JT300', 'QT', 'UT', 'ZG5',
  // inactivos
  '-YX01', '-YX901', 'P1', 'P80', 'ST-R', 'ÑC907', 'ÑG619'
];

const CAMPOS_LISTA = [
  'precio_mayorista', 'precio_negocio', 'precio_persona_natural', 'precio_nuevos'
];

// ============================================
// ARGS
// ============================================

const MODE_TEST = process.argv.includes('--test');
const MODE_EJECUTAR = process.argv.includes('--ejecutar');

if (!MODE_TEST && !MODE_EJECUTAR) {
  console.log(chalk.red('\n❌ Debes especificar: --test o --ejecutar\n'));
  process.exit(1);
}

// ============================================
// INICIALIZAR FIREBASE
// ============================================

try {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'enar-b2b'
  });
} catch (error) {
  console.error(chalk.red('❌ Error inicializando Firebase: ' + error.message));
  process.exit(1);
}

const db = admin.firestore();

// ============================================
// UTILIDADES
// ============================================

function fmt(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('es-CO', { maximumFractionDigits: 4 });
}

function imprimirDoc(etiqueta, cod, data) {
  console.log(chalk.gray(`    ${etiqueta}  ${cod}`));
  console.log(chalk.gray(`      precio_pvp_proveedor   = ${fmt(data.precio_pvp_proveedor)}`));
  console.log(chalk.gray(`      precio_lista           = ${fmt(data.precio_lista)}`));
  for (const campo of CAMPOS_LISTA) {
    console.log(chalk.gray(`      ${campo.padEnd(22)} = ${fmt(data[campo])}`));
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log(chalk.blue.bold('\n═══ Normalización de productos con esquema PVP de proveedor ═══\n'));
  console.log(chalk.gray(`  Factor de normalización: × ${FACTOR_NORMALIZACION}  (0,97 × 0,40)`));
  console.log(chalk.gray(`  Modo: ${MODE_EJECUTAR ? 'EJECUTAR (escribe)' : 'TEST (dry-run)'}\n`));

  const refs = CODIGOS.map(cod => db.collection('productos').doc(cod));

  // ── Validación previa, fuera de la transacción ──
  const snaps = await db.getAll(...refs);
  const problemas = [];
  const plan = [];

  snaps.forEach((snap, i) => {
    const cod = CODIGOS[i];

    if (!snap.exists) {
      problemas.push(`${cod}: el documento no existe`);
      return;
    }

    const d = snap.data();

    // Ya normalizado: abortar en vez de volver a multiplicar
    if (d.precio_pvp_proveedor !== undefined) {
      problemas.push(`${cod}: ya tiene precio_pvp_proveedor (${fmt(d.precio_pvp_proveedor)}) — ya fue normalizado`);
      return;
    }

    const pvp = d.precio_lista;
    if (!pvp || pvp <= 0) {
      problemas.push(`${cod}: precio_lista ausente o cero (${fmt(pvp)})`);
      return;
    }

    // Verificar que de verdad sigue el esquema PVP antes de tocarlo
    const may = d.precio_mayorista;
    if (!may || may <= 0) {
      problemas.push(`${cod}: precio_mayorista ausente, no se puede verificar el esquema`);
      return;
    }
    const razon = may / pvp;
    if (Math.abs(razon - FACTOR_PVP_MAYORISTA) > TOLERANCIA) {
      problemas.push(
        `${cod}: no sigue el esquema PVP — precio_mayorista/precio_lista = ${razon.toFixed(6)}, ` +
        `se esperaba ${FACTOR_PVP_MAYORISTA.toFixed(6)} ±${TOLERANCIA}`
      );
      return;
    }

    plan.push({
      cod,
      titulo: d.titulo || '',
      activo: d.activo,
      antes: d,
      pvp,
      precioListaNuevo: Math.round(pvp * FACTOR_NORMALIZACION)
    });
  });

  // ── Abortar si algo no cuadra ──
  if (problemas.length > 0) {
    console.log(chalk.red.bold(`  ✖ ABORTADO: ${problemas.length} problema(s), no se escribe nada\n`));
    problemas.forEach(p => console.log(chalk.red(`    · ${p}`)));
    console.log('');
    process.exit(1);
  }

  if (plan.length !== CODIGOS.length) {
    console.log(chalk.red.bold(`\n  ✖ ABORTADO: se esperaban ${CODIGOS.length} productos y hay ${plan.length}\n`));
    process.exit(1);
  }

  // ── ANTES ──
  console.log(chalk.yellow.bold('  ─── ANTES ───\n'));
  plan.forEach(p => {
    console.log(chalk.cyan(`  ${p.cod}  "${String(p.titulo).slice(0, 44)}"  activo=${p.activo}`));
    imprimirDoc('actual', p.cod, p.antes);
    console.log(chalk.white(
      `      → precio_lista pasará de ${fmt(p.pvp)} a ${fmt(p.precioListaNuevo)}  ` +
      `(× ${FACTOR_NORMALIZACION})`
    ));
    console.log('');
  });

  if (MODE_TEST) {
    console.log(chalk.yellow.bold(`  DRY-RUN: no se escribió nada. ${plan.length} productos listos para normalizar.`));
    console.log(chalk.gray('  Para aplicar: node normalizar-pvp-proveedor.js --ejecutar\n'));
    process.exit(0);
  }

  // ── TRANSACCIÓN ──
  console.log(chalk.blue.bold('  ─── ESCRIBIENDO (transacción) ───\n'));

  await db.runTransaction(async (tx) => {
    // Releer dentro de la transacción para garantizar consistencia
    const txSnaps = await tx.getAll(...refs);

    txSnaps.forEach((snap, i) => {
      const cod = CODIGOS[i];
      if (!snap.exists) throw new Error(`${cod}: desapareció durante la transacción`);
      const d = snap.data();
      if (d.precio_pvp_proveedor !== undefined) {
        throw new Error(`${cod}: ya tiene precio_pvp_proveedor, otro proceso lo normalizó`);
      }
      const pvp = d.precio_lista;
      if (!pvp || pvp <= 0) throw new Error(`${cod}: precio_lista inválido durante la transacción`);

      const razon = (d.precio_mayorista || 0) / pvp;
      if (Math.abs(razon - FACTOR_PVP_MAYORISTA) > TOLERANCIA) {
        throw new Error(`${cod}: dejó de cumplir el esquema PVP durante la transacción (razón ${razon.toFixed(6)})`);
      }

      // Solo estos dos campos. Los precios por lista NO se tocan.
      tx.update(snap.ref, {
        precio_pvp_proveedor: pvp,
        precio_lista: Math.round(pvp * FACTOR_NORMALIZACION),
        normalizado_pvp_en: new Date().toISOString()
      });
    });
  });

  console.log(chalk.green.bold(`  ✅ Transacción confirmada: ${plan.length} productos normalizados\n`));

  // ── DESPUÉS ──
  console.log(chalk.yellow.bold('  ─── DESPUÉS ───\n'));
  const despues = await db.getAll(...refs);
  despues.forEach((snap, i) => {
    const cod = CODIGOS[i];
    const d = snap.data();
    const esperado = Math.round(d.precio_pvp_proveedor * FACTOR_NORMALIZACION);
    const ok = d.precio_lista === esperado;
    console.log(chalk[ok ? 'cyan' : 'red'](`  ${cod}  ${ok ? '✓' : '✖ NO CUADRA'}`));
    imprimirDoc('nuevo', cod, d);
    console.log('');
  });

  console.log(chalk.gray('  Los precios por lista no se modificaron. El recálculo con IVA 19%'));
  console.log(chalk.gray('  es el paso 5 del plan, desde el panel admin → pestaña Listas.\n'));
}

main().catch(e => {
  console.error(chalk.red.bold('\n❌ ' + e.message));
  console.error(chalk.yellow('   La transacción se revirtió; no se escribió nada.\n'));
  process.exit(1);
});
