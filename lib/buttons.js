// ─────────────────────────────────────────────────────────────────────────────
// NATIVE INTERACTIVE BUTTONS (buttonReply format)
//
// Sends WhatsApp interactive buttons directly via the baileys protobuf —
// the format that renders on regular (consumer) WhatsApp accounts. Falls
// back to a plain text message if the send fails so commands never break.
// ─────────────────────────────────────────────────────────────────────────────
const crypto = require('crypto');
const { proto, generateWAMessageFromContent, prepareWAMessageMedia } = require('@whiskeysockets/baileys');

function randomMessageId() {
  return `3EB0${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Send an interactive button message.
 * @param sock  the WhatsApp socket (WA.activeSessions.get(number))
 * @param jid   the chat id (sender / group)
 * @param opts  { text, footer, buttons: [{ id, text }], image? }
 */
async function sendButtonMessage(sock, jid, opts = {}) {
  const { text = '', footer = '© Bot', buttons = [], image = null } = opts;

  const content = {
    interactiveMessage: {
      header: { hasMediaAttachment: false },
      body: { text: String(text) },
      footer: { text: String(footer) },
      contextInfo: { forwardingScore: 999, isForwarded: true },
      buttons: buttons.map((b, i) => ({
        buttonId: String(b.id || `btn_${i}`),
        buttonText: { displayText: String(b.text || 'Menu') },
        type: 1,
      })),
    },
  };

  // Optional header image
  if (image) {
    try {
      const media = await prepareWAMessageMedia({ image }, { upload: sock.waUploadToServer });
      content.interactiveMessage.header = {
        hasMediaAttachment: true,
        imageMessage: media.imageMessage,
      };
    } catch (e) {
      // Header upload failed — send the image as a separate media message
      // first, then the buttons, so the picture still reaches the user.
      console.error('[buttons] image prep failed:', e.message);
      content.interactiveMessage.header = { hasMediaAttachment: false };
      try {
        const imgPayload = Buffer.isBuffer(image)
          ? image
          : image && image.url ? { url: image.url } : image;
        await sock.sendMessage(jid, { image: imgPayload, caption: String(text) });
        // avoid duplicating the text in the follow-up buttons message
        content.interactiveMessage.body.text = '';
      } catch (e2) {
        console.error('[buttons] image fallback also failed:', e2.message);
      }
    }
  }

  try {
    const msg = proto.Message.fromObject(content);
    const keyMsg = generateWAMessageFromContent(jid, { conversation: '' }, {});
    await sock.relayMessage(jid, msg, { messageId: keyMsg.key.id });
    console.log(`✅ [buttons] interactive message sent to ${jid} (${buttons.length} buttons)`);
    return true;
  } catch (e) {
    console.error(`❌ [buttons] send failed: ${e.message}`);
    // Fallback: plain text so the command still answers
    try {
      await sock.sendMessage(jid, { text: `${text}\n\n${footer}` });
      console.log(`[buttons] fallback text sent to ${jid}`);
      return false;
    } catch (e2) {
      console.error(`[buttons] fallback also failed: ${e2.message}`);
      throw e2;
    }
  }
}

module.exports = { sendButtonMessage, randomMessageId };
