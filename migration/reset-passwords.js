/**
 * Reset passwords for CRM users using Identity Toolkit Admin API
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const PROJECT_ID = 'enar-b2b';
const NEW_PASSWORD = 'Enar2025!';

const USERS_TO_RESET = [
  'jotact2002@gmail.com',
  'vendedor2.enar@gmail.com',
  'adminfw@farmawebonline.com',
  'sebastianbumq@enarapp.com'
];

function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function getAccessToken() {
  const configPath = path.join(require('os').homedir(), '.config', 'configstore', 'firebase-tools.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const refreshToken = config.tokens?.refresh_token;

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

  return res.access_token;
}

async function main() {
  console.log('\n=== Reset Passwords ===\n');

  const accessToken = await getAccessToken();

  for (const email of USERS_TO_RESET) {
    try {
      // Lookup user
      const lookupRes = await httpRequest({
        hostname: 'identitytoolkit.googleapis.com',
        path: `/v1/projects/${PROJECT_ID}/accounts:lookup`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      }, { email: [email] });

      if (!lookupRes.data.users || !lookupRes.data.users.length) {
        console.log(`${email}: NOT FOUND`);
        continue;
      }

      const uid = lookupRes.data.users[0].localId;
      const providers = (lookupRes.data.users[0].providerUserInfo || []).map(p => p.providerId);

      // Update password (and add password provider if only Google)
      const updateRes = await httpRequest({
        hostname: 'identitytoolkit.googleapis.com',
        path: `/v1/projects/${PROJECT_ID}/accounts:update`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      }, {
        localId: uid,
        password: NEW_PASSWORD,
        emailVerified: true
      });

      if (updateRes.status === 200) {
        console.log(`${email}: PASSWORD SET (uid=${uid}, providers=[${providers}])`);
      } else {
        console.log(`${email}: ERROR - ${JSON.stringify(updateRes.data)}`);
      }

    } catch (err) {
      console.log(`${email}: ERROR - ${err.message}`);
    }
  }

  console.log(`\nNew password for all: ${NEW_PASSWORD}\n`);
}

main();
