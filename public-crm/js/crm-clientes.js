/**
 * ============================================
 * CRM CLIENTES - ENAR
 * ============================================
 * Grid de cards con indicadores de salud, ABC, riesgo.
 * CRUD clientes, filtros, paginación, detalle con métricas.
 * Roles: admin, vendedor
 * ============================================
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getFirestore, collection, doc, getDoc, setDoc, getDocs, updateDoc,
  query, where, orderBy
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
  getAuth, onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

import {
  $, ADMIN_EMAIL,
  formatearPrecio, formatearFecha, formatearNumero, tiempoRelativo,
  badgeSalud, badgeABC, badgeRiesgo, badgeTendencia,
  Paginador, buscarMultiCampo, showToast, debounce, mostrarLoader, mostrarVacio
} from './crm-utils.js';

// ═══════════ FIREBASE INIT ═══════════
const app = initializeApp({
  apiKey: "AIzaSyCMPflYHuPnAWaUhv90wi3uBOhP9AoA8e0",
  authDomain: "enar-b2b.firebaseapp.com",
  projectId: "enar-b2b",
  storageBucket: "enar-b2b.firebasestorage.app",
  messagingSenderId: "903832444518",
  appId: "1:903832444518:web:f76cb209febc9281a497a7"
});

const db = getFirestore(app);
const auth = getAuth(app);

// ═══════════ STATE ═══════════
let currentUser = null;
let userPerfil = null;
let todosLosClientes = [];
let clientesFiltrados = [];
let metricasMap = {};
let editandoClienteId = null;
const paginador = new Paginador(50);
const ROLES_EXCLUIDOS = ['vendedor', 'despachos', 'admin', 'gestor', 'administrador'];

// ═══════════ AUTH ═══════════
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = '/login.html';
    return;
  }

  const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
  if (!userDoc.exists()) {
    $('loadingScreen').style.display = 'none';
    $('noAccess').style.display = 'flex';
    return;
  }

  const perfil = userDoc.data();
  const esAdmin = user.email === ADMIN_EMAIL || perfil.rol === 'admin';
  const esVendedor = perfil.rol === 'vendedor';

  if (!esAdmin && !esVendedor) {
    $('loadingScreen').style.display = 'none';
    $('noAccess').style.display = 'flex';
    return;
  }

  currentUser = user;
  userPerfil = perfil;

  await cargarClientes();
  initEventListeners();

  $('loadingScreen').style.display = 'none';
  $('mainContent').style.display = 'block';
});

$('btnLogout').addEventListener('click', async () => {
  await signOut(auth);
  window.location.href = '/login.html';
});

// ═══════════ CARGAR CLIENTES ═══════════
async function cargarClientes() {
  mostrarLoader('clientesGrid', 'Cargando clientes...');

  try {
    const [usuariosSnap, metricasSnap] = await Promise.all([
      getDocs(query(collection(db, 'usuarios'), where('estado', '==', 'aprobado'))),
      getDocs(collection(db, 'metricas_clientes'))
    ]);

    // Build metrics map
    metricasMap = {};
    metricasSnap.forEach(d => { metricasMap[d.id] = d.data(); });

    // Filter out internal roles
    todosLosClientes = [];
    usuariosSnap.forEach(d => {
      const data = d.data();
      if (!ROLES_EXCLUIDOS.includes(data.rol)) {
        const metricas = metricasMap[d.id] || {};
        todosLosClientes.push({
          id: d.id,
          ...data,
          _metricas: metricas
        });
      }
    });

    actualizarKPIs();
    aplicarFiltros();
  } catch (error) {
    console.error('Error cargando clientes:', error);
    showToast('Error al cargar clientes', 'error');
  }
}

function actualizarKPIs() {
  const total = todosLosClientes.length;
  let saludables = 0, enRiesgo = 0, inactivos = 0;

  todosLosClientes.forEach(c => {
    const salud = c._metricas?.estado_salud;
    if (salud === 'Saludable') saludables++;
    else if (salud === 'En_Riesgo') enRiesgo++;
    else if (salud === 'Inactivo') inactivos++;
  });

  $('kpiTotal').textContent = formatearNumero(total);
  $('kpiSaludables').textContent = saludables;
  $('kpiRiesgo').textContent = enRiesgo;
  $('kpiInactivos').textContent = inactivos;
}

// ═══════════ FILTROS ═══════════
function aplicarFiltros() {
  let filtrados = [...todosLosClientes];

  // Text search
  const texto = $('filtroTexto')?.value;
  if (texto && texto.trim()) {
    filtrados = buscarMultiCampo(filtrados, texto, [
      'nombre', 'razon_social', 'nit', 'email', 'ciudad', 'nombre_comercial'
    ]);
  }

  // Salud filter
  const salud = $('filtroSalud')?.value;
  if (salud) {
    filtrados = filtrados.filter(c => c._metricas?.estado_salud === salud);
  }

  // ABC filter
  const abc = $('filtroABC')?.value;
  if (abc) {
    filtrados = filtrados.filter(c => c._metricas?.clasificacion_abc === abc);
  }

  // Riesgo filter
  const riesgo = $('filtroRiesgo')?.value;
  if (riesgo) {
    filtrados = filtrados.filter(c => c._metricas?.riesgo_abandono === riesgo);
  }

  // Tendencia filter
  const tendencia = $('filtroTendencia')?.value;
  if (tendencia) {
    filtrados = filtrados.filter(c => c._metricas?.tendencia === tendencia);
  }

  clientesFiltrados = filtrados;
  paginador.paginaActual = 1;
  renderizarClientes();
}

// ═══════════ RENDER ═══════════
function renderizarClientes() {
  const container = $('clientesGrid');
  const paginados = paginador.paginar(clientesFiltrados);

  if (paginados.length === 0) {
    mostrarVacio('clientesGrid', 'No se encontraron clientes', 'bi-people');
    $('paginacionClientes').innerHTML = '';
    return;
  }

  container.innerHTML = paginados.map(c => {
    const m = c._metricas || {};
    const inicial = (c.razon_social || c.nombre || 'C')[0].toUpperCase();

    return `
      <div class="crm-cliente-card" onclick="verDetalle('${c.id}')">
        <div class="crm-cliente-header">
          <div class="crm-cliente-avatar">${inicial}</div>
          <div style="flex:1;min-width:0;">
            <div class="crm-cliente-nombre">${c.razon_social || c.nombre || c.email}</div>
            <div class="crm-cliente-nit">NIT: ${c.nit || 'N/A'} · ${c.ciudad || '-'}</div>
          </div>
        </div>
        <div class="crm-cliente-badges">
          ${badgeSalud(m.estado_salud)}
          ${badgeABC(m.clasificacion_abc)}
          ${badgeRiesgo(m.riesgo_abandono)}
          ${badgeTendencia(m.tendencia)}
        </div>
        <div class="crm-cliente-metricas">
          <div class="crm-cliente-metrica">
            <span class="crm-cliente-metrica-label">Última compra</span>
            <span class="crm-cliente-metrica-value">${m.ultima_compra ? tiempoRelativo(m.ultima_compra) : 'Nunca'}</span>
          </div>
          <div class="crm-cliente-metrica">
            <span class="crm-cliente-metrica-label">Ticket promedio</span>
            <span class="crm-cliente-metrica-value">${formatearPrecio(m.ticket_promedio || 0)}</span>
          </div>
          <div class="crm-cliente-metrica">
            <span class="crm-cliente-metrica-label">Total año</span>
            <span class="crm-cliente-metrica-value">${formatearPrecio(m.total_compras_anio || 0)}</span>
          </div>
          <div class="crm-cliente-metrica">
            <span class="crm-cliente-metrica-label">Días sin compra</span>
            <span class="crm-cliente-metrica-value" style="${(m.dias_sin_compra || 0) > 60 ? 'color:var(--crm-red)' : ''}">${m.dias_sin_compra || '-'}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  paginador.renderControles('paginacionClientes', () => renderizarClientes());
}

// ═══════════ DETALLE CLIENTE ═══════════
window.verDetalle = function(clienteId) {
  const cliente = todosLosClientes.find(c => c.id === clienteId);
  if (!cliente) return;

  const m = cliente._metricas || {};

  $('modalDetalleTitulo').textContent = cliente.razon_social || cliente.nombre || 'Cliente';
  $('modalDetalleBody').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
      <div>
        <h5 style="font-size:0.9rem;font-weight:600;margin-bottom:12px;">Datos del Cliente</h5>
        <div style="font-size:0.85rem;display:flex;flex-direction:column;gap:8px;">
          <div><strong>NIT:</strong> ${cliente.nit || 'N/A'}</div>
          <div><strong>Nombre:</strong> ${cliente.nombre || '-'}</div>
          <div><strong>Razón Social:</strong> ${cliente.razon_social || '-'}</div>
          <div><strong>Nombre Comercial:</strong> ${cliente.nombre_comercial || '-'}</div>
          <div><strong>Email:</strong> ${cliente.email || '-'}</div>
          <div><strong>Teléfono:</strong> ${cliente.telefono || '-'}</div>
          <div><strong>Ciudad:</strong> ${cliente.ciudad || '-'}</div>
          <div><strong>Ruta:</strong> ${cliente.ruta || '-'}</div>
          <div><strong>Tipo:</strong> ${cliente.tipo_cliente || cliente.tipo || '-'}</div>
          <div><strong>Segmento:</strong> ${cliente.segmento || '-'}</div>
          <div><strong>Lista Precio:</strong> ${cliente.lista_precio || '-'}</div>
        </div>
      </div>
      <div>
        <h5 style="font-size:0.9rem;font-weight:600;margin-bottom:12px;">Métricas</h5>
        <div class="crm-cliente-badges" style="margin-bottom:12px;">
          ${badgeSalud(m.estado_salud)}
          ${badgeABC(m.clasificacion_abc)}
          ${badgeRiesgo(m.riesgo_abandono)}
          ${badgeTendencia(m.tendencia)}
        </div>
        <div style="font-size:0.85rem;display:flex;flex-direction:column;gap:8px;">
          <div><strong>Última compra:</strong> ${m.ultima_compra ? formatearFecha(m.ultima_compra) : 'Nunca'}</div>
          <div><strong>Días sin compra:</strong> <span style="${(m.dias_sin_compra || 0) > 60 ? 'color:var(--crm-red);font-weight:600' : ''}">${m.dias_sin_compra || 0}</span></div>
          <div><strong>Frecuencia compra:</strong> cada ${m.frecuencia_compra_dias || 0} días</div>
          <div><strong>Ticket promedio:</strong> ${formatearPrecio(m.ticket_promedio || 0)}</div>
          <div><strong>Total compras año:</strong> ${formatearPrecio(m.total_compras_anio || 0)}</div>
          <div><strong>Promedio mensual:</strong> ${formatearPrecio(m.promedio_mensual || 0)}</div>
          <div><strong>Compra mínima:</strong> ${formatearPrecio(m.compra_minima || 0)}</div>
          <div><strong>Compra máxima:</strong> ${formatearPrecio(m.compra_maxima || 0)}</div>
          <div><strong>Total órdenes:</strong> ${m.total_ordenes || 0}</div>
        </div>
      </div>
    </div>
  `;

  $('btnEditarDesdeDetalle').onclick = () => {
    cerrarModal('modalDetalle');
    abrirModalCliente(clienteId);
  };

  $('modalDetalle').classList.add('open');
};

// ═══════════ CREAR/EDITAR CLIENTE ═══════════
function abrirModalCliente(clienteId) {
  editandoClienteId = clienteId || null;

  if (clienteId) {
    const cliente = todosLosClientes.find(c => c.id === clienteId);
    if (!cliente) return;
    $('modalClienteTitulo').textContent = 'Editar Cliente';
    $('inputNit').value = cliente.nit || '';
    $('inputNombre').value = cliente.nombre || cliente.razon_social || '';
    $('inputNombreComercial').value = cliente.nombre_comercial || '';
    $('inputEmail').value = cliente.email || '';
    $('inputTelefono').value = cliente.telefono || '';
    $('inputCiudad').value = cliente.ciudad || '';
    $('inputRuta').value = cliente.ruta || '';
    $('inputListaPrecio').value = cliente.lista_precio || '';
    $('inputTipo').value = cliente.tipo_cliente || cliente.tipo || '';
    $('inputSegmento').value = cliente.segmento || '';
    $('inputEstado').value = cliente.estado || 'aprobado';
  } else {
    $('modalClienteTitulo').textContent = 'Nuevo Cliente';
    $('inputNit').value = '';
    $('inputNombre').value = '';
    $('inputNombreComercial').value = '';
    $('inputEmail').value = '';
    $('inputTelefono').value = '';
    $('inputCiudad').value = '';
    $('inputRuta').value = '';
    $('inputListaPrecio').value = '';
    $('inputTipo').value = '';
    $('inputSegmento').value = '';
    $('inputEstado').value = 'aprobado';
  }

  $('modalCliente').classList.add('open');
}

async function guardarCliente() {
  const nombre = $('inputNombre').value.trim();
  const nit = $('inputNit').value.trim();

  if (!nombre) {
    showToast('El nombre es obligatorio', 'warning');
    return;
  }

  const datos = {
    nombre: nombre,
    razon_social: nombre,
    nit: nit,
    nombre_comercial: $('inputNombreComercial').value.trim(),
    email: $('inputEmail').value.trim(),
    telefono: $('inputTelefono').value.trim(),
    ciudad: $('inputCiudad').value.trim(),
    ruta: $('inputRuta').value.trim(),
    lista_precio: $('inputListaPrecio').value,
    tipo_cliente: $('inputTipo').value,
    tipo: $('inputTipo').value,
    segmento: $('inputSegmento').value,
    estado: $('inputEstado').value,
    updated_at: new Date().toISOString()
  };

  try {
    if (editandoClienteId) {
      await updateDoc(doc(db, 'usuarios', editandoClienteId), datos);
      showToast('Cliente actualizado', 'success');
    } else {
      datos.created_at = new Date().toISOString();
      datos.creado_por = currentUser.email;
      // Generate a document ID based on NIT or auto
      const docRef = doc(collection(db, 'usuarios'));
      await setDoc(docRef, datos);
      showToast('Cliente creado exitosamente', 'success');
    }

    cerrarModal('modalCliente');
    await cargarClientes();
  } catch (error) {
    console.error('Error guardando cliente:', error);
    showToast('Error al guardar: ' + error.message, 'error');
  }
}

// ═══════════ MODALES ═══════════
window.cerrarModal = function(id) {
  const el = $(id);
  if (el) el.classList.remove('open');
};

// Close on overlay click
document.querySelectorAll('.crm-modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

// Close on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.crm-modal-overlay.open').forEach(m => m.classList.remove('open'));
  }
});

// ═══════════ EVENT LISTENERS ═══════════
function initEventListeners() {
  $('filtroTexto')?.addEventListener('input', debounce(() => aplicarFiltros(), 400));
  $('filtroSalud')?.addEventListener('change', () => aplicarFiltros());
  $('filtroABC')?.addEventListener('change', () => aplicarFiltros());
  $('filtroRiesgo')?.addEventListener('change', () => aplicarFiltros());
  $('filtroTendencia')?.addEventListener('change', () => aplicarFiltros());

  $('btnNuevoCliente')?.addEventListener('click', () => abrirModalCliente(null));
  $('btnGuardarCliente')?.addEventListener('click', () => guardarCliente());
}
