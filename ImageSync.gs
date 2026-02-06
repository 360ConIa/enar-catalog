// ============================================
// SINCRONIZACIÓN DE IMÁGENES - ENAR B2B
// ============================================
// Archivo: ImageSync.gs
// Descripción: Sincroniza imágenes de Google Drive con productos en Firestore
// ============================================

/**
 * ID de la carpeta principal de imágenes en Google Drive
 * Carpeta: CEMENTOS SOLVENTES (piloto)
 */
const CARPETA_IMAGENES_ID = "1TCKhHy4B9Mt81kqqOx6Xm5NzHGN7VxmL";

/**
 * ID de la carpeta con TODAS las imágenes (para uso futuro)
 */
const CARPETA_TODAS_IMAGENES_ID = "1tHPYawvonYZswNoPdz11uaT9xZJQHaES";

/**
 * Genera la URL pública de una imagen de Google Drive
 * Usa el formato lh3.googleusercontent que evita problemas de CORS
 * @param {string} fileId - ID del archivo en Drive
 * @returns {string} - URL pública de la imagen
 */
function generarUrlImagen(fileId) {
  // Formato lh3.googleusercontent - el más confiable para embeber
  return `https://lh3.googleusercontent.com/d/${fileId}`;
}

/**
 * Función principal: Sincroniza imágenes de Drive con productos en Firestore
 * Busca en la carpeta principal y todas sus subcarpetas
 * Ejecutar desde el menú o manualmente
 */
function sincronizarImagenes() {
  Logger.log("=== INICIANDO SINCRONIZACIÓN DE IMÁGENES ===");

  try {
    // Obtener carpeta de imágenes
    const carpeta = DriveApp.getFolderById(CARPETA_IMAGENES_ID);
    Logger.log(`Carpeta: ${carpeta.getName()}`);

    let totalArchivos = 0;
    let actualizados = 0;
    let noEncontrados = [];

    // Mapeo de imágenes: SKU -> URL
    const mapaImagenes = {};

    // Función auxiliar para procesar archivos de una carpeta
    function procesarArchivos(folder) {
      const archivos = folder.getFiles();
      while (archivos.hasNext()) {
        const archivo = archivos.next();
        const nombreArchivo = archivo.getName();

        // Solo procesar archivos de imagen
        if (!esImagen(nombreArchivo)) continue;

        const fileId = archivo.getId();
        const sku = nombreArchivo.replace(/\.(png|jpg|jpeg|gif|webp)$/i, "").trim();
        const urlImagen = generarUrlImagen(fileId);

        mapaImagenes[sku] = {
          url: urlImagen,
          fileId: fileId,
          nombreArchivo: nombreArchivo
        };

        totalArchivos++;
      }
    }

    // Procesar archivos en la raíz
    procesarArchivos(carpeta);

    // Procesar archivos en subcarpetas
    const subcarpetas = carpeta.getFolders();
    while (subcarpetas.hasNext()) {
      const subcarpeta = subcarpetas.next();
      Logger.log(`Procesando subcarpeta: ${subcarpeta.getName()}`);
      procesarArchivos(subcarpeta);
    }

    Logger.log(`\nTotal imágenes encontradas: ${totalArchivos}`);
    Logger.log(`SKUs con imágenes: ${Object.keys(mapaImagenes).join(", ")}`);

    // Actualizar productos en Firestore
    for (const sku in mapaImagenes) {
      const resultado = actualizarImagenProducto(sku, mapaImagenes[sku].url);

      if (resultado.success) {
        actualizados++;
        Logger.log(`✓ ${sku}: Imagen actualizada`);
      } else {
        noEncontrados.push(sku);
        Logger.log(`✗ ${sku}: ${resultado.error}`);
      }
    }

    // Resumen
    Logger.log("\n=== RESUMEN ===");
    Logger.log(`Total imágenes procesadas: ${totalArchivos}`);
    Logger.log(`Productos actualizados: ${actualizados}`);
    Logger.log(`No encontrados: ${noEncontrados.length}`);

    if (noEncontrados.length > 0) {
      Logger.log(`SKUs no encontrados: ${noEncontrados.join(", ")}`);
    }

    return {
      success: true,
      total: totalArchivos,
      actualizados: actualizados,
      noEncontrados: noEncontrados
    };

  } catch (error) {
    Logger.log(`ERROR: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Busca un producto por SKU (cod_interno) y actualiza su imagen
 * @param {string} sku - Código interno del producto
 * @param {string} urlImagen - URL de la imagen
 * @returns {Object} - Resultado de la operación
 */
function actualizarImagenProducto(sku, urlImagen) {
  try {
    // Buscar producto por cod_interno en Firestore
    const url = `${FIRESTORE_URL}/${COLECCIONES.productos}`;
    const token = ScriptApp.getOAuthToken();

    // Query para buscar por cod_interno
    const queryUrl = `${FIRESTORE_URL}:runQuery`;

    const queryBody = {
      structuredQuery: {
        from: [{ collectionId: COLECCIONES.productos }],
        where: {
          fieldFilter: {
            field: { fieldPath: "cod_interno" },
            op: "EQUAL",
            value: { stringValue: sku }
          }
        },
        limit: 1
      }
    };

    const queryResponse = UrlFetchApp.fetch(queryUrl, {
      method: "POST",
      contentType: "application/json",
      headers: { Authorization: `Bearer ${token}` },
      payload: JSON.stringify(queryBody),
      muteHttpExceptions: true
    });

    const queryResult = JSON.parse(queryResponse.getContentText());

    // Verificar si se encontró el producto
    if (!queryResult[0] || !queryResult[0].document) {
      return { success: false, error: "Producto no encontrado" };
    }

    // Obtener el nombre del documento (path completo)
    const docPath = queryResult[0].document.name;
    const docId = docPath.split("/").pop();

    // Actualizar el producto con la imagen
    const updateUrl = `${FIRESTORE_URL}/${COLECCIONES.productos}/${docId}?updateMask.fieldPaths=imagen_principal&updateMask.fieldPaths=updated_at`;

    const updateBody = {
      fields: {
        imagen_principal: { stringValue: urlImagen },
        updated_at: { stringValue: new Date().toISOString() }
      }
    };

    const updateResponse = UrlFetchApp.fetch(updateUrl, {
      method: "PATCH",
      contentType: "application/json",
      headers: { Authorization: `Bearer ${token}` },
      payload: JSON.stringify(updateBody),
      muteHttpExceptions: true
    });

    if (updateResponse.getResponseCode() === 200) {
      return { success: true };
    } else {
      return { success: false, error: `HTTP ${updateResponse.getResponseCode()}` };
    }

  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Función de prueba: Lista las imágenes de la carpeta y subcarpetas sin actualizar Firestore
 */
function listarImagenesCarpeta() {
  Logger.log("=== LISTANDO IMÁGENES DE LA CARPETA ===");

  try {
    const carpeta = DriveApp.getFolderById(CARPETA_IMAGENES_ID);
    Logger.log(`Carpeta: ${carpeta.getName()}`);
    let count = 0;

    // Primero buscar en la raíz
    const archivosRaiz = carpeta.getFiles();
    while (archivosRaiz.hasNext()) {
      const archivo = archivosRaiz.next();
      const nombre = archivo.getName();
      if (esImagen(nombre)) {
        const sku = nombre.replace(/\.(png|jpg|jpeg|gif|webp)$/i, "").trim();
        const url = generarUrlImagen(archivo.getId());
        Logger.log(`${++count}. SKU: ${sku}`);
        Logger.log(`   Archivo: ${nombre}`);
        Logger.log(`   URL: ${url}`);
        Logger.log("");
      }
    }

    // Luego buscar en subcarpetas
    const subcarpetas = carpeta.getFolders();
    while (subcarpetas.hasNext()) {
      const subcarpeta = subcarpetas.next();
      Logger.log(`\n--- Subcarpeta: ${subcarpeta.getName()} ---`);

      const archivos = subcarpeta.getFiles();
      while (archivos.hasNext()) {
        const archivo = archivos.next();
        const nombre = archivo.getName();
        if (esImagen(nombre)) {
          const sku = nombre.replace(/\.(png|jpg|jpeg|gif|webp)$/i, "").trim();
          const url = generarUrlImagen(archivo.getId());
          Logger.log(`${++count}. SKU: ${sku}`);
          Logger.log(`   Archivo: ${nombre}`);
          Logger.log(`   URL: ${url}`);
          Logger.log("");
        }
      }
    }

    Logger.log(`\nTotal: ${count} imágenes`);

  } catch (error) {
    Logger.log(`ERROR: ${error.message}`);
  }
}

/**
 * Verifica si un archivo es una imagen por su extensión
 */
function esImagen(nombreArchivo) {
  return /\.(png|jpg|jpeg|gif|webp)$/i.test(nombreArchivo);
}

/**
 * Función recursiva para obtener todas las imágenes de una carpeta y sus subcarpetas
 * @param {Folder} carpeta - Carpeta de Drive a explorar
 * @param {string} rutaActual - Ruta actual para tracking (ej: "CATEGORIA/SUBCATEGORIA")
 * @param {Array} resultado - Array donde se acumulan las imágenes encontradas
 * @returns {Array} - Array de objetos {archivo, sku, url, ruta}
 */
function obtenerImagenesRecursivo(carpeta, rutaActual, resultado) {
  resultado = resultado || [];
  rutaActual = rutaActual || carpeta.getName();

  // Procesar archivos de imagen en esta carpeta
  const archivos = carpeta.getFiles();
  while (archivos.hasNext()) {
    const archivo = archivos.next();
    const nombre = archivo.getName();

    if (esImagen(nombre)) {
      const sku = nombre.replace(/\.(png|jpg|jpeg|gif|webp)$/i, "").trim();
      resultado.push({
        archivo: archivo,
        nombre: nombre,
        sku: sku,
        url: generarUrlImagen(archivo.getId()),
        fileId: archivo.getId(),
        ruta: rutaActual
      });
    }
  }

  // Recursivamente procesar subcarpetas
  const subcarpetas = carpeta.getFolders();
  while (subcarpetas.hasNext()) {
    const subcarpeta = subcarpetas.next();
    const nuevaRuta = `${rutaActual}/${subcarpeta.getName()}`;
    obtenerImagenesRecursivo(subcarpeta, nuevaRuta, resultado);
  }

  return resultado;
}

/**
 * Función recursiva para diagnosticar estructura de carpetas
 * @param {Folder} carpeta - Carpeta a explorar
 * @param {number} nivel - Nivel de profundidad actual
 * @param {Object} stats - Objeto para acumular estadísticas
 */
function diagnosticarRecursivo(carpeta, nivel, stats) {
  nivel = nivel || 0;
  stats = stats || { totalImagenes: 0, categorias: [] };

  const indent = "  ".repeat(nivel);
  const nombreCarpeta = carpeta.getName();

  // Contar imágenes en esta carpeta
  let imagenesEnCarpeta = 0;
  const ejemplos = [];
  const archivos = carpeta.getFiles();

  while (archivos.hasNext()) {
    const archivo = archivos.next();
    const nombre = archivo.getName();
    if (esImagen(nombre)) {
      imagenesEnCarpeta++;
      if (ejemplos.length < 3) {
        ejemplos.push(nombre.replace(/\.(png|jpg|jpeg|gif|webp)$/i, ""));
      }
    }
  }

  stats.totalImagenes += imagenesEnCarpeta;

  if (nivel > 0) {
    stats.categorias.push({
      nombre: nombreCarpeta,
      imagenes: imagenesEnCarpeta,
      nivel: nivel
    });

    Logger.log(`${indent}📁 ${nombreCarpeta}: ${imagenesEnCarpeta} imágenes`);
    if (ejemplos.length > 0) {
      Logger.log(`${indent}   Ejemplos: ${ejemplos.join(", ")}`);
    }
  }

  // Recursivamente explorar subcarpetas
  const subcarpetas = carpeta.getFolders();
  while (subcarpetas.hasNext()) {
    diagnosticarRecursivo(subcarpetas.next(), nivel + 1, stats);
  }

  return stats;
}

/**
 * Función de diagnóstico: Explora la estructura completa de la carpeta
 * Lista archivos y subcarpetas para entender la organización
 */
function diagnosticarCarpeta() {
  Logger.log("=== DIAGNÓSTICO DE CARPETA ===");

  try {
    const carpeta = DriveApp.getFolderById(CARPETA_IMAGENES_ID);
    Logger.log(`Carpeta principal: ${carpeta.getName()}`);
    Logger.log(`ID: ${CARPETA_IMAGENES_ID}`);
    Logger.log("");

    // Listar archivos en la raíz
    Logger.log("--- ARCHIVOS EN LA RAÍZ ---");
    const archivos = carpeta.getFiles();
    let countArchivos = 0;
    while (archivos.hasNext()) {
      const archivo = archivos.next();
      Logger.log(`  📄 ${archivo.getName()} (${archivo.getMimeType()})`);
      countArchivos++;
    }
    Logger.log(`Total archivos en raíz: ${countArchivos}`);
    Logger.log("");

    // Listar subcarpetas
    Logger.log("--- SUBCARPETAS ---");
    const subcarpetas = carpeta.getFolders();
    let countSubcarpetas = 0;
    while (subcarpetas.hasNext()) {
      const sub = subcarpetas.next();
      const archivosEnSub = sub.getFiles();
      let countEnSub = 0;
      while (archivosEnSub.hasNext()) {
        archivosEnSub.next();
        countEnSub++;
      }
      Logger.log(`  📁 ${sub.getName()} (${countEnSub} archivos)`);
      countSubcarpetas++;
    }
    Logger.log(`Total subcarpetas: ${countSubcarpetas}`);

  } catch (error) {
    Logger.log(`ERROR: ${error.message}`);
  }
}

/**
 * Sincroniza imágenes de TODAS las subcarpetas (categorías) - RECURSIVO
 * Recorre la carpeta IMAGENES y TODAS sus subcarpetas en cualquier nivel
 * Formato esperado: archivo = COD_INTERNO.png
 */
function sincronizarTodasLasImagenes() {
  Logger.log("=== SINCRONIZACIÓN COMPLETA DE IMÁGENES (RECURSIVO) ===");
  Logger.log(`Carpeta ID: ${CARPETA_TODAS_IMAGENES_ID}`);

  const startTime = new Date();

  try {
    const carpetaPrincipal = DriveApp.getFolderById(CARPETA_TODAS_IMAGENES_ID);
    Logger.log(`Carpeta principal: ${carpetaPrincipal.getName()}`);
    Logger.log("");

    // Obtener TODAS las imágenes recursivamente
    Logger.log("Escaneando carpetas recursivamente...");
    const todasLasImagenes = obtenerImagenesRecursivo(carpetaPrincipal, carpetaPrincipal.getName(), []);

    Logger.log(`Total imágenes encontradas: ${todasLasImagenes.length}`);
    Logger.log("");

    // Agrupar por ruta para mostrar progreso
    const imagenesPorRuta = {};
    todasLasImagenes.forEach(img => {
      if (!imagenesPorRuta[img.ruta]) {
        imagenesPorRuta[img.ruta] = [];
      }
      imagenesPorRuta[img.ruta].push(img);
    });

    const rutas = Object.keys(imagenesPorRuta);
    Logger.log(`Carpetas con imágenes: ${rutas.length}`);
    Logger.log("");

    let totalActualizados = 0;
    let totalNoEncontrados = [];
    let totalErrores = [];
    let procesadas = 0;

    // Procesar cada ruta
    for (let i = 0; i < rutas.length; i++) {
      const ruta = rutas[i];
      const imagenes = imagenesPorRuta[ruta];
      Logger.log(`[${i + 1}/${rutas.length}] ${ruta} (${imagenes.length} imágenes)`);

      let actualizadosEnRuta = 0;

      for (const img of imagenes) {
        procesadas++;

        try {
          const resultado = actualizarImagenProducto(img.sku, img.url);

          if (resultado.success) {
            totalActualizados++;
            actualizadosEnRuta++;
          } else {
            totalNoEncontrados.push(`${img.sku} (${ruta})`);
          }
        } catch (e) {
          totalErrores.push(`${img.sku}: ${e.message}`);
        }

        // Log progreso cada 100 imágenes
        if (procesadas % 100 === 0) {
          Logger.log(`   ... ${procesadas}/${todasLasImagenes.length} procesadas, ${totalActualizados} actualizadas`);
        }
      }

      Logger.log(`   → ${actualizadosEnRuta}/${imagenes.length} actualizadas`);
    }

    // Calcular tiempo de ejecución
    const endTime = new Date();
    const duracionMs = endTime - startTime;
    const duracionMin = Math.floor(duracionMs / 60000);
    const duracionSeg = Math.floor((duracionMs % 60000) / 1000);

    // Resumen final
    Logger.log("\n========================================");
    Logger.log("           RESUMEN FINAL");
    Logger.log("========================================");
    Logger.log(`Total imágenes encontradas: ${todasLasImagenes.length}`);
    Logger.log(`Productos actualizados:     ${totalActualizados}`);
    Logger.log(`No encontrados en Firestore: ${totalNoEncontrados.length}`);
    Logger.log(`Errores:                    ${totalErrores.length}`);
    Logger.log(`Tiempo de ejecución:        ${duracionMin}m ${duracionSeg}s`);
    Logger.log("========================================");

    if (totalNoEncontrados.length > 0 && totalNoEncontrados.length <= 20) {
      Logger.log("\nSKUs no encontrados:");
      totalNoEncontrados.forEach(sku => Logger.log(`  - ${sku}`));
    } else if (totalNoEncontrados.length > 20) {
      Logger.log(`\nPrimeros 20 SKUs no encontrados:`);
      totalNoEncontrados.slice(0, 20).forEach(sku => Logger.log(`  - ${sku}`));
      Logger.log(`  ... y ${totalNoEncontrados.length - 20} más`);
    }

    if (totalErrores.length > 0) {
      Logger.log("\nErrores encontrados:");
      totalErrores.slice(0, 10).forEach(err => Logger.log(`  - ${err}`));
    }

    return {
      success: true,
      totalImagenes: todasLasImagenes.length,
      actualizados: totalActualizados,
      noEncontrados: totalNoEncontrados.length,
      errores: totalErrores.length,
      duracion: `${duracionMin}m ${duracionSeg}s`
    };

  } catch (error) {
    Logger.log(`ERROR CRÍTICO: ${error.message}`);
    Logger.log(error.stack);
    return { success: false, error: error.message };
  }
}

// ============================================
// SINCRONIZACIÓN DE FICHAS TÉCNICAS
// ============================================

/**
 * ID de la carpeta de fichas técnicas en Google Drive
 */
const CARPETA_FICHAS_TECNICAS_ID = "1Z_-ofehBnsSVtRw9_RydMSxRn99ykEBz";

/**
 * Genera la URL de descarga directa de un PDF de Google Drive
 * @param {string} fileId - ID del archivo en Drive
 * @returns {string} - URL de descarga
 */
function generarUrlDescargaPDF(fileId) {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

/**
 * Verifica si un archivo es un PDF
 */
function esPDF(nombreArchivo) {
  return /\.pdf$/i.test(nombreArchivo);
}

/**
 * Busca PDFs recursivamente en una carpeta y sus subcarpetas
 * @param {Folder} carpeta - Carpeta de Drive
 * @param {Object} mapa - Objeto para almacenar los PDFs encontrados
 * @param {string} ruta - Ruta actual para logging
 */
function buscarPDFsRecursivo(carpeta, mapa, ruta = "") {
  const rutaActual = ruta ? `${ruta}/${carpeta.getName()}` : carpeta.getName();

  // Buscar PDFs en la carpeta actual
  const archivos = carpeta.getFiles();
  while (archivos.hasNext()) {
    const archivo = archivos.next();
    const nombre = archivo.getName();
    if (esPDF(nombre)) {
      const nombreSinExt = nombre.replace(/\.pdf$/i, "").trim().toUpperCase();
      mapa[nombreSinExt] = {
        url: generarUrlDescargaPDF(archivo.getId()),
        fileId: archivo.getId(),
        nombre: nombre,
        ruta: rutaActual
      };
    }
  }

  // Buscar en subcarpetas
  const subcarpetas = carpeta.getFolders();
  while (subcarpetas.hasNext()) {
    buscarPDFsRecursivo(subcarpetas.next(), mapa, rutaActual);
  }
}

/**
 * Lista las fichas técnicas de la carpeta (RECURSIVO)
 */
function listarFichasTecnicas() {
  Logger.log("=== LISTANDO FICHAS TÉCNICAS (RECURSIVO) ===");

  try {
    const carpeta = DriveApp.getFolderById(CARPETA_FICHAS_TECNICAS_ID);
    Logger.log(`Carpeta raíz: ${carpeta.getName()}`);

    // Buscar todos los PDFs recursivamente
    const mapaFichas = {};
    buscarPDFsRecursivo(carpeta, mapaFichas);

    const fichas = Object.keys(mapaFichas);
    Logger.log(`\nTotal encontrados: ${fichas.length} PDFs\n`);

    // Mostrar los primeros 20 para no saturar el log
    const mostrar = fichas.slice(0, 20);
    mostrar.forEach((nombre, i) => {
      const ficha = mapaFichas[nombre];
      Logger.log(`${i + 1}. ${nombre}`);
      Logger.log(`   Archivo: ${ficha.nombre}`);
      Logger.log(`   Ruta: ${ficha.ruta}`);
    });

    if (fichas.length > 20) {
      Logger.log(`\n... y ${fichas.length - 20} más`);
    }

    Logger.log(`\n=== TOTAL: ${fichas.length} fichas técnicas ===`);

  } catch (error) {
    Logger.log(`ERROR: ${error.message}`);
  }
}

/**
 * Sincroniza fichas técnicas de Drive con productos en Firestore
 * Busca RECURSIVAMENTE en subcarpetas
 * Busca productos que tengan el campo ficha_tecnica y actualiza con la URL
 */
function sincronizarFichasTecnicas() {
  Logger.log("=== INICIANDO SINCRONIZACIÓN DE FICHAS TÉCNICAS (RECURSIVO) ===");

  try {
    const carpeta = DriveApp.getFolderById(CARPETA_FICHAS_TECNICAS_ID);
    Logger.log(`Carpeta raíz: ${carpeta.getName()}`);

    // Crear mapeo de fichas RECURSIVAMENTE: nombre -> URL
    const mapaFichas = {};
    buscarPDFsRecursivo(carpeta, mapaFichas);

    Logger.log(`Total PDFs encontrados: ${Object.keys(mapaFichas).length}`);

    // Obtener todos los productos de Firestore
    const token = ScriptApp.getOAuthToken();
    const queryUrl = `${FIRESTORE_URL}:runQuery`;

    const queryBody = {
      structuredQuery: {
        from: [{ collectionId: COLECCIONES.productos }],
        limit: 1000
      }
    };

    const queryResponse = UrlFetchApp.fetch(queryUrl, {
      method: "POST",
      contentType: "application/json",
      headers: { Authorization: `Bearer ${token}` },
      payload: JSON.stringify(queryBody),
      muteHttpExceptions: true
    });

    const productos = JSON.parse(queryResponse.getContentText());
    let actualizados = 0;
    let sinFicha = 0;

    // Actualizar cada producto que tenga ficha_tecnica
    for (const item of productos) {
      if (!item.document) continue;

      const fields = item.document.fields;
      const fichaTecnicaRef = fields.ficha_tecnica?.stringValue;
      const codInterno = fields.cod_interno?.stringValue || 'N/A';

      // Normalizar a mayúsculas para comparación
      const fichaNormalizada = fichaTecnicaRef ? fichaTecnicaRef.trim().toUpperCase() : null;

      if (fichaNormalizada && mapaFichas[fichaNormalizada]) {
        // Actualizar producto con URL de ficha técnica
        const docPath = item.document.name;
        const docId = docPath.split("/").pop();
        const urlFicha = mapaFichas[fichaNormalizada].url;

        const updateUrl = `${FIRESTORE_URL}/${COLECCIONES.productos}/${docId}?updateMask.fieldPaths=ficha_tecnica_url&updateMask.fieldPaths=updated_at`;

        const updateBody = {
          fields: {
            ficha_tecnica_url: { stringValue: urlFicha },
            updated_at: { stringValue: new Date().toISOString() }
          }
        };

        const updateResponse = UrlFetchApp.fetch(updateUrl, {
          method: "PATCH",
          contentType: "application/json",
          headers: { Authorization: `Bearer ${token}` },
          payload: JSON.stringify(updateBody),
          muteHttpExceptions: true
        });

        if (updateResponse.getResponseCode() === 200) {
          actualizados++;
          Logger.log(`✓ ${codInterno}: Ficha técnica asignada (${fichaNormalizada})`);
        } else {
          Logger.log(`✗ ${codInterno}: Error HTTP ${updateResponse.getResponseCode()}`);
        }
      } else if (fichaNormalizada) {
        Logger.log(`⚠ ${codInterno}: Ficha '${fichaNormalizada}' no encontrada en Drive`);
        sinFicha++;
      }
    }

    Logger.log("\n=== RESUMEN ===");
    Logger.log(`Productos actualizados: ${actualizados}`);
    Logger.log(`Fichas no encontradas: ${sinFicha}`);

  } catch (error) {
    Logger.log(`ERROR: ${error.message}`);
  }
}

/**
 * Diagnóstico completo de la carpeta IMAGENES - RECURSIVO
 * Muestra estructura de TODAS las subcarpetas en cualquier nivel
 */
function diagnosticarCarpetaImagenes() {
  Logger.log("=== DIAGNÓSTICO CARPETA IMAGENES (RECURSIVO) ===");
  Logger.log(`ID: ${CARPETA_TODAS_IMAGENES_ID}`);
  Logger.log("");

  try {
    const carpeta = DriveApp.getFolderById(CARPETA_TODAS_IMAGENES_ID);
    Logger.log(`Carpeta principal: ${carpeta.getName()}`);
    Logger.log("");

    // Usar función recursiva para obtener todas las imágenes
    Logger.log("Escaneando recursivamente...");
    const todasLasImagenes = obtenerImagenesRecursivo(carpeta, carpeta.getName(), []);

    Logger.log(`\nTotal imágenes encontradas: ${todasLasImagenes.length}`);
    Logger.log("");

    // Agrupar por ruta
    const imagenesPorRuta = {};
    todasLasImagenes.forEach(img => {
      if (!imagenesPorRuta[img.ruta]) {
        imagenesPorRuta[img.ruta] = [];
      }
      imagenesPorRuta[img.ruta].push(img);
    });

    // Mostrar estructura
    Logger.log("ESTRUCTURA DE CARPETAS:");
    Logger.log("─────────────────────────────────────");

    const rutas = Object.keys(imagenesPorRuta).sort();
    rutas.forEach(ruta => {
      const imagenes = imagenesPorRuta[ruta];
      const nivel = (ruta.match(/\//g) || []).length;
      const indent = "  ".repeat(nivel);
      const nombreCarpeta = ruta.split("/").pop();

      Logger.log(`${indent}📁 ${nombreCarpeta}: ${imagenes.length} imágenes`);

      // Mostrar ejemplos de SKUs
      if (imagenes.length > 0) {
        const ejemplos = imagenes.slice(0, 3).map(img => img.sku);
        Logger.log(`${indent}   Ejemplos: ${ejemplos.join(", ")}`);
      }
    });

    // Resumen
    Logger.log("");
    Logger.log("========================================");
    Logger.log("           RESUMEN");
    Logger.log("========================================");
    Logger.log(`Total carpetas con imágenes: ${rutas.length}`);
    Logger.log(`Total imágenes encontradas:  ${todasLasImagenes.length}`);
    Logger.log("");

    // Top 5 carpetas con más imágenes
    const rutasOrdenadas = rutas
      .map(r => ({ ruta: r, count: imagenesPorRuta[r].length }))
      .sort((a, b) => b.count - a.count);

    Logger.log("Top 5 carpetas con más imágenes:");
    rutasOrdenadas.slice(0, 5).forEach((item, i) => {
      Logger.log(`  ${i + 1}. ${item.ruta}: ${item.count}`);
    });

    // Mostrar algunos SKUs de ejemplo
    Logger.log("");
    Logger.log("Muestra de SKUs encontrados:");
    todasLasImagenes.slice(0, 10).forEach(img => {
      Logger.log(`  - ${img.sku} (${img.ruta})`);
    });
    if (todasLasImagenes.length > 10) {
      Logger.log(`  ... y ${todasLasImagenes.length - 10} más`);
    }

    return {
      success: true,
      totalCarpetas: rutas.length,
      totalImagenes: todasLasImagenes.length,
      rutas: rutasOrdenadas
    };

  } catch (error) {
    Logger.log(`ERROR: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// ============================================
// EXTRACCIÓN DE CONTENIDO DE FICHAS TÉCNICAS
// ============================================

/**
 * Extrae texto de un PDF usando Google Drive OCR
 * @param {string} fileId - ID del archivo PDF
 * @returns {string} - Texto extraído del PDF
 */
function extraerTextoPDF(fileId) {
  try {
    const pdfFile = DriveApp.getFileById(fileId);
    const pdfBlob = pdfFile.getBlob();

    // Crear un archivo temporal de Google Docs para OCR (Drive API v3)
    const resource = {
      name: "temp_ocr_" + new Date().getTime(),
      mimeType: "application/vnd.google-apps.document"
    };

    // Convertir PDF a Google Docs (esto hace OCR automático)
    const docFile = Drive.Files.create(resource, pdfBlob, {
      ocrLanguage: "es",
      fields: "id"
    });

    // Obtener el contenido del documento
    const doc = DocumentApp.openById(docFile.id);
    const texto = doc.getBody().getText();

    // Eliminar el archivo temporal
    DriveApp.getFileById(docFile.id).setTrashed(true);

    return texto.trim();
  } catch (error) {
    Logger.log(`Error extrayendo texto de PDF ${fileId}: ${error.message}`);
    return null;
  }
}

/**
 * Procesa una ficha técnica y extrae información estructurada
 * @param {string} texto - Texto crudo del PDF
 * @returns {Object} - Información estructurada
 */
function parsearFichaTecnica(texto) {
  const info = {
    contenido_completo: texto,
    composicion: null,
    usos: null,
    rendimiento: null,
    preparacion: null,
    aplicacion: null,
    secado: null,
    diluyente: null,
    colores: null,
    presentaciones: null,
    complementarios: null,
    precauciones: null
  };

  if (!texto) return info;

  const textoLower = texto.toLowerCase();
  const lineas = texto.split('\n');

  // Buscar secciones comunes en fichas técnicas
  const secciones = {
    'composicion': /composici[oó]n|ingredientes|componentes/i,
    'usos': /usos?|aplicaciones?|recomendado para/i,
    'rendimiento': /rendimiento|cobertura|m2|metros/i,
    'preparacion': /preparaci[oó]n|superficie|antes de aplicar/i,
    'aplicacion': /m[eé]todo|aplicaci[oó]n|c[oó]mo aplicar/i,
    'secado': /secado|tiempo|seco al tacto/i,
    'diluyente': /diluyente|diluci[oó]n|adelgazar/i,
    'colores': /colores?|tonos?|disponible en/i,
    'presentaciones': /presentaci[oó]n|envase|gal[oó]n|cuñete/i,
    'precauciones': /precauci[oó]n|seguridad|advertencia/i
  };

  // Extraer texto después de cada sección encontrada
  for (const [campo, regex] of Object.entries(secciones)) {
    for (let i = 0; i < lineas.length; i++) {
      if (regex.test(lineas[i])) {
        // Tomar las siguientes 3-5 líneas como contenido de la sección
        let contenido = [];
        for (let j = i; j < Math.min(i + 5, lineas.length); j++) {
          if (lineas[j].trim()) {
            contenido.push(lineas[j].trim());
          }
        }
        info[campo] = contenido.join(' ').substring(0, 500); // Limitar a 500 chars
        break;
      }
    }
  }

  return info;
}

/**
 * Procesa TODAS las fichas técnicas y guarda el contenido en Firestore
 * Ejecutar una vez para poblar la base de datos
 */
function procesarFichasTecnicasContenido() {
  Logger.log("=== PROCESANDO CONTENIDO DE FICHAS TÉCNICAS ===");

  try {
    const carpeta = DriveApp.getFolderById(CARPETA_FICHAS_TECNICAS_ID);
    Logger.log(`Carpeta raíz: ${carpeta.getName()}`);

    // Obtener todos los PDFs recursivamente
    const mapaFichas = {};
    buscarPDFsRecursivo(carpeta, mapaFichas);

    const fichas = Object.keys(mapaFichas);
    Logger.log(`Total PDFs encontrados: ${fichas.length}`);

    let procesadas = 0;
    let errores = 0;

    for (const nombreFicha of fichas) {
      const ficha = mapaFichas[nombreFicha];
      Logger.log(`\nProcesando: ${nombreFicha}`);

      try {
        // Extraer texto del PDF
        const texto = extraerTextoPDF(ficha.fileId);

        if (texto) {
          // Parsear información estructurada
          const infoEstructurada = parsearFichaTecnica(texto);

          // Guardar en Firestore en colección fichas_tecnicas
          const token = ScriptApp.getOAuthToken();
          const docUrl = `${FIRESTORE_URL}/fichas_tecnicas/${nombreFicha}`;

          const firestoreData = {
            fields: {
              nombre: { stringValue: nombreFicha },
              archivo: { stringValue: ficha.nombre },
              url_pdf: { stringValue: ficha.url },
              ruta_drive: { stringValue: ficha.ruta },
              contenido_completo: { stringValue: (infoEstructurada.contenido_completo || "").substring(0, 10000) },
              ft_composicion: { stringValue: infoEstructurada.composicion || "" },
              ft_usos: { stringValue: infoEstructurada.usos || "" },
              ft_rendimiento: { stringValue: infoEstructurada.rendimiento || "" },
              ft_preparacion: { stringValue: infoEstructurada.preparacion || "" },
              ft_aplicacion: { stringValue: infoEstructurada.aplicacion || "" },
              ft_secado: { stringValue: infoEstructurada.secado || "" },
              ft_diluyente: { stringValue: infoEstructurada.diluyente || "" },
              ft_colores: { stringValue: infoEstructurada.colores || "" },
              ft_presentaciones: { stringValue: infoEstructurada.presentaciones || "" },
              ft_precauciones: { stringValue: infoEstructurada.precauciones || "" },
              procesado_at: { stringValue: new Date().toISOString() }
            }
          };

          const response = UrlFetchApp.fetch(docUrl, {
            method: "PATCH",
            contentType: "application/json",
            headers: { Authorization: `Bearer ${token}` },
            payload: JSON.stringify(firestoreData),
            muteHttpExceptions: true
          });

          if (response.getResponseCode() === 200) {
            procesadas++;
            Logger.log(`✓ Guardada en Firestore`);
          } else {
            Logger.log(`✗ Error HTTP ${response.getResponseCode()}`);
            errores++;
          }
        } else {
          Logger.log(`⚠ No se pudo extraer texto`);
          errores++;
        }

        // Pausa para evitar límites de API
        Utilities.sleep(1000);

      } catch (e) {
        Logger.log(`✗ Error: ${e.message}`);
        errores++;
      }
    }

    Logger.log("\n=== RESUMEN ===");
    Logger.log(`Fichas procesadas: ${procesadas}`);
    Logger.log(`Errores: ${errores}`);

    return { success: true, procesadas, errores };

  } catch (error) {
    Logger.log(`ERROR: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Vincula el contenido de fichas técnicas a los productos
 * Busca productos con ficha_tecnica y les agrega el contenido procesado
 */
function vincularFichasConProductos() {
  Logger.log("=== VINCULANDO FICHAS TÉCNICAS CON PRODUCTOS ===");

  try {
    const token = ScriptApp.getOAuthToken();

    // Obtener todas las fichas técnicas procesadas
    const fichasUrl = `${FIRESTORE_URL}/fichas_tecnicas`;
    const fichasResponse = UrlFetchApp.fetch(fichasUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      muteHttpExceptions: true
    });

    const fichasData = JSON.parse(fichasResponse.getContentText());
    const fichas = {};

    if (fichasData.documents) {
      for (const doc of fichasData.documents) {
        const nombre = doc.name.split("/").pop();
        fichas[nombre] = doc.fields;
      }
    }

    Logger.log(`Fichas técnicas en Firestore: ${Object.keys(fichas).length}`);

    // Obtener productos con campo ficha_tecnica
    const queryUrl = `${FIRESTORE_URL}:runQuery`;
    const queryBody = {
      structuredQuery: {
        from: [{ collectionId: COLECCIONES.productos }],
        limit: 2000
      }
    };

    const queryResponse = UrlFetchApp.fetch(queryUrl, {
      method: "POST",
      contentType: "application/json",
      headers: { Authorization: `Bearer ${token}` },
      payload: JSON.stringify(queryBody),
      muteHttpExceptions: true
    });

    const productos = JSON.parse(queryResponse.getContentText());
    let actualizados = 0;

    for (const item of productos) {
      if (!item.document) continue;

      const fields = item.document.fields;
      const fichaTecnicaRef = fields.ficha_tecnica?.stringValue;
      const codInterno = fields.cod_interno?.stringValue || 'N/A';

      if (!fichaTecnicaRef) continue;

      const fichaNormalizada = fichaTecnicaRef.trim().toUpperCase();
      const fichaData = fichas[fichaNormalizada];

      if (fichaData) {
        // Actualizar producto con contenido de ficha técnica
        const docPath = item.document.name;
        const docId = docPath.split("/").pop();

        const updateUrl = `${FIRESTORE_URL}/${COLECCIONES.productos}/${docId}?` +
          "updateMask.fieldPaths=ficha_tecnica_contenido&" +
          "updateMask.fieldPaths=ft_composicion&" +
          "updateMask.fieldPaths=ft_usos&" +
          "updateMask.fieldPaths=ft_rendimiento&" +
          "updateMask.fieldPaths=ft_preparacion&" +
          "updateMask.fieldPaths=ft_aplicacion&" +
          "updateMask.fieldPaths=ft_secado&" +
          "updateMask.fieldPaths=ft_diluyente&" +
          "updateMask.fieldPaths=ft_complementarios&" +
          "updateMask.fieldPaths=updated_at";

        const updateBody = {
          fields: {
            ficha_tecnica_contenido: fichaData.contenido_completo || { stringValue: "" },
            ft_composicion: fichaData.ft_composicion || { stringValue: "" },
            ft_usos: fichaData.ft_usos || { stringValue: "" },
            ft_rendimiento: fichaData.ft_rendimiento || { stringValue: "" },
            ft_preparacion: fichaData.ft_preparacion || { stringValue: "" },
            ft_aplicacion: fichaData.ft_aplicacion || { stringValue: "" },
            ft_secado: fichaData.ft_secado || { stringValue: "" },
            ft_diluyente: fichaData.ft_diluyente || { stringValue: "" },
            ft_complementarios: { stringValue: "" }, // Se puede llenar manualmente
            updated_at: { stringValue: new Date().toISOString() }
          }
        };

        const updateResponse = UrlFetchApp.fetch(updateUrl, {
          method: "PATCH",
          contentType: "application/json",
          headers: { Authorization: `Bearer ${token}` },
          payload: JSON.stringify(updateBody),
          muteHttpExceptions: true
        });

        if (updateResponse.getResponseCode() === 200) {
          actualizados++;
          Logger.log(`✓ ${codInterno}: Contenido de ficha vinculado`);
        }
      }
    }

    Logger.log("\n=== RESUMEN ===");
    Logger.log(`Productos actualizados: ${actualizados}`);

    return { success: true, actualizados };

  } catch (error) {
    Logger.log(`ERROR: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Agrega opciones al menú de Google Sheets
 * NOTA: El menú principal está en Utils.gs
 */
