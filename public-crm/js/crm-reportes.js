/**
 * ============================================
 * CRM REPORTES - ENAR
 * ============================================
 * 4 tabs: General, Ventas, Inventario, Inteligencia Clientes
 * Charts (Chart.js), métricas, recommendation engine
 * ============================================
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getFirestore, collection, doc, getDoc, getDocs, query, where, orderBy
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
  getAuth, onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

import {
  $, ADMIN_EMAIL, ESTADOS_ORDEN_LABELS,
  formatearPrecio, formatearFecha, formatearNumero,
  badgeSalud, badgeABC, badgeRiesgo, badgeTendencia, badgeEstado,
  showToast, debounce, buscarMultiCampo, mostrarLoader
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
let ordenes = [];
let metricas = [];
let productos = [];
let vendedoresMap = {}; // uid → { nombre, email }
let charts = {};

function toDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (val.toDate) return val.toDate();
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

const COLORES_ESTADO = {
  pendiente: '#fbbf24', aprobada: '#60a5fa', en_proceso: '#818cf8',
  en_espera: '#c084fc', completada: '#34d399', parcial: '#fb923c', cancelada: '#f87171'
};

// ═══════════ AUTH ═══════════
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }

  try {
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

    await cargarDatos();

    $('loadingScreen').style.display = 'none';
    $('mainContent').style.display = 'block';

    renderGeneral();
    initTabs();
    initFiltros();
  } catch (error) {
    console.error('Error en auth:', error);
    showToast('Error al verificar acceso', 'error');
  }
});

$('btnLogout').addEventListener('click', async () => {
  await signOut(auth);
  window.location.href = 'index.html';
});

// ═══════════ CARGAR DATOS ═══════════
async function cargarDatos() {
  try {
    const [ordenesSnap, metricasSnap, productosSnap, vendedoresSnap] = await Promise.all([
      getDocs(query(collection(db, 'ordenes'), orderBy('created_at', 'desc'))),
      getDocs(collection(db, 'metricas_clientes')),
      getDocs(collection(db, 'productos')),
      getDocs(query(collection(db, 'usuarios'), where('rol', 'in', ['vendedor', 'admin'])))
    ]);

    ordenes = [];
    ordenesSnap.forEach(d => ordenes.push({ id: d.id, ...d.data() }));

    metricas = [];
    metricasSnap.forEach(d => metricas.push({ id: d.id, ...d.data() }));

    productos = [];
    productosSnap.forEach(d => {
      const data = d.data();
      if (data.activo !== false) productos.push({ id: d.id, ...data });
    });

    vendedoresMap = {};
    vendedoresSnap.forEach(d => {
      const data = d.data();
      vendedoresMap[d.id] = { nombre: data.nombre || data.email, email: data.email };
    });
  } catch (error) {
    console.error('Error cargando datos:', error);
    showToast('Error al cargar datos', 'error');
  }
}

// ═══════════ TABS ═══════════
function initTabs() {
  document.querySelectorAll('.crm-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.crm-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.crm-tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');

      const panelId = `panel${tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1)}`;
      $(panelId)?.classList.add('active');

      switch (tab.dataset.tab) {
        case 'general': renderGeneral(); break;
        case 'ventas': renderVentas(); break;
        case 'inventario': renderInventario(); break;
        case 'inteligencia': renderInteligencia(); break;
      }
    });
  });
}

function initFiltros() {
  $('filtroPeriodoVentas')?.addEventListener('change', () => renderVentas());
  $('filtroABCInteligencia')?.addEventListener('change', () => renderTablaInteligencia());
  $('filtroRiesgoInteligencia')?.addEventListener('change', () => renderTablaInteligencia());
  $('filtroBusquedaInteligencia')?.addEventListener('input', debounce(() => renderTablaInteligencia(), 400));
}

// ═══════════ TAB 1: GENERAL ═══════════
function renderGeneral() {
  const ahora = new Date();
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);

  const ordenesValidas = ordenes.filter(o => o.estado !== 'cancelada');
  const totalVentas = ordenesValidas.reduce((s, o) => s + (o.total || 0), 0);
  const ticketPromedio = ordenesValidas.length > 0 ? totalVentas / ordenesValidas.length : 0;
  const clientesActivos = metricas.filter(m => m.estado_salud === 'Saludable').length;

  $('kpisGeneral').innerHTML = `
    <div class="crm-kpi crm-kpi--green">
      <div class="crm-kpi-label">Total Ventas</div>
      <div class="crm-kpi-value">${formatearPrecio(totalVentas)}</div>
    </div>
    <div class="crm-kpi">
      <div class="crm-kpi-label">Total Órdenes</div>
      <div class="crm-kpi-value">${formatearNumero(ordenes.length)}</div>
    </div>
    <div class="crm-kpi crm-kpi--purple">
      <div class="crm-kpi-label">Ticket Promedio</div>
      <div class="crm-kpi-value">${formatearPrecio(ticketPromedio)}</div>
    </div>
    <div class="crm-kpi crm-kpi--yellow">
      <div class="crm-kpi-label">Clientes Activos</div>
      <div class="crm-kpi-value">${clientesActivos}</div>
    </div>
  `;

  // Chart: Ventas por Mes (bar)
  const ventasPorMes = [];
  for (let i = 5; i >= 0; i--) {
    const inicio = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    const fin = new Date(ahora.getFullYear(), ahora.getMonth() - i + 1, 0, 23, 59, 59);
    const ventas = ordenesValidas
      .filter(o => { const f = toDate(o.created_at); return f && f >= inicio && f <= fin; })
      .reduce((s, o) => s + (o.total || 0), 0);
    ventasPorMes.push({
      label: inicio.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' }),
      ventas
    });
  }

  renderChart('chartVentasGeneral', 'bar', {
    labels: ventasPorMes.map(v => v.label),
    datasets: [{
      label: 'Ventas',
      data: ventasPorMes.map(v => v.ventas),
      backgroundColor: 'rgba(59, 130, 246, 0.7)',
      borderColor: '#3b82f6',
      borderWidth: 1,
      borderRadius: 6
    }]
  }, {
    scales: { y: { beginAtZero: true, ticks: { callback: v => formatearPrecio(v) } } },
    plugins: { legend: { display: false } }
  });

  // Chart: Distribución Estados (doughnut)
  const estadoCounts = {};
  ordenes.forEach(o => { estadoCounts[o.estado] = (estadoCounts[o.estado] || 0) + 1; });

  renderChart('chartEstados', 'doughnut', {
    labels: Object.keys(estadoCounts).map(k => ESTADOS_ORDEN_LABELS[k] || k),
    datasets: [{
      data: Object.values(estadoCounts),
      backgroundColor: Object.keys(estadoCounts).map(k => COLORES_ESTADO[k] || '#94a3b8')
    }]
  });

  // Chart: Top 10 Productos (horizontal bar)
  const prodVentas = {};
  ordenesValidas.forEach(o => {
    (o.items || o.productos || []).forEach(item => {
      const key = item.cod_interno || item.sku || item.titulo || item.nombre;
      const nombre = item.titulo || item.nombre || key;
      if (!prodVentas[key]) prodVentas[key] = { nombre, total: 0 };
      prodVentas[key].total += (item.precio_unitario || 0) * (item.cantidad || 0);
    });
  });

  const top10 = Object.values(prodVentas).sort((a, b) => b.total - a.total).slice(0, 10);

  renderChart('chartTopProductos', 'bar', {
    labels: top10.map(p => p.nombre.length > 25 ? p.nombre.substring(0, 25) + '...' : p.nombre),
    datasets: [{
      label: 'Revenue',
      data: top10.map(p => p.total),
      backgroundColor: 'rgba(16, 185, 129, 0.7)',
      borderColor: '#10b981',
      borderWidth: 1,
      borderRadius: 4
    }]
  }, {
    indexAxis: 'y',
    scales: { x: { beginAtZero: true, ticks: { callback: v => formatearPrecio(v) } } },
    plugins: { legend: { display: false } }
  });
}

// ═══════════ TAB 2: VENTAS ═══════════
function renderVentas() {
  const periodo = $('filtroPeriodoVentas')?.value || 'todo';
  const ahora = new Date();
  let fechaInicio;

  switch (periodo) {
    case 'mes': fechaInicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1); break;
    case 'trimestre': fechaInicio = new Date(ahora.getFullYear(), ahora.getMonth() - 3, 1); break;
    case 'anio': fechaInicio = new Date(ahora.getFullYear(), 0, 1); break;
    default: fechaInicio = null;
  }

  const ordenesPeriodo = ordenes.filter(o => {
    if (o.estado === 'cancelada') return false;
    if (!fechaInicio) return true;
    const f = toDate(o.created_at);
    return f && f >= fechaInicio;
  });

  const totalVentas = ordenesPeriodo.reduce((s, o) => s + (o.total || 0), 0);
  const ticketPromedio = ordenesPeriodo.length > 0 ? totalVentas / ordenesPeriodo.length : 0;

  // Ventas por vendedor
  const ventasPorVendedor = {};
  ordenesPeriodo.forEach(o => {
    const uid = o.creadaPor || o.creado_por || 'desconocido';
    if (!ventasPorVendedor[uid]) {
      const v = vendedoresMap[uid] || {};
      ventasPorVendedor[uid] = { nombre: v.nombre || o.creadaPorNombre || o.creadaPorEmail || uid.substring(0, 12), count: 0, total: 0 };
    }
    ventasPorVendedor[uid].count++;
    ventasPorVendedor[uid].total += o.total || 0;
  });

  const vendedores = Object.values(ventasPorVendedor).sort((a, b) => b.total - a.total);

  $('kpisVentas').innerHTML = `
    <div class="crm-kpi crm-kpi--green">
      <div class="crm-kpi-label">Total Ventas</div>
      <div class="crm-kpi-value">${formatearPrecio(totalVentas)}</div>
    </div>
    <div class="crm-kpi">
      <div class="crm-kpi-label">Órdenes</div>
      <div class="crm-kpi-value">${formatearNumero(ordenesPeriodo.length)}</div>
    </div>
    <div class="crm-kpi crm-kpi--purple">
      <div class="crm-kpi-label">Ticket Promedio</div>
      <div class="crm-kpi-value">${formatearPrecio(ticketPromedio)}</div>
    </div>
    <div class="crm-kpi crm-kpi--yellow">
      <div class="crm-kpi-label">Vendedores Activos</div>
      <div class="crm-kpi-value">${vendedores.length}</div>
    </div>
  `;

  // Chart: Ventas por Vendedor (bar)
  renderChart('chartVentasVendedor', 'bar', {
    labels: vendedores.map(v => v.nombre),
    datasets: [{
      label: 'Ventas',
      data: vendedores.map(v => v.total),
      backgroundColor: 'rgba(139, 92, 246, 0.7)',
      borderColor: '#8b5cf6',
      borderWidth: 1,
      borderRadius: 4
    }]
  }, {
    scales: { y: { beginAtZero: true, ticks: { callback: v => formatearPrecio(v) } } },
    plugins: { legend: { display: false } }
  });

  // Table: Detalle por vendedor
  $('tablaVentasVendedor').innerHTML = vendedores.length === 0
    ? '<p style="color:var(--crm-text-light);font-size:0.85rem;padding:12px;">Sin ventas en este período</p>'
    : `
    <div class="crm-tabla-wrapper">
      <table class="crm-tabla">
        <thead>
          <tr><th>Vendedor</th><th style="text-align:center;">Órdenes</th><th style="text-align:right;">Total</th><th style="text-align:right;">Ticket Prom.</th></tr>
        </thead>
        <tbody>
          ${vendedores.map(v => `
            <tr>
              <td style="font-weight:500;">${v.nombre}</td>
              <td style="text-align:center;">${v.count}</td>
              <td style="text-align:right;font-weight:600;">${formatearPrecio(v.total)}</td>
              <td style="text-align:right;">${formatearPrecio(v.count > 0 ? v.total / v.count : 0)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ═══════════ TAB 3: INVENTARIO ═══════════
function renderInventario() {
  const conStock = productos.filter(p => p.Stock_Actual !== undefined);
  const stockBajo = conStock.filter(p => (p.Stock_Actual || 0) <= (p.Stock_Minimo || 0) && (p.Stock_Actual || 0) >= 0);
  const totalActivos = productos.filter(p => p.activo !== false).length;

  // ABC distribution
  const abcCounts = { A: 0, B: 0, C: 0, SV: 0 };
  productos.forEach(p => {
    const abc = p.Clasificacion_ABC;
    if (abcCounts[abc] !== undefined) abcCounts[abc]++;
  });

  $('kpisInventario').innerHTML = `
    <div class="crm-kpi">
      <div class="crm-kpi-label">Total Productos</div>
      <div class="crm-kpi-value">${formatearNumero(totalActivos)}</div>
    </div>
    <div class="crm-kpi crm-kpi--red">
      <div class="crm-kpi-label">Stock Bajo</div>
      <div class="crm-kpi-value">${stockBajo.length}</div>
    </div>
    <div class="crm-kpi crm-kpi--green">
      <div class="crm-kpi-label">Clase A</div>
      <div class="crm-kpi-value">${abcCounts.A}</div>
    </div>
    <div class="crm-kpi crm-kpi--yellow">
      <div class="crm-kpi-label">Sin Ventas</div>
      <div class="crm-kpi-value">${abcCounts.SV}</div>
    </div>
  `;

  // Chart: ABC Distribución (pie)
  renderChart('chartABCProductos', 'pie', {
    labels: ['A (Alto Valor)', 'B (Medio)', 'C (Bajo)', 'SV (Sin Ventas)'],
    datasets: [{
      data: [abcCounts.A, abcCounts.B, abcCounts.C, abcCounts.SV],
      backgroundColor: ['#3b82f6', '#34d399', '#fbbf24', '#cbd5e1']
    }]
  });

  // Stock Bajo lista
  const stockBajoOrdenado = stockBajo.sort((a, b) => (a.Stock_Actual || 0) - (b.Stock_Actual || 0)).slice(0, 15);
  $('stockBajoLista').innerHTML = stockBajoOrdenado.length === 0
    ? '<p style="color:var(--crm-text-light);font-size:0.82rem;">Sin productos con stock bajo</p>'
    : stockBajoOrdenado.map(p => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--crm-border);font-size:0.82rem;">
        <div>
          <div style="font-weight:500;">${p.titulo || p.Nombre_Producto || p.SKU || '-'}</div>
          <div style="font-size:0.73rem;color:var(--crm-text-light);">${p.SKU || p.cod_interno || '-'}</div>
        </div>
        <div style="text-align:right;">
          <span style="color:var(--crm-red);font-weight:600;">${p.Stock_Actual || 0}</span>
          <span style="color:var(--crm-text-light);font-size:0.73rem;"> / ${p.Stock_Minimo || 0} min</span>
        </div>
      </div>
    `).join('');

  // Top productos por revenue
  const prodVentas = {};
  ordenes.filter(o => o.estado !== 'cancelada').forEach(o => {
    (o.items || o.productos || []).forEach(item => {
      const key = item.cod_interno || item.sku;
      if (!key) return;
      if (!prodVentas[key]) prodVentas[key] = { nombre: item.titulo || item.nombre || key, total: 0, cantidad: 0 };
      prodVentas[key].total += (item.precio_unitario || 0) * (item.cantidad || 0);
      prodVentas[key].cantidad += item.cantidad || 0;
    });
  });

  const topProds = Object.entries(prodVentas).sort((a, b) => b[1].total - a[1].total).slice(0, 20);
  $('tablaInventario').innerHTML = topProds.length === 0
    ? '<p style="color:var(--crm-text-light);font-size:0.85rem;">Sin datos de ventas</p>'
    : `
    <div class="crm-tabla-wrapper">
      <table class="crm-tabla">
        <thead>
          <tr><th>Código</th><th>Producto</th><th style="text-align:center;">Unid. Vendidas</th><th style="text-align:right;">Revenue</th><th>ABC</th></tr>
        </thead>
        <tbody>
          ${topProds.map(([cod, p]) => {
            const prodInfo = buscarProducto(cod);
            return `
              <tr>
                <td style="font-weight:500;color:var(--crm-primary-light);">${cod}</td>
                <td>${p.nombre}</td>
                <td style="text-align:center;">${formatearNumero(p.cantidad)}</td>
                <td style="text-align:right;font-weight:600;">${formatearPrecio(p.total)}</td>
                <td>${badgeABC(prodInfo?.Clasificacion_ABC)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function buscarProducto(cod) {
  return productos.find(p => p.SKU === cod || p.cod_interno === cod);
}

// ═══════════ TAB 4: INTELIGENCIA CLIENTES ═══════════
function renderInteligencia() {
  const saludables = metricas.filter(m => m.estado_salud === 'Saludable').length;
  const enRiesgo = metricas.filter(m => m.estado_salud === 'En_Riesgo').length;
  const inactivos = metricas.filter(m => m.estado_salud === 'Inactivo').length;
  const tasaRetencion = metricas.length > 0
    ? Math.round((saludables / metricas.length) * 100) : 0;

  $('kpisInteligencia').innerHTML = `
    <div class="crm-kpi crm-kpi--green">
      <div class="crm-kpi-label">Saludables</div>
      <div class="crm-kpi-value">${saludables}</div>
    </div>
    <div class="crm-kpi crm-kpi--yellow">
      <div class="crm-kpi-label">En Riesgo</div>
      <div class="crm-kpi-value">${enRiesgo}</div>
    </div>
    <div class="crm-kpi crm-kpi--red">
      <div class="crm-kpi-label">Inactivos</div>
      <div class="crm-kpi-value">${inactivos}</div>
    </div>
    <div class="crm-kpi crm-kpi--purple">
      <div class="crm-kpi-label">Tasa Retención</div>
      <div class="crm-kpi-value">${tasaRetencion}%</div>
    </div>
  `;

  // Chart: ABC Distribución de Clientes
  const abcCounts = { A: 0, B: 0, C: 0, SV: 0 };
  metricas.forEach(m => {
    if (abcCounts[m.clasificacion_abc] !== undefined) abcCounts[m.clasificacion_abc]++;
  });

  renderChart('chartABC', 'doughnut', {
    labels: ['A (Premium)', 'B (Regular)', 'C (Básico)', 'SV (Sin Ventas)'],
    datasets: [{
      data: [abcCounts.A, abcCounts.B, abcCounts.C, abcCounts.SV],
      backgroundColor: ['#3b82f6', '#34d399', '#fbbf24', '#cbd5e1']
    }]
  });

  // Recomendaciones
  const recomendaciones = generarRecomendaciones();
  $('recomendaciones').innerHTML = recomendaciones.length === 0
    ? '<p style="color:var(--crm-text-light);font-size:0.85rem;">Sin recomendaciones</p>'
    : recomendaciones.map(r => `
      <div style="padding:10px;margin-bottom:8px;border-radius:8px;background:${r.bg};border-left:4px solid ${r.color};font-size:0.82rem;">
        <strong>${r.codigo}</strong>: ${r.titulo}<br>
        <span style="color:var(--crm-text-light);">${r.clientes} clientes · ${r.accion}</span>
      </div>
    `).join('');

  renderTablaInteligencia();
}

function renderTablaInteligencia() {
  const filtroABC = $('filtroABCInteligencia')?.value || '';
  const filtroRiesgo = $('filtroRiesgoInteligencia')?.value || '';
  const filtroBusqueda = $('filtroBusquedaInteligencia')?.value || '';

  let clientesAccion = metricas
    .filter(m => m.riesgo_abandono === 'Alto' || m.estado_salud === 'En_Riesgo' || m.estado_salud === 'Inactivo')
    .sort((a, b) => (b.dias_sin_compra || 0) - (a.dias_sin_compra || 0));

  if (filtroABC) {
    clientesAccion = clientesAccion.filter(m => m.clasificacion_abc === filtroABC);
  }
  if (filtroRiesgo) {
    clientesAccion = clientesAccion.filter(m => m.riesgo_abandono === filtroRiesgo);
  }
  if (filtroBusqueda && filtroBusqueda.trim()) {
    clientesAccion = buscarMultiCampo(clientesAccion, filtroBusqueda, ['nombre_cliente', 'sheets_id_cliente']);
  }

  // Assign action codes
  clientesAccion.forEach(m => {
    m._accion = asignarAccion(m);
  });

  $('tablaInteligencia').innerHTML = clientesAccion.length === 0
    ? '<p style="color:var(--crm-text-light);font-size:0.85rem;padding:12px;">Sin clientes con acción requerida</p>'
    : `
    <div class="crm-tabla-wrapper">
      <table class="crm-tabla">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Salud</th>
            <th>ABC</th>
            <th>Riesgo</th>
            <th>Tendencia</th>
            <th>Días s/compra</th>
            <th>Acción Sugerida</th>
          </tr>
        </thead>
        <tbody>
          ${clientesAccion.slice(0, 50).map(m => `
            <tr>
              <td style="font-weight:500;">${m.nombre_cliente || m.sheets_id_cliente || m.id.substring(0, 12)}</td>
              <td>${badgeSalud(m.estado_salud)}</td>
              <td>${badgeABC(m.clasificacion_abc)}</td>
              <td>${badgeRiesgo(m.riesgo_abandono)}</td>
              <td>${badgeTendencia(m.tendencia)}</td>
              <td style="font-weight:600;color:${(m.dias_sin_compra || 0) > 60 ? 'var(--crm-red)' : 'var(--crm-text)'}">${m.dias_sin_compra || 0}</td>
              <td><span style="font-size:0.78rem;padding:2px 8px;border-radius:4px;background:${m._accion?.bg || '#f1f5f9'};color:${m._accion?.color || '#64748b'};">${m._accion?.titulo || '-'}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ═══════════ RECOMMENDATION ENGINE ═══════════
// Translated from GAS Reportes.js lines 96-165

function asignarAccion(metrica) {
  const abc = metrica.clasificacion_abc;
  const riesgo = metrica.riesgo_abandono;
  const tendencia = metrica.tendencia;
  const esVIP = abc === 'A' || abc === 'B';

  // Primera compra (frecuencia = 0 or very few orders)
  if ((metrica.frecuencia_compra_dias || 0) === 0 || (metrica.total_compras_anio || 0) <= 1) {
    if (riesgo === 'Bajo') return { codigo: 'PC01', titulo: 'Bienvenida', bg: '#dbeafe', color: '#3b82f6' };
    if (riesgo === 'Medio') return { codigo: 'PC02', titulo: 'Incentivar 2da compra', bg: '#fef3c7', color: '#f59e0b' };
    if (riesgo === 'Alto') return { codigo: 'PC03', titulo: 'Indagar motivos', bg: '#fee2e2', color: '#ef4444' };
  }

  // VIP clients
  if (esVIP) {
    if (riesgo === 'Alto') return { codigo: 'CV01', titulo: 'Retención urgente', bg: '#fee2e2', color: '#dc2626' };
    if (tendencia === 'Decreciente') return { codigo: 'CV02', titulo: 'Plan recuperación', bg: '#ffedd5', color: '#f97316' };
    if (tendencia === 'Creciente') return { codigo: 'CV03', titulo: 'Fidelización', bg: '#d1fae5', color: '#10b981' };
    return { codigo: 'CV04', titulo: 'Mantener relación', bg: '#f1f5f9', color: '#64748b' };
  }

  // Standard clients (C)
  if (riesgo === 'Alto') return { codigo: 'CE01', titulo: 'Contacto preventivo', bg: '#fef3c7', color: '#f59e0b' };
  return { codigo: 'CE02', titulo: 'Seguimiento estándar', bg: '#f1f5f9', color: '#64748b' };
}

function generarRecomendaciones() {
  const recomendaciones = [];
  const acciones = {};

  metricas.forEach(m => {
    const accion = asignarAccion(m);
    if (!acciones[accion.codigo]) {
      acciones[accion.codigo] = { ...accion, clientes: 0, accion: '' };
    }
    acciones[accion.codigo].clientes++;
  });

  // Set action descriptions
  const descripciones = {
    PC01: 'Enviar kit de bienvenida',
    PC02: 'Ofrecer descuento en siguiente pedido',
    PC03: 'Llamar para entender barreras de recompra',
    CV01: 'Contacto inmediato con oferta personalizada',
    CV02: 'Visita comercial + análisis de competencia',
    CV03: 'Premiar lealtad + cross-selling',
    CV04: 'Mantener comunicación periódica',
    CE01: 'Llamada de seguimiento + catálogo actualizado',
    CE02: 'Email con novedades + promociones'
  };

  Object.values(acciones).forEach(a => {
    a.accion = descripciones[a.codigo] || '';
    if (a.clientes > 0) recomendaciones.push(a);
  });

  return recomendaciones.sort((a, b) => {
    // Priority: CV01 > PC03 > CV02 > CE01 > PC02 > CV03 > PC01 > CE02 > CV04
    const priority = { CV01: 1, PC03: 2, CV02: 3, CE01: 4, PC02: 5, CV03: 6, PC01: 7, CE02: 8, CV04: 9 };
    return (priority[a.codigo] || 99) - (priority[b.codigo] || 99);
  });
}

// ═══════════ CHART HELPER ═══════════
function renderChart(canvasId, type, data, extraOptions = {}) {
  if (charts[canvasId]) charts[canvasId].destroy();
  const canvas = $(canvasId);
  if (!canvas) return;

  charts[canvasId] = new Chart(canvas, {
    type,
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: ['doughnut', 'pie'].includes(type) ? 'bottom' : 'top',
          labels: { font: { family: 'Poppins', size: 11 } }
        }
      },
      ...extraOptions
    }
  });
}
