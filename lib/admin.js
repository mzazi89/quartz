// ─────────────────────────────────────────────────────────────────────────────
// Admin Panel — Functions used by the Telegram admin panel commands
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('./prismaClient');
const { upgradeSubscription, downgradeToFree, PLANS, addLog, getOrCreateUser } = require('./subscription');
const { loadJSON } = require('../helper/function');
const { logSystem } = require('../helper/logger');

// ─── Statistics ───────────────────────────────────────────────────────────────
async function getStats() {
  try {
    const [
      totalUsers,
      activeSubs,
      expiredSubs,
      totalPayments,
      successPayments,
      totalRevenue,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.subscription.count({ where: { status: 'ACTIVE', plan: { not: 'FREE' } } }),
      prisma.subscription.count({ where: { status: 'EXPIRED' } }),
      prisma.payment.count(),
      prisma.payment.count({ where: { status: 'SUCCESS' } }),
      prisma.payment.aggregate({ where: { status: 'SUCCESS' }, _sum: { amount: true } }),
    ]);

    const sessions = loadJSON('./database/paired.json', []);
    const activeSessions = sessions.filter(s => s.active !== false).length;

    return {
      totalUsers,
      activeSubs,
      expiredSubs,
      totalPayments,
      successPayments,
      totalRevenue: totalRevenue._sum.amount || 0,
      activeSessions,
    };
  } catch (err) {
    logSystem(`getStats error: ${err.message}`, 'error');
    return null;
  }
}

// ─── Get users list ───────────────────────────────────────────────────────────
async function getAllUsers(page = 0, limit = 10) {
  try {
    const users = await prisma.user.findMany({
      include: { subscription: true },
      orderBy: { createdAt: 'desc' },
      skip: page * limit,
      take: limit,
    });
    const total = await prisma.user.count();
    return { users, total };
  } catch (err) {
    logSystem(`getAllUsers error: ${err.message}`, 'error');
    return { users: [], total: 0 };
  }
}

// ─── Get payments ─────────────────────────────────────────────────────────────
async function getPayments(page = 0, limit = 10) {
  try {
    const payments = await prisma.payment.findMany({
      include: { user: true },
      orderBy: { createdAt: 'desc' },
      skip: page * limit,
      take: limit,
    });
    const total = await prisma.payment.count();
    return { payments, total };
  } catch (err) {
    logSystem(`getPayments error: ${err.message}`, 'error');
    return { payments: [], total: 0 };
  }
}

// ─── Get subscriptions ────────────────────────────────────────────────────────
async function getSubscriptions(page = 0, limit = 10) {
  try {
    const subs = await prisma.subscription.findMany({
      include: { user: true },
      where: { plan: { not: 'FREE' } },
      orderBy: { updatedAt: 'desc' },
      skip: page * limit,
      take: limit,
    });
    const total = await prisma.subscription.count({ where: { plan: { not: 'FREE' } } });
    return { subs, total };
  } catch (err) {
    logSystem(`getSubscriptions error: ${err.message}`, 'error');
    return { subs: [], total: 0 };
  }
}

// ─── Get recent logs ──────────────────────────────────────────────────────────
async function getLogs(page = 0, limit = 10, level = null) {
  try {
    const where = level ? { level } : {};
    const logs = await prisma.log.findMany({
      include: { user: true },
      where,
      orderBy: { createdAt: 'desc' },
      skip: page * limit,
      take: limit,
    });
    return logs;
  } catch (err) {
    logSystem(`getLogs error: ${err.message}`, 'error');
    return [];
  }
}

// ─── Manual upgrade ───────────────────────────────────────────────────────────
async function adminUpgrade(telegramId, planKey) {
  await getOrCreateUser(telegramId);
  const result = await upgradeSubscription(telegramId, planKey);
  await addLog(telegramId, 'ADMIN_UPGRADE', `Plan: ${planKey}`, 'INFO');
  return result;
}

// ─── Manual downgrade ─────────────────────────────────────────────────────────
async function adminDowngrade(telegramId) {
  const result = await downgradeToFree(telegramId);
  await addLog(telegramId, 'ADMIN_DOWNGRADE', 'Downgraded to Free', 'INFO');
  return result;
}

// ─── Create coupon ────────────────────────────────────────────────────────────
async function createCoupon(code, discount, maxUses = 1, expiresInDays = null) {
  try {
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const coupon = await prisma.coupon.create({
      data: {
        code: code.toUpperCase(),
        discount,
        maxUses,
        expiresAt,
        isActive: true,
      },
    });
    return { success: true, coupon };
  } catch (err) {
    logSystem(`createCoupon error: ${err.message}`, 'error');
    return { success: false, error: err.message };
  }
}

// ─── Validate coupon ──────────────────────────────────────────────────────────
async function validateCoupon(code) {
  try {
    const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
    if (!coupon) return { valid: false, error: 'Coupon not found' };
    if (!coupon.isActive) return { valid: false, error: 'Coupon is inactive' };
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date())
      return { valid: false, error: 'Coupon has expired' };
    if (coupon.usesCount >= coupon.maxUses)
      return { valid: false, error: 'Coupon has been fully used' };
    return { valid: true, discount: coupon.discount, coupon };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

// ─── Use coupon ───────────────────────────────────────────────────────────────
async function useCoupon(code) {
  try {
    await prisma.coupon.update({
      where: { code: code.toUpperCase() },
      data: { usesCount: { increment: 1 } },
    });
  } catch {}
}

// ─── Get all coupons ──────────────────────────────────────────────────────────
async function getCoupons() {
  try {
    return await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  } catch {
    return [];
  }
}

// ─── Delete coupon ────────────────────────────────────────────────────────────
async function deleteCoupon(code) {
  try {
    await prisma.coupon.delete({ where: { code: code.toUpperCase() } });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  getStats,
  getAllUsers,
  getPayments,
  getSubscriptions,
  getLogs,
  adminUpgrade,
  adminDowngrade,
  createCoupon,
  validateCoupon,
  useCoupon,
  getCoupons,
  deleteCoupon,
};
