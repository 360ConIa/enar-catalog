/**
 * ============================================
 * CABECERA FIJA Y MODALES
 * ============================================
 * Archivo: cabecera-fija.js
 * Descripción: Publica en --alto-cabecera el alto real de la cabecera fija
 *              (.crm-header, sticky, z-index 1200), que cambia al hacer wrap
 *              en celular. css/crm-styles.css lo usa para abrir los modales
 *              (.modal-overlay, .crm-modal-overlay y Bootstrap .modal) debajo
 *              de la cabecera, con el título visible y scroll propio.
 * Uso: <script src="js/cabecera-fija.js" defer></script>
 * ============================================
 */
(function () {
  function iniciar() {
    const cabecera = document.querySelector('.crm-header');
    if (!cabecera) return;
    const medir = () => document.documentElement.style.setProperty('--alto-cabecera', cabecera.offsetHeight + 'px');
    medir();
    if ('ResizeObserver' in window) new ResizeObserver(medir).observe(cabecera);
    window.addEventListener('resize', medir);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
