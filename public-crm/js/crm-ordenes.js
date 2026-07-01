/**
 * ============================================
 * CRM ÓRDENES - ENAR
 * ============================================
 * Tabla de órdenes, crear orden (3-step modal),
 * state machine, detalle, cambio de estado.
 * Roles: admin, vendedor
 * ============================================
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getFirestore, collection, doc, getDoc, addDoc, getDocs, updateDoc,
  query, where, orderBy, limit, onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
  getAuth, onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

import {
  $, ADMIN_EMAIL, IVA_PORCENTAJE, ESTADOS_ORDEN_LABELS,
  formatearPrecio, formatearFecha, formatearNumero, tiempoRelativo,
  badgeEstado, obtenerTransicionesPermitidas, puedeTransicionar,
  obtenerReversion, puedeRegresarEstado,
  generarIdOrden, Paginador, buscarMultiCampo,
  showToast, debounce, mostrarLoader, mostrarVacio
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
let esAdmin = false;
let todasLasOrdenes = [];
let ordenesFiltradas = [];
let todosLosClientes = [];
let todosLosProductos = [];
let clienteSeleccionado = null;
let sedeSeleccionadaVendedor = null;
let sedesClienteActual = [];
let productosOrden = [];
let papeleraOrdenPendiente = null;
let unsubOrdenes = null;
let unsubOrdenesList = []; // múltiples listeners para vendedor (propias + asignadas)
let unsubChatNotif = null;
let mensajesPorOrden = new Map(); // ordenId -> [{id, created_at, usuario_id}]
let chatLecturas = new Map(); // ordenId -> lastReadIso
let ordenEditandoId = null;
let productosPorCodigo = new Map(); // cod_interno → producto (O(1) lookup)
let chatUnsubDetalle = null; // listener del chat del modal detalle
const paginador = new Paginador(25);
const ROLES_EXCLUIDOS = ['vendedor', 'despachos', 'admin', 'gestor', 'administrador'];

function sortItemsPorCargue(items) {
  return [...items].sort((a, b) => {
    const pa = productosPorCodigo.get(a.cod_interno || a.sku);
    const pb = productosPorCodigo.get(b.cod_interno || b.sku);
    const oa = (pa && pa.Orden_Cargue) || 'ZZZ';
    const ob = (pb && pb.Orden_Cargue) || 'ZZZ';
    return oa.localeCompare(ob);
  });
}

function toDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (val.toDate) return val.toDate();
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

// ═══════════ AUTH ═══════════
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }

  const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
  if (!userDoc.exists()) {
    $('loadingScreen').style.display = 'none';
    $('noAccess').style.display = 'flex';
    return;
  }

  const perfil = userDoc.data();
  esAdmin = user.email === ADMIN_EMAIL || perfil.rol === 'admin' || perfil.rol === 'gestor' || perfil.comercial_lider === true;
  const esVendedor = perfil.rol === 'vendedor';

  if (!esAdmin && !esVendedor) {
    $('loadingScreen').style.display = 'none';
    $('noAccess').style.display = 'flex';
    return;
  }

  currentUser = user;
  userPerfil = perfil;

  await Promise.all([cargarClientes(), cargarProductos()]);
  cargarOrdenes();
  iniciarChatNotifListener(perfil);
  initEventListeners();

  $('loadingScreen').style.display = 'none';
  $('mainContent').style.display = 'block';
});

$('btnLogout').addEventListener('click', async () => {
  if (unsubOrdenes) unsubOrdenes();
  unsubOrdenesList.forEach(u => u());
  unsubOrdenesList = [];
  if (unsubChatNotif) unsubChatNotif();
  await signOut(auth);
  window.location.href = 'index.html';
});

// ═══════════ CARGAR ÓRDENES (REAL-TIME) ═══════════
function cargarOrdenes() {
  // Limpiar listeners previos (admin: 1, vendedor: 1+N)
  if (unsubOrdenes) { unsubOrdenes(); unsubOrdenes = null; }
  unsubOrdenesList.forEach(u => u());
  unsubOrdenesList = [];

  const errorHandler = (error) => {
    console.error('Error en listener órdenes:', error);
    showToast('Error al cargar órdenes', 'error');
  };

  if (esAdmin) {
    const q = query(collection(db, 'ordenes'), orderBy('created_at', 'desc'), limit(100));
    unsubOrdenes = onSnapshot(q, (snap) => {
      todasLasOrdenes = [];
      snap.forEach(d => {
        const data = d.data();
        if (!data.eliminado) todasLasOrdenes.push({ id: d.id, ...data });
      });
      actualizarKPIs();
      aplicarFiltros();
    }, errorHandler);
    return;
  }

  // Vendedor: órdenes propias (creadaPor) + órdenes de clientes asignados (user_id ∈ asignados)
  const ordenesMap = new Map();
  const rerender = () => {
    todasLasOrdenes = [...ordenesMap.values()].sort((a, b) => {
      const da = toDate(a.created_at)?.getTime() || 0;
      const db = toDate(b.created_at)?.getTime() || 0;
      return db - da;
    });
    actualizarKPIs();
    aplicarFiltros();
  };

  const handleSnap = (snap) => {
    snap.docChanges().forEach(change => {
      const data = change.doc.data();
      if (change.type === 'removed' || data.eliminado) {
        ordenesMap.delete(change.doc.id);
      } else {
        ordenesMap.set(change.doc.id, { id: change.doc.id, ...data });
      }
    });
    rerender();
  };

  // (a) Órdenes creadas por el vendedor desde el panel
  const qPropias = query(
    collection(db, 'ordenes'),
    where('creadaPor', '==', currentUser.uid),
    orderBy('created_at', 'desc'),
    limit(100)
  );
  unsubOrdenesList.push(onSnapshot(qPropias, handleSnap, errorHandler));

  // (b) Órdenes autónomas de clientes con vendedor_asignado == uid (chunkado por 30, límite de Firestore 'in')
  const clienteUidsAsignados = todosLosClientes
    .filter(c => c.vendedor_asignado === currentUser.uid)
    .map(c => c.uid);

  for (let i = 0; i < clienteUidsAsignados.length; i += 30) {
    const chunk = clienteUidsAsignados.slice(i, i + 30);
    const qAsignadas = query(
      collection(db, 'ordenes'),
      where('user_id', 'in', chunk),
      orderBy('created_at', 'desc'),
      limit(100)
    );
    unsubOrdenesList.push(onSnapshot(qAsignadas, handleSnap, errorHandler));
  }
}

// ═══════════ NOTIFICACIONES DE CHAT ═══════════
function iniciarChatNotifListener(perfil) {
  // Cargar lecturas previas desde el perfil
  const lecturasIniciales = perfil?.chat_lecturas || {};
  chatLecturas = new Map(Object.entries(lecturasIniciales));

  if (unsubChatNotif) unsubChatNotif();

  const q = query(
    collection(db, 'chat_ordenes'),
    orderBy('created_at', 'desc'),
    limit(500)
  );

  unsubChatNotif = onSnapshot(q, (snap) => {
    // Reagrupar mensajes por orden_id
    mensajesPorOrden = new Map();
    snap.forEach(d => {
      const data = d.data();
      if (!data.orden_id) return;
      const arr = mensajesPorOrden.get(data.orden_id) || [];
      arr.push({
        id: d.id,
        created_at: data.created_at,
        usuario_id: data.usuario_id
      });
      mensajesPorOrden.set(data.orden_id, arr);
    });
    actualizarBadgeGlobalChat();
    aplicarFiltros(); // re-render tabla con badges actualizados
  }, (error) => {
    console.error('Error listener chat notif:', error);
  });
}

function contarMensajesNoLeidos(ordenId) {
  const mensajes = mensajesPorOrden.get(ordenId);
  if (!mensajes || mensajes.length === 0) return 0;
  const lastRead = chatLecturas.get(ordenId) || '';
  return mensajes.filter(m =>
    m.usuario_id !== currentUser.uid &&
    (m.created_at || '') > lastRead
  ).length;
}

function actualizarBadgeGlobalChat() {
  const badge = $('navChatBadge');
  if (!badge) return;
  let total = 0;
  for (const ordenId of mensajesPorOrden.keys()) {
    if (contarMensajesNoLeidos(ordenId) > 0) total++;
  }
  if (total > 0) {
    badge.textContent = total > 99 ? '99+' : total;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

function renderBadgeChatNoLeidos(ordenId) {
  const count = contarMensajesNoLeidos(ordenId);
  if (count <= 0) return '';
  const label = count > 9 ? '9+' : count;
  return `<span style="position:absolute;top:-6px;right:-6px;background:#D9232D;color:white;border-radius:10px;padding:0 5px;font-size:0.62rem;font-weight:700;min-width:16px;text-align:center;line-height:14px;pointer-events:none;">${label}</span>`;
}

async function marcarOrdenLeida(ordenId) {
  const ahoraIso = new Date().toISOString();
  chatLecturas.set(ordenId, ahoraIso);
  actualizarBadgeGlobalChat();
  aplicarFiltros();
  try {
    await updateDoc(doc(db, 'usuarios', currentUser.uid), {
      [`chat_lecturas.${ordenId}`]: ahoraIso
    });
  } catch (error) {
    console.error('Error marcando orden leída:', error);
  }
}

function actualizarKPIs() {
  const ahora = new Date();
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);

  $('kpiTotal').textContent = formatearNumero(todasLasOrdenes.length);
  $('kpiPendientes').textContent = todasLasOrdenes.filter(o => o.estado === 'pendiente').length;

  const ventasMes = todasLasOrdenes
    .filter(o => { const f = toDate(o.created_at); return f && f >= inicioMes && o.estado !== 'cancelada'; })
    .reduce((s, o) => s + (o.total || 0), 0);
  $('kpiVentas').textContent = formatearPrecio(ventasMes);
  $('kpiCompletadas').textContent = todasLasOrdenes.filter(o => o.estado === 'completada').length;
}

// ═══════════ FILTROS ═══════════
function aplicarFiltros() {
  let filtradas = [...todasLasOrdenes];

  const texto = $('filtroTexto')?.value;
  if (texto && texto.trim()) {
    filtradas = buscarMultiCampo(filtradas, texto, [
      'numero_orden', 'clienteNombre', 'clienteNit',
      'cliente.razon_social', 'cliente.nombre', 'cliente.nit'
    ]);
  }

  const estado = $('filtroEstado')?.value;
  if (estado) filtradas = filtradas.filter(o => o.estado === estado);

  const desde = $('filtroDesde')?.value;
  if (desde) {
    const d = new Date(desde);
    filtradas = filtradas.filter(o => { const f = toDate(o.created_at); return f && f >= d; });
  }

  const hasta = $('filtroHasta')?.value;
  if (hasta) {
    const d = new Date(hasta + 'T23:59:59');
    filtradas = filtradas.filter(o => { const f = toDate(o.created_at); return f && f <= d; });
  }

  ordenesFiltradas = filtradas;
  paginador.paginaActual = 1;
  renderizarOrdenes();
}

// ═══════════ HELPERS ORDEN→CLIENTE ═══════════
function nombreCliente(o) {
  return o.clienteNombre || o.cliente?.razon_social || o.cliente?.nombre || o.cliente?.email || '-';
}
function nitCliente(o) {
  return o.clienteNit || o.cliente?.nit || '-';
}

// ═══════════ CAMBIO ESTADO INLINE ═══════════
function renderBtnCambioEstado(orden) {
  const transiciones = obtenerTransicionesPermitidas(orden.estado);
  if (transiciones.length === 0) {
    return `<button class="crm-btn crm-btn--primary crm-btn--sm" disabled style="opacity:0.4;cursor:not-allowed;" title="Sin transiciones disponibles">
        <i class="bi bi-arrow-repeat"></i>
      </button>`;
  }
  return `
    <div class="crm-estado-dropdown" style="display:inline-block;position:relative;">
      <button class="crm-btn crm-btn--primary crm-btn--sm" onclick="toggleEstadoDropdown(event, '${orden.id}')" title="Cambiar estado">
        <i class="bi bi-arrow-repeat"></i>
      </button>
      <div class="crm-estado-menu" id="estadoMenu_${orden.id}">
        ${transiciones.map(est => `
          <button class="crm-estado-opcion" onclick="cambiarEstadoDesdeTabla('${orden.id}', '${est}')">
            ${badgeEstado(est)}
          </button>
        `).join('')}
      </div>
    </div>`;
}

function renderMenuAccionesMas(orden) {
  const items = [];

  if (orden.estado === 'pendiente') {
    items.push(`<button class="crm-estado-opcion" onclick="window.cerrarMenuMas();editarOrden('${orden.id}')">
      <i class="bi bi-pencil"></i> Editar
    </button>`);
  }

  items.push(`<button class="crm-estado-opcion" onclick="window.cerrarMenuMas();window.generarCSVOrden('${orden.id}')">
    <i class="bi bi-file-earmark-spreadsheet"></i> CSV
  </button>`);

  const reversion = obtenerReversion(orden.estado);
  if (reversion && puedeRegresarEstado(userPerfil?.rol)) {
    items.push(`<button class="crm-estado-opcion" style="color:#92400e;" onclick="window.cerrarMenuMas();regresarEstadoOrden('${orden.id}')">
      <i class="bi bi-arrow-counterclockwise"></i> Regresar a ${ESTADOS_ORDEN_LABELS[reversion]}
    </button>`);
  }

  items.push(`<button class="crm-estado-opcion" style="color:#991b1b;" onclick="window.cerrarMenuMas();enviarAPapelera('${orden.id}')">
    <i class="bi bi-trash3"></i> Papelera
  </button>`);

  return `
    <div class="crm-estado-dropdown" style="display:inline-block;position:relative;">
      <button class="crm-btn crm-btn--sm" style="background:#D9232D;color:white;border:none;" onclick="toggleMasMenu(event, '${orden.id}')" title="Más acciones">
        <i class="bi bi-plus-lg"></i>
      </button>
      <div class="crm-estado-menu" id="masMenu_${orden.id}" style="min-width:200px;">
        ${items.join('')}
      </div>
    </div>`;
}

window.toggleMasMenu = function(event, ordenId) {
  event.stopPropagation();
  document.querySelectorAll('.crm-estado-menu.open').forEach(m => {
    if (m.id !== `masMenu_${ordenId}`) m.classList.remove('open');
  });
  const menu = $(`masMenu_${ordenId}`);
  if (menu) menu.classList.toggle('open');
};

window.cerrarMenuMas = function() {
  document.querySelectorAll('.crm-estado-menu.open').forEach(m => m.classList.remove('open'));
};

window.regresarEstadoOrden = async function(ordenId) {
  const orden = todasLasOrdenes.find(o => o.id === ordenId);
  if (!orden) return;
  if (!puedeRegresarEstado(userPerfil?.rol)) {
    showToast('Solo admin/gestor puede regresar estados', 'error');
    return;
  }
  const reversion = obtenerReversion(orden.estado);
  if (!reversion) {
    showToast('No hay estado previo al cual regresar', 'error');
    return;
  }
  const motivo = prompt(`Regresar orden ${orden.numero_orden || ordenId} de "${ESTADOS_ORDEN_LABELS[orden.estado]}" a "${ESTADOS_ORDEN_LABELS[reversion]}".\n\nMotivo (obligatorio):`);
  if (motivo === null) return;
  const motivoLimpio = motivo.trim();
  if (!motivoLimpio) {
    showToast('El motivo es obligatorio para regresar estados', 'error');
    return;
  }

  try {
    const historial = orden.historial || [];
    historial.push({
      estado: reversion,
      fecha: new Date().toISOString(),
      tipo: 'reversion',
      nota: `Reversión a ${ESTADOS_ORDEN_LABELS[reversion]} por ${userPerfil.nombre || currentUser.email}. Motivo: ${motivoLimpio}`
    });

    await updateDoc(doc(db, 'ordenes', ordenId), {
      estado: reversion,
      historial: historial,
      updated_at: new Date().toISOString()
    });

    orden.estado = reversion;
    orden.historial = historial;

    cerrarModal('modalDetalle');
    actualizarKPIs();
    aplicarFiltros();
    showToast(`Orden regresada a ${ESTADOS_ORDEN_LABELS[reversion]}`, 'success');
  } catch (error) {
    console.error('Error regresando estado:', error);
    showToast('Error al regresar estado', 'error');
  }
};

window.toggleEstadoDropdown = function(event, ordenId) {
  event.stopPropagation();
  // Cerrar otros dropdowns abiertos
  document.querySelectorAll('.crm-estado-menu.open').forEach(m => {
    if (m.id !== `estadoMenu_${ordenId}`) m.classList.remove('open');
  });
  const menu = $(`estadoMenu_${ordenId}`);
  if (menu) menu.classList.toggle('open');
};

window.cambiarEstadoDesdeTabla = async function(ordenId, nuevoEstado) {
  // Cerrar dropdown
  document.querySelectorAll('.crm-estado-menu.open').forEach(m => m.classList.remove('open'));
  // Reutilizar la lógica existente
  await cambiarEstadoOrden(ordenId, nuevoEstado);
};

window.enviarAPapelera = function(ordenId) {
  const orden = todasLasOrdenes.find(o => o.id === ordenId);
  if (!orden) return;

  // Mostrar info de la orden en el modal
  $('papeleraOrdenInfo').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <div><span style="color:var(--crm-text-light);">Orden</span><br><strong>${orden.numero_orden || orden.id.substring(0, 8)}</strong></div>
      <div><span style="color:var(--crm-text-light);">Estado</span><br>${badgeEstado(orden.estado)}</div>
      <div><span style="color:var(--crm-text-light);">Cliente</span><br><strong>${nombreCliente(orden)}</strong></div>
      <div><span style="color:var(--crm-text-light);">Total</span><br><strong>${formatearPrecio(orden.total || 0)}</strong></div>
    </div>`;

  // Resetear botón y guardar ordenId pendiente
  const btn = $('btnConfirmarPapelera');
  btn.disabled = false;
  btn.innerHTML = '<i class="bi bi-trash3"></i> Sí, enviar a papelera';
  papeleraOrdenPendiente = ordenId;

  $('modalPapelera').classList.add('open');
};

// Cerrar dropdowns al hacer click fuera
document.addEventListener('click', () => {
  document.querySelectorAll('.crm-estado-menu.open').forEach(m => m.classList.remove('open'));
});

// ═══════════ RENDER ═══════════
function renderizarOrdenes() {
  const body = $('ordenesBody');
  const paginadas = paginador.paginar(ordenesFiltradas);

  if (paginadas.length === 0) {
    body.innerHTML = `<tr><td colspan="7"><div class="crm-empty" style="padding:40px;"><i class="bi bi-inbox"></i><p>No se encontraron órdenes</p></div></td></tr>`;
    $('paginacionOrdenes').innerHTML = '';
    return;
  }

  body.innerHTML = paginadas.map(o => `
    <tr>
      <td style="font-weight:500;color:var(--crm-primary-light);">${o.numero_orden || o.id.substring(0, 8)}</td>
      <td>
        <div style="font-weight:500;">${nombreCliente(o)}</div>
        <div style="font-size:0.73rem;color:var(--crm-text-light);">NIT: ${nitCliente(o)}</div>
      </td>
      <td style="white-space:nowrap;">${formatearFecha(o.created_at)}</td>
      <td style="text-align:center;">${o.cantidad_productos || (o.items || o.productos || []).length}</td>
      <td style="text-align:right;font-weight:600;">${formatearPrecio(o.total || 0)}</td>
      <td>${badgeEstado(o.estado)}</td>
      <td style="text-align:center;white-space:nowrap;">
        <span style="position:relative;display:inline-block;">
          <button class="crm-btn crm-btn--sm" style="background:#f1f5f9;color:#334155;border:1px solid #e2e8f0;" onclick="verDetalleOrden('${o.id}')" title="Detalles">
            <i class="bi bi-eye"></i>
          </button>
          ${renderBadgeChatNoLeidos(o.id)}
        </span>
        ${renderBtnCambioEstado(o)}
        ${renderMenuAccionesMas(o)}
      </td>
    </tr>
  `).join('');

  paginador.renderControles('paginacionOrdenes', () => renderizarOrdenes());
}

// ═══════════ DETALLE ORDEN ═══════════
window.verDetalleOrden = function(ordenId) {
  const orden = todasLasOrdenes.find(o => o.id === ordenId);
  if (!orden) return;

  const items = sortItemsPorCargue(orden.items || orden.productos || []);

  $('modalDetalleTitulo').textContent = `Orden ${orden.numero_orden || ''}`;
  $('modalDetalleBody').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
      <div><span style="color:var(--crm-text-light);font-size:0.78rem;">Cliente</span><br><strong>${nombreCliente(orden)}</strong></div>
      <div><span style="color:var(--crm-text-light);font-size:0.78rem;">NIT</span><br><strong>${nitCliente(orden)}</strong></div>
      <div><span style="color:var(--crm-text-light);font-size:0.78rem;">Fecha</span><br><strong>${formatearFecha(orden.created_at)}</strong></div>
      <div><span style="color:var(--crm-text-light);font-size:0.78rem;">Estado</span><br>${badgeEstado(orden.estado)}</div>
      <div><span style="color:var(--crm-text-light);font-size:0.78rem;">Creada por</span><br><strong>${orden.creadaPorNombre || orden.creadaPorEmail || '-'}</strong></div>
      <div><span style="color:var(--crm-text-light);font-size:0.78rem;">CSV Generado</span><br><strong>${orden.csv_generado ? 'Sí' : 'No'}</strong></div>
    </div>
    ${orden.observaciones ? `<div style="margin-bottom:16px;padding:10px;background:#f8fafc;border-radius:6px;font-size:0.85rem;"><strong>Observaciones:</strong> ${orden.observaciones}</div>` : ''}
    <div class="crm-tabla-wrapper">
      <table class="crm-tabla">
        <thead>
          <tr>
            <th>Código</th>
            <th>Producto</th>
            <th>P. Unitario</th>
            <th style="text-align:center;">Cant.</th>
            <th style="text-align:right;">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(it => `
            <tr>
              <td style="font-weight:500;color:var(--crm-primary-light);">${it.cod_interno || it.sku || '-'}</td>
              <td>${it.titulo || it.nombre || '-'}</td>
              <td>${formatearPrecio(it.precio_unitario)}</td>
              <td style="text-align:center;">${it.cantidad}</td>
              <td style="text-align:right;font-weight:600;">${formatearPrecio(it.subtotal || it.precio_unitario * it.cantidad)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div style="margin-top:12px;background:#f8fafc;border-radius:8px;padding:12px;">
      <div style="display:flex;justify-content:space-between;font-size:0.85rem;margin-bottom:4px;"><span>Subtotal (sin IVA)</span><span>${formatearPrecio(orden.subtotal || 0)}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:0.85rem;margin-bottom:4px;"><span>IVA (19%)</span><span>${formatearPrecio(orden.iva || 0)}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:1rem;font-weight:700;border-top:2px solid var(--crm-border);padding-top:8px;"><span>Total</span><span>${formatearPrecio(orden.total || 0)}</span></div>
    </div>
    <div class="crm-chat" style="margin-top:16px;">
      <div class="crm-chat-header"><span><i class="bi bi-chat-dots"></i> Mensajes internos</span></div>
      <div class="crm-chat-messages" id="chatMessages-detalle">
        <p style="color:var(--crm-text-light);font-size:0.82rem;padding:12px;">Cargando...</p>
      </div>
      <div class="crm-chat-input">
        <input type="text" placeholder="Escribir mensaje..." id="chatInput-detalle"
          onkeydown="if(event.key==='Enter')enviarMensajeDetalle('${orden.id}')">
        <button onclick="enviarMensajeDetalle('${orden.id}')"><i class="bi bi-send"></i></button>
      </div>
    </div>
  `;

  // Botones de cambio de estado (completada/parcial/en_espera se gestionan desde Despachos)
  const transiciones = obtenerTransicionesPermitidas(orden.estado)
    .filter(e => !['completada', 'parcial', 'en_espera', 'en_proceso'].includes(e));
  const reversionModal = obtenerReversion(orden.estado);
  const btnRegresarModal = (reversionModal && puedeRegresarEstado(userPerfil?.rol))
    ? `<button class="crm-btn" style="background:#fef3c7;color:#92400e;" onclick="regresarEstadoOrden('${orden.id}')"><i class="bi bi-arrow-counterclockwise"></i> Regresar a ${ESTADOS_ORDEN_LABELS[reversionModal]}</button>`
    : '';
  $('modalDetalleFooter').innerHTML = `
    <button class="crm-btn crm-btn--secondary" onclick="cerrarModal('modalDetalle')">Cerrar</button>
    <button class="crm-btn crm-btn--sm" style="background:#217346;color:white;" onclick="window.generarCSVOrden('${orden.id}')">
      CSV
    </button>
    ${btnRegresarModal}
    ${orden.estado === 'pendiente' ? `<button class="crm-btn crm-btn--primary" onclick="cerrarModal('modalDetalle');editarOrden('${orden.id}')"><i class="bi bi-pencil"></i> Editar</button>` : ''}
    ${transiciones.map(estado => {
      const esCancelada = estado === 'cancelada';
      const clase = esCancelada ? 'crm-btn--danger' : 'crm-btn--primary';
      return `<button class="crm-btn ${clase}" onclick="cambiarEstadoOrden('${orden.id}', '${estado}')">
        ${ESTADOS_ORDEN_LABELS[estado]}
      </button>`;
    }).join('')}
  `;

  $('modalDetalle').classList.add('open');
  iniciarChatDetalle(orden.id);
  marcarOrdenLeida(orden.id);
};

// ═══════════ CHAT MENSAJES INTERNOS (modal detalle) ═══════════
function iniciarChatDetalle(ordenId) {
  if (chatUnsubDetalle) { chatUnsubDetalle(); chatUnsubDetalle = null; }

  const q = query(
    collection(db, 'chat_ordenes'),
    where('orden_id', '==', ordenId),
    orderBy('created_at', 'asc')
  );

  chatUnsubDetalle = onSnapshot(q, (snap) => {
    const mensajes = [];
    snap.forEach(d => mensajes.push({ id: d.id, ...d.data() }));
    renderMensajesDetalle(mensajes);
    // Mientras el modal está abierto, cualquier mensaje nuevo se considera leído
    marcarOrdenLeida(ordenId);
  }, (error) => {
    console.error('Error en chat listener:', error);
    const container = $('chatMessages-detalle');
    if (container) container.innerHTML = '<p style="color:var(--crm-text-light);font-size:0.82rem;padding:12px;">No hay mensajes aún</p>';
  });
}

function renderMensajesDetalle(mensajes) {
  const container = $('chatMessages-detalle');
  if (!container) return;

  if (mensajes.length === 0) {
    container.innerHTML = '<p style="color:var(--crm-text-light);font-size:0.82rem;padding:12px;">No hay mensajes aún</p>';
    return;
  }

  container.innerHTML = mensajes.map(m => {
    const esPropio = m.usuario === currentUser.email || m.usuario_id === currentUser.uid;
    return `
      <div class="crm-chat-msg ${esPropio ? 'crm-chat-msg--own' : 'crm-chat-msg--other'}">
        <div class="crm-chat-msg-user">${m.usuario_nombre || m.usuario || 'Sistema'}</div>
        <div>${m.mensaje}</div>
        <div class="crm-chat-msg-time">${tiempoRelativo(m.created_at)}</div>
      </div>
    `;
  }).join('');

  container.scrollTop = container.scrollHeight;
}

window.enviarMensajeDetalle = async function(ordenId) {
  const input = $('chatInput-detalle');
  if (!input) return;
  const mensaje = input.value.trim();
  if (!mensaje) return;

  input.value = '';

  try {
    await addDoc(collection(db, 'chat_ordenes'), {
      orden_id: ordenId,
      usuario: currentUser.email,
      usuario_id: currentUser.uid,
      usuario_nombre: userPerfil.nombre || currentUser.email,
      mensaje: mensaje,
      tipo_usuario: userPerfil.rol === 'despachos' ? 'Logística' : userPerfil.rol === 'vendedor' ? 'Ventas' : 'Admin',
      tipo: 'Chat',
      created_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error enviando mensaje:', error);
    showToast('Error al enviar mensaje', 'error');
  }
};

// ═══════════ CAMBIAR ESTADO ═══════════
window.cambiarEstadoOrden = async function(ordenId, nuevoEstado) {
  const orden = todasLasOrdenes.find(o => o.id === ordenId);
  if (!orden) return;

  if (!puedeTransicionar(orden.estado, nuevoEstado)) {
    showToast('Transición no permitida', 'error');
    return;
  }

  try {
    const historial = orden.historial || [];
    historial.push({
      estado: nuevoEstado,
      fecha: new Date().toISOString(),
      nota: `Cambio a ${ESTADOS_ORDEN_LABELS[nuevoEstado]} por ${userPerfil.nombre || currentUser.email}`
    });

    await updateDoc(doc(db, 'ordenes', ordenId), {
      estado: nuevoEstado,
      historial: historial,
      updated_at: new Date().toISOString()
    });

    orden.estado = nuevoEstado;
    orden.historial = historial;

    cerrarModal('modalDetalle');
    actualizarKPIs();
    aplicarFiltros();
    showToast(`Orden cambiada a ${ESTADOS_ORDEN_LABELS[nuevoEstado]}`, 'success');
  } catch (error) {
    console.error('Error cambiando estado:', error);
    showToast('Error al cambiar estado', 'error');
  }
};

// ═══════════ CARGAR CLIENTES (preload) ═══════════
async function cargarClientes() {
  try {
    const snap = await getDocs(query(
      collection(db, 'usuarios'),
      where('estado', '==', 'aprobado')
    ));
    todosLosClientes = [];
    snap.forEach(d => {
      const data = d.data();
      if (!ROLES_EXCLUIDOS.includes(data.rol)) {
        todosLosClientes.push({ uid: d.id, ...data });
      }
    });
    todosLosClientes.sort((a, b) =>
      (a.razon_social || a.nombre || '').localeCompare(b.razon_social || b.nombre || '')
    );
  } catch (error) {
    console.error('Error cargando clientes:', error);
  }
}

// ═══════════ NUEVA ORDEN - PASO 1: BUSCAR CLIENTE ═══════════
function abrirBuscarCliente() {
  $('inputBuscarCliente').value = '';
  renderClienteResultados(todosLosClientes.slice(0, 30));
  $('modalBuscarCliente').classList.add('open');
  setTimeout(() => $('inputBuscarCliente').focus(), 200);
}

let ultimosClientesFiltrados = [];

function buscarCliente(texto) {
  if (!texto || texto.length < 2) {
    ultimosClientesFiltrados = todosLosClientes.slice(0, 30);
    renderClienteResultados(ultimosClientesFiltrados);
    return;
  }

  // Búsqueda AND con coma: "bogota, mayorista" → ambos deben coincidir
  const terminos = texto.toLowerCase().split(',').map(t => t.trim()).filter(Boolean);

  ultimosClientesFiltrados = todosLosClientes.filter(c => {
    const campos = [
      c.nombre, c.nit, c.razon_social, c.email,
      c.ubicacion, c.nombre_comercial, c.tipo_cliente, c.ciudad
    ].map(v => (v || '').toLowerCase()).join(' ');
    return terminos.every(t => campos.includes(t));
  });

  renderClienteResultados(ultimosClientesFiltrados);
}

function renderClienteResultados(resultados) {
  const container = $('clienteResultados');

  if (todosLosClientes.length === 0) {
    container.innerHTML = '<div class="crm-empty" style="padding:20px;color:var(--crm-red);"><i class="bi bi-exclamation-circle"></i><p>No se pudieron cargar los clientes. Recarga la página.</p></div>';
    return;
  }

  if (resultados.length === 0) {
    container.innerHTML = '<div class="crm-empty" style="padding:20px;"><i class="bi bi-person-x"></i><p>No se encontraron clientes</p></div>';
    return;
  }

  container.innerHTML = resultados.map(c => `
    <div class="crm-cliente-card" style="margin-bottom:8px;padding:12px;cursor:pointer;" data-uid="${c.uid}">
      <div class="crm-cliente-header" style="margin-bottom:0;">
        <div class="crm-cliente-avatar" style="width:36px;height:36px;font-size:0.9rem;">${(c.razon_social || c.nombre || 'C')[0].toUpperCase()}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:0.9rem;">${c.razon_social || c.nombre || c.email}</div>
          <div style="font-size:0.73rem;color:var(--crm-text-light);">NIT: ${c.nit || 'N/A'} · ${c.ubicacion || c.ciudad || '-'} · Lista: ${c.lista_precios || c.lista_precio || 'L1'}</div>
        </div>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.crm-cliente-card').forEach(card => {
    card.addEventListener('click', () => {
      const uid = card.dataset.uid;
      const cliente = resultados.find(c => c.uid === uid);
      if (cliente) seleccionarCliente(cliente);
    });
  });
}

// ═══════════ NUEVA ORDEN - PASO 2: PRODUCTOS ═══════════
async function seleccionarCliente(cliente) {
  clienteSeleccionado = cliente;
  sedeSeleccionadaVendedor = null;
  sedesClienteActual = [];
  productosOrden = [];

  cerrarModal('modalBuscarCliente');

  $('selClienteNombre').textContent = cliente.razon_social || cliente.nombre || cliente.email;
  $('selClienteNit').textContent = cliente.nit || 'N/A';

  // Cargar sedes del cliente
  try {
    const snap = await getDocs(query(
      collection(db, 'usuarios', cliente.uid, 'sedes'),
      where('activo', '==', true)
    ));
    sedesClienteActual = [];
    snap.forEach(d => sedesClienteActual.push({ id: d.id, ...d.data() }));
    sedesClienteActual.sort((a, b) => (a.codigo || '').localeCompare(b.codigo || ''));
  } catch (e) {
    console.error('Error cargando sedes del cliente:', e);
  }

  // Mostrar/ocultar selector de sede
  const sedeContainer = $('selSedeContainer');
  if (sedesClienteActual.length > 0 && sedeContainer) {
    sedeContainer.style.display = '';
    const select = $('selectSedeVendedor');
    if (select) {
      select.innerHTML = (sedesClienteActual.length > 1 ? '<option value="">Seleccione sede...</option>' : '') +
        sedesClienteActual.map(s => `<option value="${s.id}">${s.codigo} — ${s.nombre} (${s.ciudad || ''})</option>`).join('');
      if (sedesClienteActual.length === 1) {
        select.value = sedesClienteActual[0].id;
        sedeSeleccionadaVendedor = sedesClienteActual[0];
      }
    }
  } else if (sedeContainer) {
    sedeContainer.style.display = 'none';
  }

  $('inputBuscarProducto').value = '';
  $('productoResultados').style.display = 'none';
  $('cartEmpty').style.display = 'block';
  $('cartTableWrapper').style.display = 'none';
  $('ordenTotales').style.display = 'none';
  $('inputObservaciones').value = '';
  $('btnConfirmarOrden').disabled = true;

  $('modalProductos').classList.add('open');
  setTimeout(() => $('inputBuscarProducto').focus(), 200);
}

function obtenerPrecioCliente(producto, cliente) {
  const tipoCliente = cliente?.tipo_cliente || 'persona_natural';

  // 1. Precio por tipo_cliente (lógica B2B principal)
  const preciosPorTipo = {
    'mayorista': producto.precio_mayorista,
    'negocio': producto.precio_negocio,
    'persona_natural': producto.precio_persona_natural
  };
  const precioTipo = preciosPorTipo[tipoCliente];
  if (precioTipo && precioTipo > 0) return precioTipo;

  // 1b. Listas personalizadas: buscar campo dinámico precio_[tipoCliente]
  const campoDinamico = producto['precio_' + tipoCliente];
  if (campoDinamico && campoDinamico > 0) return campoDinamico;

  // 2. Fallback: Precio por lista_precios (datos migrados)
  const listaPrecios = cliente?.lista_precios || cliente?.lista_precio || '';
  if (listaPrecios) {
    const preciosPorLista = {
      'L1': producto.Precio_L1,
      'L4': producto.Precio_L4,
      'L7': producto.Precio_L7,
      'L8': producto.Precio_L8,
      'L9': producto.Precio_L9,
      'L10': producto.Precio_L10
    };
    const precioLista = preciosPorLista[listaPrecios];
    if (precioLista && precioLista > 0) return precioLista;
  }

  // 3. Fallback final
  return producto.precio_persona_natural || producto.p_real || producto.Precio_L1 || producto.p_corriente || 0;
}

// ═══════════ CARGAR PRODUCTOS (preload) ═══════════
let indiceBusquedaProductos = []; // Texto pre-normalizado para búsqueda rápida

async function cargarProductos() {
  try {
    const snap = await getDocs(collection(db, 'productos'));
    todosLosProductos = [];
    snap.forEach(d => {
      const data = d.data();
      if (data.activo === false) return;
      if (data.cod_interno && data.cod_interno !== 'COD_INTERNO' && data.titulo !== 'TITULO') {
        todosLosProductos.push({ id: d.id, ...data });
      }
    });
    todosLosProductos.sort((a, b) => (a.orden_pareto || 9999) - (b.orden_pareto || 9999) || (a.titulo || '').localeCompare(b.titulo || ''));
    // Build Map for O(1) lookup in sortItemsPorCargue
    productosPorCodigo = new Map(todosLosProductos.map(p => [p.cod_interno, p]));
    // Pre-normalizar texto de búsqueda (evita recalcular en cada tecleo)
    indiceBusquedaProductos = todosLosProductos.map(p =>
      [p.cod_interno, p.titulo, p.marca, p.ean, p.categoria, p.laboratorio, p.principio_activo]
        .map(v => (v || '')).join(' ').toLowerCase()
    );
  } catch (error) {
    console.error('Error cargando productos:', error);
  }
}

let ultimosFiltrados = [];

function buscarProducto(termino, focusCantidad) {
  if (!termino) return;

  const container = $('productoResultados');
  container.style.display = 'block';

  // Búsqueda AND con coma: "10001, enar" → ambos deben coincidir
  const terminos = termino.toLowerCase().split(',').map(t => t.trim()).filter(Boolean);
  const primerTermino = terminos[0] || '';

  // Score de relevancia: menor es mejor
  //   0 = cod_interno exacto
  //   1 = cod_interno startsWith
  //   2 = ean exacto
  //   3 = cod_interno contiene
  //   4 = ean contiene
  //   5 = match solo en otros campos (título/marca/etc.)
  const scoreProducto = (p) => {
    const cod = (p.cod_interno || '').toLowerCase();
    const ean = (p.ean || '').toLowerCase();
    if (cod === primerTermino) return 0;
    if (cod.startsWith(primerTermino)) return 1;
    if (ean === primerTermino) return 2;
    if (cod.includes(primerTermino)) return 3;
    if (ean.includes(primerTermino)) return 4;
    return 5;
  };

  const filtrados = todosLosProductos.filter((p, i) => {
    const campos = indiceBusquedaProductos[i];
    return terminos.every(t => campos.includes(t));
  }).sort((a, b) => {
    const sa = scoreProducto(a);
    const sb = scoreProducto(b);
    if (sa !== sb) return sa - sb;
    const presA = (a.presentacion || '').toLowerCase();
    const presB = (b.presentacion || '').toLowerCase();
    if (presA !== presB) return presA.localeCompare(presB);
    return (obtenerPrecioCliente(a, clienteSeleccionado) || 0) - (obtenerPrecioCliente(b, clienteSeleccionado) || 0);
  }).slice(0, 30);

  ultimosFiltrados = filtrados;

  if (filtrados.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:12px;color:var(--crm-text-light);font-size:0.82rem;">No se encontraron productos</div>';
    return;
  }

  container.innerHTML = filtrados.map((p, i) => {
    const precio = obtenerPrecioCliente(p, clienteSeleccionado);
    const yaEnOrden = productosOrden.some(po => po.cod_interno === p.cod_interno);
    const imgSrc = p.imagen_principal || '';
    return `
      <div class="prod-row${yaEnOrden ? ' prod-row--added' : ''}" style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--crm-border);font-size:0.82rem;${yaEnOrden ? 'opacity:0.5;' : ''}" data-cod="${p.cod_interno}" data-idx="${i}">
        ${imgSrc ? `<img src="${imgSrc}" alt="" style="width:36px;height:36px;border-radius:4px;object-fit:cover;" onerror="this.style.display='none'">` : '<div style="width:36px;height:36px;border-radius:4px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;font-size:0.65rem;color:#94a3b8;">N/A</div>'}
        <div style="flex:1;min-width:0;">
          <div style="font-weight:500;">${p.titulo}</div>
          <div style="font-size:0.73rem;color:var(--crm-text-light);">${p.cod_interno} · ${p.marca || ''}</div>
        </div>
        <div style="font-weight:600;min-width:80px;text-align:right;">${formatearPrecio(precio)}</div>
        <input type="number" value="" min="1" placeholder="Cant." class="prod-qty" style="width:60px;padding:4px;border:1px solid var(--crm-border);border-radius:4px;text-align:center;font-size:0.82rem;" data-cod="${p.cod_interno}" data-idx="${i}" ${yaEnOrden ? 'disabled' : ''}>
      </div>
    `;
  }).join('');

  // Enter en campo cantidad → agregar producto y volver al buscador
  container.querySelectorAll('.prod-qty').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (input.disabled) return;
        const cod = input.dataset.cod;
        const prod = ultimosFiltrados.find(p => p.cod_interno === cod);
        const cantidad = parseInt(input.value, 10);
        if (!cantidad || cantidad < 1) {
          showToast('Digita la cantidad antes de agregar', 'error');
          input.focus();
          return;
        }
        if (prod) {
          agregarProducto(prod, cantidad);
          // Marcar fila como agregada
          const row = input.closest('.prod-row');
          if (row) { row.style.opacity = '0.5'; row.classList.add('prod-row--added'); }
          input.disabled = true;
          // Volver foco al buscador
          $('inputBuscarProducto').focus();
          $('inputBuscarProducto').select();
        }
      }
    });
  });

  // Si viene de Enter en buscador, foco en cantidad del primer resultado no agregado
  if (focusCantidad) {
    const primerInput = container.querySelector('.prod-qty:not([disabled])');
    if (primerInput) setTimeout(() => primerInput.focus(), 50);
  }
}

function agregarProducto(producto, cantidad) {
  const precio = obtenerPrecioCliente(producto, clienteSeleccionado);

  const existente = productosOrden.find(p => p.cod_interno === producto.cod_interno);
  if (existente) {
    existente.cantidad += cantidad;
  } else {
    productosOrden.push({
      cod_interno: producto.cod_interno,
      titulo: producto.titulo,
      marca: producto.marca || '',
      imagen: producto.imagen_principal || '',
      precio_unitario: precio,
      cantidad: cantidad,
      peso_kg: producto.peso || producto.Peso_Kg || producto.peso_kg || 0
    });
  }

  productosOrden = sortItemsPorCargue(productosOrden);
  renderizarCarrito();
  showToast(`${producto.titulo} agregado`, 'success');
}

window.eliminarProductoDeOrden = function(cod) {
  productosOrden = productosOrden.filter(p => p.cod_interno !== cod);
  renderizarCarrito();
};

window.cambiarCantidad = function(cod, delta) {
  const item = productosOrden.find(p => p.cod_interno === cod);
  if (!item) return;
  item.cantidad = Math.max(1, item.cantidad + delta);
  renderizarCarrito();
};

function renderizarCarrito() {
  const count = productosOrden.length;

  if (count === 0) {
    $('cartEmpty').style.display = 'block';
    $('cartTableWrapper').style.display = 'none';
    $('ordenTotales').style.display = 'none';
    $('btnConfirmarOrden').disabled = true;
    return;
  }

  $('cartEmpty').style.display = 'none';
  $('cartTableWrapper').style.display = 'block';
  $('ordenTotales').style.display = 'block';
  $('btnConfirmarOrden').disabled = false;

  $('cartBody').innerHTML = productosOrden.map(p => {
    const sub = p.precio_unitario * p.cantidad;
    return `
      <tr>
        <td>
          <div style="font-weight:500;">${p.titulo}</div>
          <div style="font-size:0.73rem;color:var(--crm-text-light);">${p.cod_interno}</div>
        </td>
        <td>${formatearPrecio(p.precio_unitario)}</td>
        <td style="text-align:center;">
          <div style="display:flex;align-items:center;justify-content:center;gap:4px;">
            <button class="crm-btn crm-btn--secondary crm-btn--sm" style="padding:2px 6px;min-width:auto;" onclick="cambiarCantidad('${p.cod_interno}', -1)">-</button>
            <span style="min-width:20px;text-align:center;">${p.cantidad}</span>
            <button class="crm-btn crm-btn--secondary crm-btn--sm" style="padding:2px 6px;min-width:auto;" onclick="cambiarCantidad('${p.cod_interno}', 1)">+</button>
          </div>
        </td>
        <td style="text-align:right;font-weight:600;">${formatearPrecio(sub)}</td>
        <td style="text-align:center;">
          <button class="crm-btn crm-btn--danger crm-btn--sm" style="padding:2px 6px;min-width:auto;" onclick="eliminarProductoDeOrden('${p.cod_interno}')">
            <i class="bi bi-trash3"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  const totalConIva = productosOrden.reduce((s, p) => s + p.precio_unitario * p.cantidad, 0);
  const subtotalSinIva = totalConIva / (1 + IVA_PORCENTAJE);
  const iva = totalConIva - subtotalSinIva;

  $('totalSubtotal').textContent = formatearPrecio(subtotalSinIva);
  $('totalIva').textContent = formatearPrecio(iva);
  $('totalGeneral').textContent = formatearPrecio(totalConIva);
}

// ═══════════ EDITAR ORDEN PENDIENTE ═══════════
window.editarOrden = function(ordenId) {
  const orden = todasLasOrdenes.find(o => o.id === ordenId);
  if (!orden || orden.estado !== 'pendiente') {
    showToast('Solo se pueden editar órdenes pendientes', 'error');
    return;
  }

  ordenEditandoId = ordenId;

  // Recuperar cliente
  const clienteUid = orden.clienteUid || orden.user_id;
  const cliente = todosLosClientes.find(c => c.uid === clienteUid);
  clienteSeleccionado = cliente || {
    uid: clienteUid,
    razon_social: orden.clienteNombre || orden.cliente?.razon_social || '',
    nit: orden.clienteNit || orden.cliente?.nit || '',
    tipo_cliente: orden.clienteTipo || orden.cliente?.tipo_cliente || 'persona_natural'
  };

  // Cargar items al carrito
  const items = sortItemsPorCargue(orden.items || orden.productos || []);
  productosOrden = items.map(it => ({
    cod_interno: it.cod_interno || it.sku || '',
    titulo: it.titulo || it.nombre || '',
    marca: it.marca || '',
    imagen: it.imagen || '',
    precio_unitario: it.precio_unitario || 0,
    cantidad: it.cantidad || 1
  }));

  // Poblar modal
  $('modalProductosTitulo').textContent = `Editar Orden ${orden.numero_orden || ''}`;
  $('selClienteNombre').textContent = clienteSeleccionado.razon_social || clienteSeleccionado.nombre || clienteSeleccionado.email || '-';
  $('selClienteNit').textContent = clienteSeleccionado.nit || 'N/A';
  $('inputBuscarProducto').value = '';
  $('productoResultados').style.display = 'none';
  $('inputObservaciones').value = orden.observaciones || '';
  $('btnConfirmarOrden').innerHTML = '<i class="bi bi-check2-circle"></i> Guardar Cambios';

  renderizarCarrito();
  $('modalProductos').classList.add('open');
  setTimeout(() => $('inputBuscarProducto').focus(), 200);
};

async function guardarEdicionOrden() {
  if (!ordenEditandoId || !clienteSeleccionado || productosOrden.length === 0) return;

  const btn = $('btnConfirmarOrden');
  btn.disabled = true;
  btn.innerHTML = '<div class="crm-spinner" style="width:16px;height:16px;display:inline-block;vertical-align:middle;margin-right:6px;border-width:2px;"></div> Guardando...';

  try {
    const totalConIva = productosOrden.reduce((s, p) => s + p.precio_unitario * p.cantidad, 0);
    const subtotalSinIva = totalConIva / (1 + IVA_PORCENTAJE);
    const iva = totalConIva - subtotalSinIva;
    const cantUnidades = productosOrden.reduce((s, p) => s + p.cantidad, 0);

    const itemsData = productosOrden.map(p => ({
      cod_interno: p.cod_interno,
      titulo: p.titulo,
      marca: p.marca,
      imagen: p.imagen,
      precio_unitario: p.precio_unitario,
      cantidad: p.cantidad,
      subtotal: p.precio_unitario * p.cantidad,
      peso_kg: p.peso_kg || 0
    }));

    const orden = todasLasOrdenes.find(o => o.id === ordenEditandoId);
    const historial = orden?.historial || [];
    historial.push({
      estado: 'pendiente',
      fecha: new Date().toISOString(),
      nota: `Orden editada por ${userPerfil.nombre || currentUser.email}`
    });

    const updates = {
      productos: itemsData,
      items: itemsData,
      subtotal: subtotalSinIva,
      iva: iva,
      total: totalConIva,
      cantidad_productos: productosOrden.length,
      cantidad_unidades: cantUnidades,
      observaciones: $('inputObservaciones').value.trim(),
      historial: historial,
      updated_at: new Date().toISOString()
    };

    await updateDoc(doc(db, 'ordenes', ordenEditandoId), updates);

    // Actualizar en memoria
    if (orden) {
      Object.assign(orden, updates);
    }

    cerrarModal('modalProductos');
    showToast('Orden actualizada exitosamente', 'success');
    actualizarKPIs();
    aplicarFiltros();
  } catch (error) {
    console.error('Error guardando edición:', error);
    showToast('Error al guardar cambios: ' + error.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-check2-circle"></i> Guardar Cambios';
  }
}

function resetModalProductos() {
  ordenEditandoId = null;
  clienteSeleccionado = null;
  productosOrden = [];
  $('modalProductosTitulo').textContent = 'Nueva Orden';
  $('btnConfirmarOrden').innerHTML = '<i class="bi bi-check2-circle"></i> Confirmar Orden';
  $('btnConfirmarOrden').disabled = true;
}

// ═══════════ CONFIRMAR ORDEN ═══════════
async function confirmarOrden() {
  if (!clienteSeleccionado || productosOrden.length === 0) return;

  const btn = $('btnConfirmarOrden');
  btn.disabled = true;
  btn.innerHTML = '<div class="crm-spinner" style="width:16px;height:16px;display:inline-block;vertical-align:middle;margin-right:6px;border-width:2px;"></div> Creando...';

  try {
    const totalConIva = productosOrden.reduce((s, p) => s + p.precio_unitario * p.cantidad, 0);
    const subtotalSinIva = totalConIva / (1 + IVA_PORCENTAJE);
    const iva = totalConIva - subtotalSinIva;
    const cantUnidades = productosOrden.reduce((s, p) => s + p.cantidad, 0);

    const itemsData = productosOrden.map(p => ({
      cod_interno: p.cod_interno,
      titulo: p.titulo,
      marca: p.marca,
      imagen: p.imagen,
      precio_unitario: p.precio_unitario,
      cantidad: p.cantidad,
      subtotal: p.precio_unitario * p.cantidad,
      peso_kg: p.peso_kg || 0
    }));

    const orden = {
      numero_orden: generarIdOrden(),
      user_id: clienteSeleccionado.uid,
      clienteUid: clienteSeleccionado.uid,
      clienteNombre: clienteSeleccionado.razon_social || clienteSeleccionado.nombre || clienteSeleccionado.email,
      clienteNit: clienteSeleccionado.nit || '',
      clienteTipo: clienteSeleccionado.tipo_cliente || 'persona_natural',

      cliente: {
        email: clienteSeleccionado.email || '',
        nombre: clienteSeleccionado.nombre || '',
        telefono: clienteSeleccionado.telefono || '',
        tipo_cliente: clienteSeleccionado.tipo_cliente || '',
        razon_social: clienteSeleccionado.razon_social || '',
        nit: clienteSeleccionado.nit || ''
      },

      direccion_entrega: sedeSeleccionadaVendedor ? {
        direccion: sedeSeleccionadaVendedor.direccion || '',
        ciudad: sedeSeleccionadaVendedor.ciudad || '',
        departamento: sedeSeleccionadaVendedor.departamento || '',
        contacto: sedeSeleccionadaVendedor.contacto || clienteSeleccionado.nombre || '',
        telefono_contacto: sedeSeleccionadaVendedor.telefono || clienteSeleccionado.telefono || ''
      } : {
        direccion: clienteSeleccionado.direccion || '',
        ciudad: clienteSeleccionado.ciudad || '',
        departamento: clienteSeleccionado.departamento || '',
        contacto: clienteSeleccionado.nombre || '',
        telefono_contacto: clienteSeleccionado.telefono || ''
      },

      ...(sedeSeleccionadaVendedor ? {
        sede: {
          id: sedeSeleccionadaVendedor.id,
          codigo: sedeSeleccionadaVendedor.codigo,
          nombre: sedeSeleccionadaVendedor.nombre
        }
      } : {}),

      creadaPor: currentUser.uid,
      creadaPorNombre: userPerfil.nombre || currentUser.email,
      creadaPorEmail: currentUser.email,
      tipo: 'orden-vendedor',

      productos: itemsData,
      items: itemsData,

      subtotal: subtotalSinIva,
      iva: iva,
      total: totalConIva,
      cantidad_productos: productosOrden.length,
      cantidad_unidades: cantUnidades,

      estado: 'pendiente',
      observaciones: $('inputObservaciones').value.trim(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),

      historial: [{
        estado: 'pendiente',
        fecha: new Date().toISOString(),
        nota: `Orden creada por ${userPerfil.nombre || currentUser.email} desde CRM`
      }]
    };

    await addDoc(collection(db, 'ordenes'), orden);

    cerrarModal('modalProductos');
    showToast(`Orden ${orden.numero_orden} creada exitosamente`, 'success');

    clienteSeleccionado = null;
    productosOrden = [];
  } catch (error) {
    console.error('Error creando orden:', error);
    showToast('Error al crear orden: ' + error.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-check2-circle"></i> Confirmar Orden';
  }
}

// ═══════════ CSV ORDEN ═══════════
window.generarCSVOrden = function(ordenId) {
  const orden = todasLasOrdenes.find(o => o.id === ordenId);
  if (!orden) return;

  const items = orden.items || orden.productos || [];
  const headers = ['ID_Orden', 'Cliente', 'NIT', 'Producto', 'Codigo',
    'Cantidad', 'Precio_Unitario', 'Subtotal'];

  const rows = items.map(item => [
    orden.numero_orden || ordenId,
    nombreCliente(orden),
    nitCliente(orden),
    item.titulo || item.nombre || '',
    item.cod_interno || item.sku || '',
    item.cantidad || 0,
    item.precio_unitario || 0,
    item.subtotal || (item.precio_unitario || 0) * (item.cantidad || 0)
  ]);

  rows.push(['', '', '', 'TOTAL', '', '',  '', orden.total || 0]);

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const bom = '\uFEFF';
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `orden_${orden.numero_orden || ordenId}_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);

  showToast('CSV descargado', 'success');
};

// ═══════════ MODALES ═══════════
window.cerrarModal = function(id) {
  const el = $(id);
  if (el) el.classList.remove('open');
  if (id === 'modalProductos') resetModalProductos();
  if (id === 'modalDetalle' && chatUnsubDetalle) {
    chatUnsubDetalle();
    chatUnsubDetalle = null;
  }
};

document.querySelectorAll('.crm-modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) cerrarModal(overlay.id);
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.crm-modal-overlay.open').forEach(m => cerrarModal(m.id));
  }
});

// ═══════════ EVENT LISTENERS ═══════════
function initEventListeners() {
  $('filtroTexto')?.addEventListener('input', debounce(() => aplicarFiltros(), 400));
  $('filtroEstado')?.addEventListener('change', () => aplicarFiltros());
  $('filtroDesde')?.addEventListener('change', () => aplicarFiltros());
  $('filtroHasta')?.addEventListener('change', () => aplicarFiltros());

  $('btnNuevaOrden')?.addEventListener('click', () => abrirBuscarCliente());

  $('btnConfirmarPapelera')?.addEventListener('click', async () => {
    if (!papeleraOrdenPendiente) return;
    const btn = $('btnConfirmarPapelera');
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Eliminando...';
    try {
      await updateDoc(doc(db, 'ordenes', papeleraOrdenPendiente), {
        eliminado: true,
        eliminado_at: new Date().toISOString(),
        eliminado_por: userPerfil.nombre || currentUser.email
      });
      todasLasOrdenes = todasLasOrdenes.filter(o => o.id !== papeleraOrdenPendiente);
      cerrarModal('modalPapelera');
      actualizarKPIs();
      aplicarFiltros();
      showToast('Orden enviada a papelera', 'success');
    } catch (error) {
      console.error('Error enviando a papelera:', error);
      showToast('Error al enviar a papelera', 'error');
    }
    papeleraOrdenPendiente = null;
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-trash3"></i> Sí, enviar a papelera';
  });

  $('inputBuscarCliente')?.addEventListener('input', debounce((e) => {
    buscarCliente(e.target.value.trim());
  }, 250));

  $('inputBuscarCliente')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (ultimosClientesFiltrados.length > 0) {
        seleccionarCliente(ultimosClientesFiltrados[0]);
      }
    }
  });

  $('btnBuscarProd')?.addEventListener('click', () => {
    const t = $('inputBuscarProducto')?.value.trim();
    if (t) buscarProducto(t, true);
  });

  $('inputBuscarProducto')?.addEventListener('input', debounce((e) => {
    const t = e.target.value.trim();
    if (t.length >= 2) buscarProducto(t, false);
    else $('productoResultados').style.display = 'none';
  }, 300));

  $('inputBuscarProducto')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const t = e.target.value.trim();
      if (t) buscarProducto(t, true);
    }
  });

  $('btnConfirmarOrden')?.addEventListener('click', () => {
    if (ordenEditandoId) {
      guardarEdicionOrden();
    } else {
      confirmarOrden();
    }
  });

  // Selector de sede del vendedor
  $('selectSedeVendedor')?.addEventListener('change', (e) => {
    const sede = sedesClienteActual.find(s => s.id === e.target.value);
    sedeSeleccionadaVendedor = sede || null;
  });
}

// ═══════════ CLEANUP AL SALIR DE PÁGINA ═══════════
window.addEventListener('beforeunload', () => {
  if (unsubOrdenes) unsubOrdenes();
});
