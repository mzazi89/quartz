// ─────────────────────────────────────────────────────────────────────────────
// BOT TELEMETRY — status + admin controls through the SHARED Neon database
//
//   Heartbeat : upsert bot_status every 30s (read by the admin dashboard)
//   Controls  : claim bot_control every 15s → execute → report back
//
// No HTTP API, no keys — the bot and the website share the same database.
//
// Supported control actions:
//   sync      → force a command registry import from bot_commands
//   broadcast → send a message to all groups of every WhatsApp session
//   botname   → update the WhatsApp profile name on every session
//   pair      → request a WhatsApp pairing code (from the website /api/pair)
// ─────────────────────────────────────────────────────────────────────────────
const { prisma, ensureTables } = require("./botDb.js");

const startedAt = Date.now();
const HEARTBEAT_MS = 30 * 1000;
const CONTROL_POLL_MS = 15 * 1000;

let lastHeartbeatError = null;

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

    await prisma.$executeRawUnsafe(
      `INSERT INTO bot_status (bot_id, online, version, uptime_seconds, telegram_online, whatsapp_sessions, command_count, last_sync_at, last_sync_error, last_seen_at)
       VALUES ('main', true, $1, $2, true, $3, $4, $5::timestamp, $6, CURRENT_TIMESTAMP)
       ON CONFLICT (bot_id) DO UPDATE SET
         online = true,
         version = EXCLUDED.version,
         uptime_seconds = EXCLUDED.uptime_seconds,
         telegram_online = true,
         whatsapp_sessions = EXCLUDED.whatsapp_sessions,
         command_count = EXCLUDED.command_count,
         last_sync_at = EXCLUDED.last_sync_at,
         last_sync_error = EXCLUDED.last_sync_error,
         last_seen_at = CURRENT_TIMESTAMP`,
      require("../package.json").version || "3.0.0",
      Math.floor((Date.now() - startedAt) / 1000),
      sessions,
      rs.count,
      rs.syncedAt,
      rs.lastError
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
  } catch (e) {}
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
