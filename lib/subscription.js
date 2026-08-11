// ─────────────────────────────────────────────────────────────────────────────
// Subscription Manager
// Handles user creation, plan limits, device counts, upgrade/downgrade.
// WhatsApp session FILES remain in database/sessions/ (unchanged).
// Only subscription/payment/user data lives in Neon PostgreSQL.
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('./prismaClient');
const { loadJSON, saveJSON } = require('../helper/function');
const { logSystem } = require('../helper/logger');

// ─── Plan definitions ─────────────────────────────────────────────────────────
const PLANS = {
  FREE:      { name: 'Free',             maxDevices: 1,   price: 0,   days: 0  },
  PLAN_5:    { name: '5 Devices',        maxDevices: 5,   price: 100, days: 30 },
  PLAN_10:   { name: '10 Devices',       maxDevices: 10,  price: 150, days: 30 },
  PLAN_20:   { name: '20 Devices',       maxDevices: 20,  price: 200, days: 30 },
  UNLIMITED: { name: 'Unlimited',        maxDevices: 999, price: 250, days: 30 },
};

// ─── Ensure user exists in DB ─────────────────────────────────────────────────
async function getOrCreateUser(telegramId, username = null, firstName = null) {
  try {
    let user = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId: BigInt(telegramId),
          username,
          firstName,
          subscription: {
            create: {
              plan: 'FREE',
              maxDevices: 1,
              status: 'ACTIVE',
            },
          },
        },
        include: { subscription: true },
      });
      logSystem(`New user registered: ${telegramId}`, 'info');
    } else {
      // Ensure subscription row exists
      const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
      if (!sub) {
        await prisma.subscription.create({
          data: { userId: user.id, plan: 'FREE', maxDevices: 1, status: 'ACTIVE' },
        });
      }
      // Update username/firstName if changed
      if (username && user.username !== username || firstName && user.firstName !== firstName) {
        await prisma.user.update({
          where: { id: user.id },
          data: { username, firstName },
        });
      }
    }
    return user;
  } catch (err) {
    logSystem(`getOrCreateUser error: ${err.message}`, 'error');
    return null;
  }
}

// ─── Get user subscription ────────────────────────────────────────────────────
async function getUserSubscription(telegramId) {
  try {
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
      include: { subscription: true },
    });
    if (!user) return { plan: 'FREE', maxDevices: 1, status: 'ACTIVE', endDate: null };
    return user.subscription || { plan: 'FREE', maxDevices: 1, status: 'ACTIVE', endDate: null };
  } catch (err) {
    logSystem(`getUserSubscription error: ${err.message}`, 'error');
    return { plan: 'FREE', maxDevices: 1, status: 'ACTIVE', endDate: null };
  }
}

// ─── Count active devices from paired.json ────────────────────────────────────
function getUserActiveDeviceCount(telegramId) {
  const sessions = loadJSON('./database/paired.json', []);
  return sessions.filter(s => String(s.userId) === String(telegramId) && s.active !== false).length;
}

// ─── Get all user sessions from paired.json ───────────────────────────────────
function getUserSessions(telegramId) {
  const sessions = loadJSON('./database/paired.json', []);
  return sessions.filter(s => String(s.userId) === String(telegramId));
}

// ─── Get max devices for user ─────────────────────────────────────────────────
async function getMaxDevices(telegramId) {
  const sub = await getUserSubscription(telegramId);
  // Check expiry
  if (sub.endDate && new Date(sub.endDate) < new Date() && sub.plan !== 'FREE') {
    return 1; // expired → treat as free
  }
  return sub.maxDevices || 1;
}

// ─── Can user add another device? ────────────────────────────────────────────
async function canAddDevice(telegramId) {
  const maxDevices = await getMaxDevices(telegramId);
  const currentCount = getUserActiveDeviceCount(telegramId);
  return currentCount < maxDevices;
}

// ─── Upgrade subscription ─────────────────────────────────────────────────────
async function upgradeSubscription(telegramId, planKey) {
  try {
    const plan = PLANS[planKey];
    if (!plan) throw new Error(`Unknown plan: ${planKey}`);

    const user = await getOrCreateUser(telegramId);
    if (!user) throw new Error('User not found');

    const now = new Date();
    const endDate = plan.days > 0 ? new Date(now.getTime() + plan.days * 24 * 60 * 60 * 1000) : null;

    await prisma.subscription.upsert({
      where: { userId: user.id },
      update: {
        plan: planKey,
        maxDevices: plan.maxDevices,
        startDate: now,
        endDate,
        status: 'ACTIVE',
      },
      create: {
        userId: user.id,
        plan: planKey,
        maxDevices: plan.maxDevices,
        startDate: now,
        endDate,
        status: 'ACTIVE',
      },
    });

    await prisma.transaction.create({
      data: {
        userId: user.id,
        type: 'UPGRADE',
        amount: plan.price,
        description: `Upgraded to ${plan.name} plan`,
      },
    });

    logSystem(`User ${telegramId} upgraded to ${planKey}`, 'success');
    return { success: true, plan: planKey, endDate };
  } catch (err) {
    logSystem(`upgradeSubscription error: ${err.message}`, 'error');
    return { success: false, error: err.message };
  }
}

// ─── Downgrade to free (called on expiry or manual) ──────────────────────────
async function downgradeToFree(telegramId) {
  try {
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
    });
    if (!user) return;

    await prisma.subscription.update({
      where: { userId: user.id },
      data: { plan: 'FREE', maxDevices: 1, status: 'EXPIRED', endDate: null },
    });

    // Keep only 1 active session — remove extras from paired.json
    let sessions = loadJSON('./database/paired.json', []);
    const userSessions = sessions.filter(s => String(s.userId) === String(telegramId));
    const otherSessions = sessions.filter(s => String(s.userId) !== String(telegramId));

    const fs = require('fs');
    if (userSessions.length > 1) {
      // Keep the most recent active one
      userSessions.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      const keep = userSessions[0];
      const toRemove = userSessions.slice(1);

      // Delete extra session folders
      for (const sess of toRemove) {
        const sessionPath = `./database/sessions/${sess.number}`;
        if (fs.existsSync(sessionPath)) {
          fs.rmSync(sessionPath, { recursive: true, force: true });
        }
      }

      sessions = [...otherSessions, keep];
      saveJSON('./database/paired.json', sessions);
    }

    await prisma.transaction.create({
      data: {
        userId: user.id,
        type: 'DOWNGRADE',
        amount: 0,
        description: 'Downgraded to Free plan (subscription expired)',
      },
    });

    logSystem(`User ${telegramId} downgraded to Free`, 'info');
    return { success: true };
  } catch (err) {
    logSystem(`downgradeToFree error: ${err.message}`, 'error');
    return { success: false };
  }
}

// ─── Sync a session to DB ────────────────────────────────────────────────────
async function syncSessionToDb(telegramId, phoneNumber, status = 'ACTIVE') {
  try {
    const user = await getOrCreateUser(telegramId);
    if (!user) return;

    await prisma.whatsAppSession.upsert({
      where: { phoneNumber },
      update: { status, userId: user.id },
      create: { userId: user.id, phoneNumber, status },
    });
  } catch (err) {
    logSystem(`syncSessionToDb error: ${err.message}`, 'error');
  }
}

// ─── Log to DB ────────────────────────────────────────────────────────────────
async function addLog(telegramId, action, details = null, level = 'INFO') {
  try {
    const user = telegramId
      ? await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } })
      : null;

    await prisma.log.create({
      data: {
        userId: user?.id || null,
        action,
        details,
        level,
      },
    });
  } catch {
    // Non-critical; swallow silently
  }
}

module.exports = {
  PLANS,
  getOrCreateUser,
  getUserSubscription,
  getUserActiveDeviceCount,
  getUserSessions,
  getMaxDevices,
  canAddDevice,
  upgradeSubscription,
  downgradeToFree,
  syncSessionToDb,
  addLog,
};
