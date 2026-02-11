/**
 * ============================================
 * GESTOR DE USUARIOS - ENAR B2B
 * ============================================
 * Archivo: user-manager.js
 * Descripción: Operaciones avanzadas de gestión de usuarios
 * ============================================
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged
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

// Emails de administradores
const ADMIN_EMAILS = [
  'sebastianbumq@enarapp.com'
];

// Emails de gestores de usuarios (pueden gestionar usuarios pero no órdenes)
const USER_MANAGER_EMAILS = [
  'ventas@enar.com.co'
];

// Estados y tipos
const ESTADOS_USUARIO = {
  PENDIENTE: 'pendiente',
  APROBADO: 'aprobado',
  RECHAZADO: 'rechazado',
  SUSPENDIDO: 'suspendido'
};

const TIPOS_CLIENTE = {
  MAYORISTA: 'mayorista',
  NEGOCIO: 'negocio',
  PERSONA_NATURAL: 'persona_natural'
};

/**
 * Verifica si el usuario actual es administrador
 */
function esAdmin(user) {
  return user && ADMIN_EMAILS.includes(user.email);
}

/**
 * Verifica si el usuario es gestor de usuarios
 */
function esUserManager(user) {
  return user && USER_MANAGER_EMAILS.includes(user.email);
}

/**
 * Verifica si tiene acceso al panel admin (admin o gestor)
 */
function tieneAccesoAdmin(user) {
  return esAdmin(user) || esUserManager(user);
}

/**
 * Obtiene usuarios creados por un gestor específico
 */
async function obtenerUsuariosPorCreador(emailCreador) {
  try {
    const usuariosRef = collection(db, 'usuarios');
    const q = query(
      usuariosRef,
      where('creado_por', '==', emailCreador),
      orderBy('created_at', 'desc')
    );
    const snapshot = await getDocs(q);

    const usuarios = [];
    snapshot.forEach(doc => {
      usuarios.push({ uid: doc.id, ...doc.data() });
    });

    return { success: true, usuarios };
  } catch (error) {
    console.error('Error obteniendo usuarios por creador:', error);
    return { success: false, error: error.message, usuarios: [] };
  }
}

/**
 * Obtiene todos los usuarios (solo admin)
 */
async function obtenerTodosLosUsuarios() {
  try {
    const usuariosRef = collection(db, 'usuarios');

    // Intentar con orderBy, si falla, obtener sin ordenar
    let snapshot;
    try {
      const q = query(usuariosRef, orderBy('created_at', 'desc'));
      snapshot = await getDocs(q);
    } catch (orderError) {
      // Si falla el orderBy, obtener todos sin ordenar
      snapshot = await getDocs(usuariosRef);
    }

    const usuarios = [];
    snapshot.forEach(doc => {
      usuarios.push({ uid: doc.id, ...doc.data() });
    });

    // Ordenar manualmente por created_at si existe
    usuarios.sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
      const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
      return dateB - dateA;
    });

    return { success: true, usuarios };
  } catch (error) {
    console.error('Error obteniendo usuarios:', error);
    return { success: false, error: error.message, usuarios: [] };
  }
}

/**
 * Obtiene usuarios pendientes de aprobación
 */
async function obtenerUsuariosPendientes() {
  try {
    const usuariosRef = collection(db, 'usuarios');
    const q = query(
      usuariosRef,
      where('estado', '==', ESTADOS_USUARIO.PENDIENTE),
      orderBy('created_at', 'desc')
    );
    const snapshot = await getDocs(q);

    const usuarios = [];
    snapshot.forEach(doc => {
      usuarios.push({ uid: doc.id, ...doc.data() });
    });

    return { success: true, usuarios };
  } catch (error) {
    console.error('Error obteniendo usuarios pendientes:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Aprueba un usuario
 */
async function aprobarUsuario(uid, tipoCliente, configuracion = {}) {
  try {
    const userRef = doc(db, 'usuarios', uid);

    const updateData = {
      estado: ESTADOS_USUARIO.APROBADO,
      tipo_cliente: tipoCliente || TIPOS_CLIENTE.PERSONA_NATURAL,
      aprobado_en: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...configuracion
    };

    await updateDoc(userRef, updateData);

    return {
      success: true,
      mensaje: 'Usuario aprobado exitosamente'
    };
  } catch (error) {
    console.error('Error aprobando usuario:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Rechaza un usuario
 */
async function rechazarUsuario(uid, motivo = '') {
  try {
    const userRef = doc(db, 'usuarios', uid);

    await updateDoc(userRef, {
      estado: ESTADOS_USUARIO.RECHAZADO,
      motivo_rechazo: motivo,
      rechazado_en: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    return {
      success: true,
      mensaje: 'Usuario rechazado'
    };
  } catch (error) {
    console.error('Error rechazando usuario:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Suspende un usuario
 */
async function suspenderUsuario(uid, motivo = '') {
  try {
    const userRef = doc(db, 'usuarios', uid);

    await updateDoc(userRef, {
      estado: ESTADOS_USUARIO.SUSPENDIDO,
      motivo_suspension: motivo,
      suspendido_en: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    return {
      success: true,
      mensaje: 'Usuario suspendido'
    };
  } catch (error) {
    console.error('Error suspendiendo usuario:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Reactiva un usuario
 */
async function reactivarUsuario(uid) {
  try {
    const userRef = doc(db, 'usuarios', uid);

    await updateDoc(userRef, {
      estado: ESTADOS_USUARIO.APROBADO,
      reactivado_en: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    return {
      success: true,
      mensaje: 'Usuario reactivado'
    };
  } catch (error) {
    console.error('Error reactivando usuario:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Actualiza el tipo de cliente de un usuario
 */
async function actualizarTipoCliente(uid, nuevoTipo) {
  try {
    const userRef = doc(db, 'usuarios', uid);

    await updateDoc(userRef, {
      tipo_cliente: nuevoTipo,
      updated_at: new Date().toISOString()
    });

    return {
      success: true,
      mensaje: `Tipo de cliente actualizado a ${nuevoTipo}`
    };
  } catch (error) {
    console.error('Error actualizando tipo:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Actualiza la configuración comercial de un usuario
 */
async function actualizarConfiguracionComercial(uid, configuracion) {
  try {
    const userRef = doc(db, 'usuarios', uid);

    await updateDoc(userRef, {
      limite_credito: configuracion.limiteCredito || 0,
      plazo_pago: configuracion.plazoPago || 0,
      descuento_adicional: configuracion.descuentoAdicional || 0,
      updated_at: new Date().toISOString()
    });

    return {
      success: true,
      mensaje: 'Configuración comercial actualizada'
    };
  } catch (error) {
    console.error('Error actualizando configuración:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Actualiza el perfil del usuario actual
 */
async function actualizarPerfil(uid, datos) {
  try {
    const userRef = doc(db, 'usuarios', uid);

    const updateData = {
      nombre: datos.nombre,
      telefono: datos.telefono,
      direccion: datos.direccion,
      ciudad: datos.ciudad,
      departamento: datos.departamento,
      updated_at: new Date().toISOString()
    };

    // Solo actualizar datos de empresa si se proporcionan
    if (datos.razonSocial !== undefined) {
      updateData.razon_social = datos.razonSocial;
    }
    if (datos.nit !== undefined) {
      updateData.nit = datos.nit;
    }

    await updateDoc(userRef, updateData);

    return {
      success: true,
      mensaje: 'Perfil actualizado exitosamente'
    };
  } catch (error) {
    console.error('Error actualizando perfil:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Obtiene datos de un usuario específico
 */
async function obtenerUsuario(uid) {
  try {
    const userDoc = await getDoc(doc(db, 'usuarios', uid));

    if (userDoc.exists()) {
      return {
        success: true,
        usuario: { uid: userDoc.id, ...userDoc.data() }
      };
    }

    return { success: false, error: 'Usuario no encontrado' };
  } catch (error) {
    console.error('Error obteniendo usuario:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Obtiene estadísticas de usuarios
 */
async function obtenerEstadisticasUsuarios() {
  try {
    const resultado = await obtenerTodosLosUsuarios();

    if (!resultado.success) {
      return resultado;
    }

    const usuarios = resultado.usuarios;

    const stats = {
      total: usuarios.length,
      pendientes: usuarios.filter(u => u.estado === ESTADOS_USUARIO.PENDIENTE).length,
      aprobados: usuarios.filter(u => u.estado === ESTADOS_USUARIO.APROBADO).length,
      rechazados: usuarios.filter(u => u.estado === ESTADOS_USUARIO.RECHAZADO).length,
      suspendidos: usuarios.filter(u => u.estado === ESTADOS_USUARIO.SUSPENDIDO).length,
      porTipo: {
        mayoristas: usuarios.filter(u => u.tipo_cliente === TIPOS_CLIENTE.MAYORISTA && u.estado === ESTADOS_USUARIO.APROBADO).length,
        negocios: usuarios.filter(u => u.tipo_cliente === TIPOS_CLIENTE.NEGOCIO && u.estado === ESTADOS_USUARIO.APROBADO).length,
        personas_naturales: usuarios.filter(u => u.tipo_cliente === TIPOS_CLIENTE.PERSONA_NATURAL && u.estado === ESTADOS_USUARIO.APROBADO).length
      }
    };

    return { success: true, stats };
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Busca usuarios por email o nombre
 */
async function buscarUsuarios(termino) {
  try {
    const resultado = await obtenerTodosLosUsuarios();

    if (!resultado.success) {
      return resultado;
    }

    const terminoLower = termino.toLowerCase().trim();
    const usuariosFiltrados = resultado.usuarios.filter(u => {
      const email = (u.email || '').toLowerCase();
      const nombre = (u.nombre || '').toLowerCase();
      const razonSocial = (u.razon_social || '').toLowerCase();
      const nit = (u.nit || '').toLowerCase();

      return email.includes(terminoLower) ||
        nombre.includes(terminoLower) ||
        razonSocial.includes(terminoLower) ||
        nit.includes(terminoLower);
    });

    return { success: true, usuarios: usuariosFiltrados };
  } catch (error) {
    console.error('Error buscando usuarios:', error);
    return { success: false, error: error.message };
  }
}

// Exportaciones
export {
  db,
  auth,
  esAdmin,
  esUserManager,
  tieneAccesoAdmin,
  obtenerUsuariosPorCreador,
  obtenerTodosLosUsuarios,
  obtenerUsuariosPendientes,
  aprobarUsuario,
  rechazarUsuario,
  suspenderUsuario,
  reactivarUsuario,
  actualizarTipoCliente,
  actualizarConfiguracionComercial,
  actualizarPerfil,
  obtenerUsuario,
  obtenerEstadisticasUsuarios,
  buscarUsuarios,
  ESTADOS_USUARIO,
  TIPOS_CLIENTE,
  ADMIN_EMAILS,
  USER_MANAGER_EMAILS
};
