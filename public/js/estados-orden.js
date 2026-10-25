/**
 * ============================================
 * ESTADOS DE ORDEN: TABLA ÚNICA (B2B y CRM)
 * ============================================
 * Archivo: estados-orden.js  (misma copia en public/js y public-crm/js)
 * Descripción: Nombre, etiqueta, ícono y colores de cada estado de orden. Todas
 *              las vistas (admin, vendedor, mis-ordenes, crm-ordenes,
 *              crm-despachos, crm-dashboard, crm-reportes) pintan la etiqueta
 *              con htmlEstado() y toman textos y colores de aquí. El estilo de la
 *              etiqueta (forma, tamaño, mayúsculas) se inyecta una sola vez desde
 *              este archivo, así no depende del CSS de cada página.
 * Íconos: Bootstrap Icons (bi-*), cargado en todas las páginas con etiquetas.
 * ============================================
 */

// fondo/texto: etiqueta (pastel con texto oscuro). color: tono sólido para gráficos.
export const ESTADOS_ORDEN_TABLA = [
  { estado: 'pendiente',    etiqueta: 'Pendiente',    icono: 'bi-hourglass-split',  fondo: '#fef3c7', texto: '#92400e', color: '#f59e0b' },
  { estado: 'aprobada',     etiqueta: 'Aprobada',     icono: 'bi-hand-thumbs-up',   fondo: '#dbeafe', texto: '#1e40af', color: '#3b82f6' },
  { estado: 'en_proceso',   etiqueta: 'En proceso',   icono: 'bi-arrow-repeat',     fondo: '#e0e7ff', texto: '#3730a3', color: '#6366f1' },
  { estado: 'en_espera',    etiqueta: 'En espera',    icono: 'bi-pause-circle',     fondo: '#f3e8ff', texto: '#6b21a8', color: '#a855f7' },
  { estado: 'alistamiento', etiqueta: 'Alistamiento', icono: 'bi-box-seam',         fondo: '#cffafe', texto: '#155e75', color: '#06b6d4' },
  { estado: 'terminada',    etiqueta: 'Terminada',    icono: 'bi-check-circle',     fondo: '#d1fae5', texto: '#065f46', color: '#10b981' },
  { estado: 'completada',   etiqueta: 'Completada',   icono: 'bi-check2-all',       fondo: '#dcfce7', texto: '#166534', color: '#22c55e' },
  { estado: 'parcial',      etiqueta: 'Parcial',      icono: 'bi-circle-half',      fondo: '#ffedd5', texto: '#9a3412', color: '#f97316' },
  { estado: 'cancelada',    etiqueta: 'Cancelada',    icono: 'bi-x-circle',         fondo: '#fee2e2', texto: '#991b1b', color: '#ef4444' },
];

// Nombres antiguos que aún pueden aparecer en código o datos viejos
const ALIAS = { completo: 'completada' };

const POR_ESTADO = Object.fromEntries(ESTADOS_ORDEN_TABLA.map(e => [e.estado, e]));
const DESCONOCIDO = { icono: 'bi-question-circle', fondo: '#f1f5f9', texto: '#475569', color: '#94a3b8' };

export function infoEstado(estado) {
  const e = POR_ESTADO[ALIAS[estado] || estado];
  if (e) return e;
  const texto = String(estado || 'Sin estado').replace(/_/g, ' ');
  return { ...DESCONOCIDO, estado, etiqueta: texto.charAt(0).toUpperCase() + texto.slice(1) };
}

export const etiquetaEstado = (estado) => infoEstado(estado).etiqueta;
export const colorEstado = (estado) => infoEstado(estado).color;

/** { pendiente: 'Pendiente', ... } para selects y filtros */
export const ESTADOS_ORDEN_LABELS = Object.fromEntries(ESTADOS_ORDEN_TABLA.map(e => [e.estado, e.etiqueta]));

const CSS = `
.estado-orden {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 10px; border-radius: 999px;
  font-size: 12px; font-weight: 600; line-height: 1.4;
  text-transform: none; letter-spacing: normal; white-space: nowrap; vertical-align: middle;
}
.estado-orden i { font-size: 11px; line-height: 1; }
`;

function inyectarCSS() {
  if (typeof document === 'undefined' || document.getElementById('estilos-estado-orden')) return;
  const style = document.createElement('style');
  style.id = 'estilos-estado-orden';
  style.textContent = CSS;
  document.head.appendChild(style);
}
inyectarCSS();

/** Etiqueta de estado (HTML) igual en todas las vistas */
export function htmlEstado(estado) {
  const e = infoEstado(estado);
  return `<span class="estado-orden" data-estado="${e.estado}" style="background:${e.fondo};color:${e.texto};">`
    + `<i class="bi ${e.icono}" aria-hidden="true"></i>${e.etiqueta}</span>`;
}
