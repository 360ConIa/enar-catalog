/**
 * ============================================
 * CRM DASHBOARD - ENAR
 * ============================================
 * KPIs, gráficos, clientes en riesgo, órdenes recientes.
 * Datos reales desde Firestore.
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

// ═══════════ HELPERS ═══════════

function toDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (val.toDate) return val.toDate(); // Firestore Timestamp
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

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
  } catch (error) {
    console.error('Error en auth:', error);
    showToast('Error al verificar acceso', 'error');
  }
});

$('btnLogout').addEventListener('click', async () => {
  await signOut(auth);
  window.location.href = 'index.html';
});

// ═══════════ CARGAR DASHBOARD ═══════════
async function cargarDashboard(user, perfil, esAdmin) {
  try {
    // Cargar órdenes según rol
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
    const metricasPorId = {};
    metricasSnap.forEach(d => {
      const data = { id: d.id, ...d.data() };
      metricas.push(data);
      metricasPorId[d.id] = data;
    });

    // Resolver nombres de clientes para la lista de riesgo
    const clientesRiesgo = metricas
      .filter(m => m.riesgo_abandono === 'Alto')
      .sort((a, b) => (b.dias_sin_compra || 0) - (a.dias_sin_compra || 0))
      .slice(0, 5);

    // Batch fetch nombres si no están en las métricas
    const uidsSinNombre = clientesRiesgo
      .filter(m => !m.nombre_cliente)
      .map(m => m.cliente_id || m.id);

    if (uidsSinNombre.length > 0) {
      const batchPromises = uidsSinNombre.map(uid =>
        getDoc(doc(db, 'usuarios', uid))
      );
      const userDocs = await Promise.all(batchPromises);
      userDocs.forEach(ud => {
        if (ud.exists()) {
          const data = ud.data();
          const metrica = clientesRiesgo.find(m => (m.cliente_id || m.id) === ud.id);
          if (metrica) metrica.nombre_cliente = data.nombre || data.email;
        }
      });
    }

    // ─── KPIs ───
    const ahora = new Date();
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);

    const ordenesActivas = ordenes.filter(o =>
      !['completada', 'cancelada'].includes(o.estado)
    ).length;

    const ventasMes = ordenes
      .filter(o => {
        const fecha = toDate(o.created_at);
        return fecha && fecha >= inicioMes && o.estado !== 'cancelada';
      })
      .reduce((s, o) => s + (o.total || 0), 0);

    const ordenesCompletadas = ordenes.filter(o => o.estado === 'completada');
    const ticketPromedio = ordenesCompletadas.length > 0
      ? ordenesCompletadas.reduce((s, o) => s + (o.total || 0), 0) / ordenesCompletadas.length
      : 0;

    const clientesEnRiesgo = metricas.filter(m => m.riesgo_abandono === 'Alto').length;

    $('kpiVentasMes').textContent = formatearPrecio(ventasMes);
    $('kpiVentasMesSub').textContent = `${ordenes.filter(o => {
      const f = toDate(o.created_at);
      return f && f >= inicioMes;
    }).length} órdenes este mes`;

    $('kpiOrdenesActivas').textContent = formatearNumero(ordenesActivas);

    $('kpiRiesgo').textContent = formatearNumero(clientesEnRiesgo);

    $('kpiTicket').textContent = formatearPrecio(ticketPromedio);
    $('kpiTicketSub').textContent = `${ordenesCompletadas.length} completadas`;

    // ─── Chart: Ventas por Mes (line) ───
    const ventasPorMes = [];
    for (let i = 5; i >= 0; i--) {
      const inicio = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
      const fin = new Date(ahora.getFullYear(), ahora.getMonth() - i + 1, 0, 23, 59, 59);
      const ventas = ordenes
        .filter(o => {
          const f = toDate(o.created_at);
          return f && f >= inicio && f <= fin && o.estado !== 'cancelada';
        })
        .reduce((s, o) => s + (o.total || 0), 0);
      ventasPorMes.push({
        label: inicio.toLocaleDateString('es-CO', { month: 'short' }),
        ventas
      });
    }

    renderChart('chartVentas', 'line', {
      labels: ventasPorMes.map(v => v.label),
      datasets: [{
        label: 'Ventas',
        data: ventasPorMes.map(v => v.ventas),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: '#3b82f6'
      }]
    }, {
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => formatearPrecio(v) } }
      },
      plugins: { legend: { display: false } }
    });

    // ─── Chart: Distribución Estados (doughnut) ───
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

    // ─── Clientes en Riesgo (top 5, nombres reales) ───
    $('clientesRiesgo').innerHTML = clientesRiesgo.length === 0
      ? '<p style="color:var(--crm-text-light);font-size:0.85rem;padding:8px 0;">Sin clientes en riesgo alto</p>'
      : clientesRiesgo.map(m => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--crm-border);font-size:0.82rem;">
          <div>
            <div style="font-weight:500;">${m.nombre_cliente || 'Sin nombre'}</div>
            <div style="color:var(--crm-text-light);font-size:0.73rem;">${m.dias_sin_compra || 0} días sin compra</div>
          </div>
          <div style="display:flex;gap:6px;align-items:center;">
            ${badgeRiesgo(m.riesgo_abandono)}
            ${badgeSalud(m.estado_salud)}
          </div>
        </div>
      `).join('');

    // ─── Órdenes Recientes (últimas 10) ───
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
    showToast('Error al cargar datos del dashboard', 'error');
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
