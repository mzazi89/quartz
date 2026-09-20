// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS BOT SAID
//
// In a self-chat ("Message yourself") every message is `fromMe` — the owner's and the
// bot's own — so `fromMe` cannot tell them apart. Anything that answers an incoming
// message and keeps state open can therefore end up answering itself: the bot's own
// reply arrives as new input, provokes another, and so on.
//
// Recording the message ID alone turned out to be not enough — the echo did not always
// carry the id that sendMessage returned, and the spam continued. The TEXT is recorded
// as well, because an echo is character-for-character what was sent, so the body alone
// is enough to recognise it.
//
// Kept in its own module so the rule can be exercised directly.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_REMEMBERED = 200;

const ids = new Set();
const texts = new Set();

function remember(set, value) {
  set.add(value);
  // Bounded: this is a short-lived guard, not a log.
  if (set.size > MAX_REMEMBERED) set.delete(set.values().next().value);
}

// The words inside a sent message, whatever shape it was sent in.
function textOf(sent, payload) {
  // What we asked to send is the most reliable source: our own code builds it, so its
  // shape is known — unlike whatever the library returns.
  const candidates = [
    payload && typeof payload.text === 'string' ? payload.text : '',
    payload && typeof payload.caption === 'string' ? payload.caption : '',
  ];

  const m = sent && sent.message;
  if (m) {
    candidates.push(
      typeof m.conversation === 'string' ? m.conversation : '',
      m.extendedTextMessage && m.extendedTextMessage.text,
      m.imageMessage && m.imageMessage.caption,
      m.videoMessage && m.videoMessage.caption,
      // Interactive content: the body is what comes back when a menu is echoed.
      m.interactiveMessage && m.interactiveMessage.body && m.interactiveMessage.body.text,
      m.viewOnceMessage && m.viewOnceMessage.message &&
        m.viewOnceMessage.message.interactiveMessage &&
        m.viewOnceMessage.message.interactiveMessage.body &&
        m.viewOnceMessage.message.interactiveMessage.body.text
    );
  }

  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return '';
}

function rememberSent(sent, payload) {
  try {
    const id = sent && sent.key && sent.key.id;
    if (id) remember(ids, id);
    const text = textOf(sent, payload);
    if (text) remember(texts, text);
  } catch (e) {
    // Never let bookkeeping break a send.
  }
}

// Is this incoming message something this bot produced?
function isOwnEcho(id, text) {
  if (id && ids.has(id)) return true;
  const t = String(text == null ? '' : text).trim();
  return Boolean(t) && texts.has(t);
}

// Record everything the socket sends. Returned so callers can keep using the socket.
function wrapSocket(sock) {
  if (!sock || sock.__mzaziTracksOwnSends || typeof sock.sendMessage !== 'function') return sock;
  const base = sock.sendMessage.bind(sock);
  sock.sendMessage = async (...args) => {
    const payload = args[1];
    const sent = await base(...args);
    rememberSent(sent, payload);
    return sent;
  };
  sock.__mzaziTracksOwnSends = true;
  return sock;
}

module.exports = { wrapSocket, rememberSent, isOwnEcho };
