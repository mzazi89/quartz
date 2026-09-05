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
const { sendInteractiveMessage } = require('gifted-btns');
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

  const reseller = await panelBuy.isReseller(senderPhone);

  // ── Not activated yet ──
  if (!reseller) {
    // Only treat the input as an activation code when it actually looks like
    // one (single token, 6+ alphanumeric chars, no commas) — otherwise show
    // the activation prompt (e.g. .unlimited mzazi, 2547… for a non-reseller).
    const joined = args.join(' ');
    const code = /^[A-Za-z0-9]{6,}$/.test(joined) ? joined.toUpperCase() : '';
    if (code) {
      const r = await panelBuy.activateReseller(code, senderPhone);
      if (r.ok) {
        await sendInteractiveMessage(mzazi, sender, {
          title: '✅ RESELLER ACTIVATED',
          text: `Welcome aboard 🎉 Your number is now a MZAZI panel reseller.\n\nTap below to create a panel for a client, or send .unlimited username, 2547XXXXXXXX directly.`,
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
      const msg =
        r.error === 'ALREADY'
          ? '❌ That reseller password is already activated on another number.'
          : '❌ Invalid reseller password. Check with the seller.';
      await sendText(mzazi, sender, msg);
      return true;
    }
    await sendText(
      mzazi,
      sender,
      `🔐 *RESELLER ACCESS*\n\n` +
        `Creating panels requires an activated reseller account.\n\n` +
        `👉 Enter the reseller password you received:\n` +
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
