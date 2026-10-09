const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'enar-b2b' });
const db = admin.firestore();

(async () => {
  const uid = 'kUMsQPfMajSoR4eaw6mAlVkg6fg1'; // Ventas@enar.com.co
  const email = 'Ventas@enar.com.co';

  // Buscar por diferentes campos posibles
  const queries = [
    ['creado_por', uid],
    ['creadoPor', uid],
    ['creadaPor', uid],
    ['created_by', uid],
    ['vendedor_asignado', uid],
    ['creado_por_email', email],
    ['creado_por_email', email.toLowerCase()]
  ];

  console.log('Buscando clientes de Ventas@enar.com.co por diferentes campos:\n');
  for (const [campo, valor] of queries) {
    const snap = await db.collection('usuarios').where(campo, '==', valor).get();
    console.log(`  ${campo} == "${valor.substring(0, 30)}..." → ${snap.size} usuarios`);
  }

  // Adicional: buscar usuarios que tengan ALGÚN campo con el UID del vendedor
  console.log('\nBuscando usuarios con cualquier referencia al UID del vendedor...');
  const all = await db.collection('usuarios').get();
  const conReferencia = [];
  all.forEach(doc => {
    const d = doc.data();
    const str = JSON.stringify(d);
    if (str.includes(uid) || (d.email && d.email.toLowerCase() !== email.toLowerCase() && str.toLowerCase().includes(email.toLowerCase()))) {
      const campos = [];
      Object.keys(d).forEach(k => {
        if (JSON.stringify(d[k]).includes(uid) || JSON.stringify(d[k]).toLowerCase().includes(email.toLowerCase())) {
          campos.push(k);
        }
      });
      conReferencia.push({ id: doc.id, email: d.email, nombre: d.nombre, campos: campos.join(', ') });
    }
  });
  console.log(`\nTotal con referencia: ${conReferencia.length}`);
  if (conReferencia.length > 0 && conReferencia.length < 30) {
    console.table(conReferencia);
  }
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
