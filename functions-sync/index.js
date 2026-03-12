const { onRequest } = require('firebase-functions/v2/https');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// Configurar opciones globales
setGlobalOptions({
  region: 'us-central1'
});

/**
 * Función HTTP para sincronizar productos desde Apps Script
 */
exports.syncProductos = onRequest(
  {
    timeoutSeconds: 540,
    memory: '1GiB',
    cors: true
  },
  async (req, res) => {
    // Verificar método POST
    if (req.method !== 'POST') {
      return res.status(405).send('Method not allowed');
    }

    // Obtener productos del body
    const { productos } = req.body;

    if (!productos || !Array.isArray(productos)) {
      return res.status(400).send('Invalid payload');
    }

    console.log(`Sincronizando ${productos.length} productos`);
    const inicio = Date.now();

    try {
      // Procesar en batches de 500 (límite Firestore batch)
      const BATCH_SIZE = 500;
      let procesados = 0;

      for (let i = 0; i < productos.length; i += BATCH_SIZE) {
        const lote = productos.slice(i, i + BATCH_SIZE);
        const batch = db.batch();

        lote.forEach(producto => {
          const docRef = db.collection('productos').doc(String(producto.cod_interno));

          // Datos base del producto
          const datos = {
            cod_interno: String(producto.cod_interno),
            titulo: String(producto.titulo),
            cantidad: Number(producto.cantidad),
            p_real: Number(producto.p_real),
            p_corriente: Number(producto.p_corriente),
            impuesto: Number(producto.impuesto),
            ean: String(producto.ean || ''),
            marca: String(producto.marca || ''),
            laboratorio: String(producto.laboratorio || ''),
            indicacion: String(producto.indicacion || ''),
            principio_activo: String(producto.principio_activo || ''),
            sync_at: admin.firestore.FieldValue.serverTimestamp(),
            updated_at: admin.firestore.FieldValue.serverTimestamp()
          };

          // Solo incluir imagen_principal si tiene valor (no sobrescribir existente)
          if (producto.imagen_principal && producto.imagen_principal.trim() !== '') {
            datos.imagen_principal = String(producto.imagen_principal);
          }

          batch.set(docRef, datos, { merge: true });
        });

        await batch.commit();
        procesados += lote.length;
        console.log(`Procesados: ${procesados}/${productos.length}`);
      }

      const duracion = (Date.now() - inicio) / 1000;

      res.json({
        success: true,
        procesados: procesados,
        duracion: duracion,
        mensaje: `${procesados} productos sincronizados en ${duracion}s`
      });

    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

/**
 * Callable Function para chat con el Asesor Comercial IA
 * Autenticación manejada automáticamente por Firebase
 */
exports.chatAgent = onCall(
  {
    timeoutSeconds: 60,
    memory: '512MiB',
    // Permitir invocaciones públicas (autenticación se verifica en el código)
    invoker: 'public',
    // Secretos de Firebase (API keys seguras)
    secrets: ['GEMINI_API_KEY']
  },
  async (request) => {
    // Verificar autenticación (automática con onCall)
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Debes iniciar sesión para usar el chat');
    }

    const uid = request.auth.uid;
    const { mensaje, historial } = request.data;

    // Validar mensaje
    if (!mensaje) {
      throw new HttpsError('invalid-argument', 'Se requiere el campo "mensaje"');
    }

    console.log('Procesando mensaje para usuario:', uid);

    try {
      // Importar agente
      const { procesarMensaje } = require('./agent/agentConfig');

      // Procesar mensaje con el agente, pasando el user_id para crear órdenes
      const resultado = await procesarMensaje(mensaje, historial || [], uid);

      return {
        success: true,
        respuesta: resultado.respuesta,
        herramientas_usadas: resultado.herramientas_usadas || [],
        usuario: uid,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Error en chatAgent:', error);
      throw new HttpsError('internal', 'Error al procesar el mensaje: ' + error.message);
    }
  }
);

// ═══════════════════════════════════════════════
// CRM FUNCTIONS
// ═══════════════════════════════════════════════

const ADMIN_EMAIL = 'sebastianbumq@enarapp.com';
const ROLES_EXCLUIDOS = ['vendedor', 'despachos', 'admin', 'gestor', 'administrador'];

/**
 * Helper: Verificar que el usuario tiene rol CRM
 */
async function verificarRolCRM(auth) {
  if (!auth) throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
  const userDoc = await db.collection('usuarios').doc(auth.uid).get();
  if (!userDoc.exists) throw new HttpsError('permission-denied', 'Usuario no encontrado');
  const perfil = userDoc.data();
  const esAdmin = auth.token.email === ADMIN_EMAIL || perfil.rol === 'admin';
  const esCRM = esAdmin || ['vendedor', 'despachos', 'gestor'].includes(perfil.rol);
  if (!esCRM) throw new HttpsError('permission-denied', 'No tiene permisos CRM');
  return { perfil, esAdmin };
}

/**
 * Callable: Recalcular métricas de un cliente o todos los clientes
 * Data: { clienteId?: string } - si no se pasa, recalcula todos
 */
exports.recalcularMetricas = onCall(
  { timeoutSeconds: 300, memory: '512MiB' },
  async (request) => {
    const { esAdmin } = await verificarRolCRM(request.auth);
    const { clienteId } = request.data || {};

    console.log('Recalculando métricas', clienteId ? `para cliente ${clienteId}` : 'para todos');

    try {
      // Obtener clientes a procesar
      let clientesIds = [];
      if (clienteId) {
        clientesIds = [clienteId];
      } else {
        const snap = await db.collection('usuarios')
          .where('estado', '==', 'aprobado')
          .get();
        snap.forEach(doc => {
          const data = doc.data();
          if (!ROLES_EXCLUIDOS.includes(data.rol)) {
            clientesIds.push(doc.id);
          }
        });
      }

      // Obtener todas las órdenes completadas/parciales para cálculos
      const ordenesSnap = await db.collection('ordenes').get();
      const ordenesPorCliente = {};
      ordenesSnap.forEach(doc => {
        const orden = doc.data();
        const uid = orden.user_id || orden.clienteUid;
        if (!uid) return;
        if (!ordenesPorCliente[uid]) ordenesPorCliente[uid] = [];
        ordenesPorCliente[uid].push(orden);
      });

      const ahora = new Date();
      const inicioAnio = new Date(ahora.getFullYear(), 0, 1);
      let procesados = 0;
      const BATCH_SIZE = 500;

      for (let i = 0; i < clientesIds.length; i += BATCH_SIZE) {
        const lote = clientesIds.slice(i, i + BATCH_SIZE);
        const batch = db.batch();

        for (const cId of lote) {
          const ordenes = (ordenesPorCliente[cId] || [])
            .filter(o => o.estado !== 'cancelada')
            .sort((a, b) => {
              const fa = a.created_at ? new Date(a.created_at) : new Date(0);
              const fb = b.created_at ? new Date(b.created_at) : new Date(0);
              return fb - fa;
            });

          const ultimaCompra = ordenes.length > 0 && ordenes[0].created_at
            ? new Date(ordenes[0].created_at) : null;
          const diasSinCompra = ultimaCompra
            ? Math.floor((ahora - ultimaCompra) / (1000 * 60 * 60 * 24)) : 999;

          // Calcular frecuencia de compra
          let frecuenciaCompraDias = 0;
          if (ordenes.length >= 2) {
            const fechas = ordenes.map(o => new Date(o.created_at)).filter(d => !isNaN(d));
            if (fechas.length >= 2) {
              const primera = fechas[fechas.length - 1];
              const ultima = fechas[0];
              frecuenciaCompraDias = Math.floor((ultima - primera) / (1000 * 60 * 60 * 24) / (fechas.length - 1));
            }
          }

          // Totales
          const totales = ordenes.map(o => o.total || 0);
          const totalComprasAnio = ordenes
            .filter(o => o.created_at && new Date(o.created_at) >= inicioAnio)
            .reduce((s, o) => s + (o.total || 0), 0);
          const ticketPromedio = totales.length > 0
            ? totales.reduce((a, b) => a + b, 0) / totales.length : 0;
          const compraMinima = totales.length > 0 ? Math.min(...totales) : 0;
          const compraMaxima = totales.length > 0 ? Math.max(...totales) : 0;

          // Productos y unidades promedio
          const productosTicket = ordenes.length > 0
            ? ordenes.reduce((s, o) => s + (o.cantidad_productos || 0), 0) / ordenes.length : 0;
          const unidadesTicket = ordenes.length > 0
            ? ordenes.reduce((s, o) => s + (o.cantidad_unidades || 0), 0) / ordenes.length : 0;

          // Promedio mensual (últimos 6 meses)
          const hace6Meses = new Date(ahora);
          hace6Meses.setMonth(hace6Meses.getMonth() - 6);
          const ventasRecientes = ordenes
            .filter(o => o.created_at && new Date(o.created_at) >= hace6Meses)
            .reduce((s, o) => s + (o.total || 0), 0);
          const promedioMensual = ventasRecientes / 6;

          // Tendencia: comparar últimos 2 meses
          const hace1Mes = new Date(ahora);
          hace1Mes.setMonth(hace1Mes.getMonth() - 1);
          const hace2Meses = new Date(ahora);
          hace2Meses.setMonth(hace2Meses.getMonth() - 2);
          const ventasMesActual = ordenes
            .filter(o => o.created_at && new Date(o.created_at) >= hace1Mes)
            .reduce((s, o) => s + (o.total || 0), 0);
          const ventasMesAnterior = ordenes
            .filter(o => o.created_at && new Date(o.created_at) >= hace2Meses && new Date(o.created_at) < hace1Mes)
            .reduce((s, o) => s + (o.total || 0), 0);

          let tendencia = 'Estable';
          if (ventasMesAnterior > 0) {
            const cambio = ((ventasMesActual - ventasMesAnterior) / ventasMesAnterior) * 100;
            if (cambio > 5) tendencia = 'Creciente';
            else if (cambio < -5) tendencia = 'Decreciente';
          }

          // Estado de salud
          let estadoSalud = 'Saludable';
          if (diasSinCompra > 90 || ordenes.length === 0) estadoSalud = 'Inactivo';
          else if (diasSinCompra > 45) estadoSalud = 'En_Riesgo';

          // Riesgo de abandono
          let riesgoAbandono = 'Bajo';
          if (frecuenciaCompraDias > 0 && diasSinCompra > frecuenciaCompraDias * 2) {
            riesgoAbandono = 'Alto';
          } else if (frecuenciaCompraDias > 0 && diasSinCompra > frecuenciaCompraDias * 1.5) {
            riesgoAbandono = 'Medio';
          } else if (diasSinCompra > 60) {
            riesgoAbandono = 'Alto';
          } else if (diasSinCompra > 30) {
            riesgoAbandono = 'Medio';
          }

          // Clasificación ABC
          let clasificacionABC = 'C';
          if (totalComprasAnio > 5000000) clasificacionABC = 'A';
          else if (totalComprasAnio > 1000000) clasificacionABC = 'B';
          else if (ordenes.length === 0) clasificacionABC = 'SV';

          const metricaRef = db.collection('metricas_clientes').doc(cId);
          batch.set(metricaRef, {
            cliente_id: cId,
            ultima_compra: ultimaCompra ? ultimaCompra.toISOString() : null,
            dias_sin_compra: diasSinCompra,
            frecuencia_compra_dias: frecuenciaCompraDias,
            ticket_promedio: Math.round(ticketPromedio),
            productos_ticket: Math.round(productosTicket * 10) / 10,
            unidades_ticket: Math.round(unidadesTicket * 10) / 10,
            total_compras_anio: Math.round(totalComprasAnio),
            compra_minima: Math.round(compraMinima),
            compra_maxima: Math.round(compraMaxima),
            promedio_mensual: Math.round(promedioMensual),
            tendencia,
            estado_salud: estadoSalud,
            riesgo_abandono: riesgoAbandono,
            clasificacion_abc: clasificacionABC,
            total_ordenes: ordenes.length,
            updated_at: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });

          procesados++;
        }

        await batch.commit();
      }

      return { success: true, procesados, mensaje: `Métricas recalculadas para ${procesados} clientes` };
    } catch (error) {
      console.error('Error en recalcularMetricas:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Callable: Generar CSV de facturación para una orden
 * Data: { ordenId: string }
 */
exports.generarCSV = onCall(
  { timeoutSeconds: 30, memory: '256MiB' },
  async (request) => {
    await verificarRolCRM(request.auth);
    const { ordenId } = request.data;

    if (!ordenId) throw new HttpsError('invalid-argument', 'Se requiere ordenId');

    try {
      const ordenDoc = await db.collection('ordenes').doc(ordenId).get();
      if (!ordenDoc.exists) throw new HttpsError('not-found', 'Orden no encontrada');

      const orden = ordenDoc.data();
      const items = orden.items || orden.productos || [];

      // Obtener datos del cliente
      let cliente = orden.cliente || {};
      if (orden.clienteUid) {
        const clienteDoc = await db.collection('usuarios').doc(orden.clienteUid).get();
        if (clienteDoc.exists) {
          cliente = { ...cliente, ...clienteDoc.data() };
        }
      }

      // Generar CSV con formato de facturación ENAR
      const IVA_RATE = 0.19;
      let csvLines = [];

      // Bloque 1: Info cliente
      csvLines.push('DATOS_CLIENTE');
      csvLines.push(`ID_Cliente,Nombre,Documento,Dirección,Teléfono,Email`);
      csvLines.push(`${cliente.nit || ''},${(cliente.razon_social || cliente.nombre || '').replace(/,/g, ' ')},${cliente.nit || ''},${(cliente.direccion || '').replace(/,/g, ' ')},${cliente.telefono || ''},${cliente.email || ''}`);
      csvLines.push('');

      // Bloque 2: Productos
      csvLines.push('DETALLE_PRODUCTOS');
      csvLines.push('SKU,Descripción,Unidad,Cantidad,PrecioSinIVA,Descuento,ValorNeto,TipoImpuesto,Tarifa,ValorImpuesto');

      let subtotalSinIVA = 0;
      let totalImpuestos = 0;

      items.forEach(item => {
        const qty = item.cantidad_real || item.cantidad || 0;
        const precioConIVA = item.precio_unitario || 0;
        const precioSinIVA = Math.round(precioConIVA / (1 + IVA_RATE));
        const valorNeto = precioSinIVA * qty;
        const valorImpuesto = Math.round(valorNeto * IVA_RATE);

        subtotalSinIVA += valorNeto;
        totalImpuestos += valorImpuesto;

        csvLines.push(`${item.cod_interno || ''},${(item.titulo || '').replace(/,/g, ' ')},UN,${qty},${precioSinIVA},0,${valorNeto},IVA,${IVA_RATE * 100},${valorImpuesto}`);
      });

      csvLines.push('');

      // Bloque 3: Totales
      csvLines.push('TOTALES');
      csvLines.push(`Subtotal,${subtotalSinIVA}`);
      csvLines.push(`TotalImpuestos,${totalImpuestos}`);
      csvLines.push(`TotalFactura,${subtotalSinIVA + totalImpuestos}`);
      csvLines.push('');

      // Bloque 4: Info pago
      csvLines.push('INFORMACION_PAGO');
      csvLines.push(`MetodoPago,Condicion,Dias,ReferenciaPO,Notas,FechaEmision`);
      csvLines.push(`Crédito,${cliente.plazo_pago || 30},${cliente.plazo_pago || 30},${orden.numero_orden || ''},${(orden.observaciones || '').replace(/,/g, ' ')},${new Date().toISOString().split('T')[0]}`);

      const csvContent = csvLines.join('\n');

      // Marcar orden como CSV generado
      await db.collection('ordenes').doc(ordenId).update({
        csv_generado: true,
        csv_generado_fecha: admin.firestore.FieldValue.serverTimestamp(),
        csv_generado_por: request.auth.uid
      });

      return {
        success: true,
        csv: csvContent,
        filename: `factura_${orden.numero_orden || ordenId}.csv`
      };
    } catch (error) {
      console.error('Error en generarCSV:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Callable: Enviar notificación por email al cambiar estado de orden
 * Data: { ordenId: string, nuevoEstado: string }
 * Nota: Usa Firebase Admin email (requiere extensión SendGrid/Mailgun) o log para integración futura
 */
exports.enviarNotificacion = onCall(
  { timeoutSeconds: 30, memory: '256MiB' },
  async (request) => {
    await verificarRolCRM(request.auth);
    const { ordenId, nuevoEstado } = request.data;

    if (!ordenId || !nuevoEstado) {
      throw new HttpsError('invalid-argument', 'Se requiere ordenId y nuevoEstado');
    }

    try {
      const ordenDoc = await db.collection('ordenes').doc(ordenId).get();
      if (!ordenDoc.exists) throw new HttpsError('not-found', 'Orden no encontrada');

      const orden = ordenDoc.data();

      // Log de notificación (para integración futura con servicio de email)
      const notificacion = {
        tipo: 'cambio_estado_orden',
        orden_id: ordenId,
        numero_orden: orden.numero_orden || '',
        estado_anterior: orden.estado,
        estado_nuevo: nuevoEstado,
        cliente_email: orden.cliente?.email || '',
        cliente_nombre: orden.clienteNombre || '',
        vendedor_email: orden.creadaPorEmail || '',
        fecha: admin.firestore.FieldValue.serverTimestamp(),
        enviado_por: request.auth.uid
      };

      // Guardar en colección de notificaciones para procesamiento posterior
      await db.collection('notificaciones').add(notificacion);

      console.log(`Notificación creada: Orden ${orden.numero_orden} cambió a ${nuevoEstado}`);

      return {
        success: true,
        mensaje: `Notificación registrada para orden ${orden.numero_orden}`
      };
    } catch (error) {
      console.error('Error en enviarNotificacion:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Scheduled: Recalcular métricas de clientes diariamente (4:00 AM UTC)
 */
exports.recalcularMetricasDiario = onSchedule(
  {
    schedule: '0 4 * * *',
    timeZone: 'America/Bogota',
    timeoutSeconds: 540,
    memory: '1GiB'
  },
  async () => {
    console.log('Inicio recalculación diaria de métricas');

    try {
      // Obtener todos los clientes aprobados (no roles internos)
      const clientesSnap = await db.collection('usuarios')
        .where('estado', '==', 'aprobado')
        .get();

      const clientesIds = [];
      clientesSnap.forEach(doc => {
        const data = doc.data();
        if (!ROLES_EXCLUIDOS.includes(data.rol)) {
          clientesIds.push(doc.id);
        }
      });

      // Obtener todas las órdenes
      const ordenesSnap = await db.collection('ordenes').get();
      const ordenesPorCliente = {};
      ordenesSnap.forEach(doc => {
        const orden = doc.data();
        const uid = orden.user_id || orden.clienteUid;
        if (!uid) return;
        if (!ordenesPorCliente[uid]) ordenesPorCliente[uid] = [];
        ordenesPorCliente[uid].push(orden);
      });

      const ahora = new Date();
      const inicioAnio = new Date(ahora.getFullYear(), 0, 1);
      let procesados = 0;
      const BATCH_SIZE = 500;

      for (let i = 0; i < clientesIds.length; i += BATCH_SIZE) {
        const lote = clientesIds.slice(i, i + BATCH_SIZE);
        const batch = db.batch();

        for (const cId of lote) {
          const ordenes = (ordenesPorCliente[cId] || [])
            .filter(o => o.estado !== 'cancelada')
            .sort((a, b) => {
              const fa = a.created_at ? new Date(a.created_at) : new Date(0);
              const fb = b.created_at ? new Date(b.created_at) : new Date(0);
              return fb - fa;
            });

          const ultimaCompra = ordenes.length > 0 && ordenes[0].created_at
            ? new Date(ordenes[0].created_at) : null;
          const diasSinCompra = ultimaCompra
            ? Math.floor((ahora - ultimaCompra) / (1000 * 60 * 60 * 24)) : 999;

          let frecuenciaCompraDias = 0;
          if (ordenes.length >= 2) {
            const fechas = ordenes.map(o => new Date(o.created_at)).filter(d => !isNaN(d));
            if (fechas.length >= 2) {
              frecuenciaCompraDias = Math.floor((fechas[0] - fechas[fechas.length - 1]) / (1000 * 60 * 60 * 24) / (fechas.length - 1));
            }
          }

          const totales = ordenes.map(o => o.total || 0);
          const totalComprasAnio = ordenes
            .filter(o => o.created_at && new Date(o.created_at) >= inicioAnio)
            .reduce((s, o) => s + (o.total || 0), 0);
          const ticketPromedio = totales.length > 0
            ? totales.reduce((a, b) => a + b, 0) / totales.length : 0;

          const hace6Meses = new Date(ahora);
          hace6Meses.setMonth(hace6Meses.getMonth() - 6);
          const promedioMensual = ordenes
            .filter(o => o.created_at && new Date(o.created_at) >= hace6Meses)
            .reduce((s, o) => s + (o.total || 0), 0) / 6;

          const hace1Mes = new Date(ahora);
          hace1Mes.setMonth(hace1Mes.getMonth() - 1);
          const hace2Meses = new Date(ahora);
          hace2Meses.setMonth(hace2Meses.getMonth() - 2);
          const ventasMesActual = ordenes
            .filter(o => o.created_at && new Date(o.created_at) >= hace1Mes)
            .reduce((s, o) => s + (o.total || 0), 0);
          const ventasMesAnterior = ordenes
            .filter(o => o.created_at && new Date(o.created_at) >= hace2Meses && new Date(o.created_at) < hace1Mes)
            .reduce((s, o) => s + (o.total || 0), 0);

          let tendencia = 'Estable';
          if (ventasMesAnterior > 0) {
            const cambio = ((ventasMesActual - ventasMesAnterior) / ventasMesAnterior) * 100;
            if (cambio > 5) tendencia = 'Creciente';
            else if (cambio < -5) tendencia = 'Decreciente';
          }

          let estadoSalud = 'Saludable';
          if (diasSinCompra > 90 || ordenes.length === 0) estadoSalud = 'Inactivo';
          else if (diasSinCompra > 45) estadoSalud = 'En_Riesgo';

          let riesgoAbandono = 'Bajo';
          if (frecuenciaCompraDias > 0 && diasSinCompra > frecuenciaCompraDias * 2) riesgoAbandono = 'Alto';
          else if (frecuenciaCompraDias > 0 && diasSinCompra > frecuenciaCompraDias * 1.5) riesgoAbandono = 'Medio';
          else if (diasSinCompra > 60) riesgoAbandono = 'Alto';
          else if (diasSinCompra > 30) riesgoAbandono = 'Medio';

          let clasificacionABC = 'C';
          if (totalComprasAnio > 5000000) clasificacionABC = 'A';
          else if (totalComprasAnio > 1000000) clasificacionABC = 'B';
          else if (ordenes.length === 0) clasificacionABC = 'SV';

          batch.set(db.collection('metricas_clientes').doc(cId), {
            cliente_id: cId,
            ultima_compra: ultimaCompra ? ultimaCompra.toISOString() : null,
            dias_sin_compra: diasSinCompra,
            frecuencia_compra_dias: frecuenciaCompraDias,
            ticket_promedio: Math.round(ticketPromedio),
            total_compras_anio: Math.round(totalComprasAnio),
            promedio_mensual: Math.round(promedioMensual),
            tendencia,
            estado_salud: estadoSalud,
            riesgo_abandono: riesgoAbandono,
            clasificacion_abc: clasificacionABC,
            total_ordenes: ordenes.length,
            updated_at: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });

          procesados++;
        }

        await batch.commit();
      }

      console.log(`Recalculación diaria completada: ${procesados} clientes procesados`);
    } catch (error) {
      console.error('Error en recalculación diaria:', error);
    }
  }
);
