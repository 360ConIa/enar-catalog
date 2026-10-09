const admin = require('firebase-admin');
const { google } = require('googleapis');

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'enar-b2b' });
const db = admin.firestore();

const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = '1a-cy3_OSegXeDwEmud7V3SRDlht4S8OAOblg74bPhMw';

async function main() {
  const ids = ['NR', 'NG', 'VC300'];

  // Leer Sheet completo para buscar estos IDs
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Productos!A4:X'
  });
  const rows = response.data.values || [];

  for (const id of ids) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`PRODUCTO: ${id}`);
    console.log('='.repeat(60));

    // Sheet
    const sheetRow = rows.find(r => (r[0] || '').trim() === id);
    if (sheetRow) {
      console.log(`\n  📊 SHEET:`);
      console.log(`     Nombre:        ${sheetRow[1]}`);
      console.log(`     Peso_Kg (W):   "${sheetRow[22]}"`);
      console.log(`     Orden_Cargue:  "${sheetRow[23]}"`);
    } else {
      console.log(`\n  ⚠️  NO encontrado en Sheet`);
    }

    // Firestore
    const doc = await db.collection('productos').doc(id).get();
    if (doc.exists) {
      const p = doc.data();
      console.log(`\n  🔥 FIRESTORE:`);
      console.log(`     titulo:        ${p.titulo}`);
      console.log(`     peso:          ${p.peso}`);
      console.log(`     Peso_Kg:       ${p.Peso_Kg}`);
      console.log(`     Orden_Cargue:  ${p.Orden_Cargue}`);
      console.log(`     activo:        ${p.activo}`);
    } else {
      console.log(`\n  ⚠️  NO encontrado en Firestore`);
    }
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
