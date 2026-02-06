/**
 * ============================================
 * CARRITO DE COMPRAS
 * ============================================
 * Archivo: carrito.js
 * Descripción: Gestión del carrito de compras
 *              con persistencia en localStorage
 * ============================================
 */

import { formatearPrecio } from './utils.js';
import { obtenerPrecioCliente } from './usuario.js?v=2';

// ============================================
// CLASE CARRITO
// ============================================

class Carrito {
  constructor() {
    this.STORAGE_KEY = 'enar_carrito';
    this.IVA_PORCENTAJE = 0.19;
    this.items = this.cargarDesdeStorage();
    this.inicializarUI();
  }

  /**
   * Carga los items del carrito desde localStorage
   * @returns {Array} - Items del carrito
   */
  cargarDesdeStorage() {
    try {
      const datos = localStorage.getItem(this.STORAGE_KEY);
      return datos ? JSON.parse(datos) : [];
    } catch (error) {
      console.error('Error cargando carrito:', error);
      return [];
    }
  }

  /**
   * Guarda los items del carrito en localStorage
   */
  guardarEnStorage() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.items));
    } catch (error) {
      console.error('Error guardando carrito:', error);
    }
  }

  /**
   * Agrega un producto al carrito o incrementa cantidad
   * @param {Object} producto - Producto a agregar
   * @param {number} cantidad - Cantidad a agregar (default: 1)
   */
  agregar(producto, cantidad = 1) {
    // Buscar si el producto ya existe
    const indice = this.items.findIndex(item => item.cod_interno === producto.cod_interno);

    if (indice !== -1) {
      // Incrementar cantidad
      this.items[indice].cantidad += cantidad;
    } else {
      // Obtener precio según tipo de cliente (ya incluye IVA)
      const precioConIva = obtenerPrecioCliente(producto);

      // Agregar nuevo item
      this.items.push({
        cod_interno: producto.cod_interno,
        titulo: producto.titulo,
        precio_unitario: precioConIva,
        cantidad: cantidad,
        imagen: producto.imagen_principal || '',
        marca: producto.marca || '',
        embalaje: producto.embalaje || 1
      });
    }

    this.guardarEnStorage();
    this.actualizarUI();
    this.mostrarNotificacion(`"${producto.titulo}" agregado al carrito`);
  }

  /**
   * Actualiza la cantidad de un producto
   * @param {string} codInterno - Código del producto
   * @param {number} nuevaCantidad - Nueva cantidad
   */
  actualizarCantidad(codInterno, nuevaCantidad) {
    const indice = this.items.findIndex(item => item.cod_interno === codInterno);

    if (indice !== -1) {
      if (nuevaCantidad <= 0) {
        this.quitar(codInterno);
      } else {
        this.items[indice].cantidad = nuevaCantidad;
        this.guardarEnStorage();
        this.actualizarUI();
      }
    }
  }

  /**
   * Quita un producto del carrito
   * @param {string} codInterno - Código del producto
   */
  quitar(codInterno) {
    this.items = this.items.filter(item => item.cod_interno !== codInterno);
    this.guardarEnStorage();
    this.actualizarUI();
  }

  /**
   * Vacía el carrito completamente
   */
  vaciar() {
    this.items = [];
    this.guardarEnStorage();
    this.actualizarUI();
  }

  /**
   * Calcula el total (los precios ya incluyen IVA)
   * @returns {number} - Total con IVA
   */
  obtenerTotal() {
    return this.items.reduce((total, item) => {
      return total + (item.precio_unitario * item.cantidad);
    }, 0);
  }

  /**
   * Calcula el subtotal (sin IVA)
   * Como los precios ya incluyen IVA, extraemos el valor base
   * @returns {number} - Subtotal sin IVA
   */
  obtenerSubtotal() {
    return this.obtenerTotal() / (1 + this.IVA_PORCENTAJE);
  }

  /**
   * Calcula el IVA incluido en los precios
   * @returns {number} - Valor del IVA
   */
  obtenerIVA() {
    return this.obtenerTotal() - this.obtenerSubtotal();
  }

  /**
   * Obtiene la cantidad total de unidades
   * @returns {number} - Cantidad total de unidades
   */
  obtenerCantidadTotal() {
    return this.items.reduce((total, item) => total + item.cantidad, 0);
  }

  /**
   * Obtiene la cantidad de productos diferentes
   * @returns {number} - Número de productos diferentes
   */
  obtenerTotalProductos() {
    return this.items.length;
  }

  /**
   * Obtiene los items del carrito
   * @returns {Array} - Items
   */
  obtenerItems() {
    return [...this.items];
  }

  /**
   * Verifica si el carrito está vacío
   * @returns {boolean}
   */
  estaVacio() {
    return this.items.length === 0;
  }

  // ============================================
  // MÉTODOS DE UI
  // ============================================

  /**
   * Inicializa los elementos de UI y eventos
   */
  inicializarUI() {
    // Elementos del DOM
    this.elementos = {
      btnFlotante: document.getElementById('btnCarritoFlotante'),
      contador: document.getElementById('carritoContador'),
      modal: document.getElementById('modalCarrito'),
      lista: document.getElementById('listaCarrito'),
      vacio: document.getElementById('carritoVacio'),
      resumen: document.getElementById('carritoResumen'),
      subtotal: document.getElementById('carritoSubtotal'),
      iva: document.getElementById('carritoIVA'),
      total: document.getElementById('carritoTotal'),
      totalProductos: document.getElementById('carritoTotalProductos'),
      totalUnidades: document.getElementById('carritoTotalUnidades'),
      btnVaciar: document.getElementById('btnVaciarCarrito'),
      btnCotizar: document.getElementById('btnSolicitarCotizacion')
    };

    // Event listeners
    this.elementos.btnFlotante?.addEventListener('click', () => this.abrirModal());
    this.elementos.btnVaciar?.addEventListener('click', () => this.confirmarVaciar());
    this.elementos.btnCotizar?.addEventListener('click', () => this.solicitarCotizacion());

    // Cerrar modal
    document.querySelectorAll('[data-cerrar-modal="modalCarrito"]').forEach(btn => {
      btn.addEventListener('click', () => this.cerrarModal());
    });

    // Cerrar al hacer click en overlay
    this.elementos.modal?.querySelector('.modal__overlay')?.addEventListener('click', () => {
      this.cerrarModal();
    });

    // Escuchar actualizaciones del carrito desde otros componentes (ej: ENAR IA)
    window.addEventListener('carritoActualizado', (e) => {
      // Recargar items desde localStorage
      this.items = this.cargarDesdeStorage();
      this.actualizarUI();
      // Mostrar notificación si hay productos nuevos
      if (e.detail && e.detail.length > 0) {
        this.mostrarNotificacion('Productos agregados desde ENAR IA');
      }
    });

    // Actualizar UI inicial
    this.actualizarUI();
  }

  /**
   * Actualiza toda la UI del carrito
   */
  actualizarUI() {
    this.actualizarBadge();
    this.renderizarLista();
    this.actualizarTotales();
  }

  /**
   * Actualiza el badge del botón flotante
   */
  actualizarBadge() {
    const cantidad = this.obtenerCantidadTotal();
    if (this.elementos.contador) {
      this.elementos.contador.textContent = cantidad;
      this.elementos.contador.style.display = cantidad > 0 ? 'flex' : 'none';
    }
  }

  /**
   * Renderiza la lista de productos en el modal
   */
  renderizarLista() {
    if (!this.elementos.lista) return;

    if (this.estaVacio()) {
      this.elementos.lista.innerHTML = '';
      this.elementos.vacio.style.display = 'block';
      this.elementos.resumen.style.display = 'none';
      this.elementos.btnVaciar.disabled = true;
      this.elementos.btnCotizar.disabled = true;
      return;
    }

    this.elementos.vacio.style.display = 'none';
    this.elementos.resumen.style.display = 'block';
    this.elementos.btnVaciar.disabled = false;
    this.elementos.btnCotizar.disabled = false;

    this.elementos.lista.innerHTML = this.items.map(item => `
      <div class="carrito-item" data-codigo="${item.cod_interno}">
        <div class="carrito-item__imagen">
          ${item.imagen ?
            `<img src="${item.imagen}" alt="${item.titulo}" referrerpolicy="no-referrer" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23eee%22 width=%22100%22 height=%22100%22/><text x=%2250%22 y=%2255%22 text-anchor=%22middle%22 fill=%22%23999%22 font-size=%2212%22>Sin imagen</text></svg>'">` :
            '<div class="carrito-item__sin-imagen">Sin imagen</div>'
          }
        </div>
        <div class="carrito-item__info">
          <span class="carrito-item__marca">${item.marca || ''}</span>
          <h4 class="carrito-item__titulo">${item.titulo}</h4>
          <span class="carrito-item__codigo">${item.cod_interno} ${item.embalaje > 1 ? `· Embalaje: ${item.embalaje} u.` : ''}</span>
          <span class="carrito-item__precio">${formatearPrecio(item.precio_unitario)} c/u</span>
        </div>
        <div class="carrito-item__cantidad">
          <button class="btn-cantidad" data-accion="restar" data-codigo="${item.cod_interno}">-</button>
          <input type="number" class="input-cantidad" value="${item.cantidad}" min="1" data-codigo="${item.cod_interno}">
          <button class="btn-cantidad" data-accion="sumar" data-codigo="${item.cod_interno}">+</button>
        </div>
        <div class="carrito-item__subtotal">
          ${formatearPrecio(item.precio_unitario * item.cantidad)}
        </div>
        <button class="carrito-item__eliminar" data-codigo="${item.cod_interno}" title="Eliminar">
          &times;
        </button>
      </div>
    `).join('');

    // Event listeners para controles de cantidad
    this.elementos.lista.querySelectorAll('.btn-cantidad').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const codigo = e.target.dataset.codigo;
        const accion = e.target.dataset.accion;
        const item = this.items.find(i => i.cod_interno === codigo);
        if (item) {
          const nuevaCantidad = accion === 'sumar' ? item.cantidad + 1 : item.cantidad - 1;
          this.actualizarCantidad(codigo, nuevaCantidad);
        }
      });
    });

    // Event listeners para input de cantidad
    this.elementos.lista.querySelectorAll('.input-cantidad').forEach(input => {
      input.addEventListener('change', (e) => {
        const codigo = e.target.dataset.codigo;
        const nuevaCantidad = parseInt(e.target.value) || 1;
        this.actualizarCantidad(codigo, nuevaCantidad);
      });
    });

    // Event listeners para eliminar
    this.elementos.lista.querySelectorAll('.carrito-item__eliminar').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const codigo = e.target.dataset.codigo;
        this.quitar(codigo);
      });
    });
  }

  /**
   * Actualiza los totales en el modal
   */
  actualizarTotales() {
    // Conteo de productos y unidades
    if (this.elementos.totalProductos) {
      this.elementos.totalProductos.textContent = this.obtenerTotalProductos();
    }
    if (this.elementos.totalUnidades) {
      this.elementos.totalUnidades.textContent = this.obtenerCantidadTotal();
    }

    // Valores monetarios
    if (this.elementos.subtotal) {
      this.elementos.subtotal.textContent = formatearPrecio(this.obtenerSubtotal());
    }
    if (this.elementos.iva) {
      this.elementos.iva.textContent = formatearPrecio(this.obtenerIVA());
    }
    if (this.elementos.total) {
      this.elementos.total.textContent = formatearPrecio(this.obtenerTotal());
    }
  }

  /**
   * Abre el modal del carrito
   */
  abrirModal() {
    if (this.elementos.modal) {
      this.elementos.modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    }
  }

  /**
   * Cierra el modal del carrito
   */
  cerrarModal() {
    if (this.elementos.modal) {
      this.elementos.modal.style.display = 'none';
      document.body.style.overflow = '';
    }
  }

  /**
   * Confirma antes de vaciar el carrito
   */
  confirmarVaciar() {
    if (confirm('¿Estás seguro de que deseas vaciar el carrito?')) {
      this.vaciar();
    }
  }

  /**
   * Inicia el proceso de cotización
   */
  solicitarCotizacion() {
    if (this.estaVacio()) {
      alert('El carrito está vacío');
      return;
    }

    // Cerrar modal de carrito y abrir modal de cotización
    this.cerrarModal();

    // Disparar evento personalizado para que cotizacion.js lo maneje
    window.dispatchEvent(new CustomEvent('abrirCotizacion'));
  }

  /**
   * Muestra una notificación temporal
   * @param {string} mensaje - Mensaje a mostrar
   */
  mostrarNotificacion(mensaje) {
    // Crear elemento de notificación
    const notificacion = document.createElement('div');
    notificacion.className = 'notificacion';
    notificacion.textContent = mensaje;
    document.body.appendChild(notificacion);

    // Mostrar
    setTimeout(() => notificacion.classList.add('notificacion--visible'), 10);

    // Ocultar y remover
    setTimeout(() => {
      notificacion.classList.remove('notificacion--visible');
      setTimeout(() => notificacion.remove(), 300);
    }, 2500);
  }
}

// ============================================
// INSTANCIA GLOBAL
// ============================================

// Crear instancia global del carrito
const carrito = new Carrito();

// Exportar para uso en otros módulos
export { carrito };
export default carrito;
