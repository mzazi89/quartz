// ─────────────────────────────────────────────────────────────────────────────
// lib/userServers.js — per-user panel server records in the bot's INBUILT
// database (database/servers.json). No external DB required for this feature.
//
//   servers.json shape:
//   {
//     "123456789": [            // telegramId
//       { serverId, pteroUserId, username, packageName, packagePrice,
//         ram, disk, cpu, nestId, eggId, createdAt }
//     ]
//   }
// ─────────────────────────────────────────────────────────────────────────────
const { loadJSON, saveJSON } = require('../helper/function');

const SERVERS_FILE = './database/servers.json';

function getServers(telegramId) {
  const all = loadJSON(SERVERS_FILE, {});
  const list = all[String(telegramId)] || [];
  return Array.isArray(list) ? list : [];
}

function getServersByUsername(telegramId, username) {
  const uname = String(username || '').toLowerCase();
  return getServers(telegramId).filter((s) => String(s.username || '').toLowerCase() === uname);
}

function firstServer(telegramId) {
  const list = getServers(telegramId).slice().sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  return list[0] || null;
}

function addServer(telegramId, record) {
  const all = loadJSON(SERVERS_FILE, {});
  const key = String(telegramId);
  if (!Array.isArray(all[key])) all[key] = [];
  all[key].push({
    serverId: record.serverId || null,
    pteroUserId: record.pteroUserId || null,
    username: record.username || '',
    packageName: record.packageName || '',
    packagePrice: record.packagePrice || 0,
    ram: record.ram || 0,
    disk: record.disk || 0,
    cpu: record.cpu || 0,
    nestId: record.nestId || null,
    eggId: record.eggId || null,
    createdAt: record.createdAt || new Date().toISOString(),
  });
  saveJSON(SERVERS_FILE, all);
  return all[key].length;
}

module.exports = { getServers, getServersByUsername, firstServer, addServer, SERVERS_FILE };
