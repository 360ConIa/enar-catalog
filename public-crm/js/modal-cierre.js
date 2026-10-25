/**
 * ============================================
 * CIERRE DE MODALES (compartido B2B y CRM)
 * ============================================
 * Archivo: modal-cierre.js  (misma copia en public/js y public-crm/js)
 * Descripción: Cualquier modal abierto se cierra al hacer clic en el fondo
 *              oscuro o con Esc. Cubre los cuatro tipos que usan las apps:
 *                .modal-overlay.active      (admin, mis-ordenes)
 *                .crm-modal-overlay.open    (vendedor, crm-*)
 *                .modal.show                (Bootstrap: catálogo, login)
 *                .modal:not(.fade) visible  (modales propios del catálogo)
 *              Cierra pulsando el botón de cerrar del propio modal, así corre la
 *              lógica de cada página (limpiezas, listeners). Los botones de
 *              cerrar y cancelar siguen igual.
 *
 * Cambios sin guardar: si el usuario modificó un campo del modal (input,
 * select, textarea) desde que se abrió, se pide confirmación antes de cerrarlo
 * con el fondo o Esc. No cuentan los buscadores ni los filtros (type=search,
 * id/clase/placeholder con "buscar", "search" o "filtro") ni lo marcado con
 * data-sin-cambios. Un modal con data-autoguardado (guarda al instante) nunca
 * pide confirmación.
 *
 * Para cambios que no viven en campos (p. ej. productos de una orden):
 *   ModalCierre.registrar('modalProductos', () => JSON.stringify(estado))
 * La función se evalúa al abrir el modal y al intentar cerrarlo; si el valor
 * cambió, hay cambios sin guardar. Con { soloEstado: true } se ignoran los
 * campos y decide solo la función.
 *
 * Uso: <script src="js/modal-cierre.js" defer></script> en el <head>.
 * ============================================
 */
(function () {
  const MENSAJE = 'Hay cambios sin guardar en esta ventana.\n\n¿Cerrarla y descartarlos?';
  const BOTONES_CERRAR = [
    '.modal-close', '.crm-modal-close', '.modal__cerrar', '[data-cerrar-modal]',
    '.galeria__cerrar', '[data-bs-dismiss="modal"]', '.btn-close'
  ].join(',');
  const NO_CUENTA = /buscar|search|filtro/i;

  const ganchos = new Map();       // id -> { fn, soloEstado }
  const estadoInicial = new WeakMap();
  const camposTocados = new WeakSet();

  function tipo(el) {
    if (el.classList.contains('modal-overlay')) return 'overlay';
    if (el.classList.contains('crm-modal-overlay')) return 'crm';
    if (el.classList.contains('modal') && el.classList.contains('fade')) return 'bootstrap';
    if (el.classList.contains('modal')) return 'catalogo';
    return null;
  }

  function estaAbierto(el) {
    switch (tipo(el)) {
      case 'overlay': return el.classList.contains('active');
      case 'crm': return el.classList.contains('open');
      case 'bootstrap': return el.classList.contains('show');
      case 'catalogo': return el.style.display !== 'none' && getComputedStyle(el).display !== 'none';
      default: return false;
    }
  }

  const todos = () => Array.from(document.querySelectorAll('.modal-overlay, .crm-modal-overlay, .modal'));

  function abiertoSuperior() {
    const abiertos = todos().filter(estaAbierto);
    if (!abiertos.length) return null;
    const z = el => parseInt(getComputedStyle(el).zIndex, 10) || 0;
    return abiertos.reduce((a, b) => (z(b) >= z(a) ? b : a));
  }

  /** ¿El clic fue en el fondo oscuro del modal (no en su contenido)? */
  function esFondo(modal, objetivo) {
    if (objetivo === modal) return true;
    return tipo(modal) === 'catalogo' && objetivo.classList?.contains('modal__overlay') && objetivo.parentElement === modal;
  }

  function valorGancho(modal) {
    const g = ganchos.get(modal.id);
    if (!g) return undefined;
    try { return String(g.fn()); } catch (e) { return undefined; }
  }

  function tieneCambios(modal) {
    if (modal.hasAttribute('data-autoguardado')) return false;
    const g = ganchos.get(modal.id);
    const cambioEstado = g ? valorGancho(modal) !== estadoInicial.get(modal) : false;
    if (g && g.soloEstado) return cambioEstado;
    return cambioEstado || camposTocados.has(modal);
  }

  function alAbrir(modal) {
    camposTocados.delete(modal);
    estadoInicial.set(modal, valorGancho(modal));
  }

  function cerrar(modal) {
    const boton = modal.querySelector(BOTONES_CERRAR);
    if (boton) { boton.click(); return; }
    switch (tipo(modal)) {
      case 'overlay': modal.classList.remove('active'); break;
      case 'crm': modal.classList.remove('open'); break;
      case 'bootstrap': window.bootstrap?.Modal.getOrCreateInstance(modal).hide(); break;
      case 'catalogo': modal.style.display = 'none'; document.body.style.overflow = ''; break;
    }
  }

  function intentarCerrar(modal) {
    if (tieneCambios(modal) && !window.confirm(MENSAJE)) return;
    cerrar(modal);
  }

  // Clic en el fondo: solo si el botón se presionó y se soltó en el fondo
  // (arrastrar una selección desde un campo hasta fuera no cierra).
  let presionadoEn = null;
  document.addEventListener('mousedown', e => { presionadoEn = e.target; }, true);
  document.addEventListener('click', e => {
    const modal = abiertoSuperior();
    if (!modal || !esFondo(modal, e.target) || !esFondo(modal, presionadoEn || e.target)) return;
    // Fase de captura: la página y Bootstrap no reciben este clic; se cierra aquí
    e.stopPropagation();
    e.preventDefault();
    intentarCerrar(modal);
  }, true);

  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.isComposing) return;
    const modal = abiertoSuperior();
    if (!modal) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    intentarCerrar(modal);
  }, true);

  // Cambios del usuario en campos del modal (los valores puestos por código no disparan eventos)
  function marcarCampo(e) {
    const campo = e.target;
    if (!e.isTrusted || !campo.matches?.('input, select, textarea')) return;
    const modal = campo.closest('.modal-overlay, .crm-modal-overlay, .modal');
    if (!modal) return;
    if (campo.type === 'search' || campo.readOnly || campo.closest('[data-sin-cambios]')) return;
    if (NO_CUENTA.test(`${campo.id} ${campo.className} ${campo.placeholder || ''}`)) return;
    camposTocados.add(modal);
  }
  document.addEventListener('input', marcarCampo, true);
  document.addEventListener('change', marcarCampo, true);

  // Al abrirse cada modal se reinician sus cambios (observa class y style)
  function vigilar(modal) {
    if (modal.dataset.cierreVigilado) return;
    modal.dataset.cierreVigilado = '1';
    let abierto = estaAbierto(modal);
    new MutationObserver(() => {
      const ahora = estaAbierto(modal);
      if (ahora && !abierto) alAbrir(modal);
      abierto = ahora;
    }).observe(modal, { attributes: true, attributeFilter: ['class', 'style'] });
  }

  function iniciar() {
    todos().forEach(vigilar);
    new MutationObserver(() => todos().forEach(vigilar)).observe(document.body, { childList: true, subtree: true });
  }

  window.ModalCierre = {
    registrar(id, fn, opciones = {}) { ganchos.set(id, { fn, soloEstado: !!opciones.soloEstado }); },
    tieneCambios: id => { const m = document.getElementById(id); return m ? tieneCambios(m) : false; },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
