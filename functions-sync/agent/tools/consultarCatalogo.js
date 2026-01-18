/**
 * MCP Tool: Consultar Catálogo
 * Busca productos en Firestore por texto de búsqueda
 */

const admin = require('firebase-admin');

/**
 * Busca productos en el catálogo de Farmaweb
 *
 * @param {Object} params - Parámetros de búsqueda
 * @param {string} params.query - Texto de búsqueda (nombre, principio activo, indicación)
 * @param {string} [params.laboratorio] - Filtro opcional por laboratorio
 * @param {string} [params.marca] - Filtro opcional por marca
 * @param {number} [params.limite=10] - Máximo de resultados a retornar
 * @returns {Promise<Object>} Resultados de la búsqueda
 */
async function consultarCatalogo({ query, laboratorio, marca, limite = 10 }) {
  try {
    const db = admin.firestore();
    let productosRef = db.collection('productos');

    // Query base: solo productos activos
    let queryRef = productosRef.where('activo', '==', true);

    // Aplicar filtros opcionales
    if (laboratorio) {
      queryRef = queryRef.where('laboratorio', '==', laboratorio);
    }
    if (marca) {
      queryRef = queryRef.where('marca', '==', marca);
    }

    // Obtener documentos (máximo 100 para no saturar)
    const snapshot = await queryRef.limit(100).get();

    if (snapshot.empty) {
      return {
        encontrados: 0,
        productos: [],
        mensaje: `No se encontraron productos${laboratorio ? ` de ${laboratorio}` : ''}${marca ? ` marca ${marca}` : ''}`
      };
    }

    // Filtrar por texto de búsqueda
    const queryLower = query.toLowerCase();
    const productos = [];

    snapshot.forEach(doc => {
      const data = doc.data();

      // Buscar en múltiples campos
      const titulo = (data.titulo || '').toLowerCase();
      const principio = (data.principio_activo || '').toLowerCase();
      const indicacion = (data.indicacion || '').toLowerCase();

      // Si el query coincide en alguno de los campos
      if (titulo.includes(queryLower) ||
          principio.includes(queryLower) ||
          indicacion.includes(queryLower)) {

        productos.push({
          sku: data.cod_interno,
          nombre: data.titulo,
          precio: data.p_real,
          precio_regular: data.p_corriente,
          stock: data.cantidad,
          laboratorio: data.laboratorio,
          marca: data.marca,
          principio_activo: data.principio_activo,
          indicacion: data.indicacion
        });
      }
    });

    // Ordenar por nombre y limitar resultados
    productos.sort((a, b) => a.nombre.localeCompare(b.nombre));
    const resultados = productos.slice(0, limite);

    return {
      encontrados: resultados.length,
      productos: resultados,
      mensaje: `Se encontraron ${resultados.length} productos para "${query}"`
    };

  } catch (error) {
    console.error('Error en consultarCatalogo:', error);
    return {
      encontrados: 0,
      productos: [],
      mensaje: `Error al buscar productos: ${error.message}`
    };
  }
}

// Definición de la herramienta para Vertex AI
const TOOL_DEFINITION = {
  name: 'consultar_catalogo',
  description: 'Busca productos en el catálogo de Farmaweb por nombre, principio activo o indicación',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Texto de búsqueda (nombre del producto, principio activo, indicación)'
      },
      laboratorio: {
        type: 'string',
        description: 'Filtrar por laboratorio (opcional)'
      },
      marca: {
        type: 'string',
        description: 'Filtrar por marca (opcional)'
      },
      limite: {
        type: 'number',
        description: 'Máximo de resultados a retornar (default: 10)'
      }
    },
    required: ['query']
  }
};

module.exports = {
  consultarCatalogo,
  TOOL_DEFINITION
};
