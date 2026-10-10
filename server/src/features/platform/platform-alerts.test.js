import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET ||= 'a'.repeat(40);
const { notifyShopRequest, cleanAlertSettings } = await import('./platform-alerts.js');
const req = { shopName: 'Raj Stores', name: 'Raj\r\nKumar', phone: '9876543210', email: 'raj@example.com', message: 'Open a kirana' };
const creds = { emailMode: 'resend', resend: { apiKey: 'rk_test_1234', from: 'Dukaan <a@b.co>' }, smsMode: 'fast2sms', fast2sms: { apiKey: 'fk_test_1234', route: 'quick' } };
const mk = settings => { const calls = []; return { calls, deps: { loaded: { creds, settings: cleanAlertSettings(settings) }, env: {}, fetchImpl: async (url, o) => { calls.push({ url, o }); return { ok: true, status: 200, json: async () => ({ return: true }) }; } } }; };

test('platform alerts send nothing when both switches are off', async () => {
  const { calls, deps } = mk({});
  assert.deepEqual(await notifyShopRequest(req, deps), []);
  assert.equal(calls.length, 0);
});
test('new-store request emails and texts the superadmin when switched on', async () => {
  const { calls, deps } = mk({ emailAlerts: true, alertEmail: 'boss@example.com', smsAlerts: true, alertPhone: '98111 22233' });
  const res = await notifyShopRequest(req, deps);
  assert.equal(res.length, 2); assert.ok(res.every(r => r.ok));
  const email = calls.find(c => c.url.includes('resend')), sms = calls.find(c => c.url.includes('fast2sms'));
  assert.deepEqual(JSON.parse(email.o.body).to, ['boss@example.com']);
  assert.match(JSON.parse(email.o.body).subject, /Raj Stores/);
  assert.equal(JSON.parse(sms.o.body).numbers, '9811122233');
  assert.ok(!JSON.parse(sms.o.body).message.includes('\n'));
});
test('platform alerts skip a channel with no destination and never throw', async () => {
  const { calls, deps } = mk({ emailAlerts: true, alertEmail: '', smsAlerts: false });
  assert.deepEqual(await notifyShopRequest(req, deps), []);
  assert.equal(calls.length, 0);
  deps.fetchImpl = async () => { throw new Error('network down'); };
  deps.loaded.settings = cleanAlertSettings({ emailAlerts: true, alertEmail: 'boss@example.com' });
  const out = await notifyShopRequest(req, deps);
  assert.equal(out[0].ok, false);
});
test('platform alert settings ignore unknown fields and non-booleans', () => {
  const s = cleanAlertSettings({ emailAlerts: 'yes', alertEmail: ' a@b.co ', evil: 1 });
  assert.deepEqual(s, { welcomeEmailMode:'setup', ownerWelcomeEmails:false, emailAlerts: false, alertEmail: 'a@b.co', smsAlerts: false, alertPhone: '' });
});


test('platform settings updates never write or wipe the provider payload', async () => {
  const { PlatformAlert, saveAlertSettings, saveAlertKeys, alertState } = await import('./platform-alerts.js');
  const saved = [PlatformAlert.sync, PlatformAlert.findByPk, PlatformAlert.findOrCreate];
  const { encryptJson } = await import('../notifications/notify-secrets.js');
  const row = { payload: encryptJson(creds), settings: cleanAlertSettings({}), update: async (values, opts) => {
    assert.deepEqual(Object.keys(values), opts.fields);
    Object.assign(row, values);
  }};
  PlatformAlert.sync = async () => {};
  PlatformAlert.findByPk = async () => row;
  PlatformAlert.findOrCreate = async () => [row, false];
  try {
    const original = row.payload;
    const state = await saveAlertSettings({ alertEmail: 'boss@example.com' });
    assert.equal(row.payload, original);
    assert.equal(state.keys.resend.apiKeySaved, true);
    assert.equal(state.providers.email.configured, true);
    assert.equal(state.settings.alertEmail, 'boss@example.com');
    await saveAlertKeys({ emailMode: 'resend', resend: { from: 'Digital Shop <noreply@example.com>' } });
    assert.equal(row.settings.alertEmail, 'boss@example.com');
    assert.equal((await alertState()).keys.resend.apiKeySaved, true);
    assert.equal((await alertState()).keys.resend.from, 'Digital Shop <noreply@example.com>');
  } finally { [PlatformAlert.sync, PlatformAlert.findByPk, PlatformAlert.findOrCreate] = saved; }
});
