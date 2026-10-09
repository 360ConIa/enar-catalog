const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'enar-b2b' });
const db = admin.firestore();

async function main() {
  for (const id of ['RR', 'SR', 'NR']) {
    const doc = await db.collection('productos').doc(id).get();
    const p = doc.data();
    console.log(`${id}: ${p.titulo}`);
    console.log(`   imagen_principal: ${p.imagen_principal}`);
    console.log(`   imagen: ${p.imagen}`);
    // Check all image-related fields
    const imgFields = Object.keys(p).filter(k => k.toLowerCase().includes('imag') || k.toLowerCase().includes('foto') || k.toLowerCase().includes('url'));
    imgFields.forEach(k => console.log(`   ${k}: ${p[k]}`));
    console.log('');
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
