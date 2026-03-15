/**
 * Cambiar password de los 100 clientes importados: ID_Firestore → NIT
 *
 * Uso:
 *   node fix-passwords-nit.js --preview    (muestra lista, no cambia nada)
 *   node fix-passwords-nit.js --execute    (actualiza passwords en Auth)
 */
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'enar-b2b' });
const fs = require('fs');

const PREVIEW = process.argv.includes('--preview');
const EXECUTE = process.argv.includes('--execute');

if (!PREVIEW && !EXECUTE) {
  console.log('Uso:');
  console.log('  node fix-passwords-nit.js --preview   (muestra lista)');
  console.log('  node fix-passwords-nit.js --execute   (cambia passwords)');
  process.exit(0);
}

async function run() {
  // Leer CSV de clientes migrados
  const csv = fs.readFileSync('100-clientes-migrados.csv', 'utf8');
  const lines = csv.trim().split('\n');

  console.log(`Clientes a procesar: ${lines.length - 1}`);
  console.log(`Modo: ${PREVIEW ? 'PREVIEW' : 'EXECUTE'}\n`);

  let ok = 0, notFound = 0, errors = 0;

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    const nombre = parts[1];
    const email = parts[2];
    const nit = parts[3];

    if (PREVIEW) {
      console.log(`  ${email} → password: ${nit}`);
      ok++;
      continue;
    }

    try {
      const authUser = await admin.auth().getUserByEmail(email);
      await admin.auth().updateUser(authUser.uid, { password: nit });
      ok++;
      if (ok % 25 === 0) console.log(`  Procesados: ${ok}...`);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        console.log(`  NOT FOUND: ${email}`);
        notFound++;
      } else {
        console.log(`  ERROR: ${email} - ${err.message}`);
        errors++;
      }
    }
  }

  console.log('\n=== RESULTADO ===');
  console.log(`  Passwords actualizados: ${ok}`);
  if (notFound) console.log(`  No encontrados: ${notFound}`);
  if (errors) console.log(`  Errores: ${errors}`);
  console.log(`\nNuevo password = NIT del cliente`);

  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
