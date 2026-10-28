/**
 * ============================================
 * PESO DE UNA ORDEN
 * ============================================
 * Archivo: peso-orden.js
 * Descripción: Cálculo único del peso total de una orden (tarjeta de Despachos y
 * columna Peso de las tablas de órdenes). Existe igual en public/js y public-crm/js:
 * si se cambia uno, copiar al otro.
 *
 * Peso de cada ítem: su `peso_kg` o, si no lo tiene, el del producto
 * (`peso`, `Peso_Kg` o `peso_kg`). Total = Σ peso × cantidad.
 */

/** Peso en kg de un producto (0 si no lo tiene) */
export function pesoProducto(prod) {
  return Number(prod?.peso || prod?.Peso_Kg || prod?.peso_kg) || 0;
}

/**
 * Peso total de una orden.
 * @param {Object} orden
 * @param {Map|Object} productos  catálogo por código (cod_interno o SKU)
 * @returns {{ kg: number, faltantes: number, items: number }} faltantes = ítems sin peso
 */
export function pesoOrden(orden, productos) {
  const items = orden?.items || orden?.productos || [];
  const buscar = cod => (productos instanceof Map ? productos.get(cod) : productos?.[cod]);
  let kg = 0;
  let faltantes = 0;
  items.forEach(item => {
    const prod = buscar(item.cod_interno) || buscar(item.sku);
    const peso = Number(item.peso_kg) || pesoProducto(prod);
    if (peso > 0) kg += peso * (Number(item.cantidad) || 0);
    else faltantes++;
  });
  return { kg, faltantes, items: items.length };
}

/** "1.235 kg": kilos redondeados hacia arriba, separador de miles */
export function formatearKg(kg) {
  return `${new Intl.NumberFormat('es-CO').format(Math.ceil(kg || 0))} kg`;
}

/**
 * Celda de peso: "45 kg"; "—" si ningún producto tiene peso; total parcial con
 * un aviso si falta el peso de algunos.
 */
export function htmlPesoOrden(info) {
  if (!info.items || info.faltantes === info.items) {
    return '<span title="Sin peso registrado en los productos" style="color:#94a3b8;">—</span>';
  }
  if (info.faltantes > 0) {
    const n = info.faltantes;
    const aviso = `Falta el peso de ${n} producto${n === 1 ? '' : 's'}: total parcial`;
    return `<span title="${aviso}" style="white-space:nowrap;">${formatearKg(info.kg)}`
      + `<i class="bi bi-exclamation-triangle-fill" aria-label="${aviso}" style="color:#d97706;font-size:0.75em;margin-left:4px;"></i></span>`;
  }
  return `<span style="white-space:nowrap;">${formatearKg(info.kg)}</span>`;
}
