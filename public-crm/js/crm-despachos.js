/**
 * ============================================
 * CRM DESPACHOS - ENAR
 * ============================================
 * Módulo de gestión de despachos y logística.
 * Tabs: Alistamiento, En Espera, En Proceso, Completas
 * Checklist de preparación, chat, CSV, peso.
 * ============================================
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getFirestore, collection, doc, getDoc, getDocs, updateDoc,
  query, where, orderBy, onSnapshot, addDoc, limit as fbLimit, documentId
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
  getAuth, onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
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

// ═══════════ STATE ═══════════
let currentUser = null;
let userPerfil = null;
let todasLasOrdenes = [];
let ordenesFiltradas = [];
let tabActual = 'proceso';
let chatUnsubscribers = {};
let unsubOrdenes = null;
let productosCache = {}; // SKU/cod_interno → { Peso_Kg, nombre, ... }
let usuariosCache = {}; // uid → { telefono, ubicacion, ruta, direccion }
const paginador = new Paginador(15);

function sortItemsPorCargue(items) {
  return [...items].sort((a, b) => {
    const pa = productosCache[a.cod_interno || a.sku];
    const pb = productosCache[b.cod_interno || b.sku];
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

const TAB_ESTADOS = {
  proceso: ['en_proceso'],
  alistamiento: ['alistamiento'],
  terminadas: ['terminada', 'completada', 'parcial']
};

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
  if (unsubOrdenes) unsubOrdenes();
  Object.values(chatUnsubscribers).forEach(unsub => unsub());
  await signOut(auth);
  window.location.href = 'index.html';
});

// ═══════════ CARGAR ÓRDENES (REAL-TIME) ═══════════
async function cargarOrdenes() {
  mostrarLoader('ordenesContainer', 'Cargando órdenes...');

  // Cargar productos cache una sola vez
  if (Object.keys(productosCache).length === 0) {
    try {
      const productosSnap = await getDocs(collection(db, 'productos'));
      productosSnap.forEach(d => {
        const data = d.data();
        const key = data.SKU || data.cod_interno;
        if (key && data.activo !== false) productosCache[key] = data;
      });
    } catch (error) {
      console.error('Error cargando productos:', error);
    }
  }

  // Listener real-time para órdenes
  if (unsubOrdenes) unsubOrdenes();

  const q = query(
    collection(db, 'ordenes'),
    orderBy('created_at', 'desc'),
    fbLimit(500)
  );

  unsubOrdenes = onSnapshot(q, async (snap) => {
    todasLasOrdenes = [];
    snap.forEach(d => {
      const data = d.data();
      if (!data.eliminado) todasLasOrdenes.push({ id: d.id, ...data });
    });

    // Enrich items with product weight
    todasLasOrdenes.forEach(o => {
      const items = o.items || o.productos || [];
      items.forEach(item => {
        if (!item.peso_kg) {
          const sku = item.sku || item.cod_interno;
          const prod = productosCache[sku];
          if (prod) item.peso_kg = prod.peso || prod.Peso_Kg || prod.peso_kg || 0;
        }
      });
    });

    // Load user info in batches (max 30 per Firestore 'in' query)
    const uidsToFetch = new Set();
    todasLasOrdenes.forEach(o => {
      if (o.user_id && !usuariosCache[o.user_id]) uidsToFetch.add(o.user_id);
    });
    if (uidsToFetch.size > 0) {
      const uidsArr = [...uidsToFetch];
      const batchResults = await Promise.all(
        Array.from({ length: Math.ceil(uidsArr.length / 30) }, (_, i) =>
          getDocs(query(collection(db, 'usuarios'), where(documentId(), 'in', uidsArr.slice(i * 30, (i + 1) * 30))))
        )
      );
      batchResults.forEach(s => {
        s.forEach(ud => { usuariosCache[ud.id] = ud.data(); });
      });
    }

    // Enrich orders with user data for route filtering
    todasLasOrdenes.forEach(o => {
      if (o.user_id && usuariosCache[o.user_id]) {
        const u = usuariosCache[o.user_id];
        o._ruta = o.direccion_entrega?.ruta || u.ruta || '';
        o._telefono = o.cliente?.telefono || o.direccion_entrega?.telefono_contacto || u.telefono || '';
        o._ubicacion = o.direccion_entrega?.ciudad || u.ubicacion || '';
        o._direccion = o.direccion_entrega?.direccion || u.direccion || '';
      }
    });

    cargarFiltroRutas();
    actualizarTabCounts();
    aplicarFiltrosYRender();
  }, (error) => {
    console.error('Error en listener órdenes:', error);
    showToast('Error al cargar órdenes', 'error');
  });
}

function cargarFiltroRutas() {
  const rutas = new Set();
  todasLasOrdenes.forEach(o => {
    const ruta = o._ruta || o.direccion_entrega?.ruta || o.cliente?.ruta;
    if (ruta) rutas.add(ruta);
  });

  const select = $('filtroRuta');
  select.innerHTML = '<option value="">Todas</option>';
  [...rutas].sort().forEach(r => {
    select.innerHTML += `<option value="${r}">${r}</option>`;
  });
}

function actualizarTabCounts() {
  const countMap = {
    proceso: 'tabCountProceso',
    alistamiento: 'tabCountAlistamiento',
    terminadas: 'tabCountTerminadas'
  };
  Object.entries(TAB_ESTADOS).forEach(([tab, estados]) => {
    const count = todasLasOrdenes.filter(o => estados.includes(o.estado)).length;
    const el = $(countMap[tab]);
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
      (o._ruta || o.direccion_entrega?.ruta || o.cliente?.ruta) === ruta
    );
  }

  // Filtro fechas
  const desde = $('filtroDesde')?.value;
  const hasta = $('filtroHasta')?.value;
  if (desde) {
    const dDesde = new Date(desde);
    filtradas = filtradas.filter(o => { const f = toDate(o.created_at); return f && f >= dDesde; });
  }
  if (hasta) {
    const dHasta = new Date(hasta + 'T23:59:59');
    filtradas = filtradas.filter(o => { const f = toDate(o.created_at); return f && f <= dHasta; });
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
}

function renderCardOrden(orden) {
  const items = sortItemsPorCargue(orden.items || orden.productos || []);
  const totalItems = items.length;
  const marcados = items.filter(i => ['comp', 'parcial', 'sinstock'].includes(i.estado_alistamiento)).length;
  const progreso = totalItems > 0 ? Math.round((marcados / totalItems) * 100) : 0;

  const pesoTotal = items.reduce((sum, i) => sum + ((i.peso_kg || 0) * (i.cantidad || 0)), 0);
  const totalUnidades = items.reduce((sum, i) => sum + (i.cantidad || 0), 0);

  const ubicacion = orden._ubicacion || orden.direccion_entrega?.ciudad || '';
  const clienteNombre = orden.clienteNombre || orden.cliente?.razon_social || orden.cliente?.nombre || 'Sin cliente';
  const userCache = orden.user_id ? usuariosCache[orden.user_id] : null;
  const nombreComercial = userCache?.nombre_comercial || userCache?.nombre || orden.cliente?.nombre_comercial || '';
  const clienteNit = orden.clienteNit || orden.cliente?.nit || '';
  const fechaEntrega = orden.fecha_entrega_estimada ? formatearFechaHora(orden.fecha_entrega_estimada) : '';
  const tieneNovedad = orden.novedad || false;

  return `
    <div class="crm-despacho-card" data-orden-id="${orden.id}">
      <!-- Fila 1: Cabecera -->
      <div class="crm-despacho-header">
        <div class="crm-despacho-header-row">
          <div class="crm-despacho-header-id">
            <span class="crm-despacho-orden-id">${orden.numero_orden || orden.id.substring(0, 8)}</span>
            <div class="crm-despacho-fecha-creacion">${formatearFechaHora(orden.created_at)}</div>
          </div>
          <span class="crm-despacho-sep"></span>
          ${badgeEstado(orden.estado)}
          ${renderBadgeResultado(orden)}
          <span class="crm-despacho-sep"></span>
          ${ubicacion ? `<span class="crm-despacho-ubicacion"><i class="bi bi-pin-map-fill"></i> ${ubicacion}</span><span class="crm-despacho-sep"></span>` : ''}
          <div class="crm-despacho-header-cliente">
            <span class="crm-despacho-cliente-nombre">
              ${clienteNombre}
              ${nombreComercial && nombreComercial !== clienteNombre ? `<span style="margin:0 6px;color:#cbd5e1;font-weight:400;">|</span><span class="crm-despacho-nombre-comercial">${nombreComercial}</span>` : ''}
            </span>
            ${clienteNit ? `<div class="crm-despacho-cliente-nit">NIT ${clienteNit}</div>` : ''}
          </div>
        </div>
      </div>

      <!-- Fila 2: Cuerpo -->
      <div class="crm-despacho-body">
        <div class="crm-despacho-body-left">
          <span class="crm-despacho-novedad ${tieneNovedad ? 'crm-despacho-novedad--alerta' : 'crm-despacho-novedad--ok'}">
            ${tieneNovedad ? 'Con Novedad' : 'Sin Novedad'}
          </span>
          ${fechaEntrega ? `<span style="color:var(--crm-text-light);">—</span><span class="crm-despacho-fecha-entrega"><i class="bi bi-calendar3"></i> ${fechaEntrega}</span>` : ''}
        </div>
        <div class="crm-despacho-body-right">
          ${renderAccionesTab(orden)}
          <button class="crm-despacho-action-btn crm-despacho-action-btn--green" onclick="toggleChat('${orden.id}', this)">
            <i class="bi bi-chat-dots"></i> Chat
          </button>
        </div>
      </div>

      <!-- Chat inline -->
      <div class="crm-despacho-chat-wrapper">
        <div class="crm-despacho-chat" id="chatZone-${orden.id}">
          <div class="crm-chat">
            <div class="crm-chat-messages" id="chatMessages-${orden.id}">
              <p style="color:var(--crm-text-light);font-size:0.82rem;padding:12px;">Cargando...</p>
            </div>
            <div class="crm-chat-input">
              <input type="text" placeholder="Escribir mensaje..." id="chatInput-${orden.id}"
                onkeydown="if(event.key==='Enter')enviarMensaje('${orden.id}')">
              <button onclick="enviarMensaje('${orden.id}')"><i class="bi bi-send"></i></button>
            </div>
          </div>
        </div>
      </div>

      <!-- Fila 3: Pie -->
      <div class="crm-despacho-footer">
        <div class="crm-despacho-footer-left" onclick="toggleDetalle('${orden.id}')" style="cursor:pointer;">
          <i class="bi bi-caret-right-fill crm-despacho-toggle" id="toggleIcon-${orden.id}"></i> Orden de ${totalItems} productos
        </div>
        <div class="crm-despacho-footer-right">
          <span class="crm-despacho-pill crm-despacho-pill--uds">${formatearNumero(totalUnidades)}</span>
          <span class="crm-despacho-pill crm-despacho-pill--peso">${formatearPeso(pesoTotal)}</span>
          <span title="${marcados}/${totalItems} alistados" style="display:flex;align-items:center;gap:4px;font-size:0.73rem;color:var(--crm-text-light);">
            <div class="crm-despacho-progress-mini"><div class="crm-despacho-progress-mini-bar" style="width:${progreso}%"></div></div>
            ${progreso}%
          </span>
        </div>
      </div>

      <!-- Dropdown detalle inline -->
      <div class="crm-despacho-dropdown" id="dropdown-${orden.id}"></div>
    </div>
  `;
}

function renderBadgeResultado(orden) {
  const resultado = orden.resultado_alistamiento
    || (orden.estado === 'completada' ? 'completada' : orden.estado === 'parcial' ? 'parcial' : '');
  if (!resultado) return '';
  const label = resultado === 'completada' ? 'Completa' : 'Parcial';
  const clase = resultado === 'completada' ? 'badge-completada' : 'badge-parcial';
  return `<span class="badge-estado ${clase}" style="font-size:0.68rem;">${label}</span>`;
}

// ═══════════ ACCIONES POR TAB ═══════════
function renderAccionesTab(orden) {
  if (orden.estado === 'en_proceso') {
    return `<button class="crm-despacho-action-btn crm-despacho-action-btn--red" onclick="iniciarAlistamiento('${orden.id}')">
      <i class="bi bi-clipboard-check"></i> Iniciar Alistamiento
    </button>`;
  }
  if (orden.estado === 'alistamiento') {
    return `<button class="crm-despacho-action-btn crm-despacho-action-btn--red" onclick="abrirAlistamiento('${orden.id}')">
      <i class="bi bi-eye"></i> Alistamiento
    </button>`;
  }
  if (orden.estado === 'terminada' || orden.estado === 'completada' || orden.estado === 'parcial') {
    return `<button class="crm-despacho-action-btn" onclick="generarCSVOrden('${orden.id}')">
      <i class="bi bi-download"></i> Descargar CSV
    </button>`;
  }
  return '';
}

// ═══════════ INICIAR ALISTAMIENTO ═══════════
window.iniciarAlistamiento = async function(ordenId) {
  const orden = todasLasOrdenes.find(o => o.id === ordenId);
  if (!orden) return;

  try {
    const historial = orden.historial || [];
    historial.push({
      estado: 'alistamiento',
      fecha: new Date().toISOString(),
      nota: `Alistamiento iniciado por ${userPerfil.nombre || currentUser.email}`
    });

    await updateDoc(doc(db, 'ordenes', ordenId), {
      estado: 'alistamiento',
      historial: historial,
      updated_at: new Date().toISOString()
    });

    orden.estado = 'alistamiento';
    orden.historial = historial;

    actualizarTabCounts();
    aplicarFiltrosYRender();
    showToast('Alistamiento iniciado', 'success');

    // Abrir modal de alistamiento directamente
    window.abrirAlistamiento(ordenId);
  } catch (error) {
    console.error('Error iniciando alistamiento:', error);
    showToast('Error al iniciar alistamiento', 'error');
  }
};

// ═══════════ FINALIZAR ALISTAMIENTO ═══════════
window.finalizarAlistamiento = async function(ordenId) {
  const orden = todasLasOrdenes.find(o => o.id === ordenId);
  if (!orden) return;

  const items = orden.items || orden.productos || [];
  const todosComp = items.every(i => i.estado_alistamiento === 'comp');
  const resultado = todosComp ? 'completada' : 'parcial';
  const label = todosComp ? 'Completa' : 'Parcial';

  try {
    // Generar CSV primero
    await window.generarCSVOrden(ordenId);

    const historial = orden.historial || [];
    historial.push({
      estado: 'terminada',
      fecha: new Date().toISOString(),
      nota: `Alistamiento ${label} finalizado por ${userPerfil.nombre || currentUser.email}`
    });

    await updateDoc(doc(db, 'ordenes', ordenId), {
      estado: 'terminada',
      resultado_alistamiento: resultado,
      historial: historial,
      terminada_por: currentUser.email,
      fecha_terminada: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    orden.estado = 'terminada';
    orden.resultado_alistamiento = resultado;
    orden.historial = historial;

    $('modalAlistamiento')?.classList.remove('open');
    actualizarTabCounts();
    aplicarFiltrosYRender();
    showToast(`Orden terminada (${label}) — CSV descargado`, 'success');
  } catch (error) {
    console.error('Error finalizando alistamiento:', error);
    showToast('Error al finalizar alistamiento', 'error');
  }
};

// ═══════════ MODAL ALISTAMIENTO ═══════════
window.abrirAlistamiento = function(ordenId) {
  const orden = todasLasOrdenes.find(o => o.id === ordenId);
  if (!orden) return;

  const items = sortItemsPorCargue(orden.items || orden.productos || []);

  $('modalAlistamientoTitulo').textContent = `Alistamiento — ${orden.numero_orden || ordenId.substring(0, 8)}`;

  $('modalAlistamientoBody').innerHTML = `
    <div id="progresoAlistamiento-${ordenId}" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <span id="progresoTexto-${ordenId}" style="font-size:0.82rem;color:var(--crm-text-light);"></span>
      <span id="progresoPct-${ordenId}" style="font-size:0.82rem;font-weight:600;"></span>
    </div>
    <div style="height:6px;background:white;border:1px solid var(--crm-border);border-radius:3px;overflow:hidden;margin-bottom:16px;">
      <div id="progresoBar-${ordenId}" style="height:100%;width:0%;border-radius:3px;transition:width 0.3s;"></div>
    </div>
    <div class="crm-tabla-wrapper">
      <table class="crm-tabla" id="tablaAlistamiento-${ordenId}">
        <thead>
          <tr>
            <th style="width:50px;text-align:center;font-size:0.7rem;">
              <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
                <span>Comp.</span>
                <input type="checkbox" class="crm-checklist-check" id="checkAllComp-${ordenId}"
                  onchange="seleccionarTodosEstado('${ordenId}','comp',this.checked)" title="Marcar todos Completo">
              </div>
            </th>
            <th style="width:50px;text-align:center;font-size:0.7rem;">
              <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
                <span>Parcial</span>
                <input type="checkbox" class="crm-checklist-check" id="checkAllParcial-${ordenId}"
                  onchange="seleccionarTodosEstado('${ordenId}','parcial',this.checked)" title="Marcar todos Parcial">
              </div>
            </th>
            <th style="width:50px;text-align:center;font-size:0.7rem;">
              <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
                <span style="white-space:nowrap;">Sin Stock</span>
                <input type="checkbox" class="crm-checklist-check" id="checkAllSinstock-${ordenId}"
                  onchange="seleccionarTodosEstado('${ordenId}','sinstock',this.checked)" title="Marcar todos Sin Stock">
              </div>
            </th>
            <th>Producto</th>
            <th style="width:50px;text-align:center;">Img</th>
            <th style="width:70px;text-align:center;">Pedida</th>
            <th style="width:90px;text-align:center;">Despachada</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item, idx) => {
            const cantPedida = item.cantidad || 0;
            const cantReal = item.cantidad_real ?? cantPedida;
            let estadoItem = '';
            if (item.preparado && cantReal === cantPedida) estadoItem = 'comp';
            else if (item.preparado && cantReal > 0 && cantReal < cantPedida) estadoItem = 'parcial';
            else if (cantReal === 0 && item.estado_alistamiento === 'sinstock') estadoItem = 'sinstock';
            else if (item.estado_alistamiento) estadoItem = item.estado_alistamiento;

            const imgSrc = item.imagen_principal || item.imagen || '';
            const prod = productosCache[item.cod_interno || item.sku];
            let imgUrl = imgSrc || (prod && prod.imagen_principal) || '';
            if (imgUrl && imgUrl.includes('googleusercontent.com')) imgUrl += '=w80-h80-c';

            return `
            <tr data-idx="${idx}" class="${estadoItem === 'comp' ? 'alist-row-comp' : estadoItem === 'sinstock' ? 'alist-row-sinstock' : ''}">
              <td style="text-align:center;">
                <button type="button" class="alist-estado-btn alist-comp ${estadoItem === 'comp' ? 'activo' : ''}"
                  onclick="cambiarEstadoItem('${ordenId}',${idx},'comp',this)" title="Completo">
                  <i class="bi bi-check-lg"></i>
                </button>
              </td>
              <td style="text-align:center;">
                <button type="button" class="alist-estado-btn alist-parcial ${estadoItem === 'parcial' ? 'activo' : ''}"
                  onclick="cambiarEstadoItem('${ordenId}',${idx},'parcial',this)" title="Parcial">
                  <i class="bi bi-dash-lg"></i>
                </button>
              </td>
              <td style="text-align:center;">
                <button type="button" class="alist-estado-btn alist-sinstock ${estadoItem === 'sinstock' ? 'activo' : ''}"
                  onclick="cambiarEstadoItem('${ordenId}',${idx},'sinstock',this)" title="Sin Stock">
                  <i class="bi bi-x-lg"></i>
                </button>
              </td>
              <td>
                <div style="font-weight:500;">${item.titulo || item.nombre || '-'}</div>
                <div style="font-size:0.73rem;color:var(--crm-text-light);">${item.cod_interno || item.sku || '-'}</div>
              </td>
              <td style="text-align:center;">
                ${imgUrl
                  ? `<div style="width:40px;height:40px;border-radius:4px;overflow:hidden;display:inline-block;"><img src="${imgUrl}" alt="" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.style.display='none'"></div>`
                  : `<i class="bi bi-image" style="font-size:1.2rem;color:var(--crm-text-light);"></i>`}
              </td>
              <td style="text-align:center;font-weight:600;">${cantPedida}</td>
              <td style="text-align:center;">
                <input type="number" id="cantReal-${ordenId}-${idx}" value="${cantReal}" min="0"
                  style="width:70px;padding:4px 6px;border:1px solid var(--crm-border);border-radius:4px;text-align:center;font-size:0.85rem;${estadoItem !== 'parcial' ? 'background:#f8fafc;' : ''}"
                  ${estadoItem !== 'parcial' ? 'readonly' : ''}
                  onchange="actualizarCantidadReal('${ordenId}',${idx},this.value)">
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  actualizarProgresoAlistamiento(ordenId);

  renderModalFooter(orden);

  // Observer to update footer when progress changes
  orden._updateFooter = () => renderModalFooter(orden);

  $('modalAlistamiento').classList.add('open');
};

function renderModalFooter(orden) {
  const items = orden.items || orden.productos || [];
  const total = items.length;
  const marcados = items.filter(i => ['comp', 'parcial', 'sinstock'].includes(i.estado_alistamiento)).length;
  const todosMarcados = total > 0 && marcados === total;

  $('modalAlistamientoFooter').innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:8px;width:100%;justify-content:space-between;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${orden.estado === 'alistamiento' && todosMarcados
          ? `<button class="crm-btn crm-btn--success crm-btn--sm" onclick="finalizarAlistamiento('${orden.id}')">
              <i class="bi bi-check2-all"></i> Finalizar y Generar CSV
            </button>`
          : orden.estado === 'alistamiento'
            ? `<span style="font-size:0.82rem;color:var(--crm-text-light);align-self:center;">Marca todos los items para finalizar (${marcados}/${total})</span>`
            : renderBotonesEstado(orden)
        }
      </div>
      <button class="crm-btn crm-btn--secondary crm-btn--sm" onclick="generarCSVOrden('${orden.id}')">
        <i class="bi bi-file-earmark-spreadsheet"></i> CSV
      </button>
    </div>
  `;
}

// ═══════════ ESTADO ITEM (Comp/Parcial/Sin Stock) ═══════════
window.cambiarEstadoItem = async function(ordenId, idx, tipo, btn) {
  const orden = todasLasOrdenes.find(o => o.id === ordenId);
  if (!orden) return;

  const items = orden.items || orden.productos || [];
  if (!items[idx]) return;

  const tr = btn.closest('tr');
  const btns = tr.querySelectorAll('.alist-estado-btn');
  const yaActivo = btn.classList.contains('activo');

  // Desactivar todos en esta fila
  btns.forEach(b => { b.classList.remove('activo'); });
  tr.className = '';
  tr.dataset.idx = idx;

  const cantPedida = items[idx].cantidad || 0;
  const inputCant = $(`cantReal-${ordenId}-${idx}`);

  if (yaActivo) {
    // Toggle off
    items[idx].preparado = false;
    items[idx].estado_alistamiento = '';
    if (inputCant) { inputCant.readOnly = true; inputCant.style.background = '#f8fafc'; }
  } else {
    btn.classList.add('activo');
    if (tipo === 'comp') {
      tr.classList.add('alist-row-comp');
      items[idx].preparado = true;
      items[idx].estado_alistamiento = 'comp';
      items[idx].cantidad_real = cantPedida;
      if (inputCant) { inputCant.value = cantPedida; inputCant.readOnly = true; inputCant.style.background = '#f8fafc'; }
    } else if (tipo === 'parcial') {
      items[idx].preparado = true;
      items[idx].estado_alistamiento = 'parcial';
      if (inputCant) { inputCant.readOnly = false; inputCant.style.background = ''; inputCant.focus(); }
    } else if (tipo === 'sinstock') {
      tr.classList.add('alist-row-sinstock');
      items[idx].preparado = false;
      items[idx].estado_alistamiento = 'sinstock';
      items[idx].cantidad_real = 0;
      if (inputCant) { inputCant.value = 0; inputCant.readOnly = true; inputCant.style.background = '#f8fafc'; }
    }
  }

  items[idx].preparado_por = currentUser.email;
  items[idx].fecha_preparado = new Date().toISOString();

  actualizarProgresoAlistamiento(ordenId);

  try {
    await updateDoc(doc(db, 'ordenes', ordenId), {
      items: items, productos: items, updated_at: new Date().toISOString()
    });
    orden.items = items;
    orden.productos = items;
  } catch (error) {
    console.error('Error actualizando estado item:', error);
    showToast('Error al actualizar', 'error');
  }
};

// ═══════════ SELECCIONAR TODOS POR ESTADO ═══════════
window.seleccionarTodosEstado = async function(ordenId, tipo, seleccionar) {
  const orden = todasLasOrdenes.find(o => o.id === ordenId);
  if (!orden) return;

  const items = orden.items || orden.productos || [];
  const filas = document.querySelectorAll(`#tablaAlistamiento-${ordenId} tbody tr`);

  filas.forEach((tr, idx) => {
    if (!items[idx]) return;
    const btns = tr.querySelectorAll('.alist-estado-btn');
    const inputCant = $(`cantReal-${ordenId}-${idx}`);
    const cantPedida = items[idx].cantidad || 0;

    // Desactivar todos
    btns.forEach(b => b.classList.remove('activo'));
    tr.className = '';
    tr.dataset.idx = idx;

    if (seleccionar) {
      const btnTarget = tr.querySelector(`.alist-${tipo}`);
      if (btnTarget) btnTarget.classList.add('activo');

      if (tipo === 'comp') {
        tr.classList.add('alist-row-comp');
        items[idx].preparado = true;
        items[idx].estado_alistamiento = 'comp';
        items[idx].cantidad_real = cantPedida;
        if (inputCant) { inputCant.value = cantPedida; inputCant.readOnly = true; inputCant.style.background = '#f8fafc'; }
      } else if (tipo === 'parcial') {
        items[idx].preparado = true;
        items[idx].estado_alistamiento = 'parcial';
        if (inputCant) { inputCant.readOnly = false; inputCant.style.background = ''; }
      } else if (tipo === 'sinstock') {
        tr.classList.add('alist-row-sinstock');
        items[idx].preparado = false;
        items[idx].estado_alistamiento = 'sinstock';
        items[idx].cantidad_real = 0;
        if (inputCant) { inputCant.value = 0; inputCant.readOnly = true; inputCant.style.background = '#f8fafc'; }
      }
    } else {
      items[idx].preparado = false;
      items[idx].estado_alistamiento = '';
      if (inputCant) { inputCant.readOnly = true; inputCant.style.background = '#f8fafc'; }
    }
  });

  actualizarProgresoAlistamiento(ordenId);

  try {
    await updateDoc(doc(db, 'ordenes', ordenId), {
      items: items, productos: items, updated_at: new Date().toISOString()
    });
    orden.items = items;
    orden.productos = items;
    showToast(seleccionar ? `Todos marcados como ${tipo}` : 'Selección limpiada', 'success');
  } catch (error) {
    console.error('Error masivo:', error);
    showToast('Error al actualizar', 'error');
  }
};

// ═══════════ PROGRESO ALISTAMIENTO ═══════════
function actualizarProgresoAlistamiento(ordenId) {
  const orden = todasLasOrdenes.find(o => o.id === ordenId);
  if (!orden) return;
  const items = orden.items || orden.productos || [];

  const comp = items.filter(i => i.estado_alistamiento === 'comp').length;
  const parcial = items.filter(i => i.estado_alistamiento === 'parcial').length;
  const sinstock = items.filter(i => i.estado_alistamiento === 'sinstock').length;
  const marcados = comp + parcial + sinstock;
  const total = items.length;
  const pct = total > 0 ? Math.round((marcados / total) * 100) : 0;

  let texto = `${comp} completos`;
  if (parcial > 0) texto += `, ${parcial} parciales`;
  if (sinstock > 0) texto += `, ${sinstock} sin stock`;

  const textoEl = $(`progresoTexto-${ordenId}`);
  const pctEl = $(`progresoPct-${ordenId}`);
  const barEl = $(`progresoBar-${ordenId}`);

  if (textoEl) textoEl.textContent = texto;
  if (pctEl) pctEl.textContent = `${pct}%`;
  if (barEl) {
    barEl.style.width = `${pct}%`;
    barEl.style.background = pct === 100 ? 'var(--crm-green)' : 'var(--crm-primary-light)';
  }

  // Update modal footer (Finalizar Alistamiento button visibility)
  if (orden._updateFooter) orden._updateFooter();
}

// ═══════════ DROPDOWN DETALLE INLINE ═══════════
window.toggleDetalle = function(ordenId) {
  const dropdown = $(`dropdown-${ordenId}`);
  const icon = $(`toggleIcon-${ordenId}`);
  if (!dropdown) return;

  const isOpen = dropdown.classList.toggle('open');
  if (icon) icon.classList.toggle('rotated', isOpen);

  // Render content only on first open
  if (isOpen && !dropdown.dataset.loaded) {
    const orden = todasLasOrdenes.find(o => o.id === ordenId);
    if (!orden) return;

    const items = sortItemsPorCargue(orden.items || orden.productos || []);
    const esTerminada = ['terminada', 'completada', 'parcial'].includes(orden.estado);

    const estadoIconos = {
      comp: '<i class="bi bi-check-circle-fill" style="color:#28a745;"></i>',
      parcial: '<i class="bi bi-dash-circle-fill" style="color:#ffd800;"></i>',
      sinstock: '<i class="bi bi-x-circle-fill" style="color:#cc0000;"></i>'
    };

    dropdown.innerHTML = `
      <div class="crm-tabla-wrapper" style="border:none;box-shadow:none;">
        <table class="crm-tabla">
          <thead>
            <tr>
              ${esTerminada ? '<th style="width:40px;text-align:center;">Estado</th>' : ''}
              <th>Código</th>
              <th>Producto</th>
              <th style="text-align:right;">Precio</th>
              <th style="text-align:center;">Pedida</th>
              ${esTerminada ? '<th style="text-align:center;">Real</th>' : ''}
              <th style="text-align:right;">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(item => {
              const ea = item.estado_alistamiento || '';
              const cantReal = item.cantidad_real ?? item.cantidad ?? 0;
              return `
              <tr class="${ea === 'comp' ? 'alist-row-comp' : ea === 'sinstock' ? 'alist-row-sinstock' : ''}">
                ${esTerminada ? `<td style="text-align:center;">${estadoIconos[ea] || '-'}</td>` : ''}
                <td>${item.cod_interno || item.sku || '-'}</td>
                <td>${item.titulo || item.nombre || '-'}</td>
                <td style="text-align:right;">${formatearPrecio(item.precio_unitario)}</td>
                <td style="text-align:center;">${item.cantidad || 0}</td>
                ${esTerminada ? `<td style="text-align:center;font-weight:600;">${cantReal}</td>` : ''}
                <td style="text-align:right;">${formatearPrecio((item.precio_unitario || 0) * (item.cantidad || 0))}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
    dropdown.dataset.loaded = 'true';
  }
};

// ═══════════ TOGGLE CHAT INLINE ═══════════
window.toggleChat = function(ordenId, btn) {
  const chatZone = $(`chatZone-${ordenId}`);
  if (!chatZone) return;

  const isOpen = chatZone.classList.toggle('open');
  if (btn) btn.classList.toggle('active', isOpen);

  if (isOpen) {
    iniciarChatListener(ordenId);
  } else {
    // Stop listener when chat is closed
    if (chatUnsubscribers[ordenId]) {
      chatUnsubscribers[ordenId]();
      delete chatUnsubscribers[ordenId];
    }
  }
};

function renderBotonesEstado(orden) {
  const transiciones = obtenerTransicionesPermitidas(orden.estado).filter(e => e !== 'cancelada');
  const colores = {
    alistamiento: 'background:#fef9c3;color:#854d0e;',
    completada: 'background:#d1fae5;color:#065f46;',
    parcial: 'background:#ffedd5;color:#9a3412;',
    terminada: 'background:#d1fae5;color:#065f46;',
    en_espera: 'background:#f3e8ff;color:#6b21a8;',
    en_proceso: 'background:#e0e7ff;color:#3730a3;',
    cancelada: 'background:#fee2e2;color:#991b1b;',
    aprobada: 'background:#dbeafe;color:#1e40af;'
  };
  return transiciones.map(estado => {
    const estilo = colores[estado] || 'background:var(--crm-primary-light);color:white;';
    return `<button class="crm-btn crm-btn--sm" style="${estilo}" onclick="cambiarEstado('${orden.id}', '${estado}')">
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

    orden.estado = nuevoEstado;
    orden.historial = historial;

    // Close modals if open
    $('modalAlistamiento')?.classList.remove('open');

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

// ═══════════ CSV (CLIENT-SIDE) ═══════════
window.generarCSVOrden = async function(ordenId) {
  try {
    const orden = todasLasOrdenes.find(o => o.id === ordenId);
    if (!orden) return;

    const items = orden.items || orden.productos || [];
    const clienteInfo = usuariosCache[orden.user_id] || {};

    // Build CSV content
    const headers = ['ID_Orden', 'Cliente', 'NIT', 'Direccion', 'Ciudad', 'Ruta', 'Telefono',
      'Producto', 'Codigo', 'Cantidad_Pedida', 'Cantidad_Real', 'Precio_Unitario', 'Subtotal',
      'Peso_Kg', 'Preparado', 'Preparado_Por'];

    const rows = items.map(item => [
      orden.numero_orden || ordenId,
      orden.clienteNombre || clienteInfo.nombre || '',
      orden.clienteNit || clienteInfo.nit || '',
      orden._direccion || '',
      orden._ubicacion || '',
      orden._ruta || '',
      orden._telefono || '',
      item.titulo || item.nombre || '',
      item.cod_interno || item.sku || '',
      item.cantidad || 0,
      item.cantidad_real || item.cantidad || 0,
      item.precio_unitario || 0,
      item.subtotal || (item.precio_unitario || 0) * (item.cantidad || 0),
      (item.peso_kg || 0) * (item.cantidad || 0),
      item.preparado ? 'SI' : 'NO',
      item.preparado_por || ''
    ]);

    // Add totals row
    const pesoTotal = items.reduce((s, i) => s + ((i.peso_kg || 0) * (i.cantidad || 0)), 0);
    rows.push(['', '', '', '', '', '', '', 'TOTAL', '', '',
      items.reduce((s, i) => s + (i.cantidad_real || i.cantidad || 0), 0),
      '', orden.total || 0, pesoTotal, '', '']);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    // BOM for Excel UTF-8
    const bom = '\uFEFF';
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `despacho_${orden.numero_orden || ordenId}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    // Mark CSV as generated in Firestore
    await updateDoc(doc(db, 'ordenes', ordenId), {
      csv_generado: true,
      csv_fecha: new Date().toISOString()
    });
    orden.csv_generado = true;

    showToast('CSV descargado exitosamente', 'success');
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
  if (unsubOrdenes) unsubOrdenes();
  Object.values(chatUnsubscribers).forEach(unsub => unsub());
});
