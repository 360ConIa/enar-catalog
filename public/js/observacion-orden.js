/**
 * ============================================
 * OBSERVACIÓN DE LA ORDEN
 * ============================================
 * Archivo: observacion-orden.js
 * Descripción: Recuadro ámbar con la observación escrita al crear la orden, igual en
 * todas las vistas: tarjeta de Despachos (contraíble), modal de alistamiento, detalle
 * desplegable y detalle de orden (CRM Órdenes, vendedor, admin). Inyecta sus estilos.
 * Existe igual en public/js y public-crm/js: si se cambia uno, copiar al otro.
 * ============================================
 */

const CSS = `
.crm-observacion {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex: 1 1 220px;
  min-width: 0;
  padding: 7px 12px;
  background: #fef3c7;
  border-left: 4px solid #d97706;
  border-radius: 6px;
  color: #78350f;
  font-size: 0.82rem;
  line-height: 1.4;
}

.crm-observacion-icono {
  color: #d97706;
  font-size: 0.95rem;
  line-height: 1.3;
}

.crm-observacion-texto {
  flex: 1;
  min-width: 0;
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.crm-observacion-texto strong {
  color: #92400e;
}

/* Tarjeta: contraída en una línea; clic para desplegar y volver a contraer */
.crm-observacion--contraible {
  cursor: pointer;
  user-select: none;
}

.crm-observacion--compacta,
.crm-observacion--contraible:not(.abierta) {
  flex: 0 1 auto;
  font-weight: 600;
}

.crm-observacion--contraible:not(.abierta) .crm-observacion-corta {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.crm-observacion--contraible:hover,
.crm-observacion--contraible:focus-visible {
  background: #fde68a;
  outline: none;
}

.crm-observacion--contraible .crm-observacion-larga,
.crm-observacion--contraible.abierta .crm-observacion-corta { display: none; }
.crm-observacion--contraible.abierta .crm-observacion-larga { display: block; }
`;

function inyectarCSS() {
  if (typeof document === 'undefined' || document.getElementById('estilos-observacion-orden')) return;
  const style = document.createElement('style');
  style.id = 'estilos-observacion-orden';
  style.textContent = CSS;
  document.head.appendChild(style);
}
inyectarCSS();

// Las escritas al crear la orden (B2B, CRM y vendedor guardan `observaciones`)
export function observacionOrden(orden) {
  return String(orden.observaciones || orden.notas || '').trim();
}

function escaparHtml(texto) {
  return texto.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const OBS_CORTA = 15;

// contraible: en la tarjeta sale en una línea (ícono + 15 caracteres + "…") y un clic
// la despliega o la vuelve a contraer; en el modal y el detalle va completa
export function htmlObservacion(orden, contraible = false) {
  const obs = observacionOrden(orden);
  if (!obs) return '';
  const letras = Array.from(obs);
  const completa = `<strong>Observación:</strong> ${escaparHtml(obs)}`;
  if (!contraible || letras.length <= OBS_CORTA) {
    return `
    <div class="crm-observacion${contraible ? ' crm-observacion--compacta' : ''}">
      <i class="bi bi-exclamation-triangle-fill crm-observacion-icono"></i>
      <div class="crm-observacion-texto">${contraible ? escaparHtml(obs) : completa}</div>
    </div>`;
  }
  const corta = escaparHtml(letras.slice(0, OBS_CORTA).join('').trimEnd()) + '…';
  return `
    <div class="crm-observacion crm-observacion--contraible" role="button" tabindex="0" title="Ver observación"
      onclick="toggleObservacion(this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleObservacion(this)}">
      <i class="bi bi-exclamation-triangle-fill crm-observacion-icono"></i>
      <div class="crm-observacion-texto crm-observacion-corta">${corta}</div>
      <div class="crm-observacion-texto crm-observacion-larga">${completa}</div>
    </div>`;
}

// Clic en la observación contraíble (onclick en el HTML generado)
if (typeof window !== 'undefined') {
  window.toggleObservacion = function(box) {
    const abierta = box.classList.toggle('abierta');
    box.title = abierta ? 'Contraer observación' : 'Ver observación';
  };
}
