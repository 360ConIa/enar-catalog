/**
 * ============================================
 * DESPACHO EN EL DETALLE DE ORDEN (B2B)
 * ============================================
 * Archivo: despacho.js
 * Descripción: Muestra en el detalle de orden lo que registra el módulo de
 *              Despachos del CRM (public-crm/js/crm-despachos.js):
 *   - Cantidad despachada por ítem: ordenes/{id}.items[].cantidad_real, válida
 *     cuando items[].estado_alistamiento es 'comp', 'parcial' o 'sinstock'.
 *   - Mensajes internos: colección chat_ordenes (orden_id, usuario_nombre,
 *     mensaje, tipo_usuario, created_at). Solo para admin, gestor, vendedor y
 *     despachos (firestore.rules: chat_ordenes read = isCRM()); nunca se piden
 *     desde la vista del cliente.
 * Los precios incluyen IVA: el total despachado es Σ precio × despachada y el
 * subtotal y el IVA se extraen de él, como en ordenes.js.
 * ============================================
 */

import { getApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getFirestore, collection, doc, getDoc, getDocs, query, where, orderBy
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const IVA_PORCENTAJE = 0.19;
const ESTADOS_ALISTAMIENTO = ['comp', 'parcial', 'sinstock'];

const db = () => getFirestore(getApp());

const precio = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');

export function escaparHTML(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function fechaHora(valor) {
  if (!valor) return '';
  const d = valor.toDate ? valor.toDate() : new Date(valor);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Cantidad despachada del ítem, o null si Despachos aún no lo registró */
export function cantidadDespachada(item) {
  if (!ESTADOS_ALISTAMIENTO.includes(item.estado_alistamiento)) return null;
  if (item.estado_alistamiento === 'sinstock') return 0;
  if (typeof item.cantidad_real === 'number') return item.cantidad_real;
  return item.estado_alistamiento === 'comp' ? (item.cantidad || 0) : null;
}

/**
 * Pedido vs despachado. hayDespacho = algún ítem registrado; el total
 * recalculado usa lo despachado y, en ítems sin registrar, lo pedido.
 */
export function resumenDespacho(orden) {
  const items = (orden.items || orden.productos || []).map(item => {
    const pedida = item.cantidad || 0;
    const despachada = cantidadDespachada(item);
    const usada = despachada ?? pedida;
    return { item, pedida, despachada, diferencia: despachada !== null && despachada !== pedida, subtotal: (item.precio_unitario || 0) * usada };
  });
  const hayDespacho = items.some(i => i.despachada !== null);
  const total = items.reduce((s, i) => s + i.subtotal, 0);
  const subtotal = total / (1 + IVA_PORCENTAJE);
  return {
    items, hayDespacho,
    hayDiferencias: items.some(i => i.diferencia),
    sinRegistrar: items.filter(i => i.despachada === null).length,
    total, subtotal, iva: total - subtotal,
  };
}

/** Celda "Cant.": pedida y, si existe, despachada resaltando la diferencia */
export function htmlCantidad(fila) {
  if (fila.despachada === null) return `${fila.pedida}`;
  if (!fila.diferencia) return `${fila.pedida} <span title="Despachada completa" style="color:#16a34a;">✓</span>`;
  return `<span style="text-decoration:line-through;color:#94a3b8;" title="Pedida">${fila.pedida}</span>
    <span title="Despachada" style="display:inline-block;margin-left:4px;padding:1px 7px;border-radius:10px;background:#fef3c7;color:#92400e;font-weight:700;">${fila.despachada}</span>`;
}

/** Bloque de totales despachados (vacío si Despachos no registró nada) */
export function htmlTotalesDespacho(resumen, totalOriginal) {
  if (!resumen.hayDespacho) return '';
  const cambio = Math.round(resumen.total) !== Math.round(totalOriginal || 0);
  return `
    <div style="margin-top:10px;padding:10px 12px;border-radius:8px;background:${resumen.hayDiferencias ? '#fffbeb' : '#f0fdf4'};border:1px solid ${resumen.hayDiferencias ? '#fcd34d' : '#bbf7d0'};font-size:13px;">
      <div style="font-weight:600;margin-bottom:6px;">📦 Según despacho${resumen.hayDiferencias ? ' (con diferencias)' : ''}</div>
      <div style="display:flex;justify-content:space-between;"><span>Subtotal (sin IVA)</span><span>${precio(resumen.subtotal)}</span></div>
      <div style="display:flex;justify-content:space-between;"><span>IVA (19%)</span><span>${precio(resumen.iva)}</span></div>
      <div style="display:flex;justify-content:space-between;font-weight:700;font-size:14px;margin-top:4px;"><span>Total despachado</span><span>${precio(resumen.total)}</span></div>
      ${cambio ? `<div style="color:#92400e;margin-top:4px;">Total pedido: ${precio(totalOriginal)}</div>` : ''}
      ${resumen.sinRegistrar ? `<div style="color:#64748b;margin-top:4px;">${resumen.sinRegistrar} ítem(s) aún sin registrar en despacho: se cuentan con la cantidad pedida.</div>` : ''}
    </div>`;
}

/** Orden recién leída de Firestore (el listado puede estar desactualizado) */
export async function leerOrdenActual(ordenId) {
  const snap = await getDoc(doc(db(), 'ordenes', ordenId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Mensajes internos de despacho. Solo para personal (admin, gestor, vendedor) */
export async function cargarMensajesDespacho(ordenId) {
  const snap = await getDocs(query(collection(db(), 'chat_ordenes'), where('orden_id', '==', ordenId), orderBy('created_at', 'asc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function htmlMensajesDespacho(mensajes) {
  const cuerpo = mensajes.length === 0
    ? '<p style="color:#64748b;font-size:13px;margin:0;">Sin mensajes de despacho.</p>'
    : mensajes.map(m => `
      <div style="padding:8px 10px;border-left:3px solid #3b82f6;background:#f8fafc;border-radius:4px;margin-bottom:6px;">
        <div style="font-size:12px;color:#64748b;"><strong style="color:#1e293b;">${escaparHTML(m.usuario_nombre || m.usuario || 'Sistema')}</strong>${m.tipo_usuario ? ` · ${escaparHTML(m.tipo_usuario)}` : ''} · ${fechaHora(m.created_at)}</div>
        <div style="font-size:13px;white-space:pre-wrap;margin-top:2px;">${escaparHTML(m.mensaje)}</div>
      </div>`).join('');
  return `
    <div style="margin-top:15px;">
      <h4 style="font-size:14px;margin:0 0 8px;">💬 Mensajes internos de despacho <span style="font-weight:400;font-size:11px;color:#64748b;">(no los ve el cliente)</span></h4>
      ${cuerpo}
    </div>`;
}
