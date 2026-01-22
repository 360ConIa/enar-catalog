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
 * Sincroniza imágenes de TODAS las subcarpetas (uso futuro)
 * Recorre recursivamente la carpeta principal
 */
function sincronizarTodasLasImagenes() {
  Logger.log("=== SINCRONIZACIÓN COMPLETA DE IMÁGENES ===");

  try {
    const carpetaPrincipal = DriveApp.getFolderById(CARPETA_TODAS_IMAGENES_ID);
    let totalActualizados = 0;
    let totalNoEncontrados = [];

    // Procesar subcarpetas (cada categoría)
    const subcarpetas = carpetaPrincipal.getFolders();

    while (subcarpetas.hasNext()) {
      const subcarpeta = subcarpetas.next();
      Logger.log(`\nProcesando carpeta: ${subcarpeta.getName()}`);

      const archivos = subcarpeta.getFiles();

      while (archivos.hasNext()) {
        const archivo = archivos.next();
        const nombre = archivo.getName();
        const sku = nombre.replace(/\.(png|jpg|jpeg|gif|webp)$/i, "").trim();
        const url = generarUrlImagen(archivo.getId());

        const resultado = actualizarImagenProducto(sku, url);

        if (resultado.success) {
          totalActualizados++;
        } else {
          totalNoEncontrados.push(sku);
        }
      }
    }

    Logger.log("\n=== RESUMEN FINAL ===");
    Logger.log(`Total productos actualizados: ${totalActualizados}`);
    Logger.log(`Total no encontrados: ${totalNoEncontrados.length}`);

  } catch (error) {
    Logger.log(`ERROR: ${error.message}`);
  }
}

// ============================================
// SINCRONIZACIÓN DE FICHAS TÉCNICAS
// ============================================

/**
 * ID de la carpeta de fichas técnicas en Google Drive
 */
const CARPETA_FICHAS_TECNICAS_ID = "1p_ep3Et6bfqk5wJH3tz3diZMzyGFRBOK";

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
 * Lista las fichas técnicas de la carpeta
 */
function listarFichasTecnicas() {
  Logger.log("=== LISTANDO FICHAS TÉCNICAS ===");

  try {
    const carpeta = DriveApp.getFolderById(CARPETA_FICHAS_TECNICAS_ID);
    Logger.log(`Carpeta: ${carpeta.getName()}`);
    let count = 0;

    const archivos = carpeta.getFiles();
    while (archivos.hasNext()) {
      const archivo = archivos.next();
      const nombre = archivo.getName();
      if (esPDF(nombre)) {
        const nombreSinExt = nombre.replace(/\.pdf$/i, "").trim();
        const url = generarUrlDescargaPDF(archivo.getId());
        Logger.log(`${++count}. Nombre: ${nombreSinExt}`);
        Logger.log(`   Archivo: ${nombre}`);
        Logger.log(`   URL: ${url}`);
        Logger.log("");
      }
    }

    Logger.log(`Total: ${count} fichas técnicas`);

  } catch (error) {
    Logger.log(`ERROR: ${error.message}`);
  }
}

/**
 * Sincroniza fichas técnicas de Drive con productos en Firestore
 * Busca productos que tengan el campo ficha_tecnica y actualiza con la URL
 */
function sincronizarFichasTecnicas() {
  Logger.log("=== INICIANDO SINCRONIZACIÓN DE FICHAS TÉCNICAS ===");

  try {
    const carpeta = DriveApp.getFolderById(CARPETA_FICHAS_TECNICAS_ID);
    Logger.log(`Carpeta: ${carpeta.getName()}`);

    // Crear mapeo de fichas: nombre -> URL
    const mapaFichas = {};
    const archivos = carpeta.getFiles();

    while (archivos.hasNext()) {
      const archivo = archivos.next();
      const nombre = archivo.getName();
      if (esPDF(nombre)) {
        const nombreSinExt = nombre.replace(/\.pdf$/i, "").trim();
        mapaFichas[nombreSinExt] = {
          url: generarUrlDescargaPDF(archivo.getId()),
          fileId: archivo.getId(),
          nombre: nombre
        };
      }
    }

    Logger.log(`Fichas encontradas: ${Object.keys(mapaFichas).join(", ")}`);

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

      if (fichaTecnicaRef && mapaFichas[fichaTecnicaRef]) {
        // Actualizar producto con URL de ficha técnica
        const docPath = item.document.name;
        const docId = docPath.split("/").pop();
        const urlFicha = mapaFichas[fichaTecnicaRef].url;

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
          Logger.log(`✓ ${codInterno}: Ficha técnica asignada (${fichaTecnicaRef})`);
        } else {
          Logger.log(`✗ ${codInterno}: Error HTTP ${updateResponse.getResponseCode()}`);
        }
      } else if (fichaTecnicaRef) {
        Logger.log(`⚠ ${codInterno}: Ficha '${fichaTecnicaRef}' no encontrada en Drive`);
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
 * Agrega opciones al menú de Google Sheets
 * NOTA: El menú principal está en Utils.gs
 */
