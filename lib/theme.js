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

// ─── legacy bot names ────────────────────────────────────────────────────────
// The bots used to be called "MZAZI TECH QUARTZ BOT" and "MZAZI TECH XMD BOT".
// Those full names are still baked into the 1022 database-hosted command bodies
// (and into web/data/bot-commands.json, which feeds them), so a rename that only
// edited settings.js would leave the old name on screen in every menu banner,
// card footer and repository card.
//
// Rather than rewriting 1022 database rows — which would fork the registry and
// have to be redone on every future import — the old names are normalised on the
// way out, in ONE place, by restyle() below.
//
// It replaces ANY legacy name with THIS bot's own name, which fixes two problems
// at once: the rename itself, and the fact that MZAZI XMD was displaying QUARTZ
// XD's name inside its own mirrored command bodies.
// The tokens replaced: the two legacy full names, plus BOTH bots' current short
// names. The other bot's name is in this list on purpose — MZAZI XMD's command
// rows are a mirror of QUARTZ XD's, so 18 of them say "QUARTZ XD" and would
// otherwise advertise the wrong bot to XMD's users.
const OTHER_PLANS = ["MZAZI TECH QUARTZ PLANS", "MZAZI TECH XMD PLANS"];
const OTHER_NAMES = ["MZAZI TECH QUARTZ BOT", "MZAZI TECH XMD BOT", "QUARTZ XD", "MZAZI XMD"];

// The menu banner renders its title in mathematical-bold capitals
// (`║➥✦ 𝐐𝐔𝐀𝐑𝐓𝐙 𝐗𝐃 ✦`). Same rename, styled form.
function fancy(text) {
  return String(text)
    .toUpperCase()
    .split("")
    .map((c) => (/[A-Z]/.test(c) ? String.fromCodePoint(0x1d400 + c.charCodeAt(0) - 65) : c))
    .join("");
}

/** One regex matching every token, longest first, or null when there are none. */
function alternation(tokens) {
  const escaped = tokens
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return escaped.length ? new RegExp(escaped.join("|"), "g") : null;
}

// Each is applied in a SINGLE pass. A loop of split/join would re-scan its own
// output: replacing "𝐐𝐔𝐀𝐑𝐓𝐙 𝐗𝐃" with "𝐌𝐙𝐀𝐙𝐈 𝐗𝐌𝐃" and then matching the
// "𝐗𝐌𝐃" inside the result produced "𝐌𝐙𝐀𝐙𝐈 𝐌𝐙𝐀𝐙𝐈 𝐗𝐌𝐃" on the XMD banner.
const PLAN_RE = alternation(OTHER_PLANS);
const NAME_RE = alternation(OTHER_NAMES);
const FANCY_RE = alternation(OTHER_NAMES.map(fancy));

// ─── response voice ──────────────────────────────────────────────────────────
// Beyond colour and chrome, a bot can present its answers differently. Only the
// `xmd` style is defined so far, and it is deliberately built from whole-token
// swaps: every entry is an exact presentational string that cannot occur inside
// a URL, a command name, a button id or a numeric value. `classic` is empty, so
// QUARTZ XD's response text is untouched by this layer.
//
// Longer, more specific tokens must come before shorter ones they contain.
const RESPONSE_STYLES = {
  classic: [],
  xmd: [
    ["📌 Usage:", "▸ 𝐇𝐎𝐖 𝐓𝐎 𝐔𝐒𝐄:"],
    ["📋 Usage:", "▸ 𝐇𝐎𝐖 𝐓𝐎 𝐔𝐒𝐄:"],
    ["Usage:", "How to use:"],
    ["Example:", "E.g.:"],
    ["❌", "⛔"],
    ["✅", "☑️"],
    ["⏳", "⌛"],
    ["⚠️", "❗"],
    ["•", "▸"],
    ["━", "┄"],
  ],
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

  const voice = typeof t.responseStyle === "string" ? t.responseStyle.trim().toLowerCase() : "classic";
  const voiceStyle = Object.prototype.hasOwnProperty.call(RESPONSE_STYLES, voice) ? voice : "classic";

  // Top-level menu categories, declared per bot. QUARTZ XD's list is the one it
  // already shipped; MZAZI XMD declares its own set, which is what makes the two
  // menus structurally different rather than differently coloured.
  const categories = Array.isArray(t.categories) && t.categories.length ? t.categories : null;

  return {
    name,
    accent,
    accent2,
    badge,
    background,
    bannerStyle: style,
    bannerMap: BANNERS[style],
    responseStyle: voiceStyle,
    swaps: RESPONSE_STYLES[voiceStyle],
    categories,
    fancyName: fancy(name),

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

/**
 * Everything this bot does to an outgoing reply: its banner ornaments, its own
 * name in place of any legacy name, and its response voice.
 *
 * Applied in the reply wrappers rather than in the command bodies, so all 1022
 * database-hosted commands — and every command added later — are covered by one
 * call. Safe on arbitrary text: the name tokens are full branding strings and
 * every voice swap is an exact presentational token, so nothing that a user must
 * copy (URLs, command names, button ids) or that the bot must parse (numbers,
 * JSON) can be altered.
 */
function restyle(text) {
  if (typeof text !== "string" || !text) return text;

  let out = ornament(text);

  const me = identity.name;
  if (PLAN_RE) out = out.replace(PLAN_RE, () => `${me} PLANS`);
  if (NAME_RE) out = out.replace(NAME_RE, () => me);
  if (FANCY_RE) out = out.replace(FANCY_RE, () => identity.fancyName);

  const swaps = identity.swaps;
  if (swaps && swaps.length) {
    for (const [from, to] of swaps) out = out.split(from).join(to);
  }

  return out;
}

// ─── direct-send coverage ────────────────────────────────────────────────────
// 1001 of the 1022 commands answer through mzazireply and are covered by
// restyle(). The remaining 21 call the socket directly — and so do the
// relayMessage-based category menus, which are the most visible surface of all.
// Without this they would keep rendering this bot's old name on those screens.
//
// Only human-readable fields are restyled. Anything that can hold a URL, a
// command token or a button id is deliberately left untouched: a cosmetic layer
// must never be able to break a link a user has to tap or a button a bot has to
// parse.
const DISPLAY_SEND_KEYS = new Set(["text", "contextInfo", "mentions", "quoted"]);

function restyleSendContent(content) {
  if (!content || typeof content !== "object") return content;
  // Plain-text sends only. Media, buttons and interactive payloads pass through
  // untouched because they carry ids and urls alongside their display text.
  if (typeof content.text !== "string") return content;
  if (!Object.keys(content).every((k) => DISPLAY_SEND_KEYS.has(k))) return content;
  return { ...content, text: restyle(content.text) };
}

function restylePayload(message) {
  if (!message || typeof message !== "object") return message;
  const im = message.interactiveMessage;
  if (im && typeof im === "object") {
    if (im.body && typeof im.body.text === "string") im.body.text = restyle(im.body.text);
    if (im.footer && typeof im.footer.text === "string") im.footer.text = restyle(im.footer.text);
    if (im.header && typeof im.header.title === "string") im.header.title = restyle(im.header.title);
  }
  if (typeof message.conversation === "string") message.conversation = restyle(message.conversation);
  if (message.extendedTextMessage && typeof message.extendedTextMessage.text === "string") {
    message.extendedTextMessage.text = restyle(message.extendedTextMessage.text);
  }
  const bm = message.buttonsMessage;
  if (bm && typeof bm === "object") {
    if (typeof bm.contentText === "string") bm.contentText = restyle(bm.contentText);
    if (typeof bm.footerText === "string") bm.footerText = restyle(bm.footerText);
    if (typeof bm.headerText === "string") bm.headerText = restyle(bm.headerText);
  }
  return message;
}

/**
 * Hand command bodies a socket that restyles plain-text sends on the way out.
 *
 * A Proxy rather than a copy: every other property resolves to the real socket
 * and every method is bound to it, so a command sees exactly the object it saw
 * before. If anything about proxying fails, the original socket is returned
 * unchanged — a cosmetic layer is never worth breaking a command.
 */
function bindSocket(sock) {
  if (!sock || sock.__themeBound) return sock;
  try {
    return new Proxy(sock, {
      get(target, prop) {
        if (prop === "__themeBound") return true;
        if (prop === "sendMessage") {
          return (jid, content, options) => target.sendMessage(jid, restyleSendContent(content), options);
        }
        if (prop === "relayMessage") {
          return (jid, message, options) => target.relayMessage(jid, restylePayload(message), options);
        }
        const value = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  } catch (e) {
    return sock;
  }
}

module.exports = {
  get name() { return identity.name; },
  get accent() { return identity.accent; },
  get accent2() { return identity.accent2; },
  get badge() { return identity.badge; },
  get background() { return identity.background; },
  get bannerStyle() { return identity.bannerStyle; },
  get responseStyle() { return identity.responseStyle; },
  get signature() { return identity.signature; },
  get signatureUpper() { return identity.signatureUpper; },
  get glow() { return identity.glow; },
  get identity() { return identity; },
  get categories() { return identity.categories; },
  ornament,
  restyle,
  bindSocket,
  refresh,
  badgeFor,
  lighten,
  darken,
  mix,
};
