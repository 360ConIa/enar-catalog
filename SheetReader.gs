// ============================================
// LECTOR DE GOOGLE SHEETS
// ============================================
// Archivo: SheetReader.gs
// Descripción: Funciones para leer y transformar datos
//              de productos desde Google Sheets
// ============================================

/**
 * Índices de las columnas en la hoja de productos
 * Basado en la estructura definida (columnas A-L)
 */
const COLUMNAS = {
  COD_INTERNO: 0,        // A
  TITULO: 1,             // B
  CANTIDAD: 2,           // C
  P_REAL: 3,             // D
  P_CORRIENTE: 4,        // E
  IMPUESTO: 5,           // F
  EAN: 6,                // G
  MARCA: 7,              // H
  LABORATORIO: 8,        // I
  INDICACION: 9,         // J
  PRINCIPIO_ACTIVO: 10,  // K
  IMAGEN_PRINCIPAL: 11   // L
};

/**
 * Lee todos los productos de la hoja de Google Sheets
 * y los transforma al formato esperado por Firestore
 *
 * @returns {Array<Object>} - Array de productos listos para sincronizar
 * @throws {Error} - Si la hoja no existe
 */
function leerProductosDeHoja() {
  // Obtener la hoja activa por nombre
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(NOMBRE_HOJA);

  // Validar que la hoja existe
  if (!sheet) {
    throw new Error(`La hoja "${NOMBRE_HOJA}" no fue encontrada. Verifica el nombre en Config.gs`);
  }

  // Leer todos los datos de la hoja
  const range = sheet.getDataRange();
  const values = range.getValues();

  // Validar que hay datos
  if (values.length <= 1) {
    Logger.log("Advertencia: La hoja está vacía o solo tiene encabezados");
    return [];
  }

  // Saltar la primera fila (encabezados) y filtrar filas vacías o con encabezado
  const filasDatos = values.slice(1).filter(fila => {
    const codInterno = fila[COLUMNAS.COD_INTERNO];
    // Excluir filas vacías y posibles encabezados duplicados
    return codInterno &&
           codInterno !== 'Cod_Interno' &&
           codInterno !== 'cod_interno';
  });

  // Procesar cada fila
  const productos = [];
  const ahora = new Date().toISOString();

  filasDatos.forEach((fila, index) => {
    const numeroFila = index + 2; // +2 porque: +1 por índice 0-based, +1 por encabezados

    try {
      // Validar que la fila tiene datos (columna A no vacía)
      if (!fila[COLUMNAS.COD_INTERNO]) {
        return; // Saltar fila vacía
      }

      // Transformar fila a objeto producto
      const producto = transformarFilaAProducto(fila, ahora);

      // Validar campos obligatorios
      if (!validarProducto(producto, numeroFila)) {
        return; // Saltar producto inválido
      }

      productos.push(producto);

    } catch (error) {
      Logger.log(`Error procesando fila ${numeroFila}: ${error.message}`);
    }
  });

  Logger.log(`Productos válidos leídos de la hoja: ${productos.length}`);
  return productos;
}

/**
 * Transforma una fila de la hoja en un objeto producto
 *
 * @param {Array} fila - Array con los valores de una fila
 * @param {string} timestamp - Timestamp ISO para sync_at y updated_at
 * @returns {Object} - Objeto producto formateado
 */
function transformarFilaAProducto(fila, timestamp) {
  return {
    // Campos de texto - limpiar y convertir a string
    cod_interno: limpiarTexto(fila[COLUMNAS.COD_INTERNO]),
    titulo: limpiarTexto(fila[COLUMNAS.TITULO]),
    ean: limpiarTexto(fila[COLUMNAS.EAN]),
    marca: limpiarTexto(fila[COLUMNAS.MARCA]),
    laboratorio: limpiarTexto(fila[COLUMNAS.LABORATORIO]),
    indicacion: limpiarTexto(fila[COLUMNAS.INDICACION]),
    principio_activo: limpiarTexto(fila[COLUMNAS.PRINCIPIO_ACTIVO]),
    imagen_principal: limpiarTexto(fila[COLUMNAS.IMAGEN_PRINCIPAL]),

    // Campos numéricos - convertir a número
    cantidad: convertirANumero(fila[COLUMNAS.CANTIDAD], 0),
    p_real: convertirANumero(fila[COLUMNAS.P_REAL], 0),
    p_corriente: convertirANumero(fila[COLUMNAS.P_CORRIENTE], 0),
    impuesto: convertirANumero(fila[COLUMNAS.IMPUESTO], 0.19),

    // Campos adicionales para Firestore
    activo: true,
    sync_at: timestamp,
    updated_at: timestamp
  };
}

/**
 * Valida que un producto tenga los campos obligatorios
 *
 * @param {Object} producto - Producto a validar
 * @param {number} numeroFila - Número de fila para logging
 * @returns {boolean} - true si es válido, false si no
 */
function validarProducto(producto, numeroFila) {
  // Validar código interno (obligatorio)
  if (!producto.cod_interno) {
    Logger.log(`Fila ${numeroFila}: Saltando - código interno vacío`);
    return false;
  }

  // Validar título (obligatorio)
  if (!producto.titulo) {
    Logger.log(`Fila ${numeroFila}: Saltando - título vacío para código ${producto.cod_interno}`);
    return false;
  }

  // Validar que el código interno no tenga caracteres problemáticos para Firestore
  if (producto.cod_interno.includes('/')) {
    Logger.log(`Fila ${numeroFila}: Advertencia - código interno contiene '/', puede causar problemas`);
    // Podríamos reemplazar o rechazar, por ahora solo advertimos
  }

  return true;
}

/**
 * Limpia y normaliza un valor de texto
 *
 * @param {*} valor - Valor a limpiar
 * @returns {string} - Texto limpio
 */
function limpiarTexto(valor) {
  if (valor === null || valor === undefined) {
    return "";
  }

  // Convertir a string y eliminar espacios extra
  return String(valor).trim();
}

/**
 * Convierte un valor a número con valor por defecto
 *
 * @param {*} valor - Valor a convertir
 * @param {number} valorPorDefecto - Valor si la conversión falla
 * @returns {number} - Número resultante
 */
function convertirANumero(valor, valorPorDefecto) {
  if (valor === null || valor === undefined || valor === "") {
    return valorPorDefecto;
  }

  // Si ya es número, retornarlo
  if (typeof valor === 'number' && !isNaN(valor)) {
    return valor;
  }

  // Intentar convertir string a número
  const numero = Number(valor);

  if (isNaN(numero)) {
    return valorPorDefecto;
  }

  return numero;
}

/**
 * Obtiene información resumida de la hoja de productos
 * Útil para verificar antes de sincronizar
 *
 * @returns {Object} - Resumen con estadísticas de la hoja
 */
function obtenerResumenHoja() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(NOMBRE_HOJA);

  if (!sheet) {
    return {
      existe: false,
      mensaje: `Hoja "${NOMBRE_HOJA}" no encontrada`
    };
  }

  const range = sheet.getDataRange();
  const values = range.getValues();

  const totalFilas = values.length - 1; // Menos encabezados
  const filasConDatos = values.slice(1).filter(fila => fila[0]).length;

  return {
    existe: true,
    nombreHoja: NOMBRE_HOJA,
    totalFilas: totalFilas,
    filasConDatos: filasConDatos,
    filasVacias: totalFilas - filasConDatos,
    columnas: values[0] ? values[0].length : 0,
    encabezados: values[0] || []
  };
}
