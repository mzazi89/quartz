// ─────────────────────────────────────────────────────────────────────────────
// REPLY IMAGE — the photo that rides along with a button message.
//
// Every button message this bot sends is now also a photo message. A button on a
// bare grey bubble is easy to scroll past; the same button on a branded card is
// not, and for the menus that ask the reader to CHOOSE (the panel size/nest/egg
// steps, the plan picker, the category picker) the picture is what makes the
// choices look like choices.
//
// Rather than edit the ~2000 command bodies that reply through mzazireply, the
// photo is attached in the three places every button message already goes
// through:
//
//   lib/buttons.js         sendButtonMessage      → the mzazireply button path
//   lib/interactive.js     sendInteractiveMessage → menus and every direct call
//   lib/botTelemetry.js    broadcast              → admin broadcasts
//
// Where the picture comes from, in order:
//
//   1. the session's own  database/sessions/<bot>/menu.jpg   (set with .setmenu)
//   2. the pack's         media/menu.jpg
//   3. a canvas-rendered  branded card                       (if canvas is installed)
//
// The canvas card is why this module exists as its own file: menu.jpg is a 2.6 MB
// photograph, and uploading that on every single reply would make the bot slower
// for no visible gain. Whichever source is used is re-encoded down to a sane width
// as JPEG first, and the result is cached against the file's mtime — so the
// expensive part happens once per change, not once per message.
// ─────────────────────────────────────────────────────────────────────────────
"use strict";

const fs = require("fs");
const path = require("path");

let canvasLib = null;
try {
  canvasLib = require("canvas");
} catch (e) {
  // Optional, exactly as it is in case.js: without it the card source is
  // unavailable and the file sources are used as they are.
  canvasLib = null;
}

const { getSetting } = require("./settings");

// 1000px wide is past what any phone shows for a card, and 72% JPEG is where the
// size stops falling faster than the quality. Both are deliberately conservative:
// this image is uploaded on every reply.
const MAX_WIDTH = 1000;
const JPEG_QUALITY = 72;
// Without canvas there is no way to re-encode, so a large file is skipped rather
// than uploaded as-is. A 2.6 MB upload per reply is worse than no photo.
const RAW_BYTE_LIMIT = 400 * 1024;

// path -> { mtimeMs, buffer }   the file as read from disk
const fileCache = new Map();
// source key -> Buffer          the encoded, ready-to-upload image
const encodedCache = new Map();

let enabledCache = { at: 0, value: true };
const ENABLED_TTL = 60 * 1000;

/** The bot's own number, from its own socket, without importing case.js. */
function numberFromJid(jid) {
  if (!jid || typeof jid !== "string") return "";
  return jid.split("@")[0].split(":")[0].replace(/[^0-9]/g, "");
}

/** The bot's display name. Per-session override first, then the config default. */
function nameFor(botPhoneNum) {
  try {
    const config = require("../settings");
    if (botPhoneNum) {
      const perSession = path.join(__dirname, "..", "database", "sessions", botPhoneNum, "botname.txt");
      if (fs.existsSync(perSession)) {
        const name = fs.readFileSync(perSession, "utf8").trim();
        if (name) return name;
      }
    }
    return config.botName || "MZAZI BOT";
  } catch (e) {
    return "MZAZI BOT";
  }
}

function themeFor() {
  try {
    return require("./theme");
  } catch (e) {
    return null;
  }
}

/** Read a file once per mtime. A menu.jpg replaced at runtime is picked up. */
function readCached(file) {
  try {
    const stat = fs.statSync(file);
    const hit = fileCache.get(file);
    if (hit && hit.mtimeMs === stat.mtimeMs) return hit.buffer;
    const buffer = fs.readFileSync(file);
    fileCache.set(file, { mtimeMs: stat.mtimeMs, buffer });
    return buffer;
  } catch (e) {
    return null;
  }
}

/**
 * The menu photo on disk, session override first.
 *
 * Returns { key, buffer } so the caller can key its encoded cache on which file
 * actually won — a session that sets its own menu.jpg must not be served the
 * encoded copy of the default one.
 */
function menuPhotoFile(botPhoneNum) {
  const candidates = [];
  if (botPhoneNum) candidates.push(path.join(__dirname, "..", "database", "sessions", botPhoneNum, "menu.jpg"));
  candidates.push(path.join(__dirname, "..", "media", "menu.jpg"));

  for (const candidate of candidates) {
    const buffer = readCached(candidate);
    if (buffer && buffer.length) return { key: candidate, buffer };
  }
  return null;
}

/** Re-encode to a card-sized JPEG. Returns null when it cannot be done. */
async function encodeForReply(key, buffer) {
  if (encodedCache.has(key)) return encodedCache.get(key);

  let out = null;
  if (canvasLib && canvasLib.loadImage) {
    try {
      const img = await canvasLib.loadImage(buffer);
      const scale = img.width > MAX_WIDTH ? MAX_WIDTH / img.width : 1;
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const c = canvasLib.createCanvas(w, h);
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      out = c.toBuffer("image/jpeg", { quality: JPEG_QUALITY });
    } catch (e) {
      out = null;
    }
  }

  if (!out) {
    // No canvas: use the file unchanged, but only while it is small enough that
    // uploading it per reply is not worse than sending no picture at all.
    out = buffer && buffer.length && buffer.length <= RAW_BYTE_LIMIT ? buffer : null;
  }

  if (out) encodedCache.set(key, out);
  return out;
}

// ─── The canvas card ─────────────────────────────────────────────────────────
// Drawn from the bot's own theme, so the two bots do not share a look. Kept
// deliberately plain: it is a backdrop for a button, not a poster, and any text it
// carries has to stay readable when WhatsApp scales it down in the chat list.
function renderCard({ botName, badge, accent, accent2, background, footer }) {
  if (!canvasLib || !canvasLib.createCanvas) return null;

  const W = 1000;
  const H = 560;
  const A = accent || "#4c7dfc";
  const A2 = accent2 || A;
  const bg = Array.isArray(background) && background.length >= 3
    ? background
    : ["#050914", "#0b1327", "#050914"];

  const key = `card:${botName}|${badge}|${A}|${A2}|${bg.join(",")}|${footer}`;
  if (encodedCache.has(key)) return encodedCache.get(key);

  try {
    const c = canvasLib.createCanvas(W, H);
    const ctx = c.getContext("2d");

    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, bg[0]);
    grad.addColorStop(0.5, bg[1]);
    grad.addColorStop(1, bg[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Soft brand blooms — depth without a photograph.
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = A;
    ctx.beginPath(); ctx.arc(880, 70, 190, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(80, 520, 150, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = "#ffffff";
    [[120, 90, 2.5], [250, 40, 1.5], [700, 500, 2], [930, 300, 1.5], [470, 30, 1.8]]
      .forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); });
    ctx.globalAlpha = 1;

    // Accent edges: the same two-bar device the text banners use.
    const bar = ctx.createLinearGradient(0, 0, W, 0);
    bar.addColorStop(0, A);
    bar.addColorStop(0.5, A2);
    bar.addColorStop(1, A);
    ctx.fillStyle = bar;
    ctx.fillRect(0, 0, W, 8);
    ctx.fillRect(0, H - 8, W, 8);

    ctx.textAlign = "center";

    // Name, in the accent, with a glow so it holds up on the dark card.
    const nameGrad = ctx.createLinearGradient(W * 0.2, 0, W * 0.8, 0);
    nameGrad.addColorStop(0, A);
    nameGrad.addColorStop(0.5, A2);
    nameGrad.addColorStop(1, A);
    ctx.font = "bold 84px Arial";
    ctx.fillStyle = nameGrad;
    ctx.shadowColor = A;
    ctx.shadowBlur = 26;
    ctx.fillText(String(botName || "MZAZI BOT").toUpperCase(), W / 2, 250);
    ctx.shadowBlur = 0;

    // Badge pill.
    const pillW = 300, pillH = 54, pillX = (W - pillW) / 2, pillY = 292;
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = A;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(pillX, pillY, pillW, pillH, 27);
    else ctx.rect(pillX, pillY, pillW, pillH);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = A2;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.font = "bold 24px Arial";
    ctx.fillStyle = A2;
    ctx.fillText(String(badge || "⚡"), W / 2, pillY + 37);

    // The instruction. This is the one line that has to be read, because the
    // point of the card is the buttons underneath it.
    ctx.font = "bold 30px Arial";
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText("👇  Tap a button below to continue", W / 2, 420);

    ctx.font = "20px Arial";
    ctx.fillStyle = "rgba(255,255,255,0.42)";
    ctx.fillText(String(footer || "Mzazi Tech Inc"), W / 2, 480);

    const out = c.toBuffer("image/jpeg", { quality: JPEG_QUALITY });
    encodedCache.set(key, out);
    return out;
  } catch (e) {
    return null;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * The photo to attach, or null when there is nothing usable.
 *
 * Never throws: a missing picture must never be the reason a reply fails to send.
 */
async function replyImageFor({ botPhoneNum = "", botName = "" } = {}) {
  const theme = themeFor();
  try {
    const file = menuPhotoFile(botPhoneNum);
    if (file) {
      const encoded = await encodeForReply(file.key, file.buffer);
      if (encoded) return encoded;
    }
  } catch (e) {
    // fall through to the card
  }

  try {
    return renderCard({
      botName: botName || nameFor(botPhoneNum),
      badge: theme ? theme.badge : "",
      accent: theme ? theme.accent : "",
      accent2: theme ? theme.accent2 : "",
      background: theme ? theme.background : null,
      footer: theme ? theme.signature : "Mzazi Tech Inc",
    });
  } catch (e) {
    return null;
  }
}

/** Is the photo attachment switched off in settings? Default is ON. */
async function imagesEnabled() {
  const now = Date.now();
  if (now - enabledCache.at < ENABLED_TTL) return enabledCache.value;

  let value = process.env.REPLY_IMAGES !== "0";
  try {
    const raw = await getSetting("reply_images", process.env.REPLY_IMAGES || "1");
    value = !["0", "false", "off", "no"].includes(String(raw == null ? "1" : raw).trim().toLowerCase());
  } catch (e) {
    // Settings unreachable — keep the default rather than dropping the picture.
  }
  enabledCache = { at: now, value };
  return value;
}

/**
 * Give a button payload its photo, if it should have one.
 *
 * Only payloads that actually carry buttons are touched, an image the caller chose
 * is never replaced, and nothing here can throw — this runs inside the send path
 * of every command.
 */
async function attachReplyImage(payload, { botPhoneNum = "", botName = "" } = {}) {
  try {
    if (!payload || typeof payload !== "object") return payload;

    const buttons = Array.isArray(payload.interactiveButtons) ? payload.interactiveButtons : [];
    if (!buttons.length) return payload;
    if (payload.image) return payload;
    if (!(await imagesEnabled())) return payload;

    const buffer = await replyImageFor({ botPhoneNum, botName });
    if (!buffer) return payload;
    return { ...payload, image: { buffer } };
  } catch (e) {
    return payload;
  }
}

/** Drop every cache. For tests, and after the admin replaces menu.jpg. */
function resetCache() {
  fileCache.clear();
  encodedCache.clear();
  enabledCache = { at: 0, value: true };
}

module.exports = {
  attachReplyImage,
  replyImageFor,
  imagesEnabled,
  resetCache,
  numberFromJid,
  nameFor,
  MAX_WIDTH,
  JPEG_QUALITY,
  RAW_BYTE_LIMIT,
};
