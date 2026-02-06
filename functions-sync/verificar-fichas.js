const admin = require('firebase-admin');

// Inicializar con las credenciales del proyecto
if (admin.apps.length === 0) {
  admin.initializeApp({
    projectId: 'enar-b2b'
  });
}

const db = admin.firestore();

async function verificarFichas() {
  console.log('=== VERIFICACIÓN DE FICHAS TÉCNICAS ===\n');

  // 1. Verificar colección fichas_tecnicas
  console.log('1. Colección fichas_tecnicas:');
  try {
    const fichasSnap = await db.collection('fichas_tecnicas').limit(10).get();
    console.log('   - Documentos encontrados:', fichasSnap.size);
    if (fichasSnap.size > 0) {
      fichasSnap.forEach(doc => {
        console.log('     •', doc.id);
      });
    }
  } catch (e) {
    console.log('   - Error:', e.message);
  }

  // 2. Productos con ficha_tecnica_url
  console.log('\n2. Productos con ficha_tecnica_url:');
  try {
    const conUrlSnap = await db.collection('productos')
      .where('ficha_tecnica_url', '!=', '')
      .limit(5)
      .get();
    console.log('   - Encontrados:', conUrlSnap.size, '(mostrando máx 5)');
    if (conUrlSnap.size > 0) {
      conUrlSnap.forEach(doc => {
        const d = doc.data();
        console.log('     •', d.cod_interno, '-', d.titulo?.substring(0, 40));
      });
    }
  } catch (e) {
    console.log('   - Error o no hay datos:', e.message);
  }

  // 3. Productos con ficha_tecnica_contenido
  console.log('\n3. Productos con ficha_tecnica_contenido (OCR procesado):');
  try {
    const conContenidoSnap = await db.collection('productos')
      .where('ficha_tecnica_contenido', '!=', '')
      .limit(5)
      .get();
    console.log('   - Encontrados:', conContenidoSnap.size, '(mostrando máx 5)');
  } catch (e) {
    console.log('   - Error o no hay datos:', e.message);
  }

  // 4. Productos con campo ficha_tecnica (referencia)
  console.log('\n4. Productos con campo ficha_tecnica (nombre/referencia):');
  try {
    const conFichaSnap = await db.collection('productos')
      .where('ficha_tecnica', '!=', '')
      .limit(10)
      .get();
    console.log('   - Encontrados:', conFichaSnap.size, '(mostrando máx 10)');
    if (conFichaSnap.size > 0) {
      conFichaSnap.forEach(doc => {
        const d = doc.data();
        console.log('     •', d.cod_interno, '→ ficha:', d.ficha_tecnica);
      });
    }
  } catch (e) {
    console.log('   - Error:', e.message);
  }

  // 5. Total de productos
  console.log('\n5. Resumen general:');
  try {
    const totalSnap = await db.collection('productos').count().get();
    console.log('   - Total productos en Firestore:', totalSnap.data().count);
  } catch (e) {
    // Fallback si count() no está disponible
    const allSnap = await db.collection('productos').select().get();
    console.log('   - Total productos en Firestore:', allSnap.size);
  }

  // 6. Muestra un producto de ejemplo completo
  console.log('\n6. Ejemplo de estructura de producto:');
  const ejemploSnap = await db.collection('productos').limit(1).get();
  if (ejemploSnap.size > 0) {
    const ejemplo = ejemploSnap.docs[0].data();
    console.log('   Campos disponibles:', Object.keys(ejemplo).join(', '));
    console.log('   Campos de ficha técnica:');
    console.log('     - ficha_tecnica:', ejemplo.ficha_tecnica || '(vacío)');
    console.log('     - ficha_tecnica_url:', ejemplo.ficha_tecnica_url ? 'SÍ' : '(vacío)');
    console.log('     - ficha_tecnica_contenido:', ejemplo.ficha_tecnica_contenido ? 'SÍ (' + ejemplo.ficha_tecnica_contenido.length + ' chars)' : '(vacío)');
    console.log('     - ft_usos:', ejemplo.ft_usos || '(vacío)');
    console.log('     - ft_rendimiento:', ejemplo.ft_rendimiento || '(vacío)');
    console.log('     - ft_composicion:', ejemplo.ft_composicion || '(vacío)');
  }
}

verificarFichas()
  .then(() => {
    console.log('\n=== VERIFICACIÓN COMPLETADA ===');
    process.exit(0);
  })
  .catch(e => {
    console.error('Error:', e);
    process.exit(1);
  });
