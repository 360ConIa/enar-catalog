const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'enar-b2b' });
const db = admin.firestore();

async function main() {
  // Check --DC01 and --DG503
  const ids = ['--DC01', '--DG503'];
  for (const id of ids) {
    const doc = await db.collection('productos').doc(id).get();
    if (doc.exists) {
      const d = doc.data();
      console.log(id, '→ precio_lista:', d.precio_lista, '| p_real:', d.p_real, '| presentacion:', d.presentacion, '| activo:', d.activo);
    } else {
      console.log(id, '→ NO EXISTE');
    }
  }

  // Check how many active products have precio_lista = 0 or missing
  const snap = await db.collection('productos').where('activo', '==', true).get();
  let sinPrecio = 0;
  let conPrecio = 0;
  const sinPrecioList = [];
  snap.forEach(doc => {
    const d = doc.data();
    if (!d.precio_lista || d.precio_lista === 0) {
      sinPrecio++;
      sinPrecioList.push({ id: doc.id, titulo: d.titulo, p_real: d.p_real });
    } else {
      conPrecio++;
    }
  });

  console.log('\nTotal activos:', snap.size);
  console.log('Con precio_lista:', conPrecio);
  console.log('Sin precio_lista:', sinPrecio);
  if (sinPrecioList.length > 0) {
    console.log('\nProductos sin precio_lista:');
    sinPrecioList.forEach(p => console.log('  ', p.id, '|', p.titulo, '| p_real:', p.p_real));
  }
}
main().catch(console.error);
