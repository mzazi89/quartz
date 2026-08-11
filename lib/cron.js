// ─────────────────────────────────────────────────────────────────────────────
// Cron Jobs
// Runs every hour to check and expire subscriptions.
// ─────────────────────────────────────────────────────────────────────────────
const cron = require('node-cron');
const prisma = require('./prismaClient');
const { downgradeToFree, addLog } = require('./subscription');
const { logSystem } = require('../helper/logger');

let telegramBot = null;

// ─── Set bot reference for notifications ─────────────────────────────────────
function setBotRef(bot) {
  telegramBot = bot;
}

// ─── Notify user via Telegram ────────────────────────────────────────────────
async function notifyUser(telegramId, message) {
  if (!telegramBot) return;
  try {
    await telegramBot.sendMessage(Number(telegramId), message, { parse_mode: 'HTML' });
  } catch (err) {
    logSystem(`Notify user ${telegramId} failed: ${err.message}`, 'error');
  }
}

// ─── Check and expire subscriptions ──────────────────────────────────────────
async function checkExpiredSubscriptions() {
  try {
    logSystem('Running subscription expiry check...', 'info');

    const now = new Date();
    const expiredSubs = await prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        plan: { not: 'FREE' },
        endDate: { lte: now },
      },
      include: { user: true },
    });

    if (expiredSubs.length === 0) {
      logSystem('No expired subscriptions found.', 'info');
      return;
    }

    logSystem(`Found ${expiredSubs.length} expired subscription(s). Processing...`, 'info');

    for (const sub of expiredSubs) {
      const telegramId = Number(sub.user.telegramId);

      await downgradeToFree(telegramId);
      await addLog(telegramId, 'SUBSCRIPTION_EXPIRED', `Plan ${sub.plan} expired`, 'INFO');

      const expiredMsg = `
╔═══════════════════════════╗
║   ⚠️  SUBSCRIPTION EXPIRED  ║
╚═══════════════════════════╝

Your <b>${sub.plan.replace('_', ' ')}</b> subscription has expired.

You have been downgraded to the <b>Free Plan</b>.

━━━━━━ FREE PLAN LIMITS ━━━━━━

• Max Devices: <b>1</b>
• Extra devices have been removed automatically.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💳 Tap <b>Subscription</b> in the menu to renew and restore all your devices!

MZAZI TECH QUARTZ BOT • Mzazi Systems Online
      `.trim();

      await notifyUser(telegramId, expiredMsg);
      logSystem(`Expired & notified user: ${telegramId}`, 'success');
    }
  } catch (err) {
    logSystem(`checkExpiredSubscriptions error: ${err.message}`, 'error');
  }
}

// ─── Start all cron jobs ──────────────────────────────────────────────────────
function startCronJobs(bot) {
  setBotRef(bot);

  // Run every hour at minute 0
  cron.schedule('0 * * * *', () => {
    checkExpiredSubscriptions();
  });

  logSystem('Cron jobs started (subscription expiry: every hour)', 'success');
}

module.exports = { startCronJobs, checkExpiredSubscriptions };
