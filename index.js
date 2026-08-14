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
// Syncs the website-defined commands at boot, every 30 minutes, and
// automatically within ~15s whenever the admin edits them (botTelemetry).
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
const panelBuy = require('./lib/panelBuy');
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

// ─── Panel purchase state machine (per chat) ─────────────────────────────────
// { step, username, password, nests, nestId, nestName, eggs, eggId, eggName,
//   pkgs, pkg, ref }
const panelBuyStates = new Map();

function fmtRam(v) { const n = parseInt(v); return n === 0 ? 'Unlimited' : n >= 1024 ? `${n / 1024}GB` : `${n}MB`; }
function fmtDisk(v) { const n = parseInt(v); return n === 0 ? 'Unlimited' : n >= 1024 ? `${n / 1024}GB` : `${n}GB`; }

async function startPanelBuy(bot, chatId, userId) {
  try {
    await getOrCreateUser(userId);
  } catch {}
  panelBuyStates.set(chatId, { step: 'username' });
  return bot.sendMessage(
    chatId,
    '🖥 <b>Buy Panel Server</b>\n\n<b>Step 1/6</b> — Enter the <b>username</b> you want for the panel (3–20 letters/numbers/_):\n\n<i>Send /cancelpanel to abort.</i>',
    { parse_mode: 'HTML' }
  );
}

async function handlePanelBuyStep(bot, chatId, userId, text) {
  const state = panelBuyStates.get(chatId);
  if (!state) return;
  try {
    switch (state.step) {
      case 'username': {
        const username = text.trim().replace(/\s+/g, '_');
        if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
          return bot.sendMessage(chatId, '❌ Username must be 3–20 letters, numbers or underscores. Try again:');
        }
        state.username = username;
        state.step = 'password';
        return bot.sendMessage(chatId, '✅ Username set.\n\n<b>Step 2/6</b> — Enter the <b>password</b> for the panel (min 6 characters):', { parse_mode: 'HTML' });
      }

      case 'password': {
        if (text.length < 6) return bot.sendMessage(chatId, '❌ Password must be at least 6 characters. Try again:');
        state.password = text;
        state.step = 'nest';
        const nests = await panelBuy.getNests();
        if (!nests.length) {
          panelBuyStates.delete(chatId);
          return bot.sendMessage(chatId, '❌ No nests available right now. Try again later.');
        }
        state.nests = nests;
        return bot.sendMessage(chatId, '✅ Password set.\n\n<b>Step 3/6</b> — Choose a <b>nest</b>:', {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: nests.map((n, i) => [{ text: `🏗 ${n.name}`, callback_data: `pnl_nest:${i}` }]) },
        });
      }

      case 'nest': {
        const idx = parseInt(text, 10) - 1;
        const nest = state.nests && state.nests[idx];
        if (!nest) return bot.sendMessage(chatId, '❌ Invalid choice. Tap a nest button instead:');
        return chooseNest(bot, chatId, userId, nest, state);
      }

      case 'egg': {
        const idx = parseInt(text, 10) - 1;
        const egg = state.eggs && state.eggs[idx];
        if (!egg) return bot.sendMessage(chatId, '❌ Invalid choice. Tap an egg button instead:');
        return chooseEgg(bot, chatId, userId, egg, state);
      }

      case 'package': {
        const idx = parseInt(text, 10) - 1;
        const pkg = state.pkgs && state.pkgs[idx];
        if (!pkg) return bot.sendMessage(chatId, '❌ Invalid choice. Tap a package button instead:');
        return choosePackage(bot, chatId, userId, pkg, state);
      }

      case 'confirm': {
        if (!/^(yes|y|sure|ok)$/i.test(text.trim())) {
          return bot.sendMessage(chatId, '❌ Tap <b>✅ Yes</b> to proceed or <i>/cancelpanel</i> to cancel.', { parse_mode: 'HTML' });
        }
        return proceedToPayment(bot, chatId, userId);
      }

      default:
        return;
    }
  } catch (e) {
    console.error('Panel buy step error:', e.message);
    return bot.sendMessage(chatId, `❌ Something went wrong: ${e.message}`);
  }
}

// ─── Button helpers for the panel flow ───────────────────────────────────────
async function chooseNest(bot, chatId, userId, nest, state) {
  state.nestId = nest.id;
  state.nestName = nest.name;
  state.eggs = nest.eggs || [];
  state.step = 'egg';
  if (!state.eggs.length) {
    panelBuyStates.delete(chatId);
    return bot.sendMessage(chatId, `❌ Nest "${nest.name}" has no eggs.`);
  }
  return bot.sendMessage(chatId, `✅ Nest: <b>${nest.name}</b>\n\n<b>Step 4/6</b> — Choose an <b>egg</b>:`, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: state.eggs.map((e, i) => [{ text: `🥚 ${e.name}`, callback_data: `pnl_egg:${i}` }]) },
  });
}

async function chooseEgg(bot, chatId, userId, egg, state) {
  state.eggId = egg.id;
  state.eggName = egg.name;
  state.step = 'package';
  const pkgs = await panelBuy.getPackages();
  if (!pkgs.length) {
    panelBuyStates.delete(chatId);
    return bot.sendMessage(chatId, '❌ No packages available right now.');
  }
  state.pkgs = pkgs;
  return bot.sendMessage(chatId, `✅ Egg: <b>${egg.name}</b>\n\n<b>Step 5/6</b> — Choose a <b>package</b>:`, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: pkgs.map((p, i) => [{ text: `📦 ${p.name} — KES ${Number(p.price).toLocaleString()}`, callback_data: `pnl_pkg:${i}` }]) },
  });
}

async function choosePackage(bot, chatId, userId, pkg, state) {
  state.pkg = pkg;
  state.step = 'confirm';
  return bot.sendMessage(
    chatId,
    `🛒 <b>Confirm your order</b>\n\n👤 Username: <code>${state.username}</code>\n🔐 Password: <code>${state.password}</code>\n🏗 Nest: <b>${state.nestName}</b>\n🥚 Egg: <b>${state.eggName}</b>\n📦 Package: <b>${pkg.name}</b>\n💰 Price: <b>KES ${Number(pkg.price).toLocaleString()}</b>`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Yes — Proceed to Pay', callback_data: 'pnl_yes' }, { text: '🚫 Cancel', callback_data: 'pnl_no' }],
        ],
      },
    }
  );
}

async function proceedToPayment(bot, chatId, userId) {
  const state = panelBuyStates.get(chatId);
  if (!state || !state.pkg) return bot.sendMessage(chatId, '❌ No active panel order. Start with /buypanel.');
  try {
    const user = await getOrCreateUser(userId);
    const pay = await panelBuy.initializePanelPayment(state.pkg, userId, user);
    state.ref = pay.reference;
    state.step = 'paying';
    return bot.sendMessage(
      chatId,
      `💳 <b>Pay KES ${Number(state.pkg.price).toLocaleString()}</b>\n\nClick the link below and complete the payment, then tap the confirm button:\n\n<a href="${pay.url}">💳 Pay Now</a>\n\n<i>Reference: <code>${pay.reference}</code></i>`,
      {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '✅ I have paid — Confirm', callback_data: 'pnl_confirm' }]] },
      }
    );
  } catch (e) {
    console.error('Proceed to payment error:', e.message);
    return bot.sendMessage(chatId, `❌ ${e.message}`);
  }
}

async function confirmPayment(bot, chatId, userId) {
  const state = panelBuyStates.get(chatId);
  if (!state || state.step !== 'paying' || !state.ref) {
    return bot.sendMessage(chatId, '❌ No pending panel payment found. Start with /buypanel.');
  }
  try {
    const verif = await panelBuy.verifyPanelPayment(state.ref);
    if (verif.status !== 'success') {
      return bot.sendMessage(chatId, `⏳ Payment not confirmed yet (status: ${verif.status}). Paid? Try again in a few seconds.`);
    }
    await bot.sendMessage(chatId, '✅ Payment confirmed! 🛠 Creating your panel…');
    const panel = await panelBuy.createPanel({
      username: state.username,
      password: state.password,
      pkg: state.pkg,
      nestId: state.nestId,
      eggId: state.eggId,
      telegramId: userId,
    });
    panelBuyStates.delete(chatId);
    return bot.sendMessage(
      chatId,
      `🎉 <b>Panel created successfully!</b>\n\n🔗 <b>Panel:</b> <a href="${panel.panel_url}">${panel.panel_url}</a>\n👤 <b>Username:</b> <code>${panel.username}</code>\n🔐 <b>Password:</b> <code>${panel.password}</code>\n📦 <b>Package:</b> ${panel.package}\n\n<i>Save these details and log in at the panel URL above.</i>`,
      { parse_mode: 'HTML' }
    );
  } catch (e) {
    console.error('Confirm panel error:', e.message);
    return bot.sendMessage(chatId, `❌ Panel creation failed: ${e.message}`);
  }
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

  // ─── /start ────────────────────────────────────────────────────────────────
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

    // ─── 🖥 Panel purchase flow (active multi-step session) ───────────────────
    if (panelBuyStates.has(chatId)) {
      return handlePanelBuyStep(bot, chatId, userId, text);
    }

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
      return startPanelBuy(bot, chatId, userId);
    }
  });

  // ─── /buypanel — start the panel purchase flow ─────────────────────────────
  bot.onText(/\/buypanel/, async (msg) => {
    await startPanelBuy(bot, msg.chat.id, msg.from.id);
  });

  // ─── /cancelpanel — abort the flow ─────────────────────────────────────────
  bot.onText(/\/cancelpanel/, async (msg) => {
    panelBuyStates.delete(msg.chat.id);
    bot.sendMessage(msg.chat.id, '🚫 Panel purchase cancelled.');
  });

  // ─── /confirmpanel — verify payment, create the panel, send details ────────
  bot.onText(/\/confirmpanel/, async (msg) => {
    await confirmPayment(bot, msg.chat.id, msg.from.id);
  });

  // ─── callback_query handler ────────────────────────────────────────────────
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;

    bot.answerCallbackQuery(query.id).catch(() => {});

    // ─── Panel purchase (buttons) ──────────────────────────────────────────────
    if (data.startsWith('pnl_')) {
      const state = panelBuyStates.get(chatId);
      if (!state) return bot.sendMessage(chatId, '⚠ No active panel order. Start with /buypanel.');

      // Tap = the old buttons message disappears, then the next step appears.
      const cleanup = () => {
        try { return bot.deleteMessage(chatId, query.message.message_id); } catch { return Promise.resolve(); }
      };

      if (data.startsWith('pnl_nest:')) {
        const nest = state.nests && state.nests[parseInt(data.split(':')[1], 10)];
        if (!nest) return bot.sendMessage(chatId, '❌ Invalid nest.');
        await cleanup();
        return chooseNest(bot, chatId, userId, nest, state);
      }
      if (data.startsWith('pnl_egg:')) {
        const egg = state.eggs && state.eggs[parseInt(data.split(':')[1], 10)];
        if (!egg) return bot.sendMessage(chatId, '❌ Invalid egg.');
        await cleanup();
        return chooseEgg(bot, chatId, userId, egg, state);
      }
      if (data.startsWith('pnl_pkg:')) {
        const pkg = state.pkgs && state.pkgs[parseInt(data.split(':')[1], 10)];
        if (!pkg) return bot.sendMessage(chatId, '❌ Invalid package.');
        await cleanup();
        return choosePackage(bot, chatId, userId, pkg, state);
      }
      if (data === 'pnl_yes') {
        await cleanup();
        return proceedToPayment(bot, chatId, userId);
      }
      if (data === 'pnl_no') {
        await cleanup();
        panelBuyStates.delete(chatId);
        return bot.sendMessage(chatId, '🚫 Panel purchase cancelled.');
      }
      if (data === 'pnl_confirm') {
        await cleanup();
        return confirmPayment(bot, chatId, userId);
      }
      return;
    }

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