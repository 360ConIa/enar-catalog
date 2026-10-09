/**
 * Corregir typos en emails y teléfonos de clientes importados
 */
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'enar-b2b' });
const db = admin.firestore();

const EMAIL_FIXES = {
  'Isayalcodanis@hotmai.com': 'Isayalcodanis@hotmail.com',
  'Emilyevgo_1005@hotmaill.com': 'Emilyevgo_1005@hotmail.com',
  'Aleja_1102@hotmaill.com': 'Aleja_1102@hotmail.com',
  'Norelypereira1971@hotamil.com': 'Norelypereira1971@hotmail.com',
  'Edificiopremierph@gmial.com': 'Edificiopremierph@gmail.com'
};

const TEL_FIXES = {
  '3410977 3362291': '3362291',
  '5997624 2773645': '2773645',
  '3 1 1 3 1 8 0 6 4 0': '3113180640',
  '3102127771 Sncnd': '3102127771',
  '320 8034949 - 5733876': '3208034949',
  '320 8503624': '3208503624',
  '301 732 6026': '3017326026',
  '3 1 1 2 6 3 5 8 6 2': '3112635862',
  '7036098 - 3185990945': '3185990945',
  'Telefono No Asignado': '',
  '341 13 50': '3411350',
  '2827716 - 5605214': '5605214',
  '3003790 3402058': '3402058',
  '3 1 1 2 6 8 2 5 4 4': '3112682544',
  '3 1 3 8 9 7 7 0 2 6': '3138977026',
  '312 3389193': '3123389193',
  '3 1 0 6 1 3 3 7 3 3': '3106133733',
  '******': ''
};

async function fix() {
  const snap = await db.collection('usuarios').where('importado', '==', true).get();
  console.log('Total importados: ' + snap.size + '\n');

  let emailFixed = 0, telFixed = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    const updates = {};

    // Fix email
    if (d.email && EMAIL_FIXES[d.email]) {
      const newEmail = EMAIL_FIXES[d.email];
      updates.email = newEmail;

      try {
        const authUser = await admin.auth().getUserByEmail(d.email);
        await admin.auth().updateUser(authUser.uid, { email: newEmail });
        console.log('  EMAIL: ' + d.email + ' -> ' + newEmail);
        emailFixed++;
      } catch (err) {
        console.log('  ERR email Auth: ' + d.email + ' - ' + err.message);
      }
    }

    // Fix telefono
    const tel = d.telefono || '';
    if (TEL_FIXES.hasOwnProperty(tel)) {
      updates.telefono = TEL_FIXES[tel];
      console.log('  TEL: ' + d.email + ' -> "' + TEL_FIXES[tel] + '"');
      telFixed++;
    }

    if (Object.keys(updates).length > 0) {
      await doc.ref.update(updates);
    }
  }

  console.log('\n=== RESULTADO ===');
  console.log('  Emails corregidos: ' + emailFixed);
  console.log('  Telefonos corregidos: ' + telFixed);
  process.exit(0);
}

fix().catch(e => { console.error(e.message); process.exit(1); });
