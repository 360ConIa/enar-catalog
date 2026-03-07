/**
 * ============================================
 * CRM DESPACHOS - ENAR
 * ============================================
 * Módulo de gestión de despachos y logística.
 * Tabs: Alistamiento, En Espera, En Proceso, Completadas
 * Checklist de preparación, chat, CSV, peso.
 * ============================================
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getFirestore, collection, doc, getDoc, getDocs, updateDoc,
  query, where, orderBy, onSnapshot, addDoc, limit as fbLimit
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
  getAuth, onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
  getFunctions, httpsCallable
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';

import {
  $, ESTADOS_ORDEN, ESTADOS_ORDEN_LABELS, ADMIN_EMAIL,
  formatearPrecio, formatearFecha, formatearFechaHora, formatearPeso, formatearNumero,
  tiempoRelativo, badgeEstado, obtenerTransicionesPermitidas, puedeTransicionar,
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
const functions = getFunctions(app);

// ═══════════ STATE ═══════════
let currentUser = null;
let userPerfil = null;
let todasLasOrdenes = [];
let ordenesFiltradas = [];
let tabActual = 'alistamiento';
let chatUnsubscribers = {};
let productosCache = {};
const paginador = new Paginador(15);

const TAB_ESTADOS = {
  alistamiento: ['aprobada'],
  espera: ['en_espera'],
  proceso: ['en_proceso', 'parcial'],
  completadas: ['completada']
};

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
  const esDespachos = perfil.rol === 'despachos';

  if (!esAdmin && !esDespachos) {
    $('loadingScreen').style.display = 'none';
    $('noAccess').style.display = 'flex';
    return;
  }

  currentUser = user;
  userPerfil = perfil;

  $('loadingScreen').style.display = 'none';
  $('mainContent').style.display = 'block';

  await cargarOrdenes();
  initEventListeners();
});

$('btnLogout').addEventListener('click', async () => {
  await signOut(auth);
  window.location.href = '/login.html';
});

// ═══════════ CARGAR ÓRDENES ═══════════
async function cargarOrdenes() {
  mostrarLoader('ordenesContainer', 'Cargando órdenes...');

  try {
    const q = query(
      collection(db, 'ordenes'),
      orderBy('created_at', 'desc')
    );
    const snap = await getDocs(q);
    todasLasOrdenes = [];
    snap.forEach(d => todasLasOrdenes.push({ id: d.id, ...d.data() }));

    // Cargar rutas únicas para filtro
    cargarFiltroRutas();

    actualizarKPIs();
    actualizarTabCounts();
    aplicarFiltrosYRender();
  } catch (error) {
    console.error('Error cargando órdenes:', error);
    showToast('Error al cargar órdenes', 'error');
  }
}

function cargarFiltroRutas() {
  const rutas = new Set();
  todasLasOrdenes.forEach(o => {
    const ruta = o.direccion_entrega?.ruta || o.cliente?.ruta;
    if (ruta) rutas.add(ruta);
  });

  const select = $('filtroRuta');
  select.innerHTML = '<option value="">Todas</option>';
  [...rutas].sort().forEach(r => {
    select.innerHTML += `<option value="${r}">${r}</option>`;
  });
}

// ═══════════ KPIs ═══════════
function actualizarKPIs() {
  const conteos = { alistamiento: 0, espera: 0, proceso: 0, completas: 0 };
  todasLasOrdenes.forEach(o => {
    if (o.estado === 'aprobada') conteos.alistamiento++;
    else if (o.estado === 'en_espera') conteos.espera++;
    else if (o.estado === 'en_proceso' || o.estado === 'parcial') conteos.proceso++;
    else if (o.estado === 'completada') conteos.completas++;
  });

  $('kpiAlistamiento').textContent = conteos.alistamiento;
  $('kpiEspera').textContent = conteos.espera;
  $('kpiProceso').textContent = conteos.proceso;
  $('kpiCompletas').textContent = conteos.completas;
}

function actualizarTabCounts() {
  Object.entries(TAB_ESTADOS).forEach(([tab, estados]) => {
    const count = todasLasOrdenes.filter(o => estados.includes(o.estado)).length;
    const el = $(`tabCount${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
    if (el) el.textContent = count;
  });
}

// ═══════════ FILTROS ═══════════
function aplicarFiltrosYRender() {
  const estadosTab = TAB_ESTADOS[tabActual] || [];
  let filtradas = todasLasOrdenes.filter(o => estadosTab.includes(o.estado));

  // Filtro texto
  const texto = $('filtroTexto')?.value;
  if (texto && texto.trim()) {
    filtradas = buscarMultiCampo(filtradas, texto, [
      'numero_orden', 'clienteNombre', 'clienteNit'
    ]);
  }

  // Filtro ruta
  const ruta = $('filtroRuta')?.value;
  if (ruta) {
    filtradas = filtradas.filter(o =>
      (o.direccion_entrega?.ruta || o.cliente?.ruta) === ruta
    );
  }

  // Filtro fechas
  const desde = $('filtroDesde')?.value;
  const hasta = $('filtroHasta')?.value;
  if (desde) {
    const dDesde = new Date(desde);
    filtradas = filtradas.filter(o => o.created_at && new Date(o.created_at) >= dDesde);
  }
  if (hasta) {
    const dHasta = new Date(hasta + 'T23:59:59');
    filtradas = filtradas.filter(o => o.created_at && new Date(o.created_at) <= dHasta);
  }

  ordenesFiltradas = filtradas;
  paginador.paginaActual = 1;
  renderizarOrdenes();
}

// ═══════════ RENDER ═══════════
function renderizarOrdenes() {
  const container = $('ordenesContainer');
  const paginadas = paginador.paginar(ordenesFiltradas);

  if (paginadas.length === 0) {
    mostrarVacio('ordenesContainer', 'No hay órdenes en esta categoría', 'bi-truck');
    $('paginacionDespachos').innerHTML = '';
    return;
  }

  container.innerHTML = paginadas.map(o => renderCardOrden(o)).join('');
  paginador.renderControles('paginacionDespachos', () => renderizarOrdenes());

  // Attach toggle events
  container.querySelectorAll('.crm-despacho-top').forEach(el => {
    el.addEventListener('click', () => {
      const detail = el.closest('.crm-despacho-card').querySelector('.crm-despacho-detail');
      if (detail) {
        detail.classList.toggle('open');
        if (detail.classList.contains('open')) {
          const ordenId = el.dataset.ordenId;
          cargarDetalleOrden(ordenId, detail);
        }
      }
    });
  });
}

function renderCardOrden(orden) {
  const items = orden.items || orden.productos || [];
  const totalItems = items.length;
  const preparados = items.filter(i => i.preparado).length;
  const progreso = totalItems > 0 ? Math.round((preparados / totalItems) * 100) : 0;

  // Calcular peso aproximado
  const pesoTotal = items.reduce((sum, i) => {
    return sum + ((i.peso_kg || 0) * (i.cantidad || 0));
  }, 0);

  const noLeidos = orden._noLeidos || 0;

  return `
    <div class="crm-despacho-card" data-orden-id="${orden.id}" style="margin-bottom:12px;">
      <div class="crm-despacho-top" data-orden-id="${orden.id}">
        <div class="crm-despacho-info">
          <h4>${orden.numero_orden || orden.id.substring(0, 8)} ${badgeEstado(orden.estado)}</h4>
          <div class="crm-despacho-meta">
            <span><i class="bi bi-person"></i> ${orden.clienteNombre || 'Sin cliente'}</span>
            <span><i class="bi bi-telephone"></i> ${orden.cliente?.telefono || orden.direccion_entrega?.telefono_contacto || '-'}</span>
            <span><i class="bi bi-geo-alt"></i> ${orden.direccion_entrega?.ciudad || orden.cliente?.ciudad || '-'}</span>
            <span><i class="bi bi-calendar3"></i> ${formatearFecha(orden.created_at)}</span>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:700;font-size:1.1rem;">${formatearPrecio(orden.total || 0)}</div>
          ${noLeidos > 0 ? `<span class="crm-chat-badge">${noLeidos} <i class="bi bi-chat-dots"></i></span>` : ''}
        </div>
      </div>

      <div class="crm-despacho-stats">
        <span class="crm-despacho-stat"><i class="bi bi-box"></i> ${totalItems} items</span>
        <span class="crm-despacho-stat"><i class="bi bi-speedometer2"></i> ${formatearPeso(pesoTotal)}</span>
        <span class="crm-despacho-stat"><i class="bi bi-check2-square"></i> ${preparados}/${totalItems} preparados</span>
      </div>

      <div class="crm-despacho-progress">
        <div class="crm-despacho-progress-bar" style="width:${progreso}%;${progreso === 100 ? 'background:var(--crm-green)' : ''}"></div>
      </div>

      <div class="crm-despacho-detail"></div>
    </div>
  `;
}

// ═══════════ DETALLE + CHECKLIST ═══════════
async function cargarDetalleOrden(ordenId, container) {
  const orden = todasLasOrdenes.find(o => o.id === ordenId);
  if (!orden) return;

  const items = orden.items || orden.productos || [];

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <!-- Checklist -->
      <div>
        <h5 style="font-size:0.9rem;font-weight:600;margin-bottom:12px;"><i class="bi bi-clipboard-check"></i> Preparación</h5>
        <ul class="crm-checklist" id="checklist-${ordenId}">
          ${items.map((item, idx) => `
            <li class="crm-checklist-item" data-idx="${idx}">
              <input type="checkbox" class="crm-checklist-check"
                ${item.preparado ? 'checked' : ''}
                onchange="marcarPreparado('${ordenId}', ${idx}, this.checked)">
              <div class="crm-checklist-producto">
                <div class="crm-checklist-producto-nombre">${item.titulo || item.cod_interno}</div>
                <div class="crm-checklist-producto-cod">${item.cod_interno} · ${formatearPrecio(item.precio_unitario)}</div>
              </div>
              <div class="crm-checklist-qty">
                <span class="crm-checklist-qty-label">Pedido: ${item.cantidad}</span>
                <input type="number" value="${item.cantidad_real || item.cantidad || 0}" min="0"
                  style="width:60px;" onchange="actualizarCantidadReal('${ordenId}', ${idx}, this.value)">
                <span class="crm-checklist-qty-label">Real</span>
              </div>
            </li>
          `).join('')}
        </ul>
      </div>

      <!-- Chat + Acciones -->
      <div>
        <h5 style="font-size:0.9rem;font-weight:600;margin-bottom:12px;"><i class="bi bi-chat-dots"></i> Mensajes</h5>
        <div class="crm-chat" id="chat-${ordenId}">
          <div class="crm-chat-messages" id="chatMessages-${ordenId}">
            <div class="crm-loader" style="padding:20px;"><div class="crm-spinner"></div></div>
          </div>
          <div class="crm-chat-input">
            <input type="text" placeholder="Escribir mensaje..." id="chatInput-${ordenId}"
              onkeydown="if(event.key==='Enter')enviarMensaje('${ordenId}')">
            <button onclick="enviarMensaje('${ordenId}')"><i class="bi bi-send"></i></button>
          </div>
        </div>

        <!-- Acciones -->
        <div style="margin-top:16px;display:flex;flex-wrap:wrap;gap:8px;">
          ${renderBotonesEstado(orden)}
          <button class="crm-btn crm-btn--secondary crm-btn--sm" onclick="generarCSVOrden('${ordenId}')">
            <i class="bi bi-file-earmark-spreadsheet"></i> CSV
          </button>
        </div>
      </div>
    </div>
  `;

  // Iniciar listener de chat
  iniciarChatListener(ordenId);
}

function renderBotonesEstado(orden) {
  const transiciones = obtenerTransicionesPermitidas(orden.estado);
  return transiciones.map(estado => {
    const esCompletada = estado === 'completada';
    const esCancelada = estado === 'cancelada';
    const clase = esCompletada ? 'crm-btn--success' : esCancelada ? 'crm-btn--danger' : 'crm-btn--primary';
    return `<button class="crm-btn ${clase} crm-btn--sm" onclick="cambiarEstado('${orden.id}', '${estado}')">
      ${ESTADOS_ORDEN_LABELS[estado]}
    </button>`;
  }).join('');
}

// ═══════════ PREPARACIÓN ═══════════
window.marcarPreparado = async function(ordenId, itemIdx, preparado) {
  try {
    const orden = todasLasOrdenes.find(o => o.id === ordenId);
    if (!orden) return;

    const items = orden.items || orden.productos || [];
    if (!items[itemIdx]) return;

    items[itemIdx].preparado = preparado;
    items[itemIdx].preparado_por = currentUser.email;
    items[itemIdx].fecha_preparado = preparado ? new Date().toISOString() : null;

    await updateDoc(doc(db, 'ordenes', ordenId), {
      items: items,
      productos: items,
      updated_at: new Date().toISOString()
    });

    // Update local
    orden.items = items;
    orden.productos = items;

    showToast(preparado ? 'Producto marcado como preparado' : 'Producto desmarcado', 'success');
  } catch (error) {
    console.error('Error marcando preparado:', error);
    showToast('Error al actualizar', 'error');
  }
};

window.actualizarCantidadReal = async function(ordenId, itemIdx, cantidad) {
  try {
    const orden = todasLasOrdenes.find(o => o.id === ordenId);
    if (!orden) return;

    const items = orden.items || orden.productos || [];
    if (!items[itemIdx]) return;

    items[itemIdx].cantidad_real = parseInt(cantidad) || 0;

    await updateDoc(doc(db, 'ordenes', ordenId), {
      items: items,
      productos: items,
      updated_at: new Date().toISOString()
    });

    orden.items = items;
    orden.productos = items;
  } catch (error) {
    console.error('Error actualizando cantidad:', error);
    showToast('Error al actualizar cantidad', 'error');
  }
};

// ═══════════ CAMBIO DE ESTADO ═══════════
window.cambiarEstado = async function(ordenId, nuevoEstado) {
  const orden = todasLasOrdenes.find(o => o.id === ordenId);
  if (!orden) return;

  if (!puedeTransicionar(orden.estado, nuevoEstado)) {
    showToast('Transición de estado no permitida', 'error');
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

    // Notificar
    try {
      const enviarNotificacion = httpsCallable(functions, 'enviarNotificacion');
      await enviarNotificacion({ ordenId, nuevoEstado });
    } catch (e) {
      console.warn('Notificación no enviada:', e);
    }

    orden.estado = nuevoEstado;
    orden.historial = historial;

    actualizarKPIs();
    actualizarTabCounts();
    aplicarFiltrosYRender();

    showToast(`Orden cambiada a ${ESTADOS_ORDEN_LABELS[nuevoEstado]}`, 'success');
  } catch (error) {
    console.error('Error cambiando estado:', error);
    showToast('Error al cambiar estado', 'error');
  }
};

// ═══════════ CHAT REAL-TIME ═══════════
function iniciarChatListener(ordenId) {
  // Limpiar listener anterior
  if (chatUnsubscribers[ordenId]) {
    chatUnsubscribers[ordenId]();
  }

  const q = query(
    collection(db, 'chat_ordenes'),
    where('orden_id', '==', ordenId),
    orderBy('created_at', 'asc')
  );

  chatUnsubscribers[ordenId] = onSnapshot(q, (snap) => {
    const mensajes = [];
    snap.forEach(d => mensajes.push({ id: d.id, ...d.data() }));
    renderMensajes(ordenId, mensajes);
  }, (error) => {
    console.error('Error en chat listener:', error);
    const container = $(`chatMessages-${ordenId}`);
    if (container) container.innerHTML = '<p style="color:var(--crm-text-light);font-size:0.82rem;padding:12px;">No hay mensajes aún</p>';
  });
}

function renderMensajes(ordenId, mensajes) {
  const container = $(`chatMessages-${ordenId}`);
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

window.enviarMensaje = async function(ordenId) {
  const input = $(`chatInput-${ordenId}`);
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

// ═══════════ CSV ═══════════
window.generarCSVOrden = async function(ordenId) {
  try {
    showToast('Generando CSV...', 'info');
    const generarCSV = httpsCallable(functions, 'generarCSV');
    const result = await generarCSV({ ordenId });

    if (result.data.success) {
      // Descargar CSV
      const blob = new Blob([result.data.csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.data.filename;
      link.click();
      URL.revokeObjectURL(url);

      // Actualizar local
      const orden = todasLasOrdenes.find(o => o.id === ordenId);
      if (orden) orden.csv_generado = true;

      showToast('CSV generado exitosamente', 'success');
    }
  } catch (error) {
    console.error('Error generando CSV:', error);
    showToast('Error al generar CSV', 'error');
  }
};

// ═══════════ MODAL ═══════════
window.cerrarModal = function(id) {
  const el = $(id);
  if (el) el.classList.remove('open');
};

// ═══════════ EVENT LISTENERS ═══════════
function initEventListeners() {
  // Tabs
  document.querySelectorAll('.crm-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.crm-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      tabActual = tab.dataset.tab;
      aplicarFiltrosYRender();
    });
  });

  // Filtros
  $('filtroTexto')?.addEventListener('input', debounce(() => aplicarFiltrosYRender(), 400));
  $('filtroRuta')?.addEventListener('change', () => aplicarFiltrosYRender());
  $('filtroDesde')?.addEventListener('change', () => aplicarFiltrosYRender());
  $('filtroHasta')?.addEventListener('change', () => aplicarFiltrosYRender());
}

// Cleanup on page leave
window.addEventListener('beforeunload', () => {
  Object.values(chatUnsubscribers).forEach(unsub => unsub());
});
