// Storefront phone verification by inbound WhatsApp. The customer sends "DS VERIFY <token>" to the platform number;
// the signed webhook proves the sender. No outbound code, no template. Everything is store scoped.
import QRCode from 'qrcode';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { DataTypes, Op } from 'sequelize';
import { sequelize } from '../../config/db.js';
import { bad, wrap } from '../../shared/utils/core.js';
import { clientIp } from '../../shared/abuse-limits.js';
import { orderPhone } from '../crm/customer-pure.js';
import { Customer, crmEnabled } from '../crm/crm.js';

export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_MESSAGE_AGE_MS = 10 * 60 * 1000;
export const flagOn = () => process.env.STOREFRONT_VERIFY_WHATSAPP_ENABLED === 'true';
const sha = v => createHash('sha256').update(String(v)).digest('hex');
const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// 26 chars of a 32 letter alphabet = 130 bits.
export const newToken = () => { const b = randomBytes(26); let s = ''; for (const x of b) s += B32[x & 31]; return s; };
export const TOKEN_RE = /^[A-HJ-NP-Z2-9]{26}$/;
export const parseVerifyText = text => { const m = /^\s*DS VERIFY ([A-Za-z0-9]{26})\s*$/i.exec(String(text || '')); return m ? m[1].toUpperCase() : null; };
const isVerifyLike = text => /^\s*DS\s+VERIFY\b/i.test(String(text || ''));

export const VerifyChallenge = sequelize.define('StorefrontVerifyChallenge', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  publicId: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  businessId: { type: DataTypes.INTEGER, allowNull: false },
  tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  browserHash: { type: DataTypes.STRING(64), allowNull: false },
  phone: { type: DataTypes.STRING(15), allowNull: false },
  purpose: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'checkout' },
  expiresAt: { type: DataTypes.DATE, allowNull: false },
  consumedAt: { type: DataTypes.DATE, allowNull: true },
  claimedAt: { type: DataTypes.DATE, allowNull: true },
  sessionHash: { type: DataTypes.STRING(64), allowNull: true },
  messageId: { type: DataTypes.STRING(255), allowNull: true }
}, { tableName: 'storefront_verify_challenges', indexes: [{ fields: ['businessId', 'phone', 'createdAt'] }, { fields: ['browserHash', 'createdAt'] }] });

export const VerifySession = sequelize.define('StorefrontVerifySession', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  businessId: { type: DataTypes.INTEGER, allowNull: false },
  browserHash: { type: DataTypes.STRING(64), allowNull: false },
  phone: { type: DataTypes.STRING(15), allowNull: false },
  expiresAt: { type: DataTypes.DATE, allowNull: false },
  revokedAt: { type: DataTypes.DATE, allowNull: true }
}, { tableName: 'storefront_verify_sessions', indexes: [{ fields: ['businessId', 'phone'] }] });

let lastPurge = 0;
// Bounded cleanup of dead rows. Runs at most every 10 minutes per process, from the start route.
export async function purgeExpiredVerify(now = Date.now()) {
  if (now - lastPurge < 10 * 60 * 1000) return;
  lastPurge = now;
  const cutoff = new Date(now - 24 * 60 * 60 * 1000);
  try {
    await sequelize.query('DELETE FROM storefront_verify_challenges WHERE id IN (SELECT id FROM storefront_verify_challenges WHERE "expiresAt" < :cutoff LIMIT 1000)', { replacements: { cutoff } });
    await sequelize.query('DELETE FROM storefront_verify_sessions WHERE id IN (SELECT id FROM storefront_verify_sessions WHERE "expiresAt" < :cutoff OR "revokedAt" < :cutoff LIMIT 1000)', { replacements: { cutoff } });
  } catch (err) { console.error('Verify cleanup failed', { message: err.message }); }
}
let ready;
export const ensureVerifySchema = () => (ready ||= Promise.all([VerifyChallenge.sync(), VerifySession.sync()]).catch(e => { ready = null; throw e; }));

// Webhook allowlist. Both must be configured or nothing is accepted.
export function allowedSource(wabaId, phoneNumberId) {
  const w = process.env.STOREFRONT_VERIFY_WABA_ID, p = process.env.WHATSAPP_PHONE_NUMBER_ID;
  return Boolean(w && p && String(wabaId) === w && String(phoneNumberId) === p);
}
const platformNumber = () => String(process.env.STOREFRONT_VERIFY_WA_NUMBER || '').replace(/\D/g, '');
export const verifyLink = token => `https://wa.me/${platformNumber()}?text=${encodeURIComponent(`DS VERIFY ${token}`)}`;

async function linkCustomer(businessId, phone) {
  try {
    if (!crmEnabled()) return;
    await Customer.findOrCreate({ where: { businessId, phone }, defaults: { businessId, phone, name: '', source: 'whatsapp-verified' } });
  } catch (err) { console.error('Verified customer link failed', { businessId, message: err.message }); }
}

// Handles one inbound message. Returns true when the message is verification traffic and must not go anywhere else.
export async function handleVerifyMessage({ wabaId, phoneNumberId, message, now = Date.now() }) {
  if (!flagOn() || message?.type !== 'text' || !isVerifyLike(message.text?.body)) return false;
  if (!allowedSource(wabaId, phoneNumberId)) return false; // wrong WABA or number: ordinary routing decides, nothing verified
  await ensureVerifySchema();
  const sender = String(message.from || ''), at = Number(message.timestamp) * 1000;
  const token = parseVerifyText(message.text.body);
  if (!token || !/^[1-9]\d{7,14}$/.test(sender) || !message.id || !Number.isFinite(at) || now - at > MAX_MESSAGE_AGE_MS || at > now + 60000) return true;
  const [count] = await VerifyChallenge.update(
    { consumedAt: new Date(now), messageId: String(message.id).slice(0, 255) },
    { where: { tokenHash: sha(token), phone: sender, consumedAt: null, expiresAt: { [Op.gt]: new Date(now) } } });
  if (count !== 1) return true; // unknown, expired, used, or sender is not the number that was typed
  const row = await VerifyChallenge.findOne({ where: { tokenHash: sha(token) } });
  if (row) await linkCustomer(row.businessId, row.phone);
  return true;
}

async function sessionFor(req, business) {
  const t = String(req.headers['x-ds-verify'] || '');
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(t)) return null;
  const s = await VerifySession.findOne({ where: { tokenHash: sha(t), businessId: business.id, revokedAt: null, expiresAt: { [Op.gt]: new Date() } } });
  const browser = String(req.headers['x-ds-browser'] || '');
  if (!s || !browser || !safeEq(s.browserHash, sha(browser))) return null;
  return s;
}
const safeEq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

// Order guard. No-op while the flag is off. When on, the phone on the order must be the verified phone for this store.
export async function requireVerifiedPhone(req, business, rawPhone) {
  if (!flagOn()) return;
  const phone = orderPhone(rawPhone);
  const s = phone && await sessionFor(req, business);
  if (!s || s.phone !== phone) { const e = bad(403, 'Please verify your phone number with WhatsApp to place this order.'); e.code = 'PHONE_NOT_VERIFIED'; throw e; }
}

const quiet = { error: 'Could not start verification. Please try again in a few minutes.' };
export function installVerifyRoutes(r, shop, { strict = [], poll = [] } = {}) {
  const guard = (req, res, next) => (flagOn() ? next() : res.status(404).json({ error: 'Not found' }));
  const browserId = req => { const b = String(req.headers['x-ds-browser'] || ''); return /^[A-Za-z0-9_-]{20,64}$/.test(b) ? b : null; };
  r.use('/stores/:slug/verify', guard);
  r.post('/stores/:slug/verify/start', ...strict, wrap(async (req, res) => {
    const browser = browserId(req); if (!browser) throw bad(400, 'Invalid request');
    const business = await shop(req.params.slug);
    const phone = orderPhone(req.body?.phone);
    if (!phone || !platformNumber()) throw bad(400, 'Enter a valid phone number with country code');
    await ensureVerifySchema();
    purgeExpiredVerify();
    const since = new Date(Date.now() - 15 * 60 * 1000);
    const [byDevice, byNumber, global] = await Promise.all([
      VerifyChallenge.count({ where: { browserHash: sha(browser), createdAt: { [Op.gt]: since } } }),
      VerifyChallenge.count({ where: { businessId: business.id, phone, createdAt: { [Op.gt]: since } } }),
      VerifyChallenge.count({ where: { createdAt: { [Op.gt]: since } } })]);
    if (byDevice >= 5 || byNumber >= 3 || global >= 500) return res.status(429).json(quiet);
    const token = newToken(), publicId = randomBytes(18).toString('base64url');
    await VerifyChallenge.create({ publicId, businessId: business.id, tokenHash: sha(token), browserHash: sha(browser), phone, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) });
    const link = verifyLink(token), qrSvg = await QRCode.toString(link, { type: 'svg', margin: 1 });
    res.status(201).json({ challengeId: publicId, link, qrSvg, expiresInSeconds: CHALLENGE_TTL_MS / 1000, number: `+${platformNumber()}`,
      warning: 'Only send this if you started verification on this shop. Never send it because someone else asked.' });
  }));
  r.post('/stores/:slug/verify/status', ...poll, wrap(async (req, res) => {
    const browser = browserId(req); if (!browser) throw bad(400, 'Invalid request');
    const business = await shop(req.params.slug);
    // The browser creates its own session secret and sends it here; the server only stores its hash. That makes the claim
    // idempotent: a dropped response is recovered by asking again with the same secret, and nobody else can be issued a session.
    const secret = String(req.body?.sessionToken || '');
    if (!/^[A-Za-z0-9_-]{40,64}$/.test(secret)) throw bad(400, 'Invalid request');
    await ensureVerifySchema();
    const find = () => VerifyChallenge.findOne({ where: { publicId: String(req.body?.challengeId || '').slice(0, 40), businessId: business.id, browserHash: sha(browser) } });
    let c = await find();
    if (!c) return res.json({ status: 'expired' });
    if (!c.consumedAt) return res.json({ status: c.expiresAt.getTime() > Date.now() ? 'pending' : 'expired' });
    const done = row => res.json(row.sessionHash && safeEq(row.sessionHash, sha(secret)) ? { status: 'verified', phone: row.phone, expiresInDays: 30 } : { status: 'expired' });
    if (c.claimedAt) return done(c);
    // Claim and session creation commit together or not at all, so a failed write leaves the challenge claimable.
    await sequelize.transaction(async transaction => {
      const [claimed] = await VerifyChallenge.update({ claimedAt: new Date(), sessionHash: sha(secret) }, { where: { id: c.id, claimedAt: null }, transaction });
      if (claimed === 1) await VerifySession.create({ tokenHash: sha(secret), businessId: business.id, browserHash: sha(browser), phone: c.phone, expiresAt: new Date(Date.now() + SESSION_TTL_MS) }, { transaction });
    });
    c = await find();
    return done(c);
  }));
  r.get('/stores/:slug/verify/session', ...poll, wrap(async (req, res) => {
    const business = await shop(req.params.slug);
    await ensureVerifySchema();
    const s = await sessionFor(req, business);
    res.json(s ? { verified: true, phone: s.phone } : { verified: false });
  }));
  r.post('/stores/:slug/verify/logout', ...strict, wrap(async (req, res) => {
    const business = await shop(req.params.slug);
    await ensureVerifySchema();
    const s = await sessionFor(req, business);
    if (s) await s.update({ revokedAt: new Date() });
    res.json({ ok: true });
  }));
}
export { clientIp };
