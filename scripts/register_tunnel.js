const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

async function registerTunnel(tunnelUrl) {
  if (!tunnelUrl) {
    console.error('Uso: node register_tunnel.js <tunnel_url>');
    process.exit(1);
  }

  const envPath = path.join(__dirname, '..', '.env.local');
  const env = parseEnvFile(envPath);

  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = (env.GOOGLE_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const sheetId = env.GOOGLE_SHEET_ID || process.env.GOOGLE_SHEET_ID;

  if (!email || !privateKey || !sheetId) {
    console.warn('[AVISO] Credenciales de Google Sheets no encontradas en .env.local');
    return;
  }

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const updatedAt = new Date().toISOString();

  // Asegurar que la pestaña Config exista
  try {
    await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'Config!A1:C1',
    });
  } catch (e) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: 'Config' } } }],
        },
      });
    } catch {}
  }

  // Guardar fila 1 y fila 2
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: 'Config!A1:C2',
    valueInputOption: 'RAW',
    requestBody: {
      values: [
        ['Clave', 'Valor', 'ActualizadoEl'],
        ['TUNNEL_URL', tunnelUrl.trim(), updatedAt],
      ],
    },
  });

  console.log(`[OK] URL registrada en Google Sheets: ${tunnelUrl.trim()} (${updatedAt})`);
}

const argUrl = process.argv[2];
registerTunnel(argUrl).catch((err) => {
  console.error('[ERROR] Guardando túnel en Google Sheets:', err.message);
});
