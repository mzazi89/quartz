// ─────────────────────────────────────────────────────────────────────────────
// BOT TELEMETRY — status + admin controls through the SHARED Neon database
//
//   Heartbeat : upsert bot_status every 30s (read by the admin dashboard)
//   Controls  : claim bot_control every 15s → execute → report back
//   Registry  : auto-detect bot_commands changes every 15s → re-import
//
// No HTTP API, no keys — the bot and the website share the same database.
//
// Supported control actions:
//   sync      → force a command registry import from bot_commands
//   broadcast → send a message to all groups of every WhatsApp session
//   botname   → update the WhatsApp profile name on every session
//   pair      → request a WhatsApp pairing code (from the website /api/pair)
//   unpair    → logout a device (mode 'delete' also wipes session + DB row)
// ─────────────────────────────────────────────────────────────────────────────
const { prisma, ensureTables } = require("./botDb.js");
const config = require("../settings");

const startedAt = Date.now();
const HEARTBEAT_MS = 30 * 1000;
const CONTROL_POLL_MS = 15 * 1000;

let lastHeartbeatError = null;
let cachedIp = config.botIp || process.env.BOT_IP || null;

// Server public IP — fetched once at startup, cached forever (env BOT_IP overrides).
async function getPublicIp() {
  if (cachedIp) return cachedIp;
  try {
    const res = await fetch("https://api.ipify.org", {
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const ip = (await res.text()).trim();
      if (ip) cachedIp = ip;
    }
  } catch (e) {}
  return cachedIp || "";
}

// Fingerprint of the command registry (row count + newest updated_at). When it
// changes, the registry was edited from the website admin — re-import it so the
// change goes live without restarting the bot. Updated only on a successful
// import, so a transient DB failure retries on the next poll.
let lastRegistryFingerprint = null;

// numbers currently being paired (guards against duplicate sockets)
const pairingInFlight = new Set();

async function reportStatus() {
  try {
    await ensureTables();
    const { getRemoteStatus } = require("./remoteCommands");
    const rs = getRemoteStatus();

    let sessions = 0;
    try {
      const WA = require("../whatsapp");
      sessions = WA.activeSessions ? WA.activeSessions.size : 0;
    } catch {}

    // The numbers the bot currently holds in ./database/sessions/ — the admin
    // uses this list to show which sessions are really active on the bot.
    let sessionNumbers = [];
    try {
      const fs = require("fs");
      sessionNumbers = fs
        .readdirSync("./database/sessions", { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {}

    await prisma.$executeRawUnsafe(
      `ALTER TABLE bot_status ADD COLUMN IF NOT EXISTS session_numbers TEXT DEFAULT '[]'`
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE bot_status ADD COLUMN IF NOT EXISTS ip_address TEXT DEFAULT ''`
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE bot_status ADD COLUMN IF NOT EXISTS devices_meta TEXT DEFAULT '{}'`
    );

    // Per-session telemetry (online/battery/plugged/lastSeen) from whatsapp.js
    let devicesMeta = {};
    try {
      const WA = require("../whatsapp");
      for (const [num, t] of WA.sessionTelemetry || []) {
        devicesMeta[num] = t;
      }
    } catch {}

    const ip = await getPublicIp();

    await prisma.$executeRawUnsafe(
      `INSERT INTO bot_status (bot_id, online, version, uptime_seconds, telegram_online, whatsapp_sessions, command_count, last_sync_at, last_sync_error, session_numbers, ip_address, devices_meta, last_seen_at)
       VALUES ('main', true, $1, $2, true, $3, $4, $5::timestamp, $6, $7, $8, $9, CURRENT_TIMESTAMP)
       ON CONFLICT (bot_id) DO UPDATE SET
         online = true,
         version = EXCLUDED.version,
         uptime_seconds = EXCLUDED.uptime_seconds,
         telegram_online = true,
         whatsapp_sessions = EXCLUDED.whatsapp_sessions,
         command_count = EXCLUDED.command_count,
         last_sync_at = EXCLUDED.last_sync_at,
         last_sync_error = EXCLUDED.last_sync_error,
         session_numbers = EXCLUDED.session_numbers,
         ip_address = EXCLUDED.ip_address,
         devices_meta = EXCLUDED.devices_meta,
         last_seen_at = CURRENT_TIMESTAMP`,
      require("../package.json").version || "3.0.0",
      Math.floor((Date.now() - startedAt) / 1000),
      sessions,
      rs.count,
      rs.syncedAt,
      rs.lastError,
      JSON.stringify(sessionNumbers),
      ip,
      JSON.stringify(devicesMeta)
    );
    lastHeartbeatError = null;
  } catch (e) {
    const msg = `Heartbeat failed: ${e.message}`;
    if (lastHeartbeatError !== msg) {
      lastHeartbeatError = msg;
      console.log(`⚠ ${msg}`);
    }
  }
}

async function pollControls() {
  try {
    await ensureTables();
    const controls = await prisma.$queryRawUnsafe(`
      UPDATE bot_control SET status = 'claimed', claimed_at = CURRENT_TIMESTAMP
      WHERE id IN (SELECT id FROM bot_control WHERE status = 'pending' ORDER BY id ASC LIMIT 10)
      RETURNING id, action, payload
    `);

    for (const control of controls) {
      try {
        const result = await executeControl(control.action, control.payload || {});
        await reportControl(control.id, "done", result);
      } catch (e) {
        await reportControl(control.id, "failed", e.message || String(e));
      }
    }

    // Auto-detect admin edits to the command registry (~15s cadence).
    await checkCommandRegistry();
  } catch (e) {}
}

// Compares the live bot_commands table against the last imported state and
// re-imports when the admin changed/added/removed a command from the website.
async function checkCommandRegistry() {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS cnt, MAX(updated_at) AS max_at FROM bot_commands`
    );
    const cnt = rows[0] ? Number(rows[0].cnt) : 0;
    const maxAt = rows[0] && rows[0].max_at ? new Date(rows[0].max_at).toISOString() : "";
    const fp = `${cnt}|${maxAt}`;

    if (lastRegistryFingerprint === null) {
      // First poll — the boot sync (index.js) already imported the registry.
      lastRegistryFingerprint = fp;
      return;
    }

    if (fp !== lastRegistryFingerprint) {
      const { syncRemoteCommands } = require("./remoteCommands");
      const r = await syncRemoteCommands();
      if (r.ok) {
        lastRegistryFingerprint = fp;
        console.log(`↻ Command registry changed — auto re-imported ${r.data.commands.length} commands`);
      } else {
        console.log(`⚠ Command registry auto re-import failed: ${r.error}`);
      }
    }
  } catch (e) {
    // bot_commands missing or DB unavailable — retry on the next poll.
  }
}

async function reportControl(id, status, result) {
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE bot_control SET status = $1, result = $2, done_at = CURRENT_TIMESTAMP WHERE id = $3`,
      status,
      String(result).slice(0, 500),
      id
    );
  } catch (e) {}
}

async function executeControl(action, payload) {
  switch (action) {
    case "sync": {
      const { syncRemoteCommands } = require("./remoteCommands");
      const r = await syncRemoteCommands();
      if (!r.ok) throw new Error(r.error);
      return `Imported ${r.data.commands.length} commands from the shared database`;
    }

    case "broadcast": {
      if (!payload || typeof payload.message !== "string" || !payload.message.trim()) {
        throw new Error("Missing message");
      }
      const WA = require("../whatsapp");
      let sent = 0;
      let sessions = 0;
      for (const [, conn] of WA.activeSessions || []) {
        sessions++;
        try {
          const groups = await conn.groupFetchAllParticipating();
          for (const gid of Object.keys(groups || {})) {
            await conn.sendMessage(gid, { text: payload.message });
            sent++;
          }
        } catch (e) {}
      }
      if (sessions === 0) throw new Error("No active WhatsApp sessions to broadcast to");
      return `Broadcast sent to ${sent} group(s) across ${sessions} session(s)`;
    }

    case "botname": {
      if (!payload || typeof payload.name !== "string" || !payload.name.trim()) {
        throw new Error("Missing name");
      }
      const WA = require("../whatsapp");
      let done = 0;
      for (const [, conn] of WA.activeSessions || []) {
        try {
          await conn.updateProfileName(payload.name.trim());
          done++;
        } catch (e) {}
      }
      if (done === 0) throw new Error("No active WhatsApp sessions to rename");
      return `Profile name updated on ${done} session(s)`;
    }

    // Pairing requested from the website: number + account id are stored in the
    // control payload; the pairing code is reported back as the result so the
    // website can show it to the user. Same gates as the Telegram /pair flow.
    case "pair": {
      const { number, accountId } = payload || {};
      const digits = String(number || "").replace(/\D/g, "");
      if (!digits || digits.length < 10 || digits.length > 15) {
        throw new Error("Invalid phone number");
      }

      const WA = require("../whatsapp");
      if (WA.activeSessions.has(digits)) {
        throw new Error("This number is already paired");
      }
      if (pairingInFlight.has(digits)) {
        throw new Error("Pairing already in progress for this number — try again in a minute");
      }

      if (accountId) {
        const sub = require("./subscription");
        await sub.getOrCreateUser(accountId);

        // global premium-only toggle (mirrors the Telegram bot's runtime flag)
        let premiumOnly = false;
        try {
          premiumOnly = !!JSON.parse(
            require("fs").readFileSync("./database/settings.json", "utf8")
          ).premiumOnly;
        } catch {}
        if (premiumOnly) {
          const s = await sub.getUserSubscription(accountId);
          const expired = s.endDate && new Date(s.endDate) < new Date() && s.plan !== "FREE";
          if (!s || (expired ? "FREE" : s.plan || "FREE") === "FREE") {
            throw new Error("Pairing is available to premium users only");
          }
        }

        if (!(await sub.canAddDevice(accountId))) {
          throw new Error("Device limit reached for this account — upgrade your plan");
        }
      }

      pairingInFlight.add(digits);
      try {
        const code = await WA.requestPairingCode(digits, accountId || null, { notifyTelegram: false });
        if (accountId) {
          const sub = require("./subscription");
          sub.syncSessionToDb(accountId, digits, "ACTIVE").catch(() => {});
        }
        return JSON.stringify({ number: digits, code });
      } finally {
        pairingInFlight.delete(digits);
      }
    }

    // Unlink a device from the website: disconnect, remove the session folder,
    // and mark the DB session INACTIVE. Ownership is enforced (paired.json).
    case "unpair": {
      const { number, accountId } = payload || {};
      const digits = String(number || "").replace(/\D/g, "");
      if (!digits || digits.length < 10 || digits.length > 15) {
        throw new Error("Invalid phone number");
      }

      const fs = require("fs");
      const { loadJSON, saveJSON } = require("../helper/function");

      const sessions = loadJSON("./database/paired.json", []);
      const entry = sessions.find((s) => s.number === digits);
      if (entry && accountId && String(entry.userId) !== String(accountId)) {
        throw new Error("This number is not linked to your account");
      }
      if (!entry && accountId) {
        throw new Error("This number is not linked to your account");
      }

      const WA = require("../whatsapp");
      const conn = WA.activeSessions.get(digits);
      if (conn) {
        try { await conn.logout(); } catch (e) {}
        try { conn.end(); } catch (e) {}
        WA.activeSessions.delete(digits);
      }

      // Unlink = logout only: the device is logged out of WhatsApp and the
      // pairing removed; the session folder + DB row are kept.
      saveJSON("./database/paired.json", sessions.filter((s) => s.number !== digits));

      try {
        const { prisma } = require("./botDb");
        await prisma.$executeRawUnsafe(
          `UPDATE "WhatsAppSession" SET status = 'INACTIVE', "updatedAt" = CURRENT_TIMESTAMP WHERE "phoneNumber" = $1`,
          digits
        );
      } catch (e) {}

      // mode "delete" = full wipe: also delete the session folder and the DB row
      if (payload && payload.mode === "delete") {
        try { fs.rmSync(`./database/sessions/${digits}`, { recursive: true, force: true }); } catch (e) {}
        try {
          const { prisma } = require("./botDb");
          await prisma.$executeRawUnsafe(
            `DELETE FROM "WhatsAppSession" WHERE "phoneNumber" = $1`,
            digits
          );
        } catch (e) {}
      }

      return payload && payload.mode === "delete" ? `Deleted ${digits}` : `Unpaired ${digits}`;
    }

    default:
      throw new Error(`Unknown control action: ${action}`);
  }
}

function start() {
  reportStatus();
  pollControls();
  setInterval(reportStatus, HEARTBEAT_MS);
  setInterval(pollControls, CONTROL_POLL_MS);
}

module.exports = { start, reportStatus, pollControls, executeControl };
