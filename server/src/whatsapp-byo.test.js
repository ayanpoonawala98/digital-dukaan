import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET ||= 'a'.repeat(40);
const m = await import('./whatsapp-byo.js');
const { adapters, parseMetaFormat, twilioSignature, byoAllowedFor, webhookUrl, notifyNewOrder, sendOrderStatus } = m;

const okFetch = (body, status = 200, calls = []) => async (url, init) => { calls.push({ url: String(url), init }); return { ok: status < 300, status, json: async () => body }; };

test('feature flag: only listed stores, only when enabled', () => {
  delete process.env.WHATSAPP_BYO_ENABLED; process.env.WHATSAPP_BYO_BUSINESS_IDS = '1';
  assert.equal(byoAllowedFor(1), false);
  process.env.WHATSAPP_BYO_ENABLED = 'true';
  assert.equal(byoAllowedFor(1), true); assert.equal(byoAllowedFor(2), false);
});
test('with the flag off, order dispatch falls through to the existing path and sends nothing new', async () => {
  delete process.env.WHATSAPP_BYO_ENABLED; delete process.env.WHATSAPP_ORDER_BOT_ENABLED;
  const calls = [];
  assert.equal(await notifyNewOrder({ id: 1, name: 'S', notifySettings: { ownerPhone: '919999999999' } }, { id: 5, price: 10 }, okFetch({}, 200, calls)), false);
  assert.equal(await sendOrderStatus({ id: 1, name: 'S' }, { id: 5, customerPhone: '919999999999' }, 'packed', okFetch({}, 200, calls)), false);
  assert.equal(calls.length, 0);
});
test('360dialog sends Meta-format JSON with the D360 header', async () => {
  const calls = [];
  const id = await adapters['360dialog'].sendText({ apiKey: 'K' }, '919999999999', 'hi', okFetch({ messages: [{ id: 'wamid.1' }] }, 200, calls));
  assert.equal(id, 'wamid.1');
  assert.equal(calls[0].url, 'https://waba-v2.360dialog.io/messages');
  assert.equal(calls[0].init.headers['D360-API-KEY'], 'K');
  assert.deepEqual(JSON.parse(calls[0].init.body), { messaging_product: 'whatsapp', recipient_type: 'individual', to: '919999999999', type: 'text', text: { preview_url: false, body: 'hi' } });
  await assert.rejects(adapters['360dialog'].sendText({ apiKey: 'K' }, '919999999999', 'hi', okFetch({ error: { code: 131047 } }, 400)), e => e.metaCode === 131047);
});
test('template payload carries name, language and body params', async () => {
  const calls = [];
  await adapters.meta.sendTemplate({ accessToken: 'T', phoneNumberId: '123' }, '919999999999', { name: 'dd_order_alert', lang: 'en' }, ['DD-1', 'x', 'Rs.1.00'], okFetch({ messages: [{ id: 'w' }] }, 200, calls));
  assert.match(calls[0].url, /graph\.facebook\.com\/v[\d.]+\/123\/messages$/);
  assert.equal(calls[0].init.headers.authorization, 'Bearer T');
  const b = JSON.parse(calls[0].init.body);
  assert.equal(b.template.name, 'dd_order_alert'); assert.deepEqual(b.template.components[0].parameters.map(p => p.text), ['DD-1', 'x', 'Rs.1.00']);
});
test('twilio sends form data with whatsapp: prefixes, content template variables and basic auth', async () => {
  const calls = [];
  const sid = await adapters.twilio.sendTemplate({ accountSid: 'ACx', authToken: 'tok', from: '+14155238886' }, '919999999999', { name: 'HXabc' }, ['DD-1', 'packed'], okFetch({ sid: 'SM1' }, 201, calls));
  assert.equal(sid, 'SM1'); assert.match(calls[0].url, /Accounts\/ACx\/Messages\.json$/);
  assert.equal(calls[0].init.headers.authorization, 'Basic ' + Buffer.from('ACx:tok').toString('base64'));
  const f = new URLSearchParams(calls[0].init.body);
  assert.equal(f.get('From'), 'whatsapp:+14155238886'); assert.equal(f.get('To'), 'whatsapp:+919999999999'); assert.equal(f.get('ContentSid'), 'HXabc');
  assert.deepEqual(JSON.parse(f.get('ContentVariables')), { 1: 'DD-1', 2: 'packed' });
  await assert.rejects(adapters.twilio.sendText({ accountSid: 'ACx', authToken: 't', from: '+1' }, '9199', 'x', okFetch({ code: 63016 }, 400)), e => e.metaCode === 63016);
});
test('Meta-format inbound parsing handles messages, statuses and unsupported types', () => {
  const p = parseMetaFormat({ entry: [{ changes: [{ field: 'messages', value: { messages: [{ id: 'a', from: '919999999999', type: 'text', timestamp: '1700000000', text: { body: 'Order ref: DD-7' } }, { id: 'b', from: '919999999999', type: 'image', timestamp: '1700000001' }], statuses: [{ id: 'o', status: 'delivered' }] } }] }] });
  assert.equal(p.messages.length, 2); assert.equal(p.messages[0].text, 'Order ref: DD-7'); assert.equal(p.messages[1].text, null); assert.equal(p.statuses[0].status, 'delivered');
});
test('twilio inbound form parsing: message vs status callback', () => {
  const msg = adapters.twilio.parse({ body: { MessageSid: 'SM9', From: 'whatsapp:+919999999999', To: 'whatsapp:+14155238886', Body: 'hello', ProfileName: 'A' } });
  assert.equal(msg.messages[0].from, '919999999999'); assert.equal(msg.messages[0].text, 'hello');
  const st = adapters.twilio.parse({ body: { MessageSid: 'SM9', MessageStatus: 'undelivered', ErrorCode: '63016' } });
  assert.equal(st.statuses[0].status, 'failed'); assert.equal(st.statuses[0].code, '63016'); assert.equal(st.messages.length, 0);
});
test('twilio signature validation accepts the correct signature and rejects tampering', () => {
  process.env.WHATSAPP_WEBHOOK_CALLBACK_URL = 'https://api.example.com/api/integrations/whatsapp/webhook';
  const conn = { provider: 'twilio', secret: 'a'.repeat(48) }, url = webhookUrl(conn);
  assert.equal(url, `https://api.example.com/api/integrations/whatsapp-byo/twilio/${'a'.repeat(48)}`);
  const body = { MessageSid: 'SM1', Body: 'hi', From: 'whatsapp:+919999999999' };
  const good = twilioSignature('tok', url, body);
  const req = sig => ({ header: n => (n === 'x-twilio-signature' ? sig : undefined), body });
  assert.equal(adapters.twilio.verify(req(good), { authToken: 'tok' }, conn), true);
  assert.equal(adapters.twilio.verify(req(good), { authToken: 'other' }, conn), false);
  assert.equal(adapters.twilio.verify(req(undefined), { authToken: 'tok' }, conn), false);
  assert.equal(adapters.twilio.verify({ header: () => good, body: { ...body, Body: 'evil' } }, { authToken: 'tok' }, conn), false);
});
test('meta adapter verifies the shop app-secret signature when one is stored, and skips only when none', () => {
  const raw = Buffer.from('{"a":1}'), sig = 'sha256=' + createHmac('sha256', 'sec').update(raw).digest('hex');
  const req = s => ({ rawBody: raw, header: () => s });
  assert.equal(adapters.meta.verify(req(sig), { appSecret: 'sec' }), true);
  assert.equal(adapters.meta.verify(req('sha256=' + '0'.repeat(64)), { appSecret: 'sec' }), false);
  assert.equal(adapters.meta.verify(req(undefined), { appSecret: 'sec' }), false);
  assert.equal(adapters.meta.verify(req(undefined), {}), true);
});

test('twilio sends a per-shop StatusCallback and each shop has its own inbound and status URLs', async () => {
  process.env.WHATSAPP_WEBHOOK_CALLBACK_URL = 'https://api.example.com/api/integrations/whatsapp/webhook';
  const a = { provider: 'twilio', secret: 'a'.repeat(48) }, b = { provider: 'twilio', secret: 'b'.repeat(48) };
  assert.notEqual(webhookUrl(a), webhookUrl(b)); assert.notEqual(webhookUrl(a, 'status'), webhookUrl(b, 'status'));
  assert.equal(webhookUrl(a, 'status'), `${webhookUrl(a)}/status`);
  const calls = [];
  await adapters.twilio.sendText({ accountSid: 'ACx', authToken: 't', from: '+14155238886', statusCallback: webhookUrl(a, 'status') }, '919999999999', 'hi', okFetch({ sid: 'SM2' }, 201, calls));
  assert.equal(new URLSearchParams(calls[0].init.body).get('StatusCallback'), webhookUrl(a, 'status'));
});
test('twilio signatures are isolated per shop and per endpoint', () => {
  process.env.WHATSAPP_WEBHOOK_CALLBACK_URL = 'https://api.example.com/x';
  const a = { provider: 'twilio', secret: 'a'.repeat(48) }, b = { provider: 'twilio', secret: 'b'.repeat(48) };
  const body = { MessageSid: 'SM1', MessageStatus: 'delivered' };
  const sigA = twilioSignature('tokA', webhookUrl(a, 'status'), body);
  const req = { header: () => sigA, body };
  assert.equal(adapters.twilio.verify(req, { authToken: 'tokA' }, a, 'status'), true);
  assert.equal(adapters.twilio.verify(req, { authToken: 'tokA' }, a, ''), false); // status signature not valid on the inbound URL
  assert.equal(adapters.twilio.verify(req, { authToken: 'tokB' }, b, 'status'), false); // another shop's token and URL
});
