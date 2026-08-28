/**
 * ENAR - Actualización de precios Agosto 2026
 * Lee archivo Numbers/Excel con precios base, calcula precios derivados
 * y actualiza Firestore.
 *
 * Fórmulas (incremento sobre precio base, sin IVA):
 *   Mayorista:        precio_base × 1.30  (+30%)
 *   Negocio:          precio_base × 1.35  (+35%)
 *   Persona Natural:  precio_base × 1.40  (+40%)
 *   Nuevos:           precio_base × 1.45  (+45%)
 *
 * Excepción: SKUs que terminan en --KQ → 30% fijo en las 4 listas
 *
 * Uso:
 *   node actualizar-precios-08-2026.js --test                    (dry-run)
 *   node actualizar-precios-08-2026.js --test --csv              (dry-run + reporte CSV)
 *   node actualizar-precios-08-2026.js --ejecutar --csv          (aplica + reporte CSV)
 *   node actualizar-precios-08-2026.js --ejecutar --update-config (aplica + actualiza config listas)
 */

const admin = require('firebase-admin');
const XLSX = require('xlsx');
const chalk = require('chalk');
const cliProgress = require('cli-progress');
const fs = require('fs');
const path = require('path');

// ============================================
// CONFIGURACIÓN
// ============================================

const ARCHIVO_PRECIOS = path.join(__dirname, '..', 'Datos Lista precios-08-2026.numbers');

const FACTOR_MAYORISTA = 1.30;
const FACTOR_NEGOCIO = 1.35;
const FACTOR_PERSONA_NATURAL = 1.40;
const FACTOR_NUEVOS = 1.45;
const FACTOR_EXCEPCION = 1.30;

const SUFIJOS_EXCEPCION = ['--KQ'];
const BATCH_SIZE = 500;
const PRECIO_INVALIDO = -3;

// Mapeo de columnas del archivo
// Se buscan variantes comunes del nombre de columna
const COLUMNA_REFERENCIA = ['referencia', 'ref', 'cod_interno', 'codigo', 'código', 'sku'];
const COLUMNA_PRECIO_BASE = ['precio base', 'precio_base', 'precio', 'price', 'p_base', 'precio base '];

// ============================================
// ARGS
// ============================================

const MODE_TEST = process.argv.includes('--test');
const MODE_EJECUTAR = process.argv.includes('--ejecutar');
const MODE_CSV = process.argv.includes('--csv');
const MODE_UPDATE_CONFIG = process.argv.includes('--update-config');

if (!MODE_TEST && !MODE_EJECUTAR) {
  console.log(chalk.red('\n❌ Debes especificar: --test o --ejecutar'));
  console.log(chalk.gray('   Opciones adicionales: --csv --update-config\n'));
  process.exit(1);
}

console.log(chalk.blue.bold('\n💰 ENAR - Actualización de Precios Agosto 2026\n'));
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
// HELPERS
// ============================================

function esExcepcion(codInterno) {
  return SUFIJOS_EXCEPCION.some(suffix => codInterno.endsWith(suffix));
}

function encontrarColumna(headers, variantes) {
  for (const h of headers) {
    const norm = h.toLowerCase().trim();
    if (variantes.includes(norm)) return h;
  }
  return null;
}

function normalizarReferencia(ref) {
  return String(ref || '').trim().toUpperCase();
}

// ============================================
// LEER ARCHIVO
// ============================================

function leerArchivo() {
  if (!fs.existsSync(ARCHIVO_PRECIOS)) {
    console.error(chalk.red('❌ Archivo no encontrado: ' + ARCHIVO_PRECIOS));
    process.exit(1);
  }

  console.log(chalk.blue('📄 Leyendo archivo: ' + path.basename(ARCHIVO_PRECIOS)));
  const workbook = XLSX.readFile(ARCHIVO_PRECIOS);
  const sheetName = workbook.SheetNames[0];
  console.log(chalk.gray('   Hoja: ' + sheetName));

  const sheet = workbook.Sheets[sheetName];
  // Leer como array de arrays (sin headers automáticos)
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  console.log(chalk.gray('   Filas totales: ' + rawRows.length));

  if (rawRows.length < 3) {
    console.error(chalk.red('❌ El archivo no contiene suficientes datos'));
    process.exit(1);
  }

  // Detectar fila de headers reales buscando "Referencia" y "Precio base"
  let headerRowIdx = -1;
  let colRefIdx = -1;
  let colPrecioIdx = -1;

  for (let i = 0; i < Math.min(10, rawRows.length); i++) {
    const row = rawRows[i];
    for (let j = 0; j < row.length; j++) {
      const val = String(row[j] || '').toLowerCase().trim();
      if (COLUMNA_REFERENCIA.includes(val)) colRefIdx = j;
      if (COLUMNA_PRECIO_BASE.includes(val)) colPrecioIdx = j;
    }
    if (colRefIdx >= 0 && colPrecioIdx >= 0) {
      headerRowIdx = i;
      break;
    }
    colRefIdx = -1;
    colPrecioIdx = -1;
  }

  if (headerRowIdx < 0) {
    console.error(chalk.red('❌ No se encontraron columnas "Referencia" y "Precio base" en las primeras 10 filas.'));
    console.log(chalk.gray('   Primeras filas del archivo:'));
    for (let i = 0; i < Math.min(5, rawRows.length); i++) {
      console.log(chalk.gray('   Row ' + i + ': ' + JSON.stringify(rawRows[i])));
    }
    process.exit(1);
  }

  console.log(chalk.green('   ✅ Headers en fila ' + headerRowIdx + ': Referencia=[col ' + colRefIdx + '], Precio base=[col ' + colPrecioIdx + ']'));

  // Parsear datos (empezando desde la fila siguiente al header)
  const productos = [];
  let ignorados = 0;
  let sinReferencia = 0;

  for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    const ref = normalizarReferencia(row[colRefIdx]);
    if (!ref) {
      sinReferencia++;
      continue;
    }

    const precioRaw = parseFloat(String(row[colPrecioIdx]).replace(/[,$\s]/g, ''));
    if (isNaN(precioRaw)) {
      ignorados++;
      continue;
    }

    if (precioRaw === PRECIO_INVALIDO || precioRaw <= 0) {
      ignorados++;
      continue;
    }

    productos.push({
      referencia: ref,
      precio_base: precioRaw
    });
  }

  console.log(chalk.green('\n   ✅ Productos válidos: ' + productos.length));
  if (ignorados > 0) console.log(chalk.yellow('   ⚠️  Ignorados (precio inválido/-3/<=0): ' + ignorados));
  if (sinReferencia > 0) console.log(chalk.yellow('   ⚠️  Sin referencia: ' + sinReferencia));

  return productos;
}

// ============================================
// MAIN
// ============================================

async function main() {
  const startTime = Date.now();

  // 1. Leer archivo
  const productosArchivo = leerArchivo();

  // 2. Leer productos de Firestore
  console.log(chalk.blue.bold('\n📦 Leyendo productos de Firestore...\n'));
  const snap = await db.collection('productos').get();
  console.log(chalk.green('   ✅ ' + snap.size + ' productos en Firestore\n'));

  // Crear mapa por cod_interno (normalizado)
  const mapaFirestore = new Map();
  snap.forEach(docSnap => {
    const data = docSnap.data();
    const cod = normalizarReferencia(data.cod_interno);
    if (cod) {
      mapaFirestore.set(cod, { docSnap, data });
    }
  });

  // 3. Cruzar y calcular
  const cambios = [];
  const noEncontrados = [];

  for (const prod of productosArchivo) {
    const entry = mapaFirestore.get(prod.referencia);
    if (!entry) {
      noEncontrados.push(prod.referencia);
      continue;
    }

    const { docSnap, data } = entry;
    const pl = prod.precio_base;
    const codInterno = data.cod_interno || docSnap.id;
    const esExcep = esExcepcion(codInterno);

    const nuevoMay = Math.round(pl * (esExcep ? FACTOR_EXCEPCION : FACTOR_MAYORISTA));
    const nuevoNeg = Math.round(pl * (esExcep ? FACTOR_EXCEPCION : FACTOR_NEGOCIO));
    const nuevoNat = Math.round(pl * (esExcep ? FACTOR_EXCEPCION : FACTOR_PERSONA_NATURAL));
    const nuevoNuevos = Math.round(pl * (esExcep ? FACTOR_EXCEPCION : FACTOR_NUEVOS));

    cambios.push({
      id: docSnap.id,
      cod_interno: codInterno,
      titulo: data.titulo || docSnap.id,
      precio_base_archivo: pl,
      precio_lista_firestore: data.precio_lista || 0,
      esExcep,
      updates: {
        precio_lista: pl,
        precio_mayorista: nuevoMay,
        precio_negocio: nuevoNeg,
        precio_persona_natural: nuevoNat,
        precio_nuevos: nuevoNuevos
      },
      antes: {
        precio_lista: data.precio_lista || 0,
        precio_mayorista: Math.round(data.precio_mayorista || 0),
        precio_negocio: Math.round(data.precio_negocio || 0),
        precio_persona_natural: Math.round(data.precio_persona_natural || 0),
        precio_nuevos: Math.round(data.precio_nuevos || 0)
      }
    });
  }

  console.log(chalk.green('   ✅ Productos a actualizar: ' + cambios.length));
  if (noEncontrados.length > 0) {
    console.log(chalk.yellow('   ⚠️  No encontrados en Firestore: ' + noEncontrados.length));
    const preview = noEncontrados.slice(0, 20).join(', ');
    console.log(chalk.gray('      ' + preview + (noEncontrados.length > 20 ? ' ...' : '')));
  }
  console.log('');

  // Mostrar muestra
  const excepProducts = cambios.filter(c => c.esExcep);
  const normalProducts = cambios.filter(c => !c.esExcep);

  if (excepProducts.length > 0) {
    console.log(chalk.cyan.bold('SKUs excepción --KQ (' + excepProducts.length + '):'));
    excepProducts.slice(0, 10).forEach(c => {
      console.log(chalk.cyan('   ' + c.cod_interno + ' | base: ' + c.precio_base_archivo + ' → may: ' + c.updates.precio_mayorista + ' | neg: ' + c.updates.precio_negocio + ' | nat: ' + c.updates.precio_persona_natural + ' | nuev: ' + c.updates.precio_nuevos + ' (30% fijo)'));
    });
    console.log('');
  }

  if (normalProducts.length > 0) {
    const mostrar = MODE_TEST ? normalProducts.slice(0, 10) : normalProducts.slice(0, 5);
    console.log(chalk.cyan.bold('Productos normales (' + normalProducts.length + '):'));
    mostrar.forEach(c => {
      console.log(chalk.cyan('   ' + c.cod_interno + ' | base: ' + c.precio_base_archivo + ' → may: ' + c.updates.precio_mayorista + ' | neg: ' + c.updates.precio_negocio + ' | nat: ' + c.updates.precio_persona_natural + ' | nuev: ' + c.updates.precio_nuevos));
    });
    if (normalProducts.length > mostrar.length) {
      console.log(chalk.gray('   ... y ' + (normalProducts.length - mostrar.length) + ' más'));
    }
    console.log('');
  }

  // 4. Generar CSV de auditoría
  if (MODE_CSV) {
    const csvFile = path.join(__dirname, 'auditoria-precios-08-2026.csv');
    const csvHeader = 'cod_interno,titulo,precio_base_archivo,precio_lista_firestore,precio_mayorista_old,precio_mayorista_new,precio_negocio_old,precio_negocio_new,precio_persona_natural_old,precio_persona_natural_new,precio_nuevos_old,precio_nuevos_new,es_excepcion_KQ,estado';
    const csvRows = cambios.map(c => {
      const estado = c.precio_lista_firestore === c.precio_base_archivo ? 'sin_cambio_base' : 'actualizado';
      return [
        '"' + c.cod_interno + '"',
        '"' + (c.titulo || '').replace(/"/g, '""') + '"',
        c.precio_base_archivo,
        c.precio_lista_firestore,
        c.antes.precio_mayorista,
        c.updates.precio_mayorista,
        c.antes.precio_negocio,
        c.updates.precio_negocio,
        c.antes.precio_persona_natural,
        c.updates.precio_persona_natural,
        c.antes.precio_nuevos,
        c.updates.precio_nuevos,
        c.esExcep ? 'SI' : 'NO',
        estado
      ].join(',');
    });

    // Agregar no encontrados al CSV
    const csvNoEncontrados = noEncontrados.map(ref => {
      return ['"' + ref + '"', '""', '""', '""', '""', '""', '""', '""', '""', '""', '""', '""', '""', 'no_encontrado'].join(',');
    });

    const csvContent = csvHeader + '\n' + csvRows.join('\n') + '\n' + csvNoEncontrados.join('\n');
    fs.writeFileSync(csvFile, csvContent, 'utf8');
    console.log(chalk.green('📊 Reporte CSV generado: ' + csvFile));
    console.log(chalk.gray('   ' + cambios.length + ' productos + ' + noEncontrados.length + ' no encontrados\n'));
  }

  // 5. Aplicar cambios
  if (MODE_TEST) {
    console.log(chalk.yellow.bold('═══════════════════════════════════════'));
    console.log(chalk.yellow.bold('   DRY-RUN COMPLETADO — Sin cambios'));
    console.log(chalk.yellow.bold('═══════════════════════════════════════\n'));
    console.log(chalk.cyan('Para aplicar: node actualizar-precios-08-2026.js --ejecutar --csv\n'));
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

    // 6. Actualizar configuración de listas
    if (MODE_UPDATE_CONFIG) {
      console.log(chalk.blue('📋 Actualizando configuración de listas de precios...\n'));
      const listasConfig = {
        listas: [
          {
            id: 'mayorista',
            nombre: 'Mayorista',
            campo_firestore: 'precio_mayorista',
            incremento: 30,
            iva: 0,
            skus_excepcion: ['--KQ'],
            incremento_excepcion: 30,
            activa: true,
            sistema: true
          },
          {
            id: 'negocio',
            nombre: 'Negocio',
            campo_firestore: 'precio_negocio',
            incremento: 35,
            iva: 0,
            skus_excepcion: ['--KQ'],
            incremento_excepcion: 30,
            activa: true,
            sistema: true
          },
          {
            id: 'persona_natural',
            nombre: 'Persona Natural',
            campo_firestore: 'precio_persona_natural',
            incremento: 40,
            iva: 0,
            skus_excepcion: ['--KQ'],
            incremento_excepcion: 30,
            activa: true,
            sistema: true
          },
          {
            id: 'nuevos',
            nombre: 'Nuevos',
            campo_firestore: 'precio_nuevos',
            incremento: 45,
            iva: 0,
            skus_excepcion: ['--KQ'],
            incremento_excepcion: 30,
            activa: true,
            sistema: true
          }
        ]
      };

      await db.collection('configuracion').doc('listas_precios').set(listasConfig);
      console.log(chalk.green('   ✅ Configuración de listas actualizada en Firestore\n'));
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(chalk.gray('⏱️  Tiempo: ' + elapsed + 's\n'));
}

main().catch(e => { console.error(chalk.red('❌ ' + e.message)); process.exit(1); });
