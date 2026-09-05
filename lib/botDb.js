// ─────────────────────────────────────────────────────────────────────────────
// BOT DB — direct access to the SHARED Neon database
//
// The bot and the website (mzazi.shop) use the SAME Neon database. Commands,
// bot status and control actions all live there, so the bot reads and writes
// them directly via this module — no HTTP API, no keys, no signatures.
//
//   bot_commands → imported by the bot (commands defined in the admin dashboard)
//   bot_status   → written by the bot (heartbeat shown in the dashboard)
//   bot_control  → claimed/executed by the bot (actions issued in the dashboard)
//
// The table definitions below are idempotent and match the website's schema
// exactly (lib/database.js), so whichever side runs first, they agree.
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('./prismaClient');

let ensured = false;

async function ensureTables() {
  if (ensured) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS bot_commands (
      id SERIAL PRIMARY KEY,
      name VARCHAR(64) UNIQUE NOT NULL,
      aliases JSONB DEFAULT '[]'::jsonb,
      description TEXT DEFAULT '',
      category VARCHAR(64) DEFAULT 'General',
      usage TEXT DEFAULT '',
      owner_only BOOLEAN DEFAULT false,
      admin_only BOOLEAN DEFAULT false,
      group_only BOOLEAN DEFAULT false,
      enabled BOOLEAN DEFAULT true,
      code TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS bot_status (
      bot_id VARCHAR(64) PRIMARY KEY,
      online BOOLEAN DEFAULT false,
      version VARCHAR(32),
      uptime_seconds BIGINT DEFAULT 0,
      telegram_online BOOLEAN DEFAULT false,
      whatsapp_sessions INTEGER DEFAULT 0,
      command_count INTEGER DEFAULT 0,
      last_sync_at TIMESTAMP,
      last_sync_error TEXT,
      last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS bot_control (
      id SERIAL PRIMARY KEY,
      action VARCHAR(64) NOT NULL,
      payload JSONB DEFAULT '{}'::jsonb,
      status VARCHAR(20) DEFAULT 'pending',
      result TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      claimed_at TIMESTAMP,
      done_at TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // ── WhatsApp panel reseller system ─────────────────────────────────────────
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS reseller_passwords (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      status TEXT DEFAULT 'unused',
      activated_by TEXT,
      activated_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS whatsapp_panels (
      id SERIAL PRIMARY KEY,
      phone TEXT NOT NULL,
      username TEXT NOT NULL,
      size TEXT NOT NULL,
      ram INTEGER DEFAULT 0,
      cpu INTEGER DEFAULT 0,
      disk INTEGER DEFAULT 0,
      server_id INTEGER,
      ptero_user_id INTEGER,
      panel_url TEXT,
      password TEXT,
      reseller_phone TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  ensured = true;
}

function parseAliases(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value || '[]');
    } catch {
      return [];
    }
  }
  return [];
}

// Map a bot_commands row to the command object shape the engine expects
function mapRow(r) {
  return {
    name: r.name,
    aliases: parseAliases(r.aliases),
    description: r.description || '',
    category: r.category || 'General',
    usage: r.usage || '',
    ownerOnly: !!r.owner_only,
    adminOnly: !!r.admin_only,
    groupOnly: !!r.group_only,
    enabled: r.enabled !== false,
    code: r.code || '',
  };
}

module.exports = { prisma, ensureTables, mapRow };
