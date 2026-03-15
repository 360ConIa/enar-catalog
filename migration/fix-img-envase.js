const admin = require('firebase-admin');
const { google } = require('googleapis');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'enar-b2b' });
const db = admin.firestore();

async function fix() {
  // Obtener imagen Envase.png desde Drive
  const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
  const drive = google.drive({ version: 'v3', auth });
  const res = await drive.files.list({
    q: "'1VTsMnemHM-LEMliVQf0ziRdn_Hw8H44i' in parents and name = 'Envase.png'",
    fields: 'files(id, name)'
  });
  if (!res.data.files.length) { console.error('Envase.png no encontrado en Drive'); process.exit(1); }
  const imgUrl = `https://lh3.googleusercontent.com/d/${res.data.files[0].id}`;
  console.log('Imagen Envase:', imgUrl.substring(0, 80) + '...');

  // Buscar productos Paca Envase
  const snap = await db.collection('productos')
    .where('titulo', '>=', 'Paca')
    .where('titulo', '<=', 'Paca\uf8ff')
    .get();

  console.log('Productos Paca encontrados:', snap.size);
  let count = 0;
  for (const doc of snap.docs) {
    const titulo = doc.data().titulo || '';
    if (titulo.toLowerCase().includes('envase')) {
      await doc.ref.update({ imagen_principal: imgUrl });
      console.log('  OK', doc.id, '|', titulo);
      count++;
    }
  }
  console.log('\nActualizados:', count);
  process.exit(0);
}
fix().catch(e => { console.error(e.message); process.exit(1); });
