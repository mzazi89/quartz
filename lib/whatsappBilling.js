// Shared WhatsApp-side subscription and Paystack helpers.
// WhatsApp users are keyed by their numeric sender phone number because the
// existing subscription schema uses a BigInt telegramId as its account key.
const {
  PLANS,
  getOrCreateUser,
  getUserSubscription,
  getUserActiveDeviceCount,
  getUserSessions,
  getMaxDevices,
  canAddDevice,
  syncSessionToDb,
} = require("./subscription");
const {
  initializePaystackPayment,
  processSuccessfulPayment,
} = require("./payment");
const { loadJSON } = require("../helper/function");

const PAIRING_COMMAND = "MZAZIBOT";

function getWhatsappUserId(senderNumber) {
  const digits = String(senderNumber || "").replace(/\D/g, "");
  if (!digits || digits.length < 10 || digits.length > 15) return null;
  return digits;
}

function resolveWhatsappAccountId(senderNumber, botPhoneNumber) {
  const sessions = loadJSON("./database/paired.json", []);
  const currentSession = sessions.find(
    (session) => String(session.number) === String(botPhoneNumber)
  );

  // Sessions created from Telegram already carry the Telegram account ID.
  // Reuse it so payment and device limits are shared across both channels.
  if (currentSession?.userId !== undefined && currentSession?.userId !== null) {
    const linkedId = String(currentSession.userId).replace(/\D/g, "");
    if (linkedId.length >= 1 && linkedId.length <= 20) return linkedId;
  }

  return getWhatsappUserId(senderNumber);
}

function getPlanSummary(planKey) {
  const plan = PLANS[planKey];
  if (!plan) return null;
  return {
    key: planKey,
    name: plan.name,
    price: plan.price,
    maxDevices: plan.maxDevices,
    days: plan.days,
  };
}

async function getWhatsappSubscription(senderNumber) {
  const userId = getWhatsappUserId(senderNumber);
  if (!userId) throw new Error("Invalid WhatsApp account number");
  await getOrCreateUser(userId);
  const sub = await getUserSubscription(userId);
  const isExpired = sub.endDate && new Date(sub.endDate) < new Date() && sub.plan !== "FREE";
  return {
    userId,
    sub,
    plan: isExpired ? "FREE" : (sub.plan || "FREE"),
    maxDevices: isExpired ? 1 : (sub.maxDevices || 1),
    deviceCount: getUserActiveDeviceCount(userId),
    sessions: getUserSessions(userId),
    isExpired,
  };
}

async function createWhatsappPayment(senderNumber, planKey) {
  const userId = getWhatsappUserId(senderNumber);
  const plan = getPlanSummary(String(planKey || "").toUpperCase());
  if (!userId) return { success: false, error: "Invalid WhatsApp account number" };
  if (!plan || plan.price === 0) {
    return { success: false, error: "Choose a paid plan: PLAN_5, PLAN_10, PLAN_20, or UNLIMITED" };
  }
  await getOrCreateUser(userId);
  return initializePaystackPayment(userId, plan.key);
}

async function verifyWhatsappPayment(reference, accountId = null) {
  if (!reference) return { success: false, error: "Payment reference is required" };
  return processSuccessfulPayment(String(reference).trim(), accountId);
}

module.exports = {
  PAIRING_COMMAND,
  getWhatsappUserId,
  resolveWhatsappAccountId,
  getPlanSummary,
  getWhatsappSubscription,
  createWhatsappPayment,
  verifyWhatsappPayment,
  canAddDevice,
  getMaxDevices,
  syncSessionToDb,
  PLANS,
};