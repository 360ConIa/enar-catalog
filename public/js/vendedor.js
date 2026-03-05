/**
 * ============================================
 * PANEL VENDEDOR - ENAR B2B
 * ============================================
 * Archivo: vendedor.js
 * Descripción: Lógica completa del panel de ventas.
 *   - Crear órdenes en nombre de clientes
 *   - Buscar clientes y productos
 *   - Historial de órdenes del vendedor
 * ============================================
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getFirestore,
  doc,
  getDoc,
  addDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// ═══════════ FIREBASE INIT ═══════════
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

const IVA_PORCENTAJE = 0.19;

// ═══════════ STATE ═══════════
let vendedorUser = null;
let vendedorPerfil = null;
let clienteSeleccionado = null;
let productosOrden = []; // { cod_interno, titulo, marca, imagen, precio_unitario, cantidad }
let todasLasOrdenes = [];
let debounceTimer = null;

// ═══════════ DOM REFS ═══════════
const $ = id => document.getElementById(id);

// ═══════════ UTILS ═══════════
function formatearPrecio(n) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP',
    minimumFractionDigits: 0, maximumFractionDigits: 0
  }).format(n);
}

function formatearFecha(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function textoEstado(e) {
  const map = {
    pendiente: 'Pendiente',
    alistamiento: 'Alistamiento',
    completo: 'Completo',
    parcial: 'Parcial',
    en_espera: 'En Espera',
    cancelada: 'Cancelada'
  };
  return map[e] || e;
}

function claseEstado(e) {
  return `estado-${e}`;
}

function etiquetaTipo(t) {
  const map = {
    mayorista: 'Mayorista',
    negocio: 'Negocio',
    persona_natural: 'P. Natural'
  };
  return map[t] || t;
}

function claseTipo(t) {
  return `tipo-${t}`;
}

function obtenerPrecioPorTipo(producto, tipoCliente) {
  switch (tipoCliente) {
    case 'mayorista':   return producto.precio_mayorista || 0;
    case 'negocio':     return producto.precio_negocio || 0;
    case 'persona_natural':
    default:            return producto.precio_persona_natural || 0;
  }
}

function showToast(msg, type = 'success') {
  const container = $('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icon = type === 'success' ? 'bi-check-circle' : type === 'error' ? 'bi-x-circle' : 'bi-info-circle';
  toast.innerHTML = `<i class="bi ${icon}"></i> ${msg}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(40px)';
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function generarNumeroOrden() {
  const f = new Date();
  const yy = f.getFullYear().toString().slice(-2);
  const mm = String(f.getMonth() + 1).padStart(2, '0');
  const dd = String(f.getDate()).padStart(2, '0');
  const rnd = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `OC-${yy}${mm}${dd}-${rnd}`;
}

// ═══════════ AUTH ═══════════
onAuthStateChanged(auth, async (user) => {
  $('loadingScreen').style.display = 'none';

  if (!user) {
    window.location.href = '/login.html';
    return;
  }

  // Verificar que sea vendedor
  const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
  if (!userDoc.exists()) {
    $('noAccess').style.display = 'flex';
    return;
  }

  const perfil = userDoc.data();
  if (perfil.rol !== 'vendedor') {
    $('noAccess').style.display = 'flex';
    return;
  }

  vendedorUser = user;
  vendedorPerfil = perfil;

  $('vendedorNombre').textContent = (perfil.nombre || user.email).split(' ')[0];
  $('vendedorPanel').style.display = 'block';

  await cargarOrdenesVendedor();
});

// Logout
$('btnLogout').addEventListener('click', async (e) => {
  e.preventDefault();
  await signOut(auth);
  window.location.href = '/login.html';
});

// ═══════════ CARGAR ÓRDENES ═══════════
async function cargarOrdenesVendedor() {
  try {
    const q = query(
      collection(db, 'ordenes'),
      where('creadaPor', '==', vendedorUser.uid),
      orderBy('created_at', 'desc')
    );
    const snap = await getDocs(q);
    todasLasOrdenes = [];
    snap.forEach(d => todasLasOrdenes.push({ id: d.id, ...d.data() }));
    actualizarStats();
    renderizarOrdenes(todasLasOrdenes);
  } catch (error) {
    console.error('Error cargando órdenes:', error);
    showToast('Error al cargar órdenes', 'error');
  }
}

function actualizarStats() {
  $('statTotal').textContent = todasLasOrdenes.length;
  $('statPendientes').textContent = todasLasOrdenes.filter(o => o.estado === 'pendiente').length;
  const monto = todasLasOrdenes.reduce((s, o) => s + (o.total || 0), 0);
  $('statMonto').textContent = formatearPrecio(monto);
  const clientesUnicos = new Set(todasLasOrdenes.map(o => o.clienteUid)).size;
  $('statClientes').textContent = clientesUnicos;
}

function renderizarOrdenes(ordenes) {
  const body = $('ordenesBody');

  if (ordenes.length === 0) {
    body.innerHTML = `
      <tr><td colspan="8">
        <div class="empty-state">
          <i class="bi bi-inbox"></i>
          <p>No se encontraron órdenes</p>
        </div>
      </td></tr>`;
    return;
  }

  body.innerHTML = ordenes.map(o => `
    <tr>
      <td><span class="orden-numero">${o.numero_orden || '-'}</span></td>
      <td>
        <div class="cliente-info">
          <span class="cliente-nombre">${o.clienteNombre || '-'}</span>
          <span class="cliente-nit">NIT: ${o.clienteNit || '-'}</span>
        </div>
      </td>
      <td><span class="tipo-badge ${claseTipo(o.clienteTipo)}">${etiquetaTipo(o.clienteTipo)}</span></td>
      <td>${o.cantidad_productos || o.productos?.length || 0}</td>
      <td><span class="monto">${formatearPrecio(o.total || 0)}</span></td>
      <td><span class="order-status ${claseEstado(o.estado)}">${textoEstado(o.estado)}</span></td>
      <td>${formatearFecha(o.created_at)}</td>
      <td style="text-align:center;">
        <button class="btn-ver-detalle" onclick="verDetalleOrden('${o.id}')">
          <i class="bi bi-eye"></i> Ver
        </button>
      </td>
    </tr>
  `).join('');
}

// Hacer global para onclick
window.verDetalleOrden = function(ordenId) {
  const orden = todasLasOrdenes.find(o => o.id === ordenId);
  if (!orden) return;

  const items = orden.productos || orden.items || [];

  $('detalleOrdenBody').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
      <div class="detalle-field">
        <div class="lbl">N. Orden</div>
        <div class="val">${orden.numero_orden || '-'}</div>
      </div>
      <div class="detalle-field">
        <div class="lbl">Fecha</div>
        <div class="val">${formatearFecha(orden.created_at)}</div>
      </div>
      <div class="detalle-field">
        <div class="lbl">Cliente</div>
        <div class="val">${orden.clienteNombre || '-'}</div>
      </div>
      <div class="detalle-field">
        <div class="lbl">NIT</div>
        <div class="val">${orden.clienteNit || '-'}</div>
      </div>
      <div class="detalle-field">
        <div class="lbl">Tipo Cliente</div>
        <div class="val"><span class="tipo-badge ${claseTipo(orden.clienteTipo)}">${etiquetaTipo(orden.clienteTipo)}</span></div>
      </div>
      <div class="detalle-field">
        <div class="lbl">Estado</div>
        <div class="val"><span class="order-status ${claseEstado(orden.estado)}">${textoEstado(orden.estado)}</span></div>
      </div>
    </div>
    ${orden.observaciones ? `<div class="detalle-field" style="margin-bottom:16px;"><div class="lbl">Observaciones</div><div class="val">${orden.observaciones}</div></div>` : ''}
    <table class="detalle-items-table">
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
            <td style="font-weight:500;color:#3b82f6;">${it.cod_interno}</td>
            <td>${it.titulo}</td>
            <td>${formatearPrecio(it.precio_unitario)}</td>
            <td style="text-align:center;">${it.cantidad}</td>
            <td style="text-align:right;font-weight:600;">${formatearPrecio(it.subtotal || it.precio_unitario * it.cantidad)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div class="order-totals" style="margin-top:16px;">
      <div class="row"><span>Subtotal (sin IVA)</span><span>${formatearPrecio(orden.subtotal || 0)}</span></div>
      <div class="row"><span>IVA (19%)</span><span>${formatearPrecio(orden.iva || 0)}</span></div>
      <div class="row total"><span>Total</span><span>${formatearPrecio(orden.total || 0)}</span></div>
    </div>
  `;

  $('modalDetalleOrden').classList.add('active');
};

// ═══════════ FILTROS ═══════════
$('filtroTexto').addEventListener('input', aplicarFiltros);
$('filtroEstado').addEventListener('change', aplicarFiltros);

function aplicarFiltros() {
  const texto = $('filtroTexto').value.toLowerCase().trim();
  const estado = $('filtroEstado').value;

  let filtradas = todasLasOrdenes;

  if (estado) {
    filtradas = filtradas.filter(o => o.estado === estado);
  }

  if (texto) {
    filtradas = filtradas.filter(o =>
      (o.numero_orden || '').toLowerCase().includes(texto) ||
      (o.clienteNombre || '').toLowerCase().includes(texto) ||
      (o.clienteNit || '').toLowerCase().includes(texto)
    );
  }

  renderizarOrdenes(filtradas);
}

// ═══════════ MODAL 1: BUSCAR CLIENTE ═══════════
$('btnNuevaOrden').addEventListener('click', () => {
  $('inputBuscarCliente').value = '';
  $('clienteResultados').innerHTML = `
    <div class="client-searching" id="clienteEmpty">
      <i class="bi bi-people" style="font-size:36px;display:block;margin-bottom:8px;color:#cbd5e1;"></i>
      Los resultados aparecerán aquí
    </div>`;
  $('modalBuscarCliente').classList.add('active');
  setTimeout(() => $('inputBuscarCliente').focus(), 200);
});

$('cerrarModal1').addEventListener('click', () => {
  $('modalBuscarCliente').classList.remove('active');
});

$('inputBuscarCliente').addEventListener('input', (e) => {
  clearTimeout(debounceTimer);
  const q = e.target.value.trim();
  if (q.length < 3) {
    $('clienteResultados').innerHTML = `
      <div class="client-searching">
        <i class="bi bi-people" style="font-size:36px;display:block;margin-bottom:8px;color:#cbd5e1;"></i>
        Escribe al menos 3 caracteres
      </div>`;
    return;
  }
  debounceTimer = setTimeout(() => buscarCliente(q), 400);
});

async function buscarCliente(texto) {
  $('clienteResultados').innerHTML = `
    <div class="client-searching">
      <div class="spinner" style="width:28px;height:28px;margin:0 auto 8px;"></div>
      Buscando clientes...
    </div>`;

  try {
    const resultados = [];
    const textoUpper = texto.toUpperCase();
    const textoLower = texto.toLowerCase();

    // Buscar por NIT (prefijo)
    const qNit = query(
      collection(db, 'usuarios'),
      where('nit', '>=', textoUpper),
      where('nit', '<=', textoUpper + '\uf8ff'),
      where('estado', '==', 'aprobado'),
      limit(10)
    );

    // Note: Firestore no permite inequality filters en dos campos distintos
    // asi que buscamos por NIT y luego filtramos client-side, o buscamos por nombre
    // Opción: Buscar todos los aprobados y filtrar client-side (para sets pequeños)
    // Para escalabilidad, buscamos con dos queries separadas.

    // Query 1: Buscar aprobados y filtrar client-side por nombre/nit/razon_social
    const qAprobados = query(
      collection(db, 'usuarios'),
      where('estado', '==', 'aprobado'),
      limit(200)
    );

    const snap = await getDocs(qAprobados);
    snap.forEach(d => {
      const data = d.data();
      // No incluir vendedores ni admins
      if (data.rol === 'vendedor' || data.rol === 'administrador' || data.rol === 'gestor') return;

      const nombre = (data.nombre || '').toLowerCase();
      const nit = (data.nit || '').toLowerCase();
      const razon = (data.razon_social || '').toLowerCase();
      const email = (data.email || '').toLowerCase();

      if (nombre.includes(textoLower) || nit.includes(textoLower) || razon.includes(textoLower) || email.includes(textoLower)) {
        resultados.push({ uid: d.id, ...data });
      }
    });

    if (resultados.length === 0) {
      $('clienteResultados').innerHTML = `
        <div class="client-searching">
          <i class="bi bi-person-x" style="font-size:36px;display:block;margin-bottom:8px;color:#cbd5e1;"></i>
          No se encontraron clientes con "${texto}"
        </div>`;
      return;
    }

    $('clienteResultados').innerHTML = resultados.map(c => `
      <div class="client-card" data-uid="${c.uid}">
        <div class="client-avatar">${(c.nombre || 'C')[0].toUpperCase()}</div>
        <div class="client-data">
          <div class="name">${c.razon_social || c.nombre || c.email}</div>
          <div class="meta">
            <span><i class="bi bi-person"></i> ${c.nombre || '-'}</span>
            <span><i class="bi bi-hash"></i> NIT: ${c.nit || 'N/A'}</span>
            <span><i class="bi bi-geo-alt"></i> ${c.ciudad || '-'}</span>
          </div>
        </div>
        <span class="tipo-badge ${claseTipo(c.tipo_cliente)}">${etiquetaTipo(c.tipo_cliente)}</span>
      </div>
    `).join('');

    // Event listeners
    document.querySelectorAll('.client-card').forEach(card => {
      card.addEventListener('click', () => {
        const uid = card.dataset.uid;
        const cliente = resultados.find(c => c.uid === uid);
        if (cliente) seleccionarCliente(cliente);
      });
    });

  } catch (error) {
    console.error('Error buscando clientes:', error);
    $('clienteResultados').innerHTML = `
      <div class="client-searching" style="color:#ef4444;">
        <i class="bi bi-exclamation-triangle" style="font-size:36px;display:block;margin-bottom:8px;"></i>
        Error al buscar clientes
      </div>`;
  }
}

// ═══════════ SELECCIONAR CLIENTE ═══════════
function seleccionarCliente(cliente) {
  clienteSeleccionado = cliente;
  productosOrden = [];

  // Cerrar modal 1
  $('modalBuscarCliente').classList.remove('active');

  // Llenar datos en modal 2
  $('selClienteNombre').textContent = cliente.razon_social || cliente.nombre || cliente.email;
  $('selClienteNit').textContent = cliente.nit || 'N/A';
  const tipoBadge = $('selClienteTipo');
  tipoBadge.textContent = etiquetaTipo(cliente.tipo_cliente);
  tipoBadge.className = `tipo-badge ${claseTipo(cliente.tipo_cliente)}`;

  // Reset modal 2
  $('inputBuscarProducto').value = '';
  $('productoResultados').style.display = 'none';
  $('productoResultados').innerHTML = '';
  $('cartEmpty').style.display = 'block';
  $('cartTableWrapper').style.display = 'none';
  $('cartBody').innerHTML = '';
  $('cartCount').textContent = '0';
  $('ordenTotales').style.display = 'none';
  $('inputObservaciones').value = '';
  $('btnConfirmarOrden').disabled = true;

  // Abrir modal 2
  $('modalProductos').classList.add('active');
  setTimeout(() => $('inputBuscarProducto').focus(), 200);
}

// ═══════════ BUSCAR PRODUCTOS ═══════════
$('btnBuscarProd').addEventListener('click', () => {
  const t = $('inputBuscarProducto').value.trim();
  if (t) buscarProducto(t);
});

$('inputBuscarProducto').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const t = $('inputBuscarProducto').value.trim();
    if (t) buscarProducto(t);
  }
});

async function buscarProducto(termino) {
  const container = $('productoResultados');
  container.style.display = 'block';
  container.innerHTML = '<div style="text-align:center;padding:16px;color:#94a3b8;font-size:13px;"><div class="spinner" style="width:24px;height:24px;margin:0 auto 8px;"></div>Buscando...</div>';

  try {
    const resultados = [];
    const productosRef = collection(db, 'productos');

    // Buscar por cod_interno exacto
    const qCod = query(productosRef, where('cod_interno', '==', termino.toUpperCase()), limit(10));
    const snapCod = await getDocs(qCod);
    snapCod.forEach(d => resultados.push({ id: d.id, ...d.data() }));

    // Si no encontró, buscar por titulo
    if (resultados.length === 0) {
      const upper = termino.toUpperCase();
      const qTit = query(productosRef, where('titulo', '>=', upper), where('titulo', '<=', upper + '\uf8ff'), limit(15));
      const snapTit = await getDocs(qTit);
      snapTit.forEach(d => resultados.push({ id: d.id, ...d.data() }));
    }

    // Filtrar header rows
    const filtrados = resultados.filter(p => p.cod_interno !== 'COD_INTERNO' && p.titulo !== 'TITULO');

    if (filtrados.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:16px;color:#94a3b8;font-size:13px;">No se encontraron productos</div>';
      return;
    }

    const tipoCliente = clienteSeleccionado?.tipo_cliente || 'persona_natural';

    container.innerHTML = filtrados.map(p => {
      const precio = obtenerPrecioPorTipo(p, tipoCliente);
      const yaEnOrden = productosOrden.some(po => po.cod_interno === p.cod_interno);
      return `
        <div class="product-result-item" data-cod="${p.cod_interno}">
          <img src="${p.imagen_principal || 'img/placeholder.png'}" alt="" onerror="this.src='img/placeholder.png'">
          <div class="prod-info">
            <div class="prod-name">${p.titulo}</div>
            <div class="prod-sku">${p.cod_interno} · ${p.marca || ''}</div>
          </div>
          <div class="prod-price">${formatearPrecio(precio)}</div>
          <input type="number" class="qty-input-mini" value="1" min="1" data-cod="${p.cod_interno}">
          <button class="btn-add-prod" data-cod="${p.cod_interno}" ${yaEnOrden ? 'disabled style="background:#94a3b8;"' : ''}>
            ${yaEnOrden ? 'Agregado' : '+ Agregar'}
          </button>
        </div>
      `;
    }).join('');

    // Event: agregar producto
    container.querySelectorAll('.btn-add-prod').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const cod = btn.dataset.cod;
        const prod = filtrados.find(p => p.cod_interno === cod);
        const qtyInput = container.querySelector(`input[data-cod="${cod}"]`);
        const cantidad = parseInt(qtyInput?.value) || 1;
        if (prod) agregarProductoAOrden(prod, cantidad);
        btn.disabled = true;
        btn.style.background = '#94a3b8';
        btn.textContent = 'Agregado';
      });
    });

  } catch (error) {
    console.error('Error buscando productos:', error);
    container.innerHTML = '<div style="text-align:center;padding:16px;color:#ef4444;font-size:13px;">Error al buscar</div>';
  }
}

// ═══════════ CARRITO DE ORDEN ═══════════
function agregarProductoAOrden(producto, cantidad) {
  const tipoCliente = clienteSeleccionado?.tipo_cliente || 'persona_natural';
  const precio = obtenerPrecioPorTipo(producto, tipoCliente);

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

function eliminarProductoDeOrden(cod) {
  productosOrden = productosOrden.filter(p => p.cod_interno !== cod);
  renderizarCarrito();

  // Re-enable button in product results if visible
  const btn = document.querySelector(`.btn-add-prod[data-cod="${cod}"]`);
  if (btn) {
    btn.disabled = false;
    btn.style.background = '#10b981';
    btn.textContent = '+ Agregar';
  }
}

function cambiarCantidad(cod, delta) {
  const item = productosOrden.find(p => p.cod_interno === cod);
  if (!item) return;
  item.cantidad = Math.max(1, item.cantidad + delta);
  renderizarCarrito();
}

// Make functions global for inline onclick
window.eliminarProductoDeOrden = eliminarProductoDeOrden;
window.cambiarCantidad = cambiarCantidad;

function renderizarCarrito() {
  const count = productosOrden.length;
  $('cartCount').textContent = count;

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
          <div style="font-size:11px;color:#94a3b8;">${p.cod_interno}</div>
        </td>
        <td>${formatearPrecio(p.precio_unitario)}</td>
        <td style="text-align:center;">
          <div class="cart-qty-control">
            <button onclick="cambiarCantidad('${p.cod_interno}', -1)">-</button>
            <span>${p.cantidad}</span>
            <button onclick="cambiarCantidad('${p.cod_interno}', 1)">+</button>
          </div>
        </td>
        <td style="text-align:right;font-weight:600;">${formatearPrecio(sub)}</td>
        <td style="text-align:center;">
          <button class="btn-remove-item" onclick="eliminarProductoDeOrden('${p.cod_interno}')">
            <i class="bi bi-trash3"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  calcularTotales();
}

function calcularTotales() {
  const totalConIva = productosOrden.reduce((s, p) => s + p.precio_unitario * p.cantidad, 0);
  const subtotalSinIva = totalConIva / (1 + IVA_PORCENTAJE);
  const iva = totalConIva - subtotalSinIva;

  $('totalSubtotal').textContent = formatearPrecio(subtotalSinIva);
  $('totalIva').textContent = formatearPrecio(iva);
  $('totalGeneral').textContent = formatearPrecio(totalConIva);
}

// ═══════════ CONFIRMAR ORDEN ═══════════
$('btnConfirmarOrden').addEventListener('click', confirmarOrden);

async function confirmarOrden() {
  if (!clienteSeleccionado || productosOrden.length === 0) return;

  const btn = $('btnConfirmarOrden');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;display:inline-block;vertical-align:middle;margin-right:6px;border-width:2px;"></span> Creando orden...';

  try {
    const totalConIva = productosOrden.reduce((s, p) => s + p.precio_unitario * p.cantidad, 0);
    const subtotalSinIva = totalConIva / (1 + IVA_PORCENTAJE);
    const iva = totalConIva - subtotalSinIva;
    const cantUnidades = productosOrden.reduce((s, p) => s + p.cantidad, 0);

    const orden = {
      numero_orden: generarNumeroOrden(),
      user_id: clienteSeleccionado.uid,

      // Datos del cliente (para referencia rápida)
      clienteUid: clienteSeleccionado.uid,
      clienteNombre: clienteSeleccionado.razon_social || clienteSeleccionado.nombre || clienteSeleccionado.email,
      clienteNit: clienteSeleccionado.nit || '',
      clienteTipo: clienteSeleccionado.tipo_cliente || 'persona_natural',

      // Datos del cliente (formato legacy compatible)
      cliente: {
        email: clienteSeleccionado.email || '',
        nombre: clienteSeleccionado.nombre || '',
        telefono: clienteSeleccionado.telefono || '',
        tipo_cliente: clienteSeleccionado.tipo_cliente || '',
        razon_social: clienteSeleccionado.razon_social || '',
        nit: clienteSeleccionado.nit || ''
      },

      // Dirección de entrega (usa datos del cliente)
      direccion_entrega: {
        direccion: clienteSeleccionado.direccion || '',
        ciudad: clienteSeleccionado.ciudad || '',
        departamento: clienteSeleccionado.departamento || '',
        contacto: clienteSeleccionado.nombre || '',
        telefono_contacto: clienteSeleccionado.telefono || ''
      },

      // Vendedor
      creadaPor: vendedorUser.uid,
      creadaPorNombre: vendedorPerfil.nombre || vendedorUser.email,
      creadaPorEmail: vendedorUser.email,
      tipo: 'orden-vendedor',

      // Productos
      productos: productosOrden.map(p => ({
        cod_interno: p.cod_interno,
        titulo: p.titulo,
        marca: p.marca,
        imagen: p.imagen,
        precio_unitario: p.precio_unitario,
        cantidad: p.cantidad,
        subtotal: p.precio_unitario * p.cantidad
      })),

      // Alias para compatibilidad con admin
      items: productosOrden.map(p => ({
        cod_interno: p.cod_interno,
        titulo: p.titulo,
        marca: p.marca,
        imagen: p.imagen,
        precio_unitario: p.precio_unitario,
        cantidad: p.cantidad,
        subtotal: p.precio_unitario * p.cantidad
      })),

      // Totales
      subtotal: subtotalSinIva,
      iva: iva,
      total: totalConIva,
      cantidad_productos: productosOrden.length,
      cantidad_unidades: cantUnidades,

      // Estado
      estado: 'pendiente',
      observaciones: $('inputObservaciones').value.trim(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),

      historial: [{
        estado: 'pendiente',
        fecha: new Date().toISOString(),
        nota: `Orden creada por vendedor: ${vendedorPerfil.nombre || vendedorUser.email}`
      }]
    };

    await addDoc(collection(db, 'ordenes'), orden);

    // Cerrar modal y recargar
    $('modalProductos').classList.remove('active');
    showToast(`Orden ${orden.numero_orden} creada exitosamente`, 'success');

    // Reset
    clienteSeleccionado = null;
    productosOrden = [];

    await cargarOrdenesVendedor();

  } catch (error) {
    console.error('Error creando orden:', error);
    showToast('Error al crear la orden: ' + error.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-check2-circle"></i> Confirmar Orden';
  }
}

// ═══════════ MODAL CONTROLS ═══════════
$('cerrarModal2').addEventListener('click', () => {
  $('modalProductos').classList.remove('active');
});

$('btnCancelarOrden').addEventListener('click', () => {
  $('modalProductos').classList.remove('active');
});

$('cerrarModal3').addEventListener('click', () => {
  $('modalDetalleOrden').classList.remove('active');
});

// Cerrar modales con click en overlay
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('active');
    }
  });
});

// Cerrar con Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
  }
});
