// ─────────────────────────────────────────────────────────────────────────────
// MZAZI XMD — command pack, part 2 of 4: CODES, GENERATORS, LINKS
//
// Everything here is either pure JS (crypto via require, arithmetic, dates) or a
// call to a long-standing public endpoint. Nothing depends on mzazi.shop, so
// this part works on a fresh deployment with no backend work at all.
//
// The few that do reach out are noted in their description, because a command
// that quietly depends on someone else's API is a command that breaks on a day
// nobody changed anything.
// ─────────────────────────────────────────────────────────────────────────────

module.exports = [
  // ── Codes ──────────────────────────────────────────────────────────────────
  {
    name: 'qr',
    aliases: ['qrcode', 'makeqr'],
    description: 'Turn text or a link into a QR code (uses api.qrserver.com)',
    category: 'Codes',
    usage: '.qr <text or url>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'qr <text or url>');
if (t.length > 900) return mzazireply('❌ Too long for a QR code — keep it under 900 characters.');
const url = 'https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=12&data=' + encodeURIComponent(t);
try {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
  return mzazi.sendMessage(sender, { image: Buffer.from(res.data), caption: '🔳 QR code\\n' + t.slice(0, 120) }, { quoted: m });
} catch (e) { return mzazireply('❌ Could not generate the QR code: ' + e.message); }`,
  },
  {
    name: 'wifiqr',
    aliases: ['qrwifi'],
    description: 'Build a QR code that joins a WiFi network',
    category: 'Codes',
    usage: '.wifiqr <SSID> | <password>',
    code: `const raw = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!raw || !raw.includes('|')) return mzazireply('Usage: ' + prefix + 'wifiqr <SSID> | <password>');
const parts = raw.split('|');
const ssid = parts[0].trim();
const pass = parts.slice(1).join('|').trim();
if (!ssid) return mzazireply('❌ The network name is missing.');
const payload = 'WIFI:T:' + (pass ? 'WPA' : 'nopass') + ';S:' + ssid + ';' + (pass ? 'P:' + pass + ';' : '') + ';';
const url = 'https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=12&data=' + encodeURIComponent(payload);
try {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
  return mzazi.sendMessage(sender, { image: Buffer.from(res.data), caption: '📶 WiFi QR for "' + ssid + '"\\nScan it to join.' }, { quoted: m });
} catch (e) { return mzazireply('❌ Could not build the QR code: ' + e.message); }`,
  },
  {
    name: 'vcardqr',
    aliases: ['contactqr'],
    description: 'Build a QR code containing contact details',
    category: 'Codes',
    usage: '.vcardqr <name> | <phone>',
    code: `const raw = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!raw || !raw.includes('|')) return mzazireply('Usage: ' + prefix + 'vcardqr <name> | <phone>');
const parts = raw.split('|');
const name = parts[0].trim();
const phone = parts.slice(1).join('|').replace(/\\D/g, '');
if (!name || !phone) return mzazireply('❌ Need both a name and a phone number.');
const vcard = 'BEGIN:VCARD\\nVERSION:3.0\\nFN:' + name + '\\nTEL;TYPE=CELL:+' + phone + '\\nEND:VCARD';
const url = 'https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=12&data=' + encodeURIComponent(vcard);
try {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
  return mzazi.sendMessage(sender, { image: Buffer.from(res.data), caption: '👤 Contact QR\\n' + name + ' · +' + phone }, { quoted: m });
} catch (e) { return mzazireply('❌ Could not build the contact QR: ' + e.message); }`,
  },
  {
    name: 'barcode',
    aliases: ['code128'],
    description: 'Render a Code 128 barcode for a value (uses barcode.tec-it.com)',
    category: 'Codes',
    usage: '.barcode <code>',
    code: `const t = (Array.isArray(args) ? args.join('') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'barcode <code>');
if (!/^[A-Za-z0-9._-]{1,48}$/.test(t)) return mzazireply('❌ Code 128 accepts letters, digits, dot, dash and underscore only.');
const url = 'https://barcode.tec-it.com/barcode.ashx?code=Code128&translate-esc=on&data=' + encodeURIComponent(t);
try {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
  return mzazi.sendMessage(sender, { image: Buffer.from(res.data), caption: '\\u2588\\u2588\\u2588 Barcode' }, { quoted: m });
} catch (e) { return mzazireply('❌ Could not render the barcode: ' + e.message); }`,
  },
  {
    name: 'barcodecheck',
    aliases: ['eancheck', 'luhn'],
    description: 'Validate an EAN-13, UPC-A or ISBN check digit offline',
    category: 'Codes',
    usage: '.barcodecheck <digits>',
    code: `const d = (Array.isArray(args) ? args.join('') : '').replace(/\\D/g, '');
if (!d) return mzazireply('Usage: ' + prefix + 'barcodecheck <digits>');
if (d.length !== 13 && d.length !== 12 && d.length !== 10) {
  return mzazireply('❌ Give 13 (EAN-13), 12 (UPC-A) or 10 (ISBN-10) digits. Got ' + d.length + '.');
}
const body = d.slice(0, -1), given = parseInt(d.slice(-1), 10);
let sum = 0, ok;
if (d.length === 10) {
  for (let i = 0; i < 9; i++) sum += (10 - i) * parseInt(body[i], 10);
  ok = ((11 - (sum % 11)) % 11) === given;
} else {
  const reversed = body.split('').reverse();
  for (let i = 0; i < reversed.length; i++) sum += parseInt(reversed[i], 10) * (i % 2 === 0 ? 3 : 1);
  ok = ((10 - (sum % 10)) % 10) === given;
}
return mzazireply(ok ? '✅ Valid check digit.' : '❌ Invalid check digit — expected ' + ((d.length === 10) ? 'a different digit' : 'a different digit') + '.');`,
  },
  {
    name: 'otp',
    aliases: ['totpsecret', 'makeotp'],
    description: 'Generate a random 6-digit OTP',
    category: 'Generators',
    usage: '.otp',
    code: `const crypto = require('crypto');
const n = crypto.randomInt(0, 1000000);
return mzazireply('🔐 One-time code: *' + String(n).padStart(6, '0') + '*\\n\\nValid for your use only — it is not linked to any account.');`,
  },
  {
    name: 'pin',
    aliases: ['makepin'],
    description: 'Generate a random 4-digit PIN',
    category: 'Generators',
    usage: '.pin',
    code: `const crypto = require('crypto');
return mzazireply('🔢 PIN: *' + String(crypto.randomInt(0, 10000)).padStart(4, '0') + '*');`,
  },
  {
    name: 'password',
    aliases: ['genpass', 'passgen'],
    description: 'Generate a strong random password',
    category: 'Generators',
    usage: '.password [length]',
    code: `const crypto = require('crypto');
let len = parseInt((Array.isArray(args) ? args[0] : '') || '16', 10);
if (isNaN(len)) len = 16;
if (len < 8) return mzazireply('❌ Minimum is 8 characters.');
if (len > 128) return mzazireply('❌ Maximum is 128 characters.');
const sets = ['ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz', '0123456789', '!@#$%^&*()-_=+[]{}'];
const all = sets.join('');
const pick = function (s) { return s[crypto.randomInt(0, s.length)]; };
let out = sets.map(pick).join('');
while (out.length < len) out += pick(all);
out = out.split('').sort(function () { return crypto.randomInt(0, 3) - 1; }).join('');
return mzazireply('🔑 *Generated password*\\n\\n' + out + '\\n\\nLength: ' + out.length + '\\nDo not share this in a group chat.');`,
  },
  {
    name: 'uuid',
    aliases: ['guid'],
    description: 'Generate a UUID v4',
    category: 'Generators',
    usage: '.uuid [count]',
    code: `const crypto = require('crypto');
let n = parseInt((Array.isArray(args) ? args[0] : '') || '1', 10);
if (isNaN(n) || n < 1) n = 1;
if (n > 25) return mzazireply('❌ Maximum 25 at a time.');
const list = [];
for (let i = 0; i < n; i++) list.push(crypto.randomUUID());
return mzazireply('🆔 ' + (n > 1 ? n + ' UUIDs' : 'UUID') + '\\n\\n' + list.join('\\n'));`,
  },
  {
    name: 'random',
    aliases: ['randnum'],
    description: 'Random number in a range',
    category: 'Generators',
    usage: '.random <min> <max>',
    code: `const crypto = require('crypto');
let lo = parseInt((Array.isArray(args) ? args[0] : '') || '1', 10);
let hi = parseInt((Array.isArray(args) ? args[1] : '') || '100', 10);
if (isNaN(lo) || isNaN(hi)) return mzazireply('Usage: ' + prefix + 'random <min> <max>');
if (lo > hi) { const t = lo; lo = hi; hi = t; }
if (hi - lo > 1000000000) return mzazireply('❌ That range is too wide.');
return mzazireply('🎲 ' + crypto.randomInt(lo, hi + 1));`,
  },
  {
    name: 'coin',
    aliases: ['flipcoin', 'toss'],
    description: 'Toss a coin',
    category: 'Generators',
    usage: '.coin',
    code: `const crypto = require('crypto');
return mzazireply(crypto.randomInt(0, 2) ? '🪙 *Heads*' : '🪙 *Tails*');`,
  },
  {
    name: 'dice',
    aliases: ['roll', 'd6'],
    description: 'Roll a die, or NdN like 2d6',
    category: 'Generators',
    usage: '.dice [2d6]',
    code: `const crypto = require('crypto');
const raw = (Array.isArray(args) ? args[0] : '') || '';
let count = 1, sides = 6;
const mm = /^(\\d{1,2})?d(\\d{1,4})$/i.exec(raw);
if (mm) { count = parseInt(mm[1] || '1', 10); sides = parseInt(mm[2], 10); }
if (count < 1 || count > 50) return mzazireply('❌ Roll between 1 and 50 dice.');
if (sides < 2 || sides > 10000) return mzazireply('❌ Dice must have between 2 and 10000 sides.');
const rolls = [];
for (let i = 0; i < count; i++) rolls.push(crypto.randomInt(1, sides + 1));
const total = rolls.reduce(function (a, b) { return a + b; }, 0);
return mzazireply('🎲 ' + count + 'd' + sides + '\\n\\n' + rolls.join(' + ') + (count > 1 ? '\\n\\nTotal: *' + total + '*' : ''));`,
  },
  {
    name: 'randomcolor',
    aliases: ['randcolor', 'colorgen'],
    description: 'Random hex colour, with a preview swatch',
    category: 'Generators',
    usage: '.randomcolor',
    code: `const crypto = require('crypto');
const hex = '#' + crypto.randomInt(0, 0xffffff + 1).toString(16).padStart(6, '0').toUpperCase();
const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
return mzazireply('🎨 *' + hex + '*\\n\\nRGB: ' + r + ', ' + g + ', ' + b + '\\nBrightness: ' + Math.round(lum * 100) + '%\\nReadable text on it: ' + (lum > 0.6 ? 'black' : 'white') + '\\n\\nhttps://singlecolorimage.com/get/' + hex.slice(1) + '/200x80');`,
  },
  {
    name: 'roman',
    aliases: ['toroman', 'romannumeral'],
    description: 'Convert a number to Roman numerals',
    category: 'Generators',
    usage: '.roman <number>',
    code: `const n = parseInt((Array.isArray(args) ? args[0] : '') || '', 10);
if (isNaN(n)) return mzazireply('Usage: ' + prefix + 'roman <number>');
if (n < 1 || n > 3999) return mzazireply('❌ Roman numerals here run from 1 to 3999.');
const table = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
let left = n, out = '';
for (const pair of table) { while (left >= pair[0]) { out += pair[1]; left -= pair[0]; } }
return mzazireply(n + ' → *' + out + '*');`,
  },
  {
    name: 'unroman',
    aliases: ['fromroman'],
    description: 'Convert Roman numerals back to a number',
    category: 'Generators',
    usage: '.unroman <roman>',
    code: `const s = (Array.isArray(args) ? args.join('') : '').trim().toUpperCase();
if (!s) return mzazireply('Usage: ' + prefix + 'unroman <roman>');
if (!/^[IVXLCDM]+$/.test(s)) return mzazireply('❌ Only I, V, X, L, C, D and M are valid.');
const val = { I:1, V:5, X:10, L:50, C:100, D:500, M:1000 };
let total = 0;
for (let i = 0; i < s.length; i++) {
  const cur = val[s[i]], nxt = val[s[i + 1]];
  total += (nxt && cur < nxt) ? -cur : cur;
}
if (total < 1 || total > 3999) return mzazireply('❌ That is not a standard Roman numeral.');
return mzazireply(s + ' → *' + total + '*');`,
  },
  {
    name: 'numwords',
    aliases: ['numberwords'],
    description: 'Spell out a number in words',
    category: 'Generators',
    usage: '.numwords <number>',
    code: `const n = parseInt((Array.isArray(args) ? args[0] : '') || '', 10);
if (isNaN(n)) return mzazireply('Usage: ' + prefix + 'numwords <number>');
if (Math.abs(n) > 999999999) return mzazireply('❌ Up to 999,999,999.');
const ones = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
const tens = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
const under1000 = function (x) {
  let s = '';
  if (x >= 100) { s += ones[Math.floor(x / 100)] + ' hundred'; x %= 100; if (x) s += ' and '; }
  if (x >= 20) { s += tens[Math.floor(x / 10)]; if (x % 10) s += '-' + ones[x % 10]; }
  else if (x > 0 || !s) s += ones[x];
  return s;
};
const sign = n < 0 ? 'minus ' : '';
let left = Math.abs(n), parts = [];
const units = [[1000000,'million'],[1000,'thousand']];
for (const u of units) { if (left >= u[0]) { parts.push(under1000(Math.floor(left / u[0])) + ' ' + u[1]); left %= u[0]; } }
if (left || !parts.length) parts.push(under1000(left));
return mzazireply(sign + parts.join(' '));`,
  },
  {
    name: 'lorem',
    aliases: ['placeholder'],
    description: 'Generate lorem ipsum placeholder text',
    category: 'Generators',
    usage: '.lorem [words]',
    code: `let n = parseInt((Array.isArray(args) ? args[0] : '') || '40', 10);
if (isNaN(n) || n < 5) n = 40;
if (n > 300) return mzazireply('❌ Maximum 300 words.');
const bag = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'.split(' ');
const out = [];
for (let i = 0; i < n; i++) out.push(bag[Math.floor(Math.random() * bag.length)]);
out[0] = out[0].charAt(0).toUpperCase() + out[0].slice(1);
return mzazireply(out.join(' ') + '.');`,
  },
  {
    name: 'slugify',
    aliases: ['slug'],
    description: 'Turn a title into a URL-friendly slug',
    category: 'Generators',
    usage: '.slugify <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'slugify <text>');
const slug = t.toLowerCase().normalize('NFKD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9\\s-]/g, '').trim().replace(/\\s+/g, '-').replace(/-+/g, '-');
return mzazireply(slug || '(nothing usable in that)');`,
  },
  {
    name: 'pickone',
    aliases: ['choose', 'randompick'],
    description: 'Pick one option at random from a list',
    category: 'Generators',
    usage: '.pickone red, green, blue',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'pickone a, b, c');
const options = t.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
if (options.length < 2) return mzazireply('❌ Give at least two options separated by commas.');
const picked = options[Math.floor(Math.random() * options.length)];
return mzazireply('🎯 Picked: *' + picked + '*\\n\\nFrom ' + options.length + ' options.');`,
  },
  {
    name: 'shuffle',
    aliases: ['randomorder'],
    description: 'Shuffle a comma-separated list',
    category: 'Generators',
    usage: '.shuffle a, b, c, d',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'shuffle a, b, c');
const items = t.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
if (items.length < 2) return mzazireply('❌ Give at least two items.');
for (let i = items.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  const tmp = items[i]; items[i] = items[j]; items[j] = tmp;
}
return mzazireply('🔀 *Shuffled*\\n\\n' + items.map(function (x, i) { return (i + 1) + '. ' + x; }).join('\\n'));`,
  },
  {
    name: 'timestamp',
    aliases: ['now', 'unixtime'],
    description: 'Current Unix timestamp and UTC time',
    category: 'Generators',
    usage: '.timestamp',
    code: `const now = new Date();
return mzazireply('🕐 *Now*\\n\\nUnix: ' + Math.floor(now.getTime() / 1000) + '\\nMillis: ' + now.getTime() + '\\nUTC: ' + now.toUTCString() + '\\nISO: ' + now.toISOString());`,
  },
  {
    name: 'fromtimestamp',
    aliases: ['untimestamp'],
    description: 'Convert a Unix timestamp to a readable date',
    category: 'Generators',
    usage: '.fromtimestamp <seconds>',
    code: `let v = parseInt((Array.isArray(args) ? args[0] : '') || '', 10);
if (isNaN(v)) return mzazireply('Usage: ' + prefix + 'fromtimestamp <seconds>');
if (String(v).length >= 13) v = Math.floor(v / 1000);
const d = new Date(v * 1000);
if (isNaN(d.getTime())) return mzazireply('❌ That is not a valid timestamp.');
return mzazireply('📅 ' + d.toUTCString() + '\\n\\nISO: ' + d.toISOString());`,
  },
  {
    name: 'agedate',
    aliases: ['daysbetween', 'datediff'],
    description: 'Days between two dates, or since one date',
    category: 'Generators',
    usage: '.agedate 1999-12-31 [2026-01-01]',
    code: `const a = (Array.isArray(args) ? args[0] : '') || '';
const b = (Array.isArray(args) ? args[1] : '') || '';
if (!a) return mzazireply('Usage: ' + prefix + 'agedate <YYYY-MM-DD> [to YYYY-MM-DD]');
const d1 = new Date(a);
const d2 = b ? new Date(b) : new Date();
if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return mzazireply('❌ Use dates like 1999-12-31.');
const days = Math.abs(Math.round((d2 - d1) / 86400000));
return mzazireply('📆 ' + days.toLocaleString() + ' days\\n\\nThat is about ' + (days / 365.25).toFixed(2) + ' years, or ' + Math.round(days / 7) + ' weeks.');`,
  },
  {
    name: 'tempconvert',
    aliases: ['temp', 'celsius'],
    description: 'Convert between Celsius, Fahrenheit and Kelvin',
    category: 'Generators',
    usage: '.tempconvert 37C',
    code: `const raw = (Array.isArray(args) ? args.join('') : '').trim().toUpperCase();
if (!raw) return mzazireply('Usage: ' + prefix + 'tempconvert 37C  (or 98.6F, 300K)');
const m2 = /^(-?\\d+(?:\\.\\d+)?)\\s*(C|F|K)?$/.exec(raw);
if (!m2) return mzazireply('❌ Try something like 37C, 98.6F or 300K.');
const v = parseFloat(m2[1]);
const unit = m2[2] || 'C';
let c;
if (unit === 'C') c = v;
else if (unit === 'F') c = (v - 32) * 5 / 9;
else c = v - 273.15;
return mzazireply('🌡 ' + v + '°' + unit + '\\n\\n' + c.toFixed(2) + ' °C\\n' + (c * 9 / 5 + 32).toFixed(2) + ' °F\\n' + (c + 273.15).toFixed(2) + ' K');`,
  },
  {
    name: 'baseconvert',
    aliases: ['baseto', 'radix'],
    description: 'Convert a number between bases 2 and 36',
    category: 'Generators',
    usage: '.baseconvert <number> <fromBase> <toBase>',
    code: `if (!Array.isArray(args) || args.length < 3) return mzazireply('Usage: ' + prefix + 'baseconvert <number> <from> <to>');
const value = String(args[0]).trim();
const from = parseInt(args[1], 10), to = parseInt(args[2], 10);
if (isNaN(from) || isNaN(to) || from < 2 || from > 36 || to < 2 || to > 36) {
  return mzazireply('❌ Bases must be between 2 and 36.');
}
const n = parseInt(value, from);
if (isNaN(n)) return mzazireply('❌ "' + value + '" is not a valid base-' + from + ' number.');
return mzazireply(value + ' (base ' + from + ') → *' + n.toString(to).toUpperCase() + '* (base ' + to + ')');`,
  },
  {
    name: 'percentage',
    aliases: ['percent', 'pct'],
    description: 'Work out a percentage of a number',
    category: 'Generators',
    usage: '.percentage 15 250   (15% of 250)',
    code: `const p = parseFloat((Array.isArray(args) ? args[0] : '') || '');
const of = parseFloat((Array.isArray(args) ? args[1] : '') || '');
if (isNaN(p) || isNaN(of)) return mzazireply('Usage: ' + prefix + 'percentage <percent> <of>');
return mzazireply(p + '% of ' + of + ' = *' + (p * of / 100) + '*');`,
  },

  // ── Links ──────────────────────────────────────────────────────────────────
  {
    name: 'shorturl',
    aliases: ['shorten', 'tinyurl'],
    description: 'Shorten a long URL (uses tinyurl.com)',
    category: 'Links',
    usage: '.shorturl <url>',
    code: `let t = (Array.isArray(args) ? args.join('') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'shorturl <url>');
if (!/^https?:\\/\\//i.test(t)) t = 'https://' + t;
try {
  const res = await axios.get('https://tinyurl.com/api-create.php?url=' + encodeURIComponent(t), { timeout: 15000 });
  const out = String(res.data || '').trim();
  if (!/^https?:\\/\\//.test(out)) return mzazireply('❌ The shortener did not return a link.');
  return mzazireply('🔗 ' + out + '\\n\\nFrom: ' + t);
} catch (e) { return mzazireply('❌ Could not shorten that: ' + e.message); }`,
  },
  {
    name: 'urlencode',
    aliases: ['urlenc'],
    description: 'Percent-encode text for use in a URL',
    category: 'Links',
    usage: '.urlencode <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'urlencode <text>');
return mzazireply(encodeURIComponent(t));`,
  },
  {
    name: 'urldecode',
    aliases: ['urldec'],
    description: 'Decode percent-encoded text',
    category: 'Links',
    usage: '.urldecode <text>',
    code: `const t = (Array.isArray(args) ? args.join('') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'urldecode <text>');
try { return mzazireply(decodeURIComponent(t)); }
catch (e) { return mzazireply('❌ That contains invalid percent-encoding.'); }`,
  },
  {
    name: 'myip',
    aliases: ['serverip', 'botip'],
    description: 'Public IP and location of the host this bot runs on',
    category: 'Network',
    usage: '.myip',
    code: `try {
  const res = await axios.get('http://ip-api.com/json/?fields=status,country,regionName,city,isp,query', { timeout: 15000 });
  const d = res.data || {};
  if (d.status !== 'success') return mzazireply('❌ Could not look that up right now.');
  return mzazireply('🌍 *Host IP*\\n\\nIP: ' + d.query + '\\nCity: ' + (d.city || '-') + '\\nRegion: ' + (d.regionName || '-') + '\\nCountry: ' + (d.country || '-') + '\\nISP: ' + (d.isp || '-'));
} catch (e) { return mzazireply('❌ Lookup failed: ' + e.message); }`,
  },
  {
    name: 'ipinfo',
    aliases: ['geoip', 'iplookup'],
    description: 'Look up where an IP address is',
    category: 'Network',
    usage: '.ipinfo <ip>',
    code: `const ip = (Array.isArray(args) ? args[0] : '').trim();
if (!ip) return mzazireply('Usage: ' + prefix + 'ipinfo <ip address>');
if (!/^[0-9a-fA-F.:]{3,45}$/.test(ip)) return mzazireply('❌ That does not look like an IP address.');
try {
  const res = await axios.get('http://ip-api.com/json/' + encodeURIComponent(ip) + '?fields=status,country,regionName,city,isp,org,as,query,timezone', { timeout: 15000 });
  const d = res.data || {};
  if (d.status !== 'success') return mzazireply('❌ Nothing found for that address.');
  return mzazireply('📍 *' + d.query + '*\\n\\nCity: ' + (d.city || '-') + '\\nRegion: ' + (d.regionName || '-') + '\\nCountry: ' + (d.country || '-') + '\\nISP: ' + (d.isp || '-') + '\\nTimezone: ' + (d.timezone || '-'));
} catch (e) { return mzazireply('❌ Lookup failed: ' + e.message); }`,
  },
];
