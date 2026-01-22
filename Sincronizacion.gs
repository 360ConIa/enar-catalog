// ============================================
// SINCRONIZACIÓN PRINCIPAL
// ============================================
// Archivo: Sincronizacion.gs
// Descripción: Lógica principal para sincronizar productos
//              desde Google Sheets hacia Firebase Firestore
// ============================================

/**
 * Función principal de sincronización
 * Lee productos de la hoja y los sincroniza con Firestore
 *
 * Esta es la función que se ejecuta manualmente o mediante trigger
 */
function sincronizarProductosAFirestore() {
  const tiempoInicio = new Date();

  Logger.log("========================================");
  Logger.log("INICIANDO SINCRONIZACIÓN DE PRODUCTOS");
  Logger.log("Fecha/Hora: " + tiempoInicio.toLocaleString("es-CO"));
  Logger.log("========================================");

  try {
    // 1. Leer productos de la hoja de Google Sheets
    Logger.log("\n[1/4] Leyendo productos de Google Sheets...");
    const productos = leerProductosDeHoja();

    if (productos.length === 0) {
      Logger.log("No hay productos para sincronizar");
      return;
    }

    Logger.log(`Productos encontrados: ${productos.length}`);

    // 2. Inicializar contadores
    const contadores = {
      nuevos: 0,
      actualizados: 0,
      errores: 0,
      omitidos: 0
    };

    // 3. Procesar cada producto
    Logger.log("\n[2/4] Sincronizando con Firestore...");
    const erroresDetalle = [];

    productos.forEach((producto, index) => {
      const numeroActual = index + 1;

      try {
        // Verificar si el producto ya existe en Firestore
        const existe = verificarProductoExiste(producto.cod_interno);

        if (existe) {
          // Actualizar producto existente
          actualizarProducto(producto);
          contadores.actualizados++;
        } else {
          // Crear nuevo producto
          crearProducto(producto);
          contadores.nuevos++;
        }

        // Log de progreso cada N productos
        if (numeroActual % LOG_CADA_N_PRODUCTOS === 0) {
          Logger.log(`   Procesados: ${numeroActual}/${productos.length} ` +
            `(Nuevos: ${contadores.nuevos}, Actualizados: ${contadores.actualizados})`);
        }

      } catch (error) {
        contadores.errores++;
        const errorInfo = {
          cod_interno: producto.cod_interno,
          mensaje: error.message
        };
        erroresDetalle.push(errorInfo);

        // Limitar logs de errores para no saturar
        if (erroresDetalle.length <= 10) {
          Logger.log(`   ERROR en ${producto.cod_interno}: ${error.message}`);
        }
      }
    });

    // 4. Actualizar documento de configuración
    Logger.log("\n[3/4] Actualizando configuración...");
    const datosConfiguracion = {
      ultima_sincronizacion: tiempoInicio.toISOString(),
      productos_sincronizados: contadores.nuevos + contadores.actualizados,
      productos_nuevos: contadores.nuevos,
      productos_actualizados: contadores.actualizados,
      errores_sincronizacion: contadores.errores
    };

    actualizarConfiguracion(datosConfiguracion);

    // 5. Mostrar resumen final
    const tiempoFin = new Date();
    const duracionMs = tiempoFin - tiempoInicio;
    const duracionSeg = (duracionMs / 1000).toFixed(2);

    Logger.log("\n[4/4] RESUMEN DE SINCRONIZACIÓN");
    Logger.log("========================================");
    Logger.log(`Total procesados: ${productos.length}`);
    Logger.log(`Productos nuevos: ${contadores.nuevos}`);
    Logger.log(`Productos actualizados: ${contadores.actualizados}`);
    Logger.log(`Errores: ${contadores.errores}`);
    Logger.log(`Tiempo total: ${duracionSeg} segundos`);
    Logger.log("========================================");

    // Mostrar errores si los hay
    if (erroresDetalle.length > 0) {
      Logger.log("\nDETALLE DE ERRORES:");
      erroresDetalle.slice(0, 20).forEach((err, i) => {
        Logger.log(`  ${i + 1}. ${err.cod_interno}: ${err.mensaje}`);
      });
      if (erroresDetalle.length > 20) {
        Logger.log(`  ... y ${erroresDetalle.length - 20} errores más`);
      }
    }

    Logger.log("\nSINCRONIZACIÓN COMPLETADA");

    // Retornar resumen para uso programático
    return {
      exito: true,
      totalProcesados: productos.length,
      nuevos: contadores.nuevos,
      actualizados: contadores.actualizados,
      errores: contadores.errores,
      duracionSegundos: parseFloat(duracionSeg)
    };

  } catch (error) {
    Logger.log("\nERROR CRÍTICO EN SINCRONIZACIÓN:");
    Logger.log(`Mensaje: ${error.message}`);
    Logger.log(`Stack: ${error.stack}`);

    throw error;
  }
}

/**
 * Sincroniza un solo producto por su código interno
 * Útil para pruebas o actualizaciones individuales
 *
 * @param {string} codInterno - Código interno del producto a sincronizar
 * @returns {Object} - Resultado de la sincronización
 */
function sincronizarProductoIndividual(codInterno) {
  Logger.log(`Sincronizando producto individual: ${codInterno}`);

  try {
    // Leer todos los productos y buscar el específico
    const productos = leerProductosDeHoja();
    const producto = productos.find(p => p.cod_interno === codInterno);

    if (!producto) {
      throw new Error(`Producto con código "${codInterno}" no encontrado en la hoja`);
    }

    // Verificar y sincronizar
    const existe = verificarProductoExiste(codInterno);

    if (existe) {
      actualizarProducto(producto);
      Logger.log(`Producto ${codInterno} actualizado exitosamente`);
      return { accion: 'actualizado', producto: producto };
    } else {
      crearProducto(producto);
      Logger.log(`Producto ${codInterno} creado exitosamente`);
      return { accion: 'creado', producto: producto };
    }

  } catch (error) {
    Logger.log(`Error sincronizando producto ${codInterno}: ${error.message}`);
    throw error;
  }
}

/**
 * Realiza una sincronización de prueba con los primeros N productos
 * Útil para verificar que todo funciona antes de sincronizar todo
 *
 * @param {number} cantidad - Número de productos a sincronizar (default: 5)
 */
function sincronizarPrueba(cantidad) {
  const n = cantidad || 5;
  Logger.log(`=== SINCRONIZACIÓN DE PRUEBA (${n} productos) ===`);

  try {
    const productos = leerProductosDeHoja();
    const productosPrueba = productos.slice(0, n);

    Logger.log(`Productos a sincronizar: ${productosPrueba.length}`);

    productosPrueba.forEach((producto, index) => {
      try {
        const existe = verificarProductoExiste(producto.cod_interno);
        const accion = existe ? 'actualizar' : 'crear';

        Logger.log(`${index + 1}. ${producto.cod_interno} - ${producto.titulo.substring(0, 30)}... (${accion})`);

        if (existe) {
          actualizarProducto(producto);
        } else {
          crearProducto(producto);
        }

        Logger.log(`   OK`);

      } catch (error) {
        Logger.log(`   ERROR: ${error.message}`);
      }
    });

    Logger.log("\n=== PRUEBA COMPLETADA ===");

  } catch (error) {
    Logger.log(`Error en prueba: ${error.message}`);
    throw error;
  }
}

/**
 * Muestra un resumen de lo que se sincronizaría sin hacer cambios
 * Modo "dry run" para verificar antes de ejecutar
 */
function previsualizarSincronizacion() {
  Logger.log("=== PREVISUALIZACIÓN DE SINCRONIZACIÓN ===");
  Logger.log("(No se realizarán cambios en Firestore)\n");

  try {
    // Obtener resumen de la hoja
    const resumen = obtenerResumenHoja();

    if (!resumen.existe) {
      Logger.log(`ERROR: ${resumen.mensaje}`);
      return;
    }

    Logger.log(`Hoja: ${resumen.nombreHoja}`);
    Logger.log(`Filas con datos: ${resumen.filasConDatos}`);
    Logger.log(`Filas vacías: ${resumen.filasVacias}`);
    Logger.log(`Columnas: ${resumen.columnas}`);
    Logger.log(`\nEncabezados encontrados:`);
    resumen.encabezados.forEach((header, i) => {
      Logger.log(`  ${String.fromCharCode(65 + i)}: ${header}`);
    });

    // Leer productos y mostrar estadísticas
    const productos = leerProductosDeHoja();

    Logger.log(`\nProductos válidos para sincronizar: ${productos.length}`);

    // Verificar cuántos ya existen (muestra de los primeros 10)
    Logger.log("\nVerificando existencia (primeros 10 productos):");
    const muestra = productos.slice(0, 10);
    let nuevos = 0, existentes = 0;

    muestra.forEach(producto => {
      const existe = verificarProductoExiste(producto.cod_interno);
      if (existe) {
        existentes++;
        Logger.log(`  ${producto.cod_interno}: Ya existe (se actualizará)`);
      } else {
        nuevos++;
        Logger.log(`  ${producto.cod_interno}: Nuevo (se creará)`);
      }
    });

    Logger.log(`\nDe la muestra: ${nuevos} nuevos, ${existentes} existentes`);
    Logger.log("\n=== FIN DE PREVISUALIZACIÓN ===");

  } catch (error) {
    Logger.log(`Error: ${error.message}`);
  }
}

// ============================================
// SINCRONIZACIÓN POR LOTES (PARA GRANDES VOLÚMENES)
// ============================================

/**
 * Sincroniza productos por lotes para evitar el límite de 6 minutos
 *
 * Esta función:
 * 1. Lee el checkpoint de Firestore (último índice sincronizado)
 * 2. Filtra productos DESPUÉS del checkpoint
 * 3. Procesa máximo PRODUCTOS_POR_LOTE productos
 * 4. Guarda el nuevo checkpoint en Firestore
 * 5. Retorna si completó o faltan más lotes
 *
 * Ejecutar múltiples veces hasta que retorne completado: true
 */
function sincronizarProductosPorLotes() {
  const tiempoInicio = new Date();

  Logger.log("╔══════════════════════════════════════════╗");
  Logger.log("║  SINCRONIZACIÓN POR LOTES - ENAR         ║");
  Logger.log("╚══════════════════════════════════════════╝");
  Logger.log(`Fecha/Hora: ${tiempoInicio.toLocaleString("es-CO")}`);
  Logger.log(`Productos por lote: ${PRODUCTOS_POR_LOTE}`);

  try {
    // 1. Leer TODOS los productos de la hoja
    Logger.log("\n[1/5] Leyendo productos de Google Sheets...");
    const todosLosProductos = leerProductosDeHoja();
    const totalProductos = todosLosProductos.length;

    if (totalProductos === 0) {
      Logger.log("No hay productos para sincronizar");
      return { completado: true, procesados: 0, total: 0 };
    }

    Logger.log(`Total de productos en hoja: ${totalProductos}`);

    // 2. Obtener checkpoint de Firestore (lectura directa)
    Logger.log("\n[2/5] Leyendo checkpoint de Firestore...");
    const ultimoIndice = obtenerCheckpointDeFirestore();
    Logger.log(`Último índice procesado: ${ultimoIndice}`);

    // Verificar si ya terminamos todos
    if (ultimoIndice >= totalProductos) {
      Logger.log("\nTodos los productos ya fueron sincronizados");
      Logger.log("Reseteando checkpoint para próxima sincronización...");
      resetearCheckpointEnFirestore();
      return { completado: true, procesados: totalProductos, total: totalProductos };
    }

    // 3. Filtrar productos DESPUÉS del checkpoint
    const productosRestantes = todosLosProductos.slice(ultimoIndice);
    const productosEnEsteLote = productosRestantes.slice(0, PRODUCTOS_POR_LOTE);
    const cantidadRestante = productosRestantes.length;

    Logger.log(`\n[3/5] Procesando lote...`);
    Logger.log(`Productos ya procesados: ${ultimoIndice}`);
    Logger.log(`Productos en este lote: ${productosEnEsteLote.length}`);
    Logger.log(`Productos restantes total: ${cantidadRestante}`);

    // 4. Procesar el lote
    const contadores = { nuevos: 0, actualizados: 0, errores: 0 };
    const erroresDetalle = [];

    productosEnEsteLote.forEach((producto, indexEnLote) => {
      const indexGlobal = ultimoIndice + indexEnLote + 1;

      try {
        const existe = verificarProductoExiste(producto.cod_interno);

        if (existe) {
          actualizarProducto(producto);
          contadores.actualizados++;
        } else {
          crearProducto(producto);
          contadores.nuevos++;
        }

        // Log de progreso cada N productos
        if ((indexEnLote + 1) % LOG_CADA_N_PRODUCTOS === 0) {
          const porcentaje = ((indexGlobal / totalProductos) * 100).toFixed(1);
          Logger.log(`   Procesados: ${indexGlobal}/${totalProductos} (${porcentaje}%)`);
        }

      } catch (error) {
        contadores.errores++;
        erroresDetalle.push({ cod_interno: producto.cod_interno, mensaje: error.message });
        if (erroresDetalle.length <= 5) {
          Logger.log(`   ERROR en ${producto.cod_interno}: ${error.message}`);
        }
      }
    });

    // 5. Calcular nuevo checkpoint y guardarlo
    const nuevoCheckpoint = ultimoIndice + productosEnEsteLote.length;
    const esUltimoLote = nuevoCheckpoint >= totalProductos;

    Logger.log("\n[4/5] Guardando checkpoint en Firestore...");

    if (esUltimoLote) {
      // Terminamos todos - resetear checkpoint
      resetearCheckpointEnFirestore();
      Logger.log("Sincronización completa - checkpoint reseteado");
    } else {
      // Guardar nuevo checkpoint
      guardarCheckpointEnFirestore(nuevoCheckpoint);
      Logger.log(`Nuevo checkpoint guardado: ${nuevoCheckpoint}`);
    }

    // 6. Resumen
    const tiempoFin = new Date();
    const duracionSeg = ((tiempoFin - tiempoInicio) / 1000).toFixed(2);
    const porcentajeTotal = ((nuevoCheckpoint / totalProductos) * 100).toFixed(1);
    const productosRestantesFinal = totalProductos - nuevoCheckpoint;

    Logger.log("\n[5/5] RESUMEN DEL LOTE");
    Logger.log("╔══════════════════════════════════════════╗");
    Logger.log(`║ Lote procesado: ${productosEnEsteLote.length} productos`);
    Logger.log(`║ Nuevos: ${contadores.nuevos}`);
    Logger.log(`║ Actualizados: ${contadores.actualizados}`);
    Logger.log(`║ Errores: ${contadores.errores}`);
    Logger.log(`║ Tiempo: ${duracionSeg} segundos`);
    Logger.log("╠══════════════════════════════════════════╣");
    Logger.log(`║ PROGRESO: ${nuevoCheckpoint}/${totalProductos} (${porcentajeTotal}%)`);
    if (esUltimoLote) {
      Logger.log("║ SINCRONIZACIÓN COMPLETA");
    } else {
      Logger.log(`║ Restantes: ${productosRestantesFinal} productos`);
    }
    Logger.log("╚══════════════════════════════════════════╝");

    // Mostrar errores si los hay
    if (erroresDetalle.length > 0) {
      Logger.log("\nErrores en este lote:");
      erroresDetalle.slice(0, 10).forEach((err, i) => {
        Logger.log(`  ${i + 1}. ${err.cod_interno}: ${err.mensaje}`);
      });
    }

    return {
      completado: esUltimoLote,
      procesados: nuevoCheckpoint,
      total: totalProductos,
      enEsteLote: productosEnEsteLote.length,
      restantes: productosRestantesFinal,
      porcentaje: parseFloat(porcentajeTotal),
      contadores: contadores
    };

  } catch (error) {
    Logger.log("\nERROR CRÍTICO:");
    Logger.log(`Mensaje: ${error.message}`);
    Logger.log(`Stack: ${error.stack}`);
    throw error;
  }
}

/**
 * Resetea el checkpoint para forzar una sincronización completa desde cero
 * Usar cuando se necesite re-sincronizar todos los productos
 */
function resetearCheckpoint() {
  Logger.log("=== RESETEANDO CHECKPOINT ===");

  try {
    resetearCheckpointEnFirestore();
    Logger.log("Checkpoint reseteado exitosamente");
    Logger.log("La próxima sincronización comenzará desde el producto #1");
    return { exito: true, mensaje: "Checkpoint reseteado" };

  } catch (error) {
    Logger.log(`Error reseteando checkpoint: ${error.message}`);
    throw error;
  }
}

/**
 * Muestra el estado actual del checkpoint y progreso
 */
function verEstadoSincronizacion() {
  Logger.log("=== ESTADO DE SINCRONIZACIÓN ===\n");

  try {
    // Obtener checkpoint actual de Firestore
    const checkpoint = obtenerCheckpointDeFirestore();

    // Obtener total de productos
    const productos = leerProductosDeHoja();
    const totalProductos = productos.length;

    Logger.log(`Total productos en hoja: ${totalProductos}`);

    if (checkpoint === 0) {
      Logger.log("Checkpoint: 0 (sincronización lista para iniciar)");
      Logger.log("Progreso: 0%");
    } else {
      const porcentaje = ((checkpoint / totalProductos) * 100).toFixed(1);
      const restantes = totalProductos - checkpoint;

      Logger.log(`Checkpoint actual: ${checkpoint}`);
      Logger.log(`Productos procesados: ${checkpoint}`);
      Logger.log(`Productos restantes: ${restantes}`);
      Logger.log(`Progreso: ${porcentaje}%`);

      // Calcular lotes restantes
      const lotesRestantes = Math.ceil(restantes / PRODUCTOS_POR_LOTE);
      Logger.log(`Lotes restantes (aprox): ${lotesRestantes}`);
    }

    Logger.log("\n=== FIN ESTADO ===");

  } catch (error) {
    Logger.log(`Error: ${error.message}`);
  }
}

// ============================================
// SINCRONIZACIÓN CON TRIGGER AUTOMÁTICO
// ============================================

/**
 * Ejecuta lotes de sincronización de forma recursiva
 * Continúa automáticamente hasta completar o agotar el tiempo
 *
 * Límite Apps Script: 6 min (cuenta gratis) o 30 min (Workspace)
 * Cada lote toma ~4 min, así que procesa ~7 lotes por ejecución
 *
 * Para 14,749 productos: ejecutar manualmente ~5 veces
 */
function sincronizarTodosLosProductos() {
  Logger.log("╔══════════════════════════════════════════════╗");
  Logger.log("║  SINCRONIZACIÓN AUTOMÁTICA POR LOTES         ║");
  Logger.log("╚══════════════════════════════════════════════╝");
  Logger.log(`Fecha/Hora: ${new Date().toLocaleString("es-CO")}`);

  try {
    // Ejecutar un lote
    const resultado = sincronizarProductosPorLotes();

    if (resultado.completado) {
      Logger.log("\n╔══════════════════════════════════════════════╗");
      Logger.log("║  ✅ SINCRONIZACIÓN COMPLETA                  ║");
      Logger.log("╚══════════════════════════════════════════════╝");
      Logger.log(`Total procesados: ${resultado.procesados}/${resultado.total}`);
      return resultado;
    }

    // Si NO completó: ejecutar siguiente lote
    Logger.log(`\nProgreso: ${resultado.procesados}/${resultado.total} (${resultado.porcentaje}%)`);
    Logger.log(`Restantes: ${resultado.restantes} productos`);
    Logger.log("Ejecutando siguiente lote en 5 segundos...\n");

    // Pausa de 5 segundos entre lotes
    Utilities.sleep(5000);

    // Llamada recursiva para siguiente lote
    return sincronizarTodosLosProductos();

  } catch (error) {
    Logger.log(`\nERROR: ${error.message}`);
    Logger.log("La ejecución se detuvo. Ejecutar de nuevo para continuar desde el checkpoint.");
    throw error;
  }
}

/**
 * Configura un trigger automático para ejecutar sincronización cada 5 minutos
 * El trigger se detendrá automáticamente cuando complete todos los productos
 */
function configurarTriggerAutomatico() {
  Logger.log("=== CONFIGURANDO TRIGGER AUTOMÁTICO ===");

  // Eliminar triggers existentes para esta función
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'sincronizarTodosLosProductos') {
      ScriptApp.deleteTrigger(trigger);
      Logger.log("Trigger anterior eliminado");
    }
  });

  // Crear nuevo trigger cada 5 minutos
  ScriptApp.newTrigger('sincronizarTodosLosProductos')
    .timeBased()
    .everyMinutes(5)
    .create();

  Logger.log("✅ Trigger configurado: ejecutará cada 5 minutos");
  Logger.log("Se detendrá automáticamente al completar la sincronización");
  Logger.log("\nPara detener manualmente: ejecuta detenerTriggerAutomatico()");
}

/**
 * Detiene el trigger automático de sincronización
 */
function detenerTriggerAutomatico() {
  const triggers = ScriptApp.getProjectTriggers();
  let eliminados = 0;

  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'sincronizarTodosLosProductos') {
      ScriptApp.deleteTrigger(trigger);
      eliminados++;
    }
  });

  if (eliminados > 0) {
    Logger.log(`✅ ${eliminados} trigger(s) detenido(s)`);
  } else {
    Logger.log("No había triggers activos para detener");
  }
}

/**
 * Inicia la sincronización completa con trigger automático
 * Ejecuta el primer lote inmediatamente y configura el trigger
 */
function iniciarSincronizacionCompleta() {
  Logger.log("╔══════════════════════════════════════════════╗");
  Logger.log("║  INICIANDO SINCRONIZACIÓN COMPLETA           ║");
  Logger.log("╚══════════════════════════════════════════════╝\n");

  // Verificar estado actual
  const checkpoint = obtenerCheckpointDeFirestore();
  Logger.log(`Checkpoint actual: ${checkpoint}`);

  // Ejecutar primer lote
  Logger.log("\nEjecutando primer lote...\n");
  const resultado = sincronizarProductosPorLotes();

  if (resultado.completado) {
    Logger.log("\n✅ Sincronización completada en un solo lote");
    return resultado;
  }

  // Configurar trigger para los lotes restantes
  Logger.log("\nConfigurando trigger para lotes restantes...");
  configurarTriggerAutomatico();

  Logger.log(`\nRestantes: ${resultado.restantes} productos`);
  Logger.log("El trigger ejecutará lotes cada 5 minutos hasta completar");

  return resultado;
}

// ============================================
// SINCRONIZACIÓN CON BATCH COMMIT API
// ============================================
// Método optimizado: reduce ~29K requests a ~30 requests
// Usa Firestore Batch Commit API para enviar 500 productos por request

/**
 * Sincronización usando Batch Commit API de Firestore
 * Procesa todos los productos en lotes de 500
 */
function sincronizarConBatches() {
  Logger.log("=== SINCRONIZACIÓN BATCH - INICIO ===");
  const inicio = new Date();

  const productos = leerProductosDeHoja();
  Logger.log(`Total productos a sincronizar: ${productos.length}`);

  if (productos.length === 0) {
    Logger.log("No hay productos para sincronizar");
    return;
  }

  const BATCH_SIZE = 500;
  const totalBatches = Math.ceil(productos.length / BATCH_SIZE);

  let exitosos = 0;
  let errores = 0;

  for (let i = 0; i < productos.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const lote = productos.slice(i, i + BATCH_SIZE);

    Logger.log(`\nBatch ${batchNum}/${totalBatches} (${lote.length} productos)`);

    try {
      enviarBatchAFirestore(lote);
      exitosos += lote.length;
      Logger.log(`✅ Batch ${batchNum} completado`);

      if (batchNum < totalBatches) {
        Utilities.sleep(3000);
      }

    } catch (error) {
      Logger.log(`❌ Error en batch ${batchNum}: ${error.message}`);
      errores += lote.length;
      Utilities.sleep(10000);
    }
  }

  const fin = new Date();
  const duracion = (fin - inicio) / 1000;

  Logger.log("\n=== SINCRONIZACIÓN BATCH - RESUMEN ===");
  Logger.log(`Exitosos: ${exitosos}`);
  Logger.log(`Errores: ${errores}`);
  Logger.log(`Duración total: ${duracion.toFixed(1)}s`);
  Logger.log(`Promedio: ${(duracion / totalBatches).toFixed(2)}s por batch`);
  Logger.log(`Velocidad: ${(exitosos / duracion).toFixed(0)} productos/segundo`);
}

/**
 * Envía un lote de productos usando Batch Commit API
 */
function enviarBatchAFirestore(productos) {
  const writes = productos.map(producto => ({
    update: {
      name: `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${COLECCIONES.productos}/${producto.cod_interno}`,
      fields: convertirProductoAFields(producto)
    }
  }));

  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:commit`;

  const options = {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + ScriptApp.getOAuthToken(),
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify({ writes: writes }),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();

  if (code !== 200) {
    throw new Error(`Batch commit failed: HTTP ${code} - ${response.getContentText()}`);
  }

  return true;
}

/**
 * Convierte un producto al formato Firestore fields
 * No incluye campos protegidos si están vacíos (para no sobrescribir valores existentes)
 * Campos protegidos: imagen_principal, ficha_tecnica_url, imagenes, total_imagenes
 */
function convertirProductoAFields(producto) {
  const timestamp = new Date().toISOString();

  const fields = {
    cod_interno: { stringValue: String(producto.cod_interno) },
    titulo: { stringValue: String(producto.titulo || '') },
    cantidad: { integerValue: String(producto.cantidad || 0) },
    precio_mayorista: { doubleValue: producto.precio_mayorista || 0 },
    precio_negocio: { doubleValue: producto.precio_negocio || 0 },
    precio_persona_natural: { doubleValue: producto.precio_persona_natural || 0 },
    precio_lista: { doubleValue: producto.precio_lista || 0 },
    embalaje: { integerValue: String(producto.embalaje || 1) },
    peso: { doubleValue: producto.peso || 0 },
    impuesto: { doubleValue: producto.impuesto || 0.19 },
    ean: { stringValue: String(producto.ean || '') },
    marca: { stringValue: String(producto.marca || '') },
    categoria: { stringValue: String(producto.categoria || '') },
    activo: { booleanValue: true },
    sync_at: { timestampValue: timestamp },
    updated_at: { timestampValue: timestamp }
  };

  // Solo incluir ficha_tecnica si tiene valor (no sobrescribir existente)
  if (producto.ficha_tecnica && producto.ficha_tecnica.trim() !== '') {
    fields.ficha_tecnica = { stringValue: String(producto.ficha_tecnica) };
  }

  // Solo incluir imagen_principal si tiene valor (no sobrescribir existente)
  if (producto.imagen_principal && producto.imagen_principal.trim() !== '') {
    fields.imagen_principal = { stringValue: String(producto.imagen_principal) };
  }

  return fields;
}

/**
 * Ejecuta sincronización batch (función principal recomendada)
 */
function ejecutarSincronizacionBatch() {
  try {
    sincronizarConBatches();
    Logger.log("\n🎉 Sincronización completada exitosamente");
  } catch (error) {
    Logger.log(`\n💥 Error fatal: ${error.message}`);
    throw error;
  }
}

