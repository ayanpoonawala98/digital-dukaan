import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { resolveProviders, providerStatus, indianMobile, cleanSettings, sendEmail, sendSms, notifyNewOrder, notifyStatusChange, buildHttpRequest } from './notify.js';
import { encryptJson, decryptJson, mergeSecrets, publicView } from './notify-secrets.js';
import { isPrivateAddress, looksInternal, publicAddress } from './net-guard.js';
import { sendSmtp } from './smtp.js';

const calls = [];
const okFetch = async (url, opts) => { calls.push({ url, opts }); return { ok: true, status: 200, json: async () => ({ return: true }) }; };
const pub = async () => [{ address: '93.184.216.34' }];
const KEYS = { RESEND_API_KEY: 're_x', EMAIL_FROM: 'Shop <a@b.co>', FAST2SMS_API_KEY: 'k' };
const store = { id: 1, name: 'Demo', ownerId: 9, notifySettings: { ownerEmailAlerts: true, ownerEmail: 'o@x.com', ownerSmsAlerts: true, ownerPhone: '9876543210', customerSms: true } };
const SECRET = { JWT_SECRET: 'unit-test-secret' };

test('nothing is sent and nothing throws with no provider', async () => {
  calls.length = 0;
  assert.deepEqual(providerStatus(resolveProviders({}, {})), { email: { configured: false, label: '', source: '' }, sms: { configured: false, label: '', source: '' } });
  assert.deepEqual(await notifyNewOrder(store, 'lead', { id: 1, price: 10 }, { env: {}, fetchImpl: okFetch }), []);
  assert.equal((await sendEmail({ to: 'a@b.co', subject: 's', text: 't' }, { providers: {}, fetchImpl: okFetch })).ok, false);
  assert.equal(calls.length, 0);
});
test('indian mobile normalising + settings default off', () => {
  assert.equal(indianMobile('+91 98765-43210'), '9876543210'); assert.equal(indianMobile('12345'), null); assert.equal(indianMobile('+1 415 555 0123'), null);
  assert.deepEqual(cleanSettings(undefined), { ownerEmailAlerts: false, ownerEmail: '', ownerSmsAlerts: false, ownerPhone: '', customerSms: false });
});
test('platform presets still work and alert owner + customer', async () => {
  calls.length = 0;
  const res = await notifyNewOrder(store, 'lead', { id: 5, productName: 'Kurta', price: 999, customerName: 'Asha', customerPhone: '9123456789' }, { env: KEYS, fetchImpl: okFetch });
  assert.equal(res.length, 3); assert.ok(res.every(r => r.ok));
  assert.deepEqual(calls.filter(c => c.url.includes('fast2sms')).map(c => JSON.parse(c.opts.body).numbers).sort(), ['9123456789', '9876543210']);
});
test('a store uses its own provider over the platform one, per channel', () => {
  const p = resolveProviders({ emailMode: 'resend', resend: { apiKey: 'own_key_1234', from: 'a@b.co' } }, KEYS);
  assert.equal(p.email.source, 'own'); assert.equal(p.email.apiKey, 'own_key_1234'); assert.equal(p.sms.source, 'platform');
  assert.equal(resolveProviders({ emailMode: 'resend', resend: { apiKey: 'k_12345678' } }, KEYS).email.source, 'platform'); // incomplete own setup falls back
  assert.equal(resolveProviders({ smsMode: 'fast2sms', fast2sms: { apiKey: 'k_12345678', route: 'dlt' } }, {}).sms, null); // dlt needs ids
});
test('custom SMS API: placeholders are escaped for url, json and form', () => {
  const cfg = { url: 'https://api.sms.example/send?to={{to}}&k={{key}}', method: 'POST', contentType: 'json', headers: 'Authorization: Basic {{key_b64}}\nX-Store: {{store}}', body: '{"to":"{{to_intl}}","text":"{{message}}"}', key: 'sid:tok&en' };
  const r = buildHttpRequest(cfg, { to: '9876543210', to_intl: '919876543210', message: 'Hi "Asha"\nline', store: 'A\r\nB' });
  assert.equal(r.url, 'https://api.sms.example/send?to=9876543210&k=sid%3Atok%26en');
  assert.equal(r.headers.Authorization, `Basic ${Buffer.from('sid:tok&en').toString('base64')}`); assert.ok(!/[\r\n]/.test(r.headers['X-Store']));
  assert.deepEqual(JSON.parse(r.body), { to: '919876543210', text: 'Hi "Asha"\nline' });
  const f = buildHttpRequest({ ...cfg, contentType: 'form', body: 'to={{to}}&m={{message}}' }, { to: '9876543210', message: 'a b&c' });
  assert.equal(f.body, 'to=9876543210&m=a%20b%26c'); assert.equal(f.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(buildHttpRequest({ ...cfg, method: 'GET' }, { to: '1' }).body, undefined);
});
test('custom HTTP SMS/email send through fetch, refuse private hosts and non-2xx', async () => {
  calls.length = 0;
  const providers = { sms: { kind: 'http', url: 'https://gw.example.com/s', method: 'POST', contentType: 'json', body: '{"n":"{{to}}","m":"{{message}}"}', key: 'k' }, email: { kind: 'http', url: 'https://mail.example.com/m', method: 'POST', contentType: 'json', body: '{"to":"{{to}}","s":"{{subject}}","t":"{{message}}"}', key: 'k' } };
  assert.equal((await sendSms({ to: '+1 415 555 0123', text: 'hi' }, { providers, fetchImpl: okFetch, lookup: pub })).ok, true);
  assert.equal(JSON.parse(calls[0].opts.body).n, '14155550123'); assert.equal(calls[0].opts.redirect, 'manual');
  assert.equal((await sendEmail({ to: 'a@b.co', subject: 'S', text: 'T' }, { providers, fetchImpl: okFetch, lookup: pub })).ok, true);
  const internal = { ...providers, sms: { ...providers.sms, url: 'https://gw.example.com/s' } };
  const r = await sendSms({ to: '9876543210', text: 'x' }, { providers: internal, fetchImpl: okFetch, lookup: async () => [{ address: '10.0.0.5' }] });
  assert.equal(r.ok, false); assert.match(r.error, /not allowed/);
  const bad = await sendSms({ to: '9876543210', text: 'x' }, { providers, fetchImpl: async () => ({ ok: false, status: 401 }), lookup: pub });
  assert.equal(bad.ok, false); assert.match(bad.error, /401/);
});
test('provider failures never throw; customer SMS honours opt-in', async () => {
  const off = { ...store, notifySettings: { ownerEmailAlerts: false } };
  assert.deepEqual(await notifyStatusChange(off, 'lead', { id: 1, customerPhone: '9123456789' }, 'shipped', { env: KEYS, fetchImpl: okFetch }), []);
  const r = await notifyStatusChange(store, 'lead', { id: 1, customerPhone: '9123456789' }, 'shipped', { env: KEYS, fetchImpl: async () => { throw new Error('network'); } });
  assert.equal(r[0].ok, false);
});
test('keys encrypt at rest; wrong secret or tampering yields no keys', () => {
  const blob = encryptJson({ resend: { apiKey: 're_live_ABCDEFGH1234' } }, SECRET);
  assert.ok(!blob.includes('re_live')); assert.deepEqual(decryptJson(blob, SECRET), { resend: { apiKey: 're_live_ABCDEFGH1234' } });
  assert.deepEqual(decryptJson(blob, { JWT_SECRET: 'other' }), {}); assert.deepEqual(decryptJson(blob.slice(0, -4) + 'AAAA', SECRET), {}); assert.deepEqual(decryptJson('', SECRET), {});
  assert.throws(() => encryptJson({}, {}));
});
test('settings merge: blank secret keeps, validation, clear', () => {
  let c = mergeSecrets({}, { emailMode: 'smtp', smtp: { host: 'smtp.example.com', port: '587', user: 'me', pass: 'p@ss-word', from: 'Shop <a@shop.in>' }, smsMode: 'http', smsHttp: { url: 'https://gw.example.com/s?to={{to}}', method: 'post', contentType: 'json', body: '{"m":"{{message}}"}', key: 'KEY-12345' } });
  assert.equal(c.smtp.port, 587); assert.equal(c.smsHttp.method, 'POST');
  c = mergeSecrets(c, { smtp: { pass: '', host: 'smtp.other.com' } });
  assert.equal(c.smtp.pass, 'p@ss-word'); assert.equal(c.smtp.host, 'smtp.other.com');
  for (const [inp, re] of [[{ smtp: { host: 'localhost' } }, /public SMTP/], [{ smtp: { host: '10.0.0.1' } }, /public SMTP/], [{ smtp: { port: 22 } }, /port/], [{ smsHttp: { url: 'http://x.com/a' } }, /https/], [{ smsHttp: { url: 'https://127.0.0.1/a' } }, /not allowed/], [{ smsHttp: { url: 'https://u:p@x.com/a' } }, /username/], [{ smsHttp: { body: '{{evil}}' } }, /placeholder/], [{ smsHttp: { headers: 'Host: x' } }, /not allowed/], [{ smsHttp: { method: 'DELETE' } }, /GET or POST/], [{ resend: { apiKey: 'bad\nkey12345' } }, /invalid/], [{ emailMode: 'x' }, /provider type/]]) assert.throws(() => mergeSecrets(c, inp), re);
  c = mergeSecrets(c, { clear: ['sms'] }); assert.equal(c.smsHttp, undefined); assert.equal(c.smtp.host, 'smtp.other.com');
});
test('browser view never contains a secret', () => {
  const v = JSON.stringify(publicView({ emailMode: 'smtp', smtp: { host: 'h.example.com', pass: 'SUPERSECRETPASS99', user: 'u' }, resend: { apiKey: 're_SECRETSECRET9999' }, smsHttp: { key: 'HTTPKEYSECRET0001' } }));
  for (const s of ['SUPERSECRET', 'SECRETSECRET', 'HTTPKEYSECRET']) assert.ok(!v.includes(s));
  assert.ok(v.includes('"passSaved":true') && v.includes('9999') && v.includes('h.example.com'));
});
test('net guard blocks private, loopback, metadata and v6-mapped addresses', async () => {
  for (const ip of ['127.0.0.1', '10.1.1.1', '192.168.0.9', '172.16.5.5', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1', '::ffff:10.0.0.1', '0.0.0.0']) assert.ok(isPrivateAddress(ip), ip);
  for (const ip of ['93.184.216.34', '8.8.8.8', '2606:4700::1111']) assert.ok(!isPrivateAddress(ip), ip);
  assert.ok(looksInternal('localhost') && looksInternal('db.internal') && looksInternal('redis') && !looksInternal('smtp.example.com'));
  await assert.rejects(publicAddress('evil.example.com', async () => [{ address: '8.8.8.8' }, { address: '10.0.0.2' }]), /not allowed/);
});
test('SMTP client: STARTTLS-less AUTH refused; full plain transaction against a fake server', async () => {
  const seen = [];
  const server = net.createServer(s => {
    s.write('220 fake\r\n'); let data = false, buf = '';
    s.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\r\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 2); if (data) { if (line === '.') { data = false; s.write('250 queued\r\n'); } else seen.push(line); continue; } seen.push(line); if (/^EHLO/.test(line)) s.write('250-fake\r\n250 AUTH PLAIN\r\n'); else if (/^DATA/.test(line)) { data = true; s.write('354 go\r\n'); } else if (/^QUIT/.test(line)) s.end('221 bye\r\n'); else if (/^AUTH/.test(line)) s.write('235 ok\r\n'); else s.write('250 ok\r\n'); } });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
  await assert.rejects(sendSmtp({ host: '127.0.0.1', port, secure: false, user: 'u', pass: 'p', from: 'a@b.co' }, { to: 'x@y.co', subject: 's', text: 't' }, { allowPrivate: true }), /STARTTLS/);
  const r = await sendSmtp({ host: '127.0.0.1', port, secure: false, from: 'Shop <a@b.co>' }, { to: 'x@y.co', subject: 'Héllo', text: 'Body\n.dot' }, { allowPrivate: true });
  assert.equal(r.ok, true); assert.ok(seen.includes('MAIL FROM:<a@b.co>') && seen.includes('RCPT TO:<x@y.co>')); assert.ok(seen.some(l => l.startsWith('Subject: =?UTF-8?B?')));
  await assert.rejects(sendSmtp({ host: '127.0.0.1', port, secure: false, from: 'a@b.co' }, { to: 'x@y.co', subject: 's', text: 't' }, {}), /not allowed/); // guard on by default
  server.close();
});
