const admin = require('firebase-admin');
const { google } = require('googleapis');

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'enar-b2b' });
const db = admin.firestore();

const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
const sheets = google.sheets({ version: 'v4', auth });

async function main() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: '1a-cy3_OSegXeDwEmud7V3SRDlht4S8OAOblg74bPhMw',
    range: 'ID_Producto_final!A2:D'
  });
  const rows = res.data.values || [];
  const sheetIds = new Map();
  for (const row of rows) {
    const id = (row[0] || '').trim();
    if (id) sheetIds.set(id, row);
  }

  const snap = await db.collection('productos').get();
  const firestoreIds = new Set();
  const inactivos = new Map();
  snap.forEach(doc => {
    firestoreIds.add(doc.id);
    if (doc.data().activo === false) inactivos.set(doc.id, doc.data());
  });

  const noExisten = [];
  const existenInactivos = [];

  for (const [id, row] of sheetIds) {
    if (!firestoreIds.has(id)) {
      noExisten.push({ id, presentacion: row[1], uxt: row[2], precio: row[3] });
    } else if (inactivos.has(id)) {
      existenInactivos.push({ id, presentacion: row[1], uxt: row[2], precio: row[3], titulo: inactivos.get(id).titulo });
    }
  }

  console.log('Total en Sheet:', sheetIds.size);
  console.log('Total en Firestore:', snap.size);
  console.log('Activos en Firestore:', snap.size - inactivos.size);
  console.log('\nEn Sheet pero NO en Firestore (' + noExisten.length + '):');
  noExisten.forEach(p => console.log('  ', p.id, '|', p.presentacion, '|', p.uxt, '|', p.precio));
  console.log('\nEn Sheet pero INACTIVOS en Firestore (' + existenInactivos.length + '):');
  existenInactivos.forEach(p => console.log('  ', p.id, '|', p.titulo, '|', p.presentacion));

  console.log('\n--DC01 en Sheet?', sheetIds.has('--DC01'));
  console.log('--DC01 en Firestore?', firestoreIds.has('--DC01'));
  if (inactivos.has('--DC01')) console.log('--DC01 está INACTIVO, titulo:', inactivos.get('--DC01').titulo);
}
main().catch(console.error);
