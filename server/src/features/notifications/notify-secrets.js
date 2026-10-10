// Per-store provider settings, encrypted at rest (AES-256-GCM). Key: NOTIFY_ENC_KEY, falling back to JWT_SECRET.
import crypto from 'node:crypto';
import { looksInternal } from '../../shared/net-guard.js';

const hashKey = secret => crypto.createHash('sha256').update(`dukaan-notify:${secret}`).digest();
const keyFrom = env => {
  const secret = env.NOTIFY_ENC_KEY || env.JWT_SECRET;
  if (!secret) throw new Error('Server has no encryption secret configured');
  return hashKey(secret);
};
// Keys tried when reading: the dedicated key first, then the legacy JWT_SECRET (rows written before the split).
const readKeys = env => [...new Set([env.NOTIFY_ENC_KEY, env.JWT_SECRET].filter(Boolean))].map(hashKey);
export function encryptJson(obj, env = process.env) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', keyFrom(env), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return `v1.${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${enc.toString('base64')}`;
}
export function decryptJson(text, env = process.env) {
  if (!text) return {};
  const [v, iv, tag, data] = String(text).split('.');
  if (v !== 'v1') return {};
  for (const key of readKeys(env)) {
    try {
      const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
      d.setAuthTag(Buffer.from(tag, 'base64'));
      return JSON.parse(Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8'));
    } catch { /* try the next key */ }
  }
  return {}; // wrong key or tampered: behave as "no own keys"
}
// True when the blob decrypts only with a legacy key, so it should be re-encrypted with the current one.
export function needsReencrypt(text, env = process.env) {
  if (!text || !env.NOTIFY_ENC_KEY) return false;
  try {
    const [v, iv, tag, data] = String(text).split('.'); if (v !== 'v1') return false;
    const d = crypto.createDecipheriv('aes-256-gcm', keyFrom(env), Buffer.from(iv, 'base64')); d.setAuthTag(Buffer.from(tag, 'base64')); d.update(Buffer.from(data, 'base64')); d.final(); return false;
  } catch { return true; }
}

const bad = m => Object.assign(new Error(m), { status: 400 });
export const PLACEHOLDERS = ['to', 'to_intl', 'message', 'subject', 'store', 'key', 'key_b64'];
const ph = text => [...String(text).matchAll(/\{\{\s*([a-z_0-9]+)\s*\}\}/gi)].map(m => m[1].toLowerCase());
const BLOCKED_HEADERS = new Set(['host', 'content-length', 'transfer-encoding', 'connection', 'cookie']);
const MODES = { email: ['resend', 'smtp', 'http'], sms: ['fast2sms', 'http'] };

// field spec: [name, kind]. kind: 'secret' (blank = keep), 'text', 'bool'
const GROUPS = {
  resend: { label: 'Resend', fields: { apiKey: 'secret', from: 'from' } },
  smtp: { label: 'SMTP', fields: { host: 'host', port: 'port', secure: 'bool', user: 'text', pass: 'secret', from: 'from' } },
  emailHttp: { label: 'Email API', fields: { url: 'url', method: 'method', contentType: 'ctype', headers: 'headers', body: 'body', key: 'secret' } },
  fast2sms: { label: 'Fast2SMS', fields: { apiKey: 'secret', route: 'route', senderId: 'id', templateId: 'id' } },
  smsHttp: { label: 'SMS API', fields: { url: 'url', method: 'method', contentType: 'ctype', headers: 'headers', body: 'body', key: 'secret' } },
};
function validate(kind, value, label) {
  if (kind === 'secret') { if (typeof value !== 'string' || value.length < 4 || value.length > 400 || /[\r\n\0]/.test(value)) throw bad(`${label} looks invalid. Paste it exactly as the provider shows it.`); return value; }
  if (kind === 'bool') return value === true;
  if (kind === 'port' && typeof value === 'number') value = String(value);
  if (typeof value !== 'string') throw bad(`${label} is invalid`);
  const v = value.trim();
  if (v === '') return '';
  switch (kind) {
    case 'text': if (v.length > 200 || /[\r\n]/.test(v)) throw bad(`${label} is too long`); return v;
    case 'from': if (v.length > 200 || !/^(?:[^<>@\r\n]{1,80}<)?[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}>?$/.test(v)) throw bad('Sender email must look like alerts@yourdomain.com or Shop <alerts@yourdomain.com>'); return v;
    case 'host': if (!/^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/i.test(v) || looksInternal(v)) throw bad('Enter the public SMTP server name, e.g. smtp.example.com'); return v.toLowerCase();
    case 'port': if (![25, 465, 587, 2525].includes(Number(v))) throw bad('SMTP port must be 587, 465, 2525 or 25'); return Number(v);
    case 'url': { let u; try { u = new URL(v); } catch { throw bad('API URL is not valid'); } if (u.protocol !== 'https:' || v.length > 600 || u.username || u.password) throw bad('API URL must start with https:// and contain no username or password'); if (looksInternal(u.hostname)) throw bad('That host is not allowed'); for (const p of ph(v)) if (!PLACEHOLDERS.includes(p)) throw bad(`Unknown placeholder {{${p}}}`); return v; }
    case 'method': if (!['GET', 'POST'].includes(v.toUpperCase())) throw bad('Method must be GET or POST'); return v.toUpperCase();
    case 'ctype': if (!['json', 'form', 'text'].includes(v)) throw bad('Body type must be json, form or text'); return v;
    case 'route': if (!['quick', 'dlt'].includes(v)) throw bad('SMS mode must be quick or dlt'); return v;
    case 'id': if (!/^[A-Za-z0-9_-]{3,40}$/.test(v)) throw bad(`${label} looks invalid`); return v;
    case 'headers': { const lines = v.split(/\r?\n/).map(l => l.trim()).filter(Boolean); if (lines.length > 6 || v.length > 800) throw bad('At most 6 header lines'); for (const l of lines) { const m = l.match(/^([A-Za-z0-9-]{1,40}):\s*(.+)$/); if (!m || BLOCKED_HEADERS.has(m[1].toLowerCase())) throw bad(`Header "${l.slice(0, 30)}" is not allowed. Use Name: value`); } for (const p of ph(v)) if (!PLACEHOLDERS.includes(p)) throw bad(`Unknown placeholder {{${p}}}`); return lines.join('\n'); }
    case 'body': if (v.length > 2000) throw bad('Body template is too long'); for (const p of ph(v)) if (!PLACEHOLDERS.includes(p)) throw bad(`Unknown placeholder {{${p}}}`); return value.trim();
  }
  return v;
}
// Merge a partial update. Blank secret = keep stored one. {clear:['email'|'sms']} wipes that channel.
export function mergeSecrets(current, input = {}) {
  const next = JSON.parse(JSON.stringify(current || {}));
  for (const [g, spec] of Object.entries(GROUPS)) {
    const inp = input[g]; if (inp === undefined) continue;
    if (!inp || typeof inp !== 'object') throw bad('Invalid provider settings');
    next[g] = next[g] || {};
    for (const [f, kind] of Object.entries(spec.fields)) {
      if (inp[f] === undefined) continue;
      if (kind === 'secret' && inp[f] === '') continue;
      next[g][f] = validate(kind, inp[f], `${spec.label} ${f}`);
    }
  }
  for (const ch of ['email', 'sms']) if (input[`${ch}Mode`] !== undefined) { if (!MODES[ch].includes(input[`${ch}Mode`])) throw bad('Unknown provider type'); next[`${ch}Mode`] = input[`${ch}Mode`]; }
  for (const c of Array.isArray(input.clear) ? input.clear : []) {
    if (c === 'email') { delete next.emailMode; delete next.resend; delete next.smtp; delete next.emailHttp; }
    if (c === 'sms') { delete next.smsMode; delete next.fast2sms; delete next.smsHttp; }
  }
  return next;
}

const hint = v => v ? `${'•'.repeat(8)}${String(v).length >= 12 ? String(v).slice(-4) : ''}` : '';
// What the browser may see: settings, never any secret value (only a masked hint and a saved flag).
export function publicView(creds = {}) {
  const view = { emailMode: creds.emailMode || '', smsMode: creds.smsMode || '' };
  for (const [g, spec] of Object.entries(GROUPS)) {
    const src = creds[g] || {}, out = {};
    for (const [f, kind] of Object.entries(spec.fields)) {
      if (kind === 'secret') { out[`${f}Saved`] = Boolean(src[f]); out[`${f}Hint`] = hint(src[f]); } else out[f] = src[f] ?? (kind === 'bool' ? false : '');
    }
    view[g] = out;
  }
  return view;
}
