/**
 * Sincroniza productos vía Firebase Function
 * Llama a: https://syncproductos-3ylre3k6ka-uc.a.run.app
 */
function sincronizarViaFunction() {
  Logger.log("=== SINCRONIZACIÓN VIA FIREBASE FUNCTION ===");
  const inicio = new Date();

  // 1. Leer productos de la hoja
  const productos = leerProductosDeHoja();
  Logger.log(`Total productos: ${productos.length}`);

  // 2. URL de la Cloud Function
  const url = 'https://syncproductos-3ylre3k6ka-uc.a.run.app';

  // 3. Preparar payload
  const payload = {
    productos: productos
  };

  // 4. Configurar request
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  Logger.log("Enviando a Firebase Function...");

  try {
    // 5. Llamar a la función
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();

    if (code === 200) {
      const result = JSON.parse(response.getContentText());

      if (result.success) {
        const fin = new Date();
        const duracion = (fin - inicio) / 1000;

        Logger.log("\n=== SINCRONIZACIÓN EXITOSA ===");
        Logger.log(`Procesados: ${result.procesados}`);
        Logger.log(`Duración total: ${duracion}s`);
        Logger.log(`Duración Function: ${result.duracion}s`);
        Logger.log(`Mensaje: ${result.mensaje}`);
      } else {
        Logger.log(`ERROR: ${result.error || 'Error desconocido'}`);
      }
    } else {
      Logger.log(`ERROR HTTP ${code}: ${response.getContentText()}`);
    }

  } catch (error) {
    Logger.log(`ERROR: ${error.message}`);
    Logger.log(`Stack: ${error.stack}`);
  }
}

/**
 * Configurar trigger automático cada 8 horas
 */
function configurarTriggerFunction() {
  // Eliminar triggers existentes
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'sincronizarViaFunction') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Crear nuevo trigger cada 8 horas
  ScriptApp.newTrigger('sincronizarViaFunction')
    .timeBased()
    .everyHours(8)
    .create();

  Logger.log('Trigger configurado: sincronizarViaFunction cada 8 horas');
}
