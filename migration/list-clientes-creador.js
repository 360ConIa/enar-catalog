/**
 * Lista clientes creados por un usuario específico
 * Uso: node list-clientes-creador.js <email_creador>
 */

const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'enar-b2b'
});

const db = admin.firestore();
const emailCreador = process.argv[2] || 'Ventas@enar.com.co';

async function listar() {
  // 1. Buscar UID del creador por email (case-insensitive)
  const allUsers = await db.collection('usuarios').get();
  let creadorUid = null;
  let creadorNombre = null;
  allUsers.forEach(doc => {
    const d = doc.data();
    if (d.email && d.email.toLowerCase() === emailCreador.toLowerCase()) {
      creadorUid = doc.id;
      creadorNombre = d.nombre || d.razon_social || '-';
    }
  });

  if (!creadorUid) {
    console.log(`❌ No se encontró usuario con email: ${emailCreador}`);
    process.exit(1);
  }

  console.log(`\nCreador: ${creadorNombre} (${emailCreador})`);
  console.log(`UID: ${creadorUid}\n`);

  // 2. Buscar clientes creados por ese email (minúsculas)
  const snap = await db.collection('usuarios').where('creado_por', '==', emailCreador.toLowerCase()).get();

  const clientes = [];
  snap.forEach(doc => {
    const d = doc.data();
    let fecha = '-';
    if (d.created_at) {
      const t = d.created_at.toDate ? d.created_at.toDate() : new Date(d.created_at);
      fecha = t.toISOString().slice(0, 10);
    }
    clientes.push({
      nombre: d.nombre || d.razon_social || '-',
      email: d.email || '-',
      nit: d.nit || '-',
      tipo: d.tipo_cliente || '-',
      estado: d.estado || '-',
      ciudad: d.ubicacion || d.ciudad || '-',
      fecha
    });
  });

  clientes.sort((a, b) => b.fecha.localeCompare(a.fecha));

  console.log(`Total clientes creados por ${emailCreador}: ${clientes.length}\n`);
  if (clientes.length > 0) {
    console.table(clientes);
  }
}

listar().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
