import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET ||= 'a'.repeat(40);
const { sendCampaign, cleanKey, cleanCampaigns, toDestination, aisensyAllowedFor, aisensyNewOrder, aisensyStatus, AISENSY_URL } = await import('./aisensy.js');
const { featureForOwnerRoute } = await import('./feature-locks.js');

const KEY = 'eyJhbGciOiJIUzI1NiJ9.abcdefghijklmnopqrstuv';
test('key validation', () => {
  assert.equal(cleanKey(` ${KEY} `), KEY);
  for (const v of ['', 'short', 'has space in it 12345678901234567890', 'a\nb'.repeat(10), 5, null]) assert.throws(() => cleanKey(v));
});
test('campaign names', () => {
  assert.deepEqual(cleanCampaigns({ confirm: ' c1 ', alert: '', bogus: 'x' }), { confirm: 'c1' });
  assert.throws(() => cleanCampaigns({ alert: 'a\nb' }));
  assert.throws(() => cleanCampaigns({ status: 'x'.repeat(101) }));
});
test('destination normalising', () => {
  assert.equal(toDestination('98765 43210'), '+919876543210');
  assert.equal(toDestination('+91 98765-43210'), '+919876543210');
  assert.equal(toDestination('12'), null);
  assert.equal(toDestination(''), null);
});
test('allow-list is off unless the env lists the store', () => {
  delete process.env.AISENSY_STORE_IDS; assert.equal(aisensyAllowedFor(1), false);
  process.env.AISENSY_STORE_IDS = '1, 3'; assert.equal(aisensyAllowedFor(1), true); assert.equal(aisensyAllowedFor(2), false);
  delete process.env.AISENSY_STORE_IDS;
});
test('sendCampaign posts the documented payload to the fixed AiSensy URL', async () => {
  let seen;
  const f = async (url, o) => { seen = { url, body: JSON.parse(o.body) }; return { ok: true, status: 200, json: async () => ({ success: 'true' }) }; };
  const r = await sendCampaign({ apiKey: KEY, campaignName: 'c', destination: '+919876543210', userName: 'Asha', templateParams: ['a', 1] }, f);
  assert.equal(r.ok, true); assert.equal(seen.url, AISENSY_URL);
  assert.deepEqual(seen.body, { apiKey: KEY, campaignName: 'c', destination: '+919876543210', userName: 'Asha', source: 'Digital Shop', templateParams: ['a', '1'] });
});
test('sendCampaign reports failures without leaking the key', async () => {
  const bad = await sendCampaign({ apiKey: KEY, campaignName: 'c', destination: '+91x' }, async () => ({ ok: false, status: 401, json: async () => ({ message: 'Invalid ApiKey' }) }));
  assert.deepEqual(bad, { ok: false, error: 'Invalid ApiKey' });
  const soft = await sendCampaign({ apiKey: KEY, campaignName: 'c', destination: '+91x' }, async () => ({ ok: true, status: 200, json: async () => ({ success: 'false', message: 'Campaign not live' }) }));
  assert.equal(soft.ok, false);
  const down = await sendCampaign({ apiKey: KEY, campaignName: 'c', destination: '+91x' }, async () => { throw new Error(KEY); });
  assert.deepEqual(down, { ok: false, error: 'Could not reach AiSensy' });
});
const fakeRow = campaigns => ({ campaigns, update: async () => {} });
test('new order sends owner alert and customer confirmation with the right params', async () => {
  const sent = [];
  const f = async (u, o) => { sent.push(JSON.parse(o.body)); return { ok: true, json: async () => ({ success: 'true' }) }; };
  const c = { apiKey: KEY, row: fakeRow({ confirm: 'cc', alert: 'ca', status: 'cs' }) };
  const store = { id: 1, name: 'Apna Kirana', notifySettings: { ownerPhone: '9000000001' } };
  const lead = { id: 18, price: 250, productName: 'Rice', customerPhone: '9000000002', customerName: 'Ravi' };
  assert.equal(await aisensyNewOrder(c, store, lead, f), true);
  const alert = sent.find(s => s.campaignName === 'ca'), conf = sent.find(s => s.campaignName === 'cc');
  assert.deepEqual(alert.templateParams, ['DD-18', 'Rice', 'Rs.250.00']); assert.equal(alert.destination, '+919000000001');
  assert.deepEqual(conf.templateParams, ['Apna Kirana', 'DD-18', 'Rs.250.00']); assert.equal(conf.userName, 'Ravi');
});
test('new order skips messages with no number or no campaign', async () => {
  const f = async () => { throw new Error('should not send'); };
  const c = { apiKey: KEY, row: fakeRow({ confirm: 'cc' }) };
  assert.equal(await aisensyNewOrder(c, { id: 1, name: 'S', notifySettings: {} }, { id: 1, price: 1, productName: 'x', customerPhone: '' }, f), false);
});
test('status update uses the status campaign and skips unknown statuses', async () => {
  const sent = [];
  const f = async (u, o) => { sent.push(JSON.parse(o.body)); return { ok: true, json: async () => ({}) }; };
  const c = { apiKey: KEY, row: fakeRow({ status: 'cs' }) };
  const lead = { id: 5, customerPhone: '9000000002', customerName: 'R' };
  assert.equal(await aisensyStatus(c, { id: 1, name: 'S' }, lead, 'shipped', f), true);
  assert.deepEqual(sent[0].templateParams, ['DD-5', 'shipped']);
  assert.equal(await aisensyStatus(c, { id: 1, name: 'S' }, lead, 'weird', f), false);
});
test('aisensy routes follow the WhatsApp integration feature lock', () => {
  assert.equal(featureForOwnerRoute('PUT', '/aisensy'), 'whatsappCloud');
});
