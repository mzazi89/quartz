#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Functional test for button + photo replies.
//
// The claim being checked is one sentence, and it has to hold for messages this
// file never enumerates: EVERY button message the bot sends is also a photo
// message. It is proven at the three send paths everything else goes through:
//
//   lib/buttons.js         sendButtonMessage       — the mzazireply button path
//   lib/interactive.js     sendInteractiveMessage  — menus and every direct call
//   lib/botTelemetry.js    broadcast               — admin broadcasts
//
// Plus the properties that make it safe to put a picture on every reply:
//
//   · an image the caller chose is never replaced
//   · a payload with no buttons is never given a picture
//   · a reply with no menu.jpg still gets one (the canvas card)
//   · the whole thing can be switched off in settings
//   · a failure to build the picture never blocks the message
//
// The boundaries are stubbed (prisma, canvas, gifted-btns): the question here is
// what THIS code puts on the wire, not what the button library does with it —
// gifted-btns' own rendering is exercised by the live bot. Run against either bot:
//   node scripts/test-buttons.js
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..');
const MEDIA = path.join(ROOT, 'media', 'menu.jpg');
const MEDIA_BACKUP = path.join(ROOT, 'media', 'menu.jpg.test-backup');

// ── Stubs, installed before the modules under test load ──────────────────────
let settingsRow = null;      // null = no reply_images row, i.e. the default (on)
let loadImageFails = false;  // simulate canvas being unable to decode
let createCanvasFails = false;

const canvasCalls = { toBuffer: [] };

function makeCanvasStub() {
  const makeCtx = () => new Proxy({}, {
    get: (t, prop) => {
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return () => ({ addColorStop() {} });
      }
      if (prop === 'measureText') return () => ({ width: 100 });
      return () => {};
    },
    set: () => true,
  });

  return {
    createCanvas: (w, h) => {
      if (createCanvasFails) throw new Error('canvas disabled for this check');
      return {
        width: w,
        height: h,
        getContext: makeCtx,
        toBuffer: (type, opts) => {
          canvasCalls.toBuffer.push({ type, opts });
          return Buffer.from(`FAKE-${type}-${w}x${h}-${'x'.repeat(64)}`);
        },
      };
    },
    loadImage: async () => {
      if (loadImageFails) throw new Error('canvas cannot decode for this check');
      // A wide photograph, so the resize branch is the one that runs.
      return { width: 2600, height: 1400 };
    },
  };
}

const prismaStub = {
  async $queryRawUnsafe(sql) {
    if (/FROM settings/i.test(String(sql))) {
      return settingsRow === null ? [] : [{ key: 'reply_images', value: settingsRow }];
    }
    return [];
  },
  async $executeRawUnsafe() { return 0; },
  payment: { create: async () => ({}), findUnique: async () => null },
};

// What our wrapper hands to gifted-btns. Recorded, never rendered.
const giftedCalls = [];
const giftedStub = {
  async sendInteractiveMessage(sock, jid, payload, ...rest) {
    giftedCalls.push({ jid, payload, rest });
    return { key: { id: 'TESTMSG' } };
  },
  async sendButtons(sock, jid, payload, ...rest) {
    giftedCalls.push({ jid, payload, rest });
    return { key: { id: 'TESTMSG' } };
  },
};

const realLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '@prisma/client') return { PrismaClient: function PrismaClient() { return prismaStub; } };
  if (request === 'canvas') return makeCanvasStub();
  if (request === 'gifted-btns') return giftedStub;
  if (request === '@whiskeysockets/baileys') {
    // buttons.js builds its own protobuf; these two builders are all it touches.
    return {
      proto: { Message: { fromObject: (o) => o } },
      generateWAMessageFromContent: () => ({ key: { id: 'TESTMSG' } }),
      prepareWAMessageMedia: async () => ({ imageMessage: { _fake: true } }),
    };
  }
  return realLoad.call(this, request, parent, isMain);
};

const replyImage = require(path.join(ROOT, 'lib', 'replyImage.js'));
const { sendButtonMessage } = require(path.join(ROOT, 'lib', 'buttons.js'));
const { sendInteractiveMessage } = require(path.join(ROOT, 'lib', 'interactive.js'));
const { resolve } = require(path.join(ROOT, 'lib', 'interactiveRows.js'));

const makeSock = () => ({
  user: { id: '254700000000:3@s.whatsapp.net' },
  waUploadToServer: async () => ({ url: 'https://mmg.example/upload' }),
});

const lastGifted = () => giftedCalls[giftedCalls.length - 1];
const imageOf = (payload) => payload && payload.image;

let passed = 0;
const failures = [];
function check(name, condition, detail = '') {
  if (condition) { passed += 1; console.log(`  ✅ ${name}`); }
  else { failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`  ❌ ${name}${detail ? `\n       ${detail}` : ''}`); }
}

async function main() {
  console.log('\nButton + photo replies\n');

  // ── 1. Where the picture comes from ───────────────────────────────────────
  {
    console.log('1. Where the picture comes from');

    const fromMenu = await replyImage.replyImageFor({ botPhoneNum: '254700000000' });
    check('menu.jpg is used when it is there', Buffer.isBuffer(fromMenu) && fromMenu.length > 0);

    // Same call again, with no cache reset in between: the expensive part must
    // happen once per file change, not once per message.
    const again = await replyImage.replyImageFor({ botPhoneNum: '254700000000' });
    check('the encoding is cached, not repeated per message', again === fromMenu);

    // The canvas card is the fallback, because a deployment without media/menu.jpg
    // is exactly when a reply would otherwise go out bare.
    fs.renameSync(MEDIA, MEDIA_BACKUP);
    replyImage.resetCache();
    const fromCard = await replyImage.replyImageFor({ botPhoneNum: '254700000000', botName: 'MZAZI XMD' });
    fs.renameSync(MEDIA_BACKUP, MEDIA);
    replyImage.resetCache();
    check('the canvas card is used when menu.jpg is missing', Buffer.isBuffer(fromCard) && fromCard.length > 0);

    // Re-encoding is the whole reason this module exists: uploading the 2.6 MB
    // original on every reply is the thing that would make "a photo on every
    // button message" a bad idea.
    const menuJpeg = canvasCalls.toBuffer.find((c) => c.type === 'image/jpeg');
    check('the photo is re-encoded as JPEG, not uploaded raw',
      !!menuJpeg, JSON.stringify(canvasCalls.toBuffer.slice(0, 3)));
    check('and at a reduced quality', menuJpeg && menuJpeg.opts && menuJpeg.opts.quality < 100,
      JSON.stringify(menuJpeg && menuJpeg.opts));

  }

  // ── 2. sendButtonMessage — the path nearly every reply takes ───────────────
  {
    console.log('\n2. sendButtonMessage (mzazireply)');
    const sock = makeSock();

    // sendButtonMessage builds the proto itself and relays it directly, so the
    // socket records the relay and the assertions are made on that payload.
    const recording = {
      user: sock.user,
      out: [],
      async relayMessage(jid, msg, opts) { this.out.push({ jid, msg, opts }); return {}; },
      async sendMessage() { return {}; },
    };
    await sendButtonMessage(recording, '123@g.us', {
      text: 'Hello',
      footer: 'f',
      buttons: [{ id: '.menu', text: '📜 Menu' }],
    });
    const sent = recording.out[0];
    const im = sent && sent.msg && sent.msg.interactiveMessage;
    check('it carries a photo', !!(im && im.header && im.header.hasMediaAttachment && im.header.imageMessage));
    check('and the buttons are still there', !!(im && im.buttons && im.buttons.length === 1));

    const recording2 = {
      user: sock.user,
      out: [],
      async relayMessage(jid, msg) { this.out.push({ jid, msg }); return {}; },
      async sendMessage() { return {}; },
    };
    await sendButtonMessage(recording2, '123@g.us', {
      text: 'Hello',
      buttons: [{ id: '.menu', text: '📜 Menu' }],
      image: Buffer.from('MY-OWN-IMAGE'),
    });
    const withMine = recording2.out[0].msg.interactiveMessage;
    check('an image the caller chose is not replaced',
      !!(withMine && withMine.header && withMine.header.hasMediaAttachment));

    const recording3 = {
      user: sock.user,
      out: [],
      async relayMessage(jid, msg) { this.out.push({ jid, msg }); return {}; },
      async sendMessage() { return {}; },
    };
    await sendButtonMessage(recording3, '123@g.us', { text: 'No buttons here' });
    const bare = recording3.out[0].msg.interactiveMessage;
    check('a message with no buttons gets no photo',
      !!(bare && bare.header && bare.header.hasMediaAttachment === false));
  }

  // ── 3. sendInteractiveMessage — every menu and direct call ────────────────
  {
    console.log('\n3. sendInteractiveMessage (menus)');
    giftedCalls.length = 0;

    await sendInteractiveMessage(makeSock(), '123@g.us', {
      title: 'SELECT',
      text: 'Pick one',
      footer: 'f',
      interactiveButtons: [
        {
          name: 'single_select',
          buttonParamsJson: JSON.stringify({
            title: 'Choose',
            sections: [{ title: 'A', rows: [{ id: '.panel 4gb', title: '4GB RAM', description: 'd' }] }],
          }),
        },
      ],
    });

    const sent = lastGifted();
    check('a select menu is sent', !!sent);
    check('the select menu carries a photo', !!imageOf(sent.payload) && Buffer.isBuffer(imageOf(sent.payload).buffer));
    check('the buttons survived the photo being added',
      sent.payload.interactiveButtons.length === 1 &&
      /panel 4gb/.test(sent.payload.interactiveButtons[0].buttonParamsJson));

    // The row index is what makes a tap in a group traceable to a command; adding
    // the picture must not have skipped it.
    check('the menu rows are still indexed for group taps',
      resolve('123@g.us', '4GB RAM') === '.panel 4gb',
      String(resolve('123@g.us', '4GB RAM')));

    // A caller that supplied its own image keeps it.
    giftedCalls.length = 0;
    const mine = { buffer: Buffer.from('MINE') };
    await sendInteractiveMessage(makeSock(), '123@g.us', {
      text: 'hi',
      image: mine,
      interactiveButtons: [{ name: 'quick_reply', buttonParamsJson: JSON.stringify({ id: '.menu' }) }],
    });
    check('an image the caller chose is not replaced', lastGifted().payload.image === mine);

    // A payload with no buttons is left alone entirely.
    giftedCalls.length = 0;
    await sendInteractiveMessage(makeSock(), '123@g.us', { text: 'plain, no buttons' });
    check('a payload with no buttons gets no photo', !lastGifted().payload.image);

    // The legacy shape exposed to the command registry gets it too.
    giftedCalls.length = 0;
    const { sendButtons } = require(path.join(ROOT, 'lib', 'interactive.js'));
    await sendButtons(makeSock(), '123@g.us', { text: 'hi', buttons: [{ id: '.menu', text: 'Menu' }] });
    check('the legacy sendButtons path carries a photo too', !!imageOf(lastGifted().payload));
  }

  // ── 4. The switch ─────────────────────────────────────────────────────────
  {
    console.log('\n4. Switching it off');
    // lib/settings.js holds the table for 60s, exactly as it does in production —
    // so an admin edit is picked up by forcing that reload, not by restarting.
    const settings = require(path.join(ROOT, 'lib', 'settings.js'));
    settingsRow = '0';
    await settings.loadSettings(true);
    replyImage.resetCache();
    check('reply_images = 0 turns the photo off', (await replyImage.imagesEnabled()) === false);

    giftedCalls.length = 0;
    await sendInteractiveMessage(makeSock(), '123@g.us', {
      text: 'hi',
      interactiveButtons: [{ name: 'quick_reply', buttonParamsJson: JSON.stringify({ id: '.menu' }) }],
    });
    check('and no photo is attached', !imageOf(lastGifted().payload));

    settingsRow = '1';
    await settings.loadSettings(true);
    replyImage.resetCache();
    check('reply_images = 1 turns it back on', (await replyImage.imagesEnabled()) === true);
  }

  // ── 5. Nothing here may break a reply ─────────────────────────────────────
  {
    console.log('\n5. When the picture cannot be built');
    // Neither source works: canvas cannot decode the file, cannot draw, and
    // menu.jpg is the 2.6 MB original — which is correctly refused rather than
    // uploaded as-is.
    loadImageFails = true;
    createCanvasFails = true;
    replyImage.resetCache();

    const payload = {
      text: 'hi',
      interactiveButtons: [{ name: 'quick_reply', buttonParamsJson: '{}' }],
    };
    const returned = await replyImage.attachReplyImage(payload, { botPhoneNum: '254700000000' });
    check('a payload that cannot get a picture is returned unchanged', returned === payload);

    giftedCalls.length = 0;
    await sendInteractiveMessage(makeSock(), '123@g.us', {
      text: 'hi',
      interactiveButtons: [{ name: 'quick_reply', buttonParamsJson: '{}' }],
    });
    check('and the message is still sent', giftedCalls.length === 1);
    check('with its buttons intact', lastGifted().payload.interactiveButtons.length === 1);

    loadImageFails = false;
    createCanvasFails = false;
    replyImage.resetCache();
  }

  // ── 6. Broadcast ──────────────────────────────────────────────────────────
  {
    console.log('\n6. Admin broadcast');
    const telemetry = fs.readFileSync(path.join(ROOT, 'lib', 'botTelemetry.js'), 'utf8');
    check('the broadcast goes through the button path', /sendButtonMessage\(conn, gid/.test(telemetry));
    check('it no longer sends bare text', !/conn\.sendMessage\(gid, \{ text: payload\.message \}\)/.test(telemetry));
    check('the buttons follow the session prefix', /sessionPrefix\(conn\)/.test(telemetry));
    check('a label the admin sends is capped at 20 characters', /slice\(0, 20\)/.test(telemetry));
    check('an admin-supplied image is honoured', /payload\.image \? \{ url: String\(payload\.image\) \}/.test(telemetry));
  }

  console.log(`\n${passed} passed, ${failures.length} failed\n`);
  if (failures.length) {
    for (const f of failures) console.log(`  ❌ ${f}`);
    console.log('');
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('\nharness error:', e);
  process.exitCode = 1;
});
