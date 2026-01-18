// ============================================
// CONFIGURACIÓN GENERAL DEL PROYECTO
// ============================================
// Archivo: Config.gs
// Descripción: Constantes y configuración para la sincronización
//              entre Google Sheets y Firebase Firestore
// ============================================

/**
 * Configuración de Firebase
 * Obtener estos valores desde Firebase Console > Configuración del proyecto
 */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCKZdRRrG_p71bb0fzLQRPluF-jgbkeOtA",
  projectId: "farmaweb-b2b"
};

/**
 * URL base de la API REST de Firestore
 * No modificar a menos que cambies de base de datos
 */
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;

/**
 * Nombre de la hoja de Google Sheets que contiene los productos
 * Cambiar este valor si tu hoja tiene un nombre diferente
 */
const NOMBRE_HOJA = "Productos";

/**
 * Configuración de logging
 * Cada cuántos productos mostrar progreso en los logs
 */
const LOG_CADA_N_PRODUCTOS = 50;

/**
 * Nombres de las colecciones en Firestore
 */
const COLECCIONES = {
  productos: "productos",
  configuracion: "configuracion"
};

/**
 * ID del documento de configuración general
 */
const DOC_CONFIGURACION_GENERAL = "general";

/**
 * Configuración de sincronización por lotes
 * Para evitar el límite de 6 minutos de Apps Script
 */
const PRODUCTOS_POR_LOTE = 500;

/**
 * Campo en configuracion/general donde se guarda el checkpoint
 */
const CAMPO_CHECKPOINT = "ultimo_indice_sincronizado";
