const chalk = require('chalk');
const moment = require('moment-timezone');

// ─── palette ────────────────────────────────────────────────────────────────
const colors = {
  telegram: chalk.hex('#0088cc'),
  whatsapp: chalk.hex('#25D366'),
  system:   chalk.hex('#FFA500'),
  error:    chalk.hex('#FF0000'),
  success:  chalk.hex('#00FF00'),
  user:     chalk.hex('#FFD700'),
  command:  chalk.hex('#FF00FF'),
  group:    chalk.hex('#00CED1'),
  dm:       chalk.hex('#FF69B4'),
};

const getTime = () => moment.tz('Africa/Nairobi').format('HH:mm:ss');

// ─── Animated loader ─────────────────────────────────────────────────────────
// Plays a short terminal spinner with rotating status lines, then clears.
// Returns a Promise so callers can await it before printing the box.
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

async function showLoader(accentColor, steps) {
  return new Promise((resolve) => {
    let frame  = 0;
    let step   = 0;
    let tick   = 0;
    const STEP_EVERY = 7;   // spinner ticks before advancing to next step
    const TICK_MS    = 55;  // ms per tick  → total ≈ steps × STEP_EVERY × TICK_MS

    const interval = setInterval(() => {
      const spinner = accentColor(SPINNER_FRAMES[frame % SPINNER_FRAMES.length]);
      const label   = chalk.dim(steps[Math.min(step, steps.length - 1)]);
      process.stdout.write(`\r  ${spinner}  ${label}   `);

      frame++;
      tick++;
      if (tick % STEP_EVERY === 0) step++;

      if (step >= steps.length) {
        clearInterval(interval);
        process.stdout.write('\r\x1b[K'); // erase the loader line
        resolve();
      }
    }, TICK_MS);
  });
}

// ─── WhatsApp loader steps ───────────────────────────────────────────────────
const WA_STEPS = [
  '📡 Receiving WhatsApp packet...',
  '🔐 Decrypting Signal protocol...',
  '🛡️  Verifying sender identity...',
  '📨 Parsing message content...',
  '✅ Message ready!',
];

// ─── Telegram loader steps ───────────────────────────────────────────────────
const TG_STEPS = [
  '📡 Polling Telegram server...',
  '🔍 Reading update payload...',
  '🛡️  Authenticating user...',
  '📨 Processing message...',
  '✅ Message ready!',
];

// ─── logWhatsApp ─────────────────────────────────────────────────────────────
const logWhatsApp = async (data) => {
  const { sender, senderName, chatType, chatName, command, message, isGroup, isOwner, isPaid } = data;

  await showLoader(colors.whatsapp, WA_STEPS);

  const pad = (str, n) => ' '.repeat(Math.max(0, n - (str?.length || 0)));
  const C   = colors.whatsapp;

  console.log('\n' + C('╔═══════════════════════════════════════════════════════════╗'));
  console.log(C('║') + '  ' + chalk.bold.white('WHATSAPP MESSAGE') + '                                      ' + C('║'));
  console.log(C('╠═══════════════════════════════════════════════════════════╣'));

  const name = senderName || sender.split('@')[0];
  const from = isGroup ? colors.group(chatName || 'Group') : colors.dm('Direct Message');
  const fromLen = isGroup ? (chatName?.length || 5) : 14;
  const role = isOwner ? chalk.red('Owner') : isPaid ? chalk.yellow('Paid') : chalk.white('User');
  const roleLen = isOwner ? 5 : 4;

  console.log(C('║') + '  ' + chalk.bold('Time:    ') + chalk.cyan(getTime())            + pad(getTime(), 48)            + C('║'));
  console.log(C('║') + '  ' + chalk.bold('User:    ') + colors.user(name)                + pad(name, 48)                + C('║'));
  console.log(C('║') + '  ' + chalk.bold('From:    ') + from                             + pad('x'.repeat(fromLen), 48) + C('║'));
  console.log(C('║') + '  ' + chalk.bold('Type:    ') + chalk.magenta(chatType)          + pad(chatType, 48)            + C('║'));
  console.log(C('║') + '  ' + chalk.bold('Command: ') + (command ? colors.command(command) : chalk.gray('none')) + pad(command || 'none', 48) + C('║'));
  console.log(C('║') + '  ' + chalk.bold('Role:    ') + role                             + pad('x'.repeat(roleLen), 48) + C('║'));
  console.log(C('╠═══════════════════════════════════════════════════════════╣'));

  if (message) {
    const lines = message.match(/.{1,55}/g) || [message];
    lines.forEach((line, i) => {
      const label = i === 0 ? chalk.bold('Message: ') : '         ';
      console.log(C('║') + '  ' + label + chalk.white(line) + pad(line, 48) + C('║'));
    });
  }

  console.log(C('╚═══════════════════════════════════════════════════════════╝') + '\n');
};

// ─── logTelegram ─────────────────────────────────────────────────────────────
const logTelegram = async (data) => {
  const { userId, username, firstName, action, message, messageType = 'text' } = data;

  await showLoader(colors.telegram, TG_STEPS);

  const pad = (str, n) => ' '.repeat(Math.max(0, n - (str?.toString().length || 0)));
  const C   = colors.telegram;

  console.log('\n' + C('╔═══════════════════════════════════════════════════════════╗'));
  console.log(C('║') + '  ' + chalk.bold.white('TELEGRAM MESSAGE') + '                                       ' + C('║'));
  console.log(C('╠═══════════════════════════════════════════════════════════╣'));

  const uname = `${firstName} (@${username || 'none'})`;
  const actionColored = action.toLowerCase().includes('group') ? colors.group(action) : colors.dm(action);

  console.log(C('║') + '  ' + chalk.bold('Time:    ') + chalk.cyan(getTime())     + pad(getTime(), 48)          + C('║'));
  console.log(C('║') + '  ' + chalk.bold('User:    ') + colors.user(uname)        + pad(uname, 48)              + C('║'));
  console.log(C('║') + '  ' + chalk.bold('User ID: ') + chalk.yellow(userId)      + pad(userId?.toString(), 47) + C('║'));
  console.log(C('║') + '  ' + chalk.bold('Action:  ') + actionColored             + pad(action, 48)             + C('║'));
  console.log(C('║') + '  ' + chalk.bold('Type:    ') + chalk.magenta(messageType) + pad(messageType, 48)       + C('║'));
  console.log(C('╠═══════════════════════════════════════════════════════════╣'));

  if (message) {
    const lines = message.match(/.{1,55}/g) || [message];
    lines.forEach((line, i) => {
      const label = i === 0 ? chalk.bold('Message: ') : '         ';
      console.log(C('║') + '  ' + label + chalk.white(line) + pad(line, 48) + C('║'));
    });
  }

  console.log(C('╚═══════════════════════════════════════════════════════════╝') + '\n');
};

// ─── logSystem ───────────────────────────────────────────────────────────────
const logSystem = (message, type = 'info') => {
  const color = type === 'error' ? colors.error : type === 'success' ? colors.success : colors.system;
  const icon  = type === 'error' ? '❌' : type === 'success' ? '✅' : '📡';
  console.log(color(`${icon} [${getTime()}] ${message}`));
};

// The command handler uses the familiar logger.error/info/warn/debug API.
// Keep those methods available alongside the bot-specific pretty loggers.
const error = (...args) => console.error(...args);
const info = (...args) => console.info(...args);
const warn = (...args) => console.warn(...args);
const debug = (...args) => console.debug(...args);

// ─── logBanner ───────────────────────────────────────────────────────────────
const logBanner = () => {
  console.clear();

  console.log(chalk.hex('#0066FF').bold(`
███╗   ██╗ █████╗  ██████╗██╗  ██╗███████╗████████╗██╗   ██╗
████╗  ██║██╔══██╗██╔════╝██║  ██║██╔════╝╚══██╔══╝╚██╗ ██╔╝
██╔██╗ ██║███████║██║     ███████║█████╗     ██║    ╚████╔╝
██║╚██╗██║██╔══██║██║     ██╔══██║██╔══╝     ██║     ╚██╔╝
██║ ╚████║██║  ██║╚██████╗██║  ██║███████╗   ██║      ██║
╚═╝  ╚═══╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝   ╚═╝      ╚═╝

██████╗ ██████╗ ██╗███╗   ███╗███████╗
██╔══██╗██╔══██╗██║████╗ ████║██╔════╝
██████╔╝██████╔╝██║██╔████╔██║█████╗
██╔═══╝ ██╔══██╗██║██║╚██╔╝██║██╔══╝
██║     ██║  ██║██║██║ ╚═╝ ██║███████╗
╚═╝     ╚═╝  ╚═╝╚═╝╚═╝     ╚═╝╚══════╝
`));

  console.log(chalk.blue('══════════════════════════════╗'));
  console.log(chalk.blue('║') + '           ' + chalk.white.bold('👑 NACHETY PRIME 👑') + '                    ' + chalk.blue('║'));
  console.log(chalk.blue('╠═══════════════════════════════╣'));
  console.log(chalk.blue('║') + '  ' + chalk.white('Owner   : ') + chalk.cyan('Nachety Dev')          + '                           ' + chalk.blue('║'));
  console.log(chalk.blue('║') + '  ' + chalk.white('Version : ') + chalk.cyan('2.0.0 Dark Edition')   + '                      '    + chalk.blue('║'));
  console.log(chalk.blue('║') + '  ' + chalk.white('Mode    : ') + chalk.cyan('Premium System')       + '                        '  + chalk.blue('║'));
  console.log(chalk.blue('║') + '  ' + chalk.white('Status  : ') + chalk.green('ONLINE')              + '                                ' + chalk.blue('║'));
  console.log(chalk.blue('╚══════════════════════════════╝'));
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
};
