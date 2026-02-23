/**
 * ENAR CRM - Script de Migración
 * Migra datos de Google Sheets a Firebase Firestore
 *
 * Uso:
 *   node migrate.js --test          (testing con 100 registros)
 *   node migrate.js --clientes      (solo clientes)
 *   node migrate.js --productos     (solo productos)
 *   node migrate.js --ordenes       (solo órdenes)
 *   node migrate.js --full          (migración completa)
 */

const admin = require('firebase-admin');
const { google } = require('googleapis');
const cliProgress = require('cli-progress');
const chalk = require('chalk');

// ============================================
// CONFIGURACIÓN
// ============================================

const SPREADSHEET_ID = '1a-cy3_OSegXeDwEmud7V3SRDlht4S8OAOblg74bPhMw';
const MODE_TEST = process.argv.includes('--test');
const MODE_CLIENTES = process.argv.includes('--clientes');
const MODE_PRODUCTOS = process.argv.includes('--productos');
const MODE_ORDENES = process.argv.includes('--ordenes');
const MODE_FULL = process.argv.includes('--full');

const TEST_LIMIT = 100; // Límite para modo testing

console.log(chalk.blue.bold('\n🚀 ENAR CRM - Migración Sheets → Firestore\n'));

if (MODE_TEST) {
  console.log(chalk.yellow('⚠️  MODO TESTING - Solo primeros ' + TEST_LIMIT + ' registros\n'));
}

// ============================================
// INICIALIZAR FIREBASE
// ============================================

try {
  const serviceAccount = require('../credentials/firebase-admin-key.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log(chalk.green('✅ Firebase Admin inicializado\n'));
} catch (error) {
  console.error(chalk.red('❌ Error cargando credenciales Firebase:'));
  console.error(chalk.red('   Archivo: ../credentials/firebase-admin-key.json'));
  console.error(chalk.red('   Error: ' + error.message));
  console.log(chalk.yellow('\n💡 Descarga las credenciales desde:'));
  console.log(chalk.cyan('   https://console.firebase.google.com/project/enar-b2b/settings/serviceaccounts\n'));
  process.exit(1);
}

const db = admin.firestore();

// ============================================
// INICIALIZAR GOOGLE SHEETS API
// ============================================

let sheets;
try {
  const auth = new google.auth.GoogleAuth({
    keyFile: '../credentials/sheets-api-key.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });
  sheets = google.sheets({ version: 'v4', auth });
  console.log(chalk.green('✅ Google Sheets API inicializada\n'));
} catch (error) {
  console.error(chalk.red('❌ Error cargando credenciales Sheets API:'));
  console.error(chalk.red('   Archivo: ../credentials/sheets-api-key.json'));
  console.error(chalk.red('   Error: ' + error.message));
  console.log(chalk.yellow('\n💡 Crea una cuenta de servicio y descarga las credenciales desde:'));
  console.log(chalk.cyan('   https://console.cloud.google.com/apis/credentials?project=enar-b2b\n'));
  process.exit(1);
}

// ============================================
// FUNCIONES HELPER
// ============================================

function mapEstado(estadoSheets) {
  const map = {
    'Pendiente': 'pendiente',
    'Aprobada': 'aprobada',
    'En_Proceso': 'en_proceso',
    'En_Espera': 'en_espera',
    'Completada': 'completada',
    'Cancelada': 'cancelada'
  };
  return map[estadoSheets] || 'pendiente';
}

function parseFecha(fechaStr) {
  if (!fechaStr) return null;
  try {
    const fecha = new Date(fechaStr);
    if (isNaN(fecha.getTime())) return null;
    return admin.firestore.Timestamp.fromDate(fecha);
  } catch {
    return null;
  }
}

function crearPassword() {
  // Generar password temporal aleatorio
  return 'ENAR' + Math.random().toString(36).slice(-8).toUpperCase() + '!';
}

// ============================================
// MIGRACIÓN DE CLIENTES
// ============================================

async function migrarClientes() {
  console.log(chalk.blue.bold('📊 MIGRANDO CLIENTES\n'));

  const progressBar = new cliProgress.SingleBar({
    format: 'Progreso |' + chalk.cyan('{bar}') + '| {percentage}% || {value}/{total} clientes',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  });

  try {
    // Leer hoja Clientes
    console.log('📖 Leyendo hoja "Clientes"...');
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Clientes!A4:O' // Hasta columna O (Dirección)
    });

    let rows = response.data.values || [];
    console.log(chalk.green(`✅ ${rows.length} clientes encontrados\n`));

    if (MODE_TEST) {
      rows = rows.slice(0, TEST_LIMIT);
      console.log(chalk.yellow(`⚠️  Limitando a ${rows.length} clientes (modo test)\n`));
    }

    progressBar.start(rows.length, 0);

    let migrados = 0;
    let errores = 0;
    const erroresDetalle = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const [
        ID_Cliente, Nombre, Email, Teléfono, Ubicación, Tipo,
        Vendedor_Asignado, Fecha_Primer_Compra, Nombre_Comercial,
        Lista_Precio, Url_Ubicación, Ruta, Segmento, Canal_Captacion,
        Direccion
      ] = row;

      if (!ID_Cliente || !Nombre) {
        errores++;
        continue;
      }

      try {
        // Verificar si el email es válido
        const emailFinal = Email && Email.includes('@') ? Email : `cliente_${ID_Cliente}@enar-temporal.com`;

        // Buscar o crear usuario en Firebase Auth
        let uid;
        try {
          const userRecord = await admin.auth().getUserByEmail(emailFinal);
          uid = userRecord.uid;
        } catch (error) {
          // Usuario no existe, crearlo
          const newUser = await admin.auth().createUser({
            email: emailFinal,
            password: crearPassword(),
            displayName: Nombre,
            disabled: false
          });
          uid = newUser.uid;
        }

        // Crear/actualizar documento en Firestore
        await db.collection('usuarios').doc(uid).set({
          email: emailFinal,
          nombre: Nombre,
          nit: ID_Cliente,
          telefono: Teléfono || '',
          ubicacion: Ubicación || '',
          direccion: Direccion || '',
          tipo_cliente: Tipo || 'Sin Clasificar',
          estado: 'aprobado',
          limite_credito: 5000000,
          descuento_adicional: 0,
          plazo_pago: 30,
          lista_precios: Lista_Precio || 'L1',
          ruta: Ruta || '',
          segmento: Segmento || '',
          canal_captacion: Canal_Captacion || '',
          nombre_comercial: Nombre_Comercial || Nombre,
          url_ubicacion: Url_Ubicación || '',
          creado_por: Vendedor_Asignado || 'admin@360conia.com',
          created_at: admin.firestore.FieldValue.serverTimestamp(),
          migrated_from_sheets: true,
          sheets_id_cliente: ID_Cliente
        }, { merge: true });

        migrados++;
      } catch (error) {
        errores++;
        erroresDetalle.push({
          cliente: Nombre,
          id: ID_Cliente,
          error: error.message
        });
      }

      progressBar.update(i + 1);
    }

    progressBar.stop();

    console.log('\n');
    console.log(chalk.green.bold(`✅ Migración de clientes completada:`));
    console.log(chalk.green(`   • Migrados: ${migrados}`));
    if (errores > 0) {
      console.log(chalk.red(`   • Errores: ${errores}`));
      if (erroresDetalle.length > 0 && erroresDetalle.length <= 10) {
        console.log(chalk.yellow('\nPrimeros errores:'));
        erroresDetalle.slice(0, 10).forEach(e => {
          console.log(chalk.yellow(`   - ${e.cliente} (${e.id}): ${e.error}`));
        });
      }
    }
    console.log('\n');

    return { migrados, errores };

  } catch (error) {
    progressBar.stop();
    console.error(chalk.red('\n❌ Error en migrarClientes:'), error);
    throw error;
  }
}

// ============================================
// ACTUALIZAR PRODUCTOS
// ============================================

async function actualizarProductos() {
  console.log(chalk.blue.bold('📦 ACTUALIZANDO PRODUCTOS\n'));

  const progressBar = new cliProgress.SingleBar({
    format: 'Progreso |' + chalk.cyan('{bar}') + '| {percentage}% || {value}/{total} productos',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  });

  try {
    console.log('📖 Leyendo hoja "Productos"...');
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Productos!A4:X'
    });

    let rows = response.data.values || [];
    console.log(chalk.green(`✅ ${rows.length} productos encontrados\n`));

    if (MODE_TEST) {
      rows = rows.slice(0, TEST_LIMIT);
      console.log(chalk.yellow(`⚠️  Limitando a ${rows.length} productos (modo test)\n`));
    }

    progressBar.start(rows.length, 0);

    let actualizados = 0;
    let noEncontrados = 0;
    let errores = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const [
        ID_Producto, Nombre_Producto, Categoría, Precio_L1, Precio_L4,
        Precio_L7, Precio_L8, Precio_L9, Precio_L10, Precio_Real,
        Stock_Actual, Días_Inventario, Estado_Stock, Stock_Mínimo,
        Clasificación_ABC, Productos_TOP, Etiqueta_Maestra, Ficha_Técnica,
        Descripción_Corta, EAN, Estado, Imag_Principal, Peso_Kg, Orden_Cargue
      ] = row;

      if (!ID_Producto) continue;

      try {
        // Buscar producto en Firestore por SKU
        const productosSnap = await db.collection('productos')
          .where('SKU', '==', ID_Producto)
          .limit(1)
          .get();

        if (productosSnap.empty) {
          noEncontrados++;
          progressBar.update(i + 1);
          continue;
        }

        const docRef = productosSnap.docs[0].ref;

        // Actualizar con datos del CRM
        await docRef.update({
          Precio_L1: parseFloat(Precio_L1) || 0,
          Precio_L4: parseFloat(Precio_L4) || 0,
          Precio_L7: parseFloat(Precio_L7) || 0,
          Precio_L8: parseFloat(Precio_L8) || 0,
          Precio_L9: parseFloat(Precio_L9) || 0,
          Precio_L10: parseFloat(Precio_L10) || 0,
          Stock_Actual: parseInt(Stock_Actual) || 0,
          Stock_Minimo: parseInt(Stock_Mínimo) || 0,
          Dias_Inventario: parseInt(Días_Inventario) || 0,
          Estado_Stock: Estado_Stock || '',
          Clasificacion_ABC: Clasificación_ABC || '',
          Producto_TOP: Productos_TOP === 'SI',
          Peso_Kg: parseFloat(Peso_Kg) || 0,
          Orden_Cargue: parseInt(Orden_Cargue) || 0,
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        });

        actualizados++;
      } catch (error) {
        errores++;
      }

      progressBar.update(i + 1);
    }

    progressBar.stop();

    console.log('\n');
    console.log(chalk.green.bold(`✅ Actualización de productos completada:`));
    console.log(chalk.green(`   • Actualizados: ${actualizados}`));
    if (noEncontrados > 0) {
      console.log(chalk.yellow(`   • No encontrados en Firestore: ${noEncontrados}`));
    }
    if (errores > 0) {
      console.log(chalk.red(`   • Errores: ${errores}`));
    }
    console.log('\n');

    return { actualizados, noEncontrados, errores };

  } catch (error) {
    progressBar.stop();
    console.error(chalk.red('\n❌ Error en actualizarProductos:'), error);
    throw error;
  }
}

// ============================================
// MIGRAR ÓRDENES
// ============================================

async function migrarOrdenes() {
  console.log(chalk.blue.bold('📋 MIGRANDO ÓRDENES\n'));

  const progressBar = new cliProgress.SingleBar({
    format: 'Progreso |' + chalk.cyan('{bar}') + '| {percentage}% || {value}/{total} órdenes',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  });

  try {
    console.log('📖 Leyendo hoja "Órdenes_Compra"...');
    const responseOrdenes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Órdenes_Compra!A4:L'
    });

    let rowsOrdenes = responseOrdenes.data.values || [];
    console.log(chalk.green(`✅ ${rowsOrdenes.length} órdenes encontradas`));

    console.log('📖 Leyendo hoja "Detalle_Órdenes"...');
    const responseDetalle = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Detalle_Órdenes!A4:J'
    });

    const rowsDetalle = responseDetalle.data.values || [];
    console.log(chalk.green(`✅ ${rowsDetalle.length} items encontrados\n`));

    // Crear índice de detalles por ID_Orden
    const detallesPorOrden = {};
    for (const detRow of rowsDetalle) {
      const [ID_Orden, ID_Producto, Nombre_Producto, Cantidad, Precio_Unitario, Subtotal] = detRow;
      if (!detallesPorOrden[ID_Orden]) {
        detallesPorOrden[ID_Orden] = [];
      }
      detallesPorOrden[ID_Orden].push({
        sku: ID_Producto,
        nombre: Nombre_Producto,
        cantidad: parseInt(Cantidad) || 0,
        precio_unitario: parseFloat(Precio_Unitario) || 0,
        subtotal: parseFloat(Subtotal) || 0
      });
    }

    if (MODE_TEST) {
      rowsOrdenes = rowsOrdenes.slice(0, TEST_LIMIT);
      console.log(chalk.yellow(`⚠️  Limitando a ${rowsOrdenes.length} órdenes (modo test)\n`));
    }

    progressBar.start(rowsOrdenes.length, 0);

    let migradas = 0;
    let errores = 0;
    const erroresDetalle = [];

    for (let i = 0; i < rowsOrdenes.length; i++) {
      const row = rowsOrdenes[i];
      const [
        ID_Orden, Fecha_Creación, ID_Cliente, Nombre_Cliente, Creado_Por,
        Estado, Total_Orden, Fecha_Entrega_Estimada, Observaciones,
        Notas_Estado, Última_Actualización, CSV_Generado
      ] = row;

      if (!ID_Orden) continue;

      try {
        // Buscar UID del cliente en Firestore
        const usuariosSnap = await db.collection('usuarios')
          .where('sheets_id_cliente', '==', ID_Cliente)
          .limit(1)
          .get();

        if (usuariosSnap.empty) {
          errores++;
          erroresDetalle.push({
            orden: ID_Orden,
            error: `Cliente ${ID_Cliente} no encontrado`
          });
          progressBar.update(i + 1);
          continue;
        }

        const userId = usuariosSnap.docs[0].id;
        const items = detallesPorOrden[ID_Orden] || [];

        // Calcular totales
        const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
        const iva = subtotal * 0.19;
        const total = subtotal + iva;

        // Crear documento de orden
        await db.collection('ordenes').add({
          numero_orden: ID_Orden,
          user_id: userId,
          items: items,
          subtotal: Math.round(subtotal),
          iva: Math.round(iva),
          total: parseFloat(Total_Orden) || Math.round(total),
          estado: mapEstado(Estado),
          created_at: parseFecha(Fecha_Creación) || admin.firestore.FieldValue.serverTimestamp(),
          fecha_entrega_estimada: parseFecha(Fecha_Entrega_Estimada),
          observaciones: Observaciones || '',
          notas_estado: Notas_Estado || '',
          creado_por: Creado_Por || 'admin@360conia.com',
          csv_generado: CSV_Generado === 'SI',
          csv_url: null,
          migrated_from_sheets: true
        });

        migradas++;
      } catch (error) {
        errores++;
        erroresDetalle.push({
          orden: ID_Orden,
          error: error.message
        });
      }

      progressBar.update(i + 1);
    }

    progressBar.stop();

    console.log('\n');
    console.log(chalk.green.bold(`✅ Migración de órdenes completada:`));
    console.log(chalk.green(`   • Migradas: ${migradas}`));
    if (errores > 0) {
      console.log(chalk.red(`   • Errores: ${errores}`));
      if (erroresDetalle.length > 0 && erroresDetalle.length <= 10) {
        console.log(chalk.yellow('\nPrimeros errores:'));
        erroresDetalle.slice(0, 10).forEach(e => {
          console.log(chalk.yellow(`   - Orden ${e.orden}: ${e.error}`));
        });
      }
    }
    console.log('\n');

    return { migradas, errores };

  } catch (error) {
    progressBar.stop();
    console.error(chalk.red('\n❌ Error en migrarOrdenes:'), error);
    throw error;
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  const startTime = Date.now();

  try {
    let resultados = {};

    if (MODE_CLIENTES || MODE_FULL || (!MODE_CLIENTES && !MODE_PRODUCTOS && !MODE_ORDENES && !MODE_FULL)) {
      resultados.clientes = await migrarClientes();
    }

    if (MODE_PRODUCTOS || MODE_FULL) {
      resultados.productos = await actualizarProductos();
    }

    if (MODE_ORDENES || MODE_FULL) {
      resultados.ordenes = await migrarOrdenes();
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);

    console.log(chalk.green.bold('═══════════════════════════════════════'));
    console.log(chalk.green.bold('   ✅ MIGRACIÓN COMPLETADA'));
    console.log(chalk.green.bold('═══════════════════════════════════════\n'));

    if (resultados.clientes) {
      console.log(chalk.cyan(`📊 Clientes: ${resultados.clientes.migrados} migrados, ${resultados.clientes.errores} errores`));
    }
    if (resultados.productos) {
      console.log(chalk.cyan(`📦 Productos: ${resultados.productos.actualizados} actualizados, ${resultados.productos.noEncontrados} no encontrados`));
    }
    if (resultados.ordenes) {
      console.log(chalk.cyan(`📋 Órdenes: ${resultados.ordenes.migradas} migradas, ${resultados.ordenes.errores} errores`));
    }

    console.log(chalk.cyan(`\n⏱️  Tiempo total: ${elapsed}s\n`));

    if (MODE_TEST) {
      console.log(chalk.yellow.bold('⚠️  MODO TESTING - Para migración completa ejecuta:'));
      console.log(chalk.cyan('   node migrate.js --full\n'));
    }

  } catch (error) {
    console.error(chalk.red.bold('\n❌ ERROR CRÍTICO EN MIGRACIÓN:'));
    console.error(chalk.red(error.message));
    console.error(error.stack);
    process.exit(1);
  }

  process.exit(0);
}

// Ejecutar
main();
