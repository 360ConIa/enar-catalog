/**
 * ============================================
 * SISTEMA DE ÓRDENES DE COMPRA - ENAR B2B
 * ============================================
 * Archivo: ordenes.js
 * Descripción: Gestión completa de órdenes de compra
 * ============================================
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
  getAuth
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// Configuración Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCMPflYHuPnAWaUhv90wi3uBOhP9AoA8e0",
  authDomain: "enar-b2b.firebaseapp.com",
  projectId: "enar-b2b",
  storageBucket: "enar-b2b.firebasestorage.app",
  messagingSenderId: "903832444518",
  appId: "1:903832444518:web:f76cb209febc9281a497a7"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Estados de orden
const ESTADOS_ORDEN = {
  BORRADOR: 'borrador',
  PENDIENTE: 'pendiente',
  CONFIRMADA: 'confirmada',
  EN_PROCESO: 'en_proceso',
  ENVIADA: 'enviada',
  ENTREGADA: 'entregada',
  CANCELADA: 'cancelada'
};

// Colecciones
const COLECCION_ORDENES = 'ordenes';
const COLECCION_CARRITO = 'carrito';

/**
 * Genera un número de orden único
 */
function generarNumeroOrden() {
  const fecha = new Date();
  const year = fecha.getFullYear().toString().slice(-2);
  const month = String(fecha.getMonth() + 1).padStart(2, '0');
  const day = String(fecha.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');

  return `OC-${year}${month}${day}-${random}`;
}

// =====================
// CARRITO
// =====================

/**
 * Obtiene el carrito del usuario
 */
async function obtenerCarrito(userId) {
  try {
    const carritoDoc = await getDoc(doc(db, COLECCION_CARRITO, userId));

    if (carritoDoc.exists()) {
      return {
        success: true,
        carrito: carritoDoc.data()
      };
    }

    // Retornar carrito vacío si no existe
    return {
      success: true,
      carrito: {
        items: [],
        total: 0,
        cantidad_items: 0
      }
    };
  } catch (error) {
    console.error('Error obteniendo carrito:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Agrega un producto al carrito
 */
async function agregarAlCarrito(userId, producto, cantidad = 1) {
  try {
    const carritoRef = doc(db, COLECCION_CARRITO, userId);
    const carritoDoc = await getDoc(carritoRef);

    let carrito = {
      items: [],
      total: 0,
      cantidad_items: 0,
      updated_at: new Date().toISOString()
    };

    if (carritoDoc.exists()) {
      carrito = carritoDoc.data();
    }

    // Buscar si el producto ya está en el carrito
    const itemIndex = carrito.items.findIndex(item => item.cod_interno === producto.cod_interno);

    if (itemIndex > -1) {
      // Actualizar cantidad si ya existe
      carrito.items[itemIndex].cantidad += cantidad;
      carrito.items[itemIndex].subtotal = carrito.items[itemIndex].cantidad * carrito.items[itemIndex].precio_unitario;
    } else {
      // Agregar nuevo item
      carrito.items.push({
        cod_interno: producto.cod_interno,
        titulo: producto.titulo,
        marca: producto.marca || '',
        imagen: producto.imagen_principal || '',
        precio_unitario: producto.precio_cliente,
        precio_lista: producto.precio_lista,
        cantidad: cantidad,
        subtotal: producto.precio_cliente * cantidad
      });
    }

    // Recalcular totales
    carrito.total = carrito.items.reduce((sum, item) => sum + item.subtotal, 0);
    carrito.cantidad_items = carrito.items.reduce((sum, item) => sum + item.cantidad, 0);
    carrito.updated_at = new Date().toISOString();

    await setDoc(carritoRef, carrito);

    return {
      success: true,
      carrito,
      mensaje: 'Producto agregado al carrito'
    };
  } catch (error) {
    console.error('Error agregando al carrito:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Actualiza la cantidad de un producto en el carrito
 */
async function actualizarCantidadCarrito(userId, codInterno, nuevaCantidad) {
  try {
    const carritoRef = doc(db, COLECCION_CARRITO, userId);
    const carritoDoc = await getDoc(carritoRef);

    if (!carritoDoc.exists()) {
      return { success: false, error: 'Carrito no encontrado' };
    }

    let carrito = carritoDoc.data();

    const itemIndex = carrito.items.findIndex(item => item.cod_interno === codInterno);

    if (itemIndex === -1) {
      return { success: false, error: 'Producto no encontrado en el carrito' };
    }

    if (nuevaCantidad <= 0) {
      // Eliminar producto si cantidad es 0 o menor
      carrito.items.splice(itemIndex, 1);
    } else {
      // Actualizar cantidad
      carrito.items[itemIndex].cantidad = nuevaCantidad;
      carrito.items[itemIndex].subtotal = nuevaCantidad * carrito.items[itemIndex].precio_unitario;
    }

    // Recalcular totales
    carrito.total = carrito.items.reduce((sum, item) => sum + item.subtotal, 0);
    carrito.cantidad_items = carrito.items.reduce((sum, item) => sum + item.cantidad, 0);
    carrito.updated_at = new Date().toISOString();

    await setDoc(carritoRef, carrito);

    return {
      success: true,
      carrito,
      mensaje: 'Carrito actualizado'
    };
  } catch (error) {
    console.error('Error actualizando carrito:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Elimina un producto del carrito
 */
async function eliminarDelCarrito(userId, codInterno) {
  return actualizarCantidadCarrito(userId, codInterno, 0);
}

/**
 * Vacía el carrito
 */
async function vaciarCarrito(userId) {
  try {
    const carritoRef = doc(db, COLECCION_CARRITO, userId);

    await setDoc(carritoRef, {
      items: [],
      total: 0,
      cantidad_items: 0,
      updated_at: new Date().toISOString()
    });

    return {
      success: true,
      mensaje: 'Carrito vaciado'
    };
  } catch (error) {
    console.error('Error vaciando carrito:', error);
    return { success: false, error: error.message };
  }
}

// =====================
// ÓRDENES DE COMPRA
// =====================

/**
 * Crea una nueva orden de compra a partir del carrito
 */
async function crearOrden(userId, datosEntrega, observaciones = '') {
  try {
    // Obtener carrito
    const resultadoCarrito = await obtenerCarrito(userId);

    if (!resultadoCarrito.success) {
      return resultadoCarrito;
    }

    const carrito = resultadoCarrito.carrito;

    if (carrito.items.length === 0) {
      return { success: false, error: 'El carrito está vacío' };
    }

    // Obtener datos del usuario
    const userDoc = await getDoc(doc(db, 'usuarios', userId));

    if (!userDoc.exists()) {
      return { success: false, error: 'Usuario no encontrado' };
    }

    const usuario = userDoc.data();

    // Crear orden
    const numeroOrden = generarNumeroOrden();
    const orden = {
      numero_orden: numeroOrden,
      user_id: userId,

      // Datos del cliente
      cliente: {
        email: usuario.email,
        nombre: usuario.nombre,
        telefono: usuario.telefono,
        tipo_cliente: usuario.tipo_cliente,
        razon_social: usuario.razon_social || '',
        nit: usuario.nit || ''
      },

      // Dirección de entrega
      direccion_entrega: {
        direccion: datosEntrega.direccion || usuario.direccion,
        ciudad: datosEntrega.ciudad || usuario.ciudad,
        departamento: datosEntrega.departamento || usuario.departamento,
        contacto: datosEntrega.contacto || usuario.nombre,
        telefono_contacto: datosEntrega.telefonoContacto || usuario.telefono
      },

      // Items de la orden
      items: carrito.items.map(item => ({
        cod_interno: item.cod_interno,
        titulo: item.titulo,
        marca: item.marca,
        imagen: item.imagen,
        precio_unitario: item.precio_unitario,
        precio_lista: item.precio_lista,
        cantidad: item.cantidad,
        subtotal: item.subtotal
      })),

      // Totales
      subtotal: carrito.total,
      descuento: 0,
      impuestos: 0,
      total: carrito.total,
      cantidad_items: carrito.cantidad_items,

      // Estado y fechas
      estado: ESTADOS_ORDEN.PENDIENTE,
      observaciones: observaciones,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),

      // Historial de estados
      historial: [
        {
          estado: ESTADOS_ORDEN.PENDIENTE,
          fecha: new Date().toISOString(),
          nota: 'Orden creada'
        }
      ]
    };

    // Guardar orden
    const ordenRef = await addDoc(collection(db, COLECCION_ORDENES), orden);

    // Vaciar carrito
    await vaciarCarrito(userId);

    return {
      success: true,
      orden: { id: ordenRef.id, ...orden },
      mensaje: `Orden ${numeroOrden} creada exitosamente`
    };
  } catch (error) {
    console.error('Error creando orden:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Obtiene una orden por ID
 */
async function obtenerOrden(ordenId) {
  try {
    const ordenDoc = await getDoc(doc(db, COLECCION_ORDENES, ordenId));

    if (ordenDoc.exists()) {
      return {
        success: true,
        orden: { id: ordenDoc.id, ...ordenDoc.data() }
      };
    }

    return { success: false, error: 'Orden no encontrada' };
  } catch (error) {
    console.error('Error obteniendo orden:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Obtiene las órdenes de un usuario
 */
async function obtenerOrdenesUsuario(userId, limitCount = 50) {
  try {
    const ordenesRef = collection(db, COLECCION_ORDENES);
    const q = query(
      ordenesRef,
      where('user_id', '==', userId),
      orderBy('created_at', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(q);
    const ordenes = [];

    snapshot.forEach(doc => {
      ordenes.push({ id: doc.id, ...doc.data() });
    });

    return { success: true, ordenes };
  } catch (error) {
    console.error('Error obteniendo órdenes:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Obtiene todas las órdenes (solo admin)
 */
async function obtenerTodasLasOrdenes(filtros = {}) {
  try {
    const ordenesRef = collection(db, COLECCION_ORDENES);
    let q = query(ordenesRef, orderBy('created_at', 'desc'));

    if (filtros.estado) {
      q = query(
        ordenesRef,
        where('estado', '==', filtros.estado),
        orderBy('created_at', 'desc')
      );
    }

    if (filtros.limit) {
      q = query(q, limit(filtros.limit));
    }

    const snapshot = await getDocs(q);
    const ordenes = [];

    snapshot.forEach(doc => {
      ordenes.push({ id: doc.id, ...doc.data() });
    });

    return { success: true, ordenes };
  } catch (error) {
    console.error('Error obteniendo órdenes:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Actualiza el estado de una orden
 */
async function actualizarEstadoOrden(ordenId, nuevoEstado, nota = '') {
  try {
    const ordenRef = doc(db, COLECCION_ORDENES, ordenId);
    const ordenDoc = await getDoc(ordenRef);

    if (!ordenDoc.exists()) {
      return { success: false, error: 'Orden no encontrada' };
    }

    const orden = ordenDoc.data();
    const historial = orden.historial || [];

    historial.push({
      estado: nuevoEstado,
      fecha: new Date().toISOString(),
      nota: nota
    });

    await updateDoc(ordenRef, {
      estado: nuevoEstado,
      historial: historial,
      updated_at: new Date().toISOString()
    });

    return {
      success: true,
      mensaje: `Estado actualizado a ${nuevoEstado}`
    };
  } catch (error) {
    console.error('Error actualizando estado:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Cancela una orden
 */
async function cancelarOrden(ordenId, motivo = '') {
  return actualizarEstadoOrden(ordenId, ESTADOS_ORDEN.CANCELADA, `Cancelada: ${motivo}`);
}

/**
 * Confirma una orden (admin)
 */
async function confirmarOrden(ordenId, nota = '') {
  return actualizarEstadoOrden(ordenId, ESTADOS_ORDEN.CONFIRMADA, nota || 'Orden confirmada');
}

/**
 * Marca orden como en proceso
 */
async function marcarEnProceso(ordenId, nota = '') {
  return actualizarEstadoOrden(ordenId, ESTADOS_ORDEN.EN_PROCESO, nota || 'En preparación');
}

/**
 * Marca orden como enviada
 */
async function marcarEnviada(ordenId, datosEnvio = {}) {
  try {
    const ordenRef = doc(db, COLECCION_ORDENES, ordenId);
    const ordenDoc = await getDoc(ordenRef);

    if (!ordenDoc.exists()) {
      return { success: false, error: 'Orden no encontrada' };
    }

    const orden = ordenDoc.data();
    const historial = orden.historial || [];

    historial.push({
      estado: ESTADOS_ORDEN.ENVIADA,
      fecha: new Date().toISOString(),
      nota: datosEnvio.nota || 'Orden enviada'
    });

    await updateDoc(ordenRef, {
      estado: ESTADOS_ORDEN.ENVIADA,
      historial: historial,
      datos_envio: {
        transportadora: datosEnvio.transportadora || '',
        numero_guia: datosEnvio.numeroGuia || '',
        fecha_envio: new Date().toISOString()
      },
      updated_at: new Date().toISOString()
    });

    return {
      success: true,
      mensaje: 'Orden marcada como enviada'
    };
  } catch (error) {
    console.error('Error marcando como enviada:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Marca orden como entregada
 */
async function marcarEntregada(ordenId, nota = '') {
  return actualizarEstadoOrden(ordenId, ESTADOS_ORDEN.ENTREGADA, nota || 'Entregada');
}

/**
 * Obtiene estadísticas de órdenes
 */
async function obtenerEstadisticasOrdenes() {
  try {
    const resultado = await obtenerTodasLasOrdenes();

    if (!resultado.success) {
      return resultado;
    }

    const ordenes = resultado.ordenes;

    const stats = {
      total: ordenes.length,
      pendientes: ordenes.filter(o => o.estado === ESTADOS_ORDEN.PENDIENTE).length,
      confirmadas: ordenes.filter(o => o.estado === ESTADOS_ORDEN.CONFIRMADA).length,
      enProceso: ordenes.filter(o => o.estado === ESTADOS_ORDEN.EN_PROCESO).length,
      enviadas: ordenes.filter(o => o.estado === ESTADOS_ORDEN.ENVIADA).length,
      entregadas: ordenes.filter(o => o.estado === ESTADOS_ORDEN.ENTREGADA).length,
      canceladas: ordenes.filter(o => o.estado === ESTADOS_ORDEN.CANCELADA).length,
      montoTotal: ordenes.reduce((sum, o) => sum + (o.total || 0), 0),
      montoEntregado: ordenes
        .filter(o => o.estado === ESTADOS_ORDEN.ENTREGADA)
        .reduce((sum, o) => sum + (o.total || 0), 0)
    };

    return { success: true, stats };
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Formatea precio a moneda colombiana
 */
function formatearPrecio(precio) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(precio);
}

/**
 * Obtiene el texto del estado
 */
function textoEstado(estado) {
  const textos = {
    [ESTADOS_ORDEN.BORRADOR]: 'Borrador',
    [ESTADOS_ORDEN.PENDIENTE]: 'Pendiente',
    [ESTADOS_ORDEN.CONFIRMADA]: 'Confirmada',
    [ESTADOS_ORDEN.EN_PROCESO]: 'En Proceso',
    [ESTADOS_ORDEN.ENVIADA]: 'Enviada',
    [ESTADOS_ORDEN.ENTREGADA]: 'Entregada',
    [ESTADOS_ORDEN.CANCELADA]: 'Cancelada'
  };

  return textos[estado] || estado;
}

/**
 * Obtiene la clase CSS del estado
 */
function claseEstado(estado) {
  const clases = {
    [ESTADOS_ORDEN.BORRADOR]: 'estado-borrador',
    [ESTADOS_ORDEN.PENDIENTE]: 'estado-pendiente',
    [ESTADOS_ORDEN.CONFIRMADA]: 'estado-confirmada',
    [ESTADOS_ORDEN.EN_PROCESO]: 'estado-proceso',
    [ESTADOS_ORDEN.ENVIADA]: 'estado-enviada',
    [ESTADOS_ORDEN.ENTREGADA]: 'estado-entregada',
    [ESTADOS_ORDEN.CANCELADA]: 'estado-cancelada'
  };

  return clases[estado] || '';
}

// Exportaciones
export {
  db,
  auth,
  ESTADOS_ORDEN,
  generarNumeroOrden,
  obtenerCarrito,
  agregarAlCarrito,
  actualizarCantidadCarrito,
  eliminarDelCarrito,
  vaciarCarrito,
  crearOrden,
  obtenerOrden,
  obtenerOrdenesUsuario,
  obtenerTodasLasOrdenes,
  actualizarEstadoOrden,
  cancelarOrden,
  confirmarOrden,
  marcarEnProceso,
  marcarEnviada,
  marcarEntregada,
  obtenerEstadisticasOrdenes,
  formatearPrecio,
  textoEstado,
  claseEstado
};
