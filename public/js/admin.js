/**
 * ============================================
 * PANEL DE ADMINISTRACIÓN
 * ============================================
 * Archivo: admin.js
 * Descripción: Gestión de usuarios y tipos de cliente
 * ============================================
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  updateDoc
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

// Emails de administradores autorizados
const ADMIN_EMAILS = [
  'sebastianbumq@enarapp.com'
];

// Tipos de cliente
const TIPOS_CLIENTE = {
  mayorista: 'Mayorista',
  negocio: 'Negocio',
  persona_natural: 'Persona Natural'
};

// Estado
let usuarios = [];
let usuariosFiltrados = [];

// Elementos del DOM
const elementos = {
  loading: document.getElementById('loading'),
  noAccess: document.getElementById('noAccess'),
  adminPanel: document.getElementById('adminPanel'),
  usuariosBody: document.getElementById('usuariosBody'),
  buscarUsuario: document.getElementById('buscarUsuario'),
  mensajeExito: document.getElementById('mensajeExito'),
  totalUsuarios: document.getElementById('totalUsuarios'),
  totalMayoristas: document.getElementById('totalMayoristas'),
  totalNegocios: document.getElementById('totalNegocios'),
  totalNaturales: document.getElementById('totalNaturales')
};

/**
 * Verifica si el usuario actual es admin
 */
function esAdmin(user) {
  return user && ADMIN_EMAILS.includes(user.email);
}

/**
 * Carga todos los usuarios de Firestore
 */
async function cargarUsuarios() {
  try {
    const usuariosRef = collection(db, 'usuarios');
    const snapshot = await getDocs(usuariosRef);

    usuarios = [];
    snapshot.forEach(doc => {
      usuarios.push({ uid: doc.id, ...doc.data() });
    });

    // Ordenar por fecha de creación (más recientes primero)
    usuarios.sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
      const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
      return dateB - dateA;
    });

    usuariosFiltrados = [...usuarios];
    actualizarEstadisticas();
    renderizarUsuarios();

  } catch (error) {
    console.error('Error cargando usuarios:', error);
    elementos.usuariosBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: #dc3545;">
          Error al cargar usuarios. Verifica los permisos.
        </td>
      </tr>
    `;
  }
}

/**
 * Actualiza las estadísticas
 */
function actualizarEstadisticas() {
  const stats = {
    total: usuarios.length,
    mayoristas: usuarios.filter(u => u.tipo_cliente === 'mayorista').length,
    negocios: usuarios.filter(u => u.tipo_cliente === 'negocio').length,
    naturales: usuarios.filter(u => u.tipo_cliente === 'persona_natural').length
  };

  elementos.totalUsuarios.textContent = stats.total;
  elementos.totalMayoristas.textContent = stats.mayoristas;
  elementos.totalNegocios.textContent = stats.negocios;
  elementos.totalNaturales.textContent = stats.naturales;
}

/**
 * Renderiza la tabla de usuarios
 */
function renderizarUsuarios() {
  if (usuariosFiltrados.length === 0) {
    elementos.usuariosBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--color-texto-claro);">
          No se encontraron usuarios
        </td>
      </tr>
    `;
    return;
  }

  elementos.usuariosBody.innerHTML = usuariosFiltrados.map(usuario => {
    const tipoActual = usuario.tipo_cliente || 'persona_natural';
    const fechaRegistro = usuario.created_at
      ? new Date(usuario.created_at).toLocaleDateString('es-CO')
      : '-';

    return `
      <tr data-uid="${usuario.uid}">
        <td>${usuario.email || '-'}</td>
        <td>${usuario.nombre || '-'}</td>
        <td>
          <span class="tipo-badge tipo-${tipoActual}">
            ${TIPOS_CLIENTE[tipoActual] || tipoActual}
          </span>
        </td>
        <td>
          <select class="select-tipo" data-uid="${usuario.uid}" data-tipo-original="${tipoActual}">
            <option value="mayorista" ${tipoActual === 'mayorista' ? 'selected' : ''}>Mayorista</option>
            <option value="negocio" ${tipoActual === 'negocio' ? 'selected' : ''}>Negocio</option>
            <option value="persona_natural" ${tipoActual === 'persona_natural' ? 'selected' : ''}>Persona Natural</option>
          </select>
          <button class="btn-guardar" data-uid="${usuario.uid}" disabled>Guardar</button>
        </td>
        <td>${fechaRegistro}</td>
      </tr>
    `;
  }).join('');

  // Agregar event listeners
  agregarEventListeners();
}

/**
 * Agrega event listeners a los elementos de la tabla
 */
function agregarEventListeners() {
  // Selects de tipo
  document.querySelectorAll('.select-tipo').forEach(select => {
    select.addEventListener('change', (e) => {
      const uid = e.target.dataset.uid;
      const tipoOriginal = e.target.dataset.tipoOriginal;
      const nuevoTipo = e.target.value;
      const btnGuardar = document.querySelector(`.btn-guardar[data-uid="${uid}"]`);

      // Habilitar/deshabilitar botón según si cambió
      btnGuardar.disabled = (nuevoTipo === tipoOriginal);
    });
  });

  // Botones guardar
  document.querySelectorAll('.btn-guardar').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const uid = e.target.dataset.uid;
      const select = document.querySelector(`.select-tipo[data-uid="${uid}"]`);
      const nuevoTipo = select.value;

      await actualizarTipoCliente(uid, nuevoTipo);
    });
  });
}

/**
 * Actualiza el tipo de cliente de un usuario
 */
async function actualizarTipoCliente(uid, nuevoTipo) {
  const btn = document.querySelector(`.btn-guardar[data-uid="${uid}"]`);
  const select = document.querySelector(`.select-tipo[data-uid="${uid}"]`);

  btn.disabled = true;
  btn.textContent = 'Guardando...';

  try {
    const userDocRef = doc(db, 'usuarios', uid);
    await updateDoc(userDocRef, {
      tipo_cliente: nuevoTipo,
      updated_at: new Date().toISOString()
    });

    // Actualizar estado local
    const usuario = usuarios.find(u => u.uid === uid);
    if (usuario) {
      usuario.tipo_cliente = nuevoTipo;
    }

    // Actualizar UI
    select.dataset.tipoOriginal = nuevoTipo;
    btn.textContent = 'Guardar';

    // Mostrar mensaje de éxito
    mostrarMensajeExito(`Tipo de cliente actualizado a "${TIPOS_CLIENTE[nuevoTipo]}"`);

    // Re-renderizar para actualizar el badge
    actualizarEstadisticas();
    renderizarUsuarios();

  } catch (error) {
    console.error('Error actualizando tipo:', error);
    btn.textContent = 'Error';
    setTimeout(() => {
      btn.textContent = 'Guardar';
      btn.disabled = false;
    }, 2000);
  }
}

/**
 * Muestra mensaje de éxito
 */
function mostrarMensajeExito(mensaje) {
  elementos.mensajeExito.textContent = mensaje;
  elementos.mensajeExito.style.display = 'block';

  setTimeout(() => {
    elementos.mensajeExito.style.display = 'none';
  }, 3000);
}

/**
 * Filtra usuarios por búsqueda
 */
function filtrarUsuarios(texto) {
  const busqueda = texto.toLowerCase().trim();

  if (!busqueda) {
    usuariosFiltrados = [...usuarios];
  } else {
    usuariosFiltrados = usuarios.filter(u => {
      const email = (u.email || '').toLowerCase();
      const nombre = (u.nombre || '').toLowerCase();
      return email.includes(busqueda) || nombre.includes(busqueda);
    });
  }

  renderizarUsuarios();
}

// Event listener para búsqueda
elementos.buscarUsuario?.addEventListener('input', (e) => {
  filtrarUsuarios(e.target.value);
});

// Inicialización
onAuthStateChanged(auth, async (user) => {
  elementos.loading.style.display = 'none';

  if (!user) {
    // No autenticado - redirigir a login
    window.location.href = '/login.html';
    return;
  }

  if (!esAdmin(user)) {
    // No es admin - mostrar acceso denegado
    elementos.noAccess.style.display = 'block';
    return;
  }

  // Es admin - mostrar panel
  elementos.adminPanel.style.display = 'block';
  await cargarUsuarios();
});
