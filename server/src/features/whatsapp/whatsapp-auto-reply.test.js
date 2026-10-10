import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET ||= 'a'.repeat(40);
const { maybeAutoReply } = await import('./whatsapp-cloud.js');

const args = (fetcher) => ({ connection: { phoneNumberId: '1' }, businessId: 1, phoneNumberId: '1', phone: '919999999999', inboundId: 'wamid.x', eventAt: new Date(), fetcher });

test('auto-reply never sends while outbound is disabled', async () => {
  process.env.WHATSAPP_CLOUD_ENABLED = 'true'; delete process.env.WHATSAPP_OUTBOUND_ENABLED; process.env.WHATSAPP_GRAPH_VERSION = 'v26.0';
  let calls = 0;
  assert.equal(await maybeAutoReply(args(async () => { calls++; return { ok: true, json: async () => ({ messages: [{ id: 'm' }] }) }; })), false);
  assert.equal(calls, 0);
});
test('auto-reply never throws and sends nothing when settings cannot be read', async () => {
  process.env.WHATSAPP_CLOUD_ENABLED = 'true'; process.env.WHATSAPP_OUTBOUND_ENABLED = 'true'; process.env.WHATSAPP_GRAPH_VERSION = 'v26.0';
  let calls = 0;
  assert.equal(await maybeAutoReply(args(async () => { calls++; return { ok: true, json: async () => ({ messages: [{ id: 'm' }] }) }; })), false);
  assert.equal(calls, 0);
});
test('auto-reply ignores a stale inbound message outside the 24 hour window', async () => {
  process.env.WHATSAPP_CLOUD_ENABLED = 'true'; process.env.WHATSAPP_OUTBOUND_ENABLED = 'true';
  let calls = 0;
  const a = args(async () => { calls++; return { ok: true, json: async () => ({}) }; });
  a.eventAt = new Date(Date.now() - 25 * 3600 * 1000);
  assert.equal(await maybeAutoReply(a), false);
  assert.equal(calls, 0);
});
