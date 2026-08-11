// ─────────────────────────────────────────────────────────────────────────
// LOGGER — Pretty console logging for WhatsApp activity and bot events.
// ─────────────────────────────────────────────────────────────────────────

// ── Colors ──
const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    underscore: "\x1b[4m",
    blink: "\x1b[5m",
    reverse: "\x1b[7m",
    hidden: "\x1b[8m",

    // Foreground colors
    black: "\x1b[30m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    gray: "\x1b[90m",

    // Background colors
    bgBlack: "\x1b[40m",
    bgRed: "\x1b[41m",
    bgGreen: "\x1b[42m",
    bgYellow: "\x1b[43m",
    bgBlue: "\x1b[44m",
    bgMagenta: "\x1b[45m",
    bgCyan: "\x1b[46m",
    bgWhite: "\x1b[47m",

    // Helper functions
    bright: (text) => `\x1b[1m${text}\x1b[0m`,
    dim: (text) => `\x1b[2m${text}\x1b[0m`,
    underline: (text) => `\x1b[4m${text}\x1b[0m`,
    green: (text) => `\x1b[32m${text}\x1b[0m`,
    red: (text) => `\x1b[31m${text}\x1b[0m`,
    yellow: (text) => `\x1b[33m${text}\x1b[0m`,
    blue: (text) => `\x1b[34m${text}\x1b[0m`,
    magenta: (text) => `\x1b[35m${text}\x1b[0m`,
    cyan: (text) => `\x1b[36m${text}\x1b[0m`,
    gray: (text) => `\x1b[90m${text}\x1b[0m`,
    whatsapp: (text) => `\x1b[36m${text}\x1b[0m`, // Cyan for WhatsApp
    success: (text) => `\x1b[32m✓ ${text}\x1b[0m`,
    error: (text) => `\x1b[31m✗ ${text}\x1b[0m`,
    warning: (text) => `\x1b[33m⚠ ${text}\x1b[0m`,
    info: (text) => `\x1b[34mℹ ${text}\x1b[0m`,
};

// ── Bot name ──
let BOT_NAME = "MZAZI TECH QUARTZ BOT";

function setBotName(name) {
    if (name) BOT_NAME = name;
}

// ── Type label for messages ──
function typeLabel(messageType) {
    switch (messageType) {
        case "imageMessage": return "image";
        case "videoMessage": return "video";
        case "audioMessage": return "audio";
        case "stickerMessage": return "sticker";
        case "documentMessage": return "document";
        case "conversation":
        case "extendedTextMessage": return "text";
        default: return messageType || "unknown";
    }
}

// ── Divider ──
function divider() {
    console.log(colors.whatsapp("─".repeat(63)));
}

// ── Log incoming message ──
function logIncomingMessage({ senderName, senderNumber, isGroup, groupName, messageType, text }) {
    const type = typeLabel(messageType);

    divider();
    console.log(`🤖 ${colors.bright(colors.green(BOT_NAME))} • ${colors.bright("📩 New Message")}`);
    console.log(`👤 Sender : ${senderName || "Unknown"}`);
    console.log(`📞 Number : ${senderNumber}`);
    console.log(`💬 Chat   : ${isGroup ? "Group" : "Private"}`);
    if (isGroup) console.log(`🏷 Group  : ${groupName}`);
    console.log(`📝 Type   : ${type}`);

    if (type === "sticker") {
        console.log("📝 Sticker Received");
    } else if (type === "image") {
        console.log(`🖼 Image Caption:\n${text || "(none)"}`);
    } else if (type === "audio") {
        console.log("🎤 Voice Message");
    } else if (text) {
        console.log(`💭 Message:\n${text}`);
    }
    divider();
}

// ── Log group command ──
function logGroupCommand({ groupName, senderName, senderNumber, command }) {
    divider();
    console.log(`🤖 ${colors.bright(colors.green(BOT_NAME))} • ${colors.bright("⚡ Command")}`);
    console.log(`👥 Group: ${groupName}`);
    console.log(`👤 User : ${senderName || "Unknown"}`);
    console.log(`📞 ${senderNumber}`);
    console.log(`⚡ Command: ${command}`);
    divider();
}

// ── Log bot events ──
function logEvent(type, message, data = null) {
    const timestamp = new Date().toLocaleString();
    const logPrefix = `[${timestamp}]`;

    switch (type) {
        case "info":
            console.log(`${colors.gray(logPrefix)} ${colors.info(message)}`);
            break;
        case "success":
            console.log(`${colors.gray(logPrefix)} ${colors.success(message)}`);
            break;
        case "warning":
            console.log(`${colors.gray(logPrefix)} ${colors.warning(message)}`);
            break;
        case "error":
            console.log(`${colors.gray(logPrefix)} ${colors.error(message)}`);
            if (data) console.error(data);
            break;
        case "debug":
            console.log(`${colors.gray(logPrefix)} ${colors.gray(`[DEBUG] ${message}`)}`);
            if (data) console.debug(data);
            break;
        default:
            console.log(`${colors.gray(logPrefix)} ${message}`);
    }
}

// ── Log system status ──
function logSystem(message, type = "info") {
    logEvent(type, message);
}

// ── Log WhatsApp connection ──
function logWhatsApp(message, type = "info") {
    logEvent(type, `[WhatsApp] ${message}`);
}

// ── Logger object ──
const logger = {
    info: (msg) => logEvent("info", msg),
    success: (msg) => logEvent("success", msg),
    warn: (msg) => logEvent("warning", msg),
    error: (msg, data) => logEvent("error", msg, data),
    debug: (msg, data) => logEvent("debug", msg, data),
    system: (msg, type) => logSystem(msg, type),
    whatsapp: (msg, type) => logWhatsApp(msg, type),
    setBotName: setBotName,
};

// ── Exports ──
module.exports = {
    colors,
    logger,
    setBotName,
    logIncomingMessage,
    logGroupCommand,
    logEvent,
    logSystem,
    logWhatsApp,
    typeLabel,
    divider,
};