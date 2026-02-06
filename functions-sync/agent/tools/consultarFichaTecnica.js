/**
 * MCP Tool: Consultar Ficha Técnica
 * Obtiene información técnica detallada de un producto desde Firestore
 */

const admin = require('firebase-admin');

/**
 * Consulta la ficha técnica de un producto
 *
 * @param {Object} params - Parámetros de consulta
 * @param {string} params.sku - Código interno del producto
 * @returns {Promise<Object>} Información técnica del producto
 */
async function consultarFichaTecnica({ sku }) {
  try {
    const db = admin.firestore();

    // Buscar producto por SKU
    const snapshot = await db.collection('productos')
      .where('cod_interno', '==', sku)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return {
        encontrado: false,
        mensaje: `Producto ${sku} no encontrado en el catálogo`
      };
    }

    const doc = snapshot.docs[0];
    const data = doc.data();

    // Verificar si tiene ficha técnica
    if (!data.ficha_tecnica_contenido && !data.ficha_tecnica_url) {
      return {
        encontrado: true,
        tiene_ficha: false,
        producto: {
          sku: data.cod_interno,
          nombre: data.titulo,
          categoria: data.categoria,
          marca: data.marca
        },
        mensaje: `El producto "${data.titulo}" no tiene ficha técnica disponible actualmente.`
      };
    }

    // Retornar información técnica
    return {
      encontrado: true,
      tiene_ficha: true,
      producto: {
        sku: data.cod_interno,
        nombre: data.titulo,
        categoria: data.categoria,
        marca: data.marca
      },
      ficha_tecnica: {
        // Contenido pre-procesado del PDF
        contenido: data.ficha_tecnica_contenido || null,
        // Campos estructurados (si existen)
        composicion: data.ft_composicion || null,
        usos_recomendados: data.ft_usos || null,
        rendimiento: data.ft_rendimiento || null,
        preparacion_superficie: data.ft_preparacion || null,
        metodo_aplicacion: data.ft_aplicacion || null,
        tiempo_secado: data.ft_secado || null,
        diluyente: data.ft_diluyente || null,
        colores_disponibles: data.ft_colores || null,
        presentaciones: data.ft_presentaciones || null,
        productos_complementarios: data.ft_complementarios || null,
        precauciones: data.ft_precauciones || null,
        // URL del PDF original
        url_pdf: data.ficha_tecnica_url || null
      },
      mensaje: `Ficha técnica de "${data.titulo}" encontrada.`
    };

  } catch (error) {
    console.error('Error en consultarFichaTecnica:', error);
    return {
      encontrado: false,
      mensaje: `Error al consultar ficha técnica: ${error.message}`
    };
  }
}

/**
 * Busca productos complementarios basándose en la categoría y uso
 *
 * @param {Object} params - Parámetros de búsqueda
 * @param {string} params.categoria - Categoría del producto principal
 * @param {string} params.uso - Tipo de uso (interior, exterior, metal, madera, etc.)
 * @returns {Promise<Object>} Productos complementarios sugeridos
 */
async function buscarProductosComplementarios({ categoria, uso }) {
  try {
    const db = admin.firestore();

    // Mapa de productos complementarios por categoría
    const complementarios = {
      'VINILOS': ['ESTUCOS', 'MASILLAS', 'SELLADORES', 'RODILLOS', 'BROCHAS'],
      'ESMALTES': ['ANTICORROSIVOS', 'DILUYENTES', 'LIJAS', 'BROCHAS'],
      'ANTICORROSIVOS': ['ESMALTES', 'DILUYENTES', 'CONVERTIDOR DE OXIDO'],
      'ESTUCOS': ['VINILOS', 'SELLADORES', 'LIJAS'],
      'IMPERMEABILIZANTES': ['SELLADORES', 'MALLAS', 'RODILLOS'],
      'LACAS': ['SELLADORES', 'DILUYENTES', 'LIJAS', 'TINTES']
    };

    const categoriasComplementarias = complementarios[categoria.toUpperCase()] || [];

    if (categoriasComplementarias.length === 0) {
      return {
        encontrados: 0,
        productos: [],
        mensaje: 'No se encontraron productos complementarios para esta categoría'
      };
    }

    // Buscar productos de las categorías complementarias
    const productos = [];

    for (const catComp of categoriasComplementarias.slice(0, 3)) {
      const snapshot = await db.collection('productos')
        .where('activo', '==', true)
        .where('categoria', '==', catComp)
        .limit(2)
        .get();

      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.cantidad > 0) { // Solo con stock
          productos.push({
            sku: data.cod_interno,
            nombre: data.titulo,
            categoria: data.categoria,
            precio: data.precio_negocio || data.precio_lista,
            stock: data.cantidad,
            porque: `Complemento ideal para ${categoria.toLowerCase()}`
          });
        }
      });
    }

    return {
      encontrados: productos.length,
      productos: productos,
      mensaje: productos.length > 0
        ? `Encontré ${productos.length} productos complementarios que podrían interesarte.`
        : 'No encontré productos complementarios con stock disponible.'
    };

  } catch (error) {
    console.error('Error en buscarProductosComplementarios:', error);
    return {
      encontrados: 0,
      productos: [],
      mensaje: `Error al buscar complementarios: ${error.message}`
    };
  }
}

// Definiciones de herramientas para Vertex AI
const TOOL_DEFINITION_FICHA = {
  name: 'consultar_ficha_tecnica',
  description: 'Consulta la ficha técnica de un producto para obtener información detallada sobre composición, usos, rendimiento, método de aplicación, tiempos de secado y productos complementarios',
  parameters: {
    type: 'object',
    properties: {
      sku: {
        type: 'string',
        description: 'Código interno del producto (SKU) para consultar su ficha técnica'
      }
    },
    required: ['sku']
  }
};

const TOOL_DEFINITION_COMPLEMENTARIOS = {
  name: 'buscar_complementarios',
  description: 'Busca productos complementarios para venta cruzada basándose en la categoría del producto principal',
  parameters: {
    type: 'object',
    properties: {
      categoria: {
        type: 'string',
        description: 'Categoría del producto principal (ej: VINILOS, ESMALTES, ANTICORROSIVOS)'
      },
      uso: {
        type: 'string',
        description: 'Tipo de uso o aplicación (ej: interior, exterior, metal, madera)'
      }
    },
    required: ['categoria']
  }
};

module.exports = {
  consultarFichaTecnica,
  buscarProductosComplementarios,
  TOOL_DEFINITION_FICHA,
  TOOL_DEFINITION_COMPLEMENTARIOS
};
