/**
 * ============================================
 * MÓDULO DE USUARIO
 * ============================================
 * Archivo: usuario.js
 * Descripción: Manejo de perfil de usuario y tipo de cliente
 * ============================================
 */

import {
  db,
  auth,
  COLECCION_USUARIOS,
  TIPOS_CLIENTE,
  doc,
  getDoc,
  setDoc,
  onAuthStateChanged
} from './firebase-config.js';

// Estado del usuario
const usuarioState = {
  user: null,
  perfil: null,
  tipoCliente: TIPOS_CLIENTE.PERSONA_NATURAL, // Default
  cargando: true,
  listeners: []
};

/**
 * Obtiene el precio correcto según el tipo de cliente
 * @param {Object} producto - Producto con los 3 precios
 * @returns {number} - Precio según tipo de cliente
 */
export function obtenerPrecioCliente(producto) {
  switch (usuarioState.tipoCliente) {
    case TIPOS_CLIENTE.MAYORISTA:
      return producto.precio_mayorista || 0;
    case TIPOS_CLIENTE.NEGOCIO:
      return producto.precio_negocio || 0;
    case TIPOS_CLIENTE.PERSONA_NATURAL:
    default:
      return producto.precio_persona_natural || 0;
  }
}

/**
 * Obtiene el tipo de cliente actual
 * @returns {string} - Tipo de cliente
 */
export function getTipoCliente() {
  return usuarioState.tipoCliente;
}

/**
 * Obtiene la etiqueta del tipo de cliente para mostrar
 * @returns {string} - Etiqueta legible
 */
export function getEtiquetaTipoCliente() {
  switch (usuarioState.tipoCliente) {
    case TIPOS_CLIENTE.MAYORISTA:
      return 'Mayorista';
    case TIPOS_CLIENTE.NEGOCIO:
      return 'Negocio';
    case TIPOS_CLIENTE.PERSONA_NATURAL:
    default:
      return 'Persona Natural';
  }
}

/**
 * Obtiene el usuario actual
 * @returns {Object|null} - Usuario de Firebase Auth
 */
export function getUsuario() {
  return usuarioState.user;
}

/**
 * Verifica si el usuario está autenticado
 * @returns {boolean}
 */
export function estaAutenticado() {
  return usuarioState.user !== null;
}

/**
 * Carga el perfil del usuario desde Firestore
 * @param {string} uid - UID del usuario
 */
async function cargarPerfilUsuario(uid) {
  try {
    const userDocRef = doc(db, COLECCION_USUARIOS, uid);
    const userDoc = await getDoc(userDocRef);

    if (userDoc.exists()) {
      usuarioState.perfil = userDoc.data();
      usuarioState.tipoCliente = usuarioState.perfil.tipo_cliente || TIPOS_CLIENTE.PERSONA_NATURAL;
      console.log('Perfil cargado:', usuarioState.perfil);
    } else {
      // Crear perfil por defecto para nuevo usuario
      await crearPerfilUsuario(uid);
    }
  } catch (error) {
    console.error('Error cargando perfil:', error);
    usuarioState.tipoCliente = TIPOS_CLIENTE.PERSONA_NATURAL;
  }
}

/**
 * Crea un perfil de usuario nuevo en Firestore
 * @param {string} uid - UID del usuario
 */
async function crearPerfilUsuario(uid) {
  const nuevoPerfl = {
    email: usuarioState.user?.email || '',
    nombre: usuarioState.user?.displayName || '',
    tipo_cliente: TIPOS_CLIENTE.PERSONA_NATURAL, // Default para nuevos usuarios
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    const userDocRef = doc(db, COLECCION_USUARIOS, uid);
    await setDoc(userDocRef, nuevoPerfl);
    usuarioState.perfil = nuevoPerfl;
    usuarioState.tipoCliente = nuevoPerfl.tipo_cliente;
    console.log('Perfil creado para nuevo usuario');
  } catch (error) {
    console.error('Error creando perfil:', error);
  }
}

/**
 * Actualiza el tipo de cliente del usuario
 * @param {string} nuevoTipo - Nuevo tipo de cliente
 */
export async function actualizarTipoCliente(nuevoTipo) {
  if (!usuarioState.user) return;

  if (!Object.values(TIPOS_CLIENTE).includes(nuevoTipo)) {
    console.error('Tipo de cliente inválido:', nuevoTipo);
    return;
  }

  try {
    const userDocRef = doc(db, COLECCION_USUARIOS, usuarioState.user.uid);
    await setDoc(userDocRef, {
      ...usuarioState.perfil,
      tipo_cliente: nuevoTipo,
      updated_at: new Date().toISOString()
    }, { merge: true });

    usuarioState.tipoCliente = nuevoTipo;
    usuarioState.perfil.tipo_cliente = nuevoTipo;

    // Notificar a los listeners
    notificarCambio();

    console.log('Tipo de cliente actualizado a:', nuevoTipo);
  } catch (error) {
    console.error('Error actualizando tipo de cliente:', error);
  }
}

/**
 * Registra un listener para cambios en el estado del usuario
 * @param {Function} callback - Función a llamar cuando cambie el estado
 * @returns {Function} - Función para cancelar la suscripción
 */
export function onUsuarioChange(callback) {
  usuarioState.listeners.push(callback);

  // Llamar inmediatamente con el estado actual si no está cargando
  if (!usuarioState.cargando) {
    callback({
      user: usuarioState.user,
      tipoCliente: usuarioState.tipoCliente,
      perfil: usuarioState.perfil
    });
  }

  // Retornar función para cancelar suscripción
  return () => {
    const index = usuarioState.listeners.indexOf(callback);
    if (index > -1) {
      usuarioState.listeners.splice(index, 1);
    }
  };
}

/**
 * Notifica a todos los listeners de un cambio
 */
function notificarCambio() {
  usuarioState.listeners.forEach(callback => {
    callback({
      user: usuarioState.user,
      tipoCliente: usuarioState.tipoCliente,
      perfil: usuarioState.perfil
    });
  });
}

/**
 * Inicializa el módulo de usuario
 * Escucha cambios en la autenticación
 */
export function inicializarUsuario() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      usuarioState.user = user;

      if (user) {
        console.log('Usuario autenticado:', user.email);
        await cargarPerfilUsuario(user.uid);
      } else {
        console.log('Usuario no autenticado');
        usuarioState.perfil = null;
        usuarioState.tipoCliente = TIPOS_CLIENTE.PERSONA_NATURAL;
      }

      usuarioState.cargando = false;
      notificarCambio();
      resolve(usuarioState);
    });
  });
}

// Exportar tipos de cliente para uso externo
export { TIPOS_CLIENTE };
