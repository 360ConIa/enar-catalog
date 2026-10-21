/**
 * MCP Tool: Agregar al Carrito
 * Devuelve productos para que el frontend los agregue al carrito local
 */

const admin = require('firebase-admin');
const { obtenerListaCliente, precioProducto } = require('../precios');

/**
 * Prepara productos para agregar al carrito
 * Esta herramienta NO modifica nada en el servidor
 * Solo devuelve los datos para que el frontend los agregue al localStorage
 *
 * @param {Object} params - Parámetros
 * @param {Array} params.items - Lista de items [{sku, cantidad}]
 * @returns {Promise<Object>} Productos listos para el carrito
 */
async function agregarCarrito({ items, user_id }) {
  try {
    const db = admin.firestore();
    // El precio lo resuelve el servidor con la lista del cliente, igual que el B2B
    const lista = await obtenerListaCliente(user_id);
    const productosParaCarrito = [];
    const errores = [];

    for (const item of items) {
      const snapshot = await db.collection('productos')
        .where('cod_interno', '==', item.sku)
        .where('activo', '==', true)
        .limit(1)
        .get();

      if (snapshot.empty) {
        errores.push(`SKU ${item.sku} no encontrado`);
        continue;
      }

      const prod = snapshot.docs[0].data();
      const stockDisponible = prod.cantidad || 0;

      if (stockDisponible < item.cantidad) {
        errores.push(`${prod.titulo}: solo hay ${stockDisponible} disponibles`);
        continue;
      }

      const precio = precioProducto(prod, lista);
      if (precio === null) {
        errores.push(`${prod.titulo}: sin precio para la lista ${lista.nombre}`);
        continue;
      }

      productosParaCarrito.push({
        cod_interno: prod.cod_interno,
        titulo: prod.titulo,
        precio_unitario: precio, // con IVA, lista del cliente
        cantidad: item.cantidad,
        imagen_principal: prod.imagen_principal || '',
        marca: prod.marca || '',
        embalaje: prod.embalaje || 1,
        impuesto: prod.impuesto || 0.19
      });
    }

    if (productosParaCarrito.length === 0) {
      return {
        exito: false,
        productos: [],
        errores: errores,
        mensaje: errores.length > 0
          ? `No pude agregar: ${errores.join(', ')}`
          : 'No se encontraron productos válidos'
      };
    }

    // Calcular resumen
    const resumen = productosParaCarrito.map(p =>
      `${p.cantidad}x ${p.titulo}`
    ).join(', ');

    return {
      exito: true,
      accion: 'AGREGAR_CARRITO', // Flag para el frontend
      productos: productosParaCarrito,
      errores: errores,
      mensaje: `Agregado al carrito: ${resumen}. Revisa tu carrito para confirmar el pedido.`
    };

  } catch (error) {
    console.error('Error en agregarCarrito:', error);
    return {
      exito: false,
      productos: [],
      mensaje: `Error: ${error.message}`
    };
  }
}

const TOOL_DEFINITION = {
  name: 'agregar_carrito',
  description: 'Agrega productos al carrito del usuario. Usa esta herramienta cuando el usuario quiera agregar productos. El usuario confirmará el pedido desde su carrito.',
  parameters: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: 'Productos a agregar al carrito',
        items: {
          type: 'object',
          properties: {
            sku: { type: 'string', description: 'Código del producto (cod_interno)' },
            cantidad: { type: 'number', description: 'Cantidad a agregar' }
          },
          required: ['sku', 'cantidad']
        }
      }
    },
    required: ['items']
  }
};

module.exports = {
  agregarCarrito,
  TOOL_DEFINITION
};
