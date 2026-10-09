const { google } = require('googleapis');
const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
const sheets = google.sheets({ version: 'v4', auth });

const MISSING = ['QT','ET','ZG5','UT','-O-G06','JT300','-Ñ-H910','-Ñ-G910','--DC01','--DG503'];

async function main() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: '1a-cy3_OSegXeDwEmud7V3SRDlht4S8OAOblg74bPhMw',
    range: 'Productos!A4:W2000'
  });
  const rows = res.data.values || [];

  console.log('Buscando', MISSING.length, 'IDs en hoja Productos (' + rows.length + ' filas):\n');

  const found = [];
  for (const row of rows) {
    const id = (row[0] || '').trim();
    if (MISSING.includes(id)) {
      found.push(id);
      console.log('ENCONTRADO:', id);
      console.log('  Nombre:', row[1]);
      console.log('  Categoría:', row[2]);
      console.log('  Precio_Real:', row[9]);
      console.log('  Stock:', row[10]);
      console.log('  EAN:', row[19]);
      console.log('  Estado:', row[20]);
      console.log('  Imagen:', (row[21] || '').substring(0, 60));
      console.log('');
    }
  }

  const notFound = MISSING.filter(id => !found.includes(id));
  if (notFound.length > 0) {
    console.log('NO encontrados en hoja Productos:', notFound.join(', '));
  }
}
main().catch(console.error);
