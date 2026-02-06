const { onRequest } = require('firebase-functions/v2/https');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
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
            activo: true,
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
    invoker: 'public'
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
