// ─────────────────────────────────────────────────────────────────────────────
// MZAZI XMD — command pack, part 4 of 4: DOCUMENTS, FILES, AND THE DOWNLOADERS
//
// ── READ THIS BEFORE EXPECTING THE DOWNLOADERS TO WORK ───────────────────────
// The six commands at the top of this file need an endpoint on your own host.
// They call ONE convention:
//
//   GET {mzaziSiteUrl}/api/xmd/download
//       ?url=<the link>&format=<audio|video|file>&key={mzaziApiKey}
//   →  200 { "ok": true, "url": "<direct media link>", "title": "...", "size": 123 }
//   →  or { "ok": false, "error": "why" }
//
// That endpoint does not exist yet. I refused to guess at URLs on your site,
// because a downloader written against an invented path is a command that looks
// finished and returns 404 for everyone. Until the endpoint is built these reply
// with exactly what is missing, so nobody is left guessing either.
//
// `mzaziSiteUrl` and `mzaziApiKey` are already wired into the command context
// (settings.js), which is why this is the natural place for them.
//
// Everything after the downloaders is pure JS on files the user sends, and has
// no external dependency at all.
// ─────────────────────────────────────────────────────────────────────────────

// Shared by every downloader. Kept as a string so each body can inline it —
// command bodies are independent functions and cannot share scope.
const HELPERS = `
const ask = async function (targetUrl, format) {
  const base = String(mzaziSiteUrl || '').replace(/\\/+$/, '');
  if (!base) return { ok: false, error: 'mzaziSiteUrl is not configured in settings' };
  const key = (typeof getMzaziApiKey === 'function' ? getMzaziApiKey() : mzaziApiKey) || mzaziApiKey || '';
  try {
    const res = await axios.get(base + '/api/xmd/download', {
      params: { url: targetUrl, format: format, key: key },
      timeout: 90000,
      validateStatus: function () { return true; },
    });
    const d = res.data;
    if (!d || typeof d !== 'object') return { ok: false, error: 'the server sent an unexpected reply (HTTP ' + res.status + ')' };
    if (d.ok === false) return { ok: false, error: d.error || 'the server refused that link' };
    if (!d.url) return { ok: false, error: 'the server replied without a media link' };
    return { ok: true, url: d.url, title: d.title || '', size: d.size || 0 };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
const missing = function () {
  return mzazireply('⚙️ This downloader needs the endpoint below, which does not exist yet:\\n\\n' +
    'GET ' + String(mzaziSiteUrl || 'https://mzazi.shop').replace(/\\/+$/, '') + '/api/xmd/download\\n' +
    '?url=...&format=...&key=...\\n\\n' +
    'It should reply with { ok: true, url } — see the header of scripts/xmd/part4.js.');
};
`;

const BODY_HEADER = HELPERS + `
const link = (Array.isArray(args) ? args.join(' ').trim() : '').trim();
if (!link) return mzazireply('Usage: ' + prefix + 'NAME <link>');
if (!/^https?:\\/\\//i.test(link)) return mzazireply('❌ That does not look like a link.');
const r = await ask(link, 'FORMAT');
if (!r.ok) return mzazireply('❌ ' + r.error + '\\n\\n(If this is the first time, the download endpoint may not be deployed yet — see ' + prefix + 'dlhelp)');
`;

const BODY_TAIL = `
try {
  const media = await axios.get(r.url, { responseType: 'arraybuffer', timeout: 120000, maxContentLength: 64 * 1024 * 1024 });
  const buf = Buffer.from(media.data);
  if (!buf.length) return mzazireply('❌ The download came back empty.');
  SEND
  return;
} catch (e) {
  return mzazireply('❌ Downloaded the link but could not fetch the file: ' + e.message);
}`;

const build = (name, format, send) =>
  BODY_HEADER.replace('NAME', name).replace('FORMAT', format) + BODY_TAIL.replace('SEND', send);

module.exports = [
  // ── Downloaders — need the endpoint described at the top of this file ──────
  {
    name: 'ytvideo',
    aliases: ['ytmp4', 'ytdl'],
    description: 'Download a YouTube video (needs /api/xmd/download on your host)',
    category: 'Downloads',
    usage: '.ytvideo <youtube link>',
    code: build('ytvideo', 'video',
      `await mzazi.sendMessage(sender, { video: buf, mimetype: 'video/mp4', caption: '🎬 ' + (r.title || 'Video') + '\\n' + formatBytes(buf.length) }, { quoted: m });`),
  },
  {
    name: 'ytaudio',
    aliases: ['ytmp3', 'ytsong'],
    description: 'Download YouTube audio as MP3 (needs /api/xmd/download)',
    category: 'Downloads',
    usage: '.ytaudio <youtube link>',
    code: build('ytaudio', 'audio',
      `await mzazi.sendMessage(sender, { audio: buf, mimetype: 'audio/mpeg', fileName: (r.title || 'audio') + '.mp3', caption: '🎵 ' + (r.title || 'Audio') + '\\n' + formatBytes(buf.length) }, { quoted: m });`),
  },
  {
    name: 'tiktok',
    aliases: ['tt', 'ttdl'],
    description: 'Download a TikTok video without the watermark (needs /api/xmd/download)',
    category: 'Downloads',
    usage: '.tiktok <tiktok link>',
    code: build('tiktok', 'video',
      `await mzazi.sendMessage(sender, { video: buf, mimetype: 'video/mp4', caption: '🎵 TikTok\\n' + formatBytes(buf.length) }, { quoted: m });`),
  },
  {
    name: 'instagram',
    aliases: ['ig', 'igdl', 'reel'],
    description: 'Download an Instagram post or reel (needs /api/xmd/download)',
    category: 'Downloads',
    usage: '.instagram <instagram link>',
    code: build('instagram', 'video',
      `await mzazi.sendMessage(sender, { video: buf, mimetype: 'video/mp4', caption: '📸 Instagram\\n' + formatBytes(buf.length) }, { quoted: m });`),
  },
  {
    name: 'facebook',
    aliases: ['fb', 'fbdl'],
    description: 'Download a Facebook video (needs /api/xmd/download)',
    category: 'Downloads',
    usage: '.facebook <facebook link>',
    code: build('facebook', 'video',
      `await mzazi.sendMessage(sender, { video: buf, mimetype: 'video/mp4', caption: '📘 Facebook\\n' + formatBytes(buf.length) }, { quoted: m });`),
  },
  {
    name: 'twitter',
    aliases: ['x', 'xdl'],
    description: 'Download a video from X / Twitter (needs /api/xmd/download)',
    category: 'Downloads',
    usage: '.twitter <x.com link>',
    code: build('twitter', 'video',
      `await mzazi.sendMessage(sender, { video: buf, mimetype: 'video/mp4', caption: '𝕏 Video\\n' + formatBytes(buf.length) }, { quoted: m });`),
  },
  {
    name: 'dlhelp',
    aliases: ['downloadhelp'],
    description: 'Explain what the downloaders need before they can work',
    category: 'Downloads',
    usage: '.dlhelp',
    code: `const base = String(mzaziSiteUrl || 'https://mzazi.shop').replace(/\\/+$/, '');
return mzazireply('📥 *Download commands*\\n\\n' +
  'These are ready, but they need one endpoint on your host:\\n\\n' +
  base + '/api/xmd/download\\n' +
  '  ?url=<link>&format=<audio|video|file>&key=<api key>\\n\\n' +
  '*Reply with:*\\n' +
  '{ "ok": true, "url": "<direct media link>", "title": "...", "size": 123 }\\n\\n' +
  'or { "ok": false, "error": "why" }\\n\\n' +
  'Until it exists they say so instead of failing mysteriously.\\n\\n' +
  'Commands waiting on it: ' + prefix + 'ytvideo, ' + prefix + 'ytaudio, ' + prefix + 'tiktok, ' + prefix + 'instagram, ' + prefix + 'facebook, ' + prefix + 'twitter');`,
  },

  // ── Documents and files — pure JS, no external dependency ─────────────────
  {
    name: 'docinfo',
    aliases: ['filemeta'],
    description: 'Show the name, type and size of a document you send',
    category: 'Files',
    usage: 'Send a document with .docinfo as the caption',
    code: `const msg = (m && m.message) ? m.message : {};
const doc = msg.documentMessage || msg.imageMessage || msg.videoMessage || msg.audioMessage;
if (!doc) return mzazireply('📎 Send a *document* with ' + prefix + 'docinfo as the caption.');
const size = doc.fileLength ? formatBytes(Number(doc.fileLength)) : 'unknown';
return mzazireply('📄 *File details*\\n\\nName: ' + (doc.fileName || '(none)') + '\\nType: ' + (doc.mimetype || '(unknown)') + '\\nSize: ' + size + (doc.pageCount ? '\\nPages: ' + doc.pageCount : ''));`,
  },
  {
    name: 'filehash',
    aliases: ['hashfile', 'checksum'],
    description: 'MD5 and SHA-256 of a file you send',
    category: 'Files',
    usage: 'Send a document with .filehash as the caption',
    code: `const crypto = require('crypto');
const msg = (m && m.message) ? m.message : {};
const doc = msg.documentMessage || msg.imageMessage || msg.videoMessage || msg.audioMessage;
if (!doc) return mzazireply('📎 Send a *file* with ' + prefix + 'filehash as the caption.');
try {
  const buf = await downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: mzazi.updateMediaMessage });
  if (!buf || !buf.length) return mzazireply('❌ Could not download that file.');
  const md5 = crypto.createHash('md5').update(buf).digest('hex');
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  return mzazireply('🔐 *' + (doc.fileName || 'file') + '*\\n\\nSize: ' + formatBytes(buf.length) + '\\n\\nMD5:\\n' + md5 + '\\n\\nSHA-256:\\n' + sha);
} catch (e) { return mzazireply('❌ Hashing failed: ' + e.message); }`,
  },
  {
    name: 'textfile',
    aliases: ['maketxt', 'savetext'],
    description: 'Save text you type as a .txt document',
    category: 'Files',
    usage: '.textfile <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'textfile <text>');
const buf = Buffer.from(t, 'utf8');
if (buf.length > 4 * 1024 * 1024) return mzazireply('❌ Keep it under 4 MB.');
await mzazi.sendMessage(sender, { document: buf, mimetype: 'text/plain', fileName: 'note-' + Date.now() + '.txt', caption: '📄 ' + formatBytes(buf.length) }, { quoted: m });
return;`,
  },
  {
    name: 'jsonfile',
    aliases: ['makejson'],
    description: 'Save text as a formatted .json document',
    category: 'Files',
    usage: '.jsonfile <json>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'jsonfile <json>');
let pretty;
try { pretty = JSON.stringify(JSON.parse(t), null, 2); }
catch (e) { return mzazireply('❌ That is not valid JSON: ' + e.message); }
const buf = Buffer.from(pretty, 'utf8');
await mzazi.sendMessage(sender, { document: buf, mimetype: 'application/json', fileName: 'data-' + Date.now() + '.json', caption: '🗂 ' + formatBytes(buf.length) }, { quoted: m });
return;`,
  },
  {
    name: 'jsonformat',
    aliases: ['prettyjson', 'jsonprettify'],
    description: 'Pretty-print JSON in the chat',
    category: 'Files',
    usage: '.jsonformat <json>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'jsonformat <json>');
try {
  const pretty = JSON.stringify(JSON.parse(t), null, 2);
  if (pretty.length > 3500) return mzazireply('⚠️ Too long to show here. Use ' + prefix + 'jsonfile to get it as a document.');
  return mzazireply(pretty);
} catch (e) { return mzazireply('❌ Invalid JSON: ' + e.message); }`,
  },
  {
    name: 'jsonvalidate',
    aliases: ['checkjson'],
    description: 'Check whether some text is valid JSON, and say where it breaks',
    category: 'Files',
    usage: '.jsonvalidate <json>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'jsonvalidate <json>');
try {
  const parsed = JSON.parse(t);
  const kind = Array.isArray(parsed) ? 'array' : typeof parsed;
  const keys = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? Object.keys(parsed).length : 0;
  return mzazireply('✅ Valid JSON\\n\\nRoot type: ' + kind + (keys ? '\\nTop-level keys: ' + keys : '') + (Array.isArray(parsed) ? '\\nItems: ' + parsed.length : ''));
} catch (e) { return mzazireply('❌ Invalid JSON\\n\\n' + e.message); }`,
  },
  {
    name: 'csv2json',
    aliases: ['csvtojson'],
    description: 'Convert CSV text into JSON',
    category: 'Files',
    usage: '.csv2json <csv>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'csv2json <csv text>');
const lines = t.split(/\\r?\\n/).filter(function (l) { return l.trim(); });
if (lines.length < 2) return mzazireply('❌ Give a header row and at least one data row.');
const split = function (line) {
  const out = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === ',' && !inQ) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(function (s) { return s.trim(); });
};
const header = split(lines[0]);
const rows = [];
for (let i = 1; i < lines.length; i++) {
  const cells = split(lines[i]);
  const obj = {};
  header.forEach(function (h, j) { obj[h] = cells[j] === undefined ? '' : cells[j]; });
  rows.push(obj);
}
const out = JSON.stringify(rows, null, 2);
if (out.length > 3500) return mzazireply('⚠️ That is ' + rows.length + ' rows — too long here. Use ' + prefix + 'jsonfile to get a document.');
return mzazireply(out);`,
  },
  {
    name: 'md5',
    aliases: ['md5text'],
    description: 'MD5 hash of some text',
    category: 'Generators',
    usage: '.md5 <text>',
    code: `const crypto = require('crypto');
const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'md5 <text>');
return mzazireply(crypto.createHash('md5').update(t, 'utf8').digest('hex'));`,
  },
  {
    name: 'sha256',
    aliases: ['sha', 'sha256text'],
    description: 'SHA-256 hash of some text',
    category: 'Generators',
    usage: '.sha256 <text>',
    code: `const crypto = require('crypto');
const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'sha256 <text>');
return mzazireply(crypto.createHash('sha256').update(t, 'utf8').digest('hex'));`,
  },
  {
    name: 'sha1',
    aliases: ['sha1text'],
    description: 'SHA-1 hash of some text',
    category: 'Generators',
    usage: '.sha1 <text>',
    code: `const crypto = require('crypto');
const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'sha1 <text>');
return mzazireply(crypto.createHash('sha1').update(t, 'utf8').digest('hex'));`,
  },
  {
    name: 'hmac',
    aliases: ['sign'],
    description: 'HMAC-SHA256 of text with a secret',
    category: 'Generators',
    usage: '.hmac <secret> <text>',
    code: `const crypto = require('crypto');
if (!Array.isArray(args) || args.length < 2) return mzazireply('Usage: ' + prefix + 'hmac <secret> <text>');
const secret = args[0];
const payload = args.slice(1).join(' ');
const out = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
return mzazireply('🔏 ' + out + '\\n\\n⚠️ You just put a secret in a chat. Rotate it if it matters.');`,
  },
  {
    name: 'chunktext',
    aliases: ['splittext', 'chunks'],
    description: 'Split long text into numbered chunks that fit a message',
    category: 'Text',
    usage: '.chunktext <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'chunktext <text>');
const size = 3000;
if (t.length <= size) return mzazireply(t);
const parts = [];
for (let i = 0; i < t.length; i += size) parts.push(t.slice(i, i + size));
if (parts.length > 6) return mzazireply('❌ That would be ' + parts.length + ' messages. Use ' + prefix + 'textfile instead.');
for (let i = 0; i < parts.length; i++) {
  await mzazireply('(' + (i + 1) + '/' + parts.length + ')\\n' + parts[i]);
}
return;`,
  },
  {
    name: 'findreplace',
    aliases: ['replace', 'swap'],
    description: 'Replace every occurrence of one string with another',
    category: 'Text',
    usage: '.findreplace <find> | <replace> | <text>',
    code: `const raw = (Array.isArray(args) ? args.join(' ') : '');
const parts = raw.split('|');
if (parts.length < 3) return mzazireply('Usage: ' + prefix + 'findreplace find | replace | text');
const find = parts[0].trim();
const repl = parts[1].trim();
const hay = parts.slice(2).join('|').trim();
if (!find) return mzazireply('❌ Nothing to find.');
const count = hay.split(find).length - 1;
if (!count) return mzazireply('⚠️ "' + find + '" does not appear in that text.');
return mzazireply('Replaced ' + count + ' occurrence(s):\\n\\n' + hay.split(find).join(repl));`,
  },
  {
    name: 'sortlines',
    aliases: ['sorttext', 'alphabetise'],
    description: 'Sort lines alphabetically, optionally removing duplicates',
    category: 'Text',
    usage: '.sortlines <lines>   (.sortlines -u to dedupe)',
    code: `let dedupe = false;
let list = Array.isArray(args) ? args.slice() : [];
if (list[0] === '-u') { dedupe = true; list = list.slice(1); }
const t = list.join(' ');
if (!t.trim()) return mzazireply('Usage: ' + prefix + 'sortlines [-u] <lines separated by | or newlines>');
let lines = t.split(/\\n|\\s*\\|\\s*/).map(function (s) { return s.trim(); }).filter(Boolean);
const before = lines.length;
lines.sort(function (a, b) { return a.localeCompare(b); });
if (dedupe) lines = lines.filter(function (x, i) { return lines.indexOf(x) === i; });
return mzazireply('🔤 ' + lines.length + ' line(s)' + (dedupe && before !== lines.length ? ' (' + (before - lines.length) + ' duplicate(s) removed)' : '') + '\\n\\n' + lines.join('\\n'));`,
  },
  {
    name: 'trimlines',
    aliases: ['cleanlines'],
    description: 'Strip empty lines and trailing whitespace',
    category: 'Text',
    usage: '.trimlines <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '');
if (!t.trim()) return mzazireply('Usage: ' + prefix + 'trimlines <text>');
const before = t.split(/\\n/).length;
const lines = t.split(/\\n/).map(function (l) { return l.replace(/[ \\t]+$/, ''); }).filter(function (l) { return l.trim(); });
return mzazireply('🧹 ' + before + ' → ' + lines.length + ' line(s)\\n\\n' + lines.join('\\n'));`,
  },
  {
    name: 'extractemails',
    aliases: ['findemails'],
    description: 'Pull every email address out of some text',
    category: 'Text',
    usage: '.extractemails <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '');
if (!t.trim()) return mzazireply('Usage: ' + prefix + 'extractemails <text>');
const found = t.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}/g) || [];
const unique = found.filter(function (x, i) { return found.indexOf(x) === i; });
if (!unique.length) return mzazireply('📭 No email addresses found.');
return mzazireply('📧 ' + unique.length + ' address(es)\\n\\n' + unique.join('\\n'));`,
  },
  {
    name: 'extractlinks',
    aliases: ['findlinks', 'geturls'],
    description: 'Pull every link out of some text',
    category: 'Links',
    usage: '.extractlinks <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '');
if (!t.trim()) return mzazireply('Usage: ' + prefix + 'extractlinks <text>');
const found = t.match(/https?:\\/\\/[^\\s<>"')]+/gi) || [];
const unique = found.filter(function (x, i) { return found.indexOf(x) === i; });
if (!unique.length) return mzazireply('📭 No links found.');
return mzazireply('🔗 ' + unique.length + ' link(s)\\n\\n' + unique.slice(0, 30).join('\\n') + (unique.length > 30 ? '\\n…and ' + (unique.length - 30) + ' more' : ''));`,
  },
  {
    name: 'domainof',
    aliases: ['hostof', 'getdomain'],
    description: 'Show the host, path and query of a URL',
    category: 'Links',
    usage: '.domainof <url>',
    code: `let t = (Array.isArray(args) ? args.join('') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'domainof <url>');
if (!/^https?:\\/\\//i.test(t)) t = 'https://' + t;
try {
  const u = new URL(t);
  return mzazireply('🌐 *URL breakdown*\\n\\nHost: ' + u.hostname + (u.port ? ':' + u.port : '') + '\\nScheme: ' + u.protocol.replace(':', '') + '\\nPath: ' + (u.pathname || '/') + '\\nQuery: ' + (u.search || '(none)') + '\\nFragment: ' + (u.hash || '(none)'));		} catch (e) { return mzazireply('❌ That is not a valid URL.'); }`,
  },
];
