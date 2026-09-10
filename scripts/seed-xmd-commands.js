#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Seed the MZAZI XMD command pack into bot_commands.
//
//   node scripts/seed-xmd-commands.js            # dry run, validates only
//   node scripts/seed-xmd-commands.js --apply    # writes to the database
//
// Every row is written with profile = 'xmd', so the pack is invisible to QUARTZ
// XD. That is what makes the two bots genuinely different rather than one bot
// with two names.
//
// ── Why this validates before it writes ──────────────────────────────────────
// A command's `code` is compiled with `new Function` at run time and only then
// does a syntax error appear — on a live bot, in front of a customer, as
// "Command error: Unexpected token". Compiling every body here turns that into a
// build-time failure instead. It is the single most valuable check in this file.
//
// It also refuses duplicates BY NAME, because `bot_commands.name` is UNIQUE and
// the upsert would otherwise silently overwrite one command with another.
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

const PARTS_DIR = path.join(__dirname, 'xmd');
const PROFILE = 'xmd';
const APPLY = process.argv.includes('--apply');

// The same parameter names the runtime passes, so a body that references one
// compiles here exactly as it will there. Only the names are needed for a syntax
// check — the values are irrelevant at this stage.
const CONTEXT_KEYS = [
  'mzazireply', 'reply', 'mzazi', 'args', 'command', 'prefix', 'text', 'body', 'm',
  'message', 'type', 'sender', 'senderNumber', 'senderNum', 'sendnumb', 'msgSender',
  'isOwner', 'isAdmin', 'isGroup', 'isBotAdmin', 'isGroupOwner', 'groupAdmins',
  'participants', 'botName', 'getBotName', 'setBotName', 'botPhoneNum', 'botJid', 'botLid',
  'axios', 'fetch', 'fs', 'path', 'os', 'exec', 'require', 'module', '__dirname', '__filename',
  'logger', 'logSystem', 'runtime', 'version', 'startTime', 'formatBytes',
  'db', 'loadJSON', 'saveJSON', 'saveDB', 'config', 'currentSettings', 'getSetting', 'settingsPath',
  'downloadMediaMessage', 'generateWAMessageFromContent', 'prepareWAMessageMedia', 'proto',
  'baileys', 'pino', 'PassThrough', 'ffmpeg', 'yts', 'crypto',
  'sendButtons', 'sendInteractiveMessage', 'getMzaziApiKey', 'mzaziSiteUrl', 'mzaziApiKey',
  'addWarn', 'getWarns', 'resetWarn', 'addOwner', 'delOwner', 'getOwners', 'owners', 'ownersList', 'ownerNumbers',
  'getGroupSettings', 'setGroupSetting', 'getToggle', 'setToggle', 'getChatbotStatus', 'setChatbotStatus',
  'isPaid', 'paidUsers', 'sessionPaidUsers', 'saveSessionPaid',
  'normalizeJid', 'jidToNumber', 'resolveJid', 'lidToPn', 'sessionFile',
];

const VALID_CATEGORIES = [
  'Downloads', 'Audio', 'Images', 'Stickers', 'Documents', 'Codes',
  'Text', 'Encoding', 'Links', 'Network', 'Files', 'Generators',
];

function loadParts() {
  if (!fs.existsSync(PARTS_DIR)) return [];
  const files = fs.readdirSync(PARTS_DIR).filter((f) => f.endsWith('.js')).sort();
  const all = [];
  for (const file of files) {
    const full = path.join(PARTS_DIR, file);
    let mod;
    try {
      mod = require(full);
    } catch (err) {
      throw new Error(`could not load ${file}: ${err.message}`);
    }
    if (!Array.isArray(mod)) throw new Error(`${file} does not export an array`);
    for (const cmd of mod) all.push({ ...cmd, __file: file });
  }
  return all;
}

function validate(commands) {
  const problems = [];
  const seen = new Map();

  for (const c of commands) {
    const where = `${c.__file} → ${c.name || '(no name)'}`;

    if (!c.name || typeof c.name !== 'string') problems.push(`${where}: missing name`);
    else if (!/^[a-z0-9_]{1,64}$/.test(c.name)) problems.push(`${where}: name must be lowercase letters, digits or underscore`);

    if (typeof c.code !== 'string' || !c.code.trim()) problems.push(`${where}: missing code`);

    if (c.name) {
      if (seen.has(c.name)) problems.push(`${where}: duplicate name, already defined in ${seen.get(c.name)}`);
      else seen.set(c.name, c.__file);
    }

    if (Array.isArray(c.aliases)) {
      for (const a of c.aliases) {
        if (!/^[a-z0-9_]{1,64}$/.test(String(a))) problems.push(`${where}: bad alias "${a}"`);
        if (a === c.name) problems.push(`${where}: alias duplicates its own name`);
      }
    }

    if (c.category && !VALID_CATEGORIES.includes(c.category)) {
      problems.push(`${where}: unknown category "${c.category}"`);
    }

    // The one that matters: a body that will not compile is a command that
    // fails in front of a customer and nowhere else.
    if (typeof c.code === 'string' && c.code.trim()) {
      try {
        // eslint-disable-next-line no-new-func
        new Function(...CONTEXT_KEYS, `return (async () => {\n${c.code}\n})()`);
      } catch (err) {
        problems.push(`${where}: CODE DOES NOT COMPILE — ${err.message}`);
      }
    }
  }

  return problems;
}

function summarise(commands) {
  const byCategory = {};
  for (const c of commands) {
    const k = c.category || 'General';
    byCategory[k] = (byCategory[k] || 0) + 1;
  }
  return byCategory;
}

async function main() {
  const commands = loadParts();

  if (commands.length === 0) {
    console.error('No command parts found in', PARTS_DIR);
    process.exitCode = 1;
    return;
  }

  console.log(`Loaded ${commands.length} command(s) from ${PARTS_DIR}`);

  const problems = validate(commands);
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):`);
    for (const p of problems) console.error('  ✗ ' + p);
    console.error('\nNothing was written.');
    process.exitCode = 1;
    return;
  }

  console.log('All bodies compile. No duplicate names, aliases or categories.\n');
  for (const [cat, n] of Object.entries(summarise(commands))) {
    console.log(`  ${cat.padEnd(12)} ${n}`);
  }

  if (!APPLY) {
    console.log('\nDry run — pass --apply to write these to the database.');
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.error('\nDATABASE_URL is not set, so there is nowhere to write.');
    process.exitCode = 1;
    return;
  }

  // Required lazily so a dry run works with no database and no dependencies.
  const { prisma, ensureTables } = require('../lib/botDb.js');
  await ensureTables();

  let inserted = 0;
  let updated = 0;

  for (const c of commands) {
    const row = await prisma.$queryRawUnsafe(
      `SELECT id, profile FROM bot_commands WHERE name = $1`,
      c.name
    );

    if (row.length && row[0].profile && row[0].profile !== PROFILE) {
      // Someone else's command with this name. Upserting would take it away from
      // them, so refuse loudly rather than winning quietly.
      console.error(
        `  ✗ ${c.name} already exists under profile "${row[0].profile}" — skipping`
      );
      process.exitCode = 1;
      continue;
    }

    const aliases = JSON.stringify(Array.isArray(c.aliases) ? c.aliases : []);

    if (row.length) {
      await prisma.$executeRawUnsafe(
        `UPDATE bot_commands
            SET aliases = $1::jsonb, description = $2, category = $3, usage = $4,
                owner_only = $5, admin_only = $6, group_only = $7, code = $8,
                profile = $9, updated_at = CURRENT_TIMESTAMP
          WHERE name = $10`,
        aliases, c.description || '', c.category || 'General', c.usage || '',
        !!c.ownerOnly, !!c.adminOnly, !!c.groupOnly, c.code, PROFILE, c.name
      );
      updated++;
    } else {
      await prisma.$executeRawUnsafe(
        `INSERT INTO bot_commands
           (name, aliases, description, category, usage, owner_only, admin_only, group_only, enabled, code, profile)
         VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, $8, true, $9, $10)`,
        c.name, aliases, c.description || '', c.category || 'General', c.usage || '',
        !!c.ownerOnly, !!c.adminOnly, !!c.groupOnly, c.code, PROFILE
      );
      inserted++;
    }
  }

  console.log(`\nDone. ${inserted} inserted, ${updated} updated, all under profile "${PROFILE}".`);
  console.log('\nThe bot syncs automatically within ~15s, or run .synccmd to force it.');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exitCode = 1;
});
