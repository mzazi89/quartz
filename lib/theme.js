// ─────────────────────────────────────────────────────────────────────────────
// BOT THEME — this bot's own visual identity.
//
// QUARTZ XD and MZAZI XMD share one codebase shape and one command registry.
// Nothing about their replies would differ unless the difference is declared
// somewhere, and this module is that place.
//
// It is declared from ONE value: `theme.accentColor` in settings.js, which the
// shared admin `settings` table can override. The badge emoji, the gradient
// partner, the card background, the glow and even the banner ornament set are
// derived from that accent — so the two bots cannot quietly drift back into
// looking like each other, and changing a bot's colour is a one-line edit
// instead of a hunt through a 3800-line case.js.
//
// Why this module exists at all: `theme.accentColor` was already declared in
// settings.js and read by NOTHING, while the image generators hard-coded their
// own greens. That is exactly how both bots came to render identical cards,
// identical footers and identical banners — the brand colour was never wired to
// anything.
//
// Every remote command replies through the bot's own `mzazireply`, which takes
// its footer and its text styling from here. That is what lets the 1022
// database-hosted command bodies stay untouched and still come out looking
// different on each bot.
// ─────────────────────────────────────────────────────────────────────────────
const config = require("../settings");

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** '#abc' | '#aabbcc' | 'aabbcc' → { r, g, b }, or null when unparseable. */
function toRgb(hex) {
  const m = HEX_RE.exec(String(hex == null ? "" : hex).trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function toHex({ r, g, b }) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Blend `a` toward `b` by t (0 = a, 1 = b). t may fall outside 0..1. */
function mix(a, b, t) {
  const A = toRgb(a), B = toRgb(b);
  if (!A || !B) return a;
  return toHex({
    r: A.r + (B.r - A.r) * t,
    g: A.g + (B.g - A.g) * t,
    b: A.b + (B.b - A.b) * t,
  });
}

const lighten = (hex, t) => mix(hex, "#ffffff", t);
const darken = (hex, t) => mix(hex, "#000000", t);

/** A normalised, always-valid hex — falls back rather than throwing. */
function normalise(hex, fallback) {
  return toRgb(hex) ? toHex(toRgb(hex)) : fallback;
}

// ─── badge ───────────────────────────────────────────────────────────────────
// The per-bot emoji signature. Derived from the accent's hue so it always
// agrees with the colour the bot actually renders, and limited to the handful
// of circles every WhatsApp client renders as an emoji rather than a box.
function badgeFor(accent) {
  const c = toRgb(accent);
  if (!c) return "⚪";
  const { r, g, b } = c;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d < 24) return (max + min) / 2 > 140 ? "⚪" : "⚫";
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = ((h * 60) % 360 + 360) % 360;
  if (h < 15 || h >= 345) return "🔴";
  if (h < 45) return "🟠";
  if (h < 70) return "🟡";
  if (h < 165) return "🟢";
  if (h < 260) return "🔵";
  return "🟣";
}

// ─── banner ornaments ────────────────────────────────────────────────────────
// The box-drawing set a bot draws its banners with. `double` is the identity
// mapping on purpose: QUARTZ XD already ships that style, so leaving it as the
// default means the bot people already use does not visibly change.
//
// Each set maps the double-line characters AND the single-line ones, because
// the status card nests a single-line box inside a double-line frame
// (`║➥┌────┐`). Rounded corners and straight rules are the same display width
// as the characters they replace, so every existing padding and alignment is
// preserved.
const BANNERS = {
  double: null, // identity — no substitution
  rounded: { "╔": "╭", "╗": "╮", "╚": "╰", "╝": "╯", "═": "─", "║": "│",
             "┌": "╭", "┐": "╮", "└": "╰", "┘": "╯", "─": "─", "│": "│" },
  heavy:   { "╔": "┏", "╗": "┓", "╚": "┗", "╝": "┛", "═": "━", "║": "┃",
             "┌": "┏", "┐": "┓", "└": "┗", "┘": "┛", "─": "━", "│": "┃" },
};

// ─── build ───────────────────────────────────────────────────────────────────
function build() {
  const t = (config && config.theme) || {};

  const accent = normalise(t.accentColor, "#1fdb7e");
  const accent2 = normalise(t.accentColor2, lighten(accent, 0.3));
  const name = config.botName || t.name || "MZAZI TECH BOT";

  // Card backgrounds: explicit when the bot declares them, otherwise derived as
  // three stops of a very dark tint of the accent.
  const declared = Array.isArray(t.cardBg) && t.cardBg.length === 3 ? t.cardBg.map((c) => normalise(c, null)) : null;
  const background = declared && declared.every(Boolean)
    ? declared
    : [darken(accent, 0.9), darken(accent, 0.78), darken(accent, 0.9)];

  const style = Object.prototype.hasOwnProperty.call(BANNERS, t.bannerStyle) ? t.bannerStyle : "double";
  const badge = typeof t.badge === "string" && t.badge.trim() ? t.badge.trim() : badgeFor(accent);

  return {
    name,
    accent,
    accent2,
    badge,
    background,
    bannerStyle: style,
    bannerMap: BANNERS[style],

    // The identity line every reply carries. mzazireply appends the owner
    // credit to this, so it stays one declaration rather than two.
    signature: `© ${name} ${badge}`,
    signatureUpper: `© ${name.toUpperCase()} ${badge}`,

    // Glow used behind headings on generated cards (accent at 50% alpha).
    glow: `${accent}88`,
  };
}

let identity = build();

// Rebuild when settings are reloaded (the colour can come from the settings
// table, which refreshSettings() re-reads every 60s).
function refresh() {
  identity = build();
  return identity;
}

/** Swap this bot's banner ornaments into any outgoing text. */
function ornament(text) {
  const map = identity.bannerMap;
  if (!map || typeof text !== "string" || !text) return text;
  return text.replace(/[╔╗╚╝═║┌┐└┘─│]/g, (ch) => (map[ch] === undefined ? ch : map[ch]));
}

module.exports = {
  get name() { return identity.name; },
  get accent() { return identity.accent; },
  get accent2() { return identity.accent2; },
  get badge() { return identity.badge; },
  get background() { return identity.background; },
  get bannerStyle() { return identity.bannerStyle; },
  get signature() { return identity.signature; },
  get signatureUpper() { return identity.signatureUpper; },
  get glow() { return identity.glow; },
  get identity() { return identity; },
  ornament,
  refresh,
  badgeFor,
  lighten,
  darken,
  mix,
};
