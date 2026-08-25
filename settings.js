// ─────────────────────────────────────────────────────────────────────────────
// BOT CONFIG — static defaults + live overrides from the shared Neon DB.
//
// Every value below can be overridden from the ADMIN SETTINGS PAGE
// (admin.mzazi.shop/admin/settings), which writes to the shared `settings`
// table. This module refreshes those overrides:
//   • at require time,
//   • every 60 seconds (same TTL as lib/settings.js),
//   • on demand via loadBotSettings(true).
//
// Precedence: DB override  →  process.env  →  static default below.
// (DATABASE_URL stays in the server env on purpose — never stored in the DB.)
// ─────────────────────────────────────────────────────────────────────────────
const staticConfig = {
  botName: "MZAZI TECH QUARTZ BOT",
  owner: "Mrs Mzazi",

  // Remote command registry — commands are exported from the website
  // (https://mzazi.shop/api/bot-command). The key must match the website's
  // BOT_API_KEY env var. Prefer setting BOT_API_KEY in .env.
  remoteApiUrl: process.env.REMOTE_API_URL || "https://mzazi.shop/api/bot-command",
  remoteApiKey: process.env.BOT_API_KEY || "",
  // Prefer the TELEGRAM_BOT_TOKEN secret; falls back to the token that
  // shipped in this file so the bot still boots before the secret is set.
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || "8687055102:AAEYim7rob-ENfMXTfXw06MnCpzWOVn0JYA",
  telegramOwner: 6454759976,
  whatsappOwner: "254741388986@s.whatsapp.net",

  prefix: /^[°•π÷×¶∆£¢€¥®™+✓_=|~!?@#$%^&.©^]/i,

  sessionPath: "./database/sessions/",

  connectionImage: "https://files.catbox.moe/8yccop.jpg",

  // ─── Paystack ───────────────────────────────────────────────────────────────
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY || "",
  paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY || "",

  // ─── Webhook server ─────────────────────────────────────────────────────────
  webhookPort: parseInt(process.env.WEBHOOK_PORT || "3000", 10),
  webhookUrl: process.env.WEBHOOK_URL || "",

  // ─── Database ────────────────────────────────────────────────────────────────
  databaseUrl: process.env.DATABASE_URL || "",

  // ─── MZAZI site API ─────────────────────────────────────────────────────────
  // Developer API key for mzazi.shop endpoints (create one in the API dashboard).
  // Used by Download-category bot commands (e.g. .play, .yt, .tiktok).
  mzaziSiteUrl: process.env.MZAZI_SITE_URL || "https://mzazi.shop",
  mzaziApiKey: process.env.MZAZI_API_KEY || "",

  // ─── Telemetry ──────────────────────────────────────────────────────────────
  // Reported public IP (bot_status) — leave empty to auto-detect.
  botIp: process.env.BOT_IP || "",

  // ─── Subscription Plans ──────────────────────────────────────────────────────
  plans: {
    FREE:      { name: "Free",             maxDevices: 1,   price: 0,   days: 0  },
    PLAN_5:    { name: "5 Devices",        maxDevices: 5,   price: 100, days: 30 },
    PLAN_10:   { name: "10 Devices",       maxDevices: 10,  price: 150, days: 30 },
    PLAN_20:   { name: "20 Devices",       maxDevices: 20,  price: 200, days: 30 },
    UNLIMITED: { name: "Unlimited",        maxDevices: 999, price: 250, days: 30 },
  },

  theme: {
    name: "MZAZI TECH QUARTZ BOT",
    mode: "DARK",
    primaryColor: "#007BFF",
    secondaryColor: "#FFFFFF",
    backgroundColor: "#000000",
    accentColor: "#00A2FF"
  },

  fonts: {
    bold: (text) => {
      const chars = {
        'a': '𝗮', 'b': '𝗯', 'c': '𝗰', 'd': '𝗱', 'e': '𝗲', 'f': '𝗳',
        'g': '𝗴', 'h': '𝗵', 'i': '𝗶', 'j': '𝗷', 'k': '𝗸', 'l': '𝗹',
        'm': '𝗺', 'n': '𝗻', 'o': '𝗼', 'p': '𝗽', 'q': '𝗾', 'r': '𝗿',
        's': '𝘀', 't': '𝘁', 'u': '𝘂', 'v': '𝘃', 'w': '𝘄', 'x': '𝘅',
        'y': '𝘆', 'z': '𝘇',
        'A': '𝗔', 'B': '𝗕', 'C': '𝗖', 'D': '𝗗', 'E': '𝗘', 'F': '𝗙',
        'G': '𝗚', 'H': '𝗛', 'I': '𝗜', 'J': '𝗝', 'K': '𝗞', 'L': '𝗟',
        'M': '𝗠', 'N': '𝗡', 'O': '𝗢', 'P': '𝗣', 'Q': '𝗤', 'R': '𝗥',
        'S': '𝗦', 'T': '𝗧', 'U': '𝗨', 'V': '𝗩', 'W': '𝗪', 'X': '𝗫',
        'Y': '𝗬', 'Z': '𝗭',
        '0': '𝟬', '1': '𝟭', '2': '𝟮', '3': '𝟯', '4': '𝟰',
        '5': '𝟱', '6': '𝟲', '7': '𝟳', '8': '𝟴', '9': '𝟵'
      };
      return text.split('').map(char => chars[char] || char).join('');
    },

    italic: (text) => {
      const chars = {
        'a': '𝘢', 'b': '𝘣', 'c': '𝘤', 'd': '𝘥', 'e': '𝘦', 'f': '𝘧',
        'g': '𝘨', 'h': '𝘩', 'i': '𝘪', 'j': '𝘫', 'k': '𝘬', 'l': '𝘭',
        'm': '𝘮', 'n': '𝘯', 'o': '𝘰', 'p': '𝘱', 'q': '𝘲', 'r': '𝘳',
        's': '𝘴', 't': '𝘵', 'u': '𝘶', 'v': '𝘷', 'w': '𝘸', 'x': '𝘹',
        'y': '𝘺', 'z': '𝘻',
        'A': '𝘈', 'B': '𝘉', 'C': '𝘊', 'D': '𝘋', 'E': '𝘌', 'F': '𝘍',
        'G': '𝘎', 'H': '𝘏', 'I': '𝘐', 'J': '𝘑', 'K': '𝘒', 'L': '𝘓',
        'M': '𝘔', 'N': '𝘕', 'O': '𝘖', 'P': '𝘗', 'Q': '𝘘', 'R': '𝘙',
        'S': '𝘚', 'T': '𝘛', 'U': '𝘜', 'V': '𝘝', 'W': '𝘞', 'X': '𝘟',
        'Y': '𝘠', 'Z': '𝘡'
      };
      return text.split('').map(char => chars[char] || char).join('');
    }
  }
};

// ─── Dynamic overrides from the shared Neon `settings` table ─────────────────
// DB key (admin Settings page) → config key, with optional coercion.
const DB_KEY_MAP = [
  ['bot_name',             'botName'],
  ['owner',                'owner'],
  ['telegram_owner',       'telegramOwner',    Number],
  ['whatsapp_owner',       'whatsappOwner'],
  ['connection_image',     'connectionImage'],
  ['telegram_bot_token',   'telegramToken'],
  ['remote_api_url',       'remoteApiUrl'],
  ['bot_api_key',          'remoteApiKey'],
  ['paystack_secret_key',  'paystackSecretKey'],
  ['paystack_public_key',  'paystackPublicKey'],
  ['webhook_port',         'webhookPort',      Number],
  ['webhook_url',          'webhookUrl'],
  ['mzazi_site_url',       'mzaziSiteUrl'],
  ['mzazi_api_key',        'mzaziApiKey'],
  ['bot_ip',               'botIp'],
];

const overrides = new Map(); // configKey -> value (DB wins over env/static)

function applyOverrides(rows) {
  for (const [dbKey, cfgKey, coerce] of DB_KEY_MAP) {
    const raw = rows && rows[dbKey];
    const val = raw === null || raw === undefined ? "" : String(raw).trim();
    if (!val) continue; // empty field → keep env/static fallback
    let out = val;
    if (cfgKey === "whatsappOwner" && /^[0-9]+$/.test(val)) out = val + "@s.whatsapp.net";
    if (coerce === Number) {
      const n = Number(val);
      if (!Number.isNaN(n)) out = n;
    }
    overrides.set(cfgKey, out);
  }
}

function getConfig() {
  return { ...staticConfig, ...Object.fromEntries(overrides) };
}

async function loadBotSettings(force = false) {
  try {
    if (!process.env.DATABASE_URL) return getConfig(); // no DB configured — env/static only
    const { loadSettings } = require("./lib/settings");
    applyOverrides(await loadSettings(force));
  } catch (e) {
    // settings table unreachable — keep env/static fallbacks
  }
  return getConfig();
}

// Config object — DB override wins, then env/static default.
const config = new Proxy(staticConfig, {
  get(target, prop, receiver) {
    if (overrides.has(prop)) return overrides.get(prop);
    return Reflect.get(target, prop, receiver);
  },
  set(target, prop, value) {
    overrides.set(prop, value);
    return true;
  },
});

// Attach helpers to the exported object.
staticConfig.loadBotSettings = loadBotSettings;
staticConfig.applyOverrides = applyOverrides;
staticConfig.getConfig = getConfig;

// Kick off the first load immediately; refresh every 60s (same cadence as
// lib/settings.js). Failures are silent — the bot keeps its fallbacks.
loadBotSettings(false).catch(() => {});
setInterval(() => { loadBotSettings(false).catch(() => {}); }, 60 * 1000);

module.exports = config;
