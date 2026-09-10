// ─────────────────────────────────────────────────────────────────────────────
// MZAZI XMD — command pack, part 1 of 4: TEXT, ENCODING, GENERATORS
//
// Written against the real command context (see buildCommandContext in case.js).
// Only wired values are used: mzazireply, args, prefix, command, axios, fs, path,
// exec, require, db, loadJSON, saveJSON, isOwner, isGroup, sender, formatBytes.
//
// Convention used throughout: string concatenation rather than template
// literals, because these bodies are stored as template literals themselves and
// nesting them makes the escaping a minefield for no gain.
//
// Pure JS and crypto only — no external service, no system binary, nothing that
// can rot. If any command in the pack is certain to work, it is these.
// ─────────────────────────────────────────────────────────────────────────────

module.exports = [
  {
    name: 'upper',
    aliases: ['uppercase', 'caps'],
    description: 'Convert text to UPPERCASE',
    category: 'Text',
    usage: '.upper <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'upper <text>');
return mzazireply(t.toUpperCase());`,
  },
  {
    name: 'lower',
    aliases: ['lowercase'],
    description: 'Convert text to lowercase',
    category: 'Text',
    usage: '.lower <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'lower <text>');
return mzazireply(t.toLowerCase());`,
  },
  {
    name: 'titlecase',
    aliases: ['title'],
    description: 'Capitalise Each Word',
    category: 'Text',
    usage: '.titlecase <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'titlecase <text>');
return mzazireply(t.replace(/\\w\\S*/g, function (w) { return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); }));`,
  },
  {
    name: 'sentencecase',
    aliases: [],
    description: 'Capitalise the first letter of each sentence',
    category: 'Text',
    usage: '.sentencecase <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'sentencecase <text>');
const out = t.toLowerCase().replace(/(^\\s*\\w|[.!?]\\s+\\w)/g, function (m) { return m.toUpperCase(); });
return mzazireply(out);`,
  },
  {
    name: 'swapcase',
    aliases: [],
    description: 'Swap upper and lower case of every letter',
    category: 'Text',
    usage: '.swapcase <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'swapcase <text>');
return mzazireply(t.split('').map(function (ch) { return ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase(); }).join(''));`,
  },
  {
    name: 'reverse',
    aliases: ['reversetext'],
    description: 'Reverse the characters in text',
    category: 'Text',
    usage: '.reverse <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'reverse <text>');
return mzazireply(t.split('').reverse().join(''));`,
  },
  {
    name: 'revwords',
    aliases: ['reverseorder'],
    description: 'Reverse the order of words, not the letters',
    category: 'Text',
    usage: '.revwords <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'revwords <text>');
return mzazireply(t.split(/\\s+/).reverse().join(' '));`,
  },
  {
    name: 'wordcount',
    aliases: ['wc'],
    description: 'Count words, characters and lines in text',
    category: 'Text',
    usage: '.wordcount <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'wordcount <text>');
const words = t.split(/\\s+/).filter(Boolean).length;
const lines = t.split(/\\n/).length;
return mzazireply('📊 *Text stats*\\n\\nCharacters: ' + t.length + '\\nWithout spaces: ' + t.replace(/\\s/g, '').length + '\\nWords: ' + words + '\\nLines: ' + lines);`,
  },
  {
    name: 'countchars',
    aliases: ['charcount'],
    description: 'Count every character including spaces',
    category: 'Text',
    usage: '.countchars <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'countchars <text>');
return mzazireply('Characters: ' + t.length + '\\nWithout spaces: ' + t.replace(/\\s/g, '').length);`,
  },
  {
    name: 'mock',
    aliases: ['sillytext', 'spongebob'],
    description: 'mOcK tExT like the SpongeBob meme',
    category: 'Text',
    usage: '.mock <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'mock <text>');
let i = 0;
const out = t.split('').map(function (ch) {
  if (/[a-zA-Z]/.test(ch)) { i++; return i % 2 ? ch.toLowerCase() : ch.toUpperCase(); }
  return ch;
}).join('');
return mzazireply(out);`,
  },
  {
    name: 'flip',
    aliases: ['upsidedown'],
    description: 'Flip text upside down',
    category: 'Text',
    usage: '.flip <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'flip <text>');
const map = { a:'\\u0250', b:'q', c:'\\u0254', d:'p', e:'\\u01dd', f:'\\u025f', g:'\\u0183', h:'\\u0265', i:'\\u1d09', j:'\\u027e', k:'\\u029e', l:'l', m:'\\u026f', n:'u', o:'o', p:'d', q:'b', r:'\\u0279', s:'s', t:'\\u0287', u:'n', v:'\\u028c', w:'\\u028d', x:'x', y:'\\u028e', z:'z', '.': '\\u02d9', '?':'\\u00bf', '!':'\\u00a1' };
const out = t.toLowerCase().split('').map(function (ch) { return map[ch] || ch; }).reverse().join('');
return mzazireply(out);`,
  },
  {
    name: 'leetspeak',
    aliases: ['leet', '1337'],
    description: 'Convert text to l33t speak',
    category: 'Text',
    usage: '.leetspeak <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'leetspeak <text>');
const map = { a:'4', b:'8', e:'3', g:'6', i:'1', l:'1', o:'0', s:'5', t:'7', z:'2' };
return mzazireply(t.toLowerCase().split('').map(function (ch) { return map[ch] || ch; }).join(''));`,
  },
  {
    name: 'zalgo',
    aliases: ['creepy'],
    description: 'Add combining marks to text (creepy style)',
    category: 'Text',
    usage: '.zalgo <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'zalgo <text>');
const marks = [];
for (let i = 0x0300; i <= 0x036f; i++) marks.push(String.fromCharCode(i));
const out = t.split('').map(function (ch) {
  if (ch === ' ') return ch;
  let s = ch;
  for (let k = 0; k < 3; k++) s += marks[Math.floor(Math.random() * marks.length)];
  return s;
}).join('');
return mzazireply(out);`,
  },
  {
    name: 'boldtext',
    aliases: ['bold'],
    description: 'Convert text to bold Unicode characters',
    category: 'Text',
    usage: '.boldtext <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'boldtext <text>');
const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', az = 'abcdefghijklmnopqrstuvwxyz', D = '0123456789';
const out = t.split('').map(function (ch) {
  let i = AZ.indexOf(ch); if (i > -1) return String.fromCodePoint(0x1d400 + i);
  i = az.indexOf(ch); if (i > -1) return String.fromCodePoint(0x1d41a + i);
  i = D.indexOf(ch); if (i > -1) return String.fromCodePoint(0x1d7ce + i);
  return ch;
}).join('');
return mzazireply(out);`,
  },
  {
    name: 'italictext',
    aliases: ['italic'],
    description: 'Convert text to italic Unicode characters',
    category: 'Text',
    usage: '.italictext <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'italictext <text>');
const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', az = 'abcdefghijklmnopqrstuvwxyz';
const SKIP = { h: '\\u210e' };
const out = t.split('').map(function (ch, idx) {
  let i = AZ.indexOf(ch); if (i > -1) return String.fromCodePoint(0x1d434 + i);
  i = az.indexOf(ch);
  if (i > -1) {
    if (ch === 'h') return SKIP.h;
    return String.fromCodePoint(i < 8 ? 0x1d44e + i : 0x1d44e + i + 1);
  }
  return ch;
}).join('');
return mzazireply(out);`,
  },
  {
    name: 'smallcaps',
    aliases: ['tinytext'],
    description: 'Convert text to small capitals',
    category: 'Text',
    usage: '.smallcaps <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'smallcaps <text>');
const az = 'abcdefghijklmnopqrstuvwxyz';
const sc = ['\\u1d00','\\u0299','\\u1d04','\\u1d05','\\u1d07','\\ua730','\\u0262','\\u029c','\\u026a','\\u1d0a','\\u1d0b','\\u029f','\\u1d0d','\\u0274','\\u1d0f','\\u1d18','q','\\u0280','s','\\u1d1b','\\u1d1c','\\u1d20','\\u1d21','x','\\u028f','\\u1d22'];
return mzazireply(t.toLowerCase().split('').map(function (ch) { const i = az.indexOf(ch); return i > -1 ? sc[i] : ch; }).join(''));`,
  },
  {
    name: 'binary',
    aliases: ['tobinary', 'text2bin'],
    description: 'Encode text to binary',
    category: 'Encoding',
    usage: '.binary <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'binary <text>');
const out = t.split('').map(function (ch) { return ch.charCodeAt(0).toString(2).padStart(8, '0'); }).join(' ');
return mzazireply(out);`,
  },
  {
    name: 'unbinary',
    aliases: ['frombinary', 'bin2text'],
    description: 'Decode binary back to text',
    category: 'Encoding',
    usage: '.unbinary <binary>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'unbinary <binary>');
const clean = t.replace(/[^01]/g, '');
if (!clean.length || clean.length % 8 !== 0) return mzazireply('❌ That is not valid binary — expected groups of 8 bits.');
let out = '';
for (let i = 0; i < clean.length; i += 8) out += String.fromCharCode(parseInt(clean.slice(i, i + 8), 2));
return mzazireply(out);`,
  },
  {
    name: 'hexify',
    aliases: ['tohex', 'text2hex'],
    description: 'Encode text to hexadecimal',
    category: 'Encoding',
    usage: '.hexify <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'hexify <text>');
return mzazireply('0x' + Buffer.from(t, 'utf8').toString('hex'));`,
  },
  {
    name: 'unhex',
    aliases: ['fromhex', 'hex2text'],
    description: 'Decode hexadecimal back to text',
    category: 'Encoding',
    usage: '.unhex <hex>',
    code: `let t = (Array.isArray(args) ? args.join('') : '').trim().replace(/^0x/i, '').replace(/[^0-9a-fA-F]/g, '');
if (!t) return mzazireply('Usage: ' + prefix + 'unhex <hex>');
if (t.length % 2 !== 0) return mzazireply('❌ Hex must have an even number of digits.');
return mzazireply(Buffer.from(t, 'hex').toString('utf8'));`,
  },
  {
    name: 'base64',
    aliases: ['b64', 'tobase64'],
    description: 'Base64-encode text',
    category: 'Encoding',
    usage: '.base64 <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'base64 <text>');
return mzazireply(Buffer.from(t, 'utf8').toString('base64'));`,
  },
  {
    name: 'unbase64',
    aliases: ['b64decode', 'frombase64'],
    description: 'Decode Base64 back to text',
    category: 'Encoding',
    usage: '.unbase64 <base64>',
    code: `const t = (Array.isArray(args) ? args.join('') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'unbase64 <base64>');
try {
  const out = Buffer.from(t, 'base64').toString('utf8');
  if (!out || /[\\u0000-\\u0008\\u000e-\\u001f]/.test(out)) return mzazireply('❌ That does not look like valid Base64 text.');
  return mzazireply(out);
} catch (e) { return mzazireply('❌ Invalid Base64: ' + e.message); }`,
  },
  {
    name: 'rot13',
    aliases: ['caesar13'],
    description: 'ROT13 cipher (its own inverse)',
    category: 'Encoding',
    usage: '.rot13 <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'rot13 <text>');
const out = t.replace(/[a-zA-Z]/g, function (ch) {
  const base = ch <= 'Z' ? 65 : 97;
  return String.fromCharCode(((ch.charCodeAt(0) - base + 13) % 26) + base);
});
return mzazireply(out);`,
  },
  {
    name: 'caesar',
    aliases: ['shift'],
    description: 'Caesar cipher with a custom shift',
    category: 'Encoding',
    usage: '.caesar <number> <text>',
    code: `if (!Array.isArray(args) || args.length < 2) return mzazireply('Usage: ' + prefix + 'caesar <shift> <text>');
const shift = parseInt(args[0], 10);
if (isNaN(shift)) return mzazireply('❌ The first argument must be a number, e.g. ' + prefix + 'caesar 3 hello');
const t = args.slice(1).join(' ');
const n = ((shift % 26) + 26) % 26;
const out = t.replace(/[a-zA-Z]/g, function (ch) {
  const base = ch <= 'Z' ? 65 : 97;
  return String.fromCharCode(((ch.charCodeAt(0) - base + n) % 26) + base);
});
return mzazireply(out);`,
  },
  {
    name: 'uncaesar',
    aliases: ['deshift'],
    description: 'Undo a Caesar cipher',
    category: 'Encoding',
    usage: '.uncaesar <number> <text>',
    code: `if (!Array.isArray(args) || args.length < 2) return mzazireply('Usage: ' + prefix + 'uncaesar <shift> <text>');
const shift = parseInt(args[0], 10);
if (isNaN(shift)) return mzazireply('❌ The first argument must be a number.');
const t = args.slice(1).join(' ');
const n = ((-shift % 26) + 26) % 26;
const out = t.replace(/[a-zA-Z]/g, function (ch) {
  const base = ch <= 'Z' ? 65 : 97;
  return String.fromCharCode(((ch.charCodeAt(0) - base + n) % 26) + base);
});
return mzazireply(out);`,
  },
  {
    name: 'morse',
    aliases: ['tomorse'],
    description: 'Encode text to Morse code',
    category: 'Encoding',
    usage: '.morse <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'morse <text>');
const M = { a:'.-', b:'-...', c:'-.-.', d:'-..', e:'.', f:'..-.', g:'--.', h:'....', i:'..', j:'.---', k:'-.-', l:'.-..', m:'--', n:'-.', o:'---', p:'.--.', q:'--.-', r:'.-.', s:'...', t:'-', u:'..-', v:'...-', w:'.--', x:'-..-', y:'-.--', z:'--..', '0':'-----', '1':'.----', '2':'..---', '3':'...--', '4':'....-', '5':'.....', '6':'-....', '7':'--...', '8':'---..', '9':'----.' };
const out = t.toLowerCase().split('').map(function (ch) {
  if (ch === ' ') return '/';
  return M[ch] || '';
}).filter(Boolean).join(' ');
return mzazireply(out);`,
  },
  {
    name: 'unmorse',
    aliases: ['frommorse'],
    description: 'Decode Morse code back to text',
    category: 'Encoding',
    usage: '.unmorse <morse>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'unmorse <morse>');
const M = { '.-':'a','-...':'b','-.-.':'c','-..':'d','.':'e','..-.':'f','--.':'g','....':'h','..':'i','.---':'j','-.-':'k','.-..':'l','--':'m','-.':'n','---':'o','.--.':'p','--.-':'q','.-.':'r','...':'s','-':'t','..-':'u','...-':'v','.--':'w','-..-':'x','-.--':'y','--..':'z','-----':'0','.----':'1','..---':'2','...--':'3','....-':'4','.....':'5','-....':'6','--...':'7','---..':'8','----.':'9' };
const out = t.split(/\\s+/).map(function (part) {
  if (part === '/' || part === '|') return ' ';
  return M[part] || '?';
}).join('');
return mzazireply(out);`,
  },
];
