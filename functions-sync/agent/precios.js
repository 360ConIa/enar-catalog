/**
 * Precios del agente IA: misma regla que el catálogo B2B
 *
 * - La lista del cliente es usuarios.tipo_cliente. Su campo de precio sale de
 *   configuracion/listas_precios (lista con id === tipo_cliente, activa), así
 *   que incluye "nuevos" (precio_nuevos) y cualquier lista que se agregue.
 * - Si el tipo_cliente no corresponde a ninguna lista activa, se usa
 *   persona_natural, igual que obtenerPrecioCliente() en public/js/usuario.js.
 * - Nunca se usa precio_lista (costo base) ni p_real/p_corriente.
 * - Los precios por lista ya incluyen IVA: el total es Σ precio × cantidad y
 *   el subtotal y el IVA se EXTRAEN del total, como ordenes.js (B2B).
 */

const admin = require('firebase-admin');

const LISTA_POR_DEFECTO = 'persona_natural';

/**
 * Lista de precios del usuario: { id, campo, iva, nombre }
 */
async function obtenerListaCliente(userId) {
  const db = admin.firestore();
  const [userDoc, cfgDoc] = await Promise.all([
    userId ? db.collection('usuarios').doc(userId).get() : null,
    db.collection('configuracion').doc('listas_precios').get(),
  ]);
  const listas = ((cfgDoc.exists && cfgDoc.data().listas) || [])
    .filter(l => l.activa !== false && l.campo_firestore);
  const tipo = userDoc && userDoc.exists ? userDoc.data().tipo_cliente : null;
  const lista = listas.find(l => l.id === tipo) || listas.find(l => l.id === LISTA_POR_DEFECTO);
  if (!lista) throw new Error('No hay lista de precios configurada en configuracion/listas_precios');
  return {
    id: lista.id,
    campo: lista.campo_firestore,
    iva: Number.isFinite(lista.iva) ? lista.iva : 19,
    nombre: lista.nombre || lista.id,
  };
}

/**
 * Precio (con IVA) del producto para la lista; null si no tiene precio en esa lista
 */
function precioProducto(producto, lista) {
  const precio = producto[lista.campo];
  return typeof precio === 'number' && precio > 0 ? precio : null;
}

/**
 * Subtotal e IVA extraídos de un total que ya incluye IVA
 */
function desglosarTotal(total, ivaPorcentaje) {
  const subtotal = total / (1 + ivaPorcentaje / 100);
  return { total, subtotal, iva: total - subtotal };
}

module.exports = { obtenerListaCliente, precioProducto, desglosarTotal };
