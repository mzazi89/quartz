// ─────────────────────────────────────────────────────────────────────────────
// lib/groupLock.js — GROUP LOCK (lockgc) automatic admin-protection engine.
//
// While a group's lockgc setting is ON, every unauthorized group-management
// event is reversed AND the responsible admin is demoted:
//
//   ADMIN PROMOTES MEMBER  → member demoted back  → actor admin demoted
//   ADMIN DEMOTES ADMIN    → victim promoted back → actor admin demoted
//   MASS KICK (kickall)    → removed members re-added → actor admin demoted
//
// Exempt from punishment/reversal: the bot itself (loop prevention), the
// group owner, and the bot owner (owners.json).
//
// The actor is read from the group-event stub (key.participant). Events the
// bot itself generates re-enter with actor = bot and are exempt, so the
// system cannot loop. A per-group cooldown debounces bursts of events.
//
// This module is intentionally dependency-free so it can be unit-tested in
// isolation; the caller (case.js) supplies the socket, settings, metadata,
// owners list, bot number and logger.
// ─────────────────────────────────────────────────────────────────────────────
const COOLDOWN_MS = 3000;
const cooldown = new Map(); // groupJid -> last processed timestamp (ms)

const normalizeJid = (jid = "") => {
  if (!jid || typeof jid !== "string") return "";
  return jid.split("@")[0].split(":")[0].replace(/[^0-9]/g, "");
};

const STUB_PROMOTE = 31;
const STUB_DEMOTE = 32;
const STUB_REMOVE = 28;

/**
 * Handle one group participant event under an active group lock.
 *
 * @param {object}   opts
 * @param {object}   opts.sock      Baileys socket (groupParticipantsUpdate, sendMessage)
 * @param {string}   opts.groupJid  group jid
 * @param {number}   opts.stubType  31 promote | 32 demote | 28 remove
 * @param {string[]} opts.params    affected participant jids
 * @param {string}   opts.actorJid  actor jid (stub key.participant); "" = unknown
 * @param {object}   opts.settings  this group's settings object (lockgc flag)
 * @param {object}   opts.metadata  group metadata (participants, owner)
 * @param {string}   opts.botPN     this bot's phone number (digits)
 * @param {string[]} opts.owners    bot owner numbers (digits)
 * @param {object}   opts.logger    logger with info/warn/error
 */
async function handleGroupLockEvent({
  sock,
  groupJid,
  stubType,
  params = [],
  actorJid = "",
  settings = {},
  metadata = null,
  botPN = "",
  owners = [],
  logger = console,
}) {
  try {
    if (!settings || !settings.lockgc) return;
    if (stubType !== STUB_PROMOTE && stubType !== STUB_DEMOTE && stubType !== STUB_REMOVE) return;

    const actorNum = normalizeJid(actorJid);
    if (!actorNum) return; // unknown actor — stay conservative (never blame the owner)

    const ownerNums = owners.map((n) => normalizeJid(String(n))).filter(Boolean);
    const ownerNum = metadata && metadata.owner ? normalizeJid(metadata.owner) : "";
    const adminNums = ((metadata && metadata.participants) || [])
      .filter((v) => v && v.admin)
      .map((v) => normalizeJid(v.id))
      .filter(Boolean);

    // Exempt actors: the bot itself, the group owner, the bot owner.
    // Group admins are NOT exempt — they are the ones being policed.
    if (actorNum === botPN || actorNum === ownerNum || ownerNums.includes(actorNum)) return;

    // Debounce: one revert+punish cycle per group per cooldown window.
    const now = Date.now();
    if (now - (cooldown.get(groupJid) || 0) < COOLDOWN_MS) return;
    cooldown.set(groupJid, now);
    if (cooldown.size > 1000) {
      for (const k of cooldown.keys()) {
        if (now - cooldown.get(k) > COOLDOWN_MS * 10) cooldown.delete(k);
      }
    }

    // Numbers we must never demote / remove (group owner, bot owner, the bot).
    const protectedNums = new Set([ownerNum, botPN, ...ownerNums].filter(Boolean));
    const isActorAdmin = adminNums.includes(actorNum);
    const actionName = stubType === STUB_PROMOTE ? "promotion" : stubType === STUB_DEMOTE ? "demotion" : "mass removal";
    const targets = (params || []).map((p) => normalizeJid(p)).filter(Boolean);

    // 1) Reverse the change where technically possible.
    if (stubType === STUB_PROMOTE) {
      // Demote the newly promoted members back — but never demote a
      // protected number (owner / bot owner / bot).
      const victims = targets.filter((n) => !protectedNums.has(n));
      if (victims.length) {
        await sock.groupParticipantsUpdate(groupJid, victims.map((n) => n + "@s.whatsapp.net"), "demote");
        logger.info(`lockgc: reversed promotion -> demoted [${victims.join(",")}] in ${groupJid}`);
      }
    } else if (stubType === STUB_DEMOTE) {
      // Promote the demoted victims back (restoring the owner is protection,
      // so protected numbers ARE restored here).
      const victims = targets.filter(Boolean);
      if (victims.length) {
        await sock.groupParticipantsUpdate(groupJid, victims.map((n) => n + "@s.whatsapp.net"), "promote");
        logger.info(`lockgc: reversed demotion -> promoted [${victims.join(",")}] in ${groupJid}`);
      }
    } else if (stubType === STUB_REMOVE) {
      // Re-add removed members where technically possible (never re-add
      // protected numbers — they cannot be removed by admins anyway).
      const readds = targets.filter((n) => !protectedNums.has(n));
      if (readds.length) {
        await sock.groupParticipantsUpdate(groupJid, readds.map((n) => n + "@s.whatsapp.net"), "add");
        logger.info(`lockgc: re-added [${readds.join(",")}] after mass removal in ${groupJid}`);
      }
    }

    // 2) Punish the responsible admin by demoting them.
    if (isActorAdmin && !protectedNums.has(actorNum)) {
      await sock.groupParticipantsUpdate(groupJid, [actorNum + "@s.whatsapp.net"], "demote");
      logger.warn(`lockgc: demoted responsible admin ${actorNum} (${actionName}) in ${groupJid}`);
    }

    // 3) Notify the group.
    await sock.sendMessage(groupJid, {
      text:
        "⚠️ *GROUP LOCK IS ACTIVE* — unauthorized " + actionName + " detected" +
        (isActorAdmin ? " and reverted. The responsible admin has been demoted." : " and reverted."),
    }).catch(() => {});
  } catch (e) {
    logger.error("lockgc handler error:", e && e.message ? e.message : e);
  }
}

module.exports = { handleGroupLockEvent, COOLDOWN_MS, normalizeJid };
