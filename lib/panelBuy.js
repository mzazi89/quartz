// ─────────────────────────────────────────────────────────────────────────────
// PANEL PURCHASE — Telegram /buypanel flow
//  1) user answers username → password → nest → egg → package
//  2) pays directly with Paystack (KES)
//  3) on successful payment the Pterodactyl panel is created automatically
//     and the login details are sent back
// Reuses the same Pterodactyl application API logic as the website.
// ─────────────────────────────────────────────────────────────────────────────
const axios = require('axios');
const crypto = require('crypto');
const prisma = require('./prismaClient');
const { logSystem } = require('../helper/logger');

// Config comes from the shared `settings` table (admin-editable) with env fallback.
const { getPanelConfig } = require('./settings');
const PAYSTACK_BASE = 'https://api.paystack.co';

async function pteroHeaders() {
  const cfg = await getPanelConfig();
  return {
    Authorization: `Bearer ${cfg.pteroKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function pteroGet(path) {
  const cfg = await getPanelConfig();
  const res = await axios.get(`${cfg.pteroUrl}/api/application${path}`, { headers: await pteroHeaders() });
  return res.data;
}

async function pteroPost(path, body) {
  const cfg = await getPanelConfig();
  try {
    const res = await axios.post(`${cfg.pteroUrl}/api/application${path}`, body, { headers: await pteroHeaders() });
    return { status: res.status, data: res.data };
  } catch (e) {
    // axios throws on 4xx/5xx — return the status+body so callers can handle
    // expected cases (e.g. 422 username/email already taken) instead of
    // surfacing the generic "Request failed with status code 422".
    return {
      status: e.response ? e.response.status : 500,
      data: e.response ? e.response.data : { errors: [{ detail: e.message }] },
    };
  }
}

// ─── Nests + eggs from the Pterodactyl application API ───────────────────────
async function getNests() {
  const data = await pteroGet('/nests?include=eggs');
  return (data.data || []).map((n) => {
    const a = n.attributes;
    const eggs = (a.relationships?.eggs?.data || []).map((e) => ({
      id: e.attributes.id,
      name: e.attributes.name,
    }));
    return { id: a.id, name: a.name, eggs };
  });
}

// ─── Sellable packages (shared Neon `packages` table) ────────────────────────
async function getPackages() {
  return prisma.$queryRawUnsafe(
    `SELECT id, name, price, cpu, ram, disk, expires_after_hours
     FROM packages WHERE active = true ORDER BY sort_order ASC, id ASC`
  );
}

// ─── Paystack direct payment for a panel ─────────────────────────────────────
// amountOverride (KES, optional) lets an "add server" flow charge a different
// amount than the package price (e.g. 30% of the first server for a similar
// server) while still creating the full package.
async function initializePanelPayment(pkg, telegramId, user, amountOverride = null) {
  const { paystackKey: secretKey } = await getPanelConfig();
  if (!secretKey) throw new Error('PAYSTACK_SECRET_KEY not set (add it in the admin panel settings)');

  const ts = Date.now();
  const rand = crypto.randomBytes(4).toString('hex');
  const reference = `PNL-${telegramId}-${pkg.id}-${ts}-${rand}`.toUpperCase();
  const email = `${telegramId}@mzazitechquartz.bot`;
  const chargeAmount = amountOverride !== null ? Number(amountOverride) : Number(pkg.price);

  await prisma.payment.create({
    data: {
      userId: user.id,
      reference,
      amount: chargeAmount,
      plan: `PANEL:${pkg.name}`,
      status: 'PENDING',
    },
  });

  const res = await axios.post(
    `${PAYSTACK_BASE}/transaction/initialize`,
    {
      email,
      amount: Math.round(chargeAmount * 100),
      currency: 'KES',
      reference,
      metadata: {
        telegramId: String(telegramId),
        kind: 'panel',
        package: pkg.name,
        custom_fields: [
          { display_name: 'Telegram ID', variable_name: 'telegram_id', value: String(telegramId) },
          { display_name: 'Item', variable_name: 'item', value: `Panel: ${pkg.name}` },
        ],
      },
    },
    { headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' } }
  );

  return { url: res.data.data.authorization_url, reference };
}

async function verifyPanelPayment(reference) {
  const { paystackKey: secretKey } = await getPanelConfig();
  const res = await axios.get(
    `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${secretKey}` } }
  );
  const data = res.data.data;
  return { status: data.status, amount: data.amount / 100, reference: data.reference };
}

// ─── Find an existing panel user by username (for "add server" flows) ────────
async function findPanelUser(username) {
  const searchRes = await pteroGet(`/users?filter[username]=${encodeURIComponent(username)}`);
  const match = (searchRes.data || []).find(
    (u) => (u.attributes.username || '').toLowerCase() === String(username).toLowerCase()
  );
  return match ? match.attributes.id : null;
}

// ─── Server allocation: prefer an explicit free allocation ───────────────────
// Automatic deployment (deploy.locations) fails with "No nodes satisfying the
// requirements specified for automatic deployment could be found." when the
// panel's nodes are not auto-deploy ready or the location has no capacity.
// Picking a concrete free allocation from the API works on any panel layout.
async function pickFreeAllocation() {
  try {
    const data = await pteroGet('/nodes?include=allocations&per_page=100');
    for (const n of data?.data || []) {
      const allocs = n.attributes?.relationships?.allocations?.data || [];
      const free = allocs.find((a) => a.attributes && !a.attributes.assigned);
      if (free) {
        return { allocation: { default: free.attributes.id }, mode: 'manual' };
      }
    }
  } catch (e) {
    // Allocation listing unavailable — fall back to automatic deployment.
  }
  return { deploy: { locations: [1], dedicated_ip: false, port_range: [] }, mode: 'auto' };
}

// ─── Create the Pterodactyl panel (user + server) ────────────────────────────
async function createPanel({ username, password, pkg, nestId, eggId, telegramId, source = 'tg' }) {
  // Fetch egg details (docker image, startup, variables)
  const eggData = await pteroGet(`/nests/${nestId}/eggs/${eggId}?include=variables`);
  const eggAttrs = eggData?.attributes;
  if (!eggAttrs) throw new Error('Could not fetch egg details from the panel');

  const dockerImage =
    eggAttrs.docker_image || (eggAttrs.docker_images && eggAttrs.docker_images[0]) || 'ghcr.io/pterodactyl/yolks:java_17';
  const startupCmd = eggAttrs.startup || '{{SERVER_JARFILE}}';

  const environment = {};
  for (const v of eggAttrs.relationships?.variables?.data || []) {
    const attr = v.attributes;
    environment[attr.env_variable] = attr.default_value ?? '';
  }

  // Find-or-create the Pterodactyl user (username reuse → same person).
  // `source` tags the buyer channel: 'tg' = Telegram user id, 'wa' = WhatsApp
  // client number, so the generated email stays unique per channel.
  const sourceTag = source === 'wa' ? 'wa' : 'tg';
  const sourceLabel = source === 'wa' ? 'WhatsApp' : 'Telegram';
  const pteroEmail = `${username.toLowerCase()}_${sourceTag}${telegramId}@panel.mzazitech.local`;
  let pteroUserId = null;
  let freshlyCreated = false;

  const userRes = await pteroPost('/users', {
    email: pteroEmail,
    username,
    first_name: sourceLabel,
    last_name: String(telegramId),
    password,
  });

  if (userRes.status === 201) {
    pteroUserId = userRes.data.attributes.id;
    freshlyCreated = true;
  } else {
    const errDetail = (userRes.data?.errors?.[0]?.detail) || '';
    const isConflict =
      userRes.status === 422 ||
      /username|email|already|taken/i.test(errDetail);
    if (!isConflict) throw new Error(errDetail || 'Failed to create panel user');

    const searchRes = await pteroGet(`/users?filter[username]=${encodeURIComponent(username)}`);
    const match = (searchRes.data || []).find(
      (u) => u.attributes.username.toLowerCase() === username.toLowerCase()
    );
    if (!match) {
      const emailSearch = await pteroGet(`/users?filter[email]=${encodeURIComponent(pteroEmail)}`);
      const emailMatch = (emailSearch.data || []).find(
        (u) => u.attributes.email.toLowerCase() === pteroEmail.toLowerCase()
      );
      if (!emailMatch) throw new Error('Username is taken by another account. Choose a different one.');
      pteroUserId = emailMatch.attributes.id;
    } else {
      pteroUserId = match.attributes.id;
    }
    freshlyCreated = false;
  }

  // Create the server — use a concrete free allocation when one exists (see
  // pickFreeAllocation); automatic deployment is only the fallback.
  const serverName = `${username}-${String(pkg.name).toLowerCase().replace(/\s+/g, '-')}`;
  const { mode: allocMode, ...allocPayload } = await pickFreeAllocation();
  const serverRes = await pteroPost('/servers', {
    name: serverName,
    user: pteroUserId,
    egg: parseInt(eggId),
    docker_image: dockerImage,
    startup: startupCmd,
    environment,
    limits: {
      memory: parseInt(pkg.ram),
      swap: 0,
      disk: parseInt(pkg.disk),
      io: 500,
      cpu: parseInt(pkg.cpu),
    },
    feature_limits: { databases: 1, backups: 1, allocations: 1 },
    ...allocPayload, // { allocation: { default: <id> } } | { deploy: { locations: [1], ... } }
    start_on_completion: true,
    skip_scripts: false,
    oom_disabled: false,
  });

  if (serverRes.status !== 201) {
    if (freshlyCreated) {
      try {
        const cfg = await getPanelConfig();
        await axios.delete(`${cfg.pteroUrl}/api/application/users/${pteroUserId}`, { headers: await pteroHeaders() });
      } catch {}
    }
    const errDetail = serverRes.data?.errors?.[0]?.detail || 'Failed to create server';
    throw new Error(`${errDetail}${allocMode === 'auto' ? ' (auto-deploy fallback)' : ''}`);
  }

  const cfg = await getPanelConfig();
  return {
    panel_url: cfg.pteroUrl,
    server_id: serverRes.data.attributes.id,
    ptero_user_id: pteroUserId,
    username,
    password,
    email: pteroEmail,
    package: pkg.name,
    expires_after_hours: pkg.expires_after_hours || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// WHATSAPP PANEL RESELLER SYSTEM (.panel / .unlimited)
//  - Admin sells reseller passwords (reseller_passwords table, admin panel).
//  - A WhatsApp number enters its password once in .panel → activated.
//  - Activated resellers create panels for clients by RAM size (1GB–10GB,
//    UNLIMITED). Creation is free & unlimited for the reseller.
// ─────────────────────────────────────────────────────────────────────────────
const botDb = require('./botDb');

// Pterodactyl limits per size: ram MB, cpu %, disk MB. UNLIMITED = 0 (no limit).
function buildSizeSpecs() {
  const specs = {};
  for (let gb = 1; gb <= 10; gb++) {
    const ram = gb * 1024;
    specs[`${gb}gb`] = {
      label: `${gb}GB`,
      ram,
      cpu: Math.min(100, 40 + gb * 10),
      disk: ram * 5, // 5× RAM
    };
  }
  specs.unlimited = { label: 'UNLIMITED', ram: 0, cpu: 0, disk: 0 };
  return specs;
}
const PANEL_SIZES = buildSizeSpecs();

function listSizes() {
  return Object.keys(PANEL_SIZES);
}

// Pick a default nest/egg for fully-automatic WhatsApp provisioning
// (the Telegram flow asks the buyer; WhatsApp auto-selects the first
// available egg so the creation is one-tap).
async function pickDefaultNestEgg() {
  const nests = await getNests();
  for (const nest of nests) {
    if (nest.eggs && nest.eggs.length > 0) {
      const egg = nest.eggs[0];
      return { nestId: nest.id, eggId: egg.id, nestName: nest.name, eggName: egg.name };
    }
  }
  throw new Error('No Pterodactyl nests/eggs are configured on the panel yet.');
}

function normalizeWaPhone(raw) {
  let p = String(raw || '').replace(/[^\d]/g, '');
  if (p.startsWith('0')) p = '254' + p.slice(1);
  if (!/^2547\d{8}$/.test(p)) return null;
  return p;
}

// ─── Reseller activation ──────────────────────────────────────────────────────
async function activateReseller(code, phone) {
  await botDb.ensureTables();
  const normPhone = normalizeWaPhone(phone);
  if (!normPhone) return { ok: false, error: 'PHONE' };
  const codeStr = String(code || '').trim().toUpperCase();
  if (!codeStr) return { ok: false, error: 'INVALID' };

  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, status FROM reseller_passwords WHERE code = $1`, codeStr
  );
  if (!rows || rows.length === 0) return { ok: false, error: 'INVALID' };
  const row = rows[0];
  if (row.status === 'active') return { ok: false, error: 'ALREADY' };
  await prisma.$executeRawUnsafe(
    `UPDATE reseller_passwords
     SET status = 'active', activated_by = $1, activated_at = NOW()
     WHERE id = $2 AND status = 'unused'`,
    normPhone, row.id
  );
  return { ok: true };
}

async function isReseller(phone) {
  await botDb.ensureTables();
  const normPhone = normalizeWaPhone(phone);
  if (!normPhone) return false;
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id FROM reseller_passwords WHERE status = 'active' AND activated_by = $1 LIMIT 1`,
    normPhone
  );
  return (rows || []).length > 0;
}

// ─── WhatsApp panel creation ──────────────────────────────────────────────────
async function createWhatsappPanel({ username, phone, size, resellerPhone }) {
  await botDb.ensureTables();
  const sizeKey = String(size || '').toLowerCase();
  const spec = PANEL_SIZES[sizeKey];
  if (!spec) throw new Error(`Unknown panel size "${size}". Use one of: ${listSizes().join(', ')}`);

  const normPhone = normalizeWaPhone(phone);
  if (!normPhone) throw new Error('Invalid WhatsApp number. Use the 2547XXXXXXXX format.');

  // Auto-provision: generated login password + first available nest/egg.
  const password = crypto.randomBytes(8).toString('base64url').slice(0, 12);
  const { nestId, eggId, eggName } = await pickDefaultNestEgg();
  const pkg = {
    name: `${spec.label} Panel`,
    ram: spec.ram,
    disk: spec.disk,
    cpu: spec.cpu,
    price: 0,
    expires_after_hours: null,
  };

  const panel = await createPanel({
    username,
    password,
    pkg,
    nestId,
    eggId,
    telegramId: normPhone,
    source: 'wa',
  });

  // Record under the client's WhatsApp number so ownership is traceable.
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO whatsapp_panels
         (phone, username, size, ram, cpu, disk, server_id, ptero_user_id, panel_url, password, reseller_phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      normPhone, String(panel.username), spec.label, spec.ram, spec.cpu, spec.disk,
      panel.server_id || null, panel.ptero_user_id || null, panel.panel_url || '', panel.password,
      String(resellerPhone || '')
    );
  } catch (e) {
    logSystem(`Failed to record whatsapp_panel: ${e.message}`, 'error');
  }

  return { ...panel, size: spec.label, ram: spec.ram, cpu: spec.cpu, disk: spec.disk, eggName };
}

module.exports = {
  getNests,
  getPackages,
  initializePanelPayment,
  verifyPanelPayment,
  createPanel,
  findPanelUser,
  // WhatsApp reseller system
  PANEL_SIZES,
  listSizes,
  activateReseller,
  isReseller,
  normalizeWaPhone,
  createWhatsappPanel,
};
