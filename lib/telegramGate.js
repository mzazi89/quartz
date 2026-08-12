// ─────────────────────────────────────────────────────────────────────────────
// TELEGRAM MEMBERSHIP GATE — mandatory group membership before the bot answers
//
// Flow: /start → join buttons → user joins the groups → the bot records the
// join event (chat_member update) in database/telegramMembers.json → user taps
// "✅ I've Joined" → the bot verifies live membership → the bot unlocks.
//
// Verification:
//  • Public groups  — live check via getChatMember (works by @username).
//  • Private groups — live check via getChatMember (needs the numeric chat ID,
//    e.g. -1001234567890). The ID is captured automatically when the bot sees
//    any message or join event from that group (database/telegramGroups.json,
//    owner command /groups). Configure it with /setgroup <id> (persisted to
//    database/telegramGate.json), env TELEGRAM_REQUIRED_GROUP_2_ID, or by
//    editing REQUIRED_GROUPS below.
//  • Until the private ID is configured, a best-effort check uses the join
//    ledger: the user must be recorded as a member of a group where the owner
//    is also a member (excluding the public group itself).
//
// The owner always bypasses the gate.
// ─────────────────────────────────────────────────────────────────────────────
const fs = require("fs");
const path = require("path");
const config = require("../settings");

const REQUIRED_GROUPS = [
  { id: "@mzazitechinc2026", title: "MZAZI TECH INC", url: "https://t.me/mzazitechinc2026" },
  {
    id: "", // filled from env / config file at startup
    title: "MZAZI TECH QUARTZ",
    url: "https://t.me/+uDQBfksjxWJjMjY0",
  },
];

const GROUPS_FILE = path.join(__dirname, "..", "database", "telegramGroups.json");
const LEDGER_FILE = path.join(__dirname, "..", "database", "telegramMembers.json");
const GATE_CONFIG_FILE = path.join(__dirname, "..", "database", "telegramGate.json");
const GATE_DEDUP_MS = 15000;
const GOOD_STATUS = ["creator", "administrator", "member"];

module.exports = (bot) => {
  // ── persisted state ────────────────────────────────────────────────────────
  let seenGroups = {};   // groupId -> { id, title, username, type, firstSeen }
  let ledger = {};       // groupId -> { userId -> status }
  let gateConfig = {};   // { privateGroupId }
  try { seenGroups = JSON.parse(fs.readFileSync(GROUPS_FILE, "utf8")); } catch (e) {}
  try { ledger = JSON.parse(fs.readFileSync(LEDGER_FILE, "utf8")); } catch (e) {}
  try { gateConfig = JSON.parse(fs.readFileSync(GATE_CONFIG_FILE, "utf8")); } catch (e) {}

  REQUIRED_GROUPS[1].id =
    (process.env.TELEGRAM_REQUIRED_GROUP_2_ID || gateConfig.privateGroupId || "").trim();

  let warnedMissingId = false;
  let lastLedgerSave = 0;
  const lastGateSent = {};

  // ── helpers ────────────────────────────────────────────────────────────────
  function saveJson(file, data) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (e) {}
  }

  function captureChat(chat) {
    if (!chat || !["group", "supergroup", "channel"].includes(chat.type)) return;
    const key = String(chat.id);
    if (seenGroups[key] && seenGroups[key].title === (chat.title || "")) return;
    seenGroups[key] = {
      id: chat.id,
      title: chat.title || "",
      username: chat.username || "",
      type: chat.type,
      firstSeen: new Date().toISOString(),
    };
    saveJson(GROUPS_FILE, seenGroups);
    console.log(`📡 [TelegramGate] group captured: ${chat.id} | ${chat.title || "(no title)"}`);
  }

  function captureGroup(msg) {
    if (msg && msg.chat) captureChat(msg.chat);
  }

  // ── join-event ledger: store every member status change we observe ─────────
  function handleChatMember(update) {
    const cm = update.chat_member || update.my_chat_member;
    if (!cm || !cm.chat || !cm.new_chat_member || !cm.new_chat_member.user) return;
    captureChat(cm.chat);
    const gid = String(cm.chat.id);
    const uid = String(cm.new_chat_member.user.id);
    const status = cm.new_chat_member.status || "";
    if (!ledger[gid]) ledger[gid] = {};
    ledger[gid][uid] = status;
    const now = Date.now();
    if (now - lastLedgerSave > 2000) {
      lastLedgerSave = now;
      saveJson(LEDGER_FILE, ledger);
    }
    console.log(`📇 [TelegramGate] member event: ${uid} -> ${status} in ${gid}`);
  }

  // ── membership checks ──────────────────────────────────────────────────────
  async function isGroupMember(chatId, userId) {
    try {
      const r = await bot.getChatMember(chatId, userId);
      return GOOD_STATUS.includes(r.status);
    } catch (e) {
      return false;
    }
  }

  function isGoodStatus(status) {
    return GOOD_STATUS.includes(status);
  }

  // numeric ID of the public group (resolved from the ledger/captured groups by username)
  function publicGroupNumericId() {
    for (const key of Object.keys(seenGroups)) {
      const g = seenGroups[key];
      if (g.username && `@${g.username}`.toLowerCase() === REQUIRED_GROUPS[0].id.toLowerCase()) {
        return key;
      }
    }
    return null;
  }

  // best-effort check for the private group when its ID is unknown:
  // user must be recorded as a member of a group where the owner is also a
  // member, excluding the public group itself.
  function ledgerPrivateGroupCheck(userId) {
    const pub = publicGroupNumericId();
    const ownerKey = String(config.telegramOwner);
    for (const gid of Object.keys(ledger)) {
      if (pub && gid === pub) continue; // public group checked live instead
      const members = ledger[gid] || {};
      if (!isGoodStatus(members[ownerKey])) continue; // owner not in this group
      if (isGoodStatus(members[String(userId)])) return true;
    }
    return false;
  }

  async function getMissingGroups(userId) {
    const missing = [];
    for (const g of REQUIRED_GROUPS) {
      if (g.id) {
        if (!(await isGroupMember(g.id, userId))) missing.push(g);
        continue;
      }
      // private group without numeric ID → best-effort via the join ledger
      if (!warnedMissingId) {
        warnedMissingId = true;
        console.warn(
          `⚠️ [TelegramGate] "${g.title}": no numeric chat ID configured — using the join ledger as fallback. ` +
          `For exact verification, configure it: /setgroup <id> (owner), or set TELEGRAM_REQUIRED_GROUP_2_ID in .env. ` +
          `Find the ID with /groups after the bot sees the group.`
        );
      }
      if (!ledgerPrivateGroupCheck(userId)) missing.push(g);
    }
    return missing;
  }

  // ── gate message + buttons ─────────────────────────────────────────────────
  function gateText() {
    return (
      "🔒 <b>Join our groups first</b>\n\n" +
      "To use this bot you must be a <b>member</b> of the groups below.\n\n" +
      "1️⃣ Tap a button to join\n" +
      "2️⃣ Come back and tap <b>\"✅ I've Joined\"</b>\n\n" +
      "_Your membership is checked automatically._"
    );
  }

  function gateKeyboard() {
    return {
      inline_keyboard: [
        REQUIRED_GROUPS.map((g) => [{ text: `🔗 ${g.title}`, url: g.url }]),
        [{ text: "✅ I've Joined", callback_data: "gate:check" }],
      ],
    };
  }

  // Returns true when the update must be ignored (gate message was sent).
  async function enforceGate(msg) {
    const userId = msg.from && msg.from.id;
    if (!userId || userId === config.telegramOwner) return false;

    const missing = await getMissingGroups(userId);
    if (missing.length === 0) return false;

    const now = Date.now();
    if (lastGateSent[userId] && now - lastGateSent[userId] < GATE_DEDUP_MS) return true;
    lastGateSent[userId] = now;

    try {
      await bot.sendMessage(msg.chat.id, gateText(), {
        parse_mode: "HTML",
        reply_markup: gateKeyboard(),
      });
    } catch (e) {}
    return true;
  }

  // "✅ I've Joined" callback: re-check and update the gate message.
  // Returns true when the user is now verified.
  async function handleGateCheck(chatId, userId, messageId) {
    const missing = await getMissingGroups(userId);
    if (missing.length === 0) {
      try {
        await bot.editMessageText(
          "✅ <b>Verified!</b> You are a member of all required groups.",
          { chat_id: chatId, message_id: messageId, parse_mode: "HTML" }
        );
      } catch (e) {}
      return true;
    }
    try {
      await bot.editMessageText(gateText(), {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "HTML",
        reply_markup: gateKeyboard(),
      });
    } catch (e) {}
    return false;
  }

  // ── runtime config: /setgroup <id> (owner) ─────────────────────────────────
  function setPrivateGroupId(id) {
    const clean = String(id || "").trim();
    if (!/^-?\d+$/.test(clean)) return { ok: false, error: "Not a valid numeric chat ID" };
    gateConfig.privateGroupId = clean;
    saveJson(GATE_CONFIG_FILE, gateConfig);
    REQUIRED_GROUPS[1].id = clean;
    warnedMissingId = false;
    return { ok: true, required: REQUIRED_GROUPS.map((g) => ({ title: g.title, id: g.id })) };
  }

  return {
    REQUIRED_GROUPS,
    seenGroups,
    ledger,
    captureGroup,
    captureChat,
    handleChatMember,
    isGroupMember,
    getMissingGroups,
    gateText,
    gateKeyboard,
    enforceGate,
    handleGateCheck,
    setPrivateGroupId,
  };
};
