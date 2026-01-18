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

// ============================================
// CONSTANTES Y ESTADO
// ============================================

const PRODUCTOS_POR_PAGINA_DEFAULT = 50;

// Estado de la aplicación
const estado = {
  productos: [],           // Todos los productos cargados
  productosFiltrados: [],  // Productos después de filtrar
  cargando: false,         // Estado de carga
  laboratorios: new Set(), // Lista única de laboratorios
  marcas: new Set(),       // Lista única de marcas
  paginaActual: 1,         // Página actual
  productosPorPagina: PRODUCTOS_POR_PAGINA_DEFAULT,
  filtros: {
    busqueda: '',
    laboratorio: '',
    marca: '',
    ofertas: ''            // '' = todas, 'oferta' = solo ofertas
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
  selectLaboratorio: document.getElementById('selectLaboratorio'),
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
  modalProductoLab: document.getElementById('modalProductoLab'),
  modalProductoMarca: document.getElementById('modalProductoMarca'),
  modalProductoPrincipio: document.getElementById('modalProductoPrincipio'),
  modalProductoIndicacion: document.getElementById('modalProductoIndicacion'),
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
  btnGaleriaNext: document.getElementById('btnGaleriaNext')
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
    estado.laboratorios.clear();
    estado.marcas.clear();

    snapshot.forEach(doc => {
      const producto = { id: doc.id, ...doc.data() };
      estado.productos.push(producto);

      // Agregar laboratorio y marca a las listas únicas
      if (producto.laboratorio) {
        estado.laboratorios.add(producto.laboratorio);
      }
      if (producto.marca) {
        estado.marcas.add(producto.marca);
      }
    });

    // Actualizar selects de filtros
    actualizarSelectLaboratorios();
    actualizarSelectMarcas();

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
 * Filtra productos por múltiples palabras (búsqueda AND)
 * Todas las palabras deben estar presentes en el título
 * @param {Array} productos - Lista de productos
 * @param {string} textoBusqueda - Texto de búsqueda
 * @returns {Array} - Productos filtrados
 */
function filtrarProductosPorBusqueda(productos, textoBusqueda) {
  if (!textoBusqueda || textoBusqueda.trim() === '') {
    return productos;
  }

  // Dividir búsqueda en palabras individuales
  const palabras = textoBusqueda.toLowerCase()
    .trim()
    .split(/\s+/) // Separar por espacios
    .filter(p => p.length > 0);

  // Filtrar productos que contengan TODAS las palabras
  return productos.filter(producto => {
    const titulo = (producto.titulo || '').toLowerCase();

    // Verificar que TODAS las palabras estén en el título
    return palabras.every(palabra => titulo.includes(palabra));
  });
}

/**
 * Aplica los filtros activos y renderiza los productos
 */
function aplicarFiltros() {
  const { busqueda, laboratorio, marca, ofertas } = estado.filtros;

  // Filtrar productos - primero aplicar búsqueda AND
  let productosFiltrados = filtrarProductosPorBusqueda(estado.productos, busqueda);

  // Aplicar filtros adicionales
  estado.productosFiltrados = productosFiltrados.filter(producto => {
    // Filtro por laboratorio
    if (laboratorio && producto.laboratorio !== laboratorio) {
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

  // Reiniciar a primera página al filtrar
  estado.paginaActual = 1;

  // Renderizar tabla
  renderizarTabla();
  actualizarContador();
  actualizarPaginacion();
}

/**
 * Actualiza el select de laboratorios con opciones únicas
 */
function actualizarSelectLaboratorios() {
  const laboratoriosOrdenados = Array.from(estado.laboratorios).sort();

  elementos.selectLaboratorio.innerHTML = '<option value="">Todos</option>';

  laboratoriosOrdenados.forEach(lab => {
    const option = document.createElement('option');
    option.value = lab;
    option.textContent = lab;
    elementos.selectLaboratorio.appendChild(option);
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
 * Actualiza las opciones de marca basado en el laboratorio seleccionado
 * @param {string} laboratorio - Laboratorio seleccionado (vacío = todos)
 */
function actualizarFiltroMarca(laboratorio) {
  const marcas = new Set();

  // Recorrer productos y obtener marcas del laboratorio
  estado.productos.forEach(p => {
    if (!laboratorio || p.laboratorio === laboratorio) {
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
      : '';

    imagenHtml = `
      <div class="imagen-container" data-producto='${productoDataStr}'>
        <img src="${imagenUrl}" alt="${tituloTexto}"
             class="tabla-thumbnail ${tieneMultiples ? 'tabla-thumbnail-clickeable' : ''}"
             onerror="this.style.display='none';this.parentElement.querySelector('.tabla-placeholder').style.display='flex';">
        <div class="tabla-placeholder" style="display:none;">Sin img</div>
        ${badgeHtml}
        ${hoverOverlay}
      </div>`;
  } else {
    imagenHtml = `<div class="tabla-placeholder">Sin img</div>`;
  }

  return `
    <tr>
      <td>
        <input
          type="number"
          class="input-cantidad"
          data-producto='${productoDataStr}'
          min="1"
          max="${cantidadStock}"
          ${cantidadStock === 0 ? 'disabled' : ''}
          placeholder="0"
        >
      </td>
      <td title="${tituloTexto}">${tituloTexto}</td>
      <td><span class="${stockClass}">${cantidadStock}</span></td>
      <td>${formatearPrecio(producto.p_real)}</td>
      <td>${formatearPrecio(producto.p_corriente)}</td>
      <td>${((producto.impuesto || 0.19) * 100).toFixed(0)}%</td>
      <td>${producto.laboratorio || '-'}</td>
      <td title="${principioTexto}">${principioTexto}</td>
      <td class="td-imagen">${imagenHtml}</td>
      <td>
        <button class="btn-ver-detalles" data-producto='${productoDataStr}'>
          Ver
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
      const producto = JSON.parse(e.target.dataset.producto.replace(/&apos;/g, "'"));
      abrirModalProducto(producto);
    });
  });

  // Contenedores de imagen clickeables - abrir galería
  elementos.productosBody.querySelectorAll('.imagen-container').forEach(container => {
    container.addEventListener('click', (e) => {
      const producto = JSON.parse(container.dataset.producto.replace(/&apos;/g, "'"));
      const totalImagenes = producto.total_imagenes || (producto.imagenes ? producto.imagenes.length : 0);
      if (totalImagenes > 1) {
        abrirGaleria(producto);
      }
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

  if (estado.filtros.busqueda || estado.filtros.laboratorio ||
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
  estado.filtros.laboratorio = '';
  estado.filtros.marca = '';
  estado.filtros.ofertas = '';

  elementos.inputBusqueda.value = '';

  // Limpiar todos los Select2
  $('#selectLaboratorio').val('').trigger('change.select2');
  $('#selectMarca').val('').trigger('change.select2');
  $('#filtroOfertas').val('').trigger('change.select2');

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
  elementos.modalProductoLab.textContent = producto.laboratorio || '-';
  elementos.modalProductoMarca.textContent = producto.marca || '-';
  elementos.modalProductoPrincipio.textContent = producto.principio_activo || '-';
  elementos.modalProductoIndicacion.textContent = producto.indicacion || '-';
  elementos.modalProductoEan.textContent = producto.ean || '-';
  elementos.modalProductoStock.textContent = producto.cantidad || 0;
  elementos.modalProductoPrecio.textContent = formatearPrecio(producto.p_real);
  elementos.modalProductoPrecioReg.textContent = formatearPrecio(producto.p_corriente);
  elementos.modalProductoCantidad.value = 1;
  elementos.modalProductoCantidad.max = producto.cantidad || 0;

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
    // Una sola imagen: mostrar sin galería
    elementos.modalProductoImagen.src = producto.imagen_principal;
    elementos.modalProductoImagen.style.display = 'block';
    elementos.modalProductoImagen.style.cursor = 'default';
    elementos.modalProductoImagen.classList.remove('modal-imagen-galeria');
    elementos.modalProductoImagen.title = '';
    elementos.modalProductoImagen.onclick = null;
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
  estado.filtros.busqueda = e.target.value.trim();
  aplicarFiltros();
}, 300));

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
});

// ============================================
// INICIALIZACIÓN
// ============================================

/**
 * Inicializa Select2 en los dropdowns de filtros
 */
function inicializarSelect2() {
  // Select2 para Laboratorio
  $('#selectLaboratorio').select2({
    placeholder: 'Todos',
    allowClear: true,
    width: '220px',
    language: {
      noResults: () => 'No se encontraron resultados'
    }
  }).on('change', function() {
    const labSeleccionado = $(this).val() || '';
    estado.filtros.laboratorio = labSeleccionado;

    // Actualizar opciones de marca según laboratorio
    actualizarFiltroMarca(labSeleccionado);

    aplicarFiltros();
  });

  // Select2 para Marca
  $('#selectMarca').select2({
    placeholder: 'Todas',
    allowClear: true,
    width: '220px',
    language: {
      noResults: () => 'No se encontraron resultados'
    }
  }).on('change', function() {
    estado.filtros.marca = $(this).val() || '';
    aplicarFiltros();
  });

  // Select2 para Ofertas
  $('#filtroOfertas').select2({
    placeholder: 'Todas',
    allowClear: false,
    width: '220px',
    minimumResultsForSearch: Infinity  // Ocultar búsqueda (solo 2 opciones)
  }).on('change', function() {
    estado.filtros.ofertas = $(this).val() || '';
    aplicarFiltros();
  });
}

// Cargar productos al iniciar la página
document.addEventListener('DOMContentLoaded', () => {
  console.log('Iniciando catálogo ENAR (Vista Tabla)...');

  // Inicializar Select2 para búsqueda en dropdowns
  inicializarSelect2();

  cargarTodosLosProductos();
});
