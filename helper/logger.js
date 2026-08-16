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

// ─── Palette (calm monochrome + amber accent, truecolor ANSI) ────────────────
// Intended for dark terminals. Emits raw ANSI codes, e.g.:
//   amber  #F2A93B -> \x1b[38;2;242;169;59m
//   cobalt #4C7DFC -> \x1b[38;2;76;125;252m
// Meta lines stay dim grey; red is reserved for errors only.
const c = {
  amber:  chalk.rgb(242, 169, 59),
  cobalt: chalk.rgb(76, 125, 252),
  grey:   chalk.rgb(128, 132, 142),
  red:    chalk.rgb(255, 107, 107),
  white:  chalk.rgb(230, 233, 238),
};

const colors = {
  telegram: c.cobalt,
  whatsapp: c.amber,
  system:   c.amber,
  error:    c.red,
  success:  c.cobalt,
  warn:     c.amber,
  debug:    c.grey,
  user:     c.white,
  command:  c.amber,
  group:    c.cobalt,
  dm:       c.white,
};

// ─── Log levels ─────────────────────────────────────────────────────────────
// Filtering via LOG_LEVEL env (debug < info/success < warn < error).
// Plain-ASCII level tags — no emoji in logs.
const LEVELS = { debug: 0, info: 1, success: 1, warn: 2, error: 3 };
const LEVEL_META = {
  error:   { tag: 'ERR', color: colors.error },
  warn:    { tag: 'WRN', color: colors.warn },
  info:    { tag: 'INF', color: colors.system },
  success: { tag: 'OK',  color: colors.success },
  debug:   { tag: 'DBG', color: colors.debug },
};
const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();
const shouldLog = (level) =>
  (LEVELS[level] ?? LEVELS.info) >= (LEVELS[LOG_LEVEL] ?? LEVELS.info);

// ─── Display-width helpers (CJK aware) ──────────────────────────────────────
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
      (c >= 0x2600 && c <= 0x27BF) || (c >= 0x1F000 && c <= 0x1FAFF) ||
      (c >= 0x20000 && c <= 0x2FFFD)
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

// ─── Field label (aligned label column inside boxes) ────────────────────────
const field = (name, value) => c.grey.bold(name.padEnd(9)) + ' ' + value;

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

// ─── Animated box (calm sweep of the border, staggered rows) ─────────────────
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
      await sleep(2);
    }
    process.stdout.write('\r' + final(full) + '\n');
  };

  return enqueue(async () => {
    console.log('');
    await animate('╔' + '═'.repeat(inner) + '╗', borderColor);
    await animate(' '.repeat(titlePad) + title, (s) => s);
    await animate('╠' + '═'.repeat(inner) + '╣', borderColor);
    for (const r of renderedRows) {
      process.stdout.write(r + '\n');
      await sleep(18);
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
      const label = c.grey(steps[Math.min(step, steps.length - 1)]);
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
  'Receiving WhatsApp packet...',
  'Decrypting Signal protocol...',
  'Verifying sender identity...',
  'Parsing message content...',
  'Message ready.',
];

const TG_STEPS = [
  'Polling Telegram server...',
  'Reading update payload...',
  'Authenticating user...',
  'Processing message...',
  'Message ready.',
];

// ─── logWhatsApp ────────────────────────────────────────────────────────────
const logWhatsApp = async (data) => {
  const { sender, senderName, chatType, chatName, command, message, isGroup, isOwner, isPaid } = data;

  if (ANIM) await showLoader(colors.whatsapp, WA_STEPS);

  const name = senderName || (sender ? sender.split('@')[0] : 'Unknown');
  const from = isGroup ? colors.group(chatName || 'Group') : colors.dm('Direct Message');
  const role = isOwner ? c.amber.bold('Owner') : isPaid ? c.white('Paid') : c.grey('User');

  const rows = [
    field('Time', c.white(timeShort())),
    field('User', c.amber(name)),
    field('From', from),
    field('Type', c.white(chatType)),
    field('Command', command ? c.amber(command) : c.grey('none')),
    field('Role', role),
  ];
  if (message) rows.push(field('Message', c.white(message)));

  const title = c.amber.bold('WHATSAPP MESSAGE');
  if (ANIM) await animateBox(colors.whatsapp, title, rows);
  else console.log('\n' + buildBox(colors.whatsapp, title, rows) + '\n');
};

// ─── logTelegram ────────────────────────────────────────────────────────────
const logTelegram = async (data) => {
  const { userId, username, firstName, action, message, messageType = 'text' } = data;

  if (ANIM) await showLoader(colors.telegram, TG_STEPS);

  const uname = `${firstName} (@${username || 'none'})`;
  const actionColored = action.toLowerCase().includes('group') ? colors.group(action) : colors.dm(action);

  const rows = [
    field('Time', c.white(timeShort())),
    field('User', c.amber(uname)),
    field('User ID', c.white(userId)),
    field('Action', actionColored),
    field('Type', c.white(messageType)),
  ];
  if (message) rows.push(field('Message', c.white(message)));

  const title = c.amber.bold('TELEGRAM MESSAGE');
  if (ANIM) await animateBox(colors.telegram, title, rows);
  else console.log('\n' + buildBox(colors.telegram, title, rows) + '\n');
};

// ─── logSystem (leveled) ────────────────────────────────────────────────────
const logSystem = (message, type = 'info') => {
  if (!shouldLog(type)) return;
  const meta = LEVEL_META[type] || LEVEL_META.info;
  console.log(`${c.grey(timeShort())} ${meta.color(`[${meta.tag}]`)} ${message}`);
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
  const bar = c.amber('█'.repeat(filled)) + c.grey('░'.repeat(width - filled));
  process.stdout.write(`\r${c.cobalt(label)} ${bar} ${c.grey(String(Math.round(p)).padStart(3) + '%')}`);
  if (p >= 100) process.stdout.write('\n');
};

// ─── logBanner (amber art + info box) ───────────────────────────────────────
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
    field('Owner', c.white('Mzazi Systems')),
    field('Version', c.white('3.0.0')),
    field('Mode', c.white('Premium System')),
    field('Port', c.white(process.env.WEBHOOK_PORT || '3000')),
    field('Status', c.amber.bold('ONLINE')),
  ];
  const title = c.amber.bold('MZAZI QUARTZ');

  if (ANIM) {
    // 1) reveal the art line by line in amber (synchronous)
    for (let i = 0; i < artLines.length; i++) {
      process.stdout.write(c.amber(artLines[i]) + '\n');
      sleepSync(22);
    }
    console.log('');
    // 2) draw the info box synchronously so startup logs can't interleave
    const inner = Math.min(64, Math.max(38, ...rows.map(displayWidth), displayWidth(title) + 4));
    const line = (str) => c.cobalt('║') + ' ' + str + pad('', inner - displayWidth(str) - 1) + c.cobalt('║');
    const titlePad = Math.max(0, Math.floor((inner - displayWidth(title)) / 2));
    const draw = (full, colorize) => {
      for (let i = 1; i <= full.length; i++) {
        process.stdout.write('\r' + colorize(full.slice(0, i)) + '\x1b[K');
        sleepSync(2);
      }
      process.stdout.write('\r' + colorize(full) + '\n');
    };
    draw('╔' + '═'.repeat(inner) + '╗', c.cobalt);
    draw(' '.repeat(titlePad) + title, (s) => s);
    draw('╠' + '═'.repeat(inner) + '╣', c.cobalt);
    for (const r of rows) {
      process.stdout.write(line(r) + '\n');
      sleepSync(24);
    }
    draw('╚' + '═'.repeat(inner) + '╝', c.cobalt);
  } else {
    console.log(c.amber(BANNER_ART));
    console.log(buildBox(c.cobalt, title, rows, { minWidth: 38 }));
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
