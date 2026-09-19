// ─────────────────────────────────────────────────────────────────────────────
// WHICH ROW DID THAT TAP COME FROM?
//
// In a private chat an interactive reply carries the id the row was built with:
// nativeFlowResponseMessage.paramsJson holds {"id":".aimenu"}. In a GROUP that
// field routinely comes back empty, and the only thing that survives is the body
// text — the row's label exactly as the user saw it, "🤖 AI MENU", which contains
// no command at all. Matching that text against a command can therefore never
// work, no matter how good the pattern is.
//
// So the rows are indexed as they are SENT. Every label goes in against the id we
// put in that row, per chat, and a tap that arrives without an id is looked up by
// the label the user actually read.
//
// In memory only, no disk, entries expire.
// ─────────────────────────────────────────────────────────────────────────────
"use strict";

const TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CHATS = 500;
const MAX_LABELS = 400;

const byChat = new Map(); // chatId -> { at, labels: Map<normalised label, id> }

/**
 * Fold a label down to something two spellings of the same row will agree on.
 *
 * Emoji, punctuation and spacing differ between what we send and what an echo
 * comes back with ("🤖 AI MENU", "🤖  AI  MENU", "AI MENU"), so all of that is
 * dropped and only the letters and digits are compared. Kept deliberately blunt:
 * a false match here would run the wrong command.
 */
function normaliseLabel(text) {
  return String(text == null ? "" : text)
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, " ")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

/** Drop expired chats, and keep the map from growing without bound. */
function prune(now) {
  for (const [chatId, entry] of byChat) {
    if (now - entry.at > TTL_MS) byChat.delete(chatId);
  }
  while (byChat.size > MAX_CHATS) {
    // Map preserves insertion order, so this drops the oldest.
    byChat.delete(byChat.keys().next().value);
  }
}

/** Pull every {id, title, description} row out of a menu payload. */
function rowsFromPayload(payload) {
  const out = [];
  if (!payload || typeof payload !== "object") return out;

  const buttons = Array.isArray(payload.interactiveButtons) ? payload.interactiveButtons : [];
  for (const btn of buttons) {
    if (!btn) continue;
    let params = btn.buttonParamsJson;
    if (typeof params === "string") {
      try {
        params = JSON.parse(params);
      } catch (e) {
        continue;
      }
    }
    if (!params || typeof params !== "object") continue;

    const buckets = [];
    if (Array.isArray(params.sections)) for (const s of params.sections) if (s && Array.isArray(s.rows)) buckets.push(...s.rows);
    if (Array.isArray(params.rows)) buckets.push(...params.rows);

    for (const row of buckets) {
      if (!row || !row.id) continue;
      out.push({ id: String(row.id), title: row.title, description: row.description });
    }
  }
  return out;
}

/**
 * Remember the rows of a menu about to be sent to `chatId`.
 *
 * Called on the way out, so it can never be skipped by a menu that fails to send —
 * at worst we indexed a menu the user never saw, which costs a lookup.
 */
function remember(chatId, payload) {
  if (!chatId) return 0;
  const rows = rowsFromPayload(payload);
  if (!rows.length) return 0;

  const now = Date.now();
  prune(now);

  let entry = byChat.get(chatId);
  if (!entry) {
    entry = { at: now, labels: new Map() };
    byChat.set(chatId, entry);
  }
  entry.at = now;

  for (const row of rows) {
    const id = row.id;
    // The description almost always starts with the command itself
    // (".aimenu — AI commands"), which is the most reliable thing to key on.
    for (const candidate of [row.title, row.description]) {
      const key = normaliseLabel(candidate);
      if (key) entry.labels.set(key, id);
      if (typeof candidate === "string") {
        const cmd = candidate.match(/(?:^|\s)([.#!][A-Za-z0-9_]+)/);
        if (cmd) {
          const k2 = normaliseLabel(cmd[1].slice(1));
          if (k2) entry.labels.set(k2, id);
        }
      }
    }
    // The bare command, with the prefix stripped, as a last form of the same label.
    const bare = normaliseLabel(String(id).replace(/^[.#!]/, ""));
    if (bare) entry.labels.set(bare, id);
  }

  while (entry.labels.size > MAX_LABELS) entry.labels.delete(entry.labels.keys().next().value);
  return rows.length;
}

/**
 * The id behind a label that came back without one.
 *
 * Tries the whole text, then each line of it — an echo is often the row's title
 * and description on separate lines — and finally the text with all punctuation
 * removed, which is what a client that reflows the label leaves behind.
 */
function resolve(chatId, text) {
  if (!chatId || text == null || text === "") return null;
  const entry = byChat.get(chatId);
  if (!entry) return null;
  if (Date.now() - entry.at > TTL_MS) {
    byChat.delete(chatId);
    return null;
  }

  const raw = typeof text === "string" ? text : String(text.text || "");
  if (!raw) return null;

  const tries = [raw, ...raw.split(/\r?\n/)];
  for (const candidate of tries) {
    const key = normaliseLabel(candidate);
    if (key && entry.labels.has(key)) return entry.labels.get(key);
  }

  // Nothing matched a whole label. A longer echo may still contain one verbatim.
  const whole = normaliseLabel(raw);
  if (whole) {
    for (const [key, id] of entry.labels) {
      if (key.length >= 3 && whole.includes(key)) return id;
    }
  }
  return null;
}

/** Forget everything. For tests, and for a clean shutdown. */
function reset() {
  byChat.clear();
}

module.exports = { remember, resolve, normaliseLabel, rowsFromPayload, reset, TTL_MS, MAX_CHATS, MAX_LABELS };
