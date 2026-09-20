// ─────────────────────────────────────────────────────────────────────────────
// sendInteractiveMessage, with the menu rows indexed on the way out and the
// reply photo attached.
//
// A thin wrapper rather than a change at each call site: there are several places
// that send a menu, and the two things they must all do are (a) remember their
// rows so a tap arriving without an id can still be traced back to a command (see
// lib/interactiveRows.js) and (b) carry the bot's picture (see lib/replyImage.js).
// Doing both here means a new menu cannot forget either.
//
// The signature is identical to the package's, so callers are unchanged.
// ─────────────────────────────────────────────────────────────────────────────
"use strict";

const gifted = require("gifted-btns");
const interactiveRows = require("./interactiveRows");
const { attachReplyImage, numberFromJid } = require("./replyImage");

const botNumber = (sock) => numberFromJid(sock && sock.user && sock.user.id);

/**
 * Send an interactive message, remembering its rows and adding the photo.
 *
 * remember() is guarded: bookkeeping must never be the reason a menu fails to
 * send. The send itself is not, because its failures are the caller's to handle
 * exactly as before.
 *
 * attachReplyImage() is guarded inside its own module — it only touches payloads
 * that carry buttons, it never replaces an image the caller chose, and it returns
 * the payload untouched if there is nothing to attach. That matters here more than
 * anywhere else: this wrapper is on the path of every menu the bot sends.
 */
async function sendInteractiveMessage(sock, jid, payload, ...rest) {
  try {
    interactiveRows.remember(jid, payload);
  } catch (e) {
    console.error("[interactive] could not index menu rows:", e.message);
  }

  const outgoing = await attachReplyImage(payload, { botPhoneNum: botNumber(sock) });

  return gifted.sendInteractiveMessage(sock, jid, outgoing, ...rest);
}

/**
 * The legacy button shape, given the same treatment.
 *
 * It is exposed to the command registry (case.js buildCommandContext), so bodies
 * can call it directly — which is exactly why it cannot be left as a bare
 * re-export: a body using it would be the one button message in the bot without a
 * picture, and nobody writing a command body should have to remember that.
 */
async function sendButtons(sock, jid, opts = {}, ...rest) {
  const buttons = (opts && (opts.buttons || opts.interactiveButtons)) || [];
  let outgoing = opts;
  if (!opts.image && buttons.length) {
    const { replyImageFor } = require("./replyImage");
    try {
      const buffer = await replyImageFor({ botPhoneNum: botNumber(sock) });
      if (buffer) outgoing = { ...opts, image: { buffer } };
    } catch (e) {
      outgoing = opts;
    }
  }
  return gifted.sendButtons(sock, jid, outgoing, ...rest);
}

module.exports = {
  sendInteractiveMessage,
  sendButtons,
  // Re-exported so anything that wants to look a label up by hand can, without
  // reaching past this module.
  interactiveRows,
};
