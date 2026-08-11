// ─────────────────────────────────────────────────────────────────────────
// JSON storage: create-once, cache-forever.
// Mirrors helper/function.js's loadJSON/saveJSON but exposes a single `db`
// object with the five well-known top-level files pre-cached at startup,
// so case.js can do `db.sticker.stickers[...]` etc. without touching disk.
// ─────────────────────────────────────────────────────────────────────────
const fs = require("fs");
const path = require("path");

const DB_DIR = path.join(__dirname, "..", "database");

const DEFAULTS = {
  sticker: { stickers: {} },
  chats: {},
  users: {},
  groups: {},
  settings: { publicMode: true, selfMode: false },
};

const db = {};

function filePathFor(name) {
  return path.join(DB_DIR, `${name}.json`);
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), "utf8");
    return JSON.parse(JSON.stringify(fallback));
  }
}

function initDatabase() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

  for (const name of Object.keys(DEFAULTS)) {
    const filePath = filePathFor(name);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(DEFAULTS[name], null, 2), "utf8");
    }
    db[name] = readJsonFile(filePath, DEFAULTS[name]);
  }

  return db;
}

function saveDB(name) {
  if (!(name in db)) throw new Error(`Unknown database file: ${name}`);
  fs.writeFileSync(filePathFor(name), JSON.stringify(db[name], null, 2), "utf8");
}

// Initialize immediately on first require — case.js expects `db` to already
// be populated (it destructures `db` at module load time).
initDatabase();

module.exports = { db, initDatabase, saveDB, DB_DIR };
