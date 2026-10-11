// Platform phone identity, proved by an inbound WhatsApp message. The customer sends "DS VERIFY <token>" to the platform number;
// the signed webhook proves the sender. One platform identity per normalized phone, one Secure HttpOnly cookie session per browser.
// Stores never share data: each store keeps its own enrollment and its own Customers row. No outbound message is ever sent.
// v1 covers storefronts on the platform's own site (same-site as the API). Custom domains are not covered.
import QRCode from 'qrcode';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { DataTypes, Op } from 'sequelize';
import { sequelize } from '../../config/db.js';
import { bad, wrap } from '../../shared/utils/core.js';
import { orderPhone } from '../crm/customer-pure.js';
import { Customer, crmEnabled } from '../crm/crm.js';

export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RECOVER_MS = 10 * 60 * 1000; // a dropped claim response can be recovered for this long
const MAX_MESSAGE_AGE_MS = 10 * 60 * 1000;
export const COOKIE = 'ds_id';
export const flagOn = () => process.env.STOREFRONT_VERIFY_WHATSAPP_ENABLED === 'true';
// Optional staged rollout: STOREFRONT_VERIFY_STORE_SLUGS=slug-a,slug-b limits verification to those stores. Unset means every store.
export function enabledForSlug(slug) {
  if (!flagOn()) return false;
  const list = String(process.env.STOREFRONT_VERIFY_STORE_SLUGS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  return !list.length || list.includes(String(slug || '').toLowerCase());
}
const sha = v => createHash('sha256').update(String(v)).digest('hex');
const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// 26 chars of a 32 letter alphabet = 130 bits.
export const newToken = () => { const b = randomBytes(26); let s = ''; for (const x of b) s += B32[x & 31]; return s; };
export const TOKEN_RE = /^[A-HJ-NP-Z2-9]{26}$/;
export const parseVerifyText = text => { const m = /^\s*DS VERIFY ([A-Za-z0-9]{26})\s*$/i.exec(String(text || '')); return m ? m[1].toUpperCase() : null; };
const isVerifyLike = text => /^\s*DS\s+VERIFY\b/i.test(String(text || ''));
const safeEq = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && timingSafeEqual(x, y); };

export const PlatformIdentity = sequelize.define('PlatformIdentity', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  phone: { type: DataTypes.STRING(15), allowNull: false, unique: true }
}, { tableName: 'platform_identities' });

export const PlatformSession = sequelize.define('PlatformSession', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  identityId: { type: DataTypes.BIGINT, allowNull: false },
  expiresAt: { type: DataTypes.DATE, allowNull: false }, // absolute, never extended
  revokedAt: { type: DataTypes.DATE, allowNull: true }
}, { tableName: 'platform_sessions', indexes: [{ fields: ['identityId'] }] });

// One row per (store, identity). The store's Customers row is created or reused by phone; nothing else is copied between stores.
export const StoreEnrollment = sequelize.define('StoreEnrollment', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  businessId: { type: DataTypes.INTEGER, allowNull: false },
  identityId: { type: DataTypes.BIGINT, allowNull: false }
}, { tableName: 'store_enrollments', indexes: [{ unique: true, fields: ['businessId', 'identityId'], name: 'store_enrollments_store_identity' }] });

// A shop can block a phone number for itself only. Blocks are per store, never shared, and never copy any data between stores.
export const StoreBlock = sequelize.define('StoreBlock', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  businessId: { type: DataTypes.INTEGER, allowNull: false },
  phone: { type: DataTypes.STRING(15), allowNull: false },
  blockedByUserId: { type: DataTypes.INTEGER }
}, { tableName: 'store_blocks', indexes: [{ unique: true, fields: ['businessId', 'phone'] }] });
export const isBlocked = async (businessId, phone) => Boolean(phone) && Boolean(await StoreBlock.findOne({ where: { businessId, phone }, attributes: ['id'] }));
const BLOCKED_MSG = 'This phone number cannot be used to order from this shop.';

export const VerifyChallenge = sequelize.define('StorefrontVerifyChallenge', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  publicId: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  businessId: { type: DataTypes.INTEGER, allowNull: false },
  tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  browserHash: { type: DataTypes.STRING(64), allowNull: false },
  claimHash: { type: DataTypes.STRING(64), allowNull: true }, // browser-held secret that lets only this browser claim the session
  phone: { type: DataTypes.STRING(15), allowNull: false },
  purpose: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'checkout' },
  expiresAt: { type: DataTypes.DATE, allowNull: false },
  consumedAt: { type: DataTypes.DATE, allowNull: true },
  claimedAt: { type: DataTypes.DATE, allowNull: true },
  identityId: { type: DataTypes.BIGINT, allowNull: true },
  sessionId: { type: DataTypes.BIGINT, allowNull: true },
  messageId: { type: DataTypes.STRING(255), allowNull: true }
}, { tableName: 'storefront_verify_challenges', indexes: [{ fields: ['businessId', 'phone', 'createdAt'] }, { fields: ['browserHash', 'createdAt'] }] });

let ready;
const COLS = 'ALTER TABLE storefront_verify_challenges ADD COLUMN IF NOT EXISTS "claimHash" VARCHAR(64), ADD COLUMN IF NOT EXISTS "identityId" BIGINT, ADD COLUMN IF NOT EXISTS "sessionId" BIGINT';
// Any failure leaves the module not ready and surfaces as an error, rather than serving with half a schema.
export const ensureVerifySchema = () => (ready ||= (async () => {
  await sequelize.query('ALTER TABLE IF EXISTS storefront_verify_challenges ADD COLUMN IF NOT EXISTS "claimHash" VARCHAR(64), ADD COLUMN IF NOT EXISTS "identityId" BIGINT, ADD COLUMN IF NOT EXISTS "sessionId" BIGINT');
  await Promise.all([PlatformIdentity.sync(), PlatformSession.sync(), StoreEnrollment.sync(), VerifyChallenge.sync(), StoreBlock.sync()]);
  await sequelize.query(COLS);
})().catch(e => { ready = null; throw e; }));

let lastPurge = 0;
// Bounded cleanup of dead rows. Runs at most every 10 minutes per process, from the start route.
export async function purgeExpiredVerify(now = Date.now()) {
  if (now - lastPurge < 10 * 60 * 1000) return;
  lastPurge = now;
  const cutoff = new Date(now - 24 * 60 * 60 * 1000);
  try {
    await sequelize.query('DELETE FROM storefront_verify_challenges WHERE id IN (SELECT id FROM storefront_verify_challenges WHERE "expiresAt" < :cutoff LIMIT 1000)', { replacements: { cutoff } });
    await sequelize.query("DO $$ BEGIN IF to_regclass('public.storefront_verify_sessions') IS NOT NULL THEN DELETE FROM storefront_verify_sessions WHERE id IN (SELECT id FROM storefront_verify_sessions WHERE \"expiresAt\" < now() - interval '1 day' OR \"revokedAt\" < now() - interval '1 day' LIMIT 1000); END IF; END $$");
    await sequelize.query('DELETE FROM platform_sessions WHERE id IN (SELECT id FROM platform_sessions WHERE "expiresAt" < :cutoff OR "revokedAt" < :cutoff LIMIT 1000)', { replacements: { cutoff } });
  } catch (err) { console.error('Verify cleanup failed', { message: err.message }); }
}

// Webhook allowlist. Both must be configured or nothing is accepted.
export function allowedSource(wabaId, phoneNumberId) {
  const w = process.env.STOREFRONT_VERIFY_WABA_ID, p = process.env.WHATSAPP_PHONE_NUMBER_ID;
  return Boolean(w && p && String(wabaId) === w && String(phoneNumberId) === p);
}
const platformNumber = () => String(process.env.STOREFRONT_VERIFY_WA_NUMBER || '').replace(/\D/g, '');
export const verifyLink = token => `https://wa.me/${platformNumber()}?text=${encodeURIComponent(`DS VERIFY ${token}`)}`;

// Create or reuse this store's enrollment and Customers row. Existing rows are never overwritten. Never throws into an order.
export async function enrollInStore(businessId, identity) {
  try {
    await StoreEnrollment.findOrCreate({ where: { businessId, identityId: identity.id }, defaults: { businessId, identityId: identity.id } });
    if (crmEnabled()) await Customer.findOrCreate({ where: { businessId, phone: identity.phone }, defaults: { businessId, phone: identity.phone, name: '', source: 'whatsapp-verified' } });
  } catch (err) { console.error('Store enrollment failed', { businessId, message: err.message }); }
}

// Handles one inbound message. Returns true when the message is verification traffic and must not go anywhere else.
export async function handleVerifyMessage({ wabaId, phoneNumberId, message, now = Date.now() }) {
  if (!flagOn() || message?.type !== 'text' || !isVerifyLike(message.text?.body)) return false;
  if (!allowedSource(wabaId, phoneNumberId)) return false; // wrong WABA or number: ordinary routing decides, nothing verified
  await ensureVerifySchema();
  const sender = String(message.from || ''), at = Number(message.timestamp) * 1000;
  const token = parseVerifyText(message.text.body);
  if (!token || !/^[1-9]\d{7,14}$/.test(sender) || !message.id || !Number.isFinite(at) || now - at > MAX_MESSAGE_AGE_MS || at > now + 60000) return true;
  // Consume, identity and challenge link commit together. A failed write rolls the consume back, so a redelivery can still succeed.
  const pending = await VerifyChallenge.findOne({ where: { tokenHash: sha(token), phone: sender, consumedAt: null }, attributes: ['businessId'] });
  if (pending && await isBlocked(pending.businessId, sender)) return true; // blocked here: never verified, never enrolled
  const done = await sequelize.transaction(async transaction => {
    const [count] = await VerifyChallenge.update(
      { consumedAt: new Date(now), messageId: String(message.id).slice(0, 255) },
      { where: { tokenHash: sha(token), phone: sender, consumedAt: null, expiresAt: { [Op.gt]: new Date(now) } }, transaction });
    if (count !== 1) return null; // unknown, expired, used, or sender is not the number that was typed
    const row = await VerifyChallenge.findOne({ where: { tokenHash: sha(token) }, transaction });
    const [identity] = await PlatformIdentity.findOrCreate({ where: { phone: row.phone }, defaults: { phone: row.phone }, transaction });
    await VerifyChallenge.update({ identityId: identity.id }, { where: { id: row.id }, transaction });
    return { row, identity };
  });
  if (done) await enrollInStore(done.row.businessId, done.identity); // the person just chose this store: intentional
  return true;
}

export const parseCookie = (header, name = COOKIE) => { for (const part of String(header || '').split(';')) { const i = part.indexOf('='); if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim(); } return ''; };
const cookieHeader = (value, maxAgeSeconds) => `${COOKIE}=${value}; Path=/api; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`;
const setCookie = (res, token) => res.setHeader('Set-Cookie', cookieHeader(token, Math.floor(SESSION_TTL_MS / 1000)));
const clearCookie = res => res.setHeader('Set-Cookie', cookieHeader('', 0));

// The platform session of this request, or null. Identity is derived from the server-side session only.
export async function platformSession(req) {
  const t = parseCookie(req.headers?.cookie);
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(t)) return null;
  const s = await PlatformSession.findOne({ where: { tokenHash: sha(t), revokedAt: null, expiresAt: { [Op.gt]: new Date() } } });
  if (!s) return null;
  const identity = await PlatformIdentity.findOne({ where: { id: s.identityId } });
  return identity ? { session: s, identity } : null;
}

// Order guard. No-op while the flag is off for this store. When on, the order phone must be the verified identity's phone;
// the store's customer is derived and enrolled on the server.
export async function requireVerifiedPhone(req, business, rawPhone) {
  if (!enabledForSlug(business.slug)) return;
  const phone = orderPhone(rawPhone);
  const auth = phone && await platformSession(req);
  if (!auth || auth.identity.phone !== phone) { const e = bad(403, 'Please verify your phone number with WhatsApp to place this order.'); e.code = 'PHONE_NOT_VERIFIED'; throw e; }
  if (await isBlocked(business.id, auth.identity.phone)) { const e = bad(403, BLOCKED_MSG); e.code = 'PHONE_BLOCKED'; throw e; }
  await enrollInStore(business.id, auth.identity);
}

const quiet = { error: 'Could not start verification. Please try again in a few minutes.' };
export function installVerifyRoutes(r, shop, { strict = [], poll = [] } = {}) {
  const guard = (req, res, next) => (enabledForSlug(req.params.slug) ? next() : res.status(404).json({ error: 'Not found' }));
  const browserId = req => { const b = String(req.headers['x-ds-browser'] || ''); return /^[A-Za-z0-9_-]{20,64}$/.test(b) ? b : null; };
  const secretOf = req => { const s = String(req.body?.claimSecret || ''); return /^[A-Za-z0-9_-]{40,64}$/.test(s) ? s : null; };
  r.use('/stores/:slug/verify', guard);
  r.post('/stores/:slug/verify/start', ...strict, wrap(async (req, res) => {
    const browser = browserId(req), claim = secretOf(req); if (!browser || !claim) throw bad(400, 'Invalid request');
    const business = await shop(req.params.slug);
    const phone = orderPhone(req.body?.phone);
    if (!phone || !platformNumber()) throw bad(400, 'Enter a valid phone number with country code');
    await ensureVerifySchema();
    if (await isBlocked(business.id, phone)) { const e = bad(403, BLOCKED_MSG); e.code = 'PHONE_BLOCKED'; throw e; }
    purgeExpiredVerify();
    const since = new Date(Date.now() - 15 * 60 * 1000);
    const [byDevice, byNumber, global] = await Promise.all([
      VerifyChallenge.count({ where: { browserHash: sha(browser), createdAt: { [Op.gt]: since } } }),
      VerifyChallenge.count({ where: { businessId: business.id, phone, createdAt: { [Op.gt]: since } } }),
      VerifyChallenge.count({ where: { createdAt: { [Op.gt]: since } } })]);
    if (byDevice >= 5 || byNumber >= 3 || global >= 500) return res.status(429).json(quiet);
    const token = newToken(), publicId = randomBytes(18).toString('base64url');
    await VerifyChallenge.create({ publicId, businessId: business.id, tokenHash: sha(token), browserHash: sha(browser), claimHash: sha(claim), phone, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) });
    const link = verifyLink(token), qrSvg = await QRCode.toString(link, { type: 'svg', margin: 1 });
    res.status(201).json({ challengeId: publicId, link, qrSvg, expiresInSeconds: CHALLENGE_TTL_MS / 1000, number: `+${platformNumber()}`,
      warning: 'Only send this if you started verification on this shop. Never send it because someone else asked.' });
  }));
  // The browser proves it owns the challenge (browser id + claim secret). The session secret is made here and only ever travels in the cookie.
  r.post('/stores/:slug/verify/status', ...poll, wrap(async (req, res) => {
    const browser = browserId(req), claim = secretOf(req); if (!browser || !claim) throw bad(400, 'Invalid request');
    const business = await shop(req.params.slug);
    await ensureVerifySchema();
    const find = () => VerifyChallenge.findOne({ where: { publicId: String(req.body?.challengeId || '').slice(0, 40), businessId: business.id, browserHash: sha(browser) } });
    const c = await find();
    if (!c || !safeEq(c.claimHash, sha(claim))) return res.json({ status: 'expired' });
    if (!c.consumedAt) return res.json({ status: c.expiresAt.getTime() > Date.now() ? 'pending' : 'expired' });
    if (!c.identityId) return res.json({ status: 'pending' }); // webhook is still finishing
    if (await isBlocked(business.id, c.phone)) return res.json({ status: 'blocked' }); // blocked after the consume: no session is issued or recovered for this store
    // The session secret is derived from the challenge and the browser's claim secret with a server key. Every claim or recovery for the
    // same challenge therefore yields the same cookie value: nothing is re-keyed, no cookie goes stale, and a repeat is idempotent.
    const token = createHmac('sha256', String(process.env.JWT_SECRET || '')).update(`verify-session:${c.id}:${claim}`).digest('base64url');
    const out = await sequelize.transaction(async transaction => {
      const [claimed] = await VerifyChallenge.update({ claimedAt: new Date() }, { where: { id: c.id, claimedAt: null }, transaction });
      if (claimed === 1) {
        const sess = await PlatformSession.create({ tokenHash: sha(token), identityId: c.identityId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) }, { transaction });
        await VerifyChallenge.update({ sessionId: sess.id }, { where: { id: c.id }, transaction });
        return { issued: true };
      }
      // Already claimed: the same browser may collect the same session again for a short while (dropped response, retry).
      const again = await VerifyChallenge.findOne({ where: { id: c.id }, transaction });
      if (!again?.claimedAt || Date.now() - new Date(again.claimedAt).getTime() > RECOVER_MS) return { issued: false };
      const live = await PlatformSession.findOne({ where: { tokenHash: sha(token), revokedAt: null, expiresAt: { [Op.gt]: new Date() } }, transaction });
      return { issued: Boolean(live) };
    });
    if (!out.issued) return res.json({ status: 'expired' });
    setCookie(res, token);
    res.json({ status: 'verified', phone: c.phone, expiresInDays: 30 });
  }));
  r.get('/stores/:slug/verify/session', ...poll, wrap(async (req, res) => {
    const business = await shop(req.params.slug);
    await ensureVerifySchema();
    const a = await platformSession(req);
    if (a && await isBlocked(business.id, a.identity.phone)) { const e = bad(403, BLOCKED_MSG); e.code = 'PHONE_BLOCKED'; throw e; } // surfaced here so the order gate never auto-proceeds into an avoidable error
    res.json(a ? { verified: true, phone: a.identity.phone } : { verified: false });
  }));
  // Intentional authenticated visit: the shopper asked to continue as this verified number in this store.
  r.post('/stores/:slug/verify/enroll', ...poll, wrap(async (req, res) => {
    const business = await shop(req.params.slug);
    if (!browserId(req)) throw bad(400, 'Invalid request');
    await ensureVerifySchema();
    const a = await platformSession(req);
    if (!a) return res.json({ verified: false });
    if (await isBlocked(business.id, a.identity.phone)) { const e = bad(403, BLOCKED_MSG); e.code = 'PHONE_BLOCKED'; throw e; } // blocked here: never enrolled
    await enrollInStore(business.id, a.identity);
    res.json({ verified: true, phone: a.identity.phone });
  }));
  // Logout ends this browser's session. "all" ends every session of the identity on every device. A store's own block stays store-local.
  r.post('/stores/:slug/verify/logout', ...strict, wrap(async (req, res) => {
    await shop(req.params.slug);
    await ensureVerifySchema();
    const a = await platformSession(req);
    if (a) await (req.body?.all === true ? PlatformSession.update({ revokedAt: new Date() }, { where: { identityId: a.identity.id, revokedAt: null } }) : a.session.update({ revokedAt: new Date() }));
    clearCookie(res);
    res.json({ ok: true });
  }));
}

// Owner routes (mounted under /owner/:storeId/blocked-phones). Everything is scoped to req.store.id.
export function blockRoutes(Router, ownerOnly) {
  const r = Router();
  r.get('/', async (req, res, next) => { try { await ensureVerifySchema(); const rows = (await StoreBlock.findAll({ where: { businessId: req.store.id }, order: [['id', 'DESC']], limit: 501, attributes: ['id', 'phone', 'createdAt'] })).map(b => b.toJSON()); res.json({ blocked: rows.slice(0, 500), truncated: rows.length > 500 }); } catch (e) { next(e); } });
  r.post('/', ownerOnly, async (req, res, next) => { try {
    const phone = orderPhone(req.body?.phone); if (!phone) throw bad(400, 'Enter a valid phone number with country code');
    await ensureVerifySchema();
    const [row] = await StoreBlock.findOrCreate({ where: { businessId: req.store.id, phone }, defaults: { businessId: req.store.id, phone, blockedByUserId: req.user?.id ?? null } });
    // Existing live sessions need no revoking: the order guard checks the block on every order.
    res.status(201).json({ blocked: { id: row.id, phone: row.phone } });
  } catch (e) { next(e); } });
  r.delete('/:phone', ownerOnly, async (req, res, next) => { try {
    const phone = orderPhone(req.params.phone); if (!phone) throw bad(400, 'Invalid phone number');
    await ensureVerifySchema();
    await StoreBlock.destroy({ where: { businessId: req.store.id, phone } });
    res.json({ ok: true });
  } catch (e) { next(e); } });
  return r;
}
