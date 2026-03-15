/**
 * Resize de columnas por arrastre — #tablaProductos
 * Solo desktop (no touch devices)
 */
(function () {
  const GRIP_WIDTH = 8;
  const MIN_COL_WIDTH = 40;

  let table, thead;
  let dragging = false;
  let didDrag = false;
  let startX, startWidth, targetTh;
  let activeGrip = null;

  function init() {
    table = document.getElementById('tablaProductos');
    if (!table) return;
    thead = table.querySelector('thead');
    if (!thead) return;

    // No activar en touch devices
    if ('ontouchstart' in window) return;

    // Agregar grip visual a cada th
    const ths = thead.querySelectorAll('th');
    ths.forEach(th => {
      th.style.position = 'relative';
      const grip = document.createElement('div');
      grip.className = 'col-resize-grip';
      grip.style.cssText = `
        position: absolute;
        top: 0;
        right: 0;
        width: ${GRIP_WIDTH}px;
        height: 100%;
        cursor: col-resize;
        background: transparent;
        transition: background 0.15s;
        z-index: 1;
      `;
      grip.addEventListener('mouseenter', () => {
        if (!dragging) grip.style.background = 'rgba(255,255,255,0.5)';
      });
      grip.addEventListener('mouseleave', () => {
        if (!dragging) grip.style.background = 'transparent';
      });
      grip.addEventListener('mousedown', (e) => onMouseDown(e, th, grip));
      // Bloquear click en el grip para que no active ordenamiento
      grip.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
      });
      th.appendChild(grip);
    });

    // Bloquear click en th después de un arrastre
    thead.addEventListener('click', (e) => {
      if (didDrag) {
        e.stopPropagation();
        e.preventDefault();
        didDrag = false;
      }
    }, true);

    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', onDragEnd);
  }

  function onMouseDown(e, th, grip) {
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    targetTh = th;
    activeGrip = grip;
    startX = e.clientX;
    startWidth = th.offsetWidth;

    grip.style.background = 'rgba(255,255,255,0.7)';
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  function onDrag(e) {
    if (!dragging) return;
    didDrag = true;
    const diff = e.clientX - startX;
    const newWidth = Math.max(MIN_COL_WIDTH, startWidth + diff);
    targetTh.style.width = newWidth + 'px';
  }

  function onDragEnd() {
    if (!dragging) return;
    dragging = false;
    if (activeGrip) activeGrip.style.background = 'transparent';
    activeGrip = null;
    targetTh = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
