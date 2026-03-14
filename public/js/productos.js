/**
 * ============================================
 * LÓGICA DE PRODUCTOS - VISTA TABLA
 * ============================================
 * Archivo: productos.js
 * Descripción: Carga, renderizado en tabla,
 *              filtrado y paginación de productos
 * ============================================
 */

// Importar módulos de Firebase
import {
  db,
  COLECCION_PRODUCTOS,
  collection,
  query,
  orderBy,
  getDocs
} from './firebase-config.js';

// Importar utilidades
import {
  formatearPrecio,
  debounce,
  normalizarTexto,
  esUrlImagenValida
} from './utils.js';

// Importar carrito
import { carrito } from './carrito.js';

// Importar módulo de usuario
import {
  inicializarUsuario,
  obtenerPrecioCliente,
  getTipoCliente,
  getEtiquetaTipoCliente,
  onUsuarioChange,
  estaAutenticado
} from './usuario.js?v=2';

// ============================================
// CONSTANTES Y ESTADO
// ============================================

const PRODUCTOS_POR_PAGINA_DEFAULT = 100;

// Estado de la aplicación
const estado = {
  productos: [],           // Todos los productos cargados
  productosFiltrados: [],  // Productos después de filtrar
  cargando: false,         // Estado de carga
  categorias: new Set(),   // Lista única de categorías
  marcas: new Set(),       // Lista única de marcas
  paginaActual: 1,         // Página actual
  productosPorPagina: PRODUCTOS_POR_PAGINA_DEFAULT,
  filtros: {
    busqueda: '',
    categoria: '',
    marca: '',
    ofertas: ''            // '' = todas, 'oferta' = solo ofertas
  },
  ordenamiento: {
    columna: 'orden_pareto',
    direccion: 'asc'
  }
};

// ============================================
// ELEMENTOS DEL DOM
// ============================================

const elementos = {
  // Tabla
  tablaProductos: document.getElementById('tablaProductos'),
  productosBody: document.getElementById('productosBody'),

  // Filtros
  inputBusqueda: document.getElementById('inputBusqueda'),
  btnLimpiarBusqueda: document.getElementById('btnLimpiarBusqueda'),
  btnLimpiarCategoria: document.getElementById('btnLimpiarCategoria'),
  btnLimpiarMarca: document.getElementById('btnLimpiarMarca'),
  btnLimpiarOfertas: document.getElementById('btnLimpiarOfertas'),
  selectCategoria: document.getElementById('selectCategoria'),
  selectMarca: document.getElementById('selectMarca'),
  filtroOfertas: document.getElementById('filtroOfertas'),
  btnLimpiarFiltros: document.getElementById('btnLimpiarFiltros'),

  // Información
  infoResultados: document.getElementById('infoResultados'),
  loader: document.getElementById('loader'),
  sinResultados: document.getElementById('sinResultados'),

  // Paginación
  paginacion: document.getElementById('paginacion'),
  btnPrimera: document.getElementById('btnPrimera'),
  btnAnterior: document.getElementById('btnAnterior'),
  btnSiguiente: document.getElementById('btnSiguiente'),
  btnUltima: document.getElementById('btnUltima'),
  inputPagina: document.getElementById('inputPagina'),
  totalPaginas: document.getElementById('totalPaginas'),
  selectPorPagina: document.getElementById('selectPorPagina'),

  // Modal producto
  modalProducto: document.getElementById('modalProducto'),
  modalProductoTitulo: document.getElementById('modalProductoTitulo'),
  modalProductoImagen: document.getElementById('modalProductoImagen'),
  modalProductoSinImagen: document.getElementById('modalProductoSinImagen'),
  modalProductoSku: document.getElementById('modalProductoSku'),
  modalProductoMarca: document.getElementById('modalProductoMarca'),
  modalProductoEan: document.getElementById('modalProductoEan'),
  modalProductoStock: document.getElementById('modalProductoStock'),
  modalProductoPrecio: document.getElementById('modalProductoPrecio'),
  modalProductoPrecioReg: document.getElementById('modalProductoPrecioReg'),
  modalProductoCantidad: document.getElementById('modalProductoCantidad'),
  btnAgregarDesdeModal: document.getElementById('btnAgregarDesdeModal'),
  modalImagenBadge: document.getElementById('modalImagenBadge'),
  modalImagenOverlay: document.getElementById('modalImagenOverlay'),

  // Modal galería
  modalGaleria: document.getElementById('modalGaleria'),
  galeriaTitulo: document.getElementById('galeriaTitulo'),
  galeriaImagenPrincipal: document.getElementById('galeriaImagenPrincipal'),
  galeriaContador: document.getElementById('galeriaContador'),
  galeriaThumbnails: document.getElementById('galeriaThumbnails'),
  btnCerrarGaleria: document.getElementById('btnCerrarGaleria'),
  btnGaleriaPrev: document.getElementById('btnGaleriaPrev'),
  btnGaleriaNext: document.getElementById('btnGaleriaNext'),

  // Modal ficha técnica
  modalFichaTecnica: document.getElementById('modalFichaTecnica'),
  modalFichaTitulo: document.getElementById('modalFichaTitulo'),
  fichaViewer: document.getElementById('fichaViewer'),
  btnVerFicha: document.getElementById('btnVerFicha'),
  btnDescargarFichaPDF: document.getElementById('btnDescargarFichaPDF')
};

// Producto actualmente mostrado en modal
let productoActualModal = null;

// Estado de la galería
const galeriaEstado = {
  imagenes: [],
  indiceActual: 0,
  titulo: ''
};

// ============================================
// FUNCIONES DE CARGA DE DATOS
// ============================================

/**
 * Carga todos los productos desde Firestore
 */
async function cargarTodosLosProductos() {
  if (estado.cargando) return;

  estado.cargando = true;
  mostrarLoader(true);

  try {
    const productosRef = collection(db, COLECCION_PRODUCTOS);
    const q = query(productosRef, orderBy('titulo'));

    const snapshot = await getDocs(q);

    estado.productos = [];
    estado.categorias.clear();
    estado.marcas.clear();

    snapshot.forEach(doc => {
      const producto = { id: doc.id, ...doc.data() };

      // Filtrar registros de encabezado o productos inactivos
      if (producto.cod_interno === 'COD_INTERNO' || producto.titulo === 'TITULO') {
        return;
      }
      if (producto.activo === false) {
        return;
      }

      estado.productos.push(producto);

      // Agregar categoría y marca a las listas únicas
      if (producto.categoria) {
        estado.categorias.add(producto.categoria);
      }
      if (producto.marca) {
        estado.marcas.add(producto.marca);
      }
    });

    // Actualizar selects de filtros
    actualizarSelectCategorias();
    actualizarSelectMarcas();

    // Actualizar iconos de ordenamiento (por defecto: Stock desc)
    actualizarIconosOrdenamiento();

    // Aplicar filtros y renderizar
    aplicarFiltros();

    console.log(`Total productos cargados: ${estado.productos.length}`);

  } catch (error) {
    console.error('Error cargando productos:', error);
    mostrarError('Error al cargar productos. Intenta de nuevo.');
  } finally {
    estado.cargando = false;
    mostrarLoader(false);
  }
}

// ============================================
// FUNCIONES DE FILTRADO
// ============================================

/**
 * Calcula el porcentaje de descuento de un producto
 * @param {Object} producto - Producto
 * @returns {number} - Porcentaje de descuento
 */
function calcularDescuento(producto) {
  if (!producto.p_real || !producto.p_corriente || producto.p_corriente === 0) return 0;
  return ((producto.p_corriente - producto.p_real) / producto.p_corriente) * 100;
}

/**
 * Filtra productos por múltiples términos (búsqueda AND)
 * Todos los términos deben estar presentes en al menos uno de los campos buscables
 * Campos buscables: titulo, cod_interno, ean, marca
 *
 * Separadores aceptados:
 * - Coma (,) → para términos con espacios: "Soldadura PVC, 1/4 galón"
 * - Espacios → para términos simples: "soldadura pvc rojo"
 *
 * @param {Array} productos - Lista de productos
 * @param {string} textoBusqueda - Texto de búsqueda
 * @returns {Array} - Productos filtrados
 */
function filtrarProductosPorBusqueda(productos, textoBusqueda) {
  if (!textoBusqueda || textoBusqueda.trim() === '') {
    return productos;
  }

  let terminos = [];

  // Si contiene coma, usar como separador principal
  if (textoBusqueda.includes(',')) {
    terminos = textoBusqueda
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(t => t.length > 0);
  } else {
    // Si no hay coma, separar por espacios
    terminos = textoBusqueda.toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(t => t.length > 0);
  }

  // Filtrar productos que contengan TODOS los términos
  return productos.filter(producto => {
    // Concatenar todos los campos buscables en un solo string
    const camposBuscables = [
      producto.titulo || '',
      producto.cod_interno || '',
      producto.ean || '',
      producto.marca || ''
    ].join(' ').toLowerCase();

    // Verificar que TODOS los términos estén en los campos buscables
    return terminos.every(termino => camposBuscables.includes(termino));
  });
}

/**
 * Ordena los productos filtrados según la columna y dirección actuales
 */
function ordenarProductos() {
  const { columna, direccion } = estado.ordenamiento;

  if (!columna || !direccion) return;

  estado.productosFiltrados.sort((a, b) => {
    let valorA, valorB;

    // Obtener valores según la columna
    switch (columna) {
      case 'cod_interno':
        valorA = (a.cod_interno || '').toLowerCase();
        valorB = (b.cod_interno || '').toLowerCase();
        break;
      case 'titulo':
        valorA = (a.titulo || '').toLowerCase();
        valorB = (b.titulo || '').toLowerCase();
        break;
      case 'cantidad':
        valorA = a.cantidad || 0;
        valorB = b.cantidad || 0;
        break;
      case 'precio_cliente':
        valorA = obtenerPrecioCliente(a);
        valorB = obtenerPrecioCliente(b);
        break;
      case 'precio_lista':
        valorA = a.precio_lista || 0;
        valorB = b.precio_lista || 0;
        break;
      case 'categoria':
        valorA = (a.categoria || '').toLowerCase();
        valorB = (b.categoria || '').toLowerCase();
        break;
      case 'orden_cargue':
        valorA = (a.Orden_Cargue || 'ZZZ').toLowerCase();
        valorB = (b.Orden_Cargue || 'ZZZ').toLowerCase();
        break;
      case 'orden_pareto':
        // Si hay búsqueda activa: Presentación DESC → Precio ASC
        if (estado.filtros.busqueda && estado.filtros.busqueda.trim()) {
          const presA2 = (a.presentacion || '').toLowerCase();
          const presB2 = (b.presentacion || '').toLowerCase();
          if (presA2 !== presB2) return presA2.localeCompare(presB2);
          return (obtenerPrecioCliente(a) || 0) - (obtenerPrecioCliente(b) || 0);
        }
        // Sin búsqueda: Pareto ASC
        const paretoA = a.orden_pareto || 9999;
        const paretoB = b.orden_pareto || 9999;
        return paretoA - paretoB;
      case 'presentacion':
        valorA = (a.presentacion || '').toLowerCase();
        valorB = (b.presentacion || '').toLowerCase();
        break;
      default:
        return 0;
    }

    // Comparar según tipo
    let comparacion = 0;
    if (typeof valorA === 'string') {
      comparacion = valorA.localeCompare(valorB);
    } else {
      comparacion = valorA - valorB;
    }

    // Invertir si es descendente
    return direccion === 'desc' ? -comparacion : comparacion;
  });
}

/**
 * Cambia el ordenamiento de una columna
 * @param {string} columna - Nombre de la columna
 */
function cambiarOrdenamiento(columna) {
  const { columna: columnaActual, direccion: direccionActual } = estado.ordenamiento;

  // Si es la misma columna, alternar dirección
  if (columna === columnaActual) {
    if (direccionActual === 'asc') {
      estado.ordenamiento.direccion = 'desc';
    } else if (direccionActual === 'desc') {
      // Quitar ordenamiento
      estado.ordenamiento.columna = null;
      estado.ordenamiento.direccion = null;
    }
  } else {
    // Nueva columna, empezar con ascendente
    estado.ordenamiento.columna = columna;
    estado.ordenamiento.direccion = 'asc';
  }

  // Actualizar clases visuales en cabeceras
  actualizarIconosOrdenamiento();

  // Reordenar y renderizar
  ordenarProductos();
  renderizarTabla();
}

/**
 * Actualiza los iconos de ordenamiento en las cabeceras
 */
function actualizarIconosOrdenamiento() {
  const { columna, direccion } = estado.ordenamiento;

  // Quitar clases de todas las cabeceras
  document.querySelectorAll('.th-ordenable').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
  });

  // Agregar clase a la columna activa
  if (columna && direccion) {
    const thActivo = document.querySelector(`.th-ordenable[data-columna="${columna}"]`);
    if (thActivo) {
      thActivo.classList.add(`sort-${direccion}`);
    }
  }
}

/**
 * Aplica los filtros activos y renderiza los productos
 */
function aplicarFiltros() {
  const { busqueda, categoria, marca, ofertas } = estado.filtros;

  // Filtrar productos - primero aplicar búsqueda AND
  let productosFiltrados = filtrarProductosPorBusqueda(estado.productos, busqueda);

  // Aplicar filtros adicionales
  estado.productosFiltrados = productosFiltrados.filter(producto => {
    // Filtro por categoría
    if (categoria && producto.categoria !== categoria) {
      return false;
    }

    // Filtro por marca
    if (marca && producto.marca !== marca) {
      return false;
    }

    // Filtro por tipo de oferta
    if (ofertas) {
      const descuento = calcularDescuento(producto);
      const tipoOferta = producto.tipo_oferta || '';

      switch (ofertas) {
        case 'marca_dia':
          // Marca del día: productos con descuento > 10%
          if (descuento <= 10) return false;
          break;
        case 'nadie_nos_gana':
          // Por ahora: productos con descuento > 20% o campo tipo_oferta
          if (tipoOferta !== 'nadie_nos_gana' && descuento <= 20) return false;
          break;
        case 'precio_viral':
          // Por ahora: productos con descuento > 15% o campo tipo_oferta
          if (tipoOferta !== 'precio_viral' && descuento <= 15) return false;
          break;
        case 'obsequios':
          // Por ahora: productos con campo tipo_oferta = obsequios
          if (tipoOferta !== 'obsequios') return false;
          break;
        default:
          break;
      }
    }

    return true;
  });

  // Aplicar ordenamiento si existe
  ordenarProductos();

  // Reiniciar a primera página al filtrar
  estado.paginaActual = 1;

  // Renderizar tabla
  renderizarTabla();
  actualizarContador();
  actualizarPaginacion();
}

/**
 * Actualiza el select de categorías con opciones únicas
 */
function actualizarSelectCategorias() {
  const categoriasOrdenadas = Array.from(estado.categorias).sort();

  elementos.selectCategoria.innerHTML = '<option value="">Todas</option>';

  categoriasOrdenadas.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    elementos.selectCategoria.appendChild(option);
  });
}

/**
 * Actualiza el select de marcas con opciones únicas
 */
function actualizarSelectMarcas() {
  const marcasOrdenadas = Array.from(estado.marcas).sort();

  elementos.selectMarca.innerHTML = '<option value="">Todas</option>';

  marcasOrdenadas.forEach(m => {
    const option = document.createElement('option');
    option.value = m;
    option.textContent = m;
    elementos.selectMarca.appendChild(option);
  });
}

/**
 * Actualiza las opciones de marca basado en la categoría seleccionada
 * @param {string} categoria - Categoría seleccionada (vacío = todas)
 */
function actualizarFiltroMarca(categoria) {
  const marcas = new Set();

  // Recorrer productos y obtener marcas de la categoría
  estado.productos.forEach(p => {
    if (!categoria || p.categoria === categoria) {
      if (p.marca) marcas.add(p.marca);
    }
  });

  // Reconstruir opciones del select de marca
  $('#selectMarca').empty();
  $('#selectMarca').append('<option value="">Todas</option>');

  Array.from(marcas).sort().forEach(marca => {
    $('#selectMarca').append(`<option value="${marca}">${marca}</option>`);
  });

  // Refresh Select2
  $('#selectMarca').trigger('change.select2');

  // Limpiar selección de marca si ya no está disponible
  const marcaActual = estado.filtros.marca;
  if (marcaActual && !marcas.has(marcaActual)) {
    estado.filtros.marca = '';
    $('#selectMarca').val('').trigger('change');
  }
}


// ============================================
// FUNCIONES DE PAGINACIÓN
// ============================================

/**
 * Obtiene los productos de la página actual
 * @returns {Array} - Productos de la página actual
 */
function obtenerProductosPagina() {
  const inicio = (estado.paginaActual - 1) * estado.productosPorPagina;
  const fin = inicio + estado.productosPorPagina;
  return estado.productosFiltrados.slice(inicio, fin);
}

/**
 * Calcula el total de páginas
 * @returns {number} - Total de páginas
 */
function calcularTotalPaginas() {
  return Math.ceil(estado.productosFiltrados.length / estado.productosPorPagina) || 1;
}

/**
 * Actualiza los controles de paginación
 */
function actualizarPaginacion() {
  const totalPags = calcularTotalPaginas();

  elementos.totalPaginas.textContent = totalPags;
  elementos.inputPagina.value = estado.paginaActual;
  elementos.inputPagina.max = totalPags;

  // Habilitar/deshabilitar botones
  elementos.btnPrimera.disabled = estado.paginaActual === 1;
  elementos.btnAnterior.disabled = estado.paginaActual === 1;
  elementos.btnSiguiente.disabled = estado.paginaActual >= totalPags;
  elementos.btnUltima.disabled = estado.paginaActual >= totalPags;
}

/**
 * Navega a una página específica
 * @param {number} pagina - Número de página
 */
function irAPagina(pagina) {
  const totalPags = calcularTotalPaginas();

  if (pagina < 1) pagina = 1;
  if (pagina > totalPags) pagina = totalPags;

  if (pagina !== estado.paginaActual) {
    estado.paginaActual = pagina;
    renderizarTabla();
    actualizarPaginacion();
    actualizarContador(); // Actualizar info de paginación

    // Scroll al inicio de la tabla
    elementos.tablaProductos.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ============================================
// FUNCIONES DE RENDERIZADO
// ============================================

/**
 * Renderiza la tabla de productos
 */
function renderizarTabla() {
  const productosPagina = obtenerProductosPagina();

  if (estado.productosFiltrados.length === 0) {
    elementos.productosBody.innerHTML = '';
    elementos.sinResultados.style.display = 'block';
    elementos.paginacion.style.display = 'none';
    return;
  }

  elementos.sinResultados.style.display = 'none';
  elementos.paginacion.style.display = 'flex';

  // Renderizar filas
  elementos.productosBody.innerHTML = productosPagina.map(producto =>
    renderizarFila(producto)
  ).join('');

  // Agregar event listeners a las filas
  agregarEventListenersFilas();
}

/**
 * Renderiza una fila de producto en la tabla
 * @param {Object} producto - Datos del producto
 * @returns {string} - HTML de la fila
 */
function renderizarFila(producto) {
  // Stock - número con clase según disponibilidad
  const cantidadStock = producto.cantidad || 0;
  const stockClass = cantidadStock === 0 ? 'stock-cero' : 'stock-ok';

  // Texto del título para tooltip
  const tituloTexto = producto.titulo || 'Sin nombre';
  const principioTexto = producto.principio_activo || '-';

  // Imagen - thumbnail o placeholder (clickeable si tiene imágenes)
  const imagenUrl = producto.imagen_principal || '';
  const totalImagenes = producto.total_imagenes || (producto.imagenes ? producto.imagenes.length : 0);
  const tieneMultiples = totalImagenes > 1;
  const productoDataStr = JSON.stringify(producto).replace(/'/g, "&apos;");

  let imagenHtml;
  if (esUrlImagenValida(imagenUrl)) {
    const badgeHtml = tieneMultiples
      ? `<span class="imagen-badge">📷 ${totalImagenes}</span>`
      : '';
    const hoverOverlay = tieneMultiples
      ? `<div class="imagen-hover-overlay"><span>Ver galería</span></div>`
      : `<div class="imagen-hover-overlay"><span>Ampliar</span></div>`;

    imagenHtml = `
      <div class="imagen-container" data-producto='${productoDataStr}'>
        <img src="${imagenUrl}" alt="${tituloTexto}"
             class="tabla-thumbnail tabla-thumbnail-clickeable"
             referrerpolicy="no-referrer"
             onerror="this.style.display='none';this.parentElement.querySelector('.tabla-placeholder').style.display='flex';var ov=this.parentElement.querySelector('.imagen-hover-overlay');if(ov)ov.style.display='none';var bg=this.parentElement.querySelector('.imagen-badge');if(bg)bg.style.display='none';this.parentElement.style.cursor='default';this.parentElement.onclick=null;">
        <div class="tabla-placeholder" style="display:none;">Sin img</div>
        ${badgeHtml}
        ${hoverOverlay}
      </div>`;
  } else {
    imagenHtml = `<div class="tabla-placeholder">Sin img</div>`;
  }

  // Obtener precio según tipo de cliente
  const precioCliente = obtenerPrecioCliente(producto);
  const precioLista = producto.precio_lista || 0;
  const tieneDescuento = precioLista > precioCliente && precioLista > 0;

  // Código interno
  const codigoInterno = producto.cod_interno || '-';

  return `
    <tr>
      <td>
        <input
          type="number"
          class="input-cantidad"
          data-producto='${productoDataStr}'
          min="1"
          placeholder="0"
        >
      </td>
      <td class="td-imagen">${imagenHtml}</td>
      <td title="${tituloTexto}">${tituloTexto}</td>
      <td>${producto.presentacion ? producto.presentacion.charAt(0).toUpperCase() + producto.presentacion.slice(1).toLowerCase() : '-'}</td>
      <td class="td-precio-cliente">${formatearPrecio(precioCliente)}</td>
      <td class="td-precio-lista ${tieneDescuento ? 'precio-tachado' : ''}">${formatearPrecio(precioLista)}</td>
      <td>${producto.categoria || '-'}</td>
      <td>${producto.embalaje || '-'}</td>
      <td class="td-acciones">
        <button class="btn-ver-detalles" data-producto='${productoDataStr}' title="Ver detalles">
          <span class="icono-tres-puntos">⋮</span>
        </button>
      </td>
    </tr>
  `;
}

/**
 * Agrega event listeners a las filas de la tabla
 */
function agregarEventListenersFilas() {
  // Inputs de cantidad - Enter para agregar al carrito
  elementos.productosBody.querySelectorAll('.input-cantidad').forEach(input => {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const cantidad = parseInt(e.target.value) || 0;
        if (cantidad > 0) {
          const producto = JSON.parse(e.target.dataset.producto.replace(/&apos;/g, "'"));
          carrito.agregar(producto, cantidad);
          e.target.value = ''; // Limpiar input
        }
      }
    });
  });

  // Botones ver detalles
  elementos.productosBody.querySelectorAll('.btn-ver-detalles').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const button = e.target.closest('.btn-ver-detalles');
      const producto = JSON.parse(button.dataset.producto.replace(/&apos;/g, "'"));
      abrirModalProducto(producto);
    });
  });

  // Contenedores de imagen clickeables - abrir galería/zoom
  elementos.productosBody.querySelectorAll('.imagen-container').forEach(container => {
    container.addEventListener('click', (e) => {
      const producto = JSON.parse(container.dataset.producto.replace(/&apos;/g, "'"));
      abrirGaleria(producto);
    });
  });
}

/**
 * Actualiza el contador de resultados
 */
function actualizarContador() {
  const total = estado.productos.length;
  const filtrados = estado.productosFiltrados.length;
  const inicio = filtrados > 0 ? (estado.paginaActual - 1) * estado.productosPorPagina + 1 : 0;
  const fin = Math.min(estado.paginaActual * estado.productosPorPagina, filtrados);

  if (estado.filtros.busqueda || estado.filtros.categoria ||
      estado.filtros.marca || estado.filtros.ofertas) {
    elementos.infoResultados.textContent =
      `Mostrando ${inicio}-${fin} de ${filtrados} resultados`;
  } else {
    elementos.infoResultados.textContent =
      `Mostrando ${inicio}-${fin} de ${total} resultados`;
  }
}

// ============================================
// FUNCIONES DE UI
// ============================================

/**
 * Muestra u oculta el loader
 * @param {boolean} mostrar - Si mostrar o no el loader
 */
function mostrarLoader(mostrar) {
  elementos.loader.style.display = mostrar ? 'block' : 'none';
}

/**
 * Muestra un mensaje de error
 * @param {string} mensaje - Mensaje de error a mostrar
 */
function mostrarError(mensaje) {
  elementos.infoResultados.textContent = mensaje;
  elementos.infoResultados.style.color = '#dc3545';
}

/**
 * Limpia todos los filtros aplicados
 */
function limpiarFiltros() {
  estado.filtros.busqueda = '';
  estado.filtros.categoria = '';
  estado.filtros.marca = '';
  estado.filtros.ofertas = '';

  elementos.inputBusqueda.value = '';

  // Limpiar todos los Select2
  $('#selectCategoria').val('').trigger('change.select2');
  $('#selectMarca').val('').trigger('change.select2');
  $('#filtroOfertas').val('').trigger('change.select2');

  // Ocultar todos los botones X de limpiar
  if (elementos.btnLimpiarBusqueda) elementos.btnLimpiarBusqueda.style.display = 'none';
  if (elementos.btnLimpiarCategoria) elementos.btnLimpiarCategoria.style.display = 'none';
  if (elementos.btnLimpiarMarca) elementos.btnLimpiarMarca.style.display = 'none';
  if (elementos.btnLimpiarOfertas) elementos.btnLimpiarOfertas.style.display = 'none';

  // Restaurar todas las marcas
  actualizarFiltroMarca('');

  aplicarFiltros();
}

// ============================================
// MODAL DETALLE PRODUCTO
// ============================================

/**
 * Abre el modal con los detalles del producto
 * @param {Object} producto - Datos del producto
 */
function abrirModalProducto(producto) {
  if (!producto) return;

  productoActualModal = producto;

  // Llenar datos del modal
  elementos.modalProductoTitulo.textContent = producto.titulo || 'Sin nombre';
  elementos.modalProductoSku.textContent = producto.cod_interno || '-';
  elementos.modalProductoMarca.textContent = producto.marca || '-';
  elementos.modalProductoEan.textContent = producto.ean || '-';
  elementos.modalProductoStock.textContent = producto.cantidad || 0;

  // Precios según tipo de cliente
  const precioCliente = obtenerPrecioCliente(producto);
  const precioLista = producto.precio_lista || 0;
  elementos.modalProductoPrecio.textContent = formatearPrecio(precioCliente);
  elementos.modalProductoPrecioReg.textContent = formatearPrecio(precioLista);

  // Actualizar label del precio con tipo de cliente
  const labelPrecio = document.getElementById('modalPrecioLabel');
  if (labelPrecio) {
    labelPrecio.textContent = getEtiquetaTipoCliente() + ':';
  }

  elementos.modalProductoCantidad.value = 1;

  // Ficha técnica - mostrar botón si existe URL
  const fichaContainer = document.getElementById('fichaContainer');
  const btnVerFicha = document.getElementById('btnVerFicha');
  // Usar ficha_tecnica_url (URL real) o ficha_tecnica como fallback
  const urlFicha = producto.ficha_tecnica_url || producto.ficha_tecnica;
  if (urlFicha && urlFicha.startsWith('http')) {
    fichaContainer.style.display = 'block';
    btnVerFicha.dataset.url = urlFicha;
    btnVerFicha.dataset.titulo = producto.titulo || 'Ficha Técnica';
  } else {
    fichaContainer.style.display = 'none';
  }

  // Imagen - con soporte para galería
  const totalImagenes = producto.total_imagenes || (producto.imagenes ? producto.imagenes.length : 0);
  const tieneMultiplesImagenes = totalImagenes > 1;

  // Ocultar badge y overlay por defecto
  elementos.modalImagenBadge.style.display = 'none';
  elementos.modalImagenOverlay.style.display = 'none';

  if (tieneMultiplesImagenes) {
    // Múltiples imágenes: mostrar imagen clickeable que abre galería
    elementos.modalProductoImagen.src = producto.imagen_principal || producto.imagenes[0];
    elementos.modalProductoImagen.style.display = 'block';
    elementos.modalProductoImagen.style.cursor = 'pointer';
    elementos.modalProductoImagen.classList.add('modal-imagen-galeria');
    elementos.modalProductoSinImagen.style.display = 'none';

    // Mostrar badge con contador
    elementos.modalImagenBadge.textContent = `📷 ${totalImagenes} imágenes`;
    elementos.modalImagenBadge.style.display = 'block';

    // Mostrar overlay en hover
    elementos.modalImagenOverlay.style.display = 'flex';

    // Agregar indicador de galería
    elementos.modalProductoImagen.title = `Ver galería (${totalImagenes} imágenes)`;

    elementos.modalProductoImagen.onclick = () => abrirGaleria(producto);
    elementos.modalProductoImagen.onerror = () => {
      elementos.modalProductoImagen.style.display = 'none';
      elementos.modalProductoSinImagen.style.display = 'flex';
      elementos.modalImagenBadge.style.display = 'none';
      elementos.modalImagenOverlay.style.display = 'none';
    };
  } else if (esUrlImagenValida(producto.imagen_principal)) {
    // Una sola imagen: clickeable para ampliar en modal
    elementos.modalProductoImagen.src = producto.imagen_principal;
    elementos.modalProductoImagen.style.display = 'block';
    elementos.modalProductoImagen.style.cursor = 'zoom-in';
    elementos.modalProductoImagen.classList.add('modal-imagen-ampliable');
    elementos.modalProductoImagen.title = 'Click para ampliar';
    elementos.modalProductoImagen.onclick = () => {
      // Usar el modal de galería para mostrar imagen ampliada
      abrirGaleria(producto);
    };
    elementos.modalProductoSinImagen.style.display = 'none';
    elementos.modalProductoImagen.onerror = () => {
      elementos.modalProductoImagen.style.display = 'none';
      elementos.modalProductoSinImagen.style.display = 'flex';
    };
  } else {
    // Sin imágenes: mostrar placeholder
    elementos.modalProductoImagen.style.display = 'none';
    elementos.modalProductoSinImagen.style.display = 'flex';
  }

  // Mostrar modal
  elementos.modalProducto.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

/**
 * Cierra el modal de producto
 */
function cerrarModalProducto() {
  elementos.modalProducto.style.display = 'none';
  document.body.style.overflow = '';
  productoActualModal = null;
}

// ============================================
// GALERÍA DE IMÁGENES
// ============================================

/**
 * Abre la galería de imágenes para un producto
 * @param {Object} producto - Datos del producto
 */
function abrirGaleria(producto) {
  if (!producto) return;

  // Construir array de imágenes
  let imagenes = [];

  // Usar array de imágenes si existe
  if (producto.imagenes && Array.isArray(producto.imagenes) && producto.imagenes.length > 0) {
    imagenes = producto.imagenes.filter(url => esUrlImagenValida(url));
  }
  // Si no hay array, usar imagen_principal
  else if (esUrlImagenValida(producto.imagen_principal)) {
    imagenes = [producto.imagen_principal];
  }

  // Si no hay imágenes válidas, no abrir galería
  if (imagenes.length === 0) return;

  // Guardar estado
  galeriaEstado.imagenes = imagenes;
  galeriaEstado.indiceActual = 0;
  galeriaEstado.titulo = producto.titulo || 'Producto';

  // Actualizar UI
  elementos.galeriaTitulo.textContent = galeriaEstado.titulo;
  actualizarImagenGaleria();
  renderizarThumbnails();

  // Mostrar modal
  elementos.modalGaleria.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

/**
 * Cierra la galería de imágenes
 */
function cerrarGaleria() {
  elementos.modalGaleria.style.display = 'none';
  document.body.style.overflow = '';
  galeriaEstado.imagenes = [];
  galeriaEstado.indiceActual = 0;
}

// ============================================
// MODAL FICHA TÉCNICA
// ============================================

/**
 * Abre el modal de ficha técnica con el visor PDF
 * @param {string} url - URL del PDF
 * @param {string} titulo - Título del producto
 */
function abrirFichaTecnica(url, titulo) {
  if (!url) return;

  // Convertir URL de descarga a URL de visualización de Google Drive
  let viewerUrl = url;

  // Si es una URL de Google Drive de descarga, convertir a vista previa
  if (url.includes('drive.google.com') && url.includes('export=download')) {
    const fileId = url.match(/id=([^&]+)/)?.[1];
    if (fileId) {
      viewerUrl = `https://drive.google.com/file/d/${fileId}/preview`;
    }
  }

  // Actualizar modal
  elementos.modalFichaTitulo.textContent = `Ficha Técnica - ${titulo}`;
  elementos.fichaViewer.src = viewerUrl;
  elementos.btnDescargarFichaPDF.href = url;

  // Mostrar modal
  elementos.modalFichaTecnica.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

/**
 * Cierra el modal de ficha técnica
 */
function cerrarFichaTecnica() {
  elementos.modalFichaTecnica.style.display = 'none';
  elementos.fichaViewer.src = '';
  document.body.style.overflow = '';
}

/**
 * Actualiza la imagen principal de la galería
 */
function actualizarImagenGaleria() {
  const { imagenes, indiceActual } = galeriaEstado;

  // Actualizar imagen
  elementos.galeriaImagenPrincipal.src = imagenes[indiceActual];

  // Actualizar contador
  elementos.galeriaContador.textContent = `${indiceActual + 1} de ${imagenes.length}`;

  // Actualizar botones de navegación
  elementos.btnGaleriaPrev.disabled = indiceActual === 0;
  elementos.btnGaleriaNext.disabled = indiceActual === imagenes.length - 1;

  // Actualizar thumbnail activa
  actualizarThumbnailActiva();
}

/**
 * Renderiza las miniaturas de la galería
 */
function renderizarThumbnails() {
  const { imagenes } = galeriaEstado;

  elementos.galeriaThumbnails.innerHTML = imagenes.map((url, idx) => `
    <div class="galeria__thumb ${idx === 0 ? 'galeria__thumb--activa' : ''}" data-indice="${idx}">
      <img src="${url}" alt="Imagen ${idx + 1}">
    </div>
  `).join('');

  // Agregar event listeners a thumbnails
  elementos.galeriaThumbnails.querySelectorAll('.galeria__thumb').forEach(thumb => {
    thumb.addEventListener('click', () => {
      const indice = parseInt(thumb.dataset.indice);
      irAImagenGaleria(indice);
    });
  });
}

/**
 * Actualiza la clase activa en las miniaturas
 */
function actualizarThumbnailActiva() {
  const { indiceActual } = galeriaEstado;

  elementos.galeriaThumbnails.querySelectorAll('.galeria__thumb').forEach((thumb, idx) => {
    thumb.classList.toggle('galeria__thumb--activa', idx === indiceActual);
  });
}

/**
 * Navega a una imagen específica en la galería
 * @param {number} indice - Índice de la imagen
 */
function irAImagenGaleria(indice) {
  const { imagenes } = galeriaEstado;

  if (indice >= 0 && indice < imagenes.length) {
    galeriaEstado.indiceActual = indice;
    actualizarImagenGaleria();
  }
}

/**
 * Navega a la imagen anterior
 */
function galeriaAnterior() {
  if (galeriaEstado.indiceActual > 0) {
    galeriaEstado.indiceActual--;
    actualizarImagenGaleria();
  }
}

/**
 * Navega a la imagen siguiente
 */
function galeriaSiguiente() {
  if (galeriaEstado.indiceActual < galeriaEstado.imagenes.length - 1) {
    galeriaEstado.indiceActual++;
    actualizarImagenGaleria();
  }
}

// ============================================
// EVENT LISTENERS
// ============================================

// Búsqueda con debounce (300ms)
elementos.inputBusqueda.addEventListener('input', debounce((e) => {
  const valor = e.target.value.trim();
  estado.filtros.busqueda = valor;

  // Mostrar/ocultar botón limpiar (X rojo)
  if (elementos.btnLimpiarBusqueda) {
    elementos.btnLimpiarBusqueda.style.display = valor.length > 0 ? 'flex' : 'none';
  }

  aplicarFiltros();
}, 300));

// Botón limpiar búsqueda (X rojo)
elementos.btnLimpiarBusqueda?.addEventListener('click', () => {
  elementos.inputBusqueda.value = '';
  estado.filtros.busqueda = '';
  elementos.btnLimpiarBusqueda.style.display = 'none';
  elementos.inputBusqueda.focus();
  aplicarFiltros();
});

// Nota: Los filtros de laboratorio, marca y ofertas se manejan en Select2 (inicializarSelect2)

// Limpiar filtros
elementos.btnLimpiarFiltros.addEventListener('click', limpiarFiltros);

// Paginación - Primera página
elementos.btnPrimera.addEventListener('click', () => irAPagina(1));

// Paginación - Página anterior
elementos.btnAnterior.addEventListener('click', () => irAPagina(estado.paginaActual - 1));

// Paginación - Página siguiente
elementos.btnSiguiente.addEventListener('click', () => irAPagina(estado.paginaActual + 1));

// Paginación - Última página
elementos.btnUltima.addEventListener('click', () => irAPagina(calcularTotalPaginas()));

// Paginación - Input de página
elementos.inputPagina.addEventListener('change', (e) => {
  const pagina = parseInt(e.target.value) || 1;
  irAPagina(pagina);
});

// Paginación - Productos por página
elementos.selectPorPagina.addEventListener('change', (e) => {
  estado.productosPorPagina = parseInt(e.target.value);
  estado.paginaActual = 1;
  renderizarTabla();
  actualizarPaginacion();
  actualizarContador();
});

// Modal producto - cerrar con botón X
document.querySelectorAll('[data-cerrar-modal="modalProducto"]').forEach(btn => {
  btn.addEventListener('click', cerrarModalProducto);
});

// Modal producto - cerrar al hacer click en overlay
elementos.modalProducto?.querySelector('.modal__overlay')?.addEventListener('click', cerrarModalProducto);

// Modal producto - agregar al carrito
elementos.btnAgregarDesdeModal?.addEventListener('click', () => {
  if (productoActualModal) {
    const cantidad = parseInt(elementos.modalProductoCantidad.value) || 1;
    carrito.agregar(productoActualModal, cantidad);
    cerrarModalProducto();
  }
});

// Modal producto - Enter en cantidad agrega al carrito
elementos.modalProductoCantidad?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && productoActualModal) {
    const cantidad = parseInt(elementos.modalProductoCantidad.value) || 1;
    carrito.agregar(productoActualModal, cantidad);
    cerrarModalProducto();
  }
});

// Galería - cerrar con botón X
elementos.btnCerrarGaleria?.addEventListener('click', cerrarGaleria);

// Galería - cerrar al hacer click en overlay
elementos.modalGaleria?.querySelector('.modal__overlay')?.addEventListener('click', cerrarGaleria);

// Galería - navegación anterior
elementos.btnGaleriaPrev?.addEventListener('click', galeriaAnterior);

// Galería - navegación siguiente
elementos.btnGaleriaNext?.addEventListener('click', galeriaSiguiente);

// Galería - navegación con teclado
document.addEventListener('keydown', (e) => {
  if (elementos.modalGaleria?.style.display === 'flex') {
    if (e.key === 'Escape') {
      cerrarGaleria();
    } else if (e.key === 'ArrowLeft') {
      galeriaAnterior();
    } else if (e.key === 'ArrowRight') {
      galeriaSiguiente();
    }
  }
  // Ficha técnica - cerrar con Escape
  if (elementos.modalFichaTecnica?.style.display === 'flex' && e.key === 'Escape') {
    cerrarFichaTecnica();
  }
});

// Ficha técnica - abrir modal al hacer click en el botón
elementos.btnVerFicha?.addEventListener('click', () => {
  const url = elementos.btnVerFicha.dataset.url;
  const titulo = elementos.btnVerFicha.dataset.titulo;
  if (url) {
    abrirFichaTecnica(url, titulo);
  }
});

// Ficha técnica - cerrar con botón X y botón Cerrar
document.querySelectorAll('[data-cerrar-modal="modalFichaTecnica"]').forEach(btn => {
  btn.addEventListener('click', cerrarFichaTecnica);
});

// Ficha técnica - cerrar al hacer click en overlay
elementos.modalFichaTecnica?.querySelector('.modal__overlay')?.addEventListener('click', cerrarFichaTecnica);

// ============================================
// INICIALIZACIÓN
// ============================================

/**
 * Inicializa Select2 en los dropdowns de filtros
 */
function inicializarSelect2() {
  // Select2 para Categoría
  $('#selectCategoria').select2({
    placeholder: 'Todas',
    allowClear: false,
    width: '100%',
    language: {
      noResults: () => 'No se encontraron resultados'
    }
  }).on('change', function() {
    const catSeleccionada = $(this).val() || '';
    estado.filtros.categoria = catSeleccionada;

    // Mostrar/ocultar botón limpiar
    if (elementos.btnLimpiarCategoria) {
      elementos.btnLimpiarCategoria.style.display = catSeleccionada ? 'flex' : 'none';
    }

    // Actualizar opciones de marca según categoría
    actualizarFiltroMarca(catSeleccionada);

    aplicarFiltros();
  });

  // Select2 para Marca
  $('#selectMarca').select2({
    placeholder: 'Todas',
    allowClear: false,
    width: '100%',
    language: {
      noResults: () => 'No se encontraron resultados'
    }
  }).on('change', function() {
    const marcaSeleccionada = $(this).val() || '';
    estado.filtros.marca = marcaSeleccionada;

    // Mostrar/ocultar botón limpiar
    if (elementos.btnLimpiarMarca) {
      elementos.btnLimpiarMarca.style.display = marcaSeleccionada ? 'flex' : 'none';
    }

    aplicarFiltros();
  });

  // Select2 para Ofertas
  $('#filtroOfertas').select2({
    placeholder: 'Todas',
    allowClear: true,
    width: '100%',
    minimumResultsForSearch: Infinity  // Ocultar búsqueda (solo 2 opciones)
  }).on('change', function() {
    const ofertaSeleccionada = $(this).val() || '';
    estado.filtros.ofertas = ofertaSeleccionada;

    // Mostrar/ocultar botón limpiar
    if (elementos.btnLimpiarOfertas) {
      elementos.btnLimpiarOfertas.style.display = ofertaSeleccionada ? 'flex' : 'none';
    }

    aplicarFiltros();
  });

  // Event listeners para botones limpiar de filtros
  elementos.btnLimpiarCategoria?.addEventListener('click', () => {
    $('#selectCategoria').val('').trigger('change');
    elementos.btnLimpiarCategoria.style.display = 'none';
  });

  elementos.btnLimpiarMarca?.addEventListener('click', () => {
    $('#selectMarca').val('').trigger('change');
    elementos.btnLimpiarMarca.style.display = 'none';
  });

  elementos.btnLimpiarOfertas?.addEventListener('click', () => {
    $('#filtroOfertas').val('').trigger('change');
    elementos.btnLimpiarOfertas.style.display = 'none';
  });
}

// Cargar productos al iniciar la página (solo si usuario aprobado)
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Iniciando catálogo ENAR (Vista Tabla)...');

  // Inicializar Select2 para búsqueda en dropdowns
  inicializarSelect2();

  // Inicializar ordenamiento de columnas
  document.querySelectorAll('.th-ordenable').forEach(th => {
    th.addEventListener('click', () => {
      const columna = th.dataset.columna;
      if (columna) {
        cambiarOrdenamiento(columna);
      }
    });
  });

  // Esperar a que el usuario esté autenticado y aprobado antes de cargar productos
  // Registrar listener ANTES de inicializarUsuario para no perder el evento
  let productosCargados = false;
  const ADMIN_EMAILS = ['sebastianbumq@enarapp.com'];
  const USER_MANAGER_EMAILS = ['ventas@enar.com.co'];

  function verificarYCargar(user, userData) {
    const esPrivilegiado = user && (ADMIN_EMAILS.includes(user.email) || USER_MANAGER_EMAILS.includes(user.email));
    const esAprobado = user && (userData?.estado === 'aprobado' || esPrivilegiado);
    if (esAprobado && !productosCargados) {
      productosCargados = true;
      cargarTodosLosProductos();
    }
  }

  window.addEventListener('userStateChanged', (e) => {
    verificarYCargar(e.detail.user, e.detail.userData);
  });

  // Inicializar módulo de usuario
  await inicializarUsuario();

  // Escuchar cambios en el tipo de cliente para re-renderizar
  onUsuarioChange(() => {
    // Actualizar cabecera de la tabla con el tipo de cliente
    const thPrecio = document.getElementById('thPrecioCliente');
    if (thPrecio) {
      // Mantener el icono de ordenamiento
      const sortIcon = thPrecio.querySelector('.sort-icon');
      thPrecio.innerHTML = getEtiquetaTipoCliente() + ' ';
      if (sortIcon) {
        thPrecio.appendChild(sortIcon);
      } else {
        const newIcon = document.createElement('span');
        newIcon.className = 'sort-icon';
        thPrecio.appendChild(newIcon);
      }
    }

    // Re-renderizar tabla si ya hay productos cargados
    if (estado.productos.length > 0) {
      renderizarTabla();
    }
  });

  // Si el evento ya se disparó antes de registrar el listener, verificar estado actual
  if (window.currentUser && window.currentUserData) {
    verificarYCargar(window.currentUser, window.currentUserData);
  }
});
