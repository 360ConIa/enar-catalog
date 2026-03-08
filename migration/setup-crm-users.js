/**
 * Setup CRM Users - ENAR
 * Creates Firebase Auth accounts and Firestore user documents
 * for the CRM team using Firebase CLI credentials + REST APIs.
 *
 * Usage: node setup-crm-users.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ═══════════ CONFIG ═══════════

const PROJECT_ID = 'enar-b2b';
const WEB_API_KEY = 'AIzaSyCMPflYHuPnAWaUhv90wi3uBOhP9AoA8e0';
const DEFAULT_PASSWORD = 'Enar2025!';

const CRM_USERS = [
  { email: 'admin@360conia.com', rol: 'admin', nombre: 'Admin 360' },
  { email: 'jotact2002@gmail.com', rol: 'vendedor', nombre: 'Jota' },
  { email: 'vendedor2.enar@gmail.com', rol: 'vendedor', nombre: 'Vendedor 2' },
  { email: 'martha.enar@gmail.com', rol: 'vendedor', nombre: 'Martha' },
  { email: 'javier.enar@gmail.com', rol: 'despachos', nombre: 'Javier' },
  { email: 'sebastianbumq@gmail.com', rol: 'admin', nombre: 'Sebastian BM' },
  { email: 'adminfw@farmawebonline.com', rol: 'despachos', nombre: 'Admin Farmaweb' },
  { email: 'sebastianbumq@enarapp.com', rol: 'admin', nombre: 'Sebastian ENAR' },
];

// ═══════════ HTTP HELPER ═══════════

function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ═══════════ GET ACCESS TOKEN ═══════════

async function getAccessToken() {
  const configPath = path.join(require('os').homedir(), '.config', 'configstore', 'firebase-tools.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const refreshToken = config.tokens?.refresh_token;

  if (!refreshToken) throw new Error('No Firebase CLI refresh token found. Run `firebase login` first.');

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
    client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi'
  }).toString();

  const res = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }, (response) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  if (!res.access_token) throw new Error('Failed to get access token: ' + JSON.stringify(res));
  return res.access_token;
}

// ═══════════ FIREBASE AUTH (Admin REST API) ═══════════

async function getOrCreateAuthUser(email, nombre, accessToken) {
  // Try to get user by email using Identity Toolkit Admin API
  const lookupRes = await httpRequest({
    hostname: 'identitytoolkit.googleapis.com',
    path: `/v1/projects/${PROJECT_ID}/accounts:lookup`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    }
  }, { email: [email] });

  if (lookupRes.data.users && lookupRes.data.users.length > 0) {
    return { uid: lookupRes.data.users[0].localId, created: false };
  }

  // Create user using Admin API
  const createRes = await httpRequest({
    hostname: 'identitytoolkit.googleapis.com',
    path: `/v1/projects/${PROJECT_ID}/accounts`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    }
  }, {
    email,
    password: DEFAULT_PASSWORD,
    displayName: nombre,
    emailVerified: true
  });

  if (createRes.data.localId) {
    return { uid: createRes.data.localId, created: true };
  }

  throw new Error(`Failed to create user: ${JSON.stringify(createRes.data)}`);
}

// ═══════════ FIRESTORE REST API ═══════════

async function upsertFirestoreUser(uid, user, accessToken) {
  const docPath = `projects/${PROJECT_ID}/databases/(default)/documents/usuarios/${uid}`;

  // Check if document exists
  const getRes = await httpRequest({
    hostname: 'firestore.googleapis.com',
    path: `/v1/${docPath}`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  const now = new Date().toISOString();

  if (getRes.status === 200) {
    // Document exists - PATCH only rol and estado
    const patchRes = await httpRequest({
      hostname: 'firestore.googleapis.com',
      path: `/v1/${docPath}?updateMask.fieldPaths=rol&updateMask.fieldPaths=estado`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      }
    }, {
      fields: {
        rol: { stringValue: user.rol },
        estado: { stringValue: 'aprobado' }
      }
    });

    if (patchRes.status !== 200) {
      throw new Error(`Firestore PATCH failed: ${JSON.stringify(patchRes.data)}`);
    }
    return 'updated';
  } else {
    // Document doesn't exist - CREATE
    const createRes = await httpRequest({
      hostname: 'firestore.googleapis.com',
      path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/usuarios?documentId=${uid}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      }
    }, {
      fields: {
        email: { stringValue: user.email },
        nombre: { stringValue: user.nombre },
        rol: { stringValue: user.rol },
        estado: { stringValue: 'aprobado' },
        created_at: { timestampValue: now },
        setup_crm: { booleanValue: true }
      }
    });

    if (createRes.status !== 200) {
      throw new Error(`Firestore CREATE failed: ${JSON.stringify(createRes.data)}`);
    }
    return 'created';
  }
}

// ═══════════ MAIN ═══════════

async function main() {
  console.log('\n========================================');
  console.log('  ENAR CRM - Setup Team Users');
  console.log('========================================\n');

  console.log('Getting access token from Firebase CLI...');
  const accessToken = await getAccessToken();
  console.log('Access token obtained.\n');

  let authCreated = 0, firestoreCreated = 0, firestoreUpdated = 0, errors = 0;

  for (const user of CRM_USERS) {
    console.log(`\n${user.email} (${user.rol})`);

    try {
      // Step 1: Auth
      const authResult = await getOrCreateAuthUser(user.email, user.nombre, accessToken);
      if (authResult.created) {
        console.log(`  Auth: CREATED (uid=${authResult.uid}, pw=${DEFAULT_PASSWORD})`);
        authCreated++;
      } else {
        console.log(`  Auth: EXISTS  (uid=${authResult.uid})`);
      }

      // Step 2: Firestore
      const fsResult = await upsertFirestoreUser(authResult.uid, user, accessToken);
      if (fsResult === 'created') {
        console.log(`  Firestore: CREATED (rol=${user.rol}, estado=aprobado)`);
        firestoreCreated++;
      } else {
        console.log(`  Firestore: UPDATED (rol=${user.rol}, estado=aprobado)`);
        firestoreUpdated++;
      }

    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
      errors++;
    }
  }

  console.log('\n========================================');
  console.log('  Results:');
  console.log(`  Auth accounts created: ${authCreated}`);
  console.log(`  Firestore docs created: ${firestoreCreated}`);
  console.log(`  Firestore docs updated: ${firestoreUpdated}`);
  console.log(`  Errors: ${errors}`);
  console.log('========================================\n');

  if (authCreated > 0) {
    console.log(`New accounts password: ${DEFAULT_PASSWORD}`);
    console.log('Users should change their password after first login.\n');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
