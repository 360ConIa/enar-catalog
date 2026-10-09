const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'enar-b2b' });
const db = admin.firestore();

async function main() {
  // Check price fields on a working product vs the two new ones
  const ids = ['--DC01', '--DG503', 'SG', 'SR']; // last two should be working
  for (const id of ids) {
    const doc = await db.collection('productos').doc(id).get();
    if (doc.exists) {
      const d = doc.data();
      console.log('\n' + id + ' (' + (d.titulo || '-') + '):');
      console.log('  precio_lista:', d.precio_lista);
      console.log('  p_real:', d.p_real);
      console.log('  p_corriente:', d.p_corriente);
      console.log('  precio_mayorista:', d.precio_mayorista);
      console.log('  precio_negocio:', d.precio_negocio);
      console.log('  precio_persona_natural:', d.precio_persona_natural);
      console.log('  Precio_L1:', d.Precio_L1);
      console.log('  Precio_L4:', d.Precio_L4);
    }
  }

  // Count active products missing precio_mayorista
  const snap = await db.collection('productos').where('activo', '==', true).get();
  let sinPrecioMay = 0;
  const sinPrecioList = [];
  snap.forEach(doc => {
    const d = doc.data();
    if (!d.precio_mayorista && !d.precio_negocio && !d.precio_persona_natural) {
      sinPrecioMay++;
      sinPrecioList.push(doc.id);
    }
  });
  console.log('\n\nActivos sin precio_mayorista/negocio/persona_natural:', sinPrecioMay);
  if (sinPrecioList.length <= 20) {
    sinPrecioList.forEach(id => console.log('  ', id));
  }
}
main().catch(console.error);
