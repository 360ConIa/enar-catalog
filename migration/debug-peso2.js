/**
 * Debug: Comparar peso Sheet vs Firestore para productos de ORD-260311-52606
 */
const admin = require('firebase-admin');
const { google } = require('googleapis');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'enar-b2b'
});
const db = admin.firestore();

const auth = new google.auth.GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
});
const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = '1a-cy3_OSegXeDwEmud7V3SRDlht4S8OAOblg74bPhMw';

async function main() {
  // 1. Leer TODOS los pesos del Sheet Productos
  console.log('📖 Leyendo Sheet Productos...\n');
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Productos!A4:X'
  });
  const rows = response.data.values || [];

  // Indexar por ID_Producto
  const sheetPesos = {};
  for (const row of rows) {
    const id = row[0];
    const nombre = row[1];
    const pesoKg = row[22]; // columna W = index 22
    if (id) sheetPesos[id] = { nombre, pesoKg: pesoKg || '(vacío)' };
  }

  // 2. Productos de la orden ORD-260311-52606
  const codigos = ['NR', 'NG', 'VC300'];

  console.log('Comparación de pesos para ORD-260311-52606:\n');
  console.log('Producto'.padEnd(10) + 'Sheet_Peso_Kg'.padEnd(16) + 'FS_peso'.padEnd(12) + 'FS_Peso_Kg'.padEnd(14) + 'Cant'.padEnd(8) + 'Total(Sheet)'.padEnd(14) + 'Total(peso)');
  console.log('-'.repeat(90));

  const cantidades = { NR: 48, NG: 1, VC300: 6 };
  let totalSheet = 0, totalPeso = 0, totalPesoKg = 0;

  for (const cod of codigos) {
    const prodDoc = await db.collection('productos').doc(cod).get();
    const p = prodDoc.exists ? prodDoc.data() : {};
    const s = sheetPesos[cod] || {};
    const cant = cantidades[cod];

    const sheetVal = parseFloat(s.pesoKg) || 0;
    const pesoVal = p.peso || 0;
    const pesoKgVal = p.Peso_Kg || 0;

    totalSheet += sheetVal * cant;
    totalPeso += pesoVal * cant;
    totalPesoKg += pesoKgVal * cant;

    console.log(
      cod.padEnd(10) +
      String(s.pesoKg).padEnd(16) +
      String(pesoVal).padEnd(12) +
      String(pesoKgVal).padEnd(14) +
      String(cant).padEnd(8) +
      String(Math.round(sheetVal * cant * 100) / 100).padEnd(14) +
      String(Math.round(pesoVal * cant * 100) / 100)
    );
  }

  console.log('-'.repeat(90));
  console.log(
    'TOTAL'.padEnd(10) +
    ''.padEnd(16) +
    ''.padEnd(12) +
    ''.padEnd(14) +
    ''.padEnd(8) +
    String(Math.round(totalSheet * 100) / 100).padEnd(14) +
    String(Math.round(totalPeso * 100) / 100)
  );

  // 3. Verificar TODOS los campos peso-related de todos los productos activos
  console.log('\n\n📊 Muestra de 20 productos con diferencia entre peso y Peso_Kg:\n');
  console.log('ID'.padEnd(12) + 'peso'.padEnd(10) + 'Peso_Kg'.padEnd(10) + 'Diff'.padEnd(10) + 'Titulo');
  console.log('-'.repeat(80));

  const allProds = await db.collection('productos').where('activo', '==', true).get();
  let count = 0;
  allProds.forEach(d => {
    const p = d.data();
    const peso = p.peso || 0;
    const pesoKg = p.Peso_Kg || 0;
    if (peso !== pesoKg && peso > 0 && count < 20) {
      count++;
      console.log(
        d.id.padEnd(12) +
        String(peso).padEnd(10) +
        String(pesoKg).padEnd(10) +
        String(Math.round((peso - pesoKg) * 100) / 100).padEnd(10) +
        (p.titulo || '').substring(0, 40)
      );
    }
  });

  // 4. Contar productos sin campo peso
  let sinPeso = 0, conPeso = 0, conPesoKg = 0;
  allProds.forEach(d => {
    const p = d.data();
    if (p.peso && p.peso > 0) conPeso++;
    else sinPeso++;
    if (p.Peso_Kg && p.Peso_Kg > 0) conPesoKg++;
  });
  console.log(`\n📊 Productos activos: ${allProds.size}`);
  console.log(`   Con campo 'peso' > 0:    ${conPeso}`);
  console.log(`   Sin campo 'peso':        ${sinPeso}`);
  console.log(`   Con campo 'Peso_Kg' > 0: ${conPesoKg}`);

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
