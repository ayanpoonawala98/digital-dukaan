import test from 'node:test';
import assert from 'node:assert/strict';
import { orderPhone, cleanOrderEmail, orderAmount, deviceLabel, pushMessage, canPush, channelAvailability, sendToDevices } from './customer-pure.js';

test('phones dedupe to one key whatever the format', () => {
  for (const v of ['98765 43210', '+91 98765-43210', '09876543210', '919876543210', '(91) 9876543210']) assert.equal(orderPhone(v), '919876543210');
  assert.equal(orderPhone(''), null); assert.equal(orderPhone('12345'), null); assert.equal(orderPhone('abc'), null);
  assert.equal(orderPhone('+1 415 555 2671'), '14155552671');
});
test('email and amount cleaning', () => {
  assert.equal(cleanOrderEmail(' A@B.com '), 'a@b.com'); assert.equal(cleanOrderEmail('nope'), ''); assert.equal(cleanOrderEmail(null), '');
  assert.equal(orderAmount({ total: '120.456' }), 120.46); assert.equal(orderAmount({ price: 50 }), 50); assert.equal(orderAmount({}), 0); assert.equal(orderAmount({ total: -5 }), 0);
});
test('device labels never keep the raw agent', () => {
  assert.equal(deviceLabel('Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile Safari/537'), 'Chrome on Android');
  assert.equal(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17) AppleWebKit Version/17 Safari/604'), 'Safari on iPhone/iPad');
  assert.equal(deviceLabel(''), 'Browser on Device');
});
test('push message validation keeps links inside the shop', () => {
  const store = { slug: 'spice' };
  assert.equal(pushMessage({ title: 'Hi', body: 'Offer' }, store).url, '/store/spice');
  assert.ok(pushMessage({ title: '', body: 'x' }, store).error);
  assert.ok(pushMessage({ title: 'a', body: 'x'.repeat(181) }, store).error);
  for (const url of ['https://evil.com', '//evil.com', '/store/other', '/store/spice evil', '/store/spice\\x']) assert.ok(pushMessage({ title: 'a', body: 'b', url }, store).error, url);
  assert.equal(pushMessage({ title: 'a', body: 'b', url: '/store/spice/product/3' }, store).url, '/store/spice/product/3');
  assert.deepEqual(Object.keys(JSON.parse(pushMessage({ title: 'a', body: 'b' }, store).payload)).sort(), ['badge', 'body', 'icon', 'title', 'url']);
});
test('channel availability follows provider, address and consent', () => {
  const c = { optInStatus: 'unknown', email: 'a@b.com', phone: '919876543210' };
  let a = channelAvailability(c, 2, null);
  assert.equal(a.push.enabled, true); assert.equal(a.email.enabled, false); assert.match(a.email.reason, /Connect your own/);
  a = channelAvailability(c, 0, { email: {}, sms: {} });
  assert.equal(a.push.enabled, false); assert.match(a.email.reason, /not opted in/);
  a = channelAvailability({ ...c, optInStatus: 'opted_in' }, 1, { email: {}, sms: {} });
  assert.equal(a.email.enabled && a.sms.enabled, true);
  a = channelAvailability({ ...c, optInStatus: 'opted_out' }, 3, { email: {}, sms: {} });
  assert.equal(a.push.enabled, false); assert.equal(canPush({ optInStatus: 'opted_out' }), false); assert.equal(canPush({ optInStatus: 'unknown' }), true);
});
test('sendToDevices counts results and reports dead browsers', async () => {
  const devices = [1, 2, 3, 4].map(i => ({ id: i, endpoint: `e${i}`, keys: {} }));
  const r = await sendToDevices(devices, 'p', async sub => { if (sub.endpoint === 'e2') throw { statusCode: 410 }; if (sub.endpoint === 'e3') throw { statusCode: 500 }; }, { chunk: 2 });
  assert.equal(r.sent, 2); assert.equal(r.failed, 2); assert.deepEqual(r.gone.map(d => d.id), [2]);
});
