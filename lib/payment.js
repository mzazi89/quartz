// ─────────────────────────────────────────────────────────────────────────────
// Paystack Payment Integration
// Handles payment initialization, verification, webhook processing.
// ─────────────────────────────────────────────────────────────────────────────
const axios = require('axios');
const crypto = require('crypto');
const prisma = require('./prismaClient');
const { upgradeSubscription, getOrCreateUser, addLog, PLANS } = require('./subscription');
const { logSystem } = require('../helper/logger');

const PAYSTACK_BASE = 'https://api.paystack.co';

function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY || ''}`,
    'Content-Type': 'application/json',
  };
}

// ─── Generate a unique payment reference ─────────────────────────────────────
function generateReference(telegramId, planKey) {
  const ts = Date.now();
  const rand = crypto.randomBytes(4).toString('hex');
  return `HEX-${telegramId}-${planKey}-${ts}-${rand}`.toUpperCase();
}

// ─── Initialize a Paystack payment ───────────────────────────────────────────
async function initializePaystackPayment(telegramId, planKey) {
  try {
    const plan = PLANS[planKey];
    if (!plan || plan.price === 0) throw new Error('Invalid plan for payment');

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) throw new Error('PAYSTACK_SECRET_KEY not set');

    const user = await getOrCreateUser(telegramId);
    if (!user) throw new Error('User not found');

    const reference = generateReference(telegramId, planKey);
    const amountKobo = plan.price * 100; // Paystack uses smallest currency unit (kobo for KES)
    const email = `${telegramId}@mzazitechquartz.bot`; // synthetic email

    // Save pending payment record
    await prisma.payment.create({
      data: {
        userId: user.id,
        reference,
        amount: plan.price,
        plan: planKey,
        status: 'PENDING',
      },
    });

    // Initialize with Paystack
    const response = await axios.post(
      `${PAYSTACK_BASE}/transaction/initialize`,
      {
        email,
        amount: amountKobo,
        currency: 'KES',
        reference,
        metadata: {
          telegramId: String(telegramId),
          planKey,
          custom_fields: [
            { display_name: 'Telegram ID', variable_name: 'telegram_id', value: String(telegramId) },
            { display_name: 'Plan', variable_name: 'plan', value: plan.name },
          ],
        },
      },
      { headers: getHeaders() }
    );

    const { authorization_url, access_code } = response.data.data;
    return { success: true, url: authorization_url, reference, accessCode: access_code };
  } catch (err) {
    logSystem(`initializePaystackPayment error: ${err.message}`, 'error');
    return { success: false, error: err.message };
  }
}

// ─── Verify a Paystack payment by reference ───────────────────────────────────
async function verifyPaystackPayment(reference) {
  try {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) throw new Error('PAYSTACK_SECRET_KEY not set');

    const response = await axios.get(
      `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: getHeaders() }
    );

    const data = response.data.data;
    return {
      success: true,
      status: data.status, // 'success' | 'failed' | 'abandoned'
      amount: data.amount / 100,
      currency: data.currency,
      reference: data.reference,
      metadata: data.metadata,
      paidAt: data.paid_at,
    };
  } catch (err) {
    logSystem(`verifyPaystackPayment error: ${err.message}`, 'error');
    return { success: false, error: err.message };
  }
}

// ─── Process a successful payment ─────────────────────────────────────────────
// Called by webhook OR manual verify. Returns { success, telegramId, planKey }
async function processSuccessfulPayment(reference, expectedTelegramId = null) {
  try {
    const payment = await prisma.payment.findUnique({ where: { reference } });
    if (!payment) return { success: false, error: 'Payment record not found' };

    if (expectedTelegramId !== null && expectedTelegramId !== undefined) {
      const expectedUser = await getOrCreateUser(expectedTelegramId);
      if (!expectedUser || expectedUser.id !== payment.userId) {
        return { success: false, error: 'This payment reference does not belong to this account' };
      }
    }

    if (payment.status === 'SUCCESS') {
      return {
        success: true,
        alreadyProcessed: true,
        planKey: payment.plan,
      };
    }

    // Verify with Paystack
    const verif = await verifyPaystackPayment(reference);
    if (!verif.success || verif.status !== 'success') {
      await prisma.payment.update({
        where: { reference },
        data: { status: 'FAILED' },
      });
      return { success: false, error: 'Payment not successful on Paystack' };
    }

    // Get telegramId from payment user
    const user = await prisma.user.findUnique({ where: { id: payment.userId } });
    if (!user) return { success: false, error: 'User not found' };

    const telegramId = Number(user.telegramId);

    // Mark payment as success
    await prisma.payment.update({
      where: { reference },
      data: { status: 'SUCCESS', paystackRef: verif.reference },
    });

    // Panel purchases don't touch subscriptions — the panel itself is created
    // by the Telegram /confirmpanel flow (or the webhook can trigger it later).
    if (payment.plan && payment.plan.startsWith('PANEL:')) {
      return { success: true, telegramId, panel: true, reference };
    }

    // Upgrade subscription
    const result = await upgradeSubscription(telegramId, payment.plan);

    await addLog(telegramId, 'PAYMENT_SUCCESS', `Plan: ${payment.plan}, Ref: ${reference}`);

    return { success: true, telegramId, planKey: payment.plan, result };
  } catch (err) {
    logSystem(`processSuccessfulPayment error: ${err.message}`, 'error');
    return { success: false, error: err.message };
  }
}

// ─── Verify Paystack webhook signature ───────────────────────────────────────
function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.PAYSTACK_SECRET_KEY || '';
  const hash = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  return hash === signature;
}

// ─── Handle webhook event ─────────────────────────────────────────────────────
async function handleWebhookEvent(event) {
  try {
    if (event.event === 'charge.success') {
      const reference = event.data.reference;
      const result = await processSuccessfulPayment(reference);
      return result;
    }
    return { success: true, skipped: true };
  } catch (err) {
    logSystem(`handleWebhookEvent error: ${err.message}`, 'error');
    return { success: false, error: err.message };
  }
}

module.exports = {
  PLANS,
  initializePaystackPayment,
  verifyPaystackPayment,
  processSuccessfulPayment,
  verifyWebhookSignature,
  handleWebhookEvent,
};
