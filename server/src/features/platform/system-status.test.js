process.env.DATABASE_URL ||= 'postgres://u:p@localhost:5432/x';
process.env.JWT_SECRET ||= 'test-secret-test-secret-test-secret!!';
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import fsMod from 'node:fs';
import express from 'express';
import { createStatusService, row, environmentRows, emailRowLocal, smsRowLocal, imagekitRowLocal, razorpayRow, classify, maskNumber } from './system-status.js';
import { systemStatusRouter, checkAllowed } from './system-status-routes.js';
import { sendSmtp } from '../../shared/smtp.js';
import { bad, wrap } from '../../shared/utils/core.js';

const { roles, auth } = await import('../../shared/middleware/auth.js');
const SECRETS = ['sk_live_SECRETTOKEN123', 'private_SECRETIMAGEKEY999', 'smtp-pass-SECRET', 'EAAGSECRETMETATOKEN', 'twilio-auth-SECRET', 'jwt-SECRET-jwt-SECRET-jwt-SECRET-xx', 'postgres://admin:dbSECRET@host/db'];
const ENV = {
  DATABASE_URL: 'postgres://admin:dbSECRET@host/db', JWT_SECRET: 'jwt-SECRET-jwt-SECRET-jwt-SECRET-xx', CLIENT_URL: 'https://digitalshop.website',
  WHATSAPP_CLOUD_ENABLED: 'true', WHATSAPP_ACCESS_TOKEN: 'EAAGSECRETMETATOKEN', IMAGEKIT_PRIVATE_KEY: 'private_SECRETIMAGEKEY999', IMAGEKIT_URL_ENDPOINT: 'https://ik.imagekit.io/abc123'
};
const okRes = (body = {}, status = 200, headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: k => headers[k.toLowerCase()] ?? null }, json: async () => body });

function makeDeps(over = {}) {
  const calls = [];
  const fetchImpl = over.fetchImpl || (async (url, init = {}) => { calls.push({ url: String(url), method: init.method || 'GET' }); return okRes({ display_phone_number: '+91 98765 43210', usage: {} }); });
  const deps = {
    env: { ...ENV }, now: () => new Date(), fetchImpl,
    dbQuery: async () => 1,
    platformProviders: async () => ({ email: { kind: 'resend', label: 'Resend', apiKey: 're_SECRETRESENDKEY', from: 'a@b.co', source: 'platform' }, sms: { kind: 'fast2sms', label: 'Fast2SMS', apiKey: 'f2s-SECRET', source: 'platform' } }),
    platformWhatsApp: () => ({ accessToken: ENV.WHATSAPP_ACCESS_TOKEN, phoneNumberId: '123456789', displayPhone: '+91 98765 43210' }),
    metaCheck: async (c, f) => { const res = await f(`https://graph.facebook.com/v21.0/${c.phoneNumberId}?fields=display_phone_number`, { headers: { authorization: `Bearer ${c.accessToken}` } }); if (!res.ok) throw Object.assign(new Error('Meta rejected'), { metaCode: (await res.json()).error?.code }); },
    byoCheck: async () => {}, smtpVerify: async () => {},
    imagekitUsage: async (key, f) => { const res = await f('https://api.imagekit.io/v1/accounts/usage?startDate=2026-01-01&endDate=2026-01-08', { headers: { Authorization: 'Basic x' } }); if (!res.ok) throw Object.assign(new Error('x'), { status: res.status }); },
    lastWhatsAppInbound: async () => null,
    storeInfo: async id => (id === 12 ? { id: 12, name: 'QA Restaurant', providers: { email: null, sms: null }, byo: null, merchant: null } : null),
    ...over
  };
  return { deps, calls };
}
const find = (snap, id) => snap.sections.flatMap(s => s.rows).find(r => r.id === id);

test('snapshot without a run shows connection checks as Not checked, not green', async () => {
  const { deps, calls } = makeDeps();
  const snap = await createStatusService(deps).snapshot();
  assert.equal(find(snap, 'wa:platform').state, 'unknown');
  assert.equal(find(snap, 'wa:platform').code, 'NOT_CHECKED');
  assert.equal(find(snap, 'db').state, 'ok');
  assert.equal(snap.summary.checkedConnectionsOperational, false);
  assert.equal(calls.length, 0, 'a snapshot makes no remote calls');
});

test('check connections: credentials accepted is the only success wording, and only read-only GETs go out', async () => {
  const { deps, calls } = makeDeps();
  const snap = await createStatusService(deps).check();
  const wa = find(snap, 'wa:platform');
  assert.equal(wa.state, 'ok'); assert.equal(wa.label, 'Credentials accepted'); assert.equal(wa.verified, true);
  assert.match(wa.detail, /ending 3210/);
  assert.ok(calls.length >= 1);
  for (const c of calls) { assert.equal(c.method, 'GET'); assert.match(c.url, /^https:\/\/(graph\.facebook\.com|api\.imagekit\.io)\//); assert.doesNotMatch(c.url, /\/messages|\/upload|files/); }
  assert.equal(find(snap, 'imagekit').label, 'Credentials accepted');
  assert.equal(snap.summary.checkedConnectionsOperational, true);
});

test('auth rejected, rate limited and timeout map to stable codes; 429 respects Retry-After', async () => {
  for (const [status, body, code] of [[401, { error: { code: 190 } }, 'AUTH_REJECTED'], [403, {}, 'AUTH_REJECTED'], [500, {}, 'PROVIDER_ERROR']]) {
    const { deps } = makeDeps({ fetchImpl: async () => okRes(body, status) });
    const r = find(await createStatusService(deps).check(), 'wa:platform');
    assert.equal(r.code, code); assert.notEqual(r.state, 'ok');
  }
  let n = 0;
  const { deps } = makeDeps({ fetchImpl: async () => { n++; return okRes({ error: { code: 4 } }, 429, { 'retry-after': '120' }); } });
  const svc = createStatusService(deps);
  const first = find(await svc.check(), 'wa:platform');
  assert.equal(first.code, 'RATE_LIMITED'); assert.equal(first.state, 'attention'); assert.ok(first.retryAfterUntil);
  const before = n;
  await svc.check();
  assert.equal(n, before, 'no new call before Retry-After has passed');
  const slow = makeDeps({ checkMs: 80, fetchImpl: (url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('x'), { name: 'TimeoutError' })))) });
  assert.equal(find(await createStatusService(slow.deps).check(), 'wa:platform').code, 'CHECK_TIMEOUT');
});

test('malformed or odd upstream answers never become green', async () => {
  const bad2xx = makeDeps({ imagekitUsage: async (k, f) => { await f('https://api.imagekit.io/v1/accounts/usage?startDate=a&endDate=b', {}); throw Object.assign(new Error('x'), { statusCheck: 'CHECK_FAILED' }); } });
  const snap = await createStatusService(bad2xx.deps).check();
  assert.equal(find(snap, 'imagekit').code, 'CHECK_FAILED');
  assert.equal(find(snap, 'imagekit').state, 'attention');
  const redirect = makeDeps({ fetchImpl: async () => okRes({}, 302) });
  assert.equal(find(await createStatusService(redirect.deps).check(), 'wa:platform').state, 'attention');
});

test('disabled and unconfigured are neutral, not failed; a failed provider is red', async () => {
  const a = makeDeps({ platformWhatsApp: () => null, env: { ...ENV, WHATSAPP_CLOUD_ENABLED: 'false' } });
  assert.equal(find(await createStatusService(a.deps).snapshot(), 'wa:platform').state, 'neutral');
  const b = makeDeps({ storeInfo: async () => ({ id: 12, name: 'QA Restaurant', providers: { email: null, sms: null }, byo: { enabled: false, sender: '+919876543210', providerLabel: 'Twilio', conn: {} }, merchant: null }) });
  const snap = await createStatusService(b.deps).snapshot({ storeId: 12 });
  assert.equal(find(snap, 'wa:byo:12').state, 'neutral'); assert.equal(find(snap, 'wa:byo:12').code, 'DISABLED');
  const c = makeDeps({ fetchImpl: async () => okRes({ error: { code: 190 } }, 401) });
  const failed = find(await createStatusService(c.deps).check(), 'wa:platform');
  assert.equal(failed.state, 'failed');
  assert.ok(failed.nextStep.length > 0);
});

test('database probe: timeout and failure codes, one probe at a time', async () => {
  let started = 0;
  const slow = makeDeps({ dbQuery: () => { started++; return new Promise(() => {}); } });
  const svc = createStatusService(slow.deps);
  const origSetTimeout = global.setTimeout;
  global.setTimeout = (fn, ms, ...a) => origSetTimeout(fn, ms === 4000 ? 40 : ms, ...a);
  try {
    const [a, b] = await Promise.all([svc.snapshot(), svc.snapshot()]);
    assert.equal(find(a, 'db').code, 'DB_TIMEOUT'); assert.equal(find(b, 'db').state, 'failed');
    assert.equal(started, 1, 'concurrent snapshots share one database probe');
  } finally { global.setTimeout = origSetTimeout; }
  const down = makeDeps({ dbQuery: async () => { throw new Error('connect ECONNREFUSED 10.0.0.5:5432 password=hunter2'); } });
  const snap = await createStatusService(down.deps).snapshot();
  assert.equal(find(snap, 'db').code, 'DB_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(snap), /ECONNREFUSED|hunter2|10\.0\.0\.5/);
});

test('stale cache: old results are flagged stale and starting a check does not show retained green', async () => {
  let t = Date.now();
  const { deps } = makeDeps({ now: () => new Date(t) });
  const svc = createStatusService(deps);
  await svc.check();
  assert.equal(find(await svc.snapshot(), 'wa:platform').stale, false);
  t += 6 * 60 * 1000;
  const later = await svc.snapshot();
  assert.equal(find(later, 'wa:platform').stale, true);
  assert.equal(later.summary.checkedConnectionsOperational, false, 'stale never counts as all operational');
});

test('concurrent runs are deduped, results are reused for 5 minutes, and concurrency is capped at 3', async () => {
  let calls = 0, live = 0, peak = 0;
  const gate = () => new Promise(r => setTimeout(r, 30));
  const probe = async () => { calls++; live++; peak = Math.max(peak, live); await gate(); live--; };
  const { deps } = makeDeps({
    metaCheck: probe, byoCheck: probe, smtpVerify: probe, imagekitUsage: probe,
    platformProviders: async () => ({ email: { kind: 'smtp', label: 'SMTP', host: 'smtp.example.com', port: 587, from: 'a@b.co', source: 'platform' }, sms: null }),
    storeInfo: async () => ({ id: 12, name: 'QA', providers: { email: { kind: 'smtp', label: 'SMTP', host: 'smtp.example.com', port: 587, from: 'a@b.co', source: 'own' }, sms: null }, byo: { enabled: true, sender: '+919876543210', providerLabel: 'Twilio', conn: {} }, merchant: { state: 'connected', displayPhone: '+919000000000', phoneNumberId: '55', token: () => 'tok' } })
  });
  const svc = createStatusService(deps);
  await Promise.all([svc.check({ storeId: 12 }), svc.check({ storeId: 12 })]);
  assert.equal(calls, 6, 'six distinct probes, each ran once for two concurrent runs');
  assert.ok(peak <= 3, `peak ${peak}`);
  await svc.check({ storeId: 12 });
  assert.equal(calls, 6, 'reused from cache');
});

test('run deadline: unfinished probes stay Not checked', async () => {
  const { deps } = makeDeps({ runMs: 60, checkMs: 5000, metaCheck: () => new Promise(() => {}) });
  const snap = await createStatusService(deps).check();
  assert.equal(find(snap, 'wa:platform').state, 'unknown');
  assert.equal(find(snap, 'db').state, 'ok', 'partial results still shown');
});

test('nothing sensitive reaches the response: env values, keys, tokens, lengths', async () => {
  const { deps } = makeDeps({
    fetchImpl: async () => okRes({ error: { message: 'Invalid token EAAGSECRETMETATOKEN', code: 190 } }, 401),
    platformProviders: async () => ({ email: { kind: 'smtp', label: 'SMTP', host: 'smtp.example.com', port: 587, user: 'u', pass: 'smtp-pass-SECRET', from: 'a@b.co', source: 'platform' }, sms: { kind: 'fast2sms', label: 'Fast2SMS', apiKey: 'sk_live_SECRETTOKEN123', source: 'platform' } }),
    smtpVerify: async () => { throw Object.assign(new Error('535 smtp-pass-SECRET rejected'), { statusCheck: 'AUTH_REJECTED' }); }
  });
  const svc = createStatusService(deps);
  const out = JSON.stringify([await svc.snapshot(), await svc.check()]);
  for (const s of SECRETS) assert.ok(!out.includes(s), `leaked ${s}`);
  assert.doesNotMatch(out, /"length"|Bearer|Basic /);
  assert.equal(find(JSON.parse(out)[1], 'email:platform').code, 'AUTH_REJECTED');
});

test('environment rows are booleans only: required missing is red, unused optional is neutral, JWT is valid or invalid only', () => {
  const rows = environmentRows({ DATABASE_URL: 'mysql://x', JWT_SECRET: 'short', CLIENT_URL: '' , VAPID_PUBLIC_KEY: 'nope' }, () => new Date());
  const by = k => rows.find(r => r.id === `env:${k}`);
  assert.equal(by('DATABASE_URL').code, 'ENV_INVALID'); assert.equal(by('DATABASE_URL').state, 'failed');
  assert.equal(by('JWT_SECRET').code, 'ENV_INVALID');
  assert.equal(by('CLIENT_URL').code, 'ENV_MISSING_REQUIRED'); assert.equal(by('CLIENT_URL').state, 'failed');
  assert.equal(by('CRON_SECRET').state, 'neutral');
  assert.equal(by('VAPID_PUBLIC_KEY').state, 'attention');
  assert.doesNotMatch(JSON.stringify(rows), /mysql|short|nope/);
  const good = environmentRows({ ...ENV }, () => new Date());
  assert.equal(good.find(r => r.id === 'env:JWT_SECRET').state, 'ok');
});

test('email, sms, imagekit and razorpay stay configuration only and say so', () => {
  const at = new Date().toISOString();
  assert.equal(emailRowLocal({ id: 'e', scope: 'platform', provider: { kind: 'resend', label: 'Resend', apiKey: 're_abcdefgh12', from: 'a@b.co' }, checkedAt: at }).code, 'CHECK_UNSUPPORTED');
  assert.equal(emailRowLocal({ id: 'e', scope: 'platform', provider: { kind: 'http', label: 'Custom', url: 'http://insecure' }, checkedAt: at }).code, 'CONFIG_INCOMPLETE');
  assert.equal(emailRowLocal({ id: 'e', scope: 'platform', provider: null, checkedAt: at }).code, 'EMAIL_NOT_CONFIGURED');
  const sms = smsRowLocal({ id: 's', scope: 'platform', provider: { kind: 'fast2sms', label: 'Fast2SMS', apiKey: 'k' }, checkedAt: at });
  assert.equal(sms.label, 'Delivery not tested'); assert.equal(sms.state, 'unknown');
  assert.equal(imagekitRowLocal({}, at).state, 'neutral');
  assert.equal(imagekitRowLocal({ IMAGEKIT_PRIVATE_KEY: 'x' }, at).code, 'CONFIG_PRESENT');
  assert.equal(imagekitRowLocal({ IMAGEKIT_PRIVATE_KEY: 'x', IMAGEKIT_URL_ENDPOINT: 'http://bad' }, at).code, 'CONFIG_INCOMPLETE');
  const rz = razorpayRow({ RAZORPAY_ENABLED: 'true' }, at);
  assert.equal(rz.excluded, true); assert.equal(rz.state, 'neutral');
});

test('summary counts: config-only passes never count as operational; razorpay and neutral are excluded', async () => {
  const { deps } = makeDeps();
  const snap = await createStatusService(deps).snapshot();
  const all = snap.sections.flatMap(s => s.rows);
  assert.equal(snap.summary.operational, all.filter(r => !r.excluded && r.checkType === 'connectivity' && r.state === 'ok' && r.verified).length);
  assert.ok(all.some(r => r.checkType !== 'connectivity' && r.state === 'ok' && r.verified), 'fixture has passing env or build rows');
  assert.ok(snap.summary.operational < all.filter(r => r.state === 'ok' && r.verified).length, 'env and build rows are not counted as operational');
  assert.ok(find(snap, 'sms:platform').state === 'unknown');
  assert.equal(all.filter(r => r.id === 'razorpay').length, 1);
});

test('SMTP verifyOnly logs in and quits without MAIL FROM, RCPT TO or DATA', async () => {
  const seen = [];
  const server = net.createServer(sock => {
    sock.write('220 hi\r\n');
    let buf = '';
    sock.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\r\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 2); seen.push(line.split(' ')[0]); if (/^EHLO/.test(line)) sock.write('250 ok\r\n'); else if (/^AUTH/.test(line)) sock.write('235 ok\r\n'); else if (/^QUIT/.test(line)) { sock.write('221 bye\r\n'); sock.end(); } else sock.write('250 ok\r\n'); } });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const res = await sendSmtp({ host: '127.0.0.1', port, secure: false, from: 'a@b.co' }, { to: 'x@y.z', subject: '', text: '' }, { allowPrivate: true, verifyOnly: true });
  server.close();
  assert.equal(res.verified, true);
  await new Promise(r => setTimeout(r, 50));
  assert.ok(seen.includes('EHLO'));
  for (const forbidden of ['MAIL', 'RCPT', 'DATA']) assert.ok(!seen.includes(forbidden), forbidden);
});

test('classify never copies provider text', () => {
  assert.equal(classify({ metaCode: 190 }, { status: 400 }), 'AUTH_REJECTED');
  assert.equal(classify(new Error('whatever SECRET'), { status: null }), 'CHECK_UNREACHABLE');
  assert.equal(classify(null, { status: 429 }), 'RATE_LIMITED');
  assert.equal(maskNumber('+91 98765 43210'), 'ending 3210');
  assert.equal(maskNumber('12'), '');
});

async function call(app, path, init = {}) {
  const server = app.listen(0); const port = server.address().port;
  try { const res = await fetch(`http://127.0.0.1:${port}${path}`, init); return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) }; } finally { server.close(); }
}
function gatedApp(user, service, searchStores = async () => ({ stores: [] })) {
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { if (user) req.user = user; next(); });
  app.use('/api/admin/system-status', (req, res, next) => (req.user ? next() : next(bad(401, 'Sign in required'))), roles('superadmin'), systemStatusRouter({ service, searchStores, wrap, bad }));
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  return app;
}
test('routes: anonymous 401, owner and staff 403 before any provider access; superadmin gets no-store JSON', async () => {
  let touched = 0;
  const service = { snapshot: async () => { touched++; return { ok: true }; }, check: async () => { touched++; return { ok: true }; } };
  assert.equal((await call(gatedApp(null, service), '/api/admin/system-status')).status, 401);
  for (const role of ['owner', 'staff']) {
    assert.equal((await call(gatedApp({ id: 1, role }, service), '/api/admin/system-status')).status, 403);
    assert.equal((await call(gatedApp({ id: 1, role }, service), '/api/admin/system-status/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 403);
    assert.equal((await call(gatedApp({ id: 1, role }, service), '/api/admin/system-status/stores')).status, 403);
  }
  assert.equal(touched, 0);
  const ok = await call(gatedApp({ id: 9, role: 'superadmin' }, service), '/api/admin/system-status');
  assert.equal(ok.status, 200); assert.match(ok.headers.get('cache-control'), /no-store/); assert.match(ok.headers.get('cache-control'), /private/);
  assert.equal((await call(gatedApp({ id: 9, role: 'superadmin' }, service), '/api/admin/system-status?storeId=abc')).status, 400);
});

test('routes: per-user limit on Check connections returns 429 with Retry-After', async () => {
  const service = { snapshot: async () => ({}), check: async () => ({ ok: true }) };
  const app = gatedApp({ id: 777, role: 'superadmin' }, service);
  let last;
  for (let i = 0; i < 5; i++) last = await call(app, '/api/admin/system-status/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(last.status, 429); assert.ok(Number(last.headers.get('retry-after')) >= 1);
  assert.equal(checkAllowed(778, 1000), 0);
});

test('the real auth middleware refuses an anonymous request before any status code runs, and the router is mounted behind auth + roles', async () => {
  const app = express(); let ran = 0;
  app.use('/x', auth, (req, res) => { ran++; res.end(); });
  app.use((err, req, res, next) => res.status(err.status || 500).json({}));
  assert.equal((await call(app, '/x')).status, 401); assert.equal(ran, 0);
  const src = (await import('node:fs')).readFileSync(new URL('../../routes/admin.js', import.meta.url), 'utf8');
  const a = src.indexOf("r.use(auth, roles('superadmin'))"), b = src.indexOf("r.use('/system-status'");
  assert.ok(a > 0 && b > a);
});

test('the status code never calls a send or upload path', () => {
  const fs = fsMod;
  for (const f of ['system-status.js', 'system-status-wiring.js', 'system-status-routes.js']) {
    const src = fs.readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /sendEmail\(|sendSms\(|\.sendText|\.sendTemplate|notifyNewOrder|uploadImageKit|api\.razorpay|sendNotification|runDailyJobs/, f);
    assert.doesNotMatch(src, /method:\s*['"](POST|PUT|PATCH|DELETE)['"]/, f);
  }
});
