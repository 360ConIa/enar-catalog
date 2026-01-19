/**
 * ============================================
 * MÓDULO DE AUTENTICACIÓN - ENAR B2B
 * ============================================
 * Archivo: auth.js
 * Descripción: Manejo de autenticación de usuarios
 * ============================================
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

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
const auth = getAuth(app);
const db = getFirestore(app);

// Estados de usuario
const ESTADOS_USUARIO = {
  PENDIENTE: 'pendiente',
  APROBADO: 'aprobado',
  RECHAZADO: 'rechazado',
  SUSPENDIDO: 'suspendido'
};

// Tipos de cliente
const TIPOS_CLIENTE = {
  MAYORISTA: 'mayorista',
  NEGOCIO: 'negocio',
  PERSONA_NATURAL: 'persona_natural'
};

/**
 * Inicia sesión con email y contraseña
 */
async function iniciarSesion(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Verificar estado del usuario en Firestore
    const userDoc = await getDoc(doc(db, 'usuarios', user.uid));

    if (userDoc.exists()) {
      const userData = userDoc.data();

      // Verificar si el usuario está aprobado
      if (userData.estado === ESTADOS_USUARIO.PENDIENTE) {
        await signOut(auth);
        return {
          success: false,
          error: 'Tu cuenta está pendiente de aprobación. Te notificaremos por email cuando sea aprobada.',
          code: 'pending-approval'
        };
      }

      if (userData.estado === ESTADOS_USUARIO.RECHAZADO) {
        await signOut(auth);
        return {
          success: false,
          error: 'Tu solicitud de cuenta ha sido rechazada. Contacta al administrador para más información.',
          code: 'rejected'
        };
      }

      if (userData.estado === ESTADOS_USUARIO.SUSPENDIDO) {
        await signOut(auth);
        return {
          success: false,
          error: 'Tu cuenta ha sido suspendida. Contacta al administrador.',
          code: 'suspended'
        };
      }
    }

    return {
      success: true,
      user: user,
      mensaje: 'Inicio de sesión exitoso'
    };

  } catch (error) {
    console.error('Error en login:', error);

    let mensaje = 'Error al iniciar sesión';

    switch (error.code) {
      case 'auth/user-not-found':
        mensaje = 'No existe una cuenta con este email';
        break;
      case 'auth/wrong-password':
        mensaje = 'Contraseña incorrecta';
        break;
      case 'auth/invalid-email':
        mensaje = 'Email inválido';
        break;
      case 'auth/too-many-requests':
        mensaje = 'Demasiados intentos fallidos. Intenta más tarde';
        break;
      case 'auth/invalid-credential':
        mensaje = 'Credenciales inválidas. Verifica tu email y contraseña';
        break;
    }

    return {
      success: false,
      error: mensaje,
      code: error.code
    };
  }
}

/**
 * Registra un nuevo usuario
 */
async function registrarUsuario(datosUsuario) {
  const {
    email,
    password,
    nombre,
    telefono,
    tipoCliente,
    razonSocial,
    nit,
    direccion,
    ciudad,
    departamento
  } = datosUsuario;

  try {
    // Crear usuario en Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Actualizar perfil con nombre
    await updateProfile(user, {
      displayName: nombre
    });

    // Crear documento de usuario en Firestore
    const userDocData = {
      uid: user.uid,
      email: email,
      nombre: nombre,
      telefono: telefono || '',
      tipo_cliente: tipoCliente || TIPOS_CLIENTE.PERSONA_NATURAL,
      estado: ESTADOS_USUARIO.PENDIENTE, // Siempre inicia pendiente

      // Datos de empresa (si aplica)
      razon_social: razonSocial || '',
      nit: nit || '',

      // Dirección
      direccion: direccion || '',
      ciudad: ciudad || '',
      departamento: departamento || '',

      // Metadatos
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),

      // Configuración por defecto
      limite_credito: 0,
      plazo_pago: 0,
      descuento_adicional: 0
    };

    await setDoc(doc(db, 'usuarios', user.uid), userDocData);

    // Cerrar sesión inmediatamente (usuario debe esperar aprobación)
    await signOut(auth);

    return {
      success: true,
      mensaje: 'Registro exitoso. Tu cuenta está pendiente de aprobación. Te notificaremos por email cuando sea aprobada.',
      userId: user.uid
    };

  } catch (error) {
    console.error('Error en registro:', error);

    let mensaje = 'Error al registrar usuario';

    switch (error.code) {
      case 'auth/email-already-in-use':
        mensaje = 'Ya existe una cuenta con este email';
        break;
      case 'auth/invalid-email':
        mensaje = 'Email inválido';
        break;
      case 'auth/weak-password':
        mensaje = 'La contraseña debe tener al menos 6 caracteres';
        break;
    }

    return {
      success: false,
      error: mensaje,
      code: error.code
    };
  }
}

/**
 * Cierra sesión del usuario actual
 */
async function cerrarSesion() {
  try {
    await signOut(auth);
    return { success: true };
  } catch (error) {
    console.error('Error al cerrar sesión:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Envía email de recuperación de contraseña
 */
async function recuperarPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email);
    return {
      success: true,
      mensaje: 'Se ha enviado un email con instrucciones para restablecer tu contraseña'
    };
  } catch (error) {
    console.error('Error en recuperación:', error);

    let mensaje = 'Error al enviar email de recuperación';

    switch (error.code) {
      case 'auth/user-not-found':
        mensaje = 'No existe una cuenta con este email';
        break;
      case 'auth/invalid-email':
        mensaje = 'Email inválido';
        break;
    }

    return {
      success: false,
      error: mensaje,
      code: error.code
    };
  }
}

/**
 * Obtiene el usuario actual
 */
function obtenerUsuarioActual() {
  return auth.currentUser;
}

/**
 * Escucha cambios en el estado de autenticación
 */
function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Obtiene los datos del usuario desde Firestore
 */
async function obtenerDatosUsuario(uid) {
  try {
    const userDoc = await getDoc(doc(db, 'usuarios', uid));
    if (userDoc.exists()) {
      return { success: true, data: userDoc.data() };
    }
    return { success: false, error: 'Usuario no encontrado' };
  } catch (error) {
    console.error('Error obteniendo datos de usuario:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Verifica si el usuario está autenticado y aprobado
 */
async function verificarAcceso() {
  const user = auth.currentUser;

  if (!user) {
    return {
      autenticado: false,
      aprobado: false,
      mensaje: 'No autenticado'
    };
  }

  const resultado = await obtenerDatosUsuario(user.uid);

  if (!resultado.success) {
    return {
      autenticado: true,
      aprobado: false,
      mensaje: 'Perfil incompleto'
    };
  }

  const userData = resultado.data;

  return {
    autenticado: true,
    aprobado: userData.estado === ESTADOS_USUARIO.APROBADO,
    estado: userData.estado,
    tipoCliente: userData.tipo_cliente,
    datos: userData,
    mensaje: userData.estado === ESTADOS_USUARIO.APROBADO
      ? 'Usuario aprobado'
      : 'Usuario pendiente de aprobación'
  };
}

// Exportaciones
export {
  auth,
  db,
  iniciarSesion,
  registrarUsuario,
  cerrarSesion,
  recuperarPassword,
  obtenerUsuarioActual,
  onAuthChange,
  obtenerDatosUsuario,
  verificarAcceso,
  ESTADOS_USUARIO,
  TIPOS_CLIENTE
};
