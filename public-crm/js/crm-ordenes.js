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
  query, where, orderBy, limit
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
  getAuth, onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

import {
  $, ADMIN_EMAIL, IVA_PORCENTAJE, ESTADOS_ORDEN_LABELS,
  formatearPrecio, formatearFecha, formatearNumero,
  badgeEstado, obtenerTransicionesPermitidas, puedeTransicionar,
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
let productosOrden = [];
const paginador = new Paginador(25);
const ROLES_EXCLUIDOS = ['vendedor', 'despachos', 'admin', 'gestor', 'administrador'];

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
  esAdmin = user.email === ADMIN_EMAIL || perfil.rol === 'admin';
  const esVendedor = perfil.rol === 'vendedor';

  if (!esAdmin && !esVendedor) {
    $('loadingScreen').style.display = 'none';
    $('noAccess').style.display = 'flex';
    return;
  }

  currentUser = user;
  userPerfil = perfil;

  await Promise.all([cargarOrdenes(), cargarClientes(), cargarProductos()]);
  initEventListeners();

  $('loadingScreen').style.display = 'none';
  $('mainContent').style.display = 'block';
});

$('btnLogout').addEventListener('click', async () => {
  await signOut(auth);
  window.location.href = 'index.html';
});

// ═══════════ CARGAR ÓRDENES ═══════════
async function cargarOrdenes() {
  try {
    let q;
    if (esAdmin) {
      q = query(collection(db, 'ordenes'), orderBy('created_at', 'desc'));
    } else {
      q = query(
        collection(db, 'ordenes'),
        where('creadaPor', '==', currentUser.uid),
        orderBy('created_at', 'desc')
      );
    }

    const snap = await getDocs(q);
    todasLasOrdenes = [];
    snap.forEach(d => todasLasOrdenes.push({ id: d.id, ...d.data() }));

    actualizarKPIs();
    aplicarFiltros();
  } catch (error) {
    console.error('Error cargando órdenes:', error);
    showToast('Error al cargar órdenes', 'error');
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
      <td style="text-align:center;">
        <button class="crm-btn crm-btn--secondary crm-btn--sm" onclick="verDetalleOrden('${o.id}')">
          <i class="bi bi-eye"></i>
        </button>
      </td>
    </tr>
  `).join('');

  paginador.renderControles('paginacionOrdenes', () => renderizarOrdenes());
}

// ═══════════ DETALLE ORDEN ═══════════
window.verDetalleOrden = function(ordenId) {
  const orden = todasLasOrdenes.find(o => o.id === ordenId);
  if (!orden) return;

  const items = orden.items || orden.productos || [];

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
  `;

  // Botones de cambio de estado
  const transiciones = obtenerTransicionesPermitidas(orden.estado);
  $('modalDetalleFooter').innerHTML = `
    <button class="crm-btn crm-btn--secondary" onclick="cerrarModal('modalDetalle')">Cerrar</button>
    ${transiciones.map(estado => {
      const esCompletada = estado === 'completada';
      const esCancelada = estado === 'cancelada';
      const clase = esCompletada ? 'crm-btn--success' : esCancelada ? 'crm-btn--danger' : 'crm-btn--primary';
      return `<button class="crm-btn ${clase}" onclick="cambiarEstadoOrden('${orden.id}', '${estado}')">
        ${ESTADOS_ORDEN_LABELS[estado]}
      </button>`;
    }).join('')}
  `;

  $('modalDetalle').classList.add('open');
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

function buscarCliente(texto) {
  if (!texto || texto.length < 2) {
    renderClienteResultados(todosLosClientes.slice(0, 30));
    return;
  }

  const textoLower = texto.toLowerCase();
  const resultados = todosLosClientes.filter(c => {
    const nombre = (c.nombre || '').toLowerCase();
    const nit = (c.nit || '').toLowerCase();
    const razon = (c.razon_social || '').toLowerCase();
    const email = (c.email || '').toLowerCase();
    const ubicacion = (c.ubicacion || '').toLowerCase();
    const comercial = (c.nombre_comercial || '').toLowerCase();
    return nombre.includes(textoLower) || nit.includes(textoLower) || razon.includes(textoLower) || email.includes(textoLower) || ubicacion.includes(textoLower) || comercial.includes(textoLower);
  });

  renderClienteResultados(resultados);
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
function seleccionarCliente(cliente) {
  clienteSeleccionado = cliente;
  productosOrden = [];

  cerrarModal('modalBuscarCliente');

  $('selClienteNombre').textContent = cliente.razon_social || cliente.nombre || cliente.email;
  $('selClienteNit').textContent = cliente.nit || 'N/A';
  $('selClienteTipo').textContent = cliente.tipo_cliente || '-';

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
async function cargarProductos() {
  try {
    const snap = await getDocs(collection(db, 'productos'));
    todosLosProductos = [];
    snap.forEach(d => {
      const data = d.data();
      if (data.cod_interno && data.cod_interno !== 'COD_INTERNO' && data.titulo !== 'TITULO') {
        todosLosProductos.push({ id: d.id, ...data });
      }
    });
    todosLosProductos.sort((a, b) => (a.titulo || '').localeCompare(b.titulo || ''));
  } catch (error) {
    console.error('Error cargando productos:', error);
  }
}

function buscarProducto(termino) {
  if (!termino) return;

  const container = $('productoResultados');
  container.style.display = 'block';

  const textoLower = termino.toLowerCase();
  const filtrados = todosLosProductos.filter(p => {
    const cod = (p.cod_interno || '').toLowerCase();
    const titulo = (p.titulo || '').toLowerCase();
    const marca = (p.marca || '').toLowerCase();
    const ean = (p.ean || '').toLowerCase();
    return cod.includes(textoLower) || titulo.includes(textoLower) || marca.includes(textoLower) || ean.includes(textoLower);
  }).slice(0, 20);

  if (filtrados.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:12px;color:var(--crm-text-light);font-size:0.82rem;">No se encontraron productos</div>';
    return;
  }

  container.innerHTML = filtrados.map(p => {
    const precio = obtenerPrecioCliente(p, clienteSeleccionado);
    const yaEnOrden = productosOrden.some(po => po.cod_interno === p.cod_interno);
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--crm-border);font-size:0.82rem;">
        <img src="${p.imagen_principal || 'img/placeholder.png'}" alt="" style="width:36px;height:36px;border-radius:4px;object-fit:cover;" onerror="this.src='img/placeholder.png'">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:500;">${p.titulo}</div>
          <div style="font-size:0.73rem;color:var(--crm-text-light);">${p.cod_interno} · ${p.marca || ''}</div>
        </div>
        <div style="font-weight:600;">${formatearPrecio(precio)}</div>
        <input type="number" value="1" min="1" style="width:50px;padding:4px;border:1px solid var(--crm-border);border-radius:4px;text-align:center;font-size:0.82rem;" data-cod="${p.cod_interno}">
        <button class="crm-btn crm-btn--success crm-btn--sm btn-add-prod" data-cod="${p.cod_interno}" ${yaEnOrden ? 'disabled style="opacity:0.5;"' : ''}>
          ${yaEnOrden ? 'Agregado' : '+ Agregar'}
        </button>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.btn-add-prod').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const cod = btn.dataset.cod;
      const prod = filtrados.find(p => p.cod_interno === cod);
      const qtyInput = container.querySelector(`input[data-cod="${cod}"]`);
      const cantidad = parseInt(qtyInput?.value) || 1;
      if (prod) agregarProducto(prod, cantidad);
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.textContent = 'Agregado';
    });
  });
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
      cantidad: cantidad
    });
  }

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
      subtotal: p.precio_unitario * p.cantidad
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

      direccion_entrega: {
        direccion: clienteSeleccionado.direccion || '',
        ciudad: clienteSeleccionado.ciudad || '',
        departamento: clienteSeleccionado.departamento || '',
        contacto: clienteSeleccionado.nombre || '',
        telefono_contacto: clienteSeleccionado.telefono || ''
      },

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

    await cargarOrdenes();
  } catch (error) {
    console.error('Error creando orden:', error);
    showToast('Error al crear orden: ' + error.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-check2-circle"></i> Confirmar Orden';
  }
}

// ═══════════ MODALES ═══════════
window.cerrarModal = function(id) {
  const el = $(id);
  if (el) el.classList.remove('open');
};

document.querySelectorAll('.crm-modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.crm-modal-overlay.open').forEach(m => m.classList.remove('open'));
  }
});

// ═══════════ EVENT LISTENERS ═══════════
function initEventListeners() {
  $('filtroTexto')?.addEventListener('input', debounce(() => aplicarFiltros(), 400));
  $('filtroEstado')?.addEventListener('change', () => aplicarFiltros());
  $('filtroDesde')?.addEventListener('change', () => aplicarFiltros());
  $('filtroHasta')?.addEventListener('change', () => aplicarFiltros());

  $('btnNuevaOrden')?.addEventListener('click', () => abrirBuscarCliente());

  $('inputBuscarCliente')?.addEventListener('input', debounce((e) => {
    buscarCliente(e.target.value.trim());
  }, 250));

  $('btnBuscarProd')?.addEventListener('click', () => {
    const t = $('inputBuscarProducto')?.value.trim();
    if (t) buscarProducto(t);
  });

  $('inputBuscarProducto')?.addEventListener('input', debounce((e) => {
    const t = e.target.value.trim();
    if (t.length >= 2) buscarProducto(t);
    else $('productoResultados').style.display = 'none';
  }, 250));

  $('inputBuscarProducto')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const t = e.target.value.trim();
      if (t) buscarProducto(t);
    }
  });

  $('btnConfirmarOrden')?.addEventListener('click', () => confirmarOrden());
}
