// ─────────────────────────────────────────────────────────────────────────────
// SHARED SETTINGS — key/value config stored in the Neon `settings` table.
//
// Lets the admin panel configure the bot (Paystack keys, Pterodactyl
// credentials…) without touching the server env. The bot falls back to
// process.env when a key is missing in the DB, so nothing breaks until the
// admin saves the values. Values are cached for 60s — an admin edit applies
// within a minute, no restart needed.
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('./prismaClient');

let cache = null;
let cacheAt = 0;
const TTL = 60 * 1000;

async function loadSettings(force = false) {
  const now = Date.now();
  if (force || !cache || now - cacheAt > TTL) {
    cache = {};
    try {
      const rows = await prisma.$queryRawUnsafe(`SELECT key, value FROM settings`);
      for (const r of rows) cache[r.key] = r.value;
    } catch (e) {
      // settings table not created yet — start empty
    }
    cacheAt = now;
  }
  return cache;
}

async function getSetting(key, envFallback = '') {
  const s = await loadSettings();
  return (s[key] && String(s[key]).trim()) || envFallback;
}

// Panel + payment config: DB value wins, env is the fallback.
async function getPanelConfig() {
  const s = await loadSettings();
  return {
    paystackKey: (s.paystack_secret_key && String(s.paystack_secret_key).trim()) || process.env.PAYSTACK_SECRET_KEY || '',
    pteroUrl: (s.pterodactyl_url && String(s.pterodactyl_url).trim()) || process.env.PTERODACTYL_URL || 'https://public.mzazi.shop',
    pteroKey: (s.pterodactyl_api_key && String(s.pterodactyl_api_key).trim()) || process.env.PTERODACTYL_API_KEY || '',
  };
}

// The key API commands use (set on the admin Settings page).
async function getMzaziApiKey() {
  return getSetting('mzazi_api_key', process.env.MZAZI_API_KEY || '');
}

module.exports = { loadSettings, getSetting, getPanelConfig, getMzaziApiKey };
