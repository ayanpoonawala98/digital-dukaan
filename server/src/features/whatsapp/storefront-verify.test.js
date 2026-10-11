import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET ||= 'a'.repeat(40);
const V = await import('./storefront-verify.js');
const { Customer } = await import('../crm/crm.js');
const { sequelize } = await import('../../config/db.js');
const sha = v => createHash('sha256').update(v).digest('hex');
const now = Date.now();

// In-memory stand-ins for the two tables (no database in unit tests).
let rows, customers;
const sym = v => v[Object.getOwnPropertySymbols(v)[0]];
const m2 = (r, w) => Object.entries(w).every(([k, v]) => (v && typeof v === 'object' && Object.getOwnPropertySymbols(v).length) ? r[k] > sym(v) : r[k] === v);
function setup() {
  rows = []; customers = [];
  V.VerifyChallenge.sync = async () => {};
  V.VerifySession.sync = async () => {};
  V.VerifyChallenge.update = async (vals, { where }) => { const hit = rows.filter(r => m2(r, where)); hit.forEach(r => Object.assign(r, vals)); return [hit.length]; };
  V.VerifyChallenge.findOne = async ({ where }) => rows.find(r => m2(r, where)) || null;
  Customer.findOrCreate = async ({ where, defaults }) => { let c = customers.find(x => x.businessId === where.businessId && x.phone === where.phone); if (!c) { c = defaults; customers.push(c); } return [c, false]; };
  process.env.STOREFRONT_VERIFY_WHATSAPP_ENABLED = 'true'; process.env.STOREFRONT_VERIFY_WABA_ID = 'W1'; process.env.WHATSAPP_PHONE_NUMBER_ID = 'P1';
  process.env.CRM_ENABLED = 'true';
}
const seed = (over = {}) => { const token = V.newToken(); rows.push({ id: rows.length + 1, businessId: 1, tokenHash: sha(token), phone: '919876543210', expiresAt: new Date(now + 60000), consumedAt: null, ...over }); return token; };
const msg = (token, over = {}) => ({ id: 'wamid.' + Math.random(), from: '919876543210', type: 'text', timestamp: String(Math.floor(now / 1000)), text: { body: `DS VERIFY ${token}` }, ...over });
const call = (message, extra = {}) => V.handleVerifyMessage({ wabaId: 'W1', phoneNumberId: 'P1', message, now, ...extra });

test('token has 130 bits, alphabet and parser are strict', () => {
  const t = V.newToken(); assert.match(t, V.TOKEN_RE); assert.notEqual(t, V.newToken());
  assert.equal(V.parseVerifyText(`ds verify ${t.toLowerCase()}`), t);
  assert.equal(V.parseVerifyText(`DS VERIFY ${t} extra`), null);
});
test('matching sender verifies once; replay and duplicate do nothing', async () => {
  setup(); const t = seed();
  assert.equal(await call(msg(t)), true); assert.ok(rows[0].consumedAt); assert.equal(customers.length, 1);
  assert.equal(customers[0].source, 'whatsapp-verified');
  const first = rows[0].consumedAt; assert.equal(await call(msg(t)), true); assert.equal(rows[0].consumedAt, first); assert.equal(customers.length, 1);
});
test('sender that is not the typed number does not verify and does not consume', async () => {
  setup(); const t = seed(); assert.equal(await call(msg(t, { from: '919000000001' })), true);
  assert.equal(rows[0].consumedAt, null); assert.equal(customers.length, 0);
});
test('expired challenge, bad token and stale message are swallowed without verifying', async () => {
  setup(); const t = seed({ expiresAt: new Date(now - 1) }); assert.equal(await call(msg(t)), true); assert.equal(rows[0].consumedAt, null);
  const t2 = seed(); assert.equal(await call(msg(t2, { timestamp: String(Math.floor(now / 1000) - 3600) })), true); assert.equal(rows[1].consumedAt, null);
  assert.equal(await call(msg('SHORT')), true);
});
test('wrong WABA or number is not claimed and never verifies', async () => {
  setup(); const t = seed();
  assert.equal(await V.handleVerifyMessage({ wabaId: 'W2', phoneNumberId: 'P1', message: msg(t), now }), false);
  assert.equal(await V.handleVerifyMessage({ wabaId: 'W1', phoneNumberId: 'P9', message: msg(t), now }), false);
  assert.equal(rows[0].consumedAt, null);
});
test('non-text and ordinary messages are not claimed; flag off claims nothing', async () => {
  setup(); const t = seed();
  assert.equal(await call(msg(t, { type: 'image' })), false);
  assert.equal(await call(msg(t, { text: { body: 'hello order 5' } })), false);
  process.env.STOREFRONT_VERIFY_WHATSAPP_ENABLED = 'false'; assert.equal(await call(msg(t)), false); assert.equal(rows[0].consumedAt, null);
});
test('concurrent deliveries consume once and link one customer; tenants stay separate', async () => {
  setup(); const t = seed(); seed({ businessId: 2, tokenHash: sha(t + 'x') });
  await Promise.all([call(msg(t)), call(msg(t)), call(msg(t))]);
  assert.equal(rows.filter(r => r.consumedAt).length, 1); assert.equal(customers.length, 1); assert.equal(customers[0].businessId, 1);
});
test('order guard: off is a no-op; on requires matching verified session for this store and browser', async () => {
  setup(); const biz = { id: 1 }; const req = h => ({ headers: h });
  process.env.STOREFRONT_VERIFY_WHATSAPP_ENABLED = 'false'; await V.requireVerifiedPhone(req({}), biz, '9876543210');
  process.env.STOREFRONT_VERIFY_WHATSAPP_ENABLED = 'true';
  await assert.rejects(V.requireVerifiedPhone(req({}), biz, '9876543210'), e => e.status === 403 && e.code === 'PHONE_NOT_VERIFIED');
  const tok = 'a'.repeat(43), br = 'b'.repeat(24);
  const ses = { tokenHash: sha(tok), businessId: 1, browserHash: sha(br), phone: '919876543210', expiresAt: new Date(now + 1e6), revokedAt: null };
  V.VerifySession.findOne = async ({ where }) => (where.tokenHash === ses.tokenHash && where.businessId === ses.businessId ? ses : null);
  const h = { 'x-ds-verify': tok, 'x-ds-browser': br };
  await V.requireVerifiedPhone(req(h), biz, '+91 98765 43210');
  await assert.rejects(V.requireVerifiedPhone(req(h), biz, '9876543211'), /verify your phone/);
  await assert.rejects(V.requireVerifiedPhone(req({ ...h, 'x-ds-browser': 'c'.repeat(24) }), biz, '9876543210'), /verify your phone/);
  await assert.rejects(V.requireVerifiedPhone(req(h), { id: 2 }, '9876543210'), /verify your phone/);
});

const SECRET = 's'.repeat(43);
test('regression: a full verification (start, ~130 polls, session, logout) fits the real route limits from one IP', async () => {
  setup();
  const { default: express } = await import('express');
  const { verifyLimit, verifyPollLimit } = await import('../../shared/abuse-limits.js');
  delete process.env.DISABLE_ABUSE_LIMITS;
  process.env.STOREFRONT_VERIFY_WA_NUMBER = '919326069692';
  const created = [];
  V.VerifyChallenge.count = async () => 0;
  V.VerifyChallenge.create = async v => { const row = { id: rows.length + 1, consumedAt: null, claimedAt: null, ...v }; rows.push(row); created.push(row); return row; };
  V.VerifySession.create = async () => ({});
  sequelize.transaction = async cb => cb({});
  const app = express(); app.use(express.json());
  const router = express.Router();
  V.installVerifyRoutes(router, async () => ({ id: 1 }), { strict: [verifyLimit], poll: [verifyPollLimit] });
  app.use('/api/public', router); app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  const server = app.listen(0), base = `http://127.0.0.1:${server.address().port}/api/public/stores/s/verify`;
  const h = { 'content-type': 'application/json', 'x-ds-browser': 'b'.repeat(24) };
  try {
    const start = await fetch(base + '/start', { method: 'POST', headers: h, body: JSON.stringify({ phone: '9876543210' }) });
    assert.equal(start.status, 201); const { challengeId } = await start.json();
    const codes = new Set(); let final;
    for (let i = 0; i < 130; i++) { // the real client stops polling at 'verified'
      const r = await fetch(base + '/status', { method: 'POST', headers: h, body: JSON.stringify({ challengeId, sessionToken: SECRET }) }); codes.add(r.status);
      const j = await r.json(); if (j.status === 'verified') { final = j; break; }
      if (i === 100) created[0].consumedAt = new Date();
    }
    assert.deepEqual([...codes], [200]); assert.equal(final?.status, 'verified');
    assert.equal((await fetch(base + '/session', { headers: h })).status, 200);
    assert.equal((await fetch(base + '/logout', { method: 'POST', headers: h })).status, 200);
  } finally { server.close(); process.env.DISABLE_ABUSE_LIMITS = '1'; }
});

function claimApp() {
  setup();
  sessions = [];
  V.VerifyChallenge.count = async () => 0;
  V.VerifySession.create = async v => { if (failCreate) throw new Error('db down'); sessions.push(v); return v; };
  // Real rollback semantics for the fake tables: restore the snapshot when the callback throws.
  sequelize.transaction = async cb => { const snap = JSON.stringify(rows), sn = sessions.length; try { return await cb({}); } catch (e) { rows.splice(0, rows.length, ...JSON.parse(snap).map(r => ({ ...r, expiresAt: new Date(r.expiresAt), consumedAt: r.consumedAt && new Date(r.consumedAt), claimedAt: r.claimedAt && new Date(r.claimedAt) }))); sessions.length = sn; throw e; } };
}
let sessions, failCreate = false;
const statusCall = async (publicId, secret, browser = 'b'.repeat(24)) => {
  const { default: express } = await import('express');
  const app = express(); app.use(express.json()); const router = express.Router();
  V.installVerifyRoutes(router, async () => ({ id: 1 }), {});
  app.use('/api/public', router); app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  const server = app.listen(0);
  try { const r = await fetch(`http://127.0.0.1:${server.address().port}/api/public/stores/s/verify/status`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-ds-browser': browser }, body: JSON.stringify({ challengeId: publicId, sessionToken: secret }) }); return { status: r.status, body: await r.json() }; } finally { server.close(); }
};
test('a failed session write rolls the claim back so the same poll can retry', async () => {
  claimApp(); failCreate = true; seed({ publicId: 'pub1', browserHash: sha('b'.repeat(24)), consumedAt: new Date(now), claimedAt: null, sessionHash: null });
  assert.equal((await statusCall('pub1', SECRET)).status, 500); assert.equal(rows[0].claimedAt, null); assert.equal(sessions.length, 0);
  failCreate = false; const ok = await statusCall('pub1', SECRET); assert.equal(ok.body.status, 'verified'); assert.equal(sessions.length, 1);
});
test('a dropped response is recovered with the same secret; another secret or browser gets nothing', async () => {
  claimApp(); failCreate = false; seed({ publicId: 'pub2', browserHash: sha('b'.repeat(24)), consumedAt: new Date(now), claimedAt: null, sessionHash: null });
  assert.equal((await statusCall('pub2', SECRET)).body.status, 'verified');
  assert.equal((await statusCall('pub2', SECRET)).body.status, 'verified'); assert.equal(sessions.length, 1);
  assert.equal((await statusCall('pub2', 'z'.repeat(43))).body.status, 'expired');
  assert.equal((await statusCall('pub2', SECRET, 'c'.repeat(24))).body.status, 'expired'); assert.equal(sessions.length, 1);
});
test('concurrent claims with the same secret issue one session', async () => {
  claimApp(); failCreate = false; seed({ publicId: 'pub3', browserHash: sha('b'.repeat(24)), consumedAt: new Date(now), claimedAt: null, sessionHash: null });
  const r = await Promise.all([statusCall('pub3', SECRET), statusCall('pub3', SECRET), statusCall('pub3', SECRET)]);
  assert.equal(sessions.length, 1); assert.ok(r.every(x => x.body.status === 'verified'));
});

test('store scope: only listed slugs enforce and expose verification; unset means all; flag off means none', async () => {
  setup(); const noSession = { headers: {} };
  delete process.env.STOREFRONT_VERIFY_STORE_SLUGS;
  assert.equal(V.enabledForSlug('any'), true);
  process.env.STOREFRONT_VERIFY_STORE_SLUGS = ' Store-12 ,other';
  assert.equal(V.enabledForSlug('store-12'), true); assert.equal(V.enabledForSlug('store-8'), false);
  await V.requireVerifiedPhone(noSession, { id: 8, slug: 'store-8' }, '9876543210'); // unlisted store is untouched
  await assert.rejects(V.requireVerifiedPhone(noSession, { id: 12, slug: 'store-12' }, '9876543210'), /verify your phone/);
  process.env.STOREFRONT_VERIFY_WHATSAPP_ENABLED = 'false'; assert.equal(V.enabledForSlug('store-12'), false);
  delete process.env.STOREFRONT_VERIFY_STORE_SLUGS;
});
