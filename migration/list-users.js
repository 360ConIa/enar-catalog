/**
 * Lista usuarios de Firestore con nombre, email y rol
 * Uso: node list-users.js
 */

const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'enar-b2b'
});

const db = admin.firestore();

async function listarUsuarios() {
  const snap = await db.collection('usuarios').get();

  const usuarios = [];
  snap.forEach(doc => {
    const d = doc.data();
    if (['admin', 'gestor', 'vendedor', 'despachos'].includes(d.rol)) {
      usuarios.push({
        nombre: d.nombre || d.razon_social || '—',
        email: d.email || '—',
        rol: d.rol
      });
    }
  });

  usuarios.sort((a, b) => a.rol.localeCompare(b.rol) || a.nombre.localeCompare(b.nombre));

  console.log(`\nUsuarios (admin, vendedor, despachos): ${usuarios.length}\n`);
  console.table(usuarios);
}

listarUsuarios().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
