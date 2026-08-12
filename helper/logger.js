const chalk = require('chalk');
const moment = require('moment-timezone');

const TIMEZONE = 'Africa/Nairobi';
const timestamp = () => moment.tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
const timeShort = () => moment.tz(TIMEZONE).format('HH:mm:ss');

// ─── Palette ────────────────────────────────────────────────────────────────
const colors = {
  telegram: chalk.hex('#0088cc'),
  whatsapp: chalk.hex('#25D366'),
  system:   chalk.hex('#FFA500'),
  error:    chalk.hex('#FF5252'),
  success:  chalk.hex('#4CAF50'),
  warn:     chalk.hex('#FFC107'),
  debug:    chalk.hex('#9E9E9E'),
  user:     chalk.hex('#FFD700'),
  command:  chalk.hex('#FF00FF'),
  group:    chalk.hex('#00CED1'),
  dm:       chalk.hex('#FF69B4'),
};

// ─── Log levels ─────────────────────────────────────────────────────────────
// Filtering via LOG_LEVEL env (debug < info/success < warn < error)
const LEVELS = { debug: 0, info: 1, success: 1, warn: 2, error: 3 };
const LEVEL_META = {
  error:   { icon: '❌', color: colors.error },
  warn:    { icon: '⚠️', color: colors.warn },
  info:    { icon: 'ℹ️', color: chalk.cyan },
  success: { icon: '✅', color: colors.success },
  debug:   { icon: '🐞', color: colors.debug },
};
const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();
const shouldLog = (level) =>
  (LEVELS[level] ?? LEVELS.info) >= (LEVELS[LOG_LEVEL] ?? LEVELS.info);

// ─── Display-width helpers (emoji / CJK aware) ──────────────────────────────
const plain = (str) => String(str).replace(/\x1b\[[0-9;]*m/g, '');

function displayWidth(str) {
  let w = 0;
  for (const ch of plain(str)) {
    const c = ch.codePointAt(0);
    if ((c >= 0xFE00 && c <= 0xFE0F) || c === 0x200D) continue; // variation selectors / ZWJ
    if (
      (c >= 0x1100 && c <= 0x115F) || (c >= 0x2E80 && c <= 0xA4CF) ||
      (c >= 0xAC00 && c <= 0xD7A3) || (c >= 0xF900 && c <= 0xFAFF) ||
      (c >= 0xFE30 && c <= 0xFE4F) || (c >= 0xFF00 && c <= 0xFF60) ||
      (c >= 0xFFE0 && c <= 0xFFE6) || (c >= 0x2600 && c <= 0x27BF) ||
      (c >= 0x1F000 && c <= 0x1FAFF) || (c >= 0x20000 && c <= 0x2FFFD)
    ) {
      w += 2;
    } else {
      w += 1;
    }
  }
  return w;
}

const pad = (str, n) => ' '.repeat(Math.max(0, n - displayWidth(str)));

// ─── Text wrapping (display-width aware) ────────────────────────────────────
function wrapText(text, width) {
  const out = [];
  for (const rawLine of plain(text).split('\n')) {
    const words = rawLine.split(/\s+/).filter(Boolean);
    if (words.length === 0) { out.push(''); continue; }

    let cur = '';
    for (const word of words) {
      const candidate = cur ? cur + ' ' + word : word;
      if (displayWidth(candidate) <= width) { cur = candidate; continue; }

      if (cur) { out.push(cur); cur = word; }
      while (displayWidth(cur) > width) {
        let cut = 0, w = 0;
        for (const ch of cur) {
          const cw = displayWidth(ch);
          if (w + cw > width) break;
          w += cw; cut++;
        }
        out.push(cur.slice(0, cut));
        cur = cur.slice(cut);
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

// ─── Box builder (auto-sizing, ANSI-safe) ───────────────────────────────────
function makeBox(borderColor, title, rows, { minWidth = 52, maxWidth = 64 } = {}) {
  const inner = Math.min(
    maxWidth,
    Math.max(minWidth, ...rows.map(displayWidth), displayWidth(title) + 4)
  );
  const line = (str) => borderColor('║') + ' ' + str + pad('', inner - displayWidth(str) - 1) + borderColor('║');
  const render = (row) => wrapText(row, inner - 2).map(line).join('\n');

  const titlePad = Math.max(0, Math.floor((inner - displayWidth(title)) / 2));
  const parts = [
    borderColor('╔' + '═'.repeat(inner) + '╗'),
    line(' '.repeat(titlePad) + title),
    borderColor('╠' + '═'.repeat(inner) + '╣'),
    rows.map(render).join('\n'),
    borderColor('╚' + '═'.repeat(inner) + '╝'),
  ];
  return parts.join('\n');
}

// ─── Animated loader (unchanged behaviour) ──────────────────────────────────
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

async function showLoader(accentColor, steps) {
  return new Promise((resolve) => {
    let frame = 0;
    let step = 0;
    let tick = 0;
    const STEP_EVERY = 7;
    const TICK_MS = 55;

    const interval = setInterval(() => {
      const spinner = accentColor(SPINNER_FRAMES[frame % SPINNER_FRAMES.length]);
      const label = chalk.dim(steps[Math.min(step, steps.length - 1)]);
      process.stdout.write(`\r  ${spinner}  ${label}   `);

      frame++;
      tick++;
      if (tick % STEP_EVERY === 0) step++;

      if (step >= steps.length) {
        clearInterval(interval);
        process.stdout.write('\r\x1b[K');
        resolve();
      }
    }, TICK_MS);
  });
}

const WA_STEPS = [
  '📡 Receiving WhatsApp packet...',
  '🔐 Decrypting Signal protocol...',
  '🛡️  Verifying sender identity...',
  '📨 Parsing message content...',
  '✅ Message ready!',
];

const TG_STEPS = [
  '📡 Polling Telegram server...',
  '🔍 Reading update payload...',
  '🛡️  Authenticating user...',
  '📨 Processing message...',
  '✅ Message ready!',
];

// ─── logWhatsApp ────────────────────────────────────────────────────────────
const logWhatsApp = async (data) => {
  const { sender, senderName, chatType, chatName, command, message, isGroup, isOwner, isPaid } = data;

  await showLoader(colors.whatsapp, WA_STEPS);

  const name = senderName || (sender ? sender.split('@')[0] : 'Unknown');
  const from = isGroup ? colors.group(chatName || 'Group') : colors.dm('Direct Message');
  const role = isOwner ? chalk.red('Owner') : isPaid ? chalk.yellow('Paid') : chalk.white('User');

  const rows = [
    chalk.bold('Time:    ') + chalk.cyan(timeShort()),
    chalk.bold('User:    ') + colors.user(name),
    chalk.bold('From:    ') + from,
    chalk.bold('Type:    ') + chalk.magenta(chatType),
    chalk.bold('Command: ') + (command ? colors.command(command) : chalk.gray('none')),
    chalk.bold('Role:    ') + role,
  ];
  if (message) rows.push(chalk.bold('Message: ') + chalk.white(message));

  console.log('\n' + makeBox(colors.whatsapp, chalk.bold.white('WHATSAPP MESSAGE'), rows) + '\n');
};

// ─── logTelegram ────────────────────────────────────────────────────────────
const logTelegram = async (data) => {
  const { userId, username, firstName, action, message, messageType = 'text' } = data;

  await showLoader(colors.telegram, TG_STEPS);

  const uname = `${firstName} (@${username || 'none'})`;
  const actionColored = action.toLowerCase().includes('group') ? colors.group(action) : colors.dm(action);

  const rows = [
    chalk.bold('Time:    ') + chalk.cyan(timeShort()),
    chalk.bold('User:    ') + colors.user(uname),
    chalk.bold('User ID: ') + chalk.yellow(userId),
    chalk.bold('Action:  ') + actionColored,
    chalk.bold('Type:    ') + chalk.magenta(messageType),
  ];
  if (message) rows.push(chalk.bold('Message: ') + chalk.white(message));

  console.log('\n' + makeBox(colors.telegram, chalk.bold.white('TELEGRAM MESSAGE'), rows) + '\n');
};

// ─── logSystem (leveled) ────────────────────────────────────────────────────
const logSystem = (message, type = 'info') => {
  if (!shouldLog(type)) return;
  const meta = LEVEL_META[type] || LEVEL_META.info;
  console.log(meta.color(`${meta.icon} ${chalk.dim(timestamp())} ${message}`));
};

// Generic leveled alias
const log = (level, message) => logSystem(message, level);

// Familiar console passthroughs (kept for compatibility)
const error = (...args) => console.error(...args);
const info = (...args) => console.info(...args);
const warn = (...args) => console.warn(...args);
const debug = (...args) => console.debug(...args);

// ─── logBanner ──────────────────────────────────────────────────────────────
const logBanner = () => {
  console.clear();

  console.log(chalk.hex('#0066FF').bold(`
███╗   ███╗  ███████╗   █████╗   ███████╗  ██████╗
████╗ ████║  ╚══███╔╝  ██╔══██╗  ╚══███╔╝  ╚═██╔═╝
██╔████╔██║    ███╔╝   ███████║    ███╔╝     ██║
██║╚██╔╝██║   ███╔╝    ██╔══██║   ███╔╝      ██║
██║ ╚═╝ ██║  ███████╗  ██║  ██║  ███████╗    ██║
╚═╝     ╚═╝  ╚══════╝  ╚═╝  ╚═╝  ╚══════╝    ╚═╝

 ██████╗   ██╗   ██╗   █████╗   ██████╗   ████████╗  ███████╗
██╔═══██╗  ██║   ██║  ██╔══██╗  ██╔══██╗  ╚══██╔══╝  ╚══███╔╝
██║   ██║  ██║   ██║  ███████║  ██████╔╝     ██║       ███╔╝
██║   ██║  ██║   ██║  ██╔══██║  ██╔══██╗     ██║      ███╔╝
╚██████╔╝  ╚██████╔╝  ██║  ██║  ██║  ██║     ██║     ███████╗
 ╚═══╝╚═╝   ╚═════╝   ╚═╝  ╚═╝  ╚═╝  ╚═╝     ╚═╝     ╚══════╝
`));

  const rows = [
    chalk.white('Owner   : ') + chalk.cyan('Mzazi Systems'),
    chalk.white('Version : ') + chalk.cyan('3.0.0'),
    chalk.white('Mode    : ') + chalk.cyan('Premium System'),
    chalk.white('Status  : ') + chalk.green('ONLINE'),
  ];
  console.log(makeBox(chalk.blue, chalk.white.bold('⚡ MZAZI QUARTZ ⚡'), rows, { minWidth: 38 }));
  console.log('');
};

module.exports = {
  logTelegram,
  logWhatsApp,
  logSystem,
  logBanner,
  colors,
  error,
  info,
  warn,
  debug,
  log,
  showLoader,
};
