// ─────────────────────────────────────────────────────────────────────────────
// BOT TELEMETRY — reports bot status to the website and executes admin controls.
//   Heartbeat : POST {API_BASE}/api/bot/status    every 30s (Bearer BOT_API_KEY)
//   Controls  : GET  {API_BASE}/api/bot/control   every 15s → executes actions
//               POST {API_BASE}/api/bot/control   reports completion
//
// Supported control actions:
//   sync      → force a remote command registry sync
//   broadcast → send a message to all groups of every WhatsApp session
//   botname   → update the WhatsApp profile name on every session
// ─────────────────────────────────────────────────────────────────────────────
const config = require("../settings.js");

const REMOTE_API_URL =
  process.env.REMOTE_API_URL || config.remoteApiUrl || "https://mzazi.shop/api/bot-command";
const BOT_API_KEY = process.env.BOT_API_KEY || config.remoteApiKey || "";
const API_BASE = REMOTE_API_URL.replace(/\/api\/bot-command\/?$/, "");
const STATUS_URL = `${API_BASE}/api/bot/status`;
const CONTROL_URL = `${API_BASE}/api/bot/control`;

const startedAt = Date.now();
const HEARTBEAT_MS = 30 * 1000;
const CONTROL_POLL_MS = 15 * 1000;

const headers = { Authorization: `Bearer ${BOT_API_KEY}` };

async function reportStatus() {
  if (!BOT_API_KEY) return;
  try {
    const { getRemoteStatus } = require("./remoteCommands");
    const rs = getRemoteStatus();

    let sessions = 0;
    try {
      const WA = require("../whatsapp");
      sessions = WA.activeSessions ? WA.activeSessions.size : 0;
    } catch {}

    await fetch(STATUS_URL, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        botId: "main",
        version: (require("../package.json").version || "3.0.0"),
        uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        telegramOnline: true,
        whatsappSessions: sessions,
        commandCount: rs.count,
        lastSyncAt: rs.syncedAt,
        lastSyncError: rs.lastError,
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {}
}

async function pollControls() {
  if (!BOT_API_KEY) return;
  try {
    const res = await fetch(CONTROL_URL, { headers, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return;
    const { controls } = await res.json();
    if (!Array.isArray(controls)) return;

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
    await fetch(CONTROL_URL, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, result: String(result).slice(0, 500) }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {}
}

async function executeControl(action, payload) {
  switch (action) {
    case "sync": {
      const { syncRemoteCommands } = require("./remoteCommands");
      const r = await syncRemoteCommands();
      if (!r.ok) throw new Error(r.error);
      return `Synced ${r.data.commands.length} commands from mzazi.shop`;
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
