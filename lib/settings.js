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

// ─── Pterodactyl panels ──────────────────────────────────────────────────────
// The admin site can hold more than one panel (pterodactyl_panels, managed at
// Settings → Pterodactyl panels). Creating a server uses the panel flagged
// default there. If that table is empty — or missing, because the admin site has
// not been opened since this feature shipped — the single pterodactyl_url /
// pterodactyl_api_key pair in `settings` is used exactly as before, with the env
// fallback behind it. An existing deployment therefore behaves identically until
// a panel is actually added.
//
// Cached on the same 60-second clock as the rest of the settings: an admin edit
// applies within a minute and needs no restart.
let panelCache = null;
let panelCacheAt = 0;

async function loadPanels(force = false) {
  const now = Date.now();
  if (force || !panelCache || now - panelCacheAt > TTL) {
    try {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT id, name, url, api_key, is_default FROM pterodactyl_panels ORDER BY id ASC`
      );
      panelCache = Array.isArray(rows) ? rows : [];
    } catch (e) {
      // Table not created yet, or the database is unreachable. Either way this
      // must never break a reply — the legacy config below still stands.
      panelCache = [];
    }
    panelCacheAt = now;
  }
  return panelCache;
}

/** The panels this bot can see, for callers that need the list. */
async function getPanels() {
  const rows = await loadPanels();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    url: String(r.url || '').replace(/\/+$/, ''),
    hasKey: !!String(r.api_key || '').trim(),
    isDefault: r.is_default === true,
  }));
}

/** Which panel to create on: the one asked for, else the default, else the first. */
function pickPanel(rows, panelId) {
  const list = Array.isArray(rows) ? rows : [];
  if (panelId !== null && panelId !== undefined && panelId !== '') {
    const want = Number(panelId);
    const hit = list.find((r) => Number(r.id) === want);
    // An explicit panel that is not configured is NOT quietly swapped for another
    // one: creating a server on a panel nobody chose is worse than saying so.
    if (!hit) throw new Error(`Panel #${panelId} is not configured on the bot.`);
    return hit;
  }
  if (!list.length) return null;
  return list.find((r) => r.is_default === true) || list[0];
}

// Panel + payment config: DB value wins, env is the fallback.
async function getPanelConfig(panelId = null) {
  const s = await loadSettings();
  const panel = pickPanel(await loadPanels(), panelId);

  // A selected panel is used AS IT IS — its URL and its key, with no per-field
  // fallback. Substituting the legacy key into a panel that simply has no key yet
  // would send one panel's credential to another panel's address: a confusing 401
  // at best, and a request carrying the wrong secret at worst. An unconfigured
  // panel is meant to fail loudly, which is what the admin's Test button reports.
  // The legacy pair is used only when there is no panel at all.
  return {
    paystackKey: (s.paystack_secret_key && String(s.paystack_secret_key).trim()) || process.env.PAYSTACK_SECRET_KEY || '',
    pteroUrl: panel
      ? String(panel.url || '').replace(/\/+$/, '')
      : ((s.pterodactyl_url && String(s.pterodactyl_url).trim()) || process.env.PTERODACTYL_URL || 'https://public.mzazi.shop'),
    pteroKey: panel
      ? String(panel.api_key || '').trim()
      : ((s.pterodactyl_api_key && String(s.pterodactyl_api_key).trim()) || process.env.PTERODACTYL_API_KEY || ''),
    // Which panel this is, so a created server can record where it lives.
    panelId: panel ? panel.id : null,
    panelName: panel ? panel.name : 'Settings default',
  };
}

// The key API commands use (set on the admin Settings page).
async function getMzaziApiKey() {
  return getSetting('mzazi_api_key', process.env.MZAZI_API_KEY || '');
}

module.exports = { loadSettings, getSetting, getPanelConfig, getPanels, getMzaziApiKey };
