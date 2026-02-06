// ============================================
// UTILIDADES Y FUNCIONES AUXILIARES
// ============================================
// Archivo: Utils.gs
// Descripción: Funciones de utilidad, triggers,
//              pruebas de conexión y debug
// ============================================

/**
 * Crea un trigger para ejecutar la sincronización automáticamente cada hora
 * Elimina triggers existentes antes de crear uno nuevo
 */
function crearTriggerSincronizacionHoraria() {
  Logger.log("Configurando trigger de sincronización horaria...");

  // Eliminar triggers existentes para esta función
  eliminarTriggersExistentes('sincronizarProductosAFirestore');

  // Crear nuevo trigger horario
  ScriptApp.newTrigger('sincronizarProductosAFirestore')
    .timeBased()
    .everyHours(1)
    .create();

  Logger.log("Trigger horario creado exitosamente");
  Logger.log("La sincronización se ejecutará automáticamente cada hora");
}

/**
 * Crea un trigger para sincronización diaria a una hora específica
 * @param {number} hora - Hora del día (0-23) para ejecutar
 */
function crearTriggerSincronizacionDiaria(hora) {
  const horaEjecucion = hora || 6; // Default: 6 AM

  Logger.log(`Configurando trigger de sincronización diaria a las ${horaEjecucion}:00...`);

  eliminarTriggersExistentes('sincronizarProductosAFirestore');

  ScriptApp.newTrigger('sincronizarProductosAFirestore')
    .timeBased()
    .atHour(horaEjecucion)
    .everyDays(1)
    .create();

  Logger.log(`Trigger diario creado para las ${horaEjecucion}:00`);
}

/**
 * Elimina todos los triggers existentes para una función específica
 * @param {string} nombreFuncion - Nombre de la función
 */
function eliminarTriggersExistentes(nombreFuncion) {
  const triggers = ScriptApp.getProjectTriggers();
  let eliminados = 0;

  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === nombreFuncion) {
      ScriptApp.deleteTrigger(trigger);
      eliminados++;
    }
  });

  if (eliminados > 0) {
    Logger.log(`Se eliminaron ${eliminados} triggers existentes para ${nombreFuncion}`);
  }
}

/**
 * Lista todos los triggers del proyecto
 */
function listarTriggers() {
  const triggers = ScriptApp.getProjectTriggers();

  Logger.log("=== TRIGGERS DEL PROYECTO ===");

  if (triggers.length === 0) {
    Logger.log("No hay triggers configurados");
    return;
  }

  triggers.forEach((trigger, index) => {
    Logger.log(`\n${index + 1}. Función: ${trigger.getHandlerFunction()}`);
    Logger.log(`   Tipo: ${trigger.getEventType()}`);
    Logger.log(`   ID: ${trigger.getUniqueId()}`);
  });
}

/**
 * Elimina todos los triggers del proyecto
 * Usar con precaución
 */
function eliminarTodosLosTriggers() {
  const triggers = ScriptApp.getProjectTriggers();

  triggers.forEach(trigger => {
    ScriptApp.deleteTrigger(trigger);
  });

  Logger.log(`Se eliminaron ${triggers.length} triggers`);
}

// ============================================
// PRUEBAS DE CONEXIÓN
// ============================================

/**
 * Prueba básica de conexión a Firestore
 * Intenta obtener el documento de configuración
 */
function probarConexionFirestore() {
  Logger.log("=== PRUEBA DE CONEXIÓN A FIRESTORE ===\n");

  try {
    const url = `${FIRESTORE_URL}/${COLECCIONES.configuracion}/${DOC_CONFIGURACION_GENERAL}`;

    const options = {
      method: 'get',
      headers: {
        'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()
      },
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();

    if (code === 200) {
      Logger.log("CONEXIÓN EXITOSA");
      Logger.log("El documento de configuración existe");
      const data = JSON.parse(response.getContentText());
      Logger.log("Campos del documento: " + Object.keys(data.fields || {}).join(", "));
    } else if (code === 404) {
      Logger.log("CONEXIÓN EXITOSA (documento no existe)");
      Logger.log("Firestore está accesible, pero el documento configuracion/general no existe");
      Logger.log("Se creará automáticamente en la primera sincronización");
    } else {
      Logger.log(`ERROR DE CONEXIÓN - HTTP ${code}`);
      Logger.log("Respuesta: " + response.getContentText());
    }

  } catch (error) {
    Logger.log("ERROR DE CONEXIÓN");
    Logger.log("Mensaje: " + error.message);
  }

  Logger.log("\n=== FIN DE PRUEBA ===");
}

/**
 * Prueba detallada de conexión con información de debug
 * Muestra toda la información relevante para diagnóstico
 */
function probarConexionDetallada() {
  Logger.log("╔══════════════════════════════════════════╗");
  Logger.log("║  PRUEBA DETALLADA DE CONEXIÓN FIRESTORE  ║");
  Logger.log("╚══════════════════════════════════════════╝\n");

  // 1. Información de configuración
  Logger.log("[1] CONFIGURACIÓN");
  Logger.log("─────────────────────────────────────────");
  Logger.log("Project ID: " + FIREBASE_CONFIG.projectId);
  Logger.log("API Key (primeros 10 chars): " + FIREBASE_CONFIG.apiKey.substring(0, 10) + "...");
  Logger.log("Nombre de hoja: " + NOMBRE_HOJA);
  Logger.log("");

  // 2. URL de Firestore
  Logger.log("[2] URL DE FIRESTORE");
  Logger.log("─────────────────────────────────────────");
  Logger.log("Base URL: " + FIRESTORE_URL);
  const urlTest = `${FIRESTORE_URL}/${COLECCIONES.configuracion}/${DOC_CONFIGURACION_GENERAL}`;
  Logger.log("URL de prueba: " + urlTest);
  Logger.log("");

  // 3. Token OAuth
  Logger.log("[3] AUTENTICACIÓN OAUTH");
  Logger.log("─────────────────────────────────────────");
  try {
    const token = ScriptApp.getOAuthToken();
    if (token) {
      Logger.log("Token OAuth: OBTENIDO");
      Logger.log("Longitud del token: " + token.length + " caracteres");
      Logger.log("Primeros 20 chars: " + token.substring(0, 20) + "...");
    } else {
      Logger.log("Token OAuth: NO OBTENIDO");
      Logger.log("Verifica los scopes en appsscript.json");
    }
  } catch (error) {
    Logger.log("ERROR obteniendo token: " + error.message);
  }
  Logger.log("");

  // 4. Prueba de conexión
  Logger.log("[4] PRUEBA DE CONEXIÓN HTTP");
  Logger.log("─────────────────────────────────────────");
  try {
    const options = {
      method: 'get',
      headers: {
        'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()
      },
      muteHttpExceptions: true
    };

    Logger.log("Enviando petición GET...");
    const startTime = new Date();
    const response = UrlFetchApp.fetch(urlTest, options);
    const endTime = new Date();
    const duration = endTime - startTime;

    const code = response.getResponseCode();
    const content = response.getContentText();

    Logger.log("Código de respuesta: " + code);
    Logger.log("Tiempo de respuesta: " + duration + "ms");
    Logger.log("");

    // Interpretar código de respuesta
    Logger.log("[5] RESULTADO");
    Logger.log("─────────────────────────────────────────");

    switch (code) {
      case 200:
        Logger.log("ÉXITO - Conexión establecida correctamente");
        const data = JSON.parse(content);
        Logger.log("\nDatos del documento:");
        if (data.fields) {
          Object.keys(data.fields).forEach(key => {
            const value = data.fields[key];
            const tipo = Object.keys(value)[0];
            Logger.log(`  • ${key}: ${value[tipo]} (${tipo.replace('Value', '')})`);
          });
        }
        break;

      case 404:
        Logger.log("ÉXITO PARCIAL - Firestore accesible, documento no existe");
        Logger.log("\nAcciones recomendadas:");
        Logger.log("  1. El documento se creará en la primera sincronización");
        Logger.log("  2. O puedes crearlo manualmente en Firebase Console");
        break;

      case 401:
        Logger.log("ERROR 401 - No autorizado");
        Logger.log("\nPosibles causas:");
        Logger.log("  1. Token OAuth inválido o expirado");
        Logger.log("  2. Scopes insuficientes en appsscript.json");
        Logger.log("  3. El proyecto de GCP no está vinculado correctamente");
        break;

      case 403:
        Logger.log("ERROR 403 - Permiso denegado");
        Logger.log("\nPosibles causas:");
        Logger.log("  1. Reglas de seguridad de Firestore muy restrictivas");
        Logger.log("  2. El usuario no tiene permisos en el proyecto Firebase");
        Logger.log("  3. APIs no habilitadas en GCP");
        Logger.log("\nAcciones recomendadas:");
        Logger.log("  1. Verificar reglas de Firestore en Firebase Console");
        Logger.log("  2. Habilitar Firestore API en Google Cloud Console");
        break;

      default:
        Logger.log("ERROR HTTP " + code);
        Logger.log("Respuesta del servidor:");
        Logger.log(content);
    }

  } catch (error) {
    Logger.log("EXCEPCIÓN DURANTE LA PRUEBA");
    Logger.log("─────────────────────────────────────────");
    Logger.log("Tipo de error: " + error.name);
    Logger.log("Mensaje: " + error.message);
    Logger.log("\nStack trace:");
    Logger.log(error.stack);
  }

  Logger.log("\n╔══════════════════════════════════════════╗");
  Logger.log("║           FIN DE PRUEBA DETALLADA        ║");
  Logger.log("╚══════════════════════════════════════════╝");
}

/**
 * Prueba de lectura de la hoja de Google Sheets
 */
function probarLecturaHoja() {
  Logger.log("=== PRUEBA DE LECTURA DE HOJA ===\n");

  try {
    const resumen = obtenerResumenHoja();

    if (!resumen.existe) {
      Logger.log("ERROR: " + resumen.mensaje);
      return;
    }

    Logger.log("Hoja encontrada: " + resumen.nombreHoja);
    Logger.log("Total filas (sin encabezados): " + resumen.totalFilas);
    Logger.log("Filas con datos: " + resumen.filasConDatos);
    Logger.log("Columnas: " + resumen.columnas);
    Logger.log("\nEncabezados:");
    resumen.encabezados.forEach((h, i) => {
      Logger.log(`  ${String.fromCharCode(65 + i)}: ${h}`);
    });

    Logger.log("\nLeyendo primeros 3 productos...");
    const productos = leerProductosDeHoja();
    const muestra = productos.slice(0, 3);

    muestra.forEach((p, i) => {
      Logger.log(`\nProducto ${i + 1}:`);
      Logger.log(`  Código: ${p.cod_interno}`);
      Logger.log(`  Título: ${p.titulo}`);
      Logger.log(`  Precio: $${p.p_corriente}`);
      Logger.log(`  Cantidad: ${p.cantidad}`);
    });

    Logger.log("\nLECTURA DE HOJA EXITOSA");

  } catch (error) {
    Logger.log("ERROR: " + error.message);
  }

  Logger.log("\n=== FIN DE PRUEBA ===");
}

/**
 * Ejecuta todas las pruebas de diagnóstico
 */
function ejecutarDiagnosticoCompleto() {
  Logger.log("╔══════════════════════════════════════════╗");
  Logger.log("║       DIAGNÓSTICO COMPLETO DEL SISTEMA   ║");
  Logger.log("╚══════════════════════════════════════════╝\n");

  Logger.log("PARTE 1: Lectura de hoja");
  Logger.log("════════════════════════════════════════════\n");
  probarLecturaHoja();

  Logger.log("\n\nPARTE 2: Conexión a Firestore");
  Logger.log("════════════════════════════════════════════\n");
  probarConexionDetallada();

  Logger.log("\n\nPARTE 3: Triggers activos");
  Logger.log("════════════════════════════════════════════\n");
  listarTriggers();

  Logger.log("\n\n╔══════════════════════════════════════════╗");
  Logger.log("║       DIAGNÓSTICO COMPLETADO             ║");
  Logger.log("╚══════════════════════════════════════════╝");
}

// ============================================
// MENÚ PERSONALIZADO (OPCIONAL)
// ============================================

/**
 * Crea un menú personalizado en Google Sheets
 * Se ejecuta automáticamente al abrir la hoja
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('ENAR Sync')
    .addItem('Sincronizar productos', 'sincronizarProductosAFirestore')
    .addItem('Sincronizar prueba (5 productos)', 'sincronizarPrueba')
    .addSeparator()
    .addItem('Previsualizar sincronización', 'previsualizarSincronizacion')
    .addSeparator()
    .addSubMenu(ui.createMenu('Imágenes')
      .addItem('Diagnosticar carpeta IMAGENES', 'diagnosticarCarpetaImagenes')
      .addItem('Listar imágenes (prueba piloto)', 'listarImagenesCarpeta')
      .addItem('Sincronizar imágenes (Piloto)', 'sincronizarImagenes')
      .addItem('Sincronizar TODAS las imágenes', 'sincronizarTodasLasImagenes'))
    .addSubMenu(ui.createMenu('Fichas Técnicas')
      .addItem('Listar fichas técnicas', 'listarFichasTecnicas')
      .addItem('Sincronizar fichas técnicas', 'sincronizarFichasTecnicas')
      .addSeparator()
      .addItem('Procesar contenido PDFs (IA)', 'procesarFichasTecnicasContenido')
      .addItem('Vincular fichas con productos', 'vincularFichasConProductos'))
    .addSubMenu(ui.createMenu('Diagnóstico')
      .addItem('Probar conexión Firestore', 'probarConexionFirestore')
      .addItem('Prueba detallada', 'probarConexionDetallada')
      .addItem('Probar lectura de hoja', 'probarLecturaHoja')
      .addItem('Diagnóstico completo', 'ejecutarDiagnosticoCompleto'))
    .addSubMenu(ui.createMenu('Triggers')
      .addItem('Crear trigger horario', 'crearTriggerSincronizacionHoraria')
      .addItem('Crear trigger diario (6 AM)', 'crearTriggerDiario6AM')
      .addItem('Listar triggers', 'listarTriggers')
      .addItem('Eliminar todos los triggers', 'eliminarTodosLosTriggers'))
    .addSubMenu(ui.createMenu('Limpieza')
      .addItem('Previsualizar productos huerfanos', 'previsualizarProductosHuerfanos')
      .addItem('Eliminar productos huerfanos', 'eliminarProductosHuerfanos'))
    .addToUi();
}

/**
 * Atajo para crear trigger diario a las 6 AM
 */
function crearTriggerDiario6AM() {
  crearTriggerSincronizacionDiaria(6);
}
