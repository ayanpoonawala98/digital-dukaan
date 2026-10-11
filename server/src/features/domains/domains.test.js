import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL ||= 'postgres://x:x@127.0.0.1:1/x';
process.env.JWT_SECRET ||= 'test-secret-test-secret-test-secret';
process.env.CLIENT_URL = 'https://digitalshop.website';
const { normalizeHostname, safeHostname } = await import('./domain-name.js');
const core = await import('./domain-core.js');
const { selfHostedPending } = await import('./hosting.js');
const { probeHttps } = await import('./domain-probes.js');
const svc = await import('./domain-service.js');
const { genericGuide, personalGuide } = await import('./domain-guide.js');
const { tlsAskHandler } = await import('./domain-public.js');
const { Business } = await import('../../models/index.js');

const code = fn => { try { fn(); } catch (e) { return e.code; } return null; };

test('hostnames normalise to lowercase IDNA and reject URLs, ports, wildcards, IPs, credentials', () => {
  assert.equal(normalizeHostname('  Shop.Example.COM. ').hostname, 'shop.example.com');
  assert.equal(normalizeHostname('münchen-shop.de').hostname, 'xn--mnchen-shop-thb.de');
  assert.equal(code(() => normalizeHostname('https://shop.example.com')), 'HOSTNAME_HAS_URL');
  assert.equal(code(() => normalizeHostname('shop.example.com/x')), 'HOSTNAME_HAS_URL');
  assert.equal(code(() => normalizeHostname('shop.example.com:8080')), 'HOSTNAME_HAS_PORT');
  assert.equal(code(() => normalizeHostname('u:p@shop.example.com')), 'HOSTNAME_HAS_CREDENTIALS');
  assert.equal(code(() => normalizeHostname('*.example.com')), 'HOSTNAME_WILDCARD');
  assert.equal(code(() => normalizeHostname('127.0.0.1')), 'HOSTNAME_IS_IP');
  assert.equal(code(() => normalizeHostname('2130706433')), 'HOSTNAME_IS_IP');
  assert.equal(code(() => normalizeHostname('[::1]')), 'HOSTNAME_IS_IP');
  assert.equal(code(() => normalizeHostname('localhost')), 'HOSTNAME_INVALID');
  assert.equal(code(() => normalizeHostname('exa mple.com')), 'HOSTNAME_INVALID');
  assert.equal(code(() => normalizeHostname('-bad.example.com')), 'HOSTNAME_INVALID');
});
test('public suffixes, shared hosts and platform hosts are refused; client own domains pass', () => {
  assert.equal(code(() => normalizeHostname('co.in')), 'HOSTNAME_PUBLIC_SUFFIX');
  assert.equal(code(() => normalizeHostname('com')), 'HOSTNAME_INVALID');
  assert.equal(normalizeHostname('mystore.co.in').hostname, 'mystore.co.in');
  assert.equal(code(() => normalizeHostname('x.netlify.app')), 'HOSTNAME_SHARED_HOST');
  for (const h of ['digitalshop.website', 'api.digitalshop.website', 'bill.digitalshop.website', 'x.digitaldukaan.space']) assert.equal(code(() => normalizeHostname(h)), 'HOSTNAME_RESERVED', h);
  assert.equal(code(() => normalizeHostname('admin.example.com')), 'HOSTNAME_RESERVED');
  assert.equal(code(() => normalizeHostname('preview.example.com')), 'HOSTNAME_RESERVED');
  assert.equal(safeHostname('https://x'), '');
});
test('ownership record uses a prefixed label and unpredictable token; mismatch and replay fail', () => {
  const a = core.newOwnershipToken(), b = core.newOwnershipToken();
  assert.notEqual(a, b); assert.match(a, /^[0-9a-f]{48}$/);
  const rec = core.ownershipRecord('shop.example.com', a);
  assert.equal(rec.host, '_digitalshop-verify.shop.example.com');
  assert.equal(core.tokenMatches([`"digitalshop-verify=${a}"`], a), true);
  assert.equal(core.tokenMatches([`digitalshop-verify=${b}`], a), false);
  assert.equal(core.tokenMatches([], a), false);
});
test('routing records and DNS match need verified hosting config; none are invented', () => {
  assert.deepEqual(core.routingRecords('a.example.com', selfHostedPending.config()), []);
  assert.equal(core.dnsMatches({ a: ['1.2.3.4'] }, selfHostedPending.config()).code, 'SERVER_SETUP_REQUIRED');
  const h = { configured: true, ipv4: ['203.0.113.5'], ipv6: [], cname: 'edge.example.net' };
  assert.equal(core.dnsMatches({ a: ['203.0.113.5'] }, h).ok, true);
  assert.equal(core.dnsMatches({ cname: ['Edge.Example.net.'] }, h).ok, true);
  assert.equal(core.dnsMatches({ a: ['203.0.113.5', '9.9.9.9'] }, h).code, 'DNS_MISMATCH');
  assert.equal(core.dnsMatches({ a: [] }, h).code, 'DNS_NOT_FOUND');
  assert.ok(!JSON.stringify(core.routingRecords('a.example.com', h)).includes('netlify'));
});
const ok = { ownershipStatus: 'ok', dnsStatus: 'ok', hostingStatus: 'ok', httpsStatus: 'ok', routingStatus: 'ok' };
test('state machine: amber until failure, live needs everything, setup-required without hosting', () => {
  assert.equal(core.overallState({ ownershipStatus: 'pending' }, false), 'pending_dns');
  assert.equal(core.overallState({ ownershipStatus: 'ok' }, false), 'server_setup_required');
  assert.equal(core.overallState({ ownershipStatus: 'ok', dnsStatus: 'unknown' }, true), 'verifying');
  assert.equal(core.overallState({ ownershipStatus: 'ok', dnsStatus: 'ok', hostingStatus: 'pending' }, true), 'provisioning');
  assert.equal(core.overallState({ ...ok }, true), 'ready_to_activate');
  assert.equal(core.overallState({ ...ok, activatedAt: new Date() }, true), 'live');
  assert.equal(core.overallState({ ...ok, activatedAt: new Date(), routingStatus: 'unknown' }, true), 'provisioning');
  assert.equal(core.overallState({ ...ok, httpsStatus: 'failed' }, true), 'failed');
  assert.equal(core.overallState({ ...ok, detachedAt: new Date() }, true), 'disconnected');
  assert.equal(core.overallState({ ownershipStatus: 'pending', dnsStatus: 'unknown', httpsCode: 'CHECK_TIMEOUT' }, true), 'pending_dns');
});
test('TLS authorisation needs ownership, DNS, provisioning, hosting; fails closed', () => {
  const d = { ownershipStatus: 'ok', dnsStatus: 'ok', provisioningAuthorizedAt: new Date() };
  assert.equal(core.tlsAuthorized(d, true), true);
  assert.equal(core.tlsAuthorized(d, false), false);
  assert.equal(core.tlsAuthorized({ ...d, provisioningAuthorizedAt: null }, true), false);
  assert.equal(core.tlsAuthorized({ ...d, dnsStatus: 'pending' }, true), false);
  assert.equal(core.tlsAuthorized({ ...d, detachedAt: new Date() }, true), false);
});
test('self-hosted pending adapter refuses to provision and has no config', async () => {
  assert.equal(selfHostedPending.config().configured, false);
  await assert.rejects(selfHostedPending.provision({}), e => e.code === 'SERVER_SETUP_REQUIRED');
});
test('guides: generic says values come after setup; personalised is blocked until configured', () => {
  assert.match(genericGuide(), /exact DNS values .* come after server setup/i);
  assert.equal(personalGuide({ hostname: 'a.example.com', ownershipToken: 'x' }, selfHostedPending.config()), null);
  const g = personalGuide({ hostname: 'a.example.com', ownershipToken: 'tok' }, { configured: true, ipv4: ['203.0.113.5'] });
  assert.match(g, /_digitalshop-verify\.a\.example\.com/); assert.match(g, /203\.0\.113\.5/);
});

// --- service with an in-memory store ---
const rows = []; const audits = []; let seq = 1;
const mk = o => { const row = { id: seq++, createdAt: new Date(), ...o }; row.update = async p => Object.assign(row, p); row.toJSON = () => ({ ...row }); return row; };
const match = (r, w) => Object.entries(w).every(([k, v]) => v && typeof v === 'object' && 'ne' in v ? r[k] != v.ne : (v === null ? r[k] == null : r[k] === v));
svc.CustomDomain.sync = async () => {}; svc.DomainAudit.sync = async () => {};
svc.CustomDomain.findOne = async ({ where }) => rows.find(r => match(r, Object.fromEntries(Object.entries(where).map(([k, v]) => [k, v && v[Object.getOwnPropertySymbols(v)[0]] !== undefined ? { ne: null } : v])))) || null;
svc.CustomDomain.findByPk = async id => rows.find(r => r.id === id) || null;
svc.CustomDomain.create = async o => { if (rows.some(r => r.activeKey && r.activeKey === o.activeKey)) throw Object.assign(new Error('u'), { name: 'SequelizeUniqueConstraintError' }); const r = mk({ ownershipStatus: 'pending', dnsStatus: 'unknown', hostingStatus: 'unknown', httpsStatus: 'unknown', routingStatus: 'unknown', ...o }); rows.push(r); return r; };
svc.DomainAudit.create = async o => { audits.push(o); return o; };
const stores = { 1: { id: 1, name: 'Store A', slug: 'store-a' }, 2: { id: 2, name: 'Store B', slug: 'store-b' } };
Business.findOne = async ({ where }) => stores[where.id] || null;
Business.findAll = async () => Object.values(stores);
Business.findByPk = async id => stores[id] || null;
const actor = { id: 9 };
const txtOk = d => async () => ({ ok: true, values: [`digitalshop-verify=${d.ownershipToken}`] });
const configuredAdapter = (status = 'provisioned') => ({ name: 'test', config: () => ({ configured: true, ipv4: ['203.0.113.5'], ipv6: [], cname: '' }), provision: async () => ({ status: 'pending' }), status: async () => ({ status }), release: async () => ({}) });

test('create: idempotent for same store, DOMAIN_ALREADY_ASSIGNED for another, audit written', async () => {
  const a = await svc.createDomain({ hostname: 'Shop.Example.com', businessId: 1, actor });
  assert.equal(a.created, true); assert.equal(a.domain.state, 'pending_dns');
  assert.equal(a.domain.records.routing.length, 0); assert.match(a.domain.records.routingNote, /after server setup/);
  const b = await svc.createDomain({ hostname: 'shop.example.com', businessId: 1, actor });
  assert.equal(b.created, false); assert.equal(rows.length, 1);
  await assert.rejects(svc.createDomain({ hostname: 'shop.example.com', businessId: 2, actor }), e => e.code === 'DOMAIN_ALREADY_ASSIGNED');
  await assert.rejects(svc.createDomain({ hostname: 'x.example.com', businessId: 99, actor }), e => e.status === 404);
  assert.ok(audits.some(x => x.action === 'create' && x.outcome === 'denied' && x.code === 'DOMAIN_ALREADY_ASSIGNED'));
  assert.ok(!JSON.stringify(audits).includes(rows[0].ownershipToken));
});
test('check: missing TXT stays pending (amber), wrong token is a replay failure, timeout never passes', async () => {
  const d = rows[0];
  let r = await svc.checkDomain(d.id, actor, { probes: { txt: async () => ({ ok: true, values: [] }) } });
  assert.equal(r.state, 'pending_dns'); assert.equal(r.steps.ownership.code, 'OWNERSHIP_MISSING');
  r = await svc.checkDomain(d.id, actor, { probes: { txt: async () => ({ ok: true, values: ['digitalshop-verify=' + 'a'.repeat(48)] }) } });
  assert.equal(r.steps.ownership.status, 'pending');
  r = await svc.checkDomain(d.id, actor, { probes: { txt: async () => ({ ok: false, code: 'CHECK_TIMEOUT' }) } });
  assert.equal(r.steps.ownership.code, 'CHECK_TIMEOUT'); assert.notEqual(r.steps.ownership.status, 'ok');
});
test('check: ownership verified but no server config shows Server setup required; activation and provisioning are disabled', async () => {
  const d = rows[0];
  const r = await svc.checkDomain(d.id, actor, { probes: { txt: txtOk(d), route: async () => { throw new Error('must not probe routing'); } }, adapter: selfHostedPending });
  assert.equal(r.state, 'server_setup_required'); assert.equal(r.serverSetupRequired, true); assert.equal(r.canActivate, false);
  await assert.rejects(svc.activateDomain(d.id, actor), e => e.code === 'SERVER_SETUP_REQUIRED');
  await assert.rejects(svc.startProvisioning(d.id, actor), e => e.code === 'SERVER_SETUP_REQUIRED');
  assert.equal(await svc.tlsAsk('shop.example.com'), false);
  assert.equal(await svc.publicResolve('shop.example.com'), null);
});
test('concurrent checks share one run', async () => {
  const d = rows[0]; let n = 0;
  const probes = { txt: async () => { n++; await new Promise(r => setTimeout(r, 20)); return { ok: true, values: [] }; } };
  await d.update({ ownershipStatus: 'pending' });
  await Promise.all([svc.checkDomain(d.id, actor, { probes }), svc.checkDomain(d.id, actor, { probes }), svc.checkDomain(d.id, actor, { probes })]);
  assert.equal(n, 1);
});
test('full flow with a configured adapter: partial DNS failure, then live; wrong-tenant routing fails', async () => {
  const c = await svc.createDomain({ hostname: 'full.example.org', businessId: 1, actor });
  const d = rows.find(r => r.id === c.domain.id), ad = configuredAdapter();
  const base = { adapter: ad, probes: { txt: txtOk(d) } };
  let r = await svc.checkDomain(d.id, actor, { ...base, probes: { ...base.probes, route: async () => ({ ok: true, a: ['9.9.9.9'], aaaa: [], cname: [] }) } });
  assert.equal(r.steps.dns.code, 'DNS_MISMATCH'); assert.equal(r.state, 'failed');
  r = await svc.checkDomain(d.id, actor, { ...base, probes: { ...base.probes, route: async () => ({ ok: false, code: 'CHECK_TIMEOUT' }) } });
  assert.equal(r.steps.dns.status, 'unknown'); assert.equal(r.steps.dns.code, 'CHECK_TIMEOUT');
  const goodDns = async () => ({ ok: true, a: ['203.0.113.5'], aaaa: [], cname: [] });
  r = await svc.checkDomain(d.id, actor, { ...base, probes: { ...base.probes, route: goodDns } });
  assert.equal(r.steps.dns.status, 'ok'); assert.equal(await svc.tlsAsk('full.example.org', true), false);
  const prov = await svc.startProvisioning(d.id, actor, { adapter: ad });
  assert.ok(prov); assert.equal(await svc.tlsAsk('full.example.org', true), true);
  assert.equal(await svc.tlsAsk('FULL.example.org', true), false, 'exact normalised only');
  assert.equal(await svc.tlsAsk('other.example.org', true), false);
  await assert.rejects(svc.activateDomain(d.id, actor, { adapter: ad }), e => e.code === 'CHECKS_INCOMPLETE');
  const wrong = { ...base.probes, route: goodDns, https: async () => ({ ok: true, tls: true, expires: new Date(Date.now() + 9e7), routed: true, slug: 'store-b' }) };
  r = await svc.checkDomain(d.id, actor, { ...base, probes: wrong });
  assert.equal(r.routing.code, 'ROUTING_MISMATCH'); assert.equal(r.state, 'failed');
  const right = { ...wrong, https: async () => ({ ok: true, tls: true, expires: new Date(Date.now() + 9e7), routed: true, slug: 'store-a' }) };
  r = await svc.checkDomain(d.id, actor, { ...base, probes: right });
  assert.equal(r.state, 'ready_to_activate');
  assert.equal((await svc.publicResolve('full.example.org')), null, 'not public until activated');
  const origPlat = process.env.DOMAINS_HOSTING_ADAPTER;
  d.hostingAdapter = 'self-hosted-pending'; // activation re-reads hosting config; pending adapter must refuse
  await assert.rejects(svc.activateDomain(d.id, actor), e => e.code === 'SERVER_SETUP_REQUIRED');
  d.hostingAdapter = 'test'; if (origPlat) process.env.DOMAINS_HOSTING_ADAPTER = origPlat;
});
test('TLS failure and pending HTTPS are reported with app codes', async () => {
  const d = rows.find(r => r.hostname === 'full.example.org'), ad = configuredAdapter();
  const p = h => ({ txt: txtOk(d), route: async () => ({ ok: true, a: ['203.0.113.5'], aaaa: [], cname: [] }), https: async () => h });
  let r = await svc.checkDomain(d.id, actor, { adapter: ad, probes: p({ ok: true, tls: false, code: 'TLS_FAILED' }) });
  assert.equal(r.steps.https.code, 'TLS_FAILED'); assert.equal(r.state, 'failed');
  r = await svc.checkDomain(d.id, actor, { adapter: ad, probes: p({ ok: true, tls: false, code: 'TLS_PENDING' }) });
  assert.equal(r.steps.https.status, 'pending'); assert.equal(r.state, 'provisioning');
  r = await svc.checkDomain(d.id, actor, { adapter: ad, probes: p({ ok: false, code: 'CHECK_TIMEOUT' }) });
  assert.equal(r.steps.https.status, 'unknown');
});
test('detach is idempotent, tombstones, frees the hostname, and a live domain stops resolving', async () => {
  const d = rows.find(r => r.hostname === 'full.example.org');
  Object.assign(d, { ownershipStatus: 'ok', dnsStatus: 'ok', hostingStatus: 'ok', httpsStatus: 'ok', routingStatus: 'ok', activatedAt: new Date() });
  const adapter = configuredAdapter();
  const a = await svc.detachDomain(d.id, actor, { adapter }), b = await svc.detachDomain(d.id, actor, { adapter });
  assert.equal(a.state, 'disconnected'); assert.equal(b.state, 'disconnected');
  assert.equal(d.activeKey, null); assert.ok(d.detachedAt);
  assert.equal(await svc.publicResolve('full.example.org'), null);
  assert.equal(audits.filter(x => x.action === 'detach').length, 1);
  const again = await svc.createDomain({ hostname: 'full.example.org', businessId: 2, actor });
  assert.equal(again.created, true); assert.notEqual(again.domain.id, d.id);
});
test('public resolve returns only the store slug for an active verified domain; Host header never used', async () => {
  const c = await svc.createDomain({ hostname: 'live.example.org', businessId: 2, actor });
  const d = rows.find(r => r.id === c.domain.id);
  assert.equal(await svc.publicResolve('live.example.org'), null);
  Object.assign(d, { ownershipStatus: 'ok', dnsStatus: 'ok', hostingStatus: 'ok', httpsStatus: 'ok', routingStatus: 'ok', activatedAt: new Date() });
  assert.deepEqual(await svc.publicResolve('LIVE.example.org'), { slug: 'store-b' });
  assert.equal(await svc.publicResolve('https://live.example.org'), null);
  assert.equal(await svc.publicResolve('x.digitalshop.website'), null);
  const view = JSON.stringify(await svc.publicResolve('live.example.org'));
  assert.ok(!/token|businessId|ownership/i.test(view));
});
test('exact CORS origin allowlist: only https://<live hostname>', async () => {
  svc.invalidateOrigins();
  const rowsLive = rows.filter(r => !r.detachedAt && r.activatedAt);
  svc.CustomDomain.findAll = async () => rowsLive;
  svc.invalidateOrigins();
  assert.equal(await svc.originAllowed('https://live.example.org'), true);
  for (const o of ['http://live.example.org', 'https://live.example.org:8443', 'https://evil.live.example.org', 'https://live.example.org.evil.com', 'https://LIVE.example.org', 'https://shop.example.com', '', null]) assert.equal(await svc.originAllowed(o), false, String(o));
  svc.CustomDomain.findAll = async () => { throw new Error('db down'); };
  svc.invalidateOrigins();
  assert.equal(await svc.originAllowed('https://shop.example.com'), false);
});
test('view never exposes the ownership token outside detail records', async () => {
  const l = JSON.stringify(rows.map(r => svc.view(r)));
  assert.ok(!rows.some(r => l.includes(r.ownershipToken)));
});
test('tls-ask handler: no secret denies, wrong secret denies, db failure denies', async () => {
  const run = async (auth, q, secret) => { if (secret) process.env.DOMAINS_TLS_ASK_SECRET = secret; else delete process.env.DOMAINS_TLS_ASK_SECRET; let status; const res = { set() {}, status(s) { status = s; return this; }, end() { return this; } }; await tlsAskHandler({ headers: { authorization: auth }, query: q }, res); return status; };
  assert.equal(await run('Bearer s', { domain: 'a.example.com' }, ''), 401);
  assert.equal(await run('Bearer wrong', { domain: 'a.example.com' }, 's'), 401);
  assert.equal(await run('Bearer s', { domain: 'a.example.com' }, 's'), 403);
  assert.equal(await run('Bearer s', { domain: ['a', 'b'] }, 's'), 403);
  const orig = svc.CustomDomain.findOne; svc.CustomDomain.findOne = async () => { throw new Error('db'); };
  assert.equal(await run('Bearer s', { domain: 'a.example.com' }, 's'), 503);
  svc.CustomDomain.findOne = orig; delete process.env.DOMAINS_TLS_ASK_SECRET;
});
test('HTTPS probe: SSRF guard blocks private addresses, no redirects, malformed body is a mismatch', async () => {
  const priv = await probeHttps('internal.example.com', { lookup: async () => [{ address: '10.0.0.5' }] });
  assert.equal(priv.ok, false); assert.equal(priv.code, 'CHECK_UNAVAILABLE');
  const fake = (status, body) => (opts, cb) => { const { EventEmitter } = require_events(); const res = new EventEmitter(); res.statusCode = status; res.socket = { getPeerCertificate: () => ({ valid_to: 'Jan 1 00:00:00 2030 GMT' }) }; res.setEncoding = () => {}; res.resume = () => {}; res.destroy = () => {}; const req = new EventEmitter(); req.end = () => setImmediate(() => { cb(res); res.emit('data', body); res.emit('end'); }); req.destroy = () => {}; return req; };
  const lookup = async () => [{ address: '93.184.216.34' }];
  assert.equal((await probeHttps('a.example.com', { lookup, requestImpl: fake(302, '') })).code, 'ROUTING_MISMATCH');
  assert.equal((await probeHttps('a.example.com', { lookup, requestImpl: fake(200, 'not json') })).code, 'ROUTING_MISMATCH');
  const good = await probeHttps('a.example.com', { lookup, requestImpl: fake(200, '{"slug":"store-a"}') });
  assert.equal(good.routed, true); assert.equal(good.slug, 'store-a');
});
import { EventEmitter } from 'node:events';
function require_events() { return { EventEmitter }; }
test('role denial: domain routes sit behind auth + roles(superadmin) and are not mounted anywhere else', async () => {
  const fs = await import('node:fs');
  const admin = fs.readFileSync(new URL('../../routes/admin.js', import.meta.url), 'utf8');
  assert.ok(admin.indexOf("r.use(auth, roles('superadmin'))") > -1 && admin.indexOf("r.use(auth, roles('superadmin'))") < admin.indexOf("r.use('/domains', domainRoutes)"));
  const { roles } = await import('../../shared/middleware/auth.js');
  for (const role of ['owner', 'staff', 'customer']) { let denied = null, nexted = false; roles('superadmin')({ user: { role } }, {}, e => { if (e) denied = e; else nexted = true; }); assert.equal(nexted, false, role); assert.equal(denied.status, 403); }
  const owner = fs.readFileSync(new URL('../../routes/owner.js', import.meta.url), 'utf8');
  assert.ok(!owner.includes('domain-routes'));
  const res = {}; const hdr = {}; const routes = (await import('./domain-routes.js')).default;
  assert.ok(routes.stack.length > 5);
});
test('CORS: app.js keeps global cors on CLIENT_URL only and mounts dynamic origins on /api/public only', async () => {
  const fs = await import('node:fs');
  const app = fs.readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
  const global = app.slice(app.indexOf('const globalCors = cors('), app.indexOf("app.use('/api/integrations/whatsapp/webhook'"));
  assert.ok(!global.includes('originAllowed'));
  assert.equal((app.match(/originAllowed\(origin\)/g) || []).length, 1);
  assert.match(app, /app\.use\('\/api\/public', cors\(\(req, callback\) => \{[^]*?originAllowed\(origin\)/);
});
test('paused or deleted store drops out of the origin allowlist', async () => {
  const dom = { hostname: 'cors.example.org', businessId: 1, ownershipStatus: 'ok', dnsStatus: 'ok', hostingStatus: 'ok', httpsStatus: 'ok', routingStatus: 'ok' };
  svc.CustomDomain.findAll = async () => [dom];
  const orig = Business.findAll;
  Business.findAll = async ({ where }) => { assert.equal(where.active, true); assert.equal(where.deletedAt, null); return []; };
  svc.invalidateOrigins();
  assert.equal(await svc.originAllowed('https://cors.example.org'), false);
  Business.findAll = async () => [{ id: 1 }];
  svc.invalidateOrigins();
  assert.equal(await svc.originAllowed('https://cors.example.org'), true);
  Business.findAll = orig;
});

// --- Netlify adapter ---
const { createNetlifyAdapter } = await import('./hosting-netlify.js');
const SITE = '37a0ac80-db55-4d26-be26-a82bd3a509d5';
function fakeNetlify(state = {}) {
  const calls = [];
  const s = { aliases: [...(state.aliases || ['keep.example.net'])], ssl: state.ssl ?? null, custom_domain: 'digitalshop.website', status: state.status || 200 };
  const impl = async (url, o) => {
    calls.push({ url, method: o.method, auth: o.headers.Authorization, redirect: o.redirect, body: o.body ? JSON.parse(o.body) : null });
    if (s.fail) return { status: s.fail, ok: false, headers: new Map([['retry-after', '7']]), json: async () => ({}) };
    const path = url.replace(/^https:\/\/api\.netlify\.com\/api\/v1\/sites\/[^/]+/, '');
    if (o.method === 'PATCH') { s.aliases = JSON.parse(o.body).domain_aliases; return { status: 200, ok: true, headers: new Map(), json: async () => ({}) }; }
    if (path === '/ssl') return s.ssl ? { status: 200, ok: true, headers: new Map(), json: async () => s.ssl } : { status: 404, ok: false, headers: new Map(), json: async () => ({}) };
    return { status: 200, ok: true, headers: new Map(), json: async () => ({ domain_aliases: s.aliases, custom_domain: s.custom_domain }) };
  };
  return { s, calls, impl };
}
const nenv = { NETLIFY_API_TOKEN: 'nfp_secret_token_value', NETLIFY_SITE_ID: SITE };
test('netlify adapter: config needs token and site id, reports real targets, never leaks the token', () => {
  assert.equal(createNetlifyAdapter({ env: {} }).config().configured, false);
  assert.equal(createNetlifyAdapter({ env: { NETLIFY_API_TOKEN: 'x' } }).config().configured, false);
  const cfg = createNetlifyAdapter({ env: nenv }).config();
  assert.deepEqual(cfg, { configured: true, ipv4: ['75.2.60.5'], ipv6: [], cname: 'digital-dukaan-live.netlify.app' });
  assert.ok(!JSON.stringify(cfg).includes('secret'));
  assert.deepEqual(core.routingRecords('example.com', cfg).map(r => [r.type, r.value, r.ttl]), [['A', '75.2.60.5', 300]]);
  assert.deepEqual(core.routingRecords('shop.example.com', cfg).map(r => [r.type, r.value, r.ttl]), [['CNAME', 'digital-dukaan-live.netlify.app', 300]]);
  assert.deepEqual(core.routingRecords('mystore.co.in', cfg).map(r => r.type), ['A']);
  assert.deepEqual(core.routingRecords('www.mystore.co.in', cfg).map(r => r.type), ['CNAME']);
  assert.equal(core.dnsMatches({ cname: ['digital-dukaan-live.netlify.app.'] }, cfg).ok, true);
  assert.equal(core.dnsMatches({ a: ['75.2.60.5'] }, cfg).ok, true);
});
test('netlify adapter: provision adds one alias, keeps others, is idempotent, uses fixed host and no redirects', async () => {
  const f = fakeNetlify(); const ad = createNetlifyAdapter({ env: nenv, fetchImpl: f.impl });
  await ad.provision({ hostname: 'shop.example.com' });
  assert.deepEqual(f.s.aliases, ['keep.example.net', 'shop.example.com']);
  const writes = () => f.calls.filter(c => c.method === 'PATCH').length;
  await ad.provision({ hostname: 'shop.example.com' }); await Promise.all([ad.provision({ hostname: 'shop.example.com' }), ad.provision({ hostname: 'shop.example.com' })]);
  assert.equal(writes(), 1); assert.deepEqual(f.s.aliases, ['keep.example.net', 'shop.example.com']);
  assert.ok(f.calls.every(c => c.url.startsWith(`https://api.netlify.com/api/v1/sites/${SITE}`) && c.redirect === 'error' && c.auth === 'Bearer nfp_secret_token_value'));
  assert.ok(f.calls.filter(c => c.method === 'PATCH').every(c => Object.keys(c.body).join() === 'domain_aliases'));
});
test('netlify adapter: release removes only this alias, safe to repeat', async () => {
  const f = fakeNetlify({ aliases: ['keep.example.net', 'shop.example.com'] }); const ad = createNetlifyAdapter({ env: nenv, fetchImpl: f.impl });
  await ad.release({ hostname: 'shop.example.com' }); await ad.release({ hostname: 'shop.example.com' });
  assert.deepEqual(f.s.aliases, ['keep.example.net']); assert.equal(f.calls.filter(c => c.method === 'PATCH').length, 1);
});
test('netlify adapter: refuses netlify and platform hosts, maps errors to app codes', async () => {
  const f = fakeNetlify(); const ad = createNetlifyAdapter({ env: nenv, fetchImpl: f.impl });
  for (const h of ['x.netlify.app', 'digital-dukaan-live.netlify.app', 'digitalshop.website', 'https://a.com']) await assert.rejects(ad.provision({ hostname: h }), e => /^HOSTNAME_/.test(e.code), h);
  assert.equal(f.calls.length, 0);
  f.s.fail = 401; await assert.rejects(ad.provision({ hostname: 'a.example.com' }), e => e.code === 'HOSTING_AUTH_REJECTED');
  f.s.fail = 429; await assert.rejects(ad.status({ hostname: 'a.example.com' }), e => e.code === 'RATE_LIMITED' && e.retryAfter === 7);
  f.s.fail = 500; await assert.rejects(ad.status({ hostname: 'a.example.com' }), e => e.code === 'HOSTING_UNAVAILABLE');
  const f2 = fakeNetlify(); f2.s.aliases = 'oops'; await assert.rejects(createNetlifyAdapter({ env: nenv, fetchImpl: f2.impl }).status({ hostname: 'a.example.com' }), e => e.code === 'HOSTING_UNAVAILABLE');
  const f3 = fakeNetlify(); const orig = f3.impl; await assert.rejects(createNetlifyAdapter({ env: nenv, fetchImpl: async (u, o) => { if (o.method === 'PATCH') return { status: 422, ok: false, headers: new Map(), json: async () => ({}) }; return orig(u, o); } }).provision({ hostname: 'a.example.com' }), e => e.code === 'HOSTING_CONFLICT');
  await assert.rejects(createNetlifyAdapter({ env: {} }).provision({ hostname: 'a.example.com' }), e => e.code === 'SERVER_SETUP_REQUIRED');
});
test('netlify adapter: cert state maps to TLS pending vs ok, without writing', async () => {
  const f = fakeNetlify({ aliases: ['a.example.com'] }); const ad = createNetlifyAdapter({ env: nenv, fetchImpl: f.impl });
  let s = await ad.status({ hostname: 'a.example.com' }); assert.equal(s.status, 'provisioned'); assert.equal(s.certPending, true); assert.equal(s.code, 'TLS_PENDING');
  f.s.ssl = { state: 'issued', domains: ['a.example.com'], expires_at: '2027-01-01T00:00:00Z' };
  s = await ad.status({ hostname: 'a.example.com' }); assert.equal(s.httpsStatus, 'ok'); assert.ok(s.tlsExpiresAt instanceof Date);
  f.s.ssl = { state: 'issued', domains: ['other.example.com'] };
  assert.equal((await ad.status({ hostname: 'a.example.com' })).certPending, true);
  assert.ok(f.calls.every(c => c.method === 'GET'));
  const missing = await createNetlifyAdapter({ env: nenv, fetchImpl: fakeNetlify({ aliases: [] }).impl }).status({ hostname: 'a.example.com' });
  assert.equal(missing.status, 'pending');
});
test('netlify end to end through the service: setup, provision, pending cert stays amber, live after probes pass', async () => {
  const f = fakeNetlify(); const ad = createNetlifyAdapter({ env: nenv, fetchImpl: f.impl });
  const c = await svc.createDomain({ hostname: 'nl.example.org', businessId: 1, actor });
  const d = rows.find(r => r.id === c.domain.id);
  const probes = { txt: txtOk(d), route: async () => ({ ok: true, cname: ['digital-dukaan-live.netlify.app'], a: [], aaaa: [] }), https: async () => ({ ok: true, tls: false, code: 'TLS_FAILED' }) };
  let r = await svc.checkDomain(d.id, actor, { adapter: ad, probes });
  assert.equal(r.steps.dns.status, 'ok'); assert.equal(r.records.routing[0].type, 'CNAME');
  await svc.startProvisioning(d.id, actor, { adapter: ad });
  assert.ok(f.s.aliases.includes('nl.example.org')); assert.equal(d.hostingAdapter, 'netlify');
  r = await svc.checkDomain(d.id, actor, { adapter: ad, probes });
  assert.equal(r.steps.https.code, 'TLS_PENDING'); assert.equal(r.state, 'provisioning');
  f.s.ssl = { state: 'issued', domains: ['nl.example.org'], expires_at: '2027-01-01T00:00:00Z' };
  r = await svc.checkDomain(d.id, actor, { adapter: ad, probes: { ...probes, https: async () => ({ ok: true, tls: true, expires: new Date(Date.now() + 9e7), routed: true, slug: 'store-a' }) } });
  assert.equal(r.state, 'ready_to_activate');
  await svc.activateDomain(d.id, actor, { adapter: ad });
  assert.deepEqual(await svc.publicResolve('nl.example.org'), { slug: 'store-a' });
  await svc.detachDomain(d.id, actor, { adapter: ad });
  assert.ok(!f.s.aliases.includes('nl.example.org')); assert.ok(f.s.aliases.includes('keep.example.net'));
});
test('detaching an unprovisioned domain does not call the host, even when the host is down', async () => {
  const c = await svc.createDomain({ hostname: 'unprov.example.org', businessId: 1, actor });
  let released = 0; const down = { name: 'netlify', config: () => ({ configured: true }), release: async () => { released++; throw Object.assign(new Error('down'), { code: 'HOSTING_UNAVAILABLE' }); } };
  const r = await svc.detachDomain(c.domain.id, actor, { adapter: down });
  assert.equal(r.state, 'disconnected'); assert.equal(released, 0);
  const p = await svc.createDomain({ hostname: 'prov.example.org', businessId: 1, actor });
  rows.find(x => x.id === p.domain.id).provisioningAuthorizedAt = new Date();
  await assert.rejects(svc.detachDomain(p.domain.id, actor, { adapter: down }), e => e.code === 'HOSTING_UNAVAILABLE');
  assert.equal(released, 1); assert.ok(!rows.find(x => x.id === p.domain.id).detachedAt);
});

test('guide copy: PM wording for conflicts, relative TXT name, nameserver-based DNS provider, plain text', () => {
  const g = personalGuide({ hostname: 'shop.example.com', ownershipToken: 'tok' }, { configured: true, ipv4: [], cname: 'edge.example.net' });
  assert.ok(g.includes('If this hostname already has A, AAAA, CNAME, parking or forwarding records, stop and have your DNS administrator review them. Save a backup, then replace only conflicts approved for this exact hostname. Leave other hosts, email records and nameservers unchanged.'));
  assert.ok(!g.includes('Remove any old'));
  assert.match(g, /relative name/); assert.match(g, /_digitalshop-verify\.shop when you are inside example\.com/);
  assert.match(genericGuide(), /named in your domain's current nameservers/); assert.match(genericGuide(), /not always the company you bought the domain from/);
  assert.ok(!/pdf/i.test(g + genericGuide()));
});
test('next-action copy names the real button labels', () => {
  for (const st of ['pending_dns', 'verifying', 'provisioning', 'failed']) { const t = core.nextAction(st, {}); assert.match(t, /"Check again"/, st); assert.ok(!/check now/i.test(t)); }
  assert.match(core.nextAction('pending_dns', { ownershipCode: 'OWNERSHIP_EXPIRED' }), /"New ownership record"/);
  assert.match(core.nextAction('ready_to_activate', {}), /"Activate"/);
});
