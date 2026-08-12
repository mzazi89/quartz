// ─────────────────────────────────────────────────────────────────────────────
// TELEGRAM MEMBERSHIP GATE — mandatory group membership before the bot answers
//
// Every update (message, slash command, callback) is checked. If the user is
// not a member/follower of ALL required groups, the bot sends ONE gate message
// with join buttons and ignores the command. The owner always bypasses.
//
// Private groups: getChatMember needs the numeric chat ID. Add the bot to the
// group and send any message there — the bot captures every group it sees in
// database/telegramGroups.json (owner command: /groups). Then set
// TELEGRAM_REQUIRED_GROUP_2_ID in .env or edit REQUIRED_GROUPS below.
// ─────────────────────────────────────────────────────────────────────────────
const fs = require("fs");
const path = require("path");
const config = require("../settings");

const REQUIRED_GROUPS = [
  { id: "@mzazitechinc2026", title: "MZAZI TECH INC", url: "https://t.me/mzazitechinc2026" },
  {
    id: (process.env.TELEGRAM_REQUIRED_GROUP_2_ID || "").trim(), // numeric chat ID, e.g. -1001234567890
    title: "MZAZI TECH QUARTZ",
    url: "https://t.me/+uDQBfksjxWJjMjY0",
  },
];

const GROUPS_FILE = path.join(__dirname, "..", "database", "telegramGroups.json");
const GATE_DEDUP_MS = 15000;

module.exports = (bot) => {
  let seenGroups = {};
  try {
    seenGroups = JSON.parse(fs.readFileSync(GROUPS_FILE, "utf8"));
  } catch (e) {}

  let warnedMissingId = false;
  const lastGateSent = {};

  // ── capture every group/channel the bot sees ───────────────────────────────
  function captureGroup(msg) {
    const c = msg.chat;
    if (!c || !["group", "supergroup", "channel"].includes(c.type)) return;
    const key = String(c.id);
    if (seenGroups[key] && seenGroups[key].title === (c.title || "")) return;
    seenGroups[key] = {
      id: c.id,
      title: c.title || "",
      username: c.username || "",
      type: c.type,
      firstSeen: new Date().toISOString(),
    };
    try {
      fs.mkdirSync(path.dirname(GROUPS_FILE), { recursive: true });
      fs.writeFileSync(GROUPS_FILE, JSON.stringify(seenGroups, null, 2));
      console.log(`📡 [TelegramGate] group captured: ${c.id} | ${c.title || "(no title)"}`);
    } catch (e) {}
  }

  // ── membership check ───────────────────────────────────────────────────────
  async function isGroupMember(chatId, userId) {
    try {
      const r = await bot.getChatMember(chatId, userId);
      return ["creator", "administrator", "member"].includes(r.status);
    } catch (e) {
      return false;
    }
  }

  async function getMissingGroups(userId) {
    const missing = [];
    for (const g of REQUIRED_GROUPS) {
      if (!g.id) {
        if (!warnedMissingId) {
          warnedMissingId = true;
          console.warn(
            `⚠️ [TelegramGate] "${g.title}": no numeric chat ID configured. ` +
            `Add the bot to the group and send a message there — the bot logs the ID ` +
            `(database/telegramGroups.json, or /groups in Telegram). Then set ` +
            `TELEGRAM_REQUIRED_GROUP_2_ID in .env or edit lib/telegramGate.js.`
          );
        }
        missing.push(g); // cannot verify → treated as not joined (mandatory)
        continue;
      }
      if (!(await isGroupMember(g.id, userId))) missing.push(g);
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
          "✅ <b>Verified!</b> You are a member of all required groups.\n\nSend /start to open the bot menu.",
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

  return {
    REQUIRED_GROUPS,
    seenGroups,
    captureGroup,
    isGroupMember,
    getMissingGroups,
    gateText,
    gateKeyboard,
    enforceGate,
    handleGateCheck,
  };
};
