/**
 * MCP Tool: Crear Cotización
 * Genera una cotización completa en Firestore
 */

const admin = require('firebase-admin');

/**
 * Crea una nueva cotización en el sistema
 *
 * @param {Object} params - Parámetros de la cotización
 * @param {Object} params.cliente - Datos del cliente {empresa, nit, contacto, email, telefono, ciudad, direccion}
 * @param {Array} params.items - Lista de items [{sku, cantidad}]
 * @returns {Promise<Object>} Información de la cotización creada
 */
async function crearCotizacion({ cliente, items }) {
  try {
    const db = admin.firestore();

    // Obtener configuración para generar número consecutivo
    const configRef = db.collection('configuracion').doc('general');
    const configDoc = await configRef.get();

    let consecutivo = 1;
    if (configDoc.exists) {
      consecutivo = (configDoc.data().consecutivo_cotizaciones || 0) + 1;
    }

    // Generar número de cotización
    const year = new Date().getFullYear();
    const numero = `COT-${year}-${String(consecutivo).padStart(4, '0')}`;

    // Calcular totales
    let subtotal = 0;
    let total_iva = 0;
    const items_detalle = [];

    // Procesar cada item
    for (const item of items) {
      // Buscar producto
      const prodSnapshot = await db.collection('productos')
        .where('cod_interno', '==', item.sku)
        .limit(1)
        .get();

      if (!prodSnapshot.empty) {
        const prod = prodSnapshot.docs[0].data();
        const cantidad = item.cantidad;
        const precio = prod.p_real || 0;
        const impuesto = prod.impuesto || 0.19;

        const item_subtotal = cantidad * precio;
        const item_iva = item_subtotal * impuesto;

        subtotal += item_subtotal;
        total_iva += item_iva;

        items_detalle.push({
          sku: item.sku,
          nombre: prod.titulo,
          cantidad: cantidad,
          precio_unitario: precio,
          subtotal: item_subtotal,
          iva: item_iva,
          total: item_subtotal + item_iva
        });
      }
    }

    const total = subtotal + total_iva;
    const vigencia = new Date();
    vigencia.setDate(vigencia.getDate() + 15); // 15 días de vigencia

    // Crear documento de cotización
    const cotizacionData = {
      numero: numero,
      cliente: cliente,
      subtotal: subtotal,
      total_iva: total_iva,
      total: total,
      cantidad_items: items_detalle.length,
      cantidad_unidades: items_detalle.reduce((sum, item) => sum + item.cantidad, 0),
      estado: 'pendiente',
      vigencia_hasta: admin.firestore.Timestamp.fromDate(vigencia),
      generada_por_ia: true,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    };

    // Guardar cotización
    const cotizacionRef = await db.collection('cotizaciones').add(cotizacionData);

    // Guardar items como subcolección
    const batch = db.batch();
    items_detalle.forEach(item => {
      const itemRef = cotizacionRef.collection('items').doc();
      batch.set(itemRef, item);
    });
    await batch.commit();

    // Actualizar consecutivo
    await configRef.set({
      consecutivo_cotizaciones: consecutivo
    }, { merge: true });

    return {
      exito: true,
      cotizacion_id: cotizacionRef.id,
      numero: numero,
      subtotal: subtotal,
      iva: total_iva,
      total: total,
      items: items_detalle,
      vigencia: vigencia.toISOString().split('T')[0],
      mensaje: `✅ Cotización ${numero} creada exitosamente por ${total.toLocaleString('es-CO')}`
    };

  } catch (error) {
    console.error('Error en crearCotizacion:', error);
    return {
      exito: false,
      mensaje: `Error al crear cotización: ${error.message}`
    };
  }
}

// Definición de la herramienta para Vertex AI
const TOOL_DEFINITION = {
  name: 'crear_cotizacion',
  description: 'Crea una nueva cotización con los productos y cantidades especificados',
  parameters: {
    type: 'object',
    properties: {
      cliente: {
        type: 'object',
        description: 'Información del cliente',
        properties: {
          empresa: { type: 'string', description: 'Nombre de la empresa' },
          nit: { type: 'string', description: 'NIT de la empresa' },
          contacto: { type: 'string', description: 'Nombre del contacto' },
          email: { type: 'string', description: 'Email del contacto' },
          telefono: { type: 'string', description: 'Teléfono' },
          ciudad: { type: 'string', description: 'Ciudad' },
          direccion: { type: 'string', description: 'Dirección' }
        },
        required: ['empresa', 'nit', 'contacto', 'email']
      },
      items: {
        type: 'array',
        description: 'Lista de productos a cotizar',
        items: {
          type: 'object',
          properties: {
            sku: { type: 'string', description: 'Código del producto' },
            cantidad: { type: 'number', description: 'Cantidad a cotizar' }
          },
          required: ['sku', 'cantidad']
        }
      }
    },
    required: ['cliente', 'items']
  }
};

module.exports = {
  crearCotizacion,
  TOOL_DEFINITION
};
