// ============================================
// FIRESTORE REST API
// ============================================
// Archivo: FirestoreAPI.gs
// Descripción: Funciones para interactuar con Firebase Firestore
//              usando la REST API y OAuth de Apps Script
// ============================================

/**
 * Verifica si un producto existe en Firestore
 * Incluye retry con delay para manejar rate limits
 * @param {string} codInterno - Código interno del producto (ID del documento)
 * @param {number} intentos - Número máximo de intentos (default: 3)
 * @returns {boolean} - true si el producto existe, false si no
 */
function verificarProductoExiste(codInterno, intentos = 3) {
  const url = `${FIRESTORE_URL}/${COLECCIONES.productos}/${encodeURIComponent(codInterno)}`;

  for (let i = 0; i < intentos; i++) {
    try {
      const options = {
        method: 'get',
        headers: {
          'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()
        },
        muteHttpExceptions: true
      };

      const response = UrlFetchApp.fetch(url, options);
      const code = response.getResponseCode();

      if (code === 200) return true;
      if (code === 404) return false;

      if (code === 429) {
        // Rate limit - esperar y reintentar
        Logger.log(`Rate limit (429), esperando ${2 * (i + 1)}s antes de reintentar...`);
        Utilities.sleep(2000 * (i + 1)); // 2s, 4s, 6s
        continue;
      }

      // Otros errores, retornar false
      return false;

    } catch (error) {
      if (i === intentos - 1) {
        Logger.log(`Error verificando producto ${codInterno}: ${error.message}`);
        throw error;
      }
      Utilities.sleep(2000);
    }
  }

  return false;
}

/**
 * Crea un nuevo producto en Firestore
 * @param {Object} producto - Objeto con los datos del producto
 * @throws {Error} - Si hay un error en la creación
 */
function crearProducto(producto) {
  // Usar documentId para especificar el ID del documento (cod_interno)
  const url = `${FIRESTORE_URL}/${COLECCIONES.productos}?documentId=${encodeURIComponent(producto.cod_interno)}`;

  const payload = {
    fields: convertirAFirestoreFields(producto)
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();

  if (responseCode !== 200) {
    const errorMsg = response.getContentText();
    throw new Error(`Error creando producto (HTTP ${responseCode}): ${errorMsg}`);
  }

  return JSON.parse(response.getContentText());
}

/**
 * Actualiza un producto existente en Firestore
 * @param {Object} producto - Objeto con los datos del producto
 * @throws {Error} - Si hay un error en la actualización
 */
function actualizarProducto(producto) {
  const url = `${FIRESTORE_URL}/${COLECCIONES.productos}/${encodeURIComponent(producto.cod_interno)}`;

  const payload = {
    fields: convertirAFirestoreFields(producto)
  };

  const options = {
    method: 'patch',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();

  if (responseCode !== 200) {
    const errorMsg = response.getContentText();
    throw new Error(`Error actualizando producto (HTTP ${responseCode}): ${errorMsg}`);
  }

  return JSON.parse(response.getContentText());
}

/**
 * Actualiza el documento de configuración general en Firestore
 * @param {Object} datos - Objeto con los campos a actualizar
 */
function actualizarConfiguracion(datos) {
  const url = `${FIRESTORE_URL}/${COLECCIONES.configuracion}/${DOC_CONFIGURACION_GENERAL}`;

  const payload = {
    fields: convertirAFirestoreFields(datos)
  };

  const options = {
    method: 'patch',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();

  // Si el documento no existe, intentamos crearlo
  if (responseCode === 404) {
    Logger.log("Documento de configuración no existe, creándolo...");
    crearDocumentoConfiguracion(datos);
  } else if (responseCode !== 200) {
    Logger.log(`Advertencia: Error actualizando configuración (HTTP ${responseCode})`);
  }
}

/**
 * Crea el documento de configuración general si no existe
 * @param {Object} datos - Datos iniciales de configuración
 */
function crearDocumentoConfiguracion(datos) {
  const url = `${FIRESTORE_URL}/${COLECCIONES.configuracion}?documentId=${DOC_CONFIGURACION_GENERAL}`;

  // Datos por defecto para configuración
  const datosCompletos = {
    nombre_empresa: "ENAR",
    consecutivo_actual: 0,
    ...datos
  };

  const payload = {
    fields: convertirAFirestoreFields(datosCompletos)
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);

  if (response.getResponseCode() === 200) {
    Logger.log("Documento de configuración creado exitosamente");
  }
}

/**
 * Convierte un objeto JavaScript al formato de campos de Firestore
 * Firestore REST API requiere que cada campo tenga su tipo especificado
 *
 * @param {Object} obj - Objeto JavaScript a convertir
 * @returns {Object} - Objeto en formato Firestore fields
 *
 * @example
 * // Entrada: { nombre: "Test", precio: 100, activo: true }
 * // Salida: { nombre: { stringValue: "Test" }, precio: { doubleValue: 100 }, activo: { booleanValue: true } }
 */
function convertirAFirestoreFields(obj) {
  const fields = {};

  for (const [key, value] of Object.entries(obj)) {
    // Ignorar valores nulos o indefinidos
    if (value === null || value === undefined) continue;

    // Detectar tipo de dato y formatear según Firestore
    if (typeof value === 'string') {
      fields[key] = { stringValue: value };
    } else if (typeof value === 'number') {
      // Firestore diferencia entre enteros y decimales
      // Usamos doubleValue para mayor flexibilidad
      if (Number.isInteger(value)) {
        fields[key] = { integerValue: String(value) };
      } else {
        fields[key] = { doubleValue: value };
      }
    } else if (typeof value === 'boolean') {
      fields[key] = { booleanValue: value };
    } else if (value instanceof Date) {
      // Convertir Date a formato ISO 8601 para Firestore
      fields[key] = { timestampValue: value.toISOString() };
    } else if (Array.isArray(value)) {
      // Convertir arrays
      fields[key] = {
        arrayValue: {
          values: value.map(item => convertirValorAFirestore(item))
        }
      };
    } else if (typeof value === 'object') {
      // Convertir objetos anidados
      fields[key] = {
        mapValue: {
          fields: convertirAFirestoreFields(value)
        }
      };
    } else {
      // Fallback: convertir a string
      fields[key] = { stringValue: String(value) };
    }
  }

  return fields;
}

/**
 * Convierte un valor individual al formato Firestore
 * Función auxiliar para convertir elementos de arrays
 *
 * @param {*} value - Valor a convertir
 * @returns {Object} - Valor en formato Firestore
 */
function convertirValorAFirestore(value) {
  if (typeof value === 'string') {
    return { stringValue: value };
  } else if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  } else if (typeof value === 'boolean') {
    return { booleanValue: value };
  } else if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  } else if (value === null) {
    return { nullValue: null };
  } else {
    return { stringValue: String(value) };
  }
}

/**
 * Obtiene un documento de Firestore
 * @param {string} coleccion - Nombre de la colección
 * @param {string} documentId - ID del documento
 * @returns {Object|null} - Documento o null si no existe
 */
function obtenerDocumento(coleccion, documentId) {
  const url = `${FIRESTORE_URL}/${coleccion}/${encodeURIComponent(documentId)}`;

  const options = {
    method: 'get',
    headers: {
      'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()
    },
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);

  if (response.getResponseCode() === 200) {
    return JSON.parse(response.getContentText());
  }

  return null;
}

// ============================================
// FUNCIONES DE CHECKPOINT PARA SINCRONIZACIÓN POR LOTES
// ============================================

/**
 * Obtiene el checkpoint directamente de Firestore
 * Hace una petición GET directa para asegurar datos frescos
 * @returns {number} - Índice del checkpoint (0 si no existe)
 */
function obtenerCheckpointDeFirestore() {
  const url = `${FIRESTORE_URL}/${COLECCIONES.configuracion}/${DOC_CONFIGURACION_GENERAL}`;

  const options = {
    method: 'get',
    headers: {
      'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()
    },
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);

    if (response.getResponseCode() === 200) {
      const data = JSON.parse(response.getContentText());

      // Buscar el campo de checkpoint
      if (data.fields && data.fields[CAMPO_CHECKPOINT]) {
        const campo = data.fields[CAMPO_CHECKPOINT];

        // Verificar si es null
        if (campo.nullValue !== undefined) {
          Logger.log("Checkpoint en Firestore: null (inicio)");
          return 0;
        }

        // Obtener valor entero
        if (campo.integerValue !== undefined) {
          const valor = parseInt(campo.integerValue, 10);
          Logger.log(`Checkpoint leído de Firestore: ${valor}`);
          return valor;
        }
      }

      Logger.log("Campo checkpoint no existe en Firestore, retornando 0");
      return 0;
    } else if (response.getResponseCode() === 404) {
      Logger.log("Documento de configuración no existe, retornando 0");
      return 0;
    } else {
      Logger.log(`Error leyendo checkpoint: HTTP ${response.getResponseCode()}`);
      return 0;
    }
  } catch (error) {
    Logger.log(`Excepción leyendo checkpoint: ${error.message}`);
    return 0;
  }
}

/**
 * Guarda el checkpoint en Firestore
 * @param {number} indice - Índice a guardar (número de productos procesados)
 */
function guardarCheckpointEnFirestore(indice) {
  const url = `${FIRESTORE_URL}/${COLECCIONES.configuracion}/${DOC_CONFIGURACION_GENERAL}`;

  // Preparar el payload con el checkpoint
  const payload = {
    fields: {
      [CAMPO_CHECKPOINT]: { integerValue: String(indice) }
    }
  };

  // Usar updateMask para actualizar SOLO el campo del checkpoint
  const urlConMask = `${url}?updateMask.fieldPaths=${CAMPO_CHECKPOINT}`;

  const options = {
    method: 'patch',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(urlConMask, options);
  const code = response.getResponseCode();

  if (code === 200) {
    Logger.log(`Checkpoint guardado exitosamente: ${indice}`);
    return true;
  } else if (code === 404) {
    // El documento no existe, crearlo
    Logger.log("Documento no existe, creando...");
    return crearDocumentoConCheckpoint(indice);
  } else {
    Logger.log(`Error guardando checkpoint: HTTP ${code} - ${response.getContentText()}`);
    return false;
  }
}

/**
 * Crea el documento de configuración con el checkpoint inicial
 * @param {number} indice - Índice inicial
 */
function crearDocumentoConCheckpoint(indice) {
  const url = `${FIRESTORE_URL}/${COLECCIONES.configuracion}?documentId=${DOC_CONFIGURACION_GENERAL}`;

  const payload = {
    fields: {
      nombre_empresa: { stringValue: "ENAR" },
      [CAMPO_CHECKPOINT]: { integerValue: String(indice) }
    }
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);

  if (response.getResponseCode() === 200) {
    Logger.log(`Documento creado con checkpoint: ${indice}`);
    return true;
  } else {
    Logger.log(`Error creando documento: ${response.getContentText()}`);
    return false;
  }
}

/**
 * Resetea el checkpoint a null (para iniciar desde cero)
 */
function resetearCheckpointEnFirestore() {
  const url = `${FIRESTORE_URL}/${COLECCIONES.configuracion}/${DOC_CONFIGURACION_GENERAL}`;

  const payload = {
    fields: {
      [CAMPO_CHECKPOINT]: { nullValue: null }
    }
  };

  const urlConMask = `${url}?updateMask.fieldPaths=${CAMPO_CHECKPOINT}`;

  const options = {
    method: 'patch',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(urlConMask, options);

  if (response.getResponseCode() === 200) {
    Logger.log("Checkpoint reseteado a null");
    return true;
  } else {
    Logger.log(`Error reseteando checkpoint: ${response.getContentText()}`);
    return false;
  }
}
