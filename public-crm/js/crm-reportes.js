/**
 * ============================================
 * CRM REPORTES - ENAR
 * ============================================
 * 4 tabs: General, Ventas, Inventario, Inteligencia Clientes
 * Gráficos con Chart.js, métricas pre-calculadas, recomendaciones
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
  showToast, mostrarLoader
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
let charts = {};

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

  await cargarDatos();

  $('loadingScreen').style.display = 'none';
  $('mainContent').style.display = 'block';

  renderGeneral();
  initTabs();
});

$('btnLogout').addEventListener('click', async () => {
  await signOut(auth);
  window.location.href = '/login.html';
});

// ═══════════ CARGAR DATOS ═══════════
async function cargarDatos() {
  try {
    const [ordenesSnap, metricasSnap, productosSnap] = await Promise.all([
      getDocs(query(collection(db, 'ordenes'), orderBy('created_at', 'desc'))),
      getDocs(collection(db, 'metricas_clientes')),
      getDocs(collection(db, 'productos'))
    ]);

    ordenes = [];
    ordenesSnap.forEach(d => ordenes.push({ id: d.id, ...d.data() }));

    metricas = [];
    metricasSnap.forEach(d => metricas.push({ id: d.id, ...d.data() }));

    productos = [];
    productosSnap.forEach(d => productos.push({ id: d.id, ...d.data() }));
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

      // Render tab content
      switch (tab.dataset.tab) {
        case 'general': renderGeneral(); break;
        case 'ventas': renderVentas(); break;
        case 'inventario': renderInventario(); break;
        case 'inteligencia': renderInteligencia(); break;
      }
    });
  });
}

// ═══════════ TAB: GENERAL ═══════════
function renderGeneral() {
  const ahora = new Date();
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);

  const totalOrdenes = ordenes.length;
  const pendientes = ordenes.filter(o => o.estado === 'pendiente').length;
  const ventasMes = ordenes
    .filter(o => o.created_at && new Date(o.created_at) >= inicioMes && o.estado !== 'cancelada')
    .reduce((s, o) => s + (o.total || 0), 0);
  const clientesRiesgo = metricas.filter(m => m.riesgo_abandono === 'Alto').length;

  $('kpisGeneral').innerHTML = `
    <div class="crm-kpi">
      <div class="crm-kpi-label">Total Órdenes</div>
      <div class="crm-kpi-value">${formatearNumero(totalOrdenes)}</div>
    </div>
    <div class="crm-kpi crm-kpi--yellow">
      <div class="crm-kpi-label">Pendientes</div>
      <div class="crm-kpi-value">${pendientes}</div>
    </div>
    <div class="crm-kpi crm-kpi--green">
      <div class="crm-kpi-label">Ventas del Mes</div>
      <div class="crm-kpi-value">${formatearPrecio(ventasMes)}</div>
    </div>
    <div class="crm-kpi crm-kpi--red">
      <div class="crm-kpi-label">Clientes en Riesgo</div>
      <div class="crm-kpi-value">${clientesRiesgo}</div>
    </div>
  `;

  // Chart: Distribución estados
  const estadoCounts = {};
  ordenes.forEach(o => {
    estadoCounts[o.estado] = (estadoCounts[o.estado] || 0) + 1;
  });

  const coloresEstado = {
    pendiente: '#fbbf24',
    aprobada: '#60a5fa',
    en_proceso: '#818cf8',
    en_espera: '#c084fc',
    completada: '#34d399',
    parcial: '#fb923c',
    cancelada: '#f87171'
  };

  renderChart('chartEstados', 'doughnut', {
    labels: Object.keys(estadoCounts).map(k => ESTADOS_ORDEN_LABELS[k] || k),
    datasets: [{
      data: Object.values(estadoCounts),
      backgroundColor: Object.keys(estadoCounts).map(k => coloresEstado[k] || '#94a3b8')
    }]
  });

  // Chart: Salud clientes
  const saludCounts = { Saludable: 0, En_Riesgo: 0, Inactivo: 0 };
  metricas.forEach(m => {
    if (saludCounts[m.estado_salud] !== undefined) saludCounts[m.estado_salud]++;
  });

  renderChart('chartSalud', 'doughnut', {
    labels: ['Saludable', 'En Riesgo', 'Inactivo'],
    datasets: [{
      data: [saludCounts.Saludable, saludCounts.En_Riesgo, saludCounts.Inactivo],
      backgroundColor: ['#34d399', '#fbbf24', '#f87171']
    }]
  });
}

// ═══════════ TAB: VENTAS ═══════════
function renderVentas() {
  const ahora = new Date();
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);

  const ordenesValidas = ordenes.filter(o => o.estado !== 'cancelada');
  const ventasMes = ordenesValidas
    .filter(o => o.created_at && new Date(o.created_at) >= inicioMes)
    .reduce((s, o) => s + (o.total || 0), 0);
  const ticketPromedio = ordenesValidas.length > 0
    ? ordenesValidas.reduce((s, o) => s + (o.total || 0), 0) / ordenesValidas.length : 0;

  // Ventas por mes (últimos 6)
  const ventasPorMes = [];
  for (let i = 5; i >= 0; i--) {
    const fecha = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    const finMes = new Date(ahora.getFullYear(), ahora.getMonth() - i + 1, 0, 23, 59, 59);
    const ventas = ordenesValidas
      .filter(o => o.created_at && new Date(o.created_at) >= fecha && new Date(o.created_at) <= finMes)
      .reduce((s, o) => s + (o.total || 0), 0);
    const nombre = fecha.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' });
    ventasPorMes.push({ nombre, ventas });
  }

  // Tendencia
  let tendencia = 'Estable';
  let cambio = 0;
  if (ventasPorMes.length >= 2) {
    const actual = ventasPorMes[ventasPorMes.length - 1].ventas;
    const anterior = ventasPorMes[ventasPorMes.length - 2].ventas;
    if (anterior > 0) {
      cambio = ((actual - anterior) / anterior) * 100;
      if (cambio > 5) tendencia = 'Creciente';
      else if (cambio < -5) tendencia = 'Decreciente';
    }
  }

  $('kpisVentas').innerHTML = `
    <div class="crm-kpi crm-kpi--green">
      <div class="crm-kpi-label">Ventas del Mes</div>
      <div class="crm-kpi-value">${formatearPrecio(ventasMes)}</div>
    </div>
    <div class="crm-kpi">
      <div class="crm-kpi-label">Ticket Promedio</div>
      <div class="crm-kpi-value">${formatearPrecio(ticketPromedio)}</div>
    </div>
    <div class="crm-kpi">
      <div class="crm-kpi-label">Órdenes Válidas</div>
      <div class="crm-kpi-value">${formatearNumero(ordenesValidas.length)}</div>
    </div>
    <div class="crm-kpi ${cambio > 0 ? 'crm-kpi--green' : cambio < 0 ? 'crm-kpi--red' : ''}">
      <div class="crm-kpi-label">Tendencia</div>
      <div class="crm-kpi-value">${cambio >= 0 ? '+' : ''}${cambio.toFixed(1)}%</div>
      <div class="crm-kpi-sub">${tendencia}</div>
    </div>
  `;

  // Chart ventas/mes
  renderChart('chartVentasMes', 'bar', {
    labels: ventasPorMes.map(v => v.nombre),
    datasets: [{
      label: 'Ventas',
      data: ventasPorMes.map(v => v.ventas),
      backgroundColor: 'rgba(59, 130, 246, 0.7)',
      borderColor: '#3b82f6',
      borderWidth: 1,
      borderRadius: 4
    }]
  }, {
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: v => formatearPrecio(v)
        }
      }
    }
  });

  // Top productos
  const prodVentas = {};
  ordenesValidas.forEach(o => {
    (o.items || o.productos || []).forEach(item => {
      const key = item.cod_interno || item.titulo;
      if (!prodVentas[key]) prodVentas[key] = { titulo: item.titulo, total: 0, cantidad: 0 };
      prodVentas[key].total += (item.precio_unitario || 0) * (item.cantidad || 0);
      prodVentas[key].cantidad += item.cantidad || 0;
    });
  });

  const topProds = Object.values(prodVentas).sort((a, b) => b.total - a.total).slice(0, 5);
  $('topProductos').innerHTML = topProds.length === 0
    ? '<p style="color:var(--crm-text-light);font-size:0.85rem;">Sin datos</p>'
    : topProds.map((p, i) => `
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--crm-border);font-size:0.85rem;">
        <span><strong>${i + 1}.</strong> ${p.titulo}</span>
        <span style="font-weight:600;">${formatearPrecio(p.total)}</span>
      </div>
    `).join('');

  // Tendencia info
  $('tendenciaVentas').innerHTML = `
    <div style="text-align:center;padding:20px;">
      <div style="font-size:2.5rem;font-weight:700;color:${cambio > 0 ? 'var(--crm-green)' : cambio < 0 ? 'var(--crm-red)' : 'var(--crm-primary-light)'}">
        ${cambio > 0 ? '<i class="bi bi-arrow-up-right"></i>' : cambio < 0 ? '<i class="bi bi-arrow-down-right"></i>' : '<i class="bi bi-arrow-right"></i>'}
        ${Math.abs(cambio).toFixed(1)}%
      </div>
      <p style="color:var(--crm-text-light);font-size:0.85rem;margin-top:8px;">
        ${tendencia === 'Creciente' ? 'Las ventas muestran crecimiento' : tendencia === 'Decreciente' ? 'Las ventas están disminuyendo' : 'Las ventas se mantienen estables'}
        respecto al mes anterior.
      </p>
    </div>
  `;
}

// ═══════════ TAB: INVENTARIO ═══════════
function renderInventario() {
  const activos = productos.filter(p => p.activo !== false);
  const inactivos = productos.filter(p => p.activo === false);
  const stockCero = activos.filter(p => (p.cantidad || 0) === 0);

  $('kpisInventario').innerHTML = `
    <div class="crm-kpi crm-kpi--green">
      <div class="crm-kpi-label">Productos Activos</div>
      <div class="crm-kpi-value">${formatearNumero(activos.length)}</div>
    </div>
    <div class="crm-kpi crm-kpi--red">
      <div class="crm-kpi-label">Sin Stock</div>
      <div class="crm-kpi-value">${stockCero.length}</div>
    </div>
    <div class="crm-kpi">
      <div class="crm-kpi-label">Inactivos</div>
      <div class="crm-kpi-value">${inactivos.length}</div>
    </div>
    <div class="crm-kpi crm-kpi--purple">
      <div class="crm-kpi-label">Total Productos</div>
      <div class="crm-kpi-value">${formatearNumero(productos.length)}</div>
    </div>
  `;

  // Tabla de inventario
  const productosMostrar = stockCero.slice(0, 20);
  $('tablaInventario').innerHTML = productosMostrar.length === 0
    ? '<p style="color:var(--crm-text-light);font-size:0.85rem;">No hay productos sin stock</p>'
    : `
    <div class="crm-tabla-wrapper">
      <table class="crm-tabla">
        <thead>
          <tr>
            <th>Código</th>
            <th>Producto</th>
            <th>Marca</th>
            <th>Stock</th>
            <th>Precio</th>
          </tr>
        </thead>
        <tbody>
          ${productosMostrar.map(p => `
            <tr>
              <td style="font-weight:500;color:var(--crm-primary-light);">${p.cod_interno}</td>
              <td>${p.titulo}</td>
              <td>${p.marca || '-'}</td>
              <td><span style="color:var(--crm-red);font-weight:600;">0</span></td>
              <td>${formatearPrecio(p.p_real || p.p_corriente || 0)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ═══════════ TAB: INTELIGENCIA CLIENTES ═══════════
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

  // Chart ABC
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
    ? '<p style="color:var(--crm-text-light);font-size:0.85rem;">No hay recomendaciones en este momento</p>'
    : recomendaciones.map(r => `
      <div style="padding:10px;margin-bottom:8px;border-radius:8px;background:${r.bg};border-left:4px solid ${r.color};font-size:0.82rem;">
        <strong>${r.codigo}</strong>: ${r.titulo}<br>
        <span style="color:var(--crm-text-light);">${r.clientes} clientes · ${r.accion}</span>
      </div>
    `).join('');

  // Tabla clientes con acción
  const clientesAccion = metricas
    .filter(m => m.riesgo_abandono === 'Alto' || m.estado_salud === 'En_Riesgo')
    .sort((a, b) => (b.dias_sin_compra || 0) - (a.dias_sin_compra || 0))
    .slice(0, 15);

  $('tablaInteligencia').innerHTML = clientesAccion.length === 0
    ? '<p style="color:var(--crm-text-light);font-size:0.85rem;">Sin clientes con acción requerida</p>'
    : `
    <div class="crm-tabla-wrapper">
      <table class="crm-tabla">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Salud</th>
            <th>ABC</th>
            <th>Riesgo</th>
            <th>Días s/compra</th>
            <th>Ticket Prom.</th>
            <th>Total Año</th>
          </tr>
        </thead>
        <tbody>
          ${clientesAccion.map(m => `
            <tr>
              <td>${m.cliente_id?.substring(0, 12) || '-'}</td>
              <td>${badgeSalud(m.estado_salud)}</td>
              <td>${badgeABC(m.clasificacion_abc)}</td>
              <td>${badgeRiesgo(m.riesgo_abandono)}</td>
              <td style="font-weight:600;color:${(m.dias_sin_compra || 0) > 60 ? 'var(--crm-red)' : 'var(--crm-text)'}">
                ${m.dias_sin_compra || 0}
              </td>
              <td>${formatearPrecio(m.ticket_promedio || 0)}</td>
              <td>${formatearPrecio(m.total_compras_anio || 0)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ═══════════ RECOMENDACIONES ═══════════
function generarRecomendaciones() {
  const recomendaciones = [];

  // Primera compra + riesgo bajo
  const pc01 = metricas.filter(m => m.total_ordenes === 1 && m.riesgo_abandono === 'Bajo');
  if (pc01.length > 0) {
    recomendaciones.push({
      codigo: 'PC01', titulo: 'Bienvenida y Onboarding',
      clientes: pc01.length, accion: 'Enviar kit de bienvenida',
      bg: '#dbeafe', color: '#3b82f6'
    });
  }

  // Primera compra + riesgo medio
  const pc02 = metricas.filter(m => m.total_ordenes === 1 && m.riesgo_abandono === 'Medio');
  if (pc02.length > 0) {
    recomendaciones.push({
      codigo: 'PC02', titulo: 'Incentivo Segunda Compra',
      clientes: pc02.length, accion: 'Ofrecer descuento en siguiente pedido',
      bg: '#fef3c7', color: '#f59e0b'
    });
  }

  // Primera compra + riesgo alto
  const pc03 = metricas.filter(m => m.total_ordenes === 1 && m.riesgo_abandono === 'Alto');
  if (pc03.length > 0) {
    recomendaciones.push({
      codigo: 'PC03', titulo: 'Indagación de Motivos',
      clientes: pc03.length, accion: 'Llamar para entender barreras de recompra',
      bg: '#fee2e2', color: '#ef4444'
    });
  }

  // VIP (A/B) + riesgo alto
  const cv01 = metricas.filter(m =>
    (m.clasificacion_abc === 'A' || m.clasificacion_abc === 'B') &&
    m.riesgo_abandono === 'Alto' && m.total_ordenes > 1
  );
  if (cv01.length > 0) {
    recomendaciones.push({
      codigo: 'CV01', titulo: 'Retención Urgente VIP',
      clientes: cv01.length, accion: 'Contacto inmediato con oferta personalizada',
      bg: '#fee2e2', color: '#dc2626'
    });
  }

  // VIP + tendencia decreciente
  const cv02 = metricas.filter(m =>
    (m.clasificacion_abc === 'A' || m.clasificacion_abc === 'B') &&
    m.tendencia === 'Decreciente' && m.total_ordenes > 1
  );
  if (cv02.length > 0) {
    recomendaciones.push({
      codigo: 'CV02', titulo: 'Plan de Recuperación VIP',
      clientes: cv02.length, accion: 'Visita comercial + análisis de competencia',
      bg: '#ffedd5', color: '#f97316'
    });
  }

  // VIP + tendencia creciente
  const cv03 = metricas.filter(m =>
    (m.clasificacion_abc === 'A' || m.clasificacion_abc === 'B') &&
    m.tendencia === 'Creciente'
  );
  if (cv03.length > 0) {
    recomendaciones.push({
      codigo: 'CV03', titulo: 'Programa de Fidelización',
      clientes: cv03.length, accion: 'Premiar lealtad + cross-selling',
      bg: '#d1fae5', color: '#10b981'
    });
  }

  // Estándar (C) + riesgo alto
  const ce01 = metricas.filter(m =>
    m.clasificacion_abc === 'C' && m.riesgo_abandono === 'Alto' && m.total_ordenes > 1
  );
  if (ce01.length > 0) {
    recomendaciones.push({
      codigo: 'CE01', titulo: 'Contacto Preventivo',
      clientes: ce01.length, accion: 'Llamada de seguimiento + catálogo actualizado',
      bg: '#fef3c7', color: '#f59e0b'
    });
  }

  // Estándar (C) + otros
  const ce02 = metricas.filter(m =>
    m.clasificacion_abc === 'C' && m.riesgo_abandono !== 'Alto' && m.total_ordenes > 1
  );
  if (ce02.length > 0) {
    recomendaciones.push({
      codigo: 'CE02', titulo: 'Seguimiento Estándar',
      clientes: ce02.length, accion: 'Email con novedades + promociones',
      bg: '#f1f5f9', color: '#64748b'
    });
  }

  return recomendaciones.filter(r => r.clientes > 0);
}

// ═══════════ CHART HELPER ═══════════
function renderChart(canvasId, type, data, extraOptions = {}) {
  if (charts[canvasId]) {
    charts[canvasId].destroy();
  }

  const canvas = $(canvasId);
  if (!canvas) return;

  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: type === 'doughnut' ? 'bottom' : 'top',
        labels: { font: { family: 'Poppins', size: 12 } }
      }
    }
  };

  charts[canvasId] = new Chart(canvas, {
    type,
    data,
    options: { ...defaultOptions, ...extraOptions }
  });
}
