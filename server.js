// ─────────────────────────────────────────────────────────────────────────────
// Webhook Server — Express HTTP server for Paystack payment webhooks.
// Runs alongside the Telegram bot polling.
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const crypto = require('crypto');
const { logSystem } = require('./helper/logger');
const { verifyWebhookSignature, handleWebhookEvent } = require('./lib/payment');

let telegramBot = null;

function setBot(bot) {
  telegramBot = bot;
}

async function notifyUser(telegramId, message) {
  if (!telegramBot || !telegramId) return;
  try {
    await telegramBot.sendMessage(Number(telegramId), message, { parse_mode: 'HTML' });
  } catch {}
}

function createWebhookServer() {
  const app = express();

  // Parse raw body for signature verification
  app.use('/webhook/paystack', express.raw({ type: 'application/json' }));
  app.use(express.json());

  // ─── Health check ──────────────────────────────────────────────────────────
  app.get('/health', (req, res) => {
    res.json({ status: 'OK', service: 'MZAZI TECH QUARTZ BOT', time: new Date().toISOString() });
  });

  // ─── Paystack webhook ──────────────────────────────────────────────────────
  app.post('/webhook/paystack', async (req, res) => {
    try {
      const signature = req.headers['x-paystack-signature'];
      const rawBody = req.body; // Buffer because of express.raw()

      if (!verifyWebhookSignature(rawBody, signature)) {
        logSystem('Paystack webhook: invalid signature', 'error');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      const event = JSON.parse(rawBody.toString());
      logSystem(`Paystack webhook: ${event.event} | ref: ${event.data?.reference}`, 'info');

      const result = await handleWebhookEvent(event);

      if (result.success && !result.skipped && !result.alreadyProcessed) {
        const { telegramId, planKey } = result;
        const { PLANS } = require('./lib/payment');
        const plan = PLANS[planKey];

        const successMsg = `
╔═══════════════════════════╗
║   ✅  PAYMENT SUCCESSFUL!  ║
╚═══════════════════════════╝

Your payment has been verified and your subscription is now <b>ACTIVE</b>!

━━━━━━ NEW PLAN DETAILS ━━━━━━

📦 Plan: <b>${plan?.name || planKey}</b>
📱 Devices: <b>${plan?.maxDevices === 999 ? 'Unlimited' : plan?.maxDevices}</b>
⏳ Duration: <b>30 Days</b>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Tap <b>📱 Pair Device</b> to start connecting your WhatsApp numbers!

MZAZI TECH QUARTZ BOT • Mzazi Systems Online
        `.trim();

        await notifyUser(telegramId, successMsg);
      }

      res.json({ status: 'ok' });
    } catch (err) {
      logSystem(`Paystack webhook error: ${err.message}`, 'error');
      res.status(500).json({ error: 'Internal error' });
    }
  });

  return app;
}

function startWebhookServer(bot, port = 3000) {
  setBot(bot);
  const app = createWebhookServer();

  app.listen(port, () => {
    logSystem(`Webhook server running on port ${port}`, 'success');
  });

  return app;
}

module.exports = { startWebhookServer };
