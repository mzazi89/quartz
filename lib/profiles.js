// ─────────────────────────────────────────────────────────────────────────────
// BOT PROFILES — several WhatsApp identities from one process and one bot.
//
// QUARTZ XD and MZAZI XMD are served by the same Node process and the same
// Telegram bot. What separates them is which paired numbers they own, so a
// profile is recorded on every pairing and checked on anything that touches a
// number. Tapping a button in Telegram is what picks between them.
//
// ── Default-safe by construction ─────────────────────────────────────────────
// With `bot_profiles` unset there is exactly ONE profile. Every existing entry
// in paired.json has no profile field, and profileOf() assigns it to that single
// profile, so filtering by profile is a no-op and every code path behaves
// exactly as it did before this module existed. Turning the feature on is a
// settings change, not a code change, and it can be reversed the same way.
//
// ── Enabling it ──────────────────────────────────────────────────────────────
// Set `bot_profiles` (admin Settings page) to a JSON array:
//
//   [{"id":"quartz","name":"QUARTZ XD"},{"id":"xmd","name":"MZAZI XMD"}]
//
// The chooser appears the first time a user runs a command, and /bot re-opens
// it. With one profile configured, nothing is ever asked and nothing changes.
// ─────────────────────────────────────────────────────────────────────────────
const { loadJSON, saveJSON } = require('../helper/function');
const config = require('../settings');

const SELECTIONS_FILE = './database/profile-selections.json';

// Selections are read on nearly every command, so they are cached in memory and
// written through. A missing or corrupt file must never stop the bot booting.
let selections = null;

function loadSelections() {
  if (selections) return selections;
  try {
    const raw = loadJSON(SELECTIONS_FILE, {});
    selections = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch (err) {
    console.warn('[profiles] could not read selections, starting empty:', err.message);
    selections = {};
  }
  return selections;
}

function saveSelections() {
  try {
    saveJSON(SELECTIONS_FILE, selections || {});
  } catch (err) {
    // A failed write means the choice is remembered for this process only. Worth
    // a warning, never worth failing the command the user just ran.
    console.warn('[profiles] could not persist selections:', err.message);
  }
}

/**
 * The configured profiles, always at least one.
 *
 * Accepts a JSON array from settings. Anything unparseable falls back to a
 * single profile rather than throwing, because a typo in a settings field must
 * not take the bot down.
 */
function list() {
  const fallback = [{ id: 'main', name: config.botName || 'Main Bot' }];

  const raw = config.botProfiles;
  if (!raw) return fallback;

  let parsed = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return fallback;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      console.warn('[profiles] bot_profiles is not valid JSON — using the default profile');
      return fallback;
    }
  }

  if (!Array.isArray(parsed)) return fallback;

  const cleaned = parsed
    .filter((p) => p && typeof p === 'object')
    .map((p) => ({
      id: String(p.id == null ? '' : p.id).trim(),
      name: String(p.name == null ? '' : p.name).trim(),
    }))
    .filter((p) => p.id && p.name);

  if (cleaned.length === 0) return fallback;

  // Duplicate ids would make two profiles indistinguishable and let a pairing
  // land somewhere the user did not choose. Keep the first of each.
  const seen = new Set();
  const unique = cleaned.filter((p) => (seen.has(p.id) ? false : seen.add(p.id)));

  return unique;
}

/** More than one profile means the chooser has something to ask about. */
function enabled() {
  return list().length > 1;
}

function byId(id) {
  if (!id) return null;
  return list().find((p) => p.id === id) || null;
}

/** The primary profile — what legacy data and unselected users belong to. */
function primary() {
  return list()[0];
}

/** The profile a Telegram user is currently working in. */
function forUser(userId) {
  const all = loadSelections();
  const stored = all[String(userId)];
  // A stored id that is no longer configured (renamed or removed) falls back to
  // the primary profile rather than leaving the user pointing at nothing.
  return byId(stored) ? stored : primary().id;
}

/**
 * Has this user made a choice yet?
 *
 * Distinct from forUser(), which falls back to the primary profile. The chooser
 * is only forced on someone who has never chosen — asking on every command would
 * be miserable, and never asking would leave pairings landing in the primary
 * profile by accident.
 */
function hasChosen(userId) {
  const stored = loadSelections()[String(userId)];
  return Boolean(byId(stored));
}

function setForUser(userId, profileId) {
  if (!byId(profileId)) return false;
  const all = loadSelections();
  all[String(userId)] = profileId;
  saveSelections();
  return true;
}

/** Display name for a user's current profile. */
function labelForUser(userId) {
  const profile = byId(forUser(userId));
  return profile ? profile.name : primary().name;
}

/**
 * Which profile does a paired.json entry belong to?
 *
 * Entries written before profiles existed have no `profile` field. They belong
 * to the primary profile — that is the rule that makes this whole change
 * default-safe, and it is why every existing device keeps showing up for its
 * owner when the feature is switched on.
 */
function profileOf(entry) {
  const stored = entry && entry.profile;
  if (stored && byId(stored)) return stored;
  return primary().id;
}

/** Is this entry in the profile the user is currently working in? */
function owns(entry, userId) {
  return profileOf(entry) === forUser(userId);
}

/**
 * Filter paired.json entries down to one user's current profile.
 *
 * It enforces BOTH ownership and profile. The call site happens to pre-filter by
 * userId as well, but a function named filterForUser that returns a stranger's
 * device when handed an unfiltered list is a trap for whoever calls it next —
 * and the data it would leak is a phone number. Better redundant than
 * one-forgotten-pre-filter away from a leak.
 */
function filterForUser(entries, userId) {
  if (!Array.isArray(entries)) return [];
  const mine = forUser(userId);
  return entries.filter(
    (e) => String(e && e.userId) === String(userId) && profileOf(e) === mine
  );
}

/**
 * Which profile owns a paired number?
 *
 * The WhatsApp side has no Telegram user to consult — a command arrives on
 * whichever session received it — so the session's own number decides. An XMD
 * device therefore speaks XMD's commands with no per-message bookkeeping.
 *
 * Returns the primary profile for anything unrecognised, including a missing or
 * malformed session number, so this can never throw on the command hot path.
 */
function forSession(phone) {
  const number = String(phone == null ? '' : phone).replace(/\D/g, '');
  if (!number) return primary().id;

  try {
    const sessions = loadJSON('./database/paired.json', []);
    const entry = (Array.isArray(sessions) ? sessions : []).find(
      (s) => String(s && s.number) === number
    );
    return entry ? profileOf(entry) : primary().id;
  } catch (err) {
    return primary().id;
  }
}

/** Inline keyboard offering every profile, for the callback handler. */
function keyboard(prefix = 'prof') {
  return {
    inline_keyboard: list().map((p) => [
      { text: p.name, callback_data: `${prefix}:${p.id}` },
    ]),
  };
}

/** The message that goes with the keyboard. */
function chooserText(userId) {
  const current = byId(forUser(userId));
  return [
    '<b>🤖 Which bot?</b>',
    '',
    current ? `You are currently using <b>${current.name}</b>.` : '',
    '',
    'Each bot has its own paired numbers. Pick one to work with.',
  ]
    .filter(Boolean)
    .join('\n');
}

module.exports = {
  list,
  enabled,
  byId,
  primary,
  forUser,
  hasChosen,
  setForUser,
  labelForUser,
  profileOf,
  owns,
  forSession,
  filterForUser,
  keyboard,
  chooserText,
  SELECTIONS_FILE,
};
