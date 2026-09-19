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
function activationError(error, prefix) {
  switch (error) {
    case 'ALREADY':
      return '❌ That reseller password has already been used on another number.\n\nEach password activates exactly one number. Ask the seller for a new one.';
    case 'DISABLED':
      return '❌ That reseller password has been disabled by the seller. Please contact them.';
    case 'PHONE':
      return `❌ I can't use this number for a reseller account.\n\nSend from your own WhatsApp number in the 07XXXXXXXX or 01XXXXXXXX format, then try again.`;
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

  if (command !== 'panel' && command !== 'unlimited') return false;

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
      await sendText(mzazi, sender, activationError(r.error, prefix));
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
  clearPending(sender);

  if (command === 'unlimited') {
    const client = parseClientLine(args.join(' '));
    if (!client) {
      await sendText(
        mzazi,
        sender,
        `Usage: ${prefix}unlimited <username>, <WhatsApp number>\n\n` +
          `e.g. ${prefix}unlimited mzazi, 254741388986`
      );
      return true;
    }
    await createPanelForClient({
      mzazi,
      sender,
      prefix,
      resellerPhone: senderPhone,
      username: client.username,
      phone: client.phone,
      size: 'unlimited',
    });
    return true;
  }

  // .panel
  const sizeArg = String(args[0] || '').toLowerCase();
  if (!sizeArg) {
    await sendSizeMenu({ mzazi, sender, prefix });
    return true;
  }
  if (!panelBuy.listSizes().includes(sizeArg)) {
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
  pendingOrders.set(sender, { step: 'client', size: sizeArg, prefix });
  await sendText(
    mzazi,
    sender,
    `🖥 *${sizeArg.toUpperCase()} PANEL*\n\n` +
      `Send the client's details as:\n` +
      `<username>, <WhatsApp number>\n\n` +
      `e.g. mzazi, 254741388986\n\n` +
      `Reply ${prefix}cancel to abort.`
  );
  return true;
}

// ─── Plain-text reply while waiting for client details ───────────────────────
async function handlePlainInput({ mzazi, sender, budy, senderPhone, prefix }) {
  const st = pendingOrders.get(sender);
  if (!st || st.step !== 'client') return false;
  const client = parseClientLine(budy);
  if (!client) {
    await sendText(
      mzazi,
      sender,
      `❌ Couldn't read that. Send it exactly as:\n` +
        `username, WhatsApp number\n\n` +
        `e.g. mzazi, 254741388986\n\n` +
        `Type ${st.prefix || prefix || '.'}cancel to abort.`
    );
    return true;
  }
  clearPending(sender);
  await createPanelForClient({
    mzazi,
    sender,
    prefix: st.prefix || prefix || '.',
    resellerPhone: senderPhone,
    username: client.username,
    phone: client.phone,
    size: st.size,
  });
  return true;
}

module.exports = { hasPending, clearPending, handleCommand, handlePlainInput };
