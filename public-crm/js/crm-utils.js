/**
 * ============================================
 * CRM UTILITIES - ENAR
 * ============================================
 * Módulo compartido para todos los módulos CRM.
 * Constantes, formateo, state machine, badges,
 * paginación, búsqueda y toast notifications.
 * ============================================
 */

// ═══════════ CONSTANTES ═══════════

export const ESTADOS_ORDEN = {
  PENDIENTE: 'pendiente',
  APROBADA: 'aprobada',
  EN_PROCESO: 'en_proceso',
  EN_ESPERA: 'en_espera',
  COMPLETADA: 'completada',
  PARCIAL: 'parcial',
  CANCELADA: 'cancelada'
};

export const ESTADOS_ORDEN_LABELS = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  en_proceso: 'En Proceso',
  en_espera: 'En Espera',
  completada: 'Completa',
  parcial: 'Parcial',
  cancelada: 'Cancelada'
};

export const ROLES = {
  ADMIN: 'admin',
  VENDEDOR: 'vendedor',
  DESPACHOS: 'despachos',
  GESTOR: 'gestor'
};

export const ESTADOS_SALUD = {
  SALUDABLE: 'Saludable',
  EN_RIESGO: 'En_Riesgo',
  INACTIVO: 'Inactivo'
};

export const CLASIFICACION_ABC = {
  A: 'A',
  B: 'B',
  C: 'C',
  SV: 'SV'
};

export const RIESGO_ABANDONO = {
  BAJO: 'Bajo',
  MEDIO: 'Medio',
  ALTO: 'Alto'
};

export const TENDENCIAS = {
  CRECIENTE: 'Creciente',
  ESTABLE: 'Estable',
  DECRECIENTE: 'Decreciente'
};

export const IVA_PORCENTAJE = 0.19;

export const ADMIN_EMAIL = 'sebastianbumq@enarapp.com';

// ═══════════ VERIFICACIÓN DE ACCESO ═══════════

export function verificarAccesoCRM(perfil) {
  if (!perfil) return false;
  const rolesPermitidos = [ROLES.ADMIN, ROLES.VENDEDOR, ROLES.DESPACHOS, ROLES.GESTOR];
  return rolesPermitidos.includes(perfil.rol) || perfil.email === ADMIN_EMAIL;
}

export function esAdmin(perfil) {
  return perfil && (perfil.rol === ROLES.ADMIN || perfil.email === ADMIN_EMAIL);
}

export function esVendedor(perfil) {
  return perfil && perfil.rol === ROLES.VENDEDOR;
}

export function esDespachos(perfil) {
  return perfil && perfil.rol === ROLES.DESPACHOS;
}

// ═══════════ FORMATEO ═══════════

export function formatearPrecio(n) {
  if (!n && n !== 0) return '$0';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(n);
}

export function formatearFecha(fecha) {
  if (!fecha) return '-';
  const d = fecha instanceof Date ? fecha :
    fecha.toDate ? fecha.toDate() :
    new Date(fecha);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

export function formatearFechaHora(fecha) {
  if (!fecha) return '-';
  const d = fecha instanceof Date ? fecha :
    fecha.toDate ? fecha.toDate() :
    new Date(fecha);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function tiempoRelativo(fecha) {
  if (!fecha) return '-';
  const d = fecha instanceof Date ? fecha :
    fecha.toDate ? fecha.toDate() :
    new Date(fecha);
  if (isNaN(d.getTime())) return '-';

  const ahora = new Date();
  const diffMs = ahora - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHoras = Math.floor(diffMin / 60);
  const diffDias = Math.floor(diffHoras / 24);

  if (diffMin < 1) return 'Ahora';
  if (diffMin < 60) return `Hace ${diffMin} min`;
  if (diffHoras < 24) return `Hace ${diffHoras}h`;
  if (diffDias < 7) return `Hace ${diffDias}d`;
  if (diffDias < 30) return `Hace ${Math.floor(diffDias / 7)} sem`;
  return formatearFecha(d);
}

export function formatearNumero(n) {
  if (!n && n !== 0) return '0';
  return new Intl.NumberFormat('es-CO').format(n);
}

export function formatearPeso(kg) {
  if (!kg) return '0 kg';
  return `${formatearNumero(Math.round(kg * 100) / 100)} kg`;
}

// ═══════════ STATE MACHINE ═══════════

const TRANSICIONES_ESTADO = {
  pendiente: ['en_proceso', 'cancelada'],
  en_proceso: ['completada', 'parcial', 'en_espera', 'cancelada'],
  parcial: ['completada', 'en_espera', 'cancelada'],
  completada: [],
  cancelada: []
};

export function obtenerTransicionesPermitidas(estadoActual) {
  return TRANSICIONES_ESTADO[estadoActual] || [];
}

export function puedeTransicionar(estadoActual, estadoNuevo) {
  const permitidas = TRANSICIONES_ESTADO[estadoActual] || [];
  return permitidas.includes(estadoNuevo);
}

// ═══════════ BADGES ═══════════

export function badgeEstado(estado) {
  const clases = {
    pendiente: 'badge-estado badge-pendiente',
    aprobada: 'badge-estado badge-aprobada',
    en_proceso: 'badge-estado badge-en-proceso',
    en_espera: 'badge-estado badge-en-espera',
    completada: 'badge-estado badge-completada',
    parcial: 'badge-estado badge-parcial',
    cancelada: 'badge-estado badge-cancelada'
  };
  const label = ESTADOS_ORDEN_LABELS[estado] || estado;
  return `<span class="${clases[estado] || 'badge-estado'}">${label}</span>`;
}

export function badgeSalud(salud) {
  const clases = {
    Saludable: 'badge-salud badge-saludable',
    En_Riesgo: 'badge-salud badge-en-riesgo',
    Inactivo: 'badge-salud badge-inactivo'
  };
  const label = (salud || '').replace('_', ' ');
  return `<span class="${clases[salud] || 'badge-salud'}">${label || 'N/A'}</span>`;
}

export function badgeABC(abc) {
  const clases = {
    A: 'badge-abc badge-abc-a',
    B: 'badge-abc badge-abc-b',
    C: 'badge-abc badge-abc-c',
    SV: 'badge-abc badge-abc-sv'
  };
  return `<span class="${clases[abc] || 'badge-abc'}">${abc || 'N/A'}</span>`;
}

export function badgeRiesgo(riesgo) {
  const clases = {
    Alto: 'badge-riesgo badge-riesgo-alto',
    Medio: 'badge-riesgo badge-riesgo-medio',
    Bajo: 'badge-riesgo badge-riesgo-bajo'
  };
  return `<span class="${clases[riesgo] || 'badge-riesgo'}">${riesgo || 'N/A'}</span>`;
}

export function badgeTendencia(tendencia) {
  const iconos = {
    Creciente: '<i class="bi bi-arrow-up-right"></i>',
    Estable: '<i class="bi bi-arrow-right"></i>',
    Decreciente: '<i class="bi bi-arrow-down-right"></i>'
  };
  const clases = {
    Creciente: 'badge-tendencia badge-tendencia-creciente',
    Estable: 'badge-tendencia badge-tendencia-estable',
    Decreciente: 'badge-tendencia badge-tendencia-decreciente'
  };
  return `<span class="${clases[tendencia] || 'badge-tendencia'}">${iconos[tendencia] || ''} ${tendencia || 'N/A'}</span>`;
}

// ═══════════ PAGINACIÓN ═══════════

export class Paginador {
  constructor(itemsPorPagina = 50) {
    this.paginaActual = 1;
    this.itemsPorPagina = itemsPorPagina;
    this.totalItems = 0;
  }

  get totalPaginas() {
    return Math.max(1, Math.ceil(this.totalItems / this.itemsPorPagina));
  }

  get offset() {
    return (this.paginaActual - 1) * this.itemsPorPagina;
  }

  paginar(items) {
    this.totalItems = items.length;
    if (this.paginaActual > this.totalPaginas) this.paginaActual = this.totalPaginas;
    return items.slice(this.offset, this.offset + this.itemsPorPagina);
  }

  irA(pagina) {
    this.paginaActual = Math.max(1, Math.min(pagina, this.totalPaginas));
  }

  siguiente() {
    this.irA(this.paginaActual + 1);
  }

  anterior() {
    this.irA(this.paginaActual - 1);
  }

  renderControles(containerId, onCambio) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const inicio = this.offset + 1;
    const fin = Math.min(this.offset + this.itemsPorPagina, this.totalItems);

    container.innerHTML = `
      <div class="crm-paginacion">
        <span class="crm-paginacion-info">
          ${this.totalItems > 0 ? `${inicio}-${fin} de ${this.totalItems}` : 'Sin resultados'}
        </span>
        <div class="crm-paginacion-btns">
          <button class="crm-btn-pag" ${this.paginaActual <= 1 ? 'disabled' : ''} data-pag="prev">
            <i class="bi bi-chevron-left"></i>
          </button>
          <span class="crm-pag-actual">Pág ${this.paginaActual} / ${this.totalPaginas}</span>
          <button class="crm-btn-pag" ${this.paginaActual >= this.totalPaginas ? 'disabled' : ''} data-pag="next">
            <i class="bi bi-chevron-right"></i>
          </button>
        </div>
      </div>
    `;

    container.querySelectorAll('.crm-btn-pag').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.pag === 'prev') this.anterior();
        else this.siguiente();
        if (onCambio) onCambio();
      });
    });
  }
}

// ═══════════ BÚSQUEDA MULTI-CAMPO ═══════════

export function buscarMultiCampo(items, texto, campos) {
  if (!texto || !texto.trim()) return items;

  const terminos = texto.toLowerCase().trim().split(/\s+/);
  return items.filter(item =>
    terminos.every(termino =>
      campos.some(campo => {
        const valor = obtenerValorCampo(item, campo);
        return valor && valor.toLowerCase().includes(termino);
      })
    )
  );
}

function obtenerValorCampo(obj, campo) {
  const partes = campo.split('.');
  let valor = obj;
  for (const parte of partes) {
    if (valor == null) return '';
    valor = valor[parte];
  }
  return String(valor || '');
}

// ═══════════ TOAST NOTIFICATIONS ═══════════

let toastContainer = null;

function getToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'crmToastContainer';
    toastContainer.className = 'crm-toast-container';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

export function showToast(mensaje, tipo = 'success') {
  const container = getToastContainer();
  const toast = document.createElement('div');
  toast.className = `crm-toast crm-toast-${tipo}`;

  const iconos = {
    success: 'bi-check-circle-fill',
    error: 'bi-x-circle-fill',
    info: 'bi-info-circle-fill',
    warning: 'bi-exclamation-triangle-fill'
  };

  toast.innerHTML = `<i class="bi ${iconos[tipo] || iconos.info}"></i> <span>${mensaje}</span>`;
  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('crm-toast-visible'));

  setTimeout(() => {
    toast.classList.remove('crm-toast-visible');
    toast.classList.add('crm-toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ═══════════ GENERADORES ═══════════

export function generarIdOrden() {
  const f = new Date();
  const yy = f.getFullYear().toString().slice(-2);
  const mm = String(f.getMonth() + 1).padStart(2, '0');
  const dd = String(f.getDate()).padStart(2, '0');
  const rnd = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
  return `ORD-${yy}${mm}${dd}-${rnd}`;
}

// ═══════════ HELPERS DOM ═══════════

export const $ = id => document.getElementById(id);

export function debounce(fn, delay = 400) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

export function mostrarLoader(containerId, mensaje = 'Cargando...') {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <div class="crm-loader">
      <div class="crm-spinner"></div>
      <p>${mensaje}</p>
    </div>`;
}

export function mostrarVacio(containerId, mensaje = 'No se encontraron resultados', icono = 'bi-inbox') {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <div class="crm-empty">
      <i class="bi ${icono}"></i>
      <p>${mensaje}</p>
    </div>`;
}
