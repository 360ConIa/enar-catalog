/**
 * ============================================
 * CONFIGURACIÓN DE FIREBASE
 * ============================================
 * Archivo: firebase-config.js
 * Descripción: Inicialización de Firebase y Firestore
 *              usando SDK v9 modular (CDN)
 * ============================================
 */

// Importar módulos de Firebase desde CDN
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

/**
 * Configuración de Firebase
 * Estos valores se obtienen de Firebase Console > Configuración del proyecto
 */
const firebaseConfig = {
  apiKey: "AIzaSyCKZdRRrG_p71bb0fzLQRPluF-jgbkeOtA",
  authDomain: "farmaweb-b2b.firebaseapp.com",
  projectId: "farmaweb-b2b",
  storageBucket: "farmaweb-b2b.appspot.com",
  messagingSenderId: "",
  appId: ""
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Inicializar Firestore
const db = getFirestore(app);

// Nombre de la colección de productos
const COLECCION_PRODUCTOS = 'productos';

// Exportar para usar en otros módulos
export {
  app,
  db,
  COLECCION_PRODUCTOS,
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs
};

console.log('Firebase inicializado correctamente');
