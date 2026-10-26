/**
 * ============================================
 * MENSAJES INTERNOS DE ÓRDENES (B2B)
 * ============================================
 * Archivo: chat-ordenes.js
 * Descripción: avisos de mensajes sin leer y conversación de la colección
 * chat_ordenes en admin.html y vendedor.html. Mismo modelo que el CRM
 * (public-crm/js/crm-ordenes.js y crm-despachos.js):
 *   - Mensaje: { orden_id, usuario, usuario_id, usuario_nombre, mensaje,
 *     tipo_usuario, tipo: 'Chat', created_at (ISO) }.
 *   - Lectura por usuario: usuarios/{uid}.chat_lecturas.{ordenId} = ISO del
 *     último momento en que vio esa conversación. No toca a los demás usuarios.
 *   - Sin leer = mensajes de otros con created_at posterior a esa lectura.
 * Permisos (firestore.rules, match chat_ordenes): quien lee los mensajes de una orden
 * también puede escribirlos. Personal interno: todas las órdenes; vendedor
 * externo: solo las que él creó (por eso escucha orden por orden). Clientes: nunca.
 * ============================================
 */

import { getApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getFirestore, collection, doc, addDoc, updateDoc, query, where, orderBy, limit, onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { escaparHTML } from './despacho.js';

const db = () => getFirestore(getApp());
const LIMITE_MENSAJES = 500;

const iso = (v) => {
  if (!v) return '';
  if (typeof v === 'string') return v;
  const d = v.toDate ? v.toDate() : new Date(v);
  return isNaN(d.getTime()) ? '' : d.toISOString();
};

/**
 * Avisos de mensajes sin leer.
 * @param {object} o
 * @param {string} o.uid            usuario actual
 * @param {boolean} o.externo       vendedor externo (escucha solo sus órdenes)
 * @param {object} o.lecturas       usuarios/{uid}.chat_lecturas
 * @param {function} o.alCambiar    se llama cuando cambian los contadores
 */
export function crearAvisosChat({ uid, externo = false, lecturas = {}, alCambiar = () => {} }) {
  const porOrden = new Map();               // ordenId → [{ created_at, usuario_id }]
  const leidas = new Map(Object.entries(lecturas || {}));
  const unsubs = new Map();                 // externo: ordenId → unsubscribe
  let unsubGeneral = null;

  const resumir = (d) => ({ created_at: iso(d.data().created_at), usuario_id: d.data().usuario_id });

  if (!externo) {
    const q = query(collection(db(), 'chat_ordenes'), orderBy('created_at', 'desc'), limit(LIMITE_MENSAJES));
    unsubGeneral = onSnapshot(q, (snap) => {
      porOrden.clear();
      snap.forEach(d => {
        const ordenId = d.data().orden_id;
        if (!ordenId) return;
        if (!porOrden.has(ordenId)) porOrden.set(ordenId, []);
        porOrden.get(ordenId).push(resumir(d));
      });
      alCambiar();
    }, (e) => console.error('Avisos de chat:', e));
  }

  function noLeidos(ordenId) {
    const mensajes = porOrden.get(ordenId);
    if (!mensajes) return 0;
    const ultima = leidas.get(ordenId) || '';
    return mensajes.filter(m => m.usuario_id !== uid && m.created_at > ultima).length;
  }

  return {
    noLeidos,

    /** Cuántas de estas órdenes tienen mensajes sin leer */
    ordenesConNoLeidos(ids) {
      let n = 0;
      for (const id of ids) if (noLeidos(id) > 0) n++;
      return n;
    },

    /** Vendedor externo: escucha los mensajes de las órdenes que puede ver */
    sincronizarOrdenes(ids) {
      if (!externo) return;
      const vigentes = new Set(ids);
      for (const [id, unsub] of unsubs) {
        if (!vigentes.has(id)) { unsub(); unsubs.delete(id); porOrden.delete(id); }
      }
      for (const id of vigentes) {
        if (unsubs.has(id)) continue;
        const q = query(collection(db(), 'chat_ordenes'), where('orden_id', '==', id), orderBy('created_at', 'asc'));
        unsubs.set(id, onSnapshot(q, (snap) => {
          porOrden.set(id, snap.docs.map(resumir));
          alCambiar();
        }, (e) => console.error('Avisos de chat (externo):', e)));
      }
    },

    /**
     * Marca la conversación como vista. mensajes: los que la página acaba de mostrar
     * (pueden llegar antes que el listener de avisos). La marca es la hora actual, o el
     * último mensaje si su reloj iba adelantado, para que no quede como no leído.
     */
    async marcarLeida(ordenId, mensajes = []) {
      const ultimo = [...(porOrden.get(ordenId) || []), ...mensajes.map(m => ({ created_at: iso(m.created_at), usuario_id: m.usuario_id }))]
        .filter(m => m.usuario_id !== uid)
        .reduce((max, m) => m.created_at > max ? m.created_at : max, '');
      const previa = leidas.get(ordenId) || '';
      if (!ultimo || previa >= ultimo) return;
      const ahora = new Date().toISOString();
      const marca = ultimo > ahora ? ultimo : ahora;
      leidas.set(ordenId, marca);
      alCambiar();
      try {
        await updateDoc(doc(db(), 'usuarios', uid), { [`chat_lecturas.${ordenId}`]: marca });
      } catch (e) {
        console.error('No se pudo guardar la lectura del chat:', e);
      }
    },

    detener() {
      if (unsubGeneral) unsubGeneral();
      unsubs.forEach(u => u());
      unsubs.clear();
    }
  };
}

/** Contador rojo para un botón o enlace (position: relative en el contenedor) */
export function htmlBadgeChat(n, titulo = 'Mensajes sin leer') {
  if (!n) return '';
  return `<span class="chat-badge-no-leidos" title="${n} ${titulo.toLowerCase()}">${n > 9 ? '9+' : n}</span>`;
}

/** Pinta el contador en un elemento existente (cabecera, pestaña) */
export function pintarBadgeChat(el, n) {
  if (!el) return;
  el.textContent = n > 99 ? '99+' : String(n);
  el.style.display = n > 0 ? 'inline-block' : 'none';
}

/** Escucha en vivo la conversación de una orden */
export function escucharConversacion(ordenId, alRecibir, alFallar = () => {}) {
  const q = query(collection(db(), 'chat_ordenes'), where('orden_id', '==', ordenId), orderBy('created_at', 'asc'));
  return onSnapshot(q, (snap) => alRecibir(snap.docs.map(d => ({ id: d.id, ...d.data() }))), alFallar);
}

const TIPO_USUARIO = { despachos: 'Logística', vendedor: 'Ventas', gestor: 'Gestión', admin: 'Admin' };

/** Envía un mensaje con el mismo formato que el CRM */
export async function enviarMensajeChat(ordenId, { uid, email, nombre, rol }, texto) {
  const mensaje = String(texto || '').trim();
  if (!mensaje) return false;
  await addDoc(collection(db(), 'chat_ordenes'), {
    orden_id: ordenId,
    usuario: email,
    usuario_id: uid,
    usuario_nombre: nombre || email,
    mensaje,
    tipo_usuario: TIPO_USUARIO[rol] || 'Admin',
    tipo: 'Chat',
    created_at: new Date().toISOString()
  });
  return true;
}

function fechaHora(valor) {
  if (!valor) return '';
  const d = valor.toDate ? valor.toDate() : new Date(valor);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * Bloque de conversación con caja de respuesta. Los ids van con prefijo para
 * que la página conecte el botón: #chatOrdenLista, #chatOrdenTexto, #chatOrdenEnviar.
 */
export function htmlConversacion(mensajes, uid) {
  const lista = mensajes.length === 0
    ? '<p style="color:#64748b;font-size:13px;margin:0;">Sin mensajes. Escribe el primero.</p>'
    : mensajes.map(m => {
      const propio = m.usuario_id === uid;
      return `
      <div style="padding:8px 10px;border-left:3px solid ${propio ? '#D9232D' : '#3b82f6'};background:${propio ? '#fef2f2' : '#f8fafc'};border-radius:4px;margin-bottom:6px;">
        <div style="font-size:12px;color:#64748b;"><strong style="color:#1e293b;">${propio ? 'Tú' : escaparHTML(m.usuario_nombre || m.usuario || 'Sistema')}</strong>${m.tipo_usuario ? ` · ${escaparHTML(m.tipo_usuario)}` : ''} · ${fechaHora(m.created_at)}</div>
        <div style="font-size:13px;white-space:pre-wrap;margin-top:2px;">${escaparHTML(m.mensaje)}</div>
      </div>`;
    }).join('');
  return `
    <div style="margin-top:15px;">
      <h4 style="font-size:14px;margin:0 0 8px;">💬 Mensajes internos <span style="font-weight:400;font-size:11px;color:#64748b;">(no los ve el cliente)</span></h4>
      <div id="chatOrdenLista" style="max-height:260px;overflow-y:auto;">${lista}</div>
      <div style="display:flex;gap:8px;margin-top:8px;">
        <textarea id="chatOrdenTexto" rows="2" maxlength="2000" placeholder="Escribe un mensaje para el equipo..." style="flex:1;padding:8px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;resize:vertical;font-family:inherit;"></textarea>
        <button type="button" id="chatOrdenEnviar" style="align-self:flex-end;padding:8px 14px;background:#D9232D;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;">Enviar</button>
      </div>
    </div>`;
}

/**
 * Conecta la conversación de una orden dentro de un contenedor del modal de detalle.
 * Escucha en vivo, marca leída mientras el modal está abierto (estaAbierto()) y
 * envía con Enter (Shift+Enter = salto de línea). Devuelve la función para cerrar.
 */
export function montarConversacion(contenedor, ordenId, { usuario, avisos, estaAbierto, alFallarEnvio = () => {} }) {
  let borrador = '';
  const unsub = escucharConversacion(ordenId, (mensajes) => {
    if (!estaAbierto()) { unsub(); return; }
    const caja = contenedor.querySelector('#chatOrdenTexto');
    if (caja) borrador = caja.value;
    const teniaFoco = caja && document.activeElement === caja;
    contenedor.innerHTML = htmlConversacion(mensajes, usuario.uid);
    const nueva = contenedor.querySelector('#chatOrdenTexto');
    nueva.value = borrador;
    if (teniaFoco) nueva.focus();
    const lista = contenedor.querySelector('#chatOrdenLista');
    lista.scrollTop = lista.scrollHeight;
    const enviar = async () => {
      const texto = nueva.value;
      if (!texto.trim()) return;
      const boton = contenedor.querySelector('#chatOrdenEnviar');
      boton.disabled = true;
      try {
        await enviarMensajeChat(ordenId, usuario, texto);
        borrador = '';
        const actual = contenedor.querySelector('#chatOrdenTexto');
        if (actual) actual.value = '';
      } catch (e) {
        console.error('No se pudo enviar el mensaje:', e);
        alFallarEnvio(e);
      } finally {
        const b = contenedor.querySelector('#chatOrdenEnviar');
        if (b) b.disabled = false;
      }
    };
    contenedor.querySelector('#chatOrdenEnviar').addEventListener('click', enviar);
    nueva.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); enviar(); }
    });
    avisos?.marcarLeida(ordenId, mensajes);
  }, (e) => {
    console.warn('No se pudieron cargar los mensajes:', e);
    contenedor.innerHTML = '';
  });
  return unsub;
}

// Estilo del contador (una sola vez por página)
if (!document.getElementById('estilo-chat-badge')) {
  const s = document.createElement('style');
  s.id = 'estilo-chat-badge';
  s.textContent = `.chat-badge-no-leidos{position:absolute;top:-6px;right:-6px;background:#D9232D;color:#fff;border-radius:10px;padding:0 5px;font-size:10px;font-weight:700;min-width:16px;text-align:center;line-height:15px;pointer-events:none;border:1.5px solid #fff;}
.chat-badge-cabecera{display:none;margin-left:6px;background:#fff;color:#D9232D;border:1.5px solid #D9232D;border-radius:10px;padding:0 6px;font-size:11px;font-weight:700;line-height:16px;cursor:pointer;vertical-align:middle;}`;
  document.head.appendChild(s);
}
