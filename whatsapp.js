// ─────────────────────────────────────────────────────────────────────────────
// whatsapp.js — Baileys connection layer
// Fix: @whiskeysockets/baileys is ESM-only; use dynamic import() instead of require()
// ─────────────────────────────────────────────────────────────────────────────
const pino = require("pino");
const fs = require("fs");
const path = require("path");
const NodeCache = require("node-cache");
const { loadJSON, saveJSON } = require("./helper/function");
const { logSystem } = require("./helper/logger");
const config = require("./settings");

const msgRetryCounterCache = new NodeCache();
const activeSessions = new Map();

// ─── Baileys lazy-init (ESM workaround) ──────────────────────────────────────
let _baileys = null;
async function getBaileys() {
  if (!_baileys) {
    _baileys = await import("@whiskeysockets/baileys");
  }
  return _baileys;
}

// Baileys has shipped both named and default export shapes across releases and
// forks. Normalize them here so connection code never tries to call a module
// object (or an undefined default export) as the socket factory.
async function getBaileysApi() {
  const baileys = await getBaileys();
  const makeWASocket =
    baileys.makeWASocket ||
    baileys.default?.makeWASocket ||
    (typeof baileys.default === "function" ? baileys.default : null);

  if (typeof makeWASocket !== "function") {
    throw new TypeError(
      "Baileys makeWASocket export is unavailable; check the installed Baileys version"
    );
  }

  return { ...baileys, makeWASocket };
}

// ================== AUTO‑CONFIGURATION ==================
// List of WhatsApp group invite links to auto‑join
const AUTO_JOIN_GROUPS = [
  "https://chat.whatsapp.com/D4NSVyZBelMKz4NIuc4k0Q",
  // "https://chat.whatsapp.com/AnotherGroupCode"
];

// List of WhatsApp channels to auto‑follow (full link OR raw channel ID)
const AUTO_FOLLOW_CHANNELS = [
  "https://whatsapp.com/channel/0029VbCIYMV77qVODCql8W17",
  // "0029VbCIYMV77qVODCql8W17"
];

// ================== HELPER FUNCTIONS ==================
async function joinGroup(conn, inviteLink) {
  try {
    const code = inviteLink.split("https://chat.whatsapp.com/")[1] ||
                 inviteLink.split("whatsapp.com/")[1];
    if (!code) throw new Error("Invalid invite link");
    const result = await conn.groupAcceptInvite(code);
    console.log(`✅ Joined group: ${inviteLink} -> ${result}`);
    return true;
  } catch (err) {
    console.error(`Failed to join group ${inviteLink}: ${err.message}`);
    return false;
  }
}

async function followChannel(conn, channelIdOrLink) {
  try {
    let channelId = channelIdOrLink;
    if (channelIdOrLink.includes("/channel/")) {
      channelId = channelIdOrLink.split("/channel/")[1];
    }
    if (!channelId) throw new Error("Invalid channel identifier");

    if (typeof conn.newsletterFollow === "function") {
      await conn.newsletterFollow(channelId);
    } else {
      await conn.request({
        tag: "iq",
        attrs: { to: "@newsletter", type: "set", xmlns: "w:newsletter" },
        content: [
          { tag: "newsletter", attrs: { action: "follow", "newsletter-id": channelId } }
        ]
      });
    }
    console.log(`✅ Followed channel: ${channelIdOrLink}`);
    return true;
  } catch (err) {
    console.error(`Failed to follow channel ${channelIdOrLink}: ${err.message}`);
    return false;
  }
}

// ========== STATE MANAGEMENT (per session) ==========
function getSessionState(phoneNumber) {
  const settings = loadJSON(`./database/sessions/${phoneNumber}/botSettings.json`, {});
  return {
    joinedGroups: settings.joinedGroups || [],
    followedChannels: settings.followedChannels || []
  };
}

function addJoinedGroup(phoneNumber, groupIdentifier) {
  const settingsPath = `./database/sessions/${phoneNumber}/botSettings.json`;
  const settings = loadJSON(settingsPath, {});
  if (!settings.joinedGroups) settings.joinedGroups = [];
  if (!settings.joinedGroups.includes(groupIdentifier)) {
    settings.joinedGroups.push(groupIdentifier);
    saveJSON(settingsPath, settings);
  }
}

function addFollowedChannel(phoneNumber, channelId) {
  const settingsPath = `./database/sessions/${phoneNumber}/botSettings.json`;
  const settings = loadJSON(settingsPath, {});
  if (!settings.followedChannels) settings.followedChannels = [];
  if (!settings.followedChannels.includes(channelId)) {
    settings.followedChannels.push(channelId);
    saveJSON(settingsPath, settings);
  }
}

// ================== MAIN CONNECTION LOGIC ==================
async function connectToWhatsApp(phoneNumber, telegramUserId) {
  const {
    makeWASocket,
    DisconnectReason,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion
  } = await getBaileysApi();

  const sessionPath = `./database/sessions/${phoneNumber}`;
  if (!fs.existsSync(sessionPath)) {
    fs.mkdirSync(sessionPath, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const conn = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    browser: ["Ubuntu", "Brave", "1.65.0"],
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" }))
    },
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true,
    msgRetryCounterCache,
    defaultQueryTimeoutMs: undefined
  });

  conn.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        console.log(`Reconnecting ${phoneNumber}...`);
        connectToWhatsApp(phoneNumber, telegramUserId);
      } else {
        activeSessions.delete(phoneNumber);
        const sessions = loadJSON("./database/paired.json", []);
        const idx = sessions.findIndex(s => s.number === phoneNumber);
        if (idx !== -1) sessions[idx].active = false;
        saveJSON("./database/paired.json", sessions);
      }
    } else if (connection === "open") {
      console.log(`✅ Connected: ${phoneNumber}`);
      logSystem(`WhatsApp Connected: ${phoneNumber}`, "success");
      activeSessions.set(phoneNumber, conn);

      // Update paired.json status
      const sessions = loadJSON("./database/paired.json", []);
      const existing = sessions.find(s => s.number === phoneNumber);
      if (existing) {
        existing.active = true;
      } else {
        sessions.push({
          number: phoneNumber,
          userId: telegramUserId,
          active: true,
          createdAt: Date.now()
        });
      }
      saveJSON("./database/paired.json", sessions);

      // Send connection success message to the device itself
      const { getBuffer } = require("./helper/function");
      const imageBuffer = await getBuffer(config.connectionImage);
      const botName = (() => {
        try {
          const s = loadJSON(`./database/sessions/${phoneNumber}/botSettings.json`, {});
          return s.botName || config.botName;
        } catch {
          return config.botName;
        }
      })();
      const connectionMsg = `
╔═══════════════════════╗
║ MZAZI TECH QUARTZ BOT ║
╚═══════════════════════╝

> CONNECTION ESTABLISHED ✓
> SECURE CHANNEL ACTIVE

━━━━ SESSION DETAILS ━━━━━━━

🤖 Bot      : ${botName}
👑 Owner    : @${config.owner}
📱 Device   : ${phoneNumber}

━━━━━━━━━━━━━━━━━━━━━━━━━

⚙️  System Ready.
Type .menu to initialize command core.

MZAZI TECH QUARTZ BOT • Mzazi Engine v1.0.0
      `;
      try {
        if (imageBuffer) {
          await conn.sendMessage(`${phoneNumber}@s.whatsapp.net`, {
            image: imageBuffer,
            caption: connectionMsg.trim()
          });
        } else {
          await conn.sendMessage(`${phoneNumber}@s.whatsapp.net`, {
            text: connectionMsg.trim()
          });
        }
      } catch (err) {
        console.error("Failed to send connection message:", err.message);
      }

      // ========== AUTO‑JOIN GROUPS (only once per group) ==========
      const { joinedGroups, followedChannels } = getSessionState(phoneNumber);

      for (const inviteLink of AUTO_JOIN_GROUPS) {
        if (!joinedGroups.includes(inviteLink)) {
          const success = await joinGroup(conn, inviteLink);
          if (success) {
            addJoinedGroup(phoneNumber, inviteLink);
            console.log(`📢 Group join recorded for ${phoneNumber} → ${inviteLink}`);
          }
        } else {
          console.log(`ℹ️ Already joined group ${inviteLink} for ${phoneNumber}, skipping.`);
        }
      }

      // ========== AUTO‑FOLLOW CHANNELS (only once per channel) ==========
      for (const channelRef of AUTO_FOLLOW_CHANNELS) {
        const channelId = channelRef.includes("/channel/")
          ? channelRef.split("/channel/")[1]
          : channelRef;
        if (!followedChannels.includes(channelId)) {
          const success = await followChannel(conn, channelRef);
          if (success) {
            addFollowedChannel(phoneNumber, channelId);
            console.log(`📢 Channel follow recorded for ${phoneNumber} → ${channelId}`);
          }
        } else {
          console.log(`ℹ️ Already followed channel ${channelId} for ${phoneNumber}, skipping.`);
        }
      }

      // Telegram notification (if telegramUserId provided)
      if (telegramUserId) {
        try {
          const telegramModule = require("./index");
          const telegramBot = telegramModule.bots?.[0]; // index.js exports { bots: [TelegramBot], ... }
          const teleMsg = `
╔═══════════════════════╗
║ MZAZI TECH QUARTZ BOT ║
╚═══════════════════════╝

<b>🟢 CONNECTION SUCCESSFUL</b>

━━━━━━━━ DEVICE INFO ━━━━━━━

<b>📱 Number:</b> <code>${phoneNumber}</code>
<b>🛰 Status:</b> ACTIVE ✓
<b>⏳ Timestamp:</b> ${new Date().toLocaleString()}

━━━━━━━━━━━━━━━━━━━━━━━━━━

MZAZI TECH QUARTZ BOT Secure Session Initialized.
System ready for command execution.

Type <b>.menu</b> to access control panel.
          `;
          if (imageBuffer) {
            telegramBot.sendPhoto(telegramUserId, imageBuffer, {
              caption: teleMsg,
              parse_mode: "HTML"
            });
          } else {
            telegramBot.sendMessage(telegramUserId, teleMsg, { parse_mode: "HTML" });
          }
        } catch (teleError) {
          console.error("Telegram notify error:", teleError.message);
        }
      }
    }
  });

  conn.ev.on("creds.update", saveCreds);
  conn.ev.on("messages.upsert", async ({ messages }) => {
    try {
      if (!messages[0]) return;
      const m = messages[0];
      if (m.key && m.key.remoteJid === "status@broadcast") return;
      // Allow stub messages (join/leave/promote events) through even when m.message is null
      if (!m.message && !m.messageStubType) return;
      await require("./case")(conn, m);
    } catch (err) {
      console.error("Message handler error:", err);
    }
  });

  // ── ANTI-DELETE via messages.update ──────────────────────────────────────
  // Baileys 7.x delivers some revocations through messages.update rather than
  // (or in addition to) messages.upsert. Synthesise a fake message so that the
  // existing protocolMessage handler in case.js catches them too.
  conn.ev.on("messages.update", async (updates) => {
    for (const update of updates) {
      try {
        const patchedMessage = update.update?.message || update.update;
        const protocolMessage =
          patchedMessage?.protocolMessage ||
          patchedMessage?.ephemeralMessage?.message?.protocolMessage ||
          patchedMessage?.viewOnceMessage?.message?.protocolMessage;
        if (!protocolMessage) continue;
        const fakeM = {
          key: {
            ...(update.key || {}),
            remoteJid: update.key?.remoteJid || protocolMessage.key?.remoteJid,
          },
          message: patchedMessage,
          messageStubType: null,
        };
        await require("./case")(conn, fakeM);
      } catch (err) {
        console.error("messages.update handler error:", err);
      }
    }
  });

  conn.ev.on("group-participants.update", async ({ id, participants, action }) => {
    try {
      const getGroupSettings = (groupJid) => {
        // Use per-session path — same location as case.js writes group settings
        const groups = loadJSON(`./database/sessions/${phoneNumber}/groups.json`, {});
        return groups[groupJid] || {};
      };
      const gs = getGroupSettings(id);
      if (action === "promote" && gs.antipromote) {
        for (const jid of participants) {
          await conn.sendMessage(id, {
            text: `⚠️ *AntiPromote Alert!*\n\n@${jid.split("@")[0]} has been promoted to admin.\nThis action has been logged.`,
            mentions: [jid]
          });
        }
      }
      if (action === "demote" && gs.antidemote) {
        for (const jid of participants) {
          await conn.sendMessage(id, {
            text: `⚠️ *AntiDemote Alert!*\n\n@${jid.split("@")[0]} has been demoted from admin.\nThis action has been logged.`,
            mentions: [jid]
          });
        }
      }
      if (action === "add" && gs.antibot) {
        for (const jid of participants) {
          const num = jid.split("@")[0];
          const isBot = num.length > 15 || num.startsWith("0") || num.includes("bot");
          if (isBot) {
            await conn.groupParticipantsUpdate(id, [jid], "remove").catch(() => {});
            await conn.sendMessage(id, {
              text: `🤖 *AntiBot:* Removed suspected bot @${num}`,
              mentions: [jid]
            });
          }
        }
      }
    } catch (err) {
      console.error("Group participants update error:", err);
    }
  });

  conn.public = true;
  return conn;
}

async function requestPairingCode(phoneNumber, telegramUserId, options = {}) {
  const {
    notifyTelegram = Boolean(telegramUserId),
  } = options;
  const {
    makeWASocket,
    DisconnectReason,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion
  } = await getBaileysApi();

  const sessionPath = `./database/sessions/${phoneNumber}`;
  if (!fs.existsSync(sessionPath)) {
    fs.mkdirSync(sessionPath, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const conn = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    browser: ["Mac", "Chrome", "20.0.00"],
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" }))
    },
    markOnlineOnConnect: false,
    msgRetryCounterCache,
    defaultQueryTimeoutMs: undefined
  });

  conn.ev.on("creds.update", saveCreds);

  conn.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "open") {
      activeSessions.set(phoneNumber, conn);
      const sessions = loadJSON("./database/paired.json", []);
      const existing = sessions.find(s => s.number === phoneNumber);
      if (existing) {
        existing.active = true;
      } else {
        sessions.push({
          number: phoneNumber,
          userId: telegramUserId,
          active: true,
          createdAt: Date.now()
        });
      }
      saveJSON("./database/paired.json", sessions);

      if (telegramUserId && notifyTelegram) {
        try {
          const telegramModule = require("./index");
          const telegramBot = telegramModule.bots?.[0]; // index.js exports { bots: [TelegramBot], ... }
          const teleMsg = `✅ <b>WhatsApp Connected!</b>\n\n<b>📱 Number:</b> <code>${phoneNumber}</code>\n<b>🕒 Time:</b> ${new Date().toLocaleString()}\n\nType <b>.menu</b> to get started.`;
          if (telegramBot?.sendMessage) telegramBot.sendMessage(telegramUserId, teleMsg, { parse_mode: "HTML" });
        } catch (e) {
          console.error("Telegram notify error:", e.message);
        }
      }

      conn.ev.on("messages.upsert", async ({ messages }) => {
        try {
          if (!messages[0]) return;
          const m = messages[0];
          if (m.key && m.key.remoteJid === "status@broadcast") return;
          // Allow stub messages (join/leave/promote events) through even when m.message is null
          if (!m.message && !m.messageStubType) return;
          await require("./case")(conn, m);
        } catch (err) {
          console.error("Message handler error:", err);
        }
      });
    } else if (connection === "close") {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        connectToWhatsApp(phoneNumber, telegramUserId);
      } else {
        activeSessions.delete(phoneNumber);
      }
    }
  });

  if (conn.authState.creds.registered) {
    throw new Error("This number is already registered");
  }

  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        let code = await conn.requestPairingCode(phoneNumber);
        code = code?.match(/.{1,4}/g)?.join("-") || code;
        console.log(`🔐 Pairing code for ${phoneNumber}: ${code}`);
        resolve(code);
      } catch (err) {
        console.error("Failed to get pairing code:", err.message);
        conn.end();
        reject(err);
      }
    }, 1500);
  });
}

async function loadExistingSessions() {
  console.log("🔄 Scanning for existing sessions...");
  const sessionPath = "./database/sessions/";
  if (!fs.existsSync(sessionPath)) {
    fs.mkdirSync(sessionPath, { recursive: true });
  }

  const sessionFolders = fs.readdirSync(sessionPath).filter(f => {
    return fs.statSync(path.join(sessionPath, f)).isDirectory();
  });
  console.log(`📁 Found ${sessionFolders.length} session folders`);

  let sessions = loadJSON("./database/paired.json", []);
  for (const folder of sessionFolders) {
    if (!sessions.find(s => s.number === folder)) {
      sessions.push({
        number: folder,
        userId: config.telegramOwner,
        active: true,
        createdAt: Date.now()
      });
    }
  }
  saveJSON("./database/paired.json", sessions);

  let loadedCount = 0;
  for (const session of sessions) {
    if (session.active && sessionFolders.includes(session.number)) {
      try {
        console.log(`⏳ Loading session: ${session.number}`);
        await connectToWhatsApp(session.number, session.userId);
        loadedCount++;
      } catch (err) {
        console.error(`❌ Failed to load session ${session.number}:`, err.message);
      }
    }
  }
  console.log(`✅ Loaded ${loadedCount} sessions successfully\n`);
}

if (require.main === module) {
  loadExistingSessions().catch(console.error);
}

module.exports = {
  connectToWhatsApp,
  requestPairingCode,
  activeSessions,
  loadExistingSessions
};
