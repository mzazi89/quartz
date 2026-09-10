// ─────────────────────────────────────────────────────────────────────────────
// MZAZI XMD — command pack, part 3 of 4: IMAGES, STICKERS, AUDIO
//
// These work on media the user sends WITH the command (or replies to), and use
// ffmpeg through the `ffmpeg` binding already wired into the command context —
// fluent-ffmpeg is a dependency of case.js, so the binary is present on the host.
//
// ── Honest limitation ────────────────────────────────────────────────────────
// I cannot exercise a WhatsApp media pipeline from where this was written. The
// parts I can reason about with confidence are the guards (no media, wrong type,
// oversized file) and the ffmpeg invocations, which are standard. If anything in
// this part misbehaves, it will most likely be the send shape rather than the
// processing, and that is a one-line fix per command.
//
// Every command writes to os.tmpdir() and cleans up after itself, because a bot
// that leaks temp files on every sticker eventually fills its disk.
// ─────────────────────────────────────────────────────────────────────────────

module.exports = [
  {
    name: 'sticker',
    aliases: ['s', 'makesticker'],
    description: 'Turn an image, video or GIF into a WhatsApp sticker',
    category: 'Stickers',
    usage: 'Send an image with .sticker as the caption',
    code: `const msg = (m && m.message) ? m.message : {};
const media = msg.imageMessage || msg.videoMessage || msg.stickerMessage;
if (!media) return mzazireply('📎 Send an image or short video with *' + prefix + 'sticker* as the caption.');
const gifLike = !!(msg.videoMessage || msg.stickerMessage);
if (gifLike && media.seconds && media.seconds > 8) return mzazireply('❌ Keep video stickers under 8 seconds.');
const tmp = path.join(os.tmpdir(), 'xmd_' + Date.now());
try {
  const buf = await downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: mzazi.updateMediaMessage });
  if (!buf || !buf.length) return mzazireply('❌ Could not download that media.');
  if (buf.length > 12 * 1024 * 1024) return mzazireply('❌ That file is too large — keep it under 12 MB.');
  const input = tmp + '_in';
  const output = tmp + '_out.webp';
  fs.writeFileSync(input, buf);
  const cmd = gifLike
    ? ffmpeg(input).outputOptions(['-vcodec libwebp', '-vf scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:-1:-1:color=0x00000000', '-loop 0', '-preset default', '-an', '-vsync 0']).toFormat('webp')
    : ffmpeg(input).outputOptions(['-vcodec libwebp', '-vf scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:-1:-1:color=0x00000000', '-preset default', '-an', '-vsync 0']).toFormat('webp');
  await new Promise(function (resolve, reject) {
    cmd.save(output).on('end', resolve).on('error', reject);
  });
  const out = fs.readFileSync(output);
  await mzazi.sendMessage(sender, { sticker: out }, { quoted: m });
  return;
} catch (e) {
  return mzazireply('❌ Sticker failed: ' + e.message);
} finally {
  try { fs.rmSync(tmp + '_in', { force: true }); } catch (e) {}
  try { fs.rmSync(tmp + '_out.webp', { force: true }); } catch (e) {}
}`,
  },
  {
    name: 'toimg',
    aliases: ['toimage', 'unsticker'],
    description: 'Convert a sticker back into an image',
    category: 'Stickers',
    usage: 'Send a sticker with .toimg as the caption',
    code: `const msg = (m && m.message) ? m.message : {};
if (!msg.stickerMessage) return mzazireply('📎 Send a *sticker* with ' + prefix + 'toimg as the caption.');
const tmp = path.join(os.tmpdir(), 'xmd_' + Date.now());
try {
  const buf = await downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: mzazi.updateMediaMessage });
  if (!buf || !buf.length) return mzazireply('❌ Could not download that sticker.');
  const input = tmp + '.webp', output = tmp + '.png';
  fs.writeFileSync(input, buf);
  await new Promise(function (resolve, reject) {
    // -vcodec png is not enough on its own: a sticker may have an animated WebP
    // payload, and taking frame 0 gives a still rather than an error.
    ffmpeg(input).outputOptions(['-vframes 1']).save(output).on('end', resolve).on('error', reject);
  });
  const png = fs.readFileSync(output);
  await mzazi.sendMessage(sender, { image: png, caption: '🖼 Converted from sticker' }, { quoted: m });
  return;
} catch (e) {
  return mzazireply('❌ Conversion failed: ' + e.message);
} finally {
  try { fs.rmSync(tmp + '.webp', { force: true }); } catch (e) {}
  try { fs.rmSync(tmp + '.png', { force: true }); } catch (e) {}
}`,
  },
  {
    name: 'togif',
    aliases: ['tovideo', 'mp4'],
    description: 'Turn a sticker or short video into an MP4',
    category: 'Stickers',
    usage: 'Send a sticker or video with .togif as the caption',
    code: `const msg = (m && m.message) ? m.message : {};
const media = msg.stickerMessage || msg.videoMessage;
if (!media) return mzazireply('📎 Send a sticker or video with ' + prefix + 'togif as the caption.');
const tmp = path.join(os.tmpdir(), 'xmd_' + Date.now());
try {
  const buf = await downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: mzazi.updateMediaMessage });
  const input = tmp + '_in', output = tmp + '.mp4';
  fs.writeFileSync(input, buf);
  await new Promise(function (resolve, reject) {
    ffmpeg(input)
      .outputOptions(['-pix_fmt yuv420p', '-movflags +faststart', '-vf scale=trunc(iw/2)*2:trunc(ih/2)*2'])
      .toFormat('mp4')
      .save(output).on('end', resolve).on('error', reject);
  });
  await mzazi.sendMessage(sender, { video: fs.readFileSync(output), mimetype: 'video/mp4', gifPlayback: true, caption: '🎞 Converted' }, { quoted: m });
  return;
} catch (e) {
  return mzazireply('❌ Conversion failed: ' + e.message);
} finally {
  try { fs.rmSync(tmp + '_in', { force: true }); } catch (e) {}
  try { fs.rmSync(tmp + '.mp4', { force: true }); } catch (e) {}
}`,
  },
  {
    name: 'grayscale',
    aliases: ['bw', 'greyscale'],
    description: 'Turn an image black and white',
    category: 'Images',
    usage: 'Send an image with .grayscale as the caption',
    code: `const msg = (m && m.message) ? m.message : {};
if (!msg.imageMessage) return mzazireply('📎 Send an *image* with ' + prefix + 'grayscale as the caption.');
const tmp = path.join(os.tmpdir(), 'xmd_' + Date.now());
try {
  const buf = await downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: mzazi.updateMediaMessage });
  fs.writeFileSync(tmp + '.in', buf);
  await new Promise(function (resolve, reject) {
    ffmpeg(tmp + '.in').videoFilters('hue=s=0').save(tmp + '.jpg').on('end', resolve).on('error', reject);
  });
  await mzazi.sendMessage(sender, { image: fs.readFileSync(tmp + '.jpg'), caption: '⚫⚪ Grayscale' }, { quoted: m });
  return;
} catch (e) { return mzazireply('❌ Failed: ' + e.message); }
finally {
  try { fs.rmSync(tmp + '.in', { force: true }); } catch (e) {}
  try { fs.rmSync(tmp + '.jpg', { force: true }); } catch (e) {}
}`,
  },
  {
    name: 'invert',
    aliases: ['negative'],
    description: 'Invert the colours of an image',
    category: 'Images',
    usage: 'Send an image with .invert as the caption',
    code: `const msg = (m && m.message) ? m.message : {};
if (!msg.imageMessage) return mzazireply('📎 Send an *image* with ' + prefix + 'invert as the caption.');
const tmp = path.join(os.tmpdir(), 'xmd_' + Date.now());
try {
  const buf = await downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: mzazi.updateMediaMessage });
  fs.writeFileSync(tmp + '.in', buf);
  await new Promise(function (resolve, reject) {
    ffmpeg(tmp + '.in').videoFilters('negate').save(tmp + '.jpg').on('end', resolve).on('error', reject);
  });
  await mzazi.sendMessage(sender, { image: fs.readFileSync(tmp + '.jpg'), caption: '🔄 Inverted' }, { quoted: m });
  return;
} catch (e) { return mzazireply('❌ Failed: ' + e.message); }
finally {
  try { fs.rmSync(tmp + '.in', { force: true }); } catch (e) {}
  try { fs.rmSync(tmp + '.jpg', { force: true }); } catch (e) {}
}`,
  },
  {
    name: 'sepia',
    aliases: ['vintage'],
    description: 'Apply a sepia filter',
    category: 'Images',
    usage: 'Send an image with .sepia as the caption',
    code: `const msg = (m && m.message) ? m.message : {};
if (!msg.imageMessage) return mzazireply('📎 Send an *image* with ' + prefix + 'sepia as the caption.');
const tmp = path.join(os.tmpdir(), 'xmd_' + Date.now());
try {
  const buf = await downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: mzazi.updateMediaMessage });
  fs.writeFileSync(tmp + '.in', buf);
  await new Promise(function (resolve, reject) {
    ffmpeg(tmp + '.in').videoFilters('colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131').save(tmp + '.jpg').on('end', resolve).on('error', reject);
  });
  await mzazi.sendMessage(sender, { image: fs.readFileSync(tmp + '.jpg'), caption: '🟤 Sepia' }, { quoted: m });
  return;
} catch (e) { return mzazireply('❌ Failed: ' + e.message); }
finally {
  try { fs.rmSync(tmp + '.in', { force: true }); } catch (e) {}
  try { fs.rmSync(tmp + '.jpg', { force: true }); } catch (e) {}
}`,
  },
  {
    name: 'blur',
    aliases: ['blurimg'],
    description: 'Blur an image',
    category: 'Images',
    usage: 'Send an image with .blur as the caption',
    code: `const msg = (m && m.message) ? m.message : {};
if (!msg.imageMessage) return mzazireply('📎 Send an *image* with ' + prefix + 'blur as the caption.');
const tmp = path.join(os.tmpdir(), 'xmd_' + Date.now());
try {
  const buf = await downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: mzazi.updateMediaMessage });
  fs.writeFileSync(tmp + '.in', buf);
  await new Promise(function (resolve, reject) {
    ffmpeg(tmp + '.in').videoFilters('boxblur=8:2').save(tmp + '.jpg').on('end', resolve).on('error', reject);
  });
  await mzazi.sendMessage(sender, { image: fs.readFileSync(tmp + '.jpg'), caption: '🌫 Blurred' }, { quoted: m });
  return;
} catch (e) { return mzazireply('❌ Failed: ' + e.message); }
finally {
  try { fs.rmSync(tmp + '.in', { force: true }); } catch (e) {}
  try { fs.rmSync(tmp + '.jpg', { force: true }); } catch (e) {}
}`,
  },
  {
    name: 'sharpen',
    aliases: [],
    description: 'Sharpen an image',
    category: 'Images',
    usage: 'Send an image with .sharpen as the caption',
    code: `const msg = (m && m.message) ? m.message : {};
if (!msg.imageMessage) return mzazireply('📎 Send an *image* with ' + prefix + 'sharpen as the caption.');
const tmp = path.join(os.tmpdir(), 'xmd_' + Date.now());
try {
  const buf = await downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: mzazi.updateMediaMessage });
  fs.writeFileSync(tmp + '.in', buf);
  await new Promise(function (resolve, reject) {
    ffmpeg(tmp + '.in').videoFilters('unsharp=5:5:1.2:5:5:0.0').save(tmp + '.jpg').on('end', resolve).on('error', reject);
  });
  await mzazi.sendMessage(sender, { image: fs.readFileSync(tmp + '.jpg'), caption: '✨ Sharpened' }, { quoted: m });
  return;
} catch (e) { return mzazireply('❌ Failed: ' + e.message); }
finally {
  try { fs.rmSync(tmp + '.in', { force: true }); } catch (e) {}
  try { fs.rmSync(tmp + '.jpg', { force: true }); } catch (e) {}
}`,
  },
  {
    name: 'rotate',
    aliases: ['rotateimg'],
    description: 'Rotate an image by 90, 180 or 270 degrees',
    category: 'Images',
    usage: 'Send an image with .rotate 90 as the caption',
    code: `const msg = (m && m.message) ? m.message : {};
if (!msg.imageMessage) return mzazireply('📎 Send an *image* with ' + prefix + 'rotate <90|180|270>');
const deg = parseInt((Array.isArray(args) ? args[0] : '') || '90', 10);
if ([90, 180, 270].indexOf(deg) === -1) return mzazireply('❌ Use 90, 180 or 270.');
const tmp = path.join(os.tmpdir(), 'xmd_' + Date.now());
try {
  const buf = await downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: mzazi.updateMediaMessage });
  fs.writeFileSync(tmp + '.in', buf);
  await new Promise(function (resolve, reject) {
    ffmpeg(tmp + '.in').videoFilters('transpose=' + (deg === 90 ? 1 : deg === 270 ? 2 : 1) + (deg === 180 ? ',transpose=1' : '')).save(tmp + '.jpg').on('end', resolve).on('error', reject);
  });
  await mzazi.sendMessage(sender, { image: fs.readFileSync(tmp + '.jpg'), caption: '🔃 Rotated ' + deg + '°' }, { quoted: m });
  return;
} catch (e) { return mzazireply('❌ Failed: ' + e.message); }
finally {
  try { fs.rmSync(tmp + '.in', { force: true }); } catch (e) {}
  try { fs.rmSync(tmp + '.jpg', { force: true }); } catch (e) {}
}`,
  },
  {
    name: 'mirror',
    aliases: ['flipimg', 'hflip'],
    description: 'Mirror an image horizontally',
    category: 'Images',
    usage: 'Send an image with .mirror as the caption',
    code: `const msg = (m && m.message) ? m.message : {};
if (!msg.imageMessage) return mzazireply('📎 Send an *image* with ' + prefix + 'mirror as the caption.');
const tmp = path.join(os.tmpdir(), 'xmd_' + Date.now());
try {
  const buf = await downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: mzazi.updateMediaMessage });
  fs.writeFileSync(tmp + '.in', buf);
  await new Promise(function (resolve, reject) {
    ffmpeg(tmp + '.in').videoFilters('hflip').save(tmp + '.jpg').on('end', resolve).on('error', reject);
  });
  await mzazi.sendMessage(sender, { image: fs.readFileSync(tmp + '.jpg'), caption: '🪞 Mirrored' }, { quoted: m });
  return;
} catch (e) { return mzazireply('❌ Failed: ' + e.message); }
finally {
  try { fs.rmSync(tmp + '.in', { force: true }); } catch (e) {}
  try { fs.rmSync(tmp + '.jpg', { force: true }); } catch (e) {}
}`,
  },
  {
    name: 'thumbnail',
    aliases: ['resize', 'smallimg'],
    description: 'Shrink an image to a maximum width',
    category: 'Images',
    usage: '.thumbnail [width]  (send an image with it)',
    code: `const msg = (m && m.message) ? m.message : {};
if (!msg.imageMessage) return mzazireply('📎 Send an *image* with ' + prefix + 'thumbnail [width]');
let w = parseInt((Array.isArray(args) ? args[0] : '') || '512', 10);
if (isNaN(w) || w < 32) w = 512;
if (w > 4096) return mzazireply('❌ Maximum width is 4096.');
const tmp = path.join(os.tmpdir(), 'xmd_' + Date.now());
try {
  const buf = await downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: mzazi.updateMediaMessage });
  fs.writeFileSync(tmp + '.in', buf);
  await new Promise(function (resolve, reject) {
    ffmpeg(tmp + '.in').videoFilters('scale=' + w + ':-1').save(tmp + '.jpg').on('end', resolve).on('error', reject);
  });
  const out = fs.readFileSync(tmp + '.jpg');
  await mzazi.sendMessage(sender, { image: out, caption: '📐 ' + formatBytes(out.length) + ' at up to ' + w + 'px wide' }, { quoted: m });
  return;
} catch (e) { return mzazireply('❌ Failed: ' + e.message); }
finally {
  try { fs.rmSync(tmp + '.in', { force: true }); } catch (e) {}
  try { fs.rmSync(tmp + '.jpg', { force: true }); } catch (e) {}
}`,
  },
  {
    name: 'compress',
    aliases: ['shrinkimg'],
    description: 'Compress an image to save space',
    category: 'Images',
    usage: 'Send an image with .compress as the caption',
    code: `const msg = (m && m.message) ? m.message : {};
if (!msg.imageMessage) return mzazireply('📎 Send an *image* with ' + prefix + 'compress as the caption.');
const tmp = path.join(os.tmpdir(), 'xmd_' + Date.now());
try {
  const buf = await downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: mzazi.updateMediaMessage });
  fs.writeFileSync(tmp + '.in', buf);
  await new Promise(function (resolve, reject) {
    ffmpeg(tmp + '.in').outputOptions(['-q:v 7', '-vf scale=min(1600\\,iw):-1']).save(tmp + '.jpg').on('end', resolve).on('error', reject);
  });
  const out = fs.readFileSync(tmp + '.jpg');
  const saved = buf.length > 0 ? Math.max(0, Math.round((1 - out.length / buf.length) * 100)) : 0;
  await mzazi.sendMessage(sender, { image: out, caption: '🗜 ' + formatBytes(buf.length) + ' → ' + formatBytes(out.length) + (saved ? ' (' + saved + '% smaller)' : '') }, { quoted: m });
  return;
} catch (e) { return mzazireply('❌ Failed: ' + e.message); }
finally {
  try { fs.rmSync(tmp + '.in', { force: true }); } catch (e) {}
  try { fs.rmSync(tmp + '.jpg', { force: true }); } catch (e) {}
}`,
  },
  {
    name: 'img2gif',
    aliases: ['makegif'],
    description: 'Turn a short video into a GIF',
    category: 'Images',
    usage: 'Send a video with .img2gif as the caption',
    code: `const msg = (m && m.message) ? m.message : {};
if (!msg.videoMessage) return mzazireply('📎 Send a *video* with ' + prefix + 'img2gif as the caption.');
const tmp = path.join(os.tmpdir(), 'xmd_' + Date.now());
try {
  const buf = await downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: mzazi.updateMediaMessage });
  if (buf.length > 20 * 1024 * 1024) return mzazireply('❌ Keep the video under 20 MB.');
  fs.writeFileSync(tmp + '.in', buf);
  await new Promise(function (resolve, reject) {
    ffmpeg(tmp + '.in').outputOptions(['-vf fps=12,scale=480:-1:flags=lanczos', '-t 8', '-loop 0']).toFormat('gif').save(tmp + '.gif').on('end', resolve).on('error', reject);
  });
  await mzazi.sendMessage(sender, { video: fs.readFileSync(tmp + '.gif'), mimetype: 'video/mp4', gifPlayback: true, caption: '🎞 GIF' }, { quoted: m });
  return;
} catch (e) { return mzazireply('❌ Failed: ' + e.message); }
finally {
  try { fs.rmSync(tmp + '.in', { force: true }); } catch (e) {}
  try { fs.rmSync(tmp + '.gif', { force: true }); } catch (e) {}
}`,
  },
  {
    name: 'img2url',
    aliases: ['uploadimg', 'imgupload'],
    description: 'Upload an image and get a shareable link (uses 0x0.st)',
    category: 'Images',
    usage: 'Send an image with .img2url as the caption',
    code: `const msg = (m && m.message) ? m.message : {};
if (!msg.imageMessage) return mzazireply('📎 Send an *image* with ' + prefix + 'img2url as the caption.');
try {
  const buf = await downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: mzazi.updateMediaMessage });
  if (buf.length > 8 * 1024 * 1024) return mzazireply('❌ Keep the image under 8 MB.');
  const FormData = require('form-data');
  const form = new FormData();
  form.append('file', buf, { filename: 'image.jpg' });
  const res = await axios.post('https://0x0.st', form, { headers: form.getHeaders(), timeout: 45000, maxBodyLength: Infinity });
  const link = String(res.data || '').trim();
  if (!/^https?:\\/\\//.test(link)) return mzazireply('❌ The upload host did not return a link.');
  return mzazireply('🔗 ' + link + '\\n\\nSize: ' + formatBytes(buf.length));
} catch (e) { return mzazireply('❌ Upload failed: ' + e.message); }`,
  },

  // ── Audio ──────────────────────────────────────────────────────────────────
  {
    name: 'toaudio',
    aliases: ['tomp3', 'mp3'],
    description: 'Convert a voice note or video to MP3',
    category: 'Audio',
    usage: 'Send a voice note or video with .toaudio as the caption',
    code: `const msg = (m && m.message) ? m.message : {};
const media = msg.audioMessage || msg.videoMessage;
if (!media) return mzazireply('📎 Send a *voice note*, *audio* or *video* with ' + prefix + 'toaudio as the caption.');
const tmp = path.join(os.tmpdir(), 'xmd_' + Date.now());
try {
  const buf = await downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: mzazi.updateMediaMessage });
  fs.writeFileSync(tmp + '.in', buf);
  await new Promise(function (resolve, reject) {
    ffmpeg(tmp + '.in').audioCodec('libmp3lame').audioBitrate('128k').toFormat('mp3').save(tmp + '.mp3').on('end', resolve).on('error', reject);
  });
  const out = fs.readFileSync(tmp + '.mp3');
  await mzazi.sendMessage(sender, { audio: out, mimetype: 'audio/mpeg', fileName: 'audio.mp3', caption: '🎵 ' + formatBytes(out.length) }, { quoted: m });
  return;
} catch (e) { return mzazireply('❌ Conversion failed: ' + e.message); }
finally {
  try { fs.rmSync(tmp + '.in', { force: true }); } catch (e) {}
  try { fs.rmSync(tmp + '.mp3', { force: true }); } catch (e) {}
}`,
  },
  {
    name: 'tovoice',
    aliases: ['makevoice', 'vn'],
    description: 'Turn any audio into a WhatsApp voice note',
    category: 'Audio',
    usage: 'Send audio with .tovoice as the caption',
    code: `const msg = (m && m.message) ? m.message : {};
const media = msg.audioMessage || msg.videoMessage;
if (!media) return mzazireply('📎 Send *audio* or *video* with ' + prefix + 'tovoice as the caption.');
const tmp = path.join(os.tmpdir(), 'xmd_' + Date.now());
try {
  const buf = await downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: mzazi.updateMediaMessage });
  fs.writeFileSync(tmp + '.in', buf);
  await new Promise(function (resolve, reject) {
    // opus in an ogg container is what WhatsApp expects for a voice note
    ffmpeg(tmp + '.in').audioCodec('libopus').audioBitrate('64k').outputOptions(['-vbr on', '-compression_level 10', '-frame_duration 60', '-application voip']).toFormat('ogg').save(tmp + '.ogg').on('end', resolve).on('error', reject);
  });
  await mzazi.sendMessage(sender, { audio: fs.readFileSync(tmp + '.ogg'), mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: m });
  return;
} catch (e) { return mzazireply('❌ Conversion failed: ' + e.message); }
finally {
  try { fs.rmSync(tmp + '.in', { force: true }); } catch (e) {}
  try { fs.rmSync(tmp + '.ogg', { force: true }); } catch (e) {}
}`,
  },
  {
    name: 'bass',
    aliases: ['bassboost'],
    description: 'Boost the bass in an audio clip',
    category: 'Audio',
    usage: '.bass [level]  (send audio with it)',
    code: `const msg = (m && m.message) ? m.message : {};
const media = msg.audioMessage || msg.videoMessage;
if (!media) return mzazireply('📎 Send *audio* with ' + prefix + 'bass [level 1-20]');
let lvl = parseInt((Array.isArray(args) ? args[0] : '') || '10', 10);
if (isNaN(lvl) || lvl < 1) lvl = 10;
if (lvl > 20) lvl = 20;
const tmp = path.join(os.tmpdir(), 'xmd_' + Date.now());
try {
  const buf = await downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: mzazi.updateMediaMessage });
  fs.writeFileSync(tmp + '.in', buf);
  const gain = 'bass=g=' + lvl;
  await new Promise(function (resolve, reject) {
    ffmpeg(tmp + '.in').audioFilters(gain).audioCodec('libmp3lame').toFormat('mp3').save(tmp + '.mp3').on('end', resolve).on('error', reject);
  });
  await mzazi.sendMessage(sender, { audio: fs.readFileSync(tmp + '.mp3'), mimetype: 'audio/mpeg', fileName: 'bass.mp3', caption: '🔊 Bass +' + lvl }, { quoted: m });
  return;
} catch (e) { return mzazireply('❌ Failed: ' + e.message); }
finally {
  try { fs.rmSync(tmp + '.in', { force: true }); } catch (e) {}
  try { fs.rmSync(tmp + '.mp3', { force: true }); } catch (e) {}
}`,
  },
  {
    name: 'reverseaudio',
    aliases: ['audioreverse'],
    description: 'Play audio backwards',
    category: 'Audio',
    usage: 'Send audio with .reverseaudio as the caption',
    code: `const msg = (m && m.message) ? m.message : {};
const media = msg.audioMessage || msg.videoMessage;
if (!media) return mzazireply('📎 Send *audio* with ' + prefix + 'reverseaudio as the caption.');
const tmp = path.join(os.tmpdir(), 'xmd_' + Date.now());
try {
  const buf = await downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: mzazi.updateMediaMessage });
  fs.writeFileSync(tmp + '.in', buf);
  await new Promise(function (resolve, reject) {
    ffmpeg(tmp + '.in').audioFilters('areverse').audioCodec('libmp3lame').toFormat('mp3').save(tmp + '.mp3').on('end', resolve).on('error', reject);
  });
  await mzazi.sendMessage(sender, { audio: fs.readFileSync(tmp + '.mp3'), mimetype: 'audio/mpeg', fileName: 'reversed.mp3', caption: '⏪ Reversed' }, { quoted: m });
  return;
} catch (e) { return mzazireply('❌ Failed: ' + e.message); }
finally {
  try { fs.rmSync(tmp + '.in', { force: true }); } catch (e) {}
  try { fs.rmSync(tmp + '.mp3', { force: true }); } catch (e) {}
}`,
  },
  {
    name: 'audiospeed',
    aliases: ['speed', 'faster'],
    description: 'Speed audio up or down',
    category: 'Audio',
    usage: '.audiospeed 1.5  (send audio with it)',
    code: `const msg = (m && m.message) ? m.message : {};
const media = msg.audioMessage || msg.videoMessage;
if (!media) return mzazireply('📎 Send *audio* with ' + prefix + 'audiospeed <0.5-3>');
const rate = parseFloat((Array.isArray(args) ? args[0] : '') || '1.5');
if (isNaN(rate) || rate < 0.5 || rate > 3) return mzazireply('❌ Speed must be between 0.5 and 3.');
const tmp = path.join(os.tmpdir(), 'xmd_' + Date.now());
try {
  const buf = await downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: mzazi.updateMediaMessage });
  fs.writeFileSync(tmp + '.in', buf);
  await new Promise(function (resolve, reject) {
    ffmpeg(tmp + '.in').audioFilters('atempo=' + rate).audioCodec('libmp3lame').toFormat('mp3').save(tmp + '.mp3').on('end', resolve).on('error', reject);
  });
  await mzazi.sendMessage(sender, { audio: fs.readFileSync(tmp + '.mp3'), mimetype: 'audio/mpeg', fileName: 'speed.mp3', caption: '⏩ Speed x' + rate }, { quoted: m });
  return;
} catch (e) { return mzazireply('❌ Failed: ' + e.message); }
finally {
  try { fs.rmSync(tmp + '.in', { force: true }); } catch (e) {}
  try { fs.rmSync(tmp + '.mp3', { force: true }); } catch (e) {}
}`,
  },
  {
    name: 'audioinfo',
    aliases: ['mediainfo', 'probe'],
    description: 'Show the format, duration and bitrate of a media file',
    category: 'Audio',
    usage: 'Send audio or video with .audioinfo as the caption',
    code: `const msg = (m && m.message) ? m.message : {};
const media = msg.audioMessage || msg.videoMessage || msg.imageMessage || msg.documentMessage;
if (!media) return mzazireply('📎 Send a media file with ' + prefix + 'audioinfo as the caption.');
const tmp = path.join(os.tmpdir(), 'xmd_' + Date.now());
try {
  const buf = await downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: mzazi.updateMediaMessage });
  fs.writeFileSync(tmp + '.in', buf);
  const meta = await new Promise(function (resolve, reject) {
    ffmpeg.ffprobe(tmp + '.in', function (err, data) { if (err) return reject(err); resolve(data); });
  });
  const v = (meta.streams || []).find(function (s) { return s.codec_type === 'video'; });
  const a = (meta.streams || []).find(function (s) { return s.codec_type === 'audio'; });
  const lines = ['📼 *Media info*', '', 'Size: ' + formatBytes(buf.length), 'Format: ' + (meta.format && meta.format.format_name ? meta.format.format_name : '-'), 'Duration: ' + (meta.format && meta.format.duration ? Number(meta.format.duration).toFixed(1) + 's' : '-')];
  if (v) lines.push('Video: ' + v.codec_name + ' · ' + v.width + 'x' + v.height);
  if (a) lines.push('Audio: ' + a.codec_name + ' · ' + (a.sample_rate || '-') + ' Hz');
  return mzazireply(lines.join('\\n'));
} catch (e) { return mzazireply('❌ Could not read that file: ' + e.message); }
finally {
  try { fs.rmSync(tmp + '.in', { force: true }); } catch (e) {}
}`,
  },
  {
    name: 'trimaudio',
    aliases: ['clipsound', 'cut'],
    description: 'Cut a section out of an audio file',
    category: 'Audio',
    usage: '.trimaudio <start> <end>  e.g. .trimaudio 0:10 0:40',
    code: `const msg = (m && m.message) ? m.message : {};
const media = msg.audioMessage || msg.videoMessage;
if (!media) return mzazireply('📎 Send *audio* with ' + prefix + 'trimaudio <start> <end>, e.g. 0:10 0:40');
const from = (Array.isArray(args) ? args[0] : '') || '';
const to = (Array.isArray(args) ? args[1] : '') || '';
const okTime = function (s) { return /^(\\d{1,2}:)?\\d{1,2}:\\d{1,2}$|^\\d{1,3}(\\.\\d+)?$/.test(String(s)); };
if (!okTime(from) || !okTime(to)) return mzazireply('❌ Times must look like 0:10 or 1:02:30.');
const tmp = path.join(os.tmpdir(), 'xmd_' + Date.now());
try {
  const buf = await downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: mzazi.updateMediaMessage });
  fs.writeFileSync(tmp + '.in', buf);
  await new Promise(function (resolve, reject) {
    ffmpeg(tmp + '.in').outputOptions(['-ss', from, '-to', to]).audioCodec('libmp3lame').toFormat('mp3').save(tmp + '.mp3').on('end', resolve).on('error', reject);
  });
  const out = fs.readFileSync(tmp + '.mp3');
  if (!out.length) return mzazireply('❌ That range produced an empty clip — check the times.');
  await mzazi.sendMessage(sender, { audio: out, mimetype: 'audio/mpeg', fileName: 'clip.mp3', caption: '✂️ ' + from + ' → ' + to }, { quoted: m });
  return;
} catch (e) { return mzazireply('❌ Trim failed: ' + e.message); }
finally {
  try { fs.rmSync(tmp + '.in', { force: true }); } catch (e) {}
  try { fs.rmSync(tmp + '.mp3', { force: true }); } catch (e) {}
}`,
  },
  {
    name: 'voicemeta',
    aliases: ['voiceinfo'],
    description: 'Show details of a voice note without converting it',
    category: 'Audio',
    usage: 'Send a voice note with .voicemeta as the caption',
    code: `const msg = (m && m.message) ? m.message : {};
if (!msg.audioMessage) return mzazireply('📎 Send a *voice note* with ' + prefix + 'voicemeta as the caption.');
const a = msg.audioMessage;
return mzazireply('🎙 *Voice note*\\n\\nDuration: ' + (a.seconds || '?') + 's\\nMimetype: ' + (a.mimetype || '-') + '\\nStreamed: ' + (a.ptt ? 'yes (voice note)' : 'no (audio file)') + '\\nSize: ' + (a.fileLength ? formatBytes(Number(a.fileLength)) : 'unknown'));`,
  },
];
