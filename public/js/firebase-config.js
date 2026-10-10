/**
 * ============================================
 * CONFIGURACIÓN DE FIREBASE
 * ============================================
 * Archivo: firebase-config.js
 * Descripción: Inicialización de Firebase, Firestore y Auth
 *              usando SDK v9 modular (CDN)
 * ============================================
 */

// Importar módulos de Firebase desde CDN
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

/**
 * Configuración de Firebase
 * Estos valores se obtienen de Firebase Console > Configuración del proyecto
 */
const firebaseConfig = {
  apiKey: "AIzaSyCMPflYHuPnAWaUhv90wi3uBOhP9AoA8e0",
  authDomain: "enar-b2b.firebaseapp.com",
  projectId: "enar-b2b",
  storageBucket: "enar-b2b.firebasestorage.app",
  messagingSenderId: "903832444518",
  appId: "1:903832444518:web:f76cb209febc9281a497a7"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Inicializar Firestore
const db = getFirestore(app);

// Inicializar Auth
const auth = getAuth(app);

// Nombre de las colecciones
const COLECCION_PRODUCTOS = 'productos';
const COLECCION_USUARIOS = 'usuarios';

const COLECCION_CONFIGURACION = 'configuracion';

// ═══════════ LISTAS DE PRECIOS ═══════════
// Única fuente de la lista de precios de un cliente: usuarios.tipo_cliente
// contra configuracion/listas_precios. El sistema legacy L1…L10 fue retirado.

// Listas del sistema. Solo se usan como respaldo si no se puede leer la
// configuración; la fuente real son las listas activas de Firestore.
const TIPOS_CLIENTE = {
  MAYORISTA: 'mayorista',
  NEGOCIO: 'negocio',
  PERSONA_NATURAL: 'persona_natural',
  NUEVOS: 'nuevos'
};

let _listasPrecios = null;

/**
 * Carga y cachea las listas de precios configuradas.
 * @param {boolean} forzar - relee Firestore ignorando la caché
 * @returns {Promise<Array>} listas tal como están en Firestore
 */
async function cargarListasPrecios(forzar = false) {
  if (_listasPrecios && !forzar) return _listasPrecios;
  try {
    const snap = await getDoc(doc(db, COLECCION_CONFIGURACION, 'listas_precios'));
    _listasPrecios = snap.exists() ? (snap.data().listas || []) : [];
  } catch (error) {
    console.error('Error cargando listas de precios:', error);
    _listasPrecios = [];
  }
  return _listasPrecios;
}

/**
 * Sustituye la caché con listas ya cargadas por el módulo llamante.
 * Lo usa admin.html, que mantiene su propio array editable, para que las
 * etiquetas de toda la página reflejen los cambios sin releer Firestore.
 */
function setListasPrecios(listas) {
  _listasPrecios = Array.isArray(listas) ? listas : [];
}

/**
 * Listas activas. Si no hay configuración legible, devuelve las del sistema.
 */
async function listasActivas() {
  const listas = (await cargarListasPrecios()).filter(l => l.activa);
  if (listas.length > 0) return listas;
  return Object.values(TIPOS_CLIENTE).map(id => ({ id, nombre: id, activa: true }));
}

/**
 * Valida un tipo_cliente contra las listas activas configuradas.
 */
async function esTipoClienteValido(tipoCliente) {
  if (!tipoCliente) return false;
  return (await listasActivas()).some(l => l.id === tipoCliente);
}

/**
 * Etiqueta legible de una lista: "2 – Mayorista" si tiene codigo_erp,
 * solo el nombre si no.
 */
function formatearNombreLista(lista) {
  return lista.codigo_erp != null && lista.codigo_erp !== ''
    ? `${lista.codigo_erp} – ${lista.nombre}`
    : lista.nombre;
}

/**
 * Etiqueta de la lista de un cliente según su tipo_cliente. Sincrónica: usa la
 * caché, así que requiere un cargarListasPrecios() previo. Si el valor no
 * corresponde a ninguna lista configurada se devuelve tal cual, para no
 * ocultar los datos heredados.
 */
function nombreLista(tipoCliente) {
  if (!tipoCliente) return '—';
  const lista = (_listasPrecios || []).find(l => l.id === tipoCliente);
  return lista ? formatearNombreLista(lista) : tipoCliente;
}

// Exportar para usar en otros módulos
export {
  app,
  db,
  auth,
  COLECCION_PRODUCTOS,
  COLECCION_USUARIOS,
  COLECCION_CONFIGURACION,
  TIPOS_CLIENTE,
  cargarListasPrecios,
  setListasPrecios,
  listasActivas,
  esTipoClienteValido,
  formatearNombreLista,
  nombreLista,
  collection,
  doc,
  getDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  onAuthStateChanged,
  signOut
};

console.log('Firebase inicializado correctamente');
