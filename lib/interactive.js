// ─────────────────────────────────────────────────────────────────────────────
// sendInteractiveMessage, with the menu rows indexed on the way out.
//
// A thin wrapper rather than a change at each call site: there are several places
// that send a menu, and the one thing they must all do is remember their rows so a
// tap arriving without an id can still be traced back to a command (see
// lib/interactiveRows.js). Doing it here means a new menu cannot forget.
//
// The signature is identical to the package's, so callers are unchanged.
// ─────────────────────────────────────────────────────────────────────────────
"use strict";

const gifted = require("gifted-btns");
const interactiveRows = require("./interactiveRows");

/**
 * Send an interactive message, remembering its rows first.
 *
 * remember() is guarded: bookkeeping must never be the reason a menu fails to
 * send. The send itself is not, because its failures are the caller's to handle
 * exactly as before.
 */
async function sendInteractiveMessage(sock, jid, payload, ...rest) {
  try {
    interactiveRows.remember(jid, payload);
  } catch (e) {
    console.error("[interactive] could not index menu rows:", e.message);
  }
  return gifted.sendInteractiveMessage(sock, jid, payload, ...rest);
}

module.exports = {
  sendInteractiveMessage,
  sendButtons: gifted.sendButtons,
  // Re-exported so anything that wants to look a label up by hand can, without
  // reaching past this module.
  interactiveRows,
};
