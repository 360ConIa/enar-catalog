/**
 * ============================================
 * CRM DASHBOARD - ENAR
 * ============================================
 * KPIs, gráficos, clientes en riesgo, órdenes recientes
 * ============================================
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getFirestore, collection, doc, getDoc, getDocs, query, where, orderBy, limit
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
  getAuth, onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

import {
  $, ADMIN_EMAIL, ESTADOS_ORDEN_LABELS,
  formatearPrecio, formatearFecha, formatearNumero, tiempoRelativo,
  badgeEstado, badgeSalud, badgeRiesgo,
  showToast
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
  const esCRM = esAdmin || ['vendedor', 'despachos', 'gestor'].includes(perfil.rol);

  if (!esCRM) {
    $('loadingScreen').style.display = 'none';
    $('noAccess').style.display = 'flex';
    return;
  }

  $('welcomeMsg').textContent = `Bienvenido, ${(perfil.nombre || user.email).split(' ')[0]}`;

  await cargarDashboard(user, perfil, esAdmin);

  $('loadingScreen').style.display = 'none';
  $('mainContent').style.display = 'block';
});

$('btnLogout').addEventListener('click', async () => {
  await signOut(auth);
  window.location.href = '/login.html';
});

// ═══════════ CARGAR DASHBOARD ═══════════
async function cargarDashboard(user, perfil, esAdmin) {
  try {
    // Cargar órdenes
    let ordenesQuery;
    if (esAdmin || perfil.rol === 'despachos') {
      ordenesQuery = query(collection(db, 'ordenes'), orderBy('created_at', 'desc'));
    } else {
      ordenesQuery = query(
        collection(db, 'ordenes'),
        where('creadaPor', '==', user.uid),
        orderBy('created_at', 'desc')
      );
    }

    const [ordenesSnap, metricasSnap] = await Promise.all([
      getDocs(ordenesQuery),
      getDocs(collection(db, 'metricas_clientes'))
    ]);

    const ordenes = [];
    ordenesSnap.forEach(d => ordenes.push({ id: d.id, ...d.data() }));

    const metricas = [];
    metricasSnap.forEach(d => metricas.push({ id: d.id, ...d.data() }));

    // KPIs
    const ahora = new Date();
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);

    $('kpiOrdenes').textContent = formatearNumero(ordenes.length);
    $('kpiOrdenesSub').textContent = `${ordenes.filter(o => o.created_at && new Date(o.created_at) >= inicioMes).length} este mes`;
    $('kpiPendientes').textContent = ordenes.filter(o => o.estado === 'pendiente').length;

    const ventasMes = ordenes
      .filter(o => o.created_at && new Date(o.created_at) >= inicioMes && o.estado !== 'cancelada')
      .reduce((s, o) => s + (o.total || 0), 0);
    $('kpiVentasMes').textContent = formatearPrecio(ventasMes);
    $('kpiRiesgo').textContent = metricas.filter(m => m.riesgo_abandono === 'Alto').length;

    // Chart: Ventas por mes
    const ventasPorMes = [];
    for (let i = 5; i >= 0; i--) {
      const fecha = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
      const finMes = new Date(ahora.getFullYear(), ahora.getMonth() - i + 1, 0, 23, 59, 59);
      const ventas = ordenes
        .filter(o => o.created_at && new Date(o.created_at) >= fecha && new Date(o.created_at) <= finMes && o.estado !== 'cancelada')
        .reduce((s, o) => s + (o.total || 0), 0);
      ventasPorMes.push({
        nombre: fecha.toLocaleDateString('es-CO', { month: 'short' }),
        ventas
      });
    }

    renderChart('chartVentas', 'bar', {
      labels: ventasPorMes.map(v => v.nombre),
      datasets: [{
        label: 'Ventas',
        data: ventasPorMes.map(v => v.ventas),
        backgroundColor: 'rgba(59, 130, 246, 0.7)',
        borderColor: '#3b82f6',
        borderWidth: 1,
        borderRadius: 6
      }]
    }, {
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => formatearPrecio(v) } }
      },
      plugins: { legend: { display: false } }
    });

    // Chart: Distribución
    const estadoCounts = {};
    ordenes.forEach(o => { estadoCounts[o.estado] = (estadoCounts[o.estado] || 0) + 1; });

    const colores = {
      pendiente: '#fbbf24', aprobada: '#60a5fa', en_proceso: '#818cf8',
      en_espera: '#c084fc', completada: '#34d399', parcial: '#fb923c', cancelada: '#f87171'
    };

    renderChart('chartDistribucion', 'doughnut', {
      labels: Object.keys(estadoCounts).map(k => ESTADOS_ORDEN_LABELS[k] || k),
      datasets: [{
        data: Object.values(estadoCounts),
        backgroundColor: Object.keys(estadoCounts).map(k => colores[k] || '#94a3b8')
      }]
    });

    // Clientes en riesgo (top 5)
    const clientesRiesgo = metricas
      .filter(m => m.riesgo_abandono === 'Alto')
      .sort((a, b) => (b.dias_sin_compra || 0) - (a.dias_sin_compra || 0))
      .slice(0, 5);

    $('clientesRiesgo').innerHTML = clientesRiesgo.length === 0
      ? '<p style="color:var(--crm-text-light);font-size:0.85rem;padding:8px 0;">Sin clientes en riesgo alto</p>'
      : clientesRiesgo.map(m => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--crm-border);font-size:0.82rem;">
          <div>
            <div style="font-weight:500;">${m.cliente_id?.substring(0, 15) || 'N/A'}</div>
            <div style="color:var(--crm-text-light);font-size:0.73rem;">${m.dias_sin_compra || 0} días sin compra</div>
          </div>
          <div style="display:flex;gap:6px;align-items:center;">
            ${badgeRiesgo(m.riesgo_abandono)}
            ${badgeSalud(m.estado_salud)}
          </div>
        </div>
      `).join('');

    // Órdenes recientes (últimas 10)
    const recientes = ordenes.slice(0, 10);
    $('ordenesRecientes').innerHTML = recientes.length === 0
      ? '<p style="color:var(--crm-text-light);font-size:0.85rem;padding:8px 0;">Sin órdenes recientes</p>'
      : recientes.map(o => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--crm-border);font-size:0.82rem;">
          <div>
            <div style="font-weight:500;">${o.numero_orden || o.id.substring(0, 8)}</div>
            <div style="color:var(--crm-text-light);font-size:0.73rem;">${o.clienteNombre || '-'} · ${tiempoRelativo(o.created_at)}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <span style="font-weight:600;">${formatearPrecio(o.total || 0)}</span>
            ${badgeEstado(o.estado)}
          </div>
        </div>
      `).join('');

  } catch (error) {
    console.error('Error cargando dashboard:', error);
    showToast('Error al cargar datos', 'error');
  }
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
          position: type === 'doughnut' ? 'bottom' : 'top',
          labels: { font: { family: 'Poppins', size: 11 } }
        }
      },
      ...extraOptions
    }
  });
}
