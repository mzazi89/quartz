require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const NodeCache = require('node-cache');
const { loadJSON, saveJSON, ensureDir, runtime } = require('./helper/function');
const { validatePhoneNumber, formatPairingCode } = require('./helper/generate');
const { logTelegram, logBanner, logSystem } = require('./helper/logger');
const { syncRemoteCommands } = require('./lib/remoteCommands');
const botTelemetry = require('./lib/botTelemetry');
const config = require('./settings');

// ── Remote command registry sync (mzazi.shop/api/bot-command) ────────────────
// Syncs the website-defined commands at boot and every 30 minutes.
syncRemoteCommands()
  .then((r) => {
    if (r.ok) logSystem(`Remote commands synced (${r.data.commands.length})`, 'success');
    else logSystem(`Remote command sync failed: ${r.error}`, 'warn');
  })
  .catch(() => {});
setInterval(() => {
  syncRemoteCommands().catch(() => {});
}, 30 * 60 * 1000);

// ── Website telemetry: report status + execute admin controls ────────────────
botTelemetry.start();

// ─── New subscription / payment / admin modules ───────────────────────────────
const {
  PLANS,
  getOrCreateUser,
  getUserSubscription,
  getUserActiveDeviceCount,
  getUserSessions,
  canAddDevice,
  upgradeSubscription,
  downgradeToFree,
  syncSessionToDb,
  addLog,
} = require('./lib/subscription');
const {
  initializePaystackPayment,
  verifyPaystackPayment,
  processSuccessfulPayment,
} = require('./lib/payment');
const {
  getStats,
  getAllUsers,
  getPayments,
  getSubscriptions,
  getLogs,
  adminUpgrade,
  adminDowngrade,
  createCoupon,
  getCoupons,
  deleteCoupon,
  validateCoupon,
  useCoupon,
} = require('./lib/admin');
const { startCronJobs } = require('./lib/cron');
const { startWebhookServer } = require('./server');

// ─── SHARED STATE (across ALL bots) ──────────────────────────────────────────
const pairingCodes = new NodeCache({
  stdTTL: 3600,
  checkperiod: 600,
});

// Legacy JSON (preserved — still used for session files)
const pairingSessions = loadJSON('./database/paired.json', []);
const settings = loadJSON('./database/settings.json', {
  premiumOnly: false,
  publicMode: true,
  selfMode: false,
});

const saveData = () => {
  saveJSON('./database/paired.json', loadJSON('./database/paired.json', []));
  saveJSON('./database/settings.json', settings);
};

// ─── Bot setup (FIXED: All bots created and used) ──────────────────────────
const tokens = config.telegramToken
  .split(",")
  .map(t => t.trim())
  .filter(t => t.length > 0); // Remove empty tokens

const bots = tokens.map((token, index) => {
  try {
    const bot = new TelegramBot(token, {
      polling: true,
    });

    console.log(`✅ Bot ${index + 1} started: ${token.split(":")[0]}`);

    // Error handling per bot
    bot.on('error', (error) => {
      console.error(`❌ Bot ${index + 1} error:`, error.message);
      logSystem(`Bot ${index + 1} error: ${error.message}`, 'error');
    });

    bot.on('polling_error', (error) => {
      console.error(`❌ Bot ${index + 1} polling error:`, error.message);
      logSystem(`Bot ${index + 1} polling error: ${error.message}`, 'error');
    });

    return bot;
  } catch (error) {
    console.error(`❌ Failed to start bot ${index + 1}:`, error.message);
    logSystem(`Failed to start bot ${index + 1}: ${error.message}`, 'error');
    return null;
  }
}).filter(bot => bot !== null);

if (bots.length === 0) {
  console.error("❌ No bots started successfully!");
  logSystem("No bots started successfully!", 'error');
  process.exit(1);
}

console.log(`✅ ${bots.length} bots running with shared state`);
logSystem(`${bots.length} bots online with shared state`, 'success');

// ─── Owner helpers (preserved) ───────────────────────────────────────────────
const isOwner = (userId) => userId === config.telegramOwner;

// ─── Subscription helpers ─────────────────────────────────────────────────────
async function getSubStatus(userId) {
  const sub = await getUserSubscription(userId);
  const deviceCount = getUserActiveDeviceCount(userId);
  const isExpired = sub.endDate && new Date(sub.endDate) < new Date() && sub.plan !== 'FREE';
  const effectivePlan = isExpired ? 'FREE' : sub.plan;
  const maxDevices = isExpired ? 1 : (sub.maxDevices || 1);
  return { sub, deviceCount, effectivePlan, maxDevices, isExpired };
}

// ─── Plan selection keyboard ──────────────────────────────────────────────────
function buildPlanKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '📦 5 Numbers — KES 100 / 30 Days', style: 'success', callback_data: 'buy_plan:PLAN_5' }],
      [{ text: '📦 10 Numbers — KES 150 / 30 Days', style: 'success', callback_data: 'buy_plan:PLAN_10' }],
      [{ text: '📦 20 Numbers — KES 200 / 30 Days', style: 'success', callback_data: 'buy_plan:PLAN_20' }],
      [{ text: '🔥 Unlimited Numbers — KES 250 / 30 Days', style: 'success', callback_data: 'buy_plan:UNLIMITED' }],
      [{ text: '⬅ Back', callback_data: 'menu:back' }],
    ],
  };
}

// ─── Device limit keyboard ────────────────────────────────────────────────────
function buildDeviceLimitKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '💳 Upgrade Plan', style: 'success', callback_data: 'menu:upgrade' }],
      [{ text: '⬅ Back', callback_data: 'menu:back' }],
    ],
  };
}

// ─── Main keyboard (preserved + extended) ────────────────────────────────────
const mainKeyboard = {
  reply_markup: {
    keyboard: [
      [{ text: '📱 Pair Device', style: 'success' }, { text: '🗑️ Delete Pair', style: 'danger' }],
      [{ text: '📲 My Devices', style: 'primary' }, { text: '💳 Subscription', style: 'primary' }],
      [{ text: '👤 My Info', style: 'primary' }, { text: '💎 Plans & Pricing', style: 'success' }],
      [{ text: '⚙️ Owner Menu', style: 'primary' }, { text: '📋 Help', style: 'primary' }],
      [{ text: '📡 Channel', style: 'primary' }, { text: '💬 Owner Contact', style: 'primary' }],
      [{ text: '🚀 Buy Panel Servers', style: 'success' }],
    ],
    resize_keyboard: true,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SHARED HANDLER FUNCTIONS (applied to ALL bots)
// ─────────────────────────────────────────────────────────────────────────────

// ─── My Devices handler ─────────────────────────────────────────────────────
async function handleMyDevices(bot, chatId, userId) {
  const sessions = getUserSessions(userId);
  const { maxDevices, deviceCount } = await getSubStatus(userId);

  if (sessions.length === 0) {
    return bot.sendMessage(
      chatId,
      '📭 <b>No devices paired yet.</b>\n\nUse /pair [number] to pair your first device.',
      { parse_mode: 'HTML' }
    );
  }

  let text = `
<b>📲 My Devices</b>

Slots: ${deviceCount} / ${maxDevices === 999 ? '∞' : maxDevices}

`.trim() + '\n\n';

  const inlineRows = [];

  sessions.forEach((sess, i) => {
    const status = sess.active !== false ? '🟢 Active' : '🔴 Inactive';
    const connDate = sess.createdAt
      ? new Date(sess.createdAt).toLocaleDateString('en-KE')
      : 'Unknown';

    text += `<b>${i + 1}. <code>${sess.number}</code></b>\n`;
    text += `   Status: ${status}\n`;
    text += `   Connected: ${connDate}\n\n`;

    inlineRows.push([
      { text: `🔄 ${sess.number}`, style: 'primary', callback_data: `device:reconnect:${sess.number}` },
      { text: `🚪 Logout`, style: 'danger', callback_data: `device:logout:${sess.number}` },
      { text: `🗑️ Delete`, style: 'danger', callback_data: `device:delete:${sess.number}` },
    ]);
  });

  inlineRows.push([{ text: '➕ Add Device', style: 'success', callback_data: 'device:add' }]);

  bot.sendMessage(chatId, text, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: inlineRows },
  });
}

// ─── Subscription menu handler ─────────────────────────────────────────────
async function handleSubscriptionMenu(bot, chatId, userId) {
  const { sub, effectivePlan, maxDevices, deviceCount, isExpired } = await getSubStatus(userId);

  const planName = PLANS[effectivePlan]?.name || effectivePlan.replace('_', ' ');
  const expiryText = sub.endDate && !isExpired
    ? new Date(sub.endDate).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
    : isExpired
    ? '⚠️ Expired'
    : '—';

  const remaining = maxDevices === 999 ? '∞' : Math.max(0, maxDevices - deviceCount);

  const subText = `
<b>💳 Subscription</b>

📦 Plan: ${planName}
📅 Expires: ${expiryText}
📱 Devices: ${deviceCount} / ${maxDevices === 999 ? 'Unlimited' : maxDevices}
🔓 Slots left: ${remaining}

${isExpired ? '⚠️ Your subscription has expired. Upgrade to continue.' : ''}
  `.trim();

  bot.sendMessage(chatId, subText, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '💳 Upgrade Plan', style: 'success', callback_data: 'menu:upgrade' }],
      ],
    },
  });
}

// ─── Admin panel sender ─────────────────────────────────────────────────────
async function sendAdminPanel(bot, chatId) {
  const stats = await getStats();
  const s = stats || {};

  const panelText = `
<b>⚙️ Admin Panel</b>

👤 Users: ${s.totalUsers || 0}
💎 Active subs: ${s.activeSubs || 0}
⏳ Expired subs: ${s.expiredSubs || 0}
📱 Active sessions: ${s.activeSessions || 0}
💳 Payments: ${s.totalPayments || 0} (${s.successPayments || 0} success)
💰 Revenue: KES ${s.totalRevenue || 0}
  `.trim();

  bot.sendMessage(chatId, panelText, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '👤 Users', style: 'primary', callback_data: 'admin:users:0' },
          { text: '💳 Payments', style: 'primary', callback_data: 'admin:payments:0' },
        ],
        [
          { text: '💎 Subscriptions', style: 'primary', callback_data: 'admin:subs:0' },
          { text: '📊 Statistics', style: 'primary', callback_data: 'admin:stats' },
        ],
        [
          { text: '📢 Broadcast', style: 'danger', callback_data: 'admin:broadcast' },
          { text: '🎟️ Coupons', style: 'primary', callback_data: 'admin:coupons' },
        ],
        [
          { text: '⬆️ Manual Upgrade', style: 'success', callback_data: 'admin:upgrade_prompt' },
          { text: '⬇️ Manual Downgrade', style: 'danger', callback_data: 'admin:downgrade_prompt' },
        ],
        [{ text: '📋 Logs', style: 'primary', callback_data: 'admin:logs:0' }],
      ],
    },
  });
}

// ─── Verify payment helper ─────────────────────────────────────────────────
async function handleVerifyPayment(bot, chatId, userId, reference) {
  bot.sendMessage(chatId, '⏳ Verifying payment...');
  const result = await processSuccessfulPayment(reference);

  if (!result.success) {
    if (result.alreadyProcessed) {
      return bot.sendMessage(chatId, '✅ Payment already verified. Your subscription is active.');
    }
    return bot.sendMessage(
      chatId,
      `❌ Payment verification failed.\n\n${result.error || 'Please wait a few minutes and try again.'}`,
      { parse_mode: 'HTML' }
    );
  }

  const { PLANS } = require('./lib/payment');
  const plan = PLANS[result.planKey];
  const successMsg = `
✅ <b>Payment verified.</b>

📦 Plan: ${plan?.name || result.planKey}
📱 Devices: ${plan?.maxDevices === 999 ? 'Unlimited' : plan?.maxDevices}
⏳ Valid: 30 days

Use <b>📱 Pair Device</b> to add your WhatsApp numbers.
  `.trim();

  bot.sendMessage(chatId, successMsg, { parse_mode: 'HTML' });
}

// ─────────────────────────────────────────────────────────────────────────────
// SETUP HANDLERS FOR ALL BOTS
// ─────────────────────────────────────────────────────────────────────────────

function setupBotHandlers(bot, botIndex) {

  // ─── Mandatory group membership gate ──────────────────────────────────────
  // Every update is intercepted here: non-members get the join-groups message
  // with buttons and their command is ignored. Owner always bypasses.
  const gate = require('./lib/telegramGate')(bot);
  const _processUpdate = bot.processUpdate.bind(bot);
  bot.processUpdate = async (update) => {
    // join/leave events → record the member in the ledger JSON
    if (update.chat_member || update.my_chat_member) {
      gate.handleChatMember(update);
    }
    const msg = update.message;
    if (msg && msg.from) {
      gate.captureGroup(msg);
      if (await gate.enforceGate(msg)) return; // blocked — only the gate message is sent
    }
    const cq = update.callback_query;
    if (cq) {
      if (cq.data === 'gate:check') return _processUpdate(update); // re-check handled below
      const cqUserId = cq.from && cq.from.id;
      if (cqUserId && cqUserId !== config.telegramOwner) {
        const missing = await gate.getMissingGroups(cqUserId);
        if (missing.length > 0) {
          try { await bot.answerCallbackQuery(cq.id, { text: 'Join the required groups first' }); } catch (e) {}
          return; // ignore callbacks from gated users
        }
      }
    }
    return _processUpdate(update);
  };

  // ─── /start (also reused after the membership gate unlocks) ───────────────
  async function sendStartMenu(chatId, userId, username, firstName) {
    await getOrCreateUser(userId, username, firstName);

    const welcomeText = `
<b>Welcome to MZAZI TECH QUARTZ BOT</b>

A secure WhatsApp automation and device management service.

<b>Quick start</b>
/pair [number] — Pair a WhatsApp device
/mydevices — Manage your devices
/subscription — Subscription and plans
/myid — Your profile
/help — All commands

For support, use the main menu or contact the owner.
  `.trim();

    try {
      const { getBuffer } = require('./helper/function');
      const imageBuffer = await getBuffer(config.connectionImage);
      if (imageBuffer) {
        bot.sendPhoto(chatId, imageBuffer, {
          caption: welcomeText,
          parse_mode: 'HTML',
          ...mainKeyboard,
        });
      } else {
        bot.sendMessage(chatId, welcomeText, { parse_mode: 'HTML', ...mainKeyboard });
      }
    } catch (error) {
      bot.sendMessage(chatId, welcomeText, { parse_mode: 'HTML', ...mainKeyboard });
    }
  }

  bot.onText(/\/start/, async (msg) => {
    await sendStartMenu(msg.chat.id, msg.from.id, msg.from.username, msg.from.first_name);
  });

  // ─── Message handler ─────────────────────────────────────────────────────
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;

    if (text) {
      logTelegram({
        userId,
        username: msg.from.username,
        firstName: msg.from.first_name || 'Unknown',
        action: msg.chat.type === 'private' ? 'Direct Message' : `Group: ${msg.chat.title || 'Unknown'}`,
        message: text,
        messageType: 'text',
        botId: botIndex + 1,
      });
    }

    if (!text || text.startsWith('/')) return;

    // ─── 📱 Pair Device ──────────────────────────────────────────────────────
    if (text === '📱 Pair Device') {
      await getOrCreateUser(userId, msg.from.username, msg.from.first_name);

      if (settings.premiumOnly && !isOwner(userId)) {
        const { sub } = await getSubStatus(userId);
        if (sub.plan === 'FREE') {
          return bot.sendMessage(chatId, '❌ Pairing is available to premium users only.');
        }
      }
      return bot.sendMessage(
        chatId,
        '📱 <b>Enter phone number to pair:</b>\n\n<i>Format: /pair 254722000000</i>',
        { parse_mode: 'HTML' }
      );
    }

    // ─── 🗑️ Delete Pair ──────────────────────────────────────────────────────
    else if (text === '🗑️ Delete Pair') {
      return bot.sendMessage(
        chatId,
        '🗑️ <b>Enter phone number to delete:</b>\n\n<i>Format: /delpair 254722000000</i>',
        { parse_mode: 'HTML' }
      );
    }

    // ─── 📲 My Devices ────────────────────────────────────────────────────────
    else if (text === '📲 My Devices') {
      await handleMyDevices(bot, chatId, userId);
    }

    // ─── 💳 Subscription ─────────────────────────────────────────────────────
    else if (text === '💳 Subscription') {
      await handleSubscriptionMenu(bot, chatId, userId);
    }

    // ─── 👤 My Info ──────────────────────────────────────────────────────────
    else if (text === '👤 My Info') {
      const username = msg.from.username || 'No username';
      const firstName = msg.from.first_name || 'Unknown';
      const { effectivePlan, maxDevices, deviceCount, sub } = await getSubStatus(userId);

      const expiryText = sub.endDate
        ? new Date(sub.endDate).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
        : 'Never';

      const infoText = `
<b>👤 Your Profile</b>

🆔 ID: <code>${userId}</code>
👤 Username: @${username}
📛 Name: ${firstName}
📦 Plan: ${effectivePlan.replace('_', ' ')}
📱 Devices: ${deviceCount} / ${maxDevices === 999 ? '∞' : maxDevices}
📅 Expires: ${expiryText}
👑 Role: ${isOwner(userId) ? 'Owner' : 'User'}`.trim();

      bot.sendMessage(chatId, infoText, { parse_mode: 'HTML' });
    }

    // ─── 💎 Plans & Pricing ──────────────────────────────────────────────────
    else if (text === '💎 Plans & Pricing') {
      const planText = `
<b>💎 Plans & Pricing</b>

🆓 <b>Free</b> — 1 number, basic features
📦 <b>5 numbers</b> — KES 100 / 30 days
📦 <b>10 numbers</b> — KES 150 / 30 days
📦 <b>20 numbers</b> — KES 200 / 30 days
🔥 <b>Unlimited</b> — KES 250 / 30 days

All paid plans include priority support, all features, auto-reconnect, and 30-day validity.

Press <b>Upgrade Plan</b> to subscribe.
    `.trim();

      bot.sendMessage(chatId, planText, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💳 Upgrade Plan', style: 'success', callback_data: 'menu:upgrade' }],
          ],
        },
      });
    }

    // ─── ⚙️ Owner Menu ────────────────────────────────────────────────────────
    else if (text === '⚙️ Owner Menu') {
      if (!isOwner(userId)) {
        return bot.sendMessage(chatId, '❌ Owner only.');
      }
      await sendAdminPanel(bot, chatId);
    }

    // ─── 📋 Help ──────────────────────────────────────────────────────────────
    else if (text === '📋 Help') {
      const helpText = `
<b>📋 Commands</b>

<b>General</b>
/start — Main menu
/myid — Your profile
/help — This message

<b>Pairing</b>
/pair [number] — Pair a device
/delpair [number] — Remove a device
/listsessions — Your sessions
/mydevices — Manage devices

<b>Subscription</b>
/subscription — Plan and status
/verify [ref] — Verify a payment

<b>Owner only</b>
/admin — Admin panel
/addprem [id] — Grant premium
/delprem [id] — Revoke premium
/premium on|off — Toggle premium-only mode
/listpaired — All sessions
/broadcast [msg] — Send a broadcast
    `.trim();

      bot.sendMessage(chatId, helpText, { parse_mode: 'HTML' });
    }

    // ─── 📡 Channel ───────────────────────────────────────────────────────────
    else if (text === '📡 Channel') {
      bot.sendMessage(chatId, '📡 Join our channel: https://t.me/mzazidev');
    }

    // ─── 💬 Owner Contact ─────────────────────────────────────────────────────
    else if (text === '💬 Owner Contact') {
      bot.sendMessage(chatId, `💬 Contact owner: @${config.owner}`);
    }

    // ─── 🚀 Buy Panel Servers ─────────────────────────────────────────────────
    else if (text === '🚀 Buy Panel Servers') {
      bot.sendMessage(chatId, '🚀 <b>Buy Panel Servers</b>\n\nClick below to visit our server shop:', {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🛒 Open Server Shop', style: 'success', url: 'https://t.me/mzazipanelshopbot' }],
          ],
        },
      });
    }
  });

  // ─── callback_query handler ────────────────────────────────────────────────
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;

    // ─── Membership gate: "✅ I've Joined" re-check ──────────────────────────
    if (data === 'gate:check') {
      const passed = await gate.handleGateCheck(chatId, userId, query.message.message_id);
      bot.answerCallbackQuery(query.id, {
        text: passed ? '✅ Verified! You can now use the bot.' : '❌ Join all groups, then tap again.',
      }).catch(() => {});
      if (passed) {
        // unlocked → continue straight into the bot menu
        await sendStartMenu(chatId, userId, query.from.username, query.from.first_name);
      }
      return;
    }

    bot.answerCallbackQuery(query.id).catch(() => {});

    // ─── Menu actions ──────────────────────────────────────────────────────────
    if (data === 'menu:back') {
      return bot.sendMessage(chatId, '🏠 Back to main menu.', mainKeyboard);
    }

    if (data === 'menu:upgrade') {
      return bot.sendMessage(
        chatId,
        '💳 <b>Choose a Subscription Plan:</b>',
        { parse_mode: 'HTML', reply_markup: buildPlanKeyboard() }
      );
    }

    // ─── Buy plan ─────────────────────────────────────────────────────────────
    if (data.startsWith('buy_plan:')) {
      const planKey = data.split(':')[1];
      const plan = PLANS[planKey];
      if (!plan || plan.price === 0) {
        return bot.sendMessage(chatId, '❌ Invalid plan selected.');
      }

      await getOrCreateUser(userId, query.from.username, query.from.first_name);
      bot.sendMessage(chatId, '⏳ Generating payment link...');

      const result = await initializePaystackPayment(userId, planKey);
      if (!result.success) {
        const hint = result.error && result.error.includes('PAYSTACK_SECRET_KEY')
          ? '\n\n⚠️ <b>Tip:</b> Make sure <code>PAYSTACK_SECRET_KEY</code> is set in your .env file.'
          : result.error && result.error.includes('User not found')
            ? '\n\n⚠️ <b>Tip:</b> Database tables missing. Run <code>npm start</code> to auto-create them, or run <code>npx prisma db push</code> manually.'
            : '';
        return bot.sendMessage(
          chatId,
          `❌ Failed to generate payment link.\n\n<code>${result.error}</code>${hint}`,
          { parse_mode: 'HTML' }
        );
      }

      const payText = `
<b>💳 Payment</b>

📦 Plan: ${plan.name}
💰 Amount: KES ${plan.price}
🔖 Reference: <code>${result.reference}</code>

Press <b>Pay Now</b> to complete payment. Your subscription activates automatically.

Manual check: /verify ${result.reference}
    `.trim();

      bot.sendMessage(chatId, payText, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💳 Pay Now', style: 'success', url: result.url }],
            [{ text: '✅ I\'ve Paid — Verify', style: 'success', callback_data: `verify:${result.reference}` }],
            [{ text: '⬅ Back to Plans', callback_data: 'menu:upgrade' }],
          ],
        },
      });
      return;
    }

    // ─── Verify payment (from button) ─────────────────────────────────────────
    if (data.startsWith('verify:')) {
      const reference = data.split(':').slice(1).join(':');
      return handleVerifyPayment(bot, chatId, userId, reference);
    }

    // ─── Device actions ───────────────────────────────────────────────────────
    if (data.startsWith('device:')) {
      const parts = data.split(':');
      const action = parts[1];

      if (action === 'add') {
        return bot.sendMessage(
          chatId,
          '📱 <b>To add a device:</b>\n\n<i>Format: /pair 254722000000</i>',
          { parse_mode: 'HTML' }
        );
      }

      const phoneNumber = parts.slice(2).join(':');

      if (action === 'reconnect') {
        bot.sendMessage(chatId, `⏳ Reconnecting <code>${phoneNumber}</code>...`, { parse_mode: 'HTML' });
        try {
          const WAConnection = require('./whatsapp');
          await WAConnection.connectToWhatsApp(phoneNumber, userId);
          bot.sendMessage(chatId, `✅ Reconnect initiated for <code>${phoneNumber}</code>`, { parse_mode: 'HTML' });
        } catch (err) {
          bot.sendMessage(chatId, `❌ Reconnect failed: ${err.message}`);
        }
      }

      else if (action === 'logout') {
        let sessions = loadJSON('./database/paired.json', []);
        const idx = sessions.findIndex(s => s.number === phoneNumber && (String(s.userId) === String(userId) || isOwner(userId)));
        if (idx === -1) {
          return bot.sendMessage(chatId, '❌ Session not found.');
        }
        sessions[idx].active = false;
        saveJSON('./database/paired.json', sessions);

        try {
          const WAConnection = require('./whatsapp');
          const conn = WAConnection.activeSessions.get(phoneNumber);
          if (conn) {
            await conn.logout();
            WAConnection.activeSessions.delete(phoneNumber);
          }
        } catch {}

        bot.sendMessage(chatId, `🚪 Logged out: <code>${phoneNumber}</code>`, { parse_mode: 'HTML' });
      }

      else if (action === 'delete') {
        let sessions = loadJSON('./database/paired.json', []);
        const idx = sessions.findIndex(s => s.number === phoneNumber && (String(s.userId) === String(userId) || isOwner(userId)));
        if (idx === -1) {
          return bot.sendMessage(chatId, '❌ Session not found or no permission.');
        }

        const sessionPath = `./database/sessions/${phoneNumber}`;
        if (fs.existsSync(sessionPath)) {
          fs.rmSync(sessionPath, { recursive: true, force: true });
        }

        try {
          const WAConnection = require('./whatsapp');
          const conn = WAConnection.activeSessions.get(phoneNumber);
          if (conn) conn.end();
          WAConnection.activeSessions.delete(phoneNumber);
        } catch {}

        sessions.splice(idx, 1);
        saveJSON('./database/paired.json', sessions);

        bot.sendMessage(chatId, `🗑️ Deleted: <code>${phoneNumber}</code>`, { parse_mode: 'HTML' });
      }
      return;
    }

    // ─── Admin panel actions ───────────────────────────────────────────────────
    if (data.startsWith('admin:') && !isOwner(userId)) {
      return bot.sendMessage(chatId, '❌ Admin only.');
    }

    if (data === 'admin:stats') {
      return sendAdminPanel(bot, chatId);
    }

    if (data.startsWith('admin:users:')) {
      const page = parseInt(data.split(':')[2]) || 0;
      const { users, total } = await getAllUsers(page, 8);

      if (users.length === 0) {
        return bot.sendMessage(chatId, '📭 No users found.');
      }

      let text = `<b>👤 Users</b> (page ${page + 1}, total: ${total})\n\n`;
      users.forEach((u, i) => {
        const sub = u.subscription;
        text += `${page * 8 + i + 1}. <code>${u.telegramId}</code> @${u.username || 'none'}\n`;
        text += `   Plan: ${sub?.plan || 'FREE'} | Devices: ?\n`;
      });

      const navButtons = [];
      if (page > 0) navButtons.push({ text: '⬅ Prev', callback_data: `admin:users:${page - 1}` });
      if ((page + 1) * 8 < total) navButtons.push({ text: 'Next ➡', callback_data: `admin:users:${page + 1}` });

      bot.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: navButtons.length ? [navButtons] : [] },
      });
      return;
    }

    if (data.startsWith('admin:payments:')) {
      const page = parseInt(data.split(':')[2]) || 0;
      const { payments, total } = await getPayments(page, 8);

      if (payments.length === 0) {
        return bot.sendMessage(chatId, '📭 No payments found.');
      }

      let text = `<b>💳 Payments</b> (page ${page + 1}, total: ${total})\n\n`;
      payments.forEach((p, i) => {
        const icon = p.status === 'SUCCESS' ? '✅' : p.status === 'FAILED' ? '❌' : '⏳';
        text += `${icon} <code>${p.reference.slice(0, 20)}...</code>\n`;
        text += `   User: ${p.user?.telegramId} | Plan: ${p.plan} | KES ${p.amount}\n\n`;
      });

      const navButtons = [];
      if (page > 0) navButtons.push({ text: '⬅ Prev', callback_data: `admin:payments:${page - 1}` });
      if ((page + 1) * 8 < total) navButtons.push({ text: 'Next ➡', callback_data: `admin:payments:${page + 1}` });

      bot.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: navButtons.length ? [navButtons] : [] },
      });
      return;
    }

    if (data.startsWith('admin:subs:')) {
      const page = parseInt(data.split(':')[2]) || 0;
      const { subs, total } = await getSubscriptions(page, 8);

      if (subs.length === 0) {
        return bot.sendMessage(chatId, '📭 No paid subscriptions.');
      }

      let text = `<b>💎 Subscriptions</b> (page ${page + 1}, total: ${total})\n\n`;
      subs.forEach((s, i) => {
        const expiry = s.endDate ? new Date(s.endDate).toLocaleDateString('en-KE') : 'N/A';
        text += `${page * 8 + i + 1}. <code>${s.user.telegramId}</code>\n`;
        text += `   Plan: ${s.plan} | Status: ${s.status} | Exp: ${expiry}\n\n`;
      });

      const navButtons = [];
      if (page > 0) navButtons.push({ text: '⬅ Prev', callback_data: `admin:subs:${page - 1}` });
      if ((page + 1) * 8 < total) navButtons.push({ text: 'Next ➡', callback_data: `admin:subs:${page + 1}` });

      bot.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: navButtons.length ? [navButtons] : [] },
      });
      return;
    }

    if (data.startsWith('admin:logs:')) {
      const page = parseInt(data.split(':')[2]) || 0;
      const logs = await getLogs(page, 10);

      if (logs.length === 0) {
        return bot.sendMessage(chatId, '📭 No logs.');
      }

      let text = `<b>📋 Logs</b> (page ${page + 1})\n\n`;
      logs.forEach((l) => {
        const d = new Date(l.createdAt).toLocaleString('en-KE');
        text += `[${l.level}] ${l.action}\n${l.details || ''}\n<i>${d}</i>\n\n`;
      });

      const navButtons = [{ text: 'Refresh', callback_data: `admin:logs:${page}` }];
      if (page > 0) navButtons.push({ text: '⬅ Prev', callback_data: `admin:logs:${page - 1}` });
      navButtons.push({ text: 'Next ➡', callback_data: `admin:logs:${page + 1}` });

      bot.sendMessage(chatId, text.slice(0, 4000), {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [navButtons] },
      });
      return;
    }

    if (data === 'admin:upgrade_prompt') {
      return bot.sendMessage(
        chatId,
        '⬆️ <b>Manual Upgrade</b>\n\nFormat:\n<code>/adminupgrade [telegramId] [PLAN_5|PLAN_10|PLAN_20|UNLIMITED]</code>',
        { parse_mode: 'HTML' }
      );
    }

    if (data === 'admin:downgrade_prompt') {
      return bot.sendMessage(
        chatId,
        '⬇️ <b>Manual Downgrade</b>\n\nFormat:\n<code>/admindowngrade [telegramId]</code>',
        { parse_mode: 'HTML' }
      );
    }

    if (data === 'admin:broadcast') {
      return bot.sendMessage(
        chatId,
        '📢 <b>Broadcast Message</b>\n\nFormat:\n<code>/broadcast Your message here</code>',
        { parse_mode: 'HTML' }
      );
    }

    if (data === 'admin:coupons') {
      const coupons = await getCoupons();
      if (coupons.length === 0) {
        return bot.sendMessage(
          chatId,
          '🎟️ <b>No coupons yet.</b>\n\nCreate one:\n<code>/coupon create CODE 20 5 30</code>\n(code discount% maxUses expiresInDays)',
          {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: '➕ Create Coupon', style: 'success', callback_data: 'admin:coupon_help' }]] },
          }
        );
      }

      let text = '🎟️ <b>Active Coupons:</b>\n\n';
      coupons.forEach((c) => {
        const exp = c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('en-KE') : 'Never';
        text += `<code>${c.code}</code> — ${c.discount}% off\n`;
        text += `   Uses: ${c.usesCount}/${c.maxUses} | Exp: ${exp} | ${c.isActive ? '✅' : '❌'}\n\n`;
      });

      bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
      return;
    }

    if (data === 'admin:coupon_help') {
      return bot.sendMessage(
        chatId,
        '🎟️ <b>Create Coupon:</b>\n\n<code>/coupon create CODE DISCOUNT% MAXUSES EXPIRES_DAYS</code>\n\nExample:\n<code>/coupon create SAVE20 20 50 30</code>',
        { parse_mode: 'HTML' }
      );
    }
  });

  // ─── /pair ──────────────────────────────────────────────────────────────────
  bot.onText(/\/pair (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const phoneNumber = match[1];

    if (settings.premiumOnly && !isOwner(userId)) {
      const { effectivePlan } = await getSubStatus(userId);
      if (effectivePlan === 'FREE') {
        return bot.sendMessage(chatId, '❌ Pairing is available to premium users only.');
      }
    }

    const validNumber = validatePhoneNumber(phoneNumber);
    if (!validNumber) {
      return bot.sendMessage(chatId, '❌ Invalid phone number.\n\n<b>Usage:</b> /pair 254785016388', {
        parse_mode: 'HTML',
      });
    }

    const currentSessions = loadJSON('./database/paired.json', []);
    const existingSession = currentSessions.find(s => s.number === validNumber);
    if (existingSession) {
      return bot.sendMessage(chatId, '⚠️ This number is already paired.');
    }

    await getOrCreateUser(userId, msg.from.username, msg.from.first_name);
    const canAdd = await canAddDevice(userId);

    if (!canAdd && !isOwner(userId)) {
      const { maxDevices } = await getSubStatus(userId);
      return bot.sendMessage(
        chatId,
        `
⚠️ <b>Device Limit Reached</b>

Your current plan only allows <b>${maxDevices}</b> WhatsApp number(s).

Upgrade your subscription to connect more devices.
        `.trim(),
        {
          parse_mode: 'HTML',
          reply_markup: buildDeviceLimitKeyboard(),
        }
      );
    }

    bot.sendMessage(chatId, '⏳ Generating pairing code...');

    try {
      const WAConnection = require('./whatsapp');
      const code = await WAConnection.requestPairingCode(validNumber, userId);

      if (code) {
        const formattedCode = formatPairingCode(code);
        pairingCodes.set(formattedCode, { count: 0, phoneNumber: validNumber, userId });

        const text = `
<b>📱 Pairing Code</b>

Number: <code>${validNumber}</code>
Code: <code>${formattedCode}</code>

Open WhatsApp → Linked Devices → Pair, then enter the code.
Valid for 1 hour.
        `.trim();

        bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
        syncSessionToDb(userId, validNumber, 'ACTIVE').catch(() => {});
      }
    } catch (error) {
      console.error('Pairing error:', error);
      bot.sendMessage(chatId, '❌ Failed to generate code. Try again later.');
    }
  });

  // ─── /delpair ──────────────────────────────────────────────────────────────
  bot.onText(/\/delpair (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const phoneNumber = match[1];

    const validNumber = validatePhoneNumber(phoneNumber);
    if (!validNumber) {
      return bot.sendMessage(chatId, '❌ Invalid phone number.');
    }

    let currentSessions = loadJSON('./database/paired.json', []);
    const sessionIndex = currentSessions.findIndex(
      s => s.number === validNumber && (String(s.userId) === String(userId) || isOwner(userId))
    );

    if (sessionIndex === -1) {
      return bot.sendMessage(chatId, '❌ Session not found or no permission.');
    }

    const sessionPath = `./database/sessions/${validNumber}`;
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
    }

    try {
      const WAConnection = require('./whatsapp');
      const conn = WAConnection.activeSessions.get(validNumber);
      if (conn) conn.end();
      WAConnection.activeSessions.delete(validNumber);
    } catch {}

    currentSessions.splice(sessionIndex, 1);
    saveJSON('./database/paired.json', currentSessions);

    bot.sendMessage(chatId, `✅ Session deleted: <code>${validNumber}</code>`, { parse_mode: 'HTML' });
  });

  // ─── /listpaired ───────────────────────────────────────────────────────────
  bot.onText(/\/listpaired/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isOwner(userId)) {
      return bot.sendMessage(chatId, '❌ Owner only.');
    }

    const currentSessions = loadJSON('./database/paired.json', []);
    if (currentSessions.length === 0) {
      return bot.sendMessage(chatId, '📭 No paired sessions.');
    }

    let text = '<b>📱 All Sessions</b>\n\n';
    currentSessions.forEach((session, i) => {
      text += `<b>${i + 1}.</b> <code>${session.number}</code>\n`;
      text += `   User: <code>${session.userId}</code>\n`;
      text += `   Status: ${session.active !== false ? '🟢 Active' : '🔴 Inactive'}\n\n`;
    });
    text += `<b>Total:</b> ${currentSessions.length}`;

    bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
  });

  // ─── /listsessions ─────────────────────────────────────────────────────────
  bot.onText(/\/listsessions/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    const currentSessions = loadJSON('./database/paired.json', []);
    const userSessions = currentSessions.filter(s => String(s.userId) === String(userId));

    if (userSessions.length === 0) {
      return bot.sendMessage(chatId, '📭 No sessions found.');
    }

    let text = '<b>📱 Your Sessions</b>\n\n';
    userSessions.forEach((session, i) => {
      text += `<b>${i + 1}.</b> <code>${session.number}</code>\n`;
      text += `   Status: ${session.active !== false ? '🟢 Active' : '🔴 Inactive'}\n\n`;
    });
    text += `<b>Total:</b> ${userSessions.length}`;

    bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
  });

  // ─── /mydevices ────────────────────────────────────────────────────────────
  bot.onText(/\/mydevices/, async (msg) => {
    await handleMyDevices(bot, msg.chat.id, msg.from.id);
  });

  // ─── /subscription ─────────────────────────────────────────────────────────
  bot.onText(/\/subscription/, async (msg) => {
    await getOrCreateUser(msg.from.id, msg.from.username, msg.from.first_name);
    await handleSubscriptionMenu(bot, msg.chat.id, msg.from.id);
  });

  // ─── /verify ───────────────────────────────────────────────────────────────
  bot.onText(/\/verify (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const reference = match[1].trim();

    await getOrCreateUser(userId, msg.from.username, msg.from.first_name);
    await handleVerifyPayment(bot, chatId, userId, reference);
  });

  // ─── /myid ─────────────────────────────────────────────────────────────────
  bot.onText(/\/myid/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || 'No username';
    const firstName = msg.from.first_name || 'Unknown';

    const { effectivePlan } = await getSubStatus(userId);

    const text = `
<b>👤 Your Info</b>

🆔 User ID: <code>${userId}</code>
👤 Username: @${username}
📛 Name: ${firstName}
📦 Plan: ${effectivePlan.replace('_', ' ')}
👑 Role: ${isOwner(userId) ? 'Owner' : 'User'}
    `.trim();

    bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
  });

  // ─── /groups (owner) — list captured groups + required gate config ─────────
  bot.onText(/\/groups/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId)) return bot.sendMessage(chatId, '❌ Owner only.');

    const seen = gate.seenGroups || {};
    const seenLines = Object.values(seen)
      .map((g) => `<code>${g.id}</code> | ${g.title || '(no title)'}`)
      .join('\n') || 'No groups captured yet.';
    const reqLines = gate.REQUIRED_GROUPS
      .map((g) => `• ${g.title}: <code>${g.id || '(not configured)'}</code>`)
      .join('\n');

    bot.sendMessage(
      chatId,
      `<b>📡 Captured groups</b>\n${seenLines}\n\n<b>🔒 Required for the gate</b>\n${reqLines}`,
      { parse_mode: 'HTML' }
    );
  });

  // ─── /setgroup (owner) — configure the private group's numeric chat ID ─────
  bot.onText(/\/setgroup (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId)) return bot.sendMessage(chatId, '❌ Owner only.');

    const r = gate.setPrivateGroupId(match[1].trim());
    if (!r.ok) return bot.sendMessage(chatId, `❌ ${r.error}`);

    const lines = r.required
      .map((g) => `• ${g.title}: <code>${g.id || '(not configured)'}</code>`)
      .join('\n');
    bot.sendMessage(
      chatId,
      `✅ Private group ID saved.\n\n<b>🔒 Required groups now:</b>\n${lines}`,
      { parse_mode: 'HTML' }
    );
  });

  // ─── /admin ────────────────────────────────────────────────────────────────
  bot.onText(/\/admin/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isOwner(userId)) {
      return bot.sendMessage(chatId, '❌ Admin only.');
    }

    await sendAdminPanel(bot, chatId);
  });

  // ─── /adminupgrade ─────────────────────────────────────────────────────────
  bot.onText(/\/adminupgrade (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isOwner(userId)) return bot.sendMessage(chatId, '❌ Owner only.');

    const parts = match[1].trim().split(' ');
    if (parts.length < 2) {
      return bot.sendMessage(chatId, '❌ Usage: /adminupgrade [telegramId] [PLAN_5|PLAN_10|PLAN_20|UNLIMITED]');
    }

    const targetId = parseInt(parts[0]);
    const planKey = parts[1].toUpperCase();

    if (isNaN(targetId)) return bot.sendMessage(chatId, '❌ Invalid Telegram ID.');
    if (!PLANS[planKey]) return bot.sendMessage(chatId, `❌ Invalid plan! Choose: ${Object.keys(PLANS).join(', ')}`);

    const result = await adminUpgrade(targetId, planKey);
    if (result.success) {
      bot.sendMessage(chatId, `✅ Upgraded <code>${targetId}</code> to <b>${PLANS[planKey].name}</b>`, {
        parse_mode: 'HTML',
      });
      try {
        bot.sendMessage(
          targetId,
          `✅ <b>Your subscription has been upgraded.</b>\n\n📦 Plan: <b>${PLANS[planKey].name}</b>\n📱 Devices: <b>${PLANS[planKey].maxDevices === 999 ? 'Unlimited' : PLANS[planKey].maxDevices}</b>\n⏳ Valid: 30 days`,
          { parse_mode: 'HTML' }
        );
      } catch {}
    } else {
      bot.sendMessage(chatId, `❌ Upgrade failed: ${result.error}`);
    }
  });

  // ─── /admindowngrade ───────────────────────────────────────────────────────
  bot.onText(/\/admindowngrade (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isOwner(userId)) return bot.sendMessage(chatId, '❌ Owner only.');

    const targetId = parseInt(match[1].trim());
    if (isNaN(targetId)) return bot.sendMessage(chatId, '❌ Invalid Telegram ID.');

    const result = await adminDowngrade(targetId);
    if (result.success) {
      bot.sendMessage(chatId, `✅ Downgraded <code>${targetId}</code> to Free plan.`, { parse_mode: 'HTML' });
    } else {
      bot.sendMessage(chatId, `❌ Downgrade failed: ${result.error || 'Unknown error'}`);
    }
  });

  // ─── /addprem ──────────────────────────────────────────────────────────────
  bot.onText(/\/addprem (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isOwner(userId)) return bot.sendMessage(chatId, '❌ Owner only.');

    const targetId = parseInt(match[1]);
    if (isNaN(targetId)) {
      return bot.sendMessage(chatId, '❌ Invalid user ID.\n\n<b>Usage:</b> /addprem 123456789', {
        parse_mode: 'HTML',
      });
    }

    await getOrCreateUser(targetId);
    const result = await adminUpgrade(targetId, 'PLAN_5');
    if (result.success) {
      bot.sendMessage(chatId, `✅ Added premium (5 devices) to: <code>${targetId}</code>`, {
        parse_mode: 'HTML',
      });
    } else {
      bot.sendMessage(chatId, `❌ Failed: ${result.error}`);
    }
  });

  // ─── /delprem ──────────────────────────────────────────────────────────────
  bot.onText(/\/delprem (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isOwner(userId)) return bot.sendMessage(chatId, '❌ Owner only.');

    const targetId = parseInt(match[1]);
    if (isNaN(targetId)) return bot.sendMessage(chatId, '❌ Invalid user ID.');

    const result = await adminDowngrade(targetId);
    if (result.success) {
      bot.sendMessage(chatId, `✅ Removed premium from: <code>${targetId}</code>`, { parse_mode: 'HTML' });
    } else {
      bot.sendMessage(chatId, `❌ Failed: ${result.error || 'User not found'}`);
    }
  });

  // ─── /premium on|off ──────────────────────────────────────────────────────
  bot.onText(/\/premium (on|off)/, (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isOwner(userId)) return bot.sendMessage(chatId, '❌ Owner only.');

    const mode = match[1];
    settings.premiumOnly = mode === 'on';
    saveJSON('./database/settings.json', settings);

    const status = mode === 'on' ? '🔒 ON' : '🔓 OFF';
    logSystem(`Premium Mode: ${status}`, 'success');
    bot.sendMessage(chatId, `✅ Premium mode: ${status}`);
  });

  // ─── /public on|off ──────────────────────────────────────────────────────
  bot.onText(/\/public (on|off)/, (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isOwner(userId)) return bot.sendMessage(chatId, '❌ Owner only.');

    const mode = match[1];
    settings.publicMode = mode === 'on';
    settings.selfMode = false;
    saveJSON('./database/settings.json', settings);

    const status = mode === 'on' ? '🌍 PUBLIC' : '🔒 PRIVATE';
    logSystem(`Public Mode: ${status}`, 'success');
    bot.sendMessage(chatId, `✅ Bot mode: ${status}`);
  });

  // ─── /self on|off ──────────────────────────────────────────────────────
  bot.onText(/\/self (on|off)/, (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isOwner(userId)) return bot.sendMessage(chatId, '❌ Owner only.');

    const mode = match[1];
    settings.selfMode = mode === 'on';
    if (mode === 'on') settings.publicMode = false;
    saveJSON('./database/settings.json', settings);

    const status = mode === 'on' ? '👤 SELF ONLY' : '🌍 PUBLIC';
    logSystem(`Self Mode: ${status}`, 'success');
    bot.sendMessage(chatId, `✅ Bot mode: ${status}`);
  });

  // ─── /broadcast ────────────────────────────────────────────────────────────
  bot.onText(/\/broadcast (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isOwner(userId)) return bot.sendMessage(chatId, '❌ Owner only.');

    const message = match[1];
    const prisma = require('./lib/prismaClient');

    try {
      const users = await prisma.user.findMany({ select: { telegramId: true } });
      let sent = 0;
      let failed = 0;

      for (const u of users) {
        try {
          // Send from ALL bots or just this one?
          // Option: Send from current bot
          await bot.sendMessage(Number(u.telegramId), `📢 <b>Broadcast from MZAZI TECH QUARTZ BOT:</b>\n\n${message}`, {
            parse_mode: 'HTML',
          });
          sent++;
          await new Promise(r => setTimeout(r, 50));
        } catch {
          failed++;
        }
      }

      bot.sendMessage(chatId, `✅ Broadcast complete.\n\nSent: ${sent}\nFailed: ${failed}`);
    } catch (err) {
      bot.sendMessage(chatId, `❌ Broadcast failed: ${err.message}`);
    }
  });

  // ─── /coupon ───────────────────────────────────────────────────────────────
  bot.onText(/\/coupon (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isOwner(userId)) return bot.sendMessage(chatId, '❌ Owner only.');

    const args = match[1].trim().split(' ');
    const action = args[0];

    if (action === 'create') {
      const [, code, discount, maxUses, expiresInDays] = args;
      if (!code || !discount) {
        return bot.sendMessage(chatId, '❌ Usage: /coupon create CODE DISCOUNT% [MAXUSES] [EXPIRES_DAYS]');
      }
      const result = await createCoupon(code, parseFloat(discount), parseInt(maxUses) || 1, parseInt(expiresInDays) || null);
      if (result.success) {
        bot.sendMessage(chatId, `✅ Coupon created: <code>${result.coupon.code}</code>\n${discount}% off | Max ${result.coupon.maxUses} uses`, {
          parse_mode: 'HTML',
        });
      } else {
        bot.sendMessage(chatId, `❌ Failed: ${result.error}`);
      }
    } else if (action === 'delete') {
      const code = args[1];
      if (!code) return bot.sendMessage(chatId, '❌ Usage: /coupon delete CODE');
      const result = await deleteCoupon(code);
      if (result.success) {
        bot.sendMessage(chatId, `✅ Coupon deleted: <code>${code.toUpperCase()}</code>`, { parse_mode: 'HTML' });
      } else {
        bot.sendMessage(chatId, `❌ Failed: ${result.error}`);
      }
    } else if (action === 'list') {
      const coupons = await getCoupons();
      if (!coupons.length) return bot.sendMessage(chatId, '📭 No coupons.');
      let text = '🎟️ <b>Coupons:</b>\n\n';
      coupons.forEach(c => {
        text += `<code>${c.code}</code> — ${c.discount}% | ${c.usesCount}/${c.maxUses} uses\n`;
      });
      bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
    } else {
      bot.sendMessage(chatId, '❌ Usage: /coupon create|delete|list ...');
    }
  });

  // ─── /help ─────────────────────────────────────────────────────────────────
  bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const helpText = `
<b>📋 Commands</b>

<b>General</b>
/start — Main menu
/myid — Your profile
/help — This message

<b>Pairing</b>
/pair [number] — Pair a device
/delpair [number] — Remove a device
/listsessions — Your sessions
/mydevices — Manage devices

<b>Subscription</b>
/subscription — Plan and status
/verify [ref] — Verify a payment

<b>Owner only</b>
/admin — Admin panel
/adminupgrade [id] [plan] — Upgrade a user
/admindowngrade [id] — Downgrade a user
/addprem [id] — Grant premium (5 devices)
/delprem [id] — Revoke premium
/premium on|off — Toggle premium-only mode
/listpaired — All sessions
/broadcast [msg] — Send a broadcast
/coupon create|delete|list — Manage coupons
    `.trim();

    bot.sendMessage(chatId, helpText, { parse_mode: 'HTML' });
  });

  console.log(`✅ Bot ${botIndex + 1} handlers setup complete`);
}

// ─── APPLY HANDLERS TO ALL BOTS ─────────────────────────────────────────────
bots.forEach((bot, index) => {
  setupBotHandlers(bot, index);
});

// ─── Startup ──────────────────────────────────────────────────────────────────
logBanner();
logSystem(`Telegram Bot Online - ${bots.length} bots running`, 'success');

// ─── Auto-migrate: ensure Neon DB tables exist ──────────────────────────────
(async () => {
  try {
    if (!process.env.DATABASE_URL) {
      logSystem('DATABASE_URL not set — skipping DB migration. Subscription features will not work.', 'warn');
    } else {
      // SAFETY: this database is SHARED with the mzazi.shop website. `prisma db
      // push` (especially --accept-data-loss) DROPS every table that isn't in the
      // Prisma schema — bot_commands, bot_config, packages, endpoints, providers…
      // wiping the website's data on every bot start. Only non-destructive
      // migrations are allowed here.
      logSystem('Checking database schema (prisma migrate deploy)...', 'info');
      const { execSync } = require('child_process');
      try {
        execSync('npx prisma migrate deploy --skip-generate', {
          stdio: 'inherit',
          timeout: 60000,
        });
        logSystem('Database migration complete ✓', 'success');
      } catch (migrateErr) {
        logSystem(`migrate deploy skipped (no migrations): ${String(migrateErr.message).split('\n')[0]}`, 'warn');
        logSystem('Bot will continue with existing tables. Never run "prisma db push" on this shared database.', 'warn');
      }
    }
  } catch (err) {
    logSystem(`DB migration warning: ${err.message}`, 'warn');
    logSystem('Bot will continue — but subscription/payment features need a valid DATABASE_URL.', 'warn');
  }
})();

// Start webhook server (for Paystack)
const webhookPort = config.webhookPort || 3000;
startWebhookServer(bots, webhookPort);

// Start cron jobs (subscription expiry)
startCronJobs(bots);

// Load existing WhatsApp sessions
setTimeout(async () => {
  logSystem('Loading existing WhatsApp sessions...', 'info');
  try {
    const WAConnection = require('./whatsapp');
    await WAConnection.loadExistingSessions();
  } catch (error) {
    logSystem(`WhatsApp layer unavailable: ${error.message}`, 'error');
  }
}, 3000);

// ─── Export all bots for other modules ──────────────────────────────────────
module.exports = { bots, pairingCodes, settings, saveData };