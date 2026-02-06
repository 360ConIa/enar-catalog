/**
 * MCP Tool: Verificar Stock
 * Verifica disponibilidad de stock de un producto específico
 */

const admin = require('firebase-admin');

/**
 * Verifica si hay suficiente stock de un producto
 *
 * @param {Object} params - Parámetros de verificación
 * @param {string} params.sku - Código interno del producto
 * @param {number} params.cantidad_requerida - Unidades que necesita el cliente
 * @returns {Promise<Object>} Información de disponibilidad
 */
async function verificarStock({ sku, cantidad_requerida }) {
  try {
    const db = admin.firestore();

    // Buscar producto por SKU
    const snapshot = await db.collection('productos')
      .where('cod_interno', '==', sku)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return {
        sku: sku,
        disponible: false,
        stock_actual: 0,
        cantidad_requerida: cantidad_requerida,
        faltante: cantidad_requerida,
        mensaje: `❌ Producto ${sku} no encontrado en el catálogo`
      };
    }

    const doc = snapshot.docs[0];
    const data = doc.data();
    const stock_actual = data.cantidad || 0;
    const disponible = stock_actual >= cantidad_requerida;
    const faltante = Math.max(0, cantidad_requerida - stock_actual);
    const embalaje = data.embalaje || 1;

    return {
      sku: sku,
      nombre: data.titulo,
      categoria: data.categoria,
      disponible: disponible,
      stock_actual: stock_actual,
      cantidad_requerida: cantidad_requerida,
      faltante: faltante,
      embalaje: embalaje,
      // Precios para cotización
      precio_mayorista: data.precio_mayorista || 0,
      precio_negocio: data.precio_negocio || 0,
      precio_persona_natural: data.precio_persona_natural || 0,
      impuesto: data.impuesto || 0.19,
      tiene_ficha_tecnica: !!(data.ficha_tecnica_url || data.ficha_tecnica),
      mensaje: disponible
        ? `✅ Disponible: ${stock_actual} unidades en stock`
        : `⚠️ Stock insuficiente: solo ${stock_actual} de ${cantidad_requerida} solicitadas (faltan ${faltante})`
    };

  } catch (error) {
    console.error('Error en verificarStock:', error);
    return {
      sku: sku,
      disponible: false,
      mensaje: `Error al verificar stock: ${error.message}`
    };
  }
}

// Definición de la herramienta para Vertex AI
const TOOL_DEFINITION = {
  name: 'verificar_stock',
  description: 'Verifica si hay suficiente stock disponible de un producto específico',
  parameters: {
    type: 'object',
    properties: {
      sku: {
        type: 'string',
        description: 'Código interno del producto (SKU)'
      },
      cantidad_requerida: {
        type: 'number',
        description: 'Cantidad de unidades que el cliente necesita'
      }
    },
    required: ['sku', 'cantidad_requerida']
  }
};

module.exports = {
  verificarStock,
  TOOL_DEFINITION
};
