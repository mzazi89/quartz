const chalk = require('chalk');
const moment = require('moment-timezone');

const TIMEZONE = 'Africa/Nairobi';
const timestamp = () => moment.tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
const timeShort = () => moment.tz(TIMEZONE).format('HH:mm:ss');

// ─── Animation core ──────────────────────────────────────────────────────────
// Animations only run on a real TTY (not when piped/logged) and can be forced
// off with LOG_ANIM=0. All animated rendering is serialized so concurrent
// log calls never interleave or corrupt the boxes.
const IS_TTY = !!process.stdout.isTTY;
const ANIM = IS_TTY && process.env.LOG_ANIM !== '0';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sleepSync = (ms) => {
  if (!IS_TTY) return;
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {}
};

let renderQueue = Promise.resolve();
const enqueue = (fn) => {
  const task = renderQueue.then(fn).catch(() => {});
  renderQueue = task;
  return task;
};

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

// ─── Gradient color (HSL sweep, truecolor) ───────────────────────────────────
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Color each character with a hue sweeping from startHue → endHue
function gradient(text, startHue = 220, endHue = 320) {
  const chars = plain(text).split('');
  const len = Math.max(1, chars.length);
  return chars
    .map((ch, i) => {
      const hue = startHue + ((endHue - startHue) * i) / (len - 1);
      return ch === ' ' ? ch : chalk.hex(hslToHex(hue, 0.85, 0.55))(ch);
    })
    .join('');
}

// ─── Box builder (static, auto-sizing, ANSI-safe) ────────────────────────────
function buildBox(borderColor, title, rows, { minWidth = 52, maxWidth = 64 } = {}) {
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

// ─── Animated box (draws borders, types the title, staggers rows) ────────────
async function animateBox(borderColor, title, rows, opts) {
  const inner = Math.min(
    (opts?.maxWidth) || 64,
    Math.max(opts?.minWidth || 52, ...rows.map(displayWidth), displayWidth(title) + 4)
  );
  const line = (str) => borderColor('║') + ' ' + str + pad('', inner - displayWidth(str) - 1) + borderColor('║');
  const titlePad = Math.max(0, Math.floor((inner - displayWidth(title)) / 2));
  const renderedRows = rows.flatMap((row) => wrapText(row, inner - 2)).map(line);

  const animate = async (full, final) => {
    for (let i = 1; i <= full.length; i++) {
      process.stdout.write('\r' + final(full.slice(0, i)) + '\x1b[K');
      await sleep(3);
    }
    process.stdout.write('\r' + final(full) + '\n');
  };

  return enqueue(async () => {
    console.log('');
    await animate('╔' + '═'.repeat(inner) + '╗', borderColor);
    await animate(' '.repeat(titlePad) + title, (s) => s); // typewriter title
    await animate('╠' + '═'.repeat(inner) + '╣', borderColor);
    for (const r of renderedRows) {
      process.stdout.write(r + '\n');
      await sleep(28);
    }
    await animate('╚' + '═'.repeat(inner) + '╝', borderColor);
    console.log('');
  });
}

// ─── Animated loader ─────────────────────────────────────────────────────────
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

  if (ANIM) await animateBox(colors.whatsapp, chalk.bold.white('WHATSAPP MESSAGE'), rows);
  else console.log('\n' + buildBox(colors.whatsapp, chalk.bold.white('WHATSAPP MESSAGE'), rows) + '\n');
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

  if (ANIM) await animateBox(colors.telegram, chalk.bold.white('TELEGRAM MESSAGE'), rows);
  else console.log('\n' + buildBox(colors.telegram, chalk.bold.white('TELEGRAM MESSAGE'), rows) + '\n');
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

// ─── logProgress (in-place animated progress bar) ───────────────────────────
const logProgress = (label, percent) => {
  if (!ANIM) return;
  const width = 20;
  const p = Math.max(0, Math.min(100, percent));
  const filled = Math.round((p / 100) * width);
  const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(width - filled));
  process.stdout.write(`\r${chalk.cyan(label)} ${bar} ${String(Math.round(p)).padStart(3)}%`);
  if (p >= 100) process.stdout.write('\n');
};

// ─── logBanner (animated gradient reveal + drawn box) ───────────────────────
const BANNER_ART = `
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
`.trim();

const logBanner = () => {
  console.clear();
  const artLines = BANNER_ART.split('\n');

  const rows = [
    chalk.white('Owner   : ') + chalk.cyan('Mzazi Systems'),
    chalk.white('Version : ') + chalk.cyan('3.0.0'),
    chalk.white('Mode    : ') + chalk.cyan('Premium System'),
    chalk.white('Status  : ') + chalk.green('ONLINE'),
  ];
  const title = chalk.white.bold('⚡ MZAZI QUARTZ ⚡');

  if (ANIM) {
    // 1) reveal the art line by line with a rainbow sweep (synchronous)
    for (let i = 0; i < artLines.length; i++) {
      const hue = (i / Math.max(1, artLines.length)) * 360;
      process.stdout.write(gradient(artLines[i], hue, hue + 130) + '\n');
      sleepSync(40);
    }
    console.log('');
    // 2) draw the info box synchronously so startup logs can't interleave
    const inner = Math.min(64, Math.max(38, ...rows.map(displayWidth), displayWidth(title) + 4));
    const line = (str) => chalk.blue('║') + ' ' + str + pad('', inner - displayWidth(str) - 1) + chalk.blue('║');
    const titlePad = Math.max(0, Math.floor((inner - displayWidth(title)) / 2));
    const draw = (full, colorize) => {
      for (let i = 1; i <= full.length; i++) {
        process.stdout.write('\r' + colorize(full.slice(0, i)) + '\x1b[K');
        sleepSync(3);
      }
      process.stdout.write('\r' + colorize(full) + '\n');
    };
    draw('╔' + '═'.repeat(inner) + '╗', chalk.blue);
    draw(' '.repeat(titlePad) + title, (s) => s);
    draw('╠' + '═'.repeat(inner) + '╣', chalk.blue);
    for (const r of rows) {
      process.stdout.write(line(r) + '\n');
      sleepSync(30);
    }
    draw('╚' + '═'.repeat(inner) + '╝', chalk.blue);
  } else {
    console.log(gradient(BANNER_ART, 220, 320));
    console.log(buildBox(chalk.blue, title, rows, { minWidth: 38 }));
  }
  console.log('');
};

module.exports = {
  logTelegram,
  logWhatsApp,
  logSystem,
  logBanner,
  logProgress,
  colors,
  error,
  info,
  warn,
  debug,
  log,
  showLoader,
};
