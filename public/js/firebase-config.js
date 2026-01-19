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
