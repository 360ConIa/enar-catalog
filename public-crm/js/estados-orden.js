/**
 * ============================================
 * ESTADOS DE ORDEN: TABLA ÚNICA (B2B y CRM)
 * ============================================
 * Archivo: estados-orden.js  (misma copia en public/js y public-crm/js)
 * Descripción: Estados, subestados, transiciones, etiqueta, ícono y colores de las
 *              órdenes. Todas las vistas (admin, vendedor, mis-ordenes, crm-ordenes,
 *              crm-despachos, crm-dashboard, crm-reportes, crm-clientes) pintan la
 *              etiqueta con htmlEstado(), arman menús y filtros con esta tabla y
 *              validan cambios con transicionesDe(). El estilo de la etiqueta se
 *              inyecta desde aquí, así no depende del CSS de cada página.
 *
 * Estados (en este orden): pendiente · aprobada · alistamiento · cerrada · cancelada
 * Subestados de cerrada (campo ordenes.subestado): completa · parcial
 * Subestados de alistamiento (calculados, NO se guardan): con_mensaje · sin_mensaje,
 *   según el usuario actual tenga mensajes internos sin leer en esa orden. Cada página
 *   que tiene el contador de no leídos lo conecta con usarContadorNoLeidos(); donde no
 *   hay contador (vista del cliente, dashboard) Alistamiento se muestra sin subestado.
 *
 * Nombres anteriores (antes del 2026-10-26; los datos se migraron, pero pueden
 * llegar de páginas en caché o de datos viejos): en_proceso → aprobada,
 * terminada → cerrada, completada/completo → cerrada + completa,
 * parcial → cerrada + parcial. Se muestran con el nombre nuevo.
 * Íconos: Bootstrap Icons (bi-*), cargado en todas las páginas con etiquetas.
 * ============================================
 */

// fondo/texto: etiqueta (pastel con texto oscuro). color: tono sólido para gráficos.
// accion: verbo de los botones y menús que pasan la orden a ese estado.
export const ESTADOS_ORDEN_TABLA = [
  { estado: 'pendiente',    etiqueta: 'Pendiente',    accion: 'Volver a pendiente',   icono: 'bi-hourglass-split', fondo: '#fef3c7', texto: '#92400e', color: '#f59e0b' },
  { estado: 'aprobada',     etiqueta: 'Aprobada',     accion: 'Aprobar',              icono: 'bi-hand-thumbs-up',  fondo: '#dbeafe', texto: '#1e40af', color: '#3b82f6' },
  { estado: 'alistamiento', etiqueta: 'Alistamiento', accion: 'Iniciar alistamiento', icono: 'bi-box-seam',        fondo: '#cffafe', texto: '#155e75', color: '#06b6d4' },
  { estado: 'cerrada',      etiqueta: 'Cerrada',      accion: 'Cerrar',               icono: 'bi-check-circle',    fondo: '#d1fae5', texto: '#065f46', color: '#10b981' },
  { estado: 'cancelada',    etiqueta: 'Cancelada',    accion: 'Cancelar',             icono: 'bi-x-circle',        fondo: '#fee2e2', texto: '#991b1b', color: '#ef4444' },
];

// Subestados: contorno (borde de 1 px, fondo transparente) y más pequeños que el estado,
// para leerse como complemento de Cerrada. texto = color del borde y del texto.
export const SUBESTADOS_CERRADA = [
  { subestado: 'completa', etiqueta: 'Completa', icono: 'bi-check2-all',  fondo: 'transparent', texto: '#0f766e', color: '#0f766e' },
  { subestado: 'parcial',  etiqueta: 'Parcial',  icono: 'bi-circle-half', fondo: 'transparent', texto: '#c2410c', color: '#c2410c' },
];

export const ESTADOS = ESTADOS_ORDEN_TABLA.map(e => e.estado);
// Subestados de alistamiento: mismo estilo; se calculan por usuario en tiempo real
export const SUBESTADOS_ALISTAMIENTO = [
  { subestado: 'con_mensaje', etiqueta: 'Con mensaje', icono: 'bi-chat-dots-fill', fondo: 'transparent', texto: '#1d4ed8', color: '#1d4ed8' },
  { subestado: 'sin_mensaje', etiqueta: 'Sin mensaje', icono: 'bi-chat',           fondo: 'transparent', texto: '#6b7280', color: '#6b7280' },
];

export const SUBESTADOS = SUBESTADOS_CERRADA.map(s => s.subestado);
const SUBESTADOS_POR_ESTADO = {
  cerrada: SUBESTADOS,
  alistamiento: SUBESTADOS_ALISTAMIENTO.map(s => s.subestado),
};

// Contador de mensajes sin leer del usuario actual (ordenId → número), lo conecta cada
// página con chat (admin, vendedor, CRM Órdenes, Despachos).
let contadorNoLeidos = null;
export function usarContadorNoLeidos(fn) { contadorNoLeidos = typeof fn === 'function' ? fn : null; }

// Nombres anteriores → { estado, subestado }
const LEGADO = {
  en_proceso: { estado: 'aprobada' },
  terminada:  { estado: 'cerrada' },
  completada: { estado: 'cerrada', subestado: 'completa' },
  completo:   { estado: 'cerrada', subestado: 'completa' },
  parcial:    { estado: 'cerrada', subestado: 'parcial' },
};
const SUB_LEGADO = { completada: 'completa', completo: 'completa' };

const POR_ESTADO = Object.fromEntries(ESTADOS_ORDEN_TABLA.map(e => [e.estado, e]));
const POR_SUB = Object.fromEntries([...SUBESTADOS_CERRADA, ...SUBESTADOS_ALISTAMIENTO].map(s => [s.subestado, s]));
const DESCONOCIDO = { icono: 'bi-question-circle', fondo: '#f1f5f9', texto: '#475569', color: '#94a3b8' };

/** Estado vigente (traduce los nombres anteriores) */
export function normalizarEstado(estado) {
  return LEGADO[estado]?.estado || estado;
}

/** Subestado de una orden cerrada ('completa' | 'parcial' | null) */
export function subestadoDe(orden) {
  if (!orden) return null;
  const estado = normalizarEstado(orden.estado);
  if (estado === 'alistamiento') {
    if (!contadorNoLeidos || !orden.id) return null;
    return contadorNoLeidos(orden.id) > 0 ? 'con_mensaje' : 'sin_mensaje';
  }
  if (estado !== 'cerrada') return null;
  const s = orden.subestado;
  if (s) return SUB_LEGADO[s] || s;
  return LEGADO[orden.estado]?.subestado || null;
}

/**
 * Subestado al cerrar: parcial si algún ítem quedó parcial o sin stock, o si se
 * registró alistamiento en unos ítems y no en otros; completa en otro caso (sin
 * alistamiento registrado se despacha lo pedido, RN-34).
 */
export function subestadoAlCerrar(items = []) {
  const marcados = items.filter(i => ['comp', 'parcial', 'sinstock'].includes(i.estado_alistamiento));
  if (marcados.length === 0) return 'completa';
  return items.every(i => i.estado_alistamiento === 'comp') ? 'completa' : 'parcial';
}

export function infoEstado(estado) {
  const e = POR_ESTADO[normalizarEstado(estado)];
  if (e) return e;
  const texto = String(estado || 'Sin estado').replace(/_/g, ' ');
  return { ...DESCONOCIDO, estado, etiqueta: texto.charAt(0).toUpperCase() + texto.slice(1) };
}

export function infoSubestado(subestado) {
  return POR_SUB[SUB_LEGADO[subestado] || subestado] || null;
}

export const etiquetaEstado = (estado) => infoEstado(estado).etiqueta;
export const colorEstado = (estado) => infoEstado(estado).color;

/** "Cerrada · Parcial" para textos planos (CSV, avisos) */
export function etiquetaEstadoOrden(orden) {
  const sub = infoSubestado(subestadoDe(orden));
  return etiquetaEstado(orden?.estado) + (sub ? ` · ${sub.etiqueta}` : '');
}

/** { pendiente: 'Pendiente', ... } para selects y textos */
export const ESTADOS_ORDEN_LABELS = Object.fromEntries(ESTADOS_ORDEN_TABLA.map(e => [e.estado, e.etiqueta]));

// ═══════════ TRANSICIONES ═══════════
// Avance normal. Al pasar a cerrada se fija el subestado (subestadoAlCerrar).
const TRANSICIONES = {
  pendiente:    ['aprobada', 'cancelada'],
  aprobada:     ['alistamiento', 'cancelada'],
  alistamiento: ['cerrada', 'cancelada'],
  cerrada:      [],
  cancelada:    [],
};
// Un paso atrás, solo admin o gestor, con motivo (RN-31)
const REVERSIONES = {
  aprobada:     'pendiente',
  alistamiento: 'aprobada',
  cerrada:      'alistamiento',
};

export const transicionesDe = (estado) => TRANSICIONES[normalizarEstado(estado)] || [];
export const puedeTransicionar = (actual, nuevo) => transicionesDe(actual).includes(nuevo);
export const reversionDe = (estado) => REVERSIONES[normalizarEstado(estado)] || null;
export const puedeRegresarEstado = (rol) => rol === 'admin' || rol === 'gestor';

/**
 * Campos a guardar al cambiar de estado (updateDoc): estado, historial y, al cerrar,
 * el subestado según lo despachado; al salir de cerrada (reversión) se limpia.
 */
export function cambiosDeEstado(orden, nuevoEstado, nota = '') {
  const ahora = new Date().toISOString();
  const cambios = {
    estado: nuevoEstado,
    historial: [...(orden.historial || []), { estado: nuevoEstado, fecha: ahora, nota }],
    updated_at: ahora,
  };
  if (nuevoEstado === 'cerrada') cambios.subestado = subestadoAlCerrar(orden.items || orden.productos || []);
  else if (orden.subestado) cambios.subestado = null;
  return cambios;
}

// ═══════════ FILTROS ═══════════
// Valores del filtro de estado: los 5 estados y, bajo Alistamiento y Cerrada, sus subestados.
export const FILTROS_ESTADO = [
  { valor: 'pendiente' },
  { valor: 'aprobada' },
  { valor: 'alistamiento' },
  ...SUBESTADOS_POR_ESTADO.alistamiento.map(s => ({ valor: `alistamiento/${s}`, sub: true })),
  { valor: 'cerrada' },
  ...SUBESTADOS.map(s => ({ valor: `cerrada/${s}`, sub: true })),
  { valor: 'cancelada' },
];

export function coincideFiltroEstado(orden, valor) {
  if (!valor) return true;
  const [estado, sub] = valor.split('/');
  if (normalizarEstado(orden.estado) !== estado) return false;
  return !sub || subestadoDe(orden) === sub;
}

// ═══════════ HTML ═══════════
const CSS = `
.estado-orden {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 10px; border-radius: 999px;
  font-size: 12px; font-weight: 600; line-height: 1.4;
  text-transform: none; letter-spacing: normal; white-space: nowrap; vertical-align: middle;
}
.estado-orden i { font-size: 11px; line-height: 1; }
.estado-orden-grupo { display: inline-flex; flex-direction: column; align-items: flex-start; gap: 2px; vertical-align: middle; }
.estado-orden-grupo > .estado-orden--sub { margin-left: 12px; }
.estado-orden-grupo--linea { flex-direction: row; align-items: center; gap: 4px; }
.estado-orden-grupo--linea > .estado-orden--sub { margin-left: 0; }
.estado-orden.estado-orden--sub { padding: 0 6px; gap: 3px; font-size: 10px; line-height: 1.5; border: 1px solid currentColor; }
.estado-orden.estado-orden--sub i { font-size: 9px; }
.selector-estado { position: relative; display: inline-block; min-width: 190px; }
.selector-estado-boton {
  width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 6px 10px; background: #fff; border: 1px solid #cbd5e1; border-radius: 8px;
  font-size: 13px; color: #334155; cursor: pointer; text-align: left; min-height: 36px;
}
/* Flecha del botón: css/desplegables.css (indicador único de ambas apps) */
.selector-estado-lista {
  display: none; position: absolute; z-index: 1000; top: calc(100% + 4px); left: 0; min-width: 100%;
  background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 8px 24px rgba(15,23,42,.12);
  padding: 4px; max-height: 340px; overflow-y: auto;
}
.selector-estado.abierto .selector-estado-lista { display: block; }
.selector-estado-opcion {
  display: flex; align-items: center; width: 100%; padding: 6px 8px; border: 0; background: none;
  border-radius: 6px; cursor: pointer; font-size: 13px; color: #334155; text-align: left; white-space: nowrap;
}
.selector-estado-opcion:hover, .selector-estado-opcion.activa { background: #f1f5f9; }
.selector-estado-opcion--sub { padding-left: 28px; }
.selector-estado-sep { height: 1px; background: #e2e8f0; margin: 4px 2px; }
/* Botón de cambio de estado: verbo con el aspecto de la etiqueta del estado de destino
   (fondo, texto y borde del estado; mismo radio). Colores en línea (htmlBotonEstado). */
.boton-estado {
  display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px;
  border: 1px solid currentColor; border-radius: 999px;
  font-size: 13px; font-weight: 600; line-height: 1.3; white-space: nowrap;
  cursor: pointer; font-family: inherit; transition: filter .15s;
}
.boton-estado:hover { filter: brightness(0.95); }
.boton-estado:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
.boton-estado i { font-size: 13px; line-height: 1; }
.boton-estado--sm { padding: 4px 12px; font-size: 12px; }
.estado-orden.estado-orden--accion { border: 1px solid currentColor; }
`;

function inyectarCSS() {
  if (typeof document === 'undefined' || document.getElementById('estilos-estado-orden')) return;
  const style = document.createElement('style');
  style.id = 'estilos-estado-orden';
  style.textContent = CSS;
  document.head.appendChild(style);
}
inyectarCSS();

function pastilla(info, clase = '', dato = '') {
  return `<span class="estado-orden${clase}" ${dato} style="background:${info.fondo};color:${info.texto};">`
    + `<i class="bi ${info.icono}" aria-hidden="true"></i>${info.etiqueta}</span>`;
}

/** Etiqueta del subestado sola (Completa / Parcial) */
export function htmlSubestado(subestado) {
  const s = infoSubestado(subestado);
  return s ? pastilla(s, ' estado-orden--sub', `data-subestado="${s.subestado}"`) : '';
}

/**
 * Etiqueta de estado igual en todas las vistas. Acepta el estado o la orden entera:
 * htmlEstado('aprobada'), htmlEstado(orden), htmlEstado('cerrada', 'parcial').
 * Una orden cerrada muestra su subestado debajo de Cerrada, con sangría (tablas, detalle).
 * enLinea: el subestado a la derecha, para espacios de una sola línea (botón del filtro).
 */
export function htmlEstado(estadoUOrden, subestado, { enLinea = false } = {}) {
  const orden = estadoUOrden && typeof estadoUOrden === 'object' ? estadoUOrden : null;
  const estado = orden ? orden.estado : estadoUOrden;
  const e = infoEstado(estado);
  const principal = pastilla(e, '', `data-estado="${e.estado}"`);
  const sub = orden ? subestadoDe(orden) : (subestado || LEGADO[estado]?.subestado || null);
  if (!sub || !(SUBESTADOS_POR_ESTADO[e.estado] || []).includes(sub)) return principal;
  return `<span class="estado-orden-grupo${enLinea ? ' estado-orden-grupo--linea' : ''}">${principal}${htmlSubestado(sub)}</span>`;
}

/** Verbo de la acción que pasa una orden a `estado` (Aprobar, Iniciar alistamiento, Cerrar, Cancelar) */
export const accionEstado = (estado) => infoEstado(estado).accion || etiquetaEstado(estado);

/** Colores en línea de la etiqueta de un estado, para botones propios de cada página */
export function estiloEstado(estado) {
  const e = infoEstado(estado);
  return `background:${e.fondo};color:${e.texto};border:1px solid ${e.texto};`;
}

/**
 * Botón de cambio de estado: el verbo con el aspecto de la etiqueta del estado de destino
 * (Cerrar con el de Cerrada, Cancelar con el de Cancelada). Igual en todas las pantallas.
 * texto: reemplaza el verbo; pequeno: tamaño de los botones de tarjeta.
 */
export function htmlBotonEstado(estado, accion, { texto, pequeno = false } = {}) {
  const e = infoEstado(estado);
  const verbo = texto || accionEstado(estado);
  return `<button type="button" class="boton-estado${pequeno ? ' boton-estado--sm' : ''}" data-estado="${e.estado}" onclick="${accion}" style="${estiloEstado(estado)}" title="${verbo}">`
    + `<i class="bi ${e.icono}" aria-hidden="true"></i>${verbo}</button>`;
}

/** Opción de un menú de cambio de estado: el verbo con el aspecto de la etiqueta */
export function htmlAccionEstado(estado) {
  const e = infoEstado(estado);
  return `<span class="estado-orden estado-orden--accion" data-estado="${e.estado}" style="${estiloEstado(estado)}">`
    + `<i class="bi ${e.icono}" aria-hidden="true"></i>${accionEstado(estado)}</span>`;
}

/**
 * Confirmación antes de cambiar de estado. Solo Cancelar la pide (no se puede deshacer
 * desde la tabla); el resto devuelve true sin preguntar.
 */
export function confirmarCambioEstado(estado, orden) {
  if (normalizarEstado(estado) !== 'cancelada' || typeof window === 'undefined') return true;
  const num = orden?.numero_orden || (orden?.id || '').substring(0, 8);
  return window.confirm(`¿Cancelar la orden ${num}?\n\nLa orden pasa a Cancelada y no sigue a despacho.`);
}

/**
 * Etiqueta de una opción del filtro. En la lista (enLista), un subestado va solo y con
 * sangría bajo el título Cerrada; como valor elegido ('cerrada/parcial') se muestra
 * Cerrada + Parcial en una línea, para que se entienda sin la lista.
 */
export function htmlFiltroEstado(valor, { enLista = false } = {}) {
  if (!valor) return '';
  const [estado, sub] = valor.split('/');
  if (!sub) return htmlEstado(estado);
  return enLista ? htmlSubestado(sub) : htmlEstado(estado, sub, { enLinea: true });
}

/**
 * Convierte un <select> de estado en un desplegable que muestra las mismas etiquetas
 * (ícono y color) que el resto de la app. El <select> queda oculto y sigue siendo la
 * fuente del valor: al elegir se actualiza y se dispara 'change', así el código de
 * cada página no cambia. Opciones cuyo valor no es un estado (p. ej. "Todos" o
 * "Con mensajes sin leer") se muestran como texto. Llamar de nuevo refresca textos.
 */
export function mejorarSelectorEstado(select) {
  if (!select || typeof document === 'undefined') return;
  let caja = select._selectorEstado;
  if (!caja) {
    caja = document.createElement('div');
    caja.className = 'selector-estado';
    caja.innerHTML = '<button type="button" class="selector-estado-boton"></button><div class="selector-estado-lista" role="listbox"></div>';
    // Conserva el lugar del <select> en barras de filtros flex (order, ancho)
    const estilo = getComputedStyle(select);
    caja.style.order = estilo.order;
    caja.style.flex = estilo.flex;
    select.style.display = 'none';
    select.insertAdjacentElement('afterend', caja);
    select._selectorEstado = caja;
    caja.querySelector('.selector-estado-boton').addEventListener('click', (ev) => {
      ev.stopPropagation();
      document.querySelectorAll('.selector-estado.abierto').forEach(c => { if (c !== caja) c.classList.remove('abierto'); });
      caja.classList.toggle('abierto');
    });
    caja.querySelector('.selector-estado-lista').addEventListener('click', (ev) => {
      const op = ev.target.closest('.selector-estado-opcion');
      if (!op) return;
      ev.stopPropagation();
      select.value = op.dataset.valor;
      caja.classList.remove('abierto');
      mejorarSelectorEstado(select);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    select.addEventListener('change', () => mejorarSelectorEstado(select));
    document.addEventListener('click', () => caja.classList.remove('abierto'));
  }
  const contenido = (op, enLista) => {
    const [estado, sub] = op.value.split('/');
    if (op.value && POR_ESTADO[estado] && (!sub || POR_SUB[sub])) return htmlFiltroEstado(op.value, { enLista });
    return `<span>${op.textContent}</span>`;
  };
  const elegida = select.options[select.selectedIndex] || select.options[0];
  caja.querySelector('.selector-estado-boton').innerHTML = elegida ? contenido(elegida) : '';
  caja.querySelector('.selector-estado-lista').innerHTML = [...select.options].map(op => {
    const sep = op.dataset.separador === 'antes' ? '<div class="selector-estado-sep"></div>' : '';
    const esSub = op.value.includes('/');
    return `${sep}<button type="button" class="selector-estado-opcion${esSub ? ' selector-estado-opcion--sub' : ''}${op.value === select.value ? ' activa' : ''}" data-valor="${op.value}">${contenido(op, true)}</button>`;
  }).join('');
}

/** Opciones <option> del filtro de estado (para llenar un <select>) */
export function opcionesFiltroEstado() {
  return FILTROS_ESTADO.map(f => {
    const [estado, sub] = f.valor.split('/');
    const texto = sub ? `   ${infoSubestado(sub).etiqueta}` : ESTADOS_ORDEN_LABELS[estado];
    return `<option value="${f.valor}"${f.valor === 'cancelada' ? ' data-separador="antes"' : ''}>${texto}</option>`;
  }).join('');
}
