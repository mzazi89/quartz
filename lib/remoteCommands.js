// ─────────────────────────────────────────────────────────────────────────────
// REMOTE COMMANDS — command registry imported from the SHARED Neon database
//
// Commands are defined on the website (admin dashboard → bot_commands table).
// The bot imports them DIRECTLY from the same database (same DATABASE_URL) —
// no HTTP API, no API key, no signatures. The database itself is the
// connection between bot and website.
//
// The disk cache (database/remoteCommands.json) keeps the last successful
// import so commands keep working even if the database is briefly unreachable.
// Sync happens at startup, every 30 minutes, and via the .synccmd command.
// ─────────────────────────────────────────────────────────────────────────────
const fs = require("fs");
const path = require("path");
const { prisma, ensureTables, mapRow } = require("./botDb.js");

const CACHE_PATH = path.join(__dirname, "..", "database", "remoteCommands.json");
const RUN_TIMEOUT = 30000;

let cache = { commands: [], updatedAt: null, syncedAt: null, lastError: null };

// ─── cache ───────────────────────────────────────────────────────────────────
function loadCache() {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      cache = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
    }
  } catch (e) {
    cache = { commands: [], updatedAt: null, syncedAt: null, lastError: "Cache corrupted" };
  }
  if (!Array.isArray(cache.commands)) cache.commands = [];
}

function saveCache() {
  try {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  } catch (e) {}
}

// ─── sync (direct from the shared Neon database) ─────────────────────────────
async function syncRemoteCommands() {
  loadCache();
  try {
    await ensureTables();
    const rows = await prisma.$queryRawUnsafe(`
      SELECT name, aliases, description, category, usage, owner_only, admin_only, group_only, enabled, code
      FROM bot_commands
      WHERE enabled = true
      ORDER BY name
    `);

    cache.commands = rows.map(mapRow);
    cache.updatedAt = new Date().toISOString();
    cache.syncedAt = cache.updatedAt;
    cache.lastError =
      cache.commands.length === 0
        ? "0 commands found in bot_commands — check that the bot's DATABASE_URL points to the same Neon database as the website"
        : null;
    saveCache();

    return { ok: true, data: { commands: cache.commands, updatedAt: cache.updatedAt } };
  } catch (e) {
    cache.lastError = `DB sync failed: ${e.message}`;
    saveCache();
    return { ok: false, error: cache.lastError };
  }
}

// ─── lookup ──────────────────────────────────────────────────────────────────
function getRemoteCommand(name) {
  if (!name) return null;
  const n = String(name).toLowerCase();
  return (
    cache.commands.find((c) => c.name === n) ||
    cache.commands.find((c) => Array.isArray(c.aliases) && c.aliases.includes(n)) ||
    null
  );
}

function listRemoteCommands() {
  return cache.commands.map((c) => ({
    name: c.name,
    description: c.description || "",
    category: c.category || "General",
    ownerOnly: !!c.ownerOnly,
    adminOnly: !!c.adminOnly,
    groupOnly: !!c.groupOnly,
  }));
}

function getRemoteStatus() {
  return {
    source: "neon-db",
    dbConfigured: !!process.env.DATABASE_URL,
    keyConfigured: !!process.env.DATABASE_URL, // legacy field: commands come from the DB now
    syncedAt: cache.syncedAt,
    updatedAt: cache.updatedAt,
    lastError: cache.lastError,
    count: cache.commands.length,
  };
}

// ─── execution ───────────────────────────────────────────────────────────────
// Compiled-function cache: keyed by command name + sync version, so bodies are
// compiled once per registry sync instead of on every invocation.
const compiledCache = new Map();
let cacheVersion = cache.syncedAt || "initial";

async function runRemoteCommand(cmd, ctx, timeoutMs = RUN_TIMEOUT) {
  const keys = Object.keys(ctx);
  const cacheKey = `${cmd.name}:${cacheVersion}`;
  let fn = compiledCache.get(cacheKey);
  if (!fn) {
    fn = new Function(...keys, `return (async () => {\n${cmd.code}\n})()`);
    compiledCache.set(cacheKey, fn);
    // keep the cache bounded
    if (compiledCache.size > 1200) {
      compiledCache.delete(compiledCache.keys().next().value);
    }
  }

  const runner = fn(...keys.map((k) => ctx[k]));

  const timer = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timed out after ${timeoutMs / 1000}s`)), timeoutMs)
  );

  await Promise.race([runner, timer]);
}

loadCache();
cacheVersion = cache.syncedAt || "initial";

module.exports = {
  syncRemoteCommands,
  getRemoteCommand,
  listRemoteCommands,
  runRemoteCommand,
  getRemoteStatus,
};
