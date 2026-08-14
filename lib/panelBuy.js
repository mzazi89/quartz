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

const PTERO_URL = process.env.PTERODACTYL_URL || 'https://public.mzazi.shop';
const PTERO_KEY = process.env.PTERODACTYL_API_KEY || '';
const PAYSTACK_BASE = 'https://api.paystack.co';

function pteroHeaders() {
  return {
    Authorization: `Bearer ${PTERO_KEY}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function pteroGet(path) {
  const res = await axios.get(`${PTERO_URL}/api/application${path}`, { headers: pteroHeaders() });
  return res.data;
}

async function pteroPost(path, body) {
  const res = await axios.post(`${PTERO_URL}/api/application${path}`, body, { headers: pteroHeaders() });
  return { status: res.status, data: res.data };
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
async function initializePanelPayment(pkg, telegramId, user) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) throw new Error('PAYSTACK_SECRET_KEY not set');

  const ts = Date.now();
  const rand = crypto.randomBytes(4).toString('hex');
  const reference = `PNL-${telegramId}-${pkg.id}-${ts}-${rand}`.toUpperCase();
  const email = `${telegramId}@mzazitechquartz.bot`;

  await prisma.payment.create({
    data: {
      userId: user.id,
      reference,
      amount: Number(pkg.price),
      plan: `PANEL:${pkg.name}`,
      status: 'PENDING',
    },
  });

  const res = await axios.post(
    `${PAYSTACK_BASE}/transaction/initialize`,
    {
      email,
      amount: Math.round(Number(pkg.price) * 100),
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
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  const res = await axios.get(
    `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${secretKey}` } }
  );
  const data = res.data.data;
  return { status: data.status, amount: data.amount / 100, reference: data.reference };
}

// ─── Create the Pterodactyl panel (user + server) ────────────────────────────
async function createPanel({ username, password, pkg, nestId, eggId, telegramId }) {
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

  // Find-or-create the Pterodactyl user (username reuse → same person)
  const pteroEmail = `${username.toLowerCase()}_tg${telegramId}@panel.mzazitech.local`;
  let pteroUserId = null;
  let freshlyCreated = false;

  const userRes = await pteroPost('/users', {
    email: pteroEmail,
    username,
    first_name: 'Telegram',
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

  // Create the server
  const serverName = `${username}-${String(pkg.name).toLowerCase().replace(/\s+/g, '-')}`;
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
    deploy: { locations: [1], dedicated_ip: false, port_range: [] },
    start_on_completion: true,
    skip_scripts: false,
    oom_disabled: false,
  });

  if (serverRes.status !== 201) {
    if (freshlyCreated) {
      try {
        await axios.delete(`${PTERO_URL}/api/application/users/${pteroUserId}`, { headers: pteroHeaders() });
      } catch {}
    }
    throw new Error(serverRes.data?.errors?.[0]?.detail || 'Failed to create server');
  }

  return {
    panel_url: PTERO_URL,
    server_id: serverRes.data.attributes.id,
    ptero_user_id: pteroUserId,
    username,
    password,
    email: pteroEmail,
    package: pkg.name,
    expires_after_hours: pkg.expires_after_hours || null,
  };
}

module.exports = {
  getNests,
  getPackages,
  initializePanelPayment,
  verifyPanelPayment,
  createPanel,
};
