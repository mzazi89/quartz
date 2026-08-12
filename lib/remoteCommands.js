// ─────────────────────────────────────────────────────────────────────────────
// REMOTE COMMANDS — command registry synced from the website
//   Source : https://mzazi.shop/api/bot-command  (env: REMOTE_API_URL)
//   Auth   : Authorization: Bearer <BOT_API_KEY>  (env: BOT_API_KEY)
//   Verify : HMAC-SHA256 signature (X-Mzazi-Signature) over the response body
//   Cache  : database/remoteCommands.json
//
// Commands are defined on the website (data/bot-commands.json). The bot syncs
// them on startup, every 30 minutes, and via the .synccmd command.
// ─────────────────────────────────────────────────────────────────────────────
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const config = require("../settings.js");

const REMOTE_API_URL = process.env.REMOTE_API_URL || config.remoteApiUrl || "https://mzazi.shop/api/bot-command";
const BOT_API_KEY = process.env.BOT_API_KEY || config.remoteApiKey || "";
const CACHE_PATH = path.join(__dirname, "..", "database", "remoteCommands.json");
const FETCH_TIMEOUT = 30000; // generous: full registry is ~800 KB and Vercel cold starts can be slow
const FETCH_ATTEMPTS = 3; // retries on timeout / network errors
const FETCH_BACKOFF_MS = [1000, 3000];
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

// ─── signature ───────────────────────────────────────────────────────────────
function verifySignature(body, signatureHeader) {
  if (!BOT_API_KEY || !signatureHeader) return false;
  const [algo, expected] = String(signatureHeader).split("=");
  if (algo !== "sha256" || !expected) return false;
  const actual = crypto.createHmac("sha256", BOT_API_KEY).update(body).digest("hex");
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ─── fetch (with retries for slow cold starts / transient network errors) ─────
async function fetchRemote(timeoutMs = FETCH_TIMEOUT) {
  if (!BOT_API_KEY) return { ok: false, error: "BOT_API_KEY not configured (set it in .env — same value as the website's BOT_API_KEY)" };

  let lastError = "Unknown error";
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(REMOTE_API_URL, {
        headers: { Authorization: `Bearer ${BOT_API_KEY}` },
        signal: controller.signal,
      });
      const body = await res.text();
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
      } else if (!verifySignature(body, res.headers.get("x-mzazi-signature"))) {
        lastError = "Signature verification failed — possible tampering";
      } else {
        const data = JSON.parse(body);
        if (!data.ok || !Array.isArray(data.commands)) {
          lastError = "Invalid payload shape";
        } else {
          return { ok: true, data };
        }
      }
    } catch (e) {
      lastError = e.name === "AbortError" ? `Timeout after ${timeoutMs}ms` : e.message;
    } finally {
      clearTimeout(timer);
    }

    if (attempt < FETCH_ATTEMPTS) {
      const backoff = FETCH_BACKOFF_MS[attempt - 1] || 3000;
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  return { ok: false, error: `${lastError} (${FETCH_ATTEMPTS} attempts against ${REMOTE_API_URL})` };
}

async function syncRemoteCommands() {
  loadCache();
  const result = await fetchRemote();
  if (result.ok) {
    cache.commands = result.data.commands;
    cache.updatedAt = result.data.updatedAt || null;
    cache.syncedAt = new Date().toISOString();
    cache.lastError = null;
    cacheVersion = cache.syncedAt;
    saveCache();
  } else {
    cache.lastError = result.error;
    saveCache();
  }
  return result;
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
    url: REMOTE_API_URL,
    keyConfigured: !!BOT_API_KEY,
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

module.exports = {
  syncRemoteCommands,
  getRemoteCommand,
  listRemoteCommands,
  runRemoteCommand,
  getRemoteStatus,
};
