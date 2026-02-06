/**
 * MCP Tool: Crear Orden de Compra
 * Genera una orden de compra directamente desde la conversación con el agente
 */

const admin = require('firebase-admin');

/**
 * Crea una nueva orden de compra en el sistema
 *
 * @param {Object} params - Parámetros de la orden
 * @param {string} params.user_id - ID del usuario autenticado
 * @param {Array} params.items - Lista de items [{sku, cantidad}]
 * @param {string} [params.observaciones] - Observaciones adicionales
 * @returns {Promise<Object>} Información de la orden creada
 */
async function crearOrden({ user_id, items, observaciones }) {
  try {
    const db = admin.firestore();

    // Obtener datos del usuario
    const userDoc = await db.collection('usuarios').doc(user_id).get();
    if (!userDoc.exists) {
      return {
        exito: false,
        mensaje: 'Usuario no encontrado. Debes estar registrado para crear órdenes.'
      };
    }

    const userData = userDoc.data();

    // Determinar campo de precio según tipo de cliente
    const tipoCliente = userData.tipo_cliente || 'persona_natural';
    const camposPrecio = {
      'mayorista': 'precio_mayorista',
      'negocio': 'precio_negocio',
      'persona_natural': 'precio_persona_natural'
    };
    const campoPrecio = camposPrecio[tipoCliente] || 'precio_persona_natural';

    // Generar número de orden
    const configRef = db.collection('configuracion').doc('general');
    const configDoc = await configRef.get();

    let consecutivo = 1;
    if (configDoc.exists) {
      consecutivo = (configDoc.data().consecutivo_ordenes || 0) + 1;
    }

    const year = new Date().getFullYear();
    const numero = `ORD-${year}-${String(consecutivo).padStart(5, '0')}`;

    // Calcular totales y procesar items
    let subtotal = 0;
    let total_iva = 0;
    const items_detalle = [];
    const productos_sin_stock = [];

    for (const item of items) {
      const prodSnapshot = await db.collection('productos')
        .where('cod_interno', '==', item.sku)
        .limit(1)
        .get();

      if (!prodSnapshot.empty) {
        const prod = prodSnapshot.docs[0].data();
        const cantidad = item.cantidad;
        const stock_disponible = prod.cantidad || 0;

        // Verificar stock
        if (stock_disponible < cantidad) {
          productos_sin_stock.push({
            sku: item.sku,
            nombre: prod.titulo,
            solicitado: cantidad,
            disponible: stock_disponible
          });
          continue; // No agregar productos sin stock suficiente
        }

        const precio = prod[campoPrecio] || prod.precio_lista || 0;
        const impuesto = prod.impuesto || 0.19;

        const item_subtotal = cantidad * precio;
        const item_iva = item_subtotal * impuesto;

        subtotal += item_subtotal;
        total_iva += item_iva;

        items_detalle.push({
          sku: item.sku,
          nombre: prod.titulo,
          categoria: prod.categoria,
          cantidad: cantidad,
          precio_unitario: precio,
          subtotal: item_subtotal,
          iva: item_iva,
          total: item_subtotal + item_iva
        });
      } else {
        return {
          exito: false,
          mensaje: `Producto ${item.sku} no encontrado en el catálogo`
        };
      }
    }

    // Si hay productos sin stock, informar
    if (productos_sin_stock.length > 0) {
      const listaProblemas = productos_sin_stock
        .map(p => `- ${p.nombre}: solicitado ${p.solicitado}, disponible ${p.disponible}`)
        .join('\n');

      return {
        exito: false,
        productos_sin_stock: productos_sin_stock,
        mensaje: `No hay stock suficiente para algunos productos:\n${listaProblemas}\n\n¿Deseas ajustar las cantidades?`
      };
    }

    // Si no hay items válidos
    if (items_detalle.length === 0) {
      return {
        exito: false,
        mensaje: 'No se pudieron procesar los productos. Verifica los códigos SKU.'
      };
    }

    const total = subtotal + total_iva;

    // Crear documento de orden
    const ordenData = {
      numero: numero,
      user_id: user_id,
      cliente: {
        nombre: userData.nombre || userData.empresa || '',
        email: userData.email || '',
        telefono: userData.telefono || '',
        tipo_cliente: tipoCliente,
        nit: userData.nit || '',
        empresa: userData.empresa || ''
      },
      direccion_entrega: {
        direccion: userData.direccion || '',
        ciudad: userData.ciudad || '',
        departamento: userData.departamento || '',
        contacto: userData.contacto_entrega || userData.nombre || '',
        telefono_contacto: userData.telefono_entrega || userData.telefono || ''
      },
      items: items_detalle,
      subtotal: subtotal,
      total_iva: total_iva,
      total: total,
      cantidad_items: items_detalle.length,
      cantidad_unidades: items_detalle.reduce((sum, item) => sum + item.cantidad, 0),
      estado: 'pendiente',
      observaciones: observaciones || '',
      generada_por_ia: true,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    };

    // Guardar orden
    const ordenRef = await db.collection('ordenes').add(ordenData);

    // Actualizar consecutivo
    await configRef.set({
      consecutivo_ordenes: consecutivo
    }, { merge: true });

    // Formatear respuesta
    const itemsResumen = items_detalle
      .map(i => `- ${i.cantidad} × ${i.nombre} = $${i.total.toLocaleString('es-CO')}`)
      .join('\n');

    return {
      exito: true,
      orden_id: ordenRef.id,
      numero: numero,
      subtotal: subtotal,
      iva: total_iva,
      total: total,
      items: items_detalle,
      mensaje: `✅ ¡Orden ${numero} creada exitosamente!\n\n${itemsResumen}\n\nSubtotal: $${subtotal.toLocaleString('es-CO')}\nIVA (19%): $${total_iva.toLocaleString('es-CO')}\n**Total: $${total.toLocaleString('es-CO')}**\n\nPuedes ver el estado de tu orden en "Mis Órdenes".`
    };

  } catch (error) {
    console.error('Error en crearOrden:', error);
    return {
      exito: false,
      mensaje: `Error al crear la orden: ${error.message}`
    };
  }
}

// Definición de la herramienta para Vertex AI
const TOOL_DEFINITION = {
  name: 'crear_orden',
  description: 'Crea una orden de compra para el usuario. El user_id se obtiene automáticamente del usuario logueado, NO lo pidas al cliente.',
  parameters: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: 'Lista de productos a ordenar',
        items: {
          type: 'object',
          properties: {
            sku: { type: 'string', description: 'Código del producto (cod_interno/SKU)' },
            cantidad: { type: 'number', description: 'Cantidad a ordenar' }
          },
          required: ['sku', 'cantidad']
        }
      },
      observaciones: {
        type: 'string',
        description: 'Observaciones o instrucciones especiales para la orden (opcional)'
      }
    },
    required: ['items']
  }
};

module.exports = {
  crearOrden,
  TOOL_DEFINITION
};
