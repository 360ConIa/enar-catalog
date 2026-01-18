/**
 * ============================================
 * FUNCIONES DE UTILIDAD
 * ============================================
 * Archivo: utils.js
 * Descripción: Funciones auxiliares para formateo
 *              y presentación de datos
 * ============================================
 */

/**
 * Formatea un número como precio en pesos colombianos
 * @param {number} numero - Número a formatear
 * @returns {string} - Precio formateado (ej: "$1,234")
 *
 * @example
 * formatearPrecio(5500) // "$5,500"
 * formatearPrecio(1234567) // "$1,234,567"
 */
function formatearPrecio(numero) {
  if (numero === null || numero === undefined || isNaN(numero)) {
    return '$0';
  }

  // Convertir a número entero (sin decimales para pesos)
  const valor = Math.round(Number(numero));

  // Formatear con separador de miles
  return '$' + valor.toLocaleString('es-CO');
}

/**
 * Genera el HTML del badge de stock según la cantidad
 * @param {number} cantidad - Cantidad disponible
 * @returns {string} - HTML del badge con clase de color
 *
 * @example
 * getStockBadge(100) // '<span class="badge badge--disponible">Disponible</span>'
 * getStockBadge(5)   // '<span class="badge badge--bajo">Stock bajo</span>'
 * getStockBadge(0)   // '<span class="badge badge--agotado">Agotado</span>'
 */
function getStockBadge(cantidad) {
  const stock = Number(cantidad) || 0;

  if (stock === 0) {
    return '<span class="badge badge--agotado">Agotado</span>';
  } else if (stock <= 10) {
    return '<span class="badge badge--bajo">Stock bajo</span>';
  } else {
    return '<span class="badge badge--disponible">Disponible</span>';
  }
}

/**
 * Trunca un texto a una longitud máxima
 * @param {string} texto - Texto a truncar
 * @param {number} maxLength - Longitud máxima
 * @returns {string} - Texto truncado con "..." si excede
 */
function truncarTexto(texto, maxLength = 50) {
  if (!texto) return '';
  if (texto.length <= maxLength) return texto;
  return texto.substring(0, maxLength).trim() + '...';
}

/**
 * Debounce: Retrasa la ejecución de una función
 * Útil para búsquedas en tiempo real
 * @param {Function} func - Función a ejecutar
 * @param {number} wait - Tiempo de espera en ms
 * @returns {Function} - Función con debounce
 */
function debounce(func, wait = 300) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Normaliza un texto para búsqueda
 * Elimina tildes y convierte a minúsculas
 * @param {string} texto - Texto a normalizar
 * @returns {string} - Texto normalizado
 */
function normalizarTexto(texto) {
  if (!texto) return '';
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // Eliminar tildes
}

/**
 * Valida si una URL de imagen es válida
 * @param {string} url - URL a validar
 * @returns {boolean} - true si es válida
 */
function esUrlImagenValida(url) {
  if (!url || typeof url !== 'string') return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

// Exportar funciones
export {
  formatearPrecio,
  getStockBadge,
  truncarTexto,
  debounce,
  normalizarTexto,
  esUrlImagenValida
};
