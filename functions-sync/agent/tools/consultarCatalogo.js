/**
 * MCP Tool: Consultar Catálogo
 * Busca productos en Firestore con búsqueda flexible y sugerencias
 */

const admin = require('firebase-admin');

/**
 * Calcula similitud entre dos strings (0-1)
 */
function calcularSimilitud(str1, str2) {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  // Coincidencia exacta
  if (s1 === s2) return 1;

  // Una contiene a la otra
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;

  // Contar palabras coincidentes
  const palabras1 = s1.split(/\s+/).filter(p => p.length > 2);
  const palabras2 = s2.split(/\s+/).filter(p => p.length > 2);

  let coincidencias = 0;
  for (const p1 of palabras1) {
    for (const p2 of palabras2) {
      if (p1.includes(p2) || p2.includes(p1)) {
        coincidencias++;
        break;
      }
    }
  }

  if (palabras1.length === 0) return 0;
  return coincidencias / palabras1.length * 0.7;
}

/**
 * Busca productos en el catálogo de ENAR con búsqueda flexible
 *
 * @param {Object} params - Parámetros de búsqueda
 * @param {string} params.query - Texto de búsqueda (nombre, categoría, tipo de producto)
 * @param {string} [params.categoria] - Filtro opcional por categoría
 * @param {string} [params.marca] - Filtro opcional por marca
 * @param {number} [params.limite=10] - Máximo de resultados a retornar
 * @returns {Promise<Object>} Resultados de la búsqueda
 */
async function consultarCatalogo({ query, categoria, marca, limite = 10 }) {
  try {
    const db = admin.firestore();
    let productosRef = db.collection('productos');

    // Query base: solo productos activos (NO filtrar por categoría/marca con where)
    // La búsqueda flexible por texto es más efectiva
    let queryRef = productosRef.where('activo', '==', true);

    // Obtener TODOS los documentos activos para búsqueda flexible
    const snapshot = await queryRef.get();

    if (snapshot.empty) {
      return {
        encontrados: 0,
        productos: [],
        sugerencias: [],
        mensaje: `No se encontraron productos activos en el catálogo`
      };
    }

    // Combinar query con categoria y marca para búsqueda más amplia
    let busquedaCompleta = query || '';
    if (categoria && !busquedaCompleta.toLowerCase().includes(categoria.toLowerCase())) {
      busquedaCompleta = `${categoria} ${busquedaCompleta}`.trim();
    }
    if (marca && !busquedaCompleta.toLowerCase().includes(marca.toLowerCase())) {
      busquedaCompleta = `${busquedaCompleta} ${marca}`.trim();
    }

    // Normalizar query: quitar acentos y caracteres especiales
    const queryNormalizado = busquedaCompleta.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const palabrasQuery = queryNormalizado.split(/\s+/).filter(p => p.length > 2);

    const productosExactos = [];
    const productosParciales = [];
    const todosDatos = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      const titulo = (data.titulo || '');
      const tituloNormalizado = titulo.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      const categoriaData = (data.categoria || '').toLowerCase();
      const marcaData = (data.marca || '').toLowerCase();
      const ean = (data.ean || '').toLowerCase();
      const codInterno = (data.cod_interno || '').toLowerCase();

      const producto = {
        sku: data.cod_interno,
        nombre: data.titulo,
        categoria: data.categoria,
        marca: data.marca,
        precio_mayorista: data.precio_mayorista || 0,
        precio_negocio: data.precio_negocio || 0,
        precio_persona_natural: data.precio_persona_natural || 0,
        precio_lista: data.precio_lista || 0,
        stock: data.cantidad || 0,
        embalaje: data.embalaje || 1,
        impuesto: data.impuesto || 0.19,
        ficha_tecnica_url: data.ficha_tecnica_url || null,
        tiene_ficha_tecnica: !!(data.ficha_tecnica_url || data.ficha_tecnica),
        imagen: data.imagen_principal || null
      };

      // Guardar todos para sugerencias
      todosDatos.push({ producto, tituloNormalizado, categoriaData });

      // BÚSQUEDA EXACTA: query completo está en algún campo
      if (tituloNormalizado.includes(queryNormalizado) ||
          categoriaData.includes(queryNormalizado) ||
          marcaData.includes(queryNormalizado) ||
          ean.includes(queryNormalizado) ||
          codInterno.includes(queryNormalizado)) {
        productosExactos.push(producto);
        return;
      }

      // BÚSQUEDA FLEXIBLE: todas las palabras del query están en el título
      const todasPalabrasCoinciden = palabrasQuery.every(palabra =>
        tituloNormalizado.includes(palabra)
      );

      if (todasPalabrasCoinciden && palabrasQuery.length > 0) {
        productosExactos.push(producto);
        return;
      }

      // BÚSQUEDA PARCIAL: al menos una palabra coincide
      const algunaPalabraCoincide = palabrasQuery.some(palabra =>
        tituloNormalizado.includes(palabra) ||
        categoriaData.includes(palabra)
      );

      if (algunaPalabraCoincide) {
        const similitud = calcularSimilitud(queryNormalizado, tituloNormalizado);
        productosParciales.push({ ...producto, similitud });
      }
    });

    // Ordenar por stock (disponibles primero)
    const ordenarPorStock = (a, b) => {
      if (b.stock !== a.stock) return b.stock - a.stock;
      return a.nombre.localeCompare(b.nombre);
    };

    productosExactos.sort(ordenarPorStock);
    productosParciales.sort((a, b) => b.similitud - a.similitud);

    // Si hay resultados exactos, retornarlos
    if (productosExactos.length > 0) {
      const resultados = productosExactos.slice(0, limite);
      return {
        encontrados: resultados.length,
        total_coincidencias: productosExactos.length,
        productos: resultados,
        sugerencias: [],
        mensaje: `Se encontraron ${productosExactos.length} productos para "${query}"${resultados.length < productosExactos.length ? `. Mostrando los primeros ${resultados.length}.` : ''}`
      };
    }

    // Si hay coincidencias parciales, sugerirlas
    if (productosParciales.length > 0) {
      const sugerencias = productosParciales.slice(0, 5).map(p => ({
        sku: p.sku,
        nombre: p.nombre,
        stock: p.stock,
        precio_negocio: p.precio_negocio
      }));

      return {
        encontrados: 0,
        productos: [],
        sugerencias: sugerencias,
        mensaje: `No se encontró "${query}" exactamente, pero encontré productos similares que podrían interesarte.`
      };
    }

    // Sin resultados - sugerir categorías populares
    const categoriasDisponibles = [...new Set(todosDatos.map(d => d.categoriaData))].filter(c => c).slice(0, 5);

    return {
      encontrados: 0,
      productos: [],
      sugerencias: [],
      categorias_disponibles: categoriasDisponibles,
      mensaje: `No encontré "${query}" en el catálogo. Puedo ayudarte a buscar en estas categorías: ${categoriasDisponibles.join(', ')}.`
    };

  } catch (error) {
    console.error('Error en consultarCatalogo:', error);
    return {
      encontrados: 0,
      productos: [],
      sugerencias: [],
      mensaje: `Error al buscar productos: ${error.message}`
    };
  }
}

// Definición de la herramienta para Vertex AI
const TOOL_DEFINITION = {
  name: 'consultar_catalogo',
  description: 'Busca productos de pinturas y recubrimientos en el catálogo de ENAR por nombre, categoría, marca o código',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Texto de búsqueda (nombre del producto, categoría como "vinilo", "anticorrosivo", "estuco", código SKU)'
      },
      categoria: {
        type: 'string',
        description: 'Filtrar por categoría específica (opcional)'
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
