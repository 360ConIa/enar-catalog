/**
 * Asignar imágenes desde carpeta Google Drive a productos en Firestore
 * Las imágenes están nombradas con el ID del producto
 */
const admin = require('firebase-admin');
const { google } = require('googleapis');

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'enar-b2b' });
const db = admin.firestore();

const FOLDER_ID = '1VTsMnemHM-LEMliVQf0ziRdn_Hw8H44i';

async function fix() {
  // Autenticar con ADC para Drive API
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/drive.readonly']
  });
  const drive = google.drive({ version: 'v3', auth });

  // Listar archivos en la carpeta
  const res = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType)',
    pageSize: 100
  });

  const files = res.data.files;
  console.log('Archivos encontrados:', files.length);
  console.log('---');

  let count = 0;
  for (const file of files) {
    // Extraer ID del producto del nombre del archivo (sin extensión)
    const productId = file.name.replace(/\.[^.]+$/, '');
    const imgUrl = `https://lh3.googleusercontent.com/d/${file.id}`;

    // Verificar que el producto existe
    const doc = await db.collection('productos').doc(productId).get();
    if (doc.exists) {
      await doc.ref.update({ imagen_principal: imgUrl });
      console.log('  OK', productId, '|', doc.data().titulo, '|', file.name);
      count++;
    } else {
      console.log('  --', productId, '| PRODUCTO NO ENCONTRADO |', file.name);
    }
  }

  console.log('\nActualizados:', count, 'de', files.length);
  process.exit(0);
}

fix().catch(e => { console.error('Error:', e.message); process.exit(1); });
