// ─────────────────────────────────────────────────────────────────────────────
// BOT AUTH — resolves the bot API key from the SHARED Neon database
//
// The bot and the website (mzazi.shop) use the SAME Neon database, so the bot
// API key lives in the `bot_config` table and both sides read it from there:
//   • website → lib/botKey.js (getBotApiKey) reads bot_config
//   • bot     → this module reads bot_config via the same DATABASE_URL
// If no key exists yet, the bot generates one and stores it — zero manual key
// management. BOT_API_KEY in .env is only a fallback for when the DB is
// unreachable. NOTE: DATABASE_URL is the real secret here — anyone holding it
// already has full database access.
// ─────────────────────────────────────────────────────────────────────────────
const crypto = require('crypto');
const config = require('../settings.js');

let cached = { key: null, at: 0 };
const TTL_MS = 5 * 60 * 1000;

async function ensureBotConfigTable(prisma) {
  await prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS bot_config (
      key VARCHAR(64) PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  );
}

async function resolveBotApiKey(force = false) {
  if (!force && cached.key && Date.now() - cached.at < TTL_MS) return cached.key;

  // 1) Shared Neon database (same DATABASE_URL as the website)
  if (process.env.DATABASE_URL) {
    try {
      const prisma = require('./prismaClient');
      await ensureBotConfigTable(prisma);

      const rows = await prisma.$queryRawUnsafe(
        `SELECT value FROM bot_config WHERE key = 'bot_api_key'`
      );
      let key = rows && rows[0] ? String(rows[0].value || '') : '';

      if (!key) {
        key = crypto.randomBytes(24).toString('hex');
        await prisma.$executeRawUnsafe(
          `INSERT INTO bot_config (key, value, updated_at)
           VALUES ('bot_api_key', $1, CURRENT_TIMESTAMP)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
          key
        );
        console.log('🔑 Generated a new bot API key in the shared database (bot_config).');
      }

      cached = { key, at: Date.now() };
      return key;
    } catch (e) {
      console.warn(`botAuth: DB key lookup failed (${e.message}) — falling back to .env BOT_API_KEY`);
    }
  }

  // 2) Fallback: environment / settings
  const envKey = process.env.BOT_API_KEY || config.remoteApiKey || '';
  cached = { key: envKey, at: Date.now() };
  return envKey;
}

module.exports = { resolveBotApiKey };
