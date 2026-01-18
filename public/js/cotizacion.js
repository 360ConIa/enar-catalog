/**
 * ============================================
 * GESTIÓN DE COTIZACIONES
 * ============================================
 * Archivo: cotizacion.js
 * Descripción: Manejo del formulario de cotización,
 *              guardado en Firestore y confirmación
 * ============================================
 */

import {
  db,
  collection,
  getDocs,
  query,
  orderBy,
  limit
} from './firebase-config.js';

import { formatearPrecio } from './utils.js';
import { carrito } from './carrito.js';

// Importar funciones adicionales de Firestore
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ============================================
// CONSTANTES
// ============================================

const COLECCION_COTIZACIONES = 'cotizaciones';
const COLECCION_CONFIGURACION = 'configuracion';
const DOC_GENERAL = 'general';
const IVA_PORCENTAJE = 0.19;

// ============================================
// ELEMENTOS DEL DOM
// ============================================

const elementos = {
  modalCotizacion: document.getElementById('modalCotizacion'),
  modalConfirmacion: document.getElementById('modalConfirmacion'),
  formCotizacion: document.getElementById('formCotizacion'),
  btnEnviar: document.getElementById('btnEnviarCotizacion'),
  numeroCotizacion: document.getElementById('numeroCotizacion'),
  confirmacionProductos: document.getElementById('confirmacionProductos'),
  confirmacionTotal: document.getElementById('confirmacionTotal')
};

// ============================================
// FUNCIONES PRINCIPALES
// ============================================

/**
 * Abre el modal de cotización
 */
function abrirModalCotizacion() {
  if (elementos.modalCotizacion) {
    elementos.modalCotizacion.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
}

/**
 * Cierra el modal de cotización
 */
function cerrarModalCotizacion() {
  if (elementos.modalCotizacion) {
    elementos.modalCotizacion.style.display = 'none';
    document.body.style.overflow = '';
  }
}

/**
 * Abre el modal de confirmación
 */
function abrirModalConfirmacion() {
  if (elementos.modalConfirmacion) {
    elementos.modalConfirmacion.style.display = 'flex';
  }
}

/**
 * Cierra el modal de confirmación
 */
function cerrarModalConfirmacion() {
  if (elementos.modalConfirmacion) {
    elementos.modalConfirmacion.style.display = 'none';
    document.body.style.overflow = '';
  }
}

/**
 * Genera el número de cotización consecutivo
 * Formato: COT-YYYY-NNNN
 * @returns {Promise<string>} - Número de cotización
 */
async function generarNumeroCotizacion() {
  try {
    const configRef = doc(db, COLECCION_CONFIGURACION, DOC_GENERAL);
    const configDoc = await getDoc(configRef);

    let consecutivo = 1;

    if (configDoc.exists()) {
      const data = configDoc.data();
      consecutivo = (data.consecutivo_cotizacion || 0) + 1;

      // Actualizar consecutivo
      await updateDoc(configRef, {
        consecutivo_cotizacion: consecutivo
      });
    } else {
      // Crear documento de configuración si no existe
      await setDoc(configRef, {
        consecutivo_cotizacion: 1,
        nombre_empresa: 'Farmaweb'
      });
    }

    // Formatear número
    const anio = new Date().getFullYear();
    const numero = String(consecutivo).padStart(4, '0');

    return `COT-${anio}-${numero}`;
  } catch (error) {
    console.error('Error generando número de cotización:', error);
    // Generar número temporal si hay error
    const timestamp = Date.now().toString().slice(-6);
    return `COT-${new Date().getFullYear()}-${timestamp}`;
  }
}

/**
 * Obtiene los datos del formulario
 * @returns {Object} - Datos del cliente
 */
function obtenerDatosFormulario() {
  const form = elementos.formCotizacion;

  return {
    empresa: form.empresa.value.trim(),
    nit: form.nit.value.trim(),
    contacto: form.contacto.value.trim(),
    email: form.email.value.trim(),
    telefono: form.telefono.value.trim(),
    ciudad: form.ciudad.value.trim(),
    departamento: form.departamento?.value.trim() || '',
    direccion: form.direccion.value.trim(),
    notas: form.notas?.value.trim() || ''
  };
}

/**
 * Valida el formulario de cotización
 * @returns {boolean} - true si es válido
 */
function validarFormulario() {
  const datos = obtenerDatosFormulario();

  if (!datos.empresa) {
    alert('Por favor ingresa el nombre de la empresa');
    return false;
  }

  if (!datos.nit) {
    alert('Por favor ingresa el NIT');
    return false;
  }

  if (!datos.contacto) {
    alert('Por favor ingresa el nombre del contacto');
    return false;
  }

  if (!datos.email || !validarEmail(datos.email)) {
    alert('Por favor ingresa un email válido');
    return false;
  }

  if (!datos.telefono) {
    alert('Por favor ingresa el teléfono');
    return false;
  }

  if (!datos.ciudad) {
    alert('Por favor ingresa la ciudad');
    return false;
  }

  if (!datos.direccion) {
    alert('Por favor ingresa la dirección de entrega');
    return false;
  }

  return true;
}

/**
 * Valida formato de email
 * @param {string} email
 * @returns {boolean}
 */
function validarEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

/**
 * Prepara los items del carrito para la cotización
 * @returns {Array} - Items formateados
 */
function prepararItems() {
  return carrito.obtenerItems().map(item => ({
    cod_interno: item.cod_interno,
    titulo: item.titulo,
    cantidad: item.cantidad,
    precio_unitario: item.precio_unitario,
    subtotal: item.precio_unitario * item.cantidad
  }));
}

/**
 * Guarda la cotización en Firestore
 * @param {Object} datosCliente - Datos del formulario
 * @returns {Promise<Object>} - Cotización guardada
 */
async function guardarCotizacion(datosCliente) {
  // Generar número de cotización
  const numero = await generarNumeroCotizacion();

  // Preparar items
  const items = prepararItems();

  // Calcular totales
  const subtotal = carrito.obtenerSubtotal();
  const totalIva = carrito.obtenerIVA();
  const total = carrito.obtenerTotal();

  // Crear documento de cotización
  const cotizacion = {
    numero: numero,
    cliente: {
      empresa: datosCliente.empresa,
      nit: datosCliente.nit,
      contacto: datosCliente.contacto,
      email: datosCliente.email,
      telefono: datosCliente.telefono,
      ciudad: datosCliente.ciudad,
      departamento: datosCliente.departamento,
      direccion: datosCliente.direccion
    },
    notas: datosCliente.notas,
    items: items,
    cantidad_items: items.length,
    subtotal: subtotal,
    iva_porcentaje: IVA_PORCENTAJE,
    total_iva: totalIva,
    total: total,
    estado: 'pendiente',
    created_at: serverTimestamp()
  };

  // Guardar en Firestore usando el número como ID
  const cotizacionRef = doc(db, COLECCION_COTIZACIONES, numero);
  await setDoc(cotizacionRef, cotizacion);

  console.log('Cotización guardada:', numero);

  return {
    numero: numero,
    cantidadProductos: items.length,
    total: total
  };
}

/**
 * Procesa el envío del formulario de cotización
 * @param {Event} e - Evento submit
 */
async function procesarCotizacion(e) {
  e.preventDefault();

  // Validar formulario
  if (!validarFormulario()) {
    return;
  }

  // Validar que haya items en el carrito
  if (carrito.estaVacio()) {
    alert('El carrito está vacío');
    return;
  }

  // Deshabilitar botón mientras se procesa
  const btnOriginalText = elementos.btnEnviar.textContent;
  elementos.btnEnviar.textContent = 'Enviando...';
  elementos.btnEnviar.disabled = true;

  try {
    // Obtener datos del formulario
    const datosCliente = obtenerDatosFormulario();

    // Guardar cotización
    const resultado = await guardarCotizacion(datosCliente);

    // Actualizar modal de confirmación
    elementos.numeroCotizacion.textContent = resultado.numero;
    elementos.confirmacionProductos.textContent = resultado.cantidadProductos;
    elementos.confirmacionTotal.textContent = formatearPrecio(resultado.total);

    // Cerrar modal de cotización
    cerrarModalCotizacion();

    // Mostrar modal de confirmación
    abrirModalConfirmacion();

    // Vaciar carrito
    carrito.vaciar();

    // Limpiar formulario
    elementos.formCotizacion.reset();

  } catch (error) {
    console.error('Error procesando cotización:', error);
    alert('Error al enviar la cotización. Por favor intenta de nuevo.');
  } finally {
    // Restaurar botón
    elementos.btnEnviar.textContent = btnOriginalText;
    elementos.btnEnviar.disabled = false;
  }
}

// ============================================
// EVENT LISTENERS
// ============================================

// Escuchar evento de abrir cotización desde el carrito
window.addEventListener('abrirCotizacion', () => {
  abrirModalCotizacion();
});

// Cerrar modales con botones
document.querySelectorAll('[data-cerrar-modal="modalCotizacion"]').forEach(btn => {
  btn.addEventListener('click', cerrarModalCotizacion);
});

document.querySelectorAll('[data-cerrar-modal="modalConfirmacion"]').forEach(btn => {
  btn.addEventListener('click', cerrarModalConfirmacion);
});

// Cerrar al hacer click en overlay
elementos.modalCotizacion?.querySelector('.modal__overlay')?.addEventListener('click', cerrarModalCotizacion);
elementos.modalConfirmacion?.querySelector('.modal__overlay')?.addEventListener('click', cerrarModalConfirmacion);

// Submit del formulario
elementos.formCotizacion?.addEventListener('submit', procesarCotizacion);

// ============================================
// EXPORTAR
// ============================================

export {
  abrirModalCotizacion,
  cerrarModalCotizacion
};
