import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET ||= 'a'.repeat(40);
const V = await import('./storefront-verify.js');
const { Customer } = await import('../crm/crm.js');
const { sequelize } = await import('../../config/db.js');
const { Op } = await import('sequelize');
const { default: express } = await import('express');
const { verifyLimit, verifyPollLimit } = await import('../../shared/abuse-limits.js');
const sha = v => createHash('sha256').update(v).digest('hex');
const now = Date.now();

// In-memory tables standing in for Postgres. Where clauses support equality, null and Op.gt.
const tables = {};
const matches = (r, w) => Object.entries(w).every(([k, v]) => (v && typeof v === 'object' && !(v instanceof Date) && Op.gt in v) ? r[k] > v[Op.gt] : (v === null ? r[k] == null : r[k] === v));
function fake(Model, name, uniqueKeys = []) {
  const rows = tables[name] = []; let id = 0;
  Model.findOne = async ({ where }) => rows.find(r => matches(r, where)) || null;
  Model.count = async ({ where }) => rows.filter(r => matches(r, where)).length;
  Model.create = async (v) => { const row = { id: ++id, createdAt: new Date(), ...v }; row.update = async c => Object.assign(row, c); rows.push(row); return row; };
  Model.update = async (vals, { where }) => { const hit = rows.filter(r => matches(r, where)); hit.forEach(r => Object.assign(r, vals)); return [hit.length]; };
  Model.findOrCreate = async ({ where, defaults }) => { const f = rows.find(r => matches(r, where)); if (f) return [f, false]; return [await Model.create({ ...where, ...defaults }), true]; };
  Model.sync = async () => {};
}
function setup() {
  for (const k of Object.keys(tables)) delete tables[k];
  fake(V.PlatformIdentity, 'identity'); fake(V.PlatformSession, 'session'); fake(V.StoreEnrollment, 'enroll'); fake(V.VerifyChallenge, 'challenge'); fake(Customer, 'customer'); fake(V.StoreBlock, 'block'); V.StoreBlock.destroy = async ({ where }) => { const t = tables.block; for (let i = t.length - 1; i >= 0; i--) if (matches(t[i], where)) t.splice(i, 1); };
  sequelize.query = async () => [[]];
  sequelize.transaction = async cb => { const snap = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.map(r => ({ ...r }))])); try { return await cb({}); } catch (e) { for (const k of Object.keys(snap)) { tables[k].splice(0, tables[k].length, ...snap[k]); } throw e; } };
  Object.assign(process.env, { STOREFRONT_VERIFY_WHATSAPP_ENABLED: 'true', STOREFRONT_VERIFY_WABA_ID: 'W1', WHATSAPP_PHONE_NUMBER_ID: 'P1', STOREFRONT_VERIFY_WA_NUMBER: '919326069692', CRM_ENABLED: 'true' });
  delete process.env.STOREFRONT_VERIFY_STORE_SLUGS;
}
const seed = (over = {}) => { const token = V.newToken(); tables.challenge.push({ id: tables.challenge.length + 1, businessId: 1, tokenHash: sha(token), phone: '919876543210', expiresAt: new Date(now + 60000), consumedAt: null, claimedAt: null, ...over }); return token; };
const msg = (token, over = {}) => ({ id: 'wamid.' + Math.random(), from: '919876543210', type: 'text', timestamp: String(Math.floor(now / 1000)), text: { body: `DS VERIFY ${token}` }, ...over });
const call = message => V.handleVerifyMessage({ wabaId: 'W1', phoneNumberId: 'P1', message, now });

test('token has 130 bits, alphabet and parser are strict', () => {
  const t = V.newToken(); assert.match(t, V.TOKEN_RE); assert.notEqual(t, V.newToken());
  assert.equal(V.parseVerifyText(`ds verify ${t.toLowerCase()}`), t); assert.equal(V.parseVerifyText(`DS VERIFY ${t} extra`), null);
});
test('matching sender creates one platform identity and enrols only the challenge store; replay and duplicates do nothing', async () => {
  setup(); const t = seed();
  assert.equal(await call(msg(t)), true);
  assert.equal(tables.identity.length, 1); assert.equal(tables.enroll.length, 1); assert.equal(tables.enroll[0].businessId, 1);
  assert.equal(tables.customer.length, 1); assert.equal(tables.customer[0].source, 'whatsapp-verified'); assert.equal(tables.customer[0].businessId, 1);
  await call(msg(t)); await call(msg(t)); assert.equal(tables.identity.length, 1); assert.equal(tables.enroll.length, 1); assert.equal(tables.customer.length, 1);
});
test('sender that is not the typed number, expired, stale, bad token: nothing verified', async () => {
  setup(); const t = seed(); assert.equal(await call(msg(t, { from: '919000000001' })), true); assert.equal(tables.identity.length, 0); assert.equal(tables.challenge[0].consumedAt, null);
  const t2 = seed({ expiresAt: new Date(now - 1) }); assert.equal(await call(msg(t2)), true);
  const t3 = seed(); assert.equal(await call(msg(t3, { timestamp: String(Math.floor(now / 1000) - 3600) })), true);
  assert.equal(await call(msg('SHORT')), true); assert.equal(tables.identity.length, 0);
});
test('wrong WABA or number, non-text, ordinary text and flag-off are not claimed and never verify', async () => {
  setup(); const t = seed();
  assert.equal(await V.handleVerifyMessage({ wabaId: 'W2', phoneNumberId: 'P1', message: msg(t), now }), false);
  assert.equal(await V.handleVerifyMessage({ wabaId: 'W1', phoneNumberId: 'P9', message: msg(t), now }), false);
  assert.equal(await call(msg(t, { type: 'image' })), false); assert.equal(await call(msg(t, { text: { body: 'hello order 5' } })), false);
  process.env.STOREFRONT_VERIFY_WHATSAPP_ENABLED = 'false'; assert.equal(await call(msg(t)), false);
  assert.equal(tables.identity.length, 0);
});
test('concurrent deliveries consume once', async () => {
  setup(); const t = seed(); await Promise.all([call(msg(t)), call(msg(t)), call(msg(t))]);
  assert.equal(tables.challenge.filter(r => r.consumedAt).length, 1); assert.equal(tables.identity.length, 1);
});
test('enrolment reuses an existing same-store customer without overwriting it, and never copies across stores', async () => {
  setup(); tables.customer.push({ id: 99, businessId: 1, phone: '919876543210', name: 'Asha', notes: 'VIP', optInStatus: 'opted_in' });
  const t = seed(); await call(msg(t));
  assert.equal(tables.customer.length, 1); assert.deepEqual([tables.customer[0].name, tables.customer[0].notes, tables.customer[0].optInStatus], ['Asha', 'VIP', 'opted_in']);
  const t2 = seed({ businessId: 2, phone: '919876543210' }); await call(msg(t2));
  assert.equal(tables.customer.length, 2); assert.equal(tables.customer.find(c => c.businessId === 2).name, ''); assert.equal(tables.identity.length, 1); assert.equal(tables.enroll.length, 2);
});

// ---- HTTP flow against the real routes and real limiters ----
const SECRET = 's'.repeat(43), BR = 'b'.repeat(24);
const store = async slug => ({ id: slug === 'store-2' ? 2 : 1, slug });
async function withApp(fn) {
  const app = express(); app.use(express.json()); const router = express.Router();
  V.installVerifyRoutes(router, store, { strict: [verifyLimit], poll: [verifyPollLimit] });
  app.use('/api/public', router); app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  const server = app.listen(0); const base = `http://127.0.0.1:${server.address().port}/api/public/stores`;
  try { return await fn(base); } finally { server.close(); }
}
const post = (base, slug, path, body, headers = {}) => fetch(`${base}/${slug}/verify/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-ds-browser': BR, ...headers }, body: JSON.stringify(body) });
const cookieOf = res => (res.headers.get('set-cookie') || '').split(';')[0];
async function verifiedCookie(base, slug = 'store-1', phone = '9876543210') {
  const start = await (await post(base, slug, 'start', { phone, claimSecret: SECRET })).json();
  const row = tables.challenge.find(r => r.publicId === start.challengeId);
  const token = decodeURIComponent(start.link.split('text=')[1]).replace('DS VERIFY ', '');
  await call(msg(token, { from: row.phone }));
  const res = await post(base, slug, 'status', { challengeId: start.challengeId, claimSecret: SECRET });
  return { res, body: await res.json(), cookie: cookieOf(res), start };
}
const noLimit = () => { delete process.env.DISABLE_ABUSE_LIMITS; };

test('full flow: cookie is Secure HttpOnly SameSite=Lax, session works in a second store, each store enrols separately', async () => {
  setup(); noLimit(); V.VerifyChallenge.count = async () => 0;
  await withApp(async base => {
    const { res, body, cookie } = await verifiedCookie(base);
    assert.equal(body.status, 'verified'); assert.equal(body.sessionToken, undefined);
    const sc = res.headers.get('set-cookie'); assert.match(sc, /HttpOnly/); assert.match(sc, /Secure/); assert.match(sc, /SameSite=Lax/); assert.match(sc, /Max-Age=2592000/);
    assert.equal(tables.session.length, 1); assert.notEqual(tables.session[0].tokenHash, cookie.split('=')[1]);
    // the same browser is verified in another store without a new challenge
    const s2 = await (await fetch(`${base}/store-2/verify/session`, { headers: { cookie } })).json(); assert.deepEqual(s2, { verified: true, phone: '919876543210' });
    assert.equal(tables.enroll.length, 1); // reading the session never enrols
    await post(base, 'store-2', 'enroll', {}, { cookie }); await post(base, 'store-2', 'enroll', {}, { cookie });
    assert.deepEqual(tables.enroll.map(e => e.businessId).sort(), [1, 2]); assert.equal(tables.customer.filter(c => c.businessId === 2).length, 1);
    // no cookie, no identity; a client-supplied phone or id is ignored
    assert.deepEqual(await (await fetch(`${base}/store-2/verify/session`)).json(), { verified: false });
    assert.deepEqual(await (await post(base, 'store-2', 'enroll', { phone: '919876543210', identityId: 1 })).json(), { verified: false });
  });
  process.env.DISABLE_ABUSE_LIMITS = '1';
});
test('order guard: derives identity from the cookie session, phone must match, enrols this store; off or unlisted store is a no-op', async () => {
  setup(); noLimit(); V.VerifyChallenge.count = async () => 0;
  await withApp(async base => {
    const { cookie } = await verifiedCookie(base);
    const req = c => ({ headers: c ? { cookie: c } : {} });
    await V.requireVerifiedPhone(req(cookie), { id: 2, slug: 'store-2' }, '+91 98765 43210'); assert.ok(tables.enroll.some(e => e.businessId === 2));
    await assert.rejects(V.requireVerifiedPhone(req(cookie), { id: 2, slug: 'store-2' }, '9876543211'), e => e.status === 403 && e.code === 'PHONE_NOT_VERIFIED');
    await assert.rejects(V.requireVerifiedPhone(req(), { id: 2, slug: 'store-2' }, '9876543210'), /verify your phone/);
    await assert.rejects(V.requireVerifiedPhone(req(cookie.replace(/.$/, 'x')), { id: 2, slug: 'store-2' }, '9876543210'), /verify your phone/);
    process.env.STOREFRONT_VERIFY_STORE_SLUGS = ' Store-1 ';
    await V.requireVerifiedPhone(req(), { id: 2, slug: 'store-2' }, '9876543210'); // unlisted store untouched
    delete process.env.STOREFRONT_VERIFY_STORE_SLUGS; process.env.STOREFRONT_VERIFY_WHATSAPP_ENABLED = 'false';
    await V.requireVerifiedPhone(req(), { id: 2, slug: 'store-2' }, '9876543210');
  });
  process.env.DISABLE_ABUSE_LIMITS = '1';
});
test('logout ends this browser only; logout all ends every session of the identity; expiry is absolute; revoked never works', async () => {
  setup(); noLimit(); V.VerifyChallenge.count = async () => 0;
  await withApp(async base => {
    const a = await verifiedCookie(base); const id = tables.identity[0].id;
    const second = 'k'.repeat(43); tables.session.push({ id: 50, tokenHash: sha(second), identityId: id, expiresAt: new Date(now + 1e6), revokedAt: null });
    const ck2 = `ds_id=${second}`;
    await post(base, 'store-1', 'logout', {}, { cookie: a.cookie });
    assert.equal((await (await fetch(`${base}/store-1/verify/session`, { headers: { cookie: a.cookie } })).json()).verified, false);
    assert.equal((await (await fetch(`${base}/store-1/verify/session`, { headers: { cookie: ck2 } })).json()).verified, true);
    const logout = await post(base, 'store-1', 'logout', { all: true }, { cookie: ck2 }); assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
    assert.ok(tables.session.every(s => s.revokedAt));
    tables.session.push({ id: 60, tokenHash: sha('e'.repeat(43)), identityId: id, expiresAt: new Date(now - 1), revokedAt: null });
    assert.equal((await (await fetch(`${base}/store-1/verify/session`, { headers: { cookie: 'ds_id=' + 'e'.repeat(43) } })).json()).verified, false);
  });
  process.env.DISABLE_ABUSE_LIMITS = '1';
});
test('claim: wrong secret or browser gets nothing; failure rolls back and retries; dropped response is recovered with a fresh secret', async () => {
  setup(); noLimit(); V.VerifyChallenge.count = async () => 0;
  await withApp(async base => {
    const start = await (await post(base, 'store-1', 'start', { phone: '9876543210', claimSecret: SECRET })).json();
    const token = decodeURIComponent(start.link.split('text=')[1]).replace('DS VERIFY ', ''); await call(msg(token));
    assert.equal((await (await post(base, 'store-1', 'status', { challengeId: start.challengeId, claimSecret: 'z'.repeat(43) })).json()).status, 'expired');
    assert.equal((await (await post(base, 'store-1', 'status', { challengeId: start.challengeId, claimSecret: SECRET }, { 'x-ds-browser': 'c'.repeat(24) })).json()).status, 'expired');
    const real = V.PlatformSession.create; V.PlatformSession.create = async () => { throw new Error('db down'); };
    assert.equal((await post(base, 'store-1', 'status', { challengeId: start.challengeId, claimSecret: SECRET })).status, 500);
    assert.ok(!tables.challenge[0].claimedAt); V.PlatformSession.create = real;
    const ok = await post(base, 'store-1', 'status', { challengeId: start.challengeId, claimSecret: SECRET }); assert.equal((await ok.json()).status, 'verified');
    const first = cookieOf(ok);
    const again = await post(base, 'store-1', 'status', { challengeId: start.challengeId, claimSecret: SECRET }); assert.equal((await again.json()).status, 'verified');
    assert.equal(tables.session.length, 1); assert.equal(cookieOf(again), first); // same session, same cookie: nothing re-keyed
    const sameTwice = await Promise.all([1, 2, 3].map(() => post(base, 'store-1', 'status', { challengeId: start.challengeId, claimSecret: SECRET })));
    assert.deepEqual([...new Set(sameTwice.map(cookieOf))], [first]); assert.equal(tables.session.length, 1);
    assert.equal((await (await fetch(`${base}/store-1/verify/session`, { headers: { cookie: first } })).json()).verified, true);
    tables.challenge[0].claimedAt = new Date(now - 11 * 60 * 1000);
    assert.equal((await (await post(base, 'store-1', 'status', { challengeId: start.challengeId, claimSecret: SECRET })).json()).status, 'expired');
  });
  process.env.DISABLE_ABUSE_LIMITS = '1';
});
test('regression: start, ~130 polls, session, logout from one IP all fit the real limits', async () => {
  setup(); noLimit(); V.VerifyChallenge.count = async () => 0;
  await withApp(async base => {
    const start = await post(base, 'store-1', 'start', { phone: '9876543210', claimSecret: SECRET }); assert.equal(start.status, 201); const s = await start.json();
    const token = decodeURIComponent(s.link.split('text=')[1]).replace('DS VERIFY ', ''); const codes = new Set(); let final;
    for (let i = 0; i < 130; i++) { const r = await post(base, 'store-1', 'status', { challengeId: s.challengeId, claimSecret: SECRET }); codes.add(r.status); const j = await r.json(); if (j.status === 'verified') { final = j; break; } if (i === 100) await call(msg(token)); }
    assert.deepEqual([...codes], [200]); assert.equal(final?.status, 'verified');
    assert.equal((await fetch(`${base}/store-1/verify/session`)).status, 200); assert.equal((await post(base, 'store-1', 'logout', {})).status, 200);
  });
  process.env.DISABLE_ABUSE_LIMITS = '1';
});
test('store scope and flag: unlisted slug and flag-off answer 404', async () => {
  setup(); noLimit();
  await withApp(async base => {
    process.env.STOREFRONT_VERIFY_STORE_SLUGS = 'store-1';
    assert.equal((await fetch(`${base}/store-2/verify/session`)).status, 404); assert.equal((await fetch(`${base}/store-1/verify/session`)).status, 200);
    process.env.STOREFRONT_VERIFY_WHATSAPP_ENABLED = 'false'; assert.equal((await fetch(`${base}/store-1/verify/session`)).status, 404);
  });
  delete process.env.STOREFRONT_VERIFY_STORE_SLUGS; process.env.DISABLE_ABUSE_LIMITS = '1';
});

test('webhook failure after the consume rolls everything back so a redelivery still verifies', async () => {
  setup(); const t = seed(); const real = V.PlatformIdentity.findOrCreate;
  V.PlatformIdentity.findOrCreate = async () => { throw new Error('db down'); };
  await assert.rejects(call(msg(t)), /db down/);
  assert.ok(!tables.challenge[0].consumedAt); assert.equal(tables.identity.length, 0);
  V.PlatformIdentity.findOrCreate = real; await call(msg(t));
  assert.ok(tables.challenge[0].consumedAt); assert.ok(tables.challenge[0].identityId); assert.equal(tables.identity.length, 1);
});

test('blank or missing phone is never exempt when verification is on for the store', async () => {
  setup();
  for (const v of ['', '   ', undefined, null]) await assert.rejects(V.requireVerifiedPhone({ headers: {} }, { id: 1, slug: 'store-1' }, v), e => e.code === 'PHONE_NOT_VERIFIED');
  process.env.STOREFRONT_VERIFY_STORE_SLUGS = 'other'; await V.requireVerifiedPhone({ headers: {} }, { id: 1, slug: 'store-1' }, ''); // excluded store: no-op
  delete process.env.STOREFRONT_VERIFY_STORE_SLUGS;
});

test('per-store block: blocked number cannot start, verify, or order on that store; other stores and numbers are unaffected', async () => {
  setup(); noLimit(); V.VerifyChallenge.count = async () => 0;
  await withApp(async base => {
    const { cookie } = await verifiedCookie(base); // verified on store 1 and not yet blocked
    tables.block.push({ id: 1, businessId: 1, phone: '919876543210' });
    const req = { headers: { cookie } };
    await assert.rejects(V.requireVerifiedPhone(req, { id: 1, slug: 'store-1' }, '9876543210'), e => e.status === 403 && e.code === 'PHONE_BLOCKED'); // live session no longer works here
    await V.requireVerifiedPhone(req, { id: 2, slug: 'store-2' }, '9876543210'); // another store is unaffected
    const start = await post(base, 'store-1', 'start', { phone: '9876543210', claimSecret: SECRET }); assert.equal(start.status, 403);
    assert.equal((await post(base, 'store-2', 'start', { phone: '9876543210', claimSecret: SECRET })).status, 201);
    assert.equal((await post(base, 'store-1', 'start', { phone: '9123456780', claimSecret: SECRET })).status, 201); // other number fine
  });
  // an in-flight challenge for a number blocked meanwhile is never verified or enrolled
  setup(); tables.block.push({ id: 1, businessId: 1, phone: '919876543210' }); const t = seed();
  assert.equal(await call(msg(t)), true); assert.equal(tables.identity.length, 0); assert.equal(tables.enroll.length, 0); assert.equal(tables.customer.length, 0);
  process.env.DISABLE_ABUSE_LIMITS = '1';
});
test('block routes: owner-only writes, scoped to the store, idempotent, unblock works', async () => {
  setup(); const { Router } = await import('express');
  const ownerOnly = (req, res, next) => (req.user.role === 'owner' ? next() : res.status(403).json({ error: 'Only the store owner can do this' }));
  const app = express(); app.use(express.json());
  app.use('/o/:storeId', (req, res, next) => { req.store = { id: Number(req.params.storeId) }; req.user = { id: 1, role: req.headers['x-role'] || 'owner' }; next(); }, V.blockRoutes(Router, ownerOnly));
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  const server = app.listen(0), b = `http://127.0.0.1:${server.address().port}/o`;
  const j = (u, o = {}) => fetch(b + u, { ...o, headers: { 'content-type': 'application/json', ...(o.headers || {}) }, body: o.body && JSON.stringify(o.body) });
  try {
    assert.equal((await j('/1', { method: 'POST', body: { phone: '+91 98765 43210' } })).status, 201);
    assert.equal((await j('/1', { method: 'POST', body: { phone: '9876543210' } })).status, 201); assert.equal(tables.block.length, 1);
    assert.equal((await j('/1', { method: 'POST', body: { phone: 'abc' } })).status, 400);
    assert.equal((await j('/1', { method: 'POST', body: { phone: '9876543211' }, headers: { 'x-role': 'staff' } })).status, 403);
    assert.equal(tables.block[0].businessId, 1);
    V.StoreBlock.findAll = async ({ where }) => tables.block.filter(r => matches(r, where)).map(r => ({ toJSON: () => r }));
    assert.equal((await (await j('/2')).json()).blocked.length, 0); assert.equal((await (await j('/1')).json()).blocked.length, 1);
    assert.equal((await j('/2/9876543210', { method: 'DELETE' })).status, 200); assert.equal(tables.block.length, 1); // other store cannot unblock it
    assert.equal((await j('/1/9876543210', { method: 'DELETE' })).status, 200); assert.equal(tables.block.length, 0);
  } finally { server.close(); }
});

test('block is checked at enroll, status issuance/recovery and session, without touching the global identity or other stores', async () => {
  setup(); noLimit(); V.VerifyChallenge.count = async () => 0;
  await withApp(async base => {
    // verified at store 1, then store 2 blocks the number
    const ok = await verifiedCookie(base); const cookie = ok.cookie; assert.equal(ok.body.status, 'verified');
    tables.block.push({ id: 1, businessId: 2, phone: '919876543210' });
    const get = (slug, path, method = 'GET') => fetch(`${base}/${slug}/verify/${path}`, { method, headers: { cookie, 'x-ds-browser': BR } });
    const enroll2 = await get('store-2', 'enroll', 'POST'); assert.equal(enroll2.status, 403); assert.equal(tables.enroll.filter(e => e.businessId === 2).length, 0); assert.equal(tables.customer.filter(c => c.businessId === 2).length, 0);
    const sess2 = await get('store-2', 'session'); assert.equal(sess2.status, 403); assert.match((await sess2.json()).error, /cannot be used to order/);
    const sess1 = await get('store-1', 'session'); assert.equal(sess1.status, 200); assert.equal((await sess1.json()).verified, true); // other store unaffected
    assert.equal((await get('store-1', 'enroll', 'POST')).status, 200);
    assert.equal(tables.identity.length, 1); assert.ok(tables.session.every(s => !s.revokedAt)); // the global identity and sessions are untouched
  });
  // consumed before the block, blocked before the browser claims: no session is issued
  setup(); noLimit(); V.VerifyChallenge.count = async () => 0;
  await withApp(async base => {
    const start = await (await post(base, 'store-1', 'start', { phone: '9876543210', claimSecret: SECRET })).json();
    const row = tables.challenge.find(r => r.publicId === start.challengeId);
    const token = decodeURIComponent(start.link.split('text=')[1]).replace('DS VERIFY ', '');
    await call(msg(token, { from: row.phone })); assert.ok(row.consumedAt);
    tables.block.push({ id: 1, businessId: 1, phone: '919876543210' });
    const res = await post(base, 'store-1', 'status', { challengeId: start.challengeId, claimSecret: SECRET });
    assert.equal((await res.json()).status, 'blocked'); assert.equal(res.headers.get('set-cookie'), null); assert.equal(tables.session.length, 0);
  });
  process.env.DISABLE_ABUSE_LIMITS = '1';
});
