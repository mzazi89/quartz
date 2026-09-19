// ─────────────────────────────────────────────────────────────────────────────
// WHATSAPP PANEL RESELLER FLOW — .panel / .unlimited
//
//  • A WhatsApp number must first be an ACTIVATED RESELLER (it entered a
//    reseller password that the admin sold/generated — see the admin panel).
//  • Activation:  .panel <reseller-password>
//  • Activated resellers create Pterodactyl panels for clients by RAM size:
//      .panel            → size menu (1GB – 10GB + UNLIMITED) buttons
//      .panel <size>     → prompt: reply with  username, phone
//      .unlimited <username>, <phone>   → direct unlimited creation
//  • Creation is automatic (password auto-generated, nest/egg auto-picked)
//    and the credentials are sent back with an "open panel" CTA button.
//
// Deliberately self-contained (no case.js closures): replies use the socket
// directly, state lives in this module.
// ─────────────────────────────────────────────────────────────────────────────
const { sendInteractiveMessage } = require('./interactive');
const panelBuy = require('./panelBuy');

// Pending two-step orders per chat: { step: 'client', size }
const pendingOrders = new Map();

// How many unreadable replies an open order tolerates before it is abandoned. A
// bound, not a preference: it is what stops a self-feeding reply loop.
const MAX_UNREADABLE = 3;

function hasPending(sender) { return pendingOrders.has(sender); }
function clearPending(sender) { pendingOrders.delete(sender); }

function parseClientLine(raw) {
  const line = String(raw || '').trim();
  if (!line) return null;
  const m = line.match(/^([A-Za-z0-9_]{3,20})\s*[, ]+\s*(.+)$/);
  if (!m) return null;
  const username = m[1];
  const phone = panelBuy.normalizeWaPhone(m[2]);
  if (!phone) return null;
  return { username, phone };
}

async function sendText(mzazi, sender, txt) {
  try {
    await mzazi.sendMessage(sender, { text: txt });
  } catch (e) {
    console.error('waPanel sendText error:', e.message);
  }
}

// Why an activation attempt failed, said plainly.
//
// The old code answered every failure that was not ALREADY with "Invalid reseller
// password", including the case where the NUMBER could not be used at all — so a
// reseller on an unaccepted number was told to check their password with the seller,
// and the seller had nothing to check. Each cause gets its own sentence now.
function activationError(error, prefix, seen) {
  switch (error) {
    case 'ALREADY':
      return '❌ That reseller password has already been used on another number.\n\nEach password activates exactly one number. Ask the seller for a new one.';
    case 'DISABLED':
      return '❌ That reseller password has been disabled by the seller. Please contact them.';
    case 'PHONE':
      // Name what the bot actually read. Without it this failure is a dead end:
      // the number looked perfectly good to the person sending it, so "check your
      // number" gives them nothing to check.
      return `❌ I can't use this number for a reseller account.\n\n` +
        `Send from your own WhatsApp number in the 07XXXXXXXX or 01XXXXXXXX format, then try again.` +
        (seen ? `\n\n_(the number I read from this chat: ${seen})_` : '');
    default:
      return `❌ That reseller password was not found.\n\nCheck it with the seller and send it exactly as you received it:\n${prefix}panel <password>`;
  }
}

// ─── Size menu (single_select rows + UNLIMITED quick reply) ──────────────────
async function sendSizeMenu({ mzazi, sender, prefix }) {
  const sections = [];
  for (let start = 1; start <= 10; start += 3) {
    const rows = [];
    for (let gb = start; gb <= Math.min(start + 2, 10); gb++) {
      rows.push({
        id: `${prefix}panel ${gb}gb`,
        title: `${gb}GB RAM`,
        description: panelBuy.PANEL_SIZES[`${gb}gb`].disk >= 1024
          ? `${Math.round(panelBuy.PANEL_SIZES[`${gb}gb`].disk / 1024)}GB SSD · ${panelBuy.PANEL_SIZES[`${gb}gb`].cpu}% CPU`
          : 'Full SSD storage',
      });
    }
    sections.push({ title: `${start} – ${Math.min(start + 2, 10)}GB`, rows });
  }

  await sendInteractiveMessage(mzazi, sender, {
    title: '🖥 MZAZI PANEL RESELLER',
    text:
      'Select the RAM size to create for your client.\n\n' +
      'After picking a size, send the client as:\n' +
      '`username, whatsapp-number`\n\n' +
      'e.g. mzazi, 254741388986',
    footer: '⚡ Powered by MZAZI TECH INC',
    interactiveButtons: [
      {
        name: 'single_select',
        buttonParamsJson: JSON.stringify({
          title: 'Select RAM size',
          sections,
        }),
      },
      {
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
          display_text: '∞ UNLIMITED',
          id: `${prefix}panel unlimited`,
        }),
      },
    ],
  });
}

// ─── Creation + success/error card ───────────────────────────────────────────
async function createPanelForClient({ mzazi, sender, prefix, resellerPhone, username, phone, size }) {
  const busy = await sendText(mzazi, sender, `⏳ Creating your ${size} panel for *${username}*… (automatic provisioning)`);
  void busy;
  try {
    const panel = await panelBuy.createWhatsappPanel({ username, phone, size, resellerPhone });
    const specLine =
      panel.ram > 0
        ? `${panel.ram >= 1024 ? panel.ram / 1024 + 'GB' : panel.ram + 'MB'} RAM · ${panel.disk >= 1024 ? Math.round(panel.disk / 1024) + 'GB' : panel.disk + 'MB'} SSD · ${panel.cpu || 0}% CPU`
        : 'No limits · maximum performance';

    await sendInteractiveMessage(mzazi, sender, {
      title: '✅ PANEL CREATED',
      text:
        `🎉 Client panel is ready!\n\n` +
        `🖥 Server: *${panel.package}*\n` +
        `⚙️ ${specLine}\n\n` +
        `🌐 Panel: ${panel.panel_url}\n` +
        `👤 Username: \`${panel.username}\`\n` +
        `🔐 Password: \`${panel.password}\`\n` +
        `📱 Client: ${phone}\n\n` +
        `Login at the panel URL with these details.`,
      footer: '⚡ Powered by MZAZI TECH INC',
      interactiveButtons: [
        {
          name: 'cta_url',
          buttonParamsJson: JSON.stringify({ display_text: '🔗 OPEN PANEL', url: panel.panel_url }),
        },
        {
          name: 'quick_reply',
          buttonParamsJson: JSON.stringify({ display_text: '🖥 Create another', id: `${prefix}panel` }),
        },
        {
          name: 'quick_reply',
          buttonParamsJson: JSON.stringify({ display_text: '📜 Menu', id: `${prefix}menu` }),
        },
      ],
    });
    return true;
  } catch (e) {
    console.error('waPanel create error:', e.message);
    await sendText(
      mzazi,
      sender,
      `❌ *Panel creation failed:* ${e.message}\n\n` +
        `If the username is already taken on the panel, pick a different one.`
    );
    return false;
  }
}

// ─── Command entry: .panel / .unlimited (+ .cancel while pending) ────────────
async function handleCommand(ctx) {
  const { mzazi, sender, isGroup, command, args, prefix, senderPhone } = ctx;

  // .cancel aborts a pending two-step order
  if (command === 'cancel' && hasPending(sender)) {
    clearPending(sender);
    await sendText(mzazi, sender, '❌ Order cancelled. Nothing was created.');
    return true;
  }

  // `.panel` takes the size as its first argument; each size is ALSO a command of
  // its own, so a whole order fits in one line (`.4gb mzazi, 2547…`).
  const sizeNames = panelBuy.listSizes();
  const isSizeCommand = sizeNames.includes(command);
  if (command !== 'panel' && !isSizeCommand) return false;

  if (isGroup) {
    await sendText(mzazi, sender, '❌ Panel commands work in a private chat only.');
    return true;
  }

  const resellerRow = await panelBuy.getReseller(senderPhone);
  const reseller = !!resellerRow;

  // ── Not activated yet: whatever follows .panel is the activation password ──
  if (!reseller) {
    // ANY text after the command is treated as a password attempt.
    //
    // This used to require /^[A-Za-z0-9]{6,}$/, so a password the seller had chosen
    // that contained a hyphen, an underscore, an @, a space, or was shorter than six
    // characters was discarded without a word and the prompt simply reappeared —
    // indistinguishable from the bot not seeing the password at all. A password is
    // now taken as given, trimmed, and the real reason is reported when it fails.
    //
    // The one exception is a RAM size: people do type `.panel 2gb` before they are
    // activated, and answering that with "password not found" would be unhelpful.
    const attempt = args.join(' ').trim();
    const looksLikeSize = panelBuy.listSizes().includes(attempt.toLowerCase());

    if (attempt && !looksLikeSize) {
      const r = await panelBuy.activateReseller(attempt, senderPhone);
      if (r.ok && r.already) {
        await sendText(
          mzazi,
          sender,
          `✅ This number is already an activated reseller — that password is the one it uses.\n\nSend ${prefix}panel to create a panel for a client.`
        );
        return true;
      }
      if (r.ok) {
        await sendInteractiveMessage(mzazi, sender, {
          title: '✅ RESELLER ACTIVATED',
          text: `Welcome aboard 🎉 Your number is now a MZAZI panel reseller.\n\nTap below to create a panel for a client, or send .unlimited username, 07XXXXXXXX directly.`,
          footer: '⚡ Powered by MZAZI TECH INC',
          interactiveButtons: [
            {
              name: 'quick_reply',
              buttonParamsJson: JSON.stringify({ display_text: '🖥 Create Panel', id: `${prefix}panel` }),
            },
            {
              name: 'quick_reply',
              buttonParamsJson: JSON.stringify({ display_text: '📜 Menu', id: `${prefix}menu` }),
            },
          ],
        });
        return true;
      }
      await sendText(mzazi, sender, activationError(r.error, prefix, r.seen));
      return true;
    }
    await sendText(
      mzazi,
      sender,
      `🔐 *RESELLER ACCESS*\n\n` +
        `Creating panels requires an activated reseller account.\n\n` +
        `👉 Send the reseller password you were given:\n` +
        `${prefix}panel <password>`
    );
    return true;
  }

  // ── Activated reseller ──
  // A new order abandons any half-finished one.
  clearPending(sender);

  // Where the size comes from: the command itself (`.4gb`) or the first argument
  // (`.panel 4gb`). Whatever follows it is the client's details.
  const size = isSizeCommand ? command : String(args[0] || '').toLowerCase();
  const details = (isSizeCommand ? args : args.slice(1)).join(' ').trim();

  // `.panel` on its own → the size menu.
  if (!size) {
    await sendSizeMenu({ mzazi, sender, prefix });
    return true;
  }

  if (!sizeNames.includes(size)) {
    // Already a reseller, and what they typed is their own password — they are not
    // asking for a size, they are checking whether they are activated.
    const typedWhole = args.join(' ').trim();
    if (resellerRow && typedWhole && typedWhole.toUpperCase() === String(resellerRow.code || '').toUpperCase()) {
      await sendText(
        mzazi,
        sender,
        `✅ This number is already an activated reseller — no need to enter the password again.\n\nSend ${prefix}panel to choose a size and create a panel for a client.`
      );
      return true;
    }
    await sendSizeMenu({ mzazi, sender, prefix });
    await sendText(mzazi, sender, `❌ Unknown size "${args[0]}". Pick from the menu.`);
    return true;
  }

  // ── One line, one order ────────────────────────────────────────────────────
  // Given the size AND the details (`.4gb mzazi, 254741388986`), the panel is
  // created straight away. Nothing is left waiting, so there is no prompt to answer
  // and no half-finished order to retry — which is also why this path cannot repeat
  // itself.
  const client = parseClientLine(details);
  if (client) {
    await createPanelForClient({
      mzazi,
      sender,
      prefix,
      resellerPhone: senderPhone,
      username: client.username,
      phone: client.phone,
      size,
    });
    return true;
  }

  // Details were typed but could not be read — say the shape. Deliberately does NOT
  // open a half-finished order: the caller asked for one line, not a conversation.
  if (details) {
    await sendText(mzazi, sender, usageText(prefix, size));
    return true;
  }

  // A size named on its own. As its own command (`.4gb`) that is a request for the
  // shape; as `.panel 4gb` it keeps the two-step prompt it has always had.
  if (isSizeCommand) {
    await sendText(mzazi, sender, usageText(prefix, size));
    return true;
  }

  pendingOrders.set(sender, { step: 'client', size, prefix });
  await sendText(
    mzazi,
    sender,
    `🖥 *${size.toUpperCase()} PANEL*\n\n` +
      `Send the client's details as:\n` +
      `<username>, <WhatsApp number>\n\n` +
      `e.g. mzazi, 254741388986\n\n` +
      `Reply ${prefix}cancel to abort.`
  );
  return true;
}


// The one-line shape. Quoted with the session's own prefix — an empty string is a
// real prefix (no-prefix mode), so `||` would wrongly show a dot.
function usageText(prefix, size) {
  const p = typeof prefix === 'string' ? prefix : '.';
  return `Usage: ${p}${size} <username>, <WhatsApp number>\n\n` +
    `e.g. ${p}${size} mzazi, 254741388986`;
}

// Commands that own the pending-order state, so the capture must never mistake them
// for the client's details. Sizes are included now that each size is a command:
// without that, `.4gb mzazi, 2547…` would be read as a client called "4gb".
function isPanelCommand(command) {
  const c = String(command || '').toLowerCase();
  return c === 'panel' || c === 'cancel' || panelBuy.listSizes().includes(c);
}

// ─── Plain-text reply while waiting for client details ───────────────────────
//
// Returns true when it has dealt with the message, false to let the caller carry on
// (and run the message as a command instead).
//
// `isKnownCommand` is passed in because only the caller can tell a real command from
// ordinary text: with no prefix configured EVERY message counts as a command, so
// arriving here is no longer a sign that the message is not one.
async function handlePlainInput({ mzazi, sender, budy, senderPhone, prefix, isKnownCommand = false, isPanelCommand = false, isOwnMessage = false }) {
  const st = pendingOrders.get(sender);
  if (!st || st.step !== 'client') return false;

  // A message THIS bot sent is not the owner talking. In a self-chat every message
  // is `fromMe` — the owner's and the bot's — so the caller's record of what it
  // sent is the only way to tell them apart. Swallowed silently and the order left
  // untouched: answering it is what provoked the next one.
  if (isOwnMessage) return true;

  // The prefix to quote back. An empty string is a real prefix (no-prefix mode), so
  // `||` would wrongly fall through to '.' and tell people to type a dot they must
  // not type.
  const p = typeof st.prefix === 'string' ? st.prefix
    : typeof prefix === 'string' ? prefix : '.';

  // A panel command owns this state, so it is NEVER the client's details — and this
  // has to be decided BEFORE parsing. A line like "4gb mzazi, 254753405751" parses
  // perfectly well on its own (the size reads as the username, the rest as the
  // number), so checking afterwards created a client actually named "4gb" and
  // swallowed the command that was meant to create the 4GB panel.
  if (isPanelCommand) return false;

  const client = parseClientLine(budy);
  if (!client) {
    // A real command while the prompt is open means the order is abandoned: drop it
    // and let the command run, exactly as a new command always has.
    if (isKnownCommand) {
      clearPending(sender);
      return false;
    }

    // Neither the details nor a command. Say so and KEEP the order, so a typo can be
    // corrected rather than the whole size selection repeated — but only up to a
    // point. While the order stays open, any message the bot itself sent can arrive
    // back as input and provoke another reply, so an unbounded number of retries is
    // an unbounded number of messages. This bound is what makes the loop terminate
    // even if a message of ours is missed by the id record.
    st.fails = (st.fails || 0) + 1;
    if (st.fails > MAX_UNREADABLE) {
      clearPending(sender);
      await sendText(
        mzazi,
        sender,
        `❌ Still couldn't read the client's details, so I've cancelled this order.\n\n` +
          `Send ${p}panel to choose a size again.`
      );
      return true;
    }

    await sendText(
      mzazi,
      sender,
      `❌ Couldn't read that. Send it exactly as:\n` +
        `username, WhatsApp number\n\n` +
        `e.g. mzazi, 254741388986\n\n` +
        `Type ${p}cancel to abort.`
    );
    return true;
  }

  clearPending(sender);
  await createPanelForClient({
    mzazi,
    sender,
    prefix: p,
    resellerPhone: senderPhone,
    username: client.username,
    phone: client.phone,
    size: st.size,
  });
  return true;
}

module.exports = { hasPending, clearPending, handleCommand, handlePlainInput, isPanelCommand };
