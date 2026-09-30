import { Router, raw } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const whatsappWebhook = Router();
const enabled = () => process.env.WHATSAPP_CLOUD_ENABLED === 'true';
const safeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
export function verifyMetaSignature(body, signature, secret) {
  if (!secret || !/^sha256=[a-f0-9]{64}$/i.test(signature || '')) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  return safeEqual(expected, signature);
}
whatsappWebhook.get('/', (req, res) => {
  if (!enabled() || !process.env.WHATSAPP_VERIFY_TOKEN || req.query['hub.mode'] !== 'subscribe' || !safeEqual(req.query['hub.verify_token'], process.env.WHATSAPP_VERIFY_TOKEN) || !/^\d+$/.test(String(req.query['hub.challenge'] || ''))) return res.sendStatus(403);
  res.type('text/plain').send(String(req.query['hub.challenge']));
});
whatsappWebhook.post('/', raw({ type: 'application/json', limit: '100kb' }), (req, res) => {
  if (!enabled() || !Buffer.isBuffer(req.body) || !verifyMetaSignature(req.body, req.header('x-hub-signature-256'), process.env.META_APP_SECRET)) return res.sendStatus(403);
  let payload;
  try { payload = JSON.parse(req.body.toString('utf8')); } catch { return res.sendStatus(400); }
  if (payload.object !== 'whatsapp_business_account') return res.sendStatus(400);
  // Receive plumbing only. Never turn an inbound message into consent or auto-reply.
  // A durable idempotent event store and owner-facing inbox are needed before processing.
  res.sendStatus(200);
});
export async function sendTestWhatsApp({ to, text, token = process.env.WHATSAPP_ACCESS_TOKEN, fetchImpl = fetch }) {
  if (!enabled() || process.env.WHATSAPP_TEST_SEND_ENABLED !== 'true') throw new Error('Cloud API test send is disabled');
  if (!process.env.WHATSAPP_TEST_PHONE_NUMBER_ID || !token) throw new Error('Cloud API test credentials missing');
  if (!/^\d{8,15}$/.test(to) || !/^\d{8,15}$/.test(process.env.WHATSAPP_TEST_RECIPIENT || '') || to !== process.env.WHATSAPP_TEST_RECIPIENT) throw new Error('Recipient not allowlisted for test');
  if (typeof text !== 'string' || !text.trim() || text.length > 4096) throw new Error('Invalid message text');
  const version = process.env.WHATSAPP_GRAPH_VERSION || 'v23.0';
  if (!/^v\d+\.\d+$/.test(version)) throw new Error('Invalid Graph API version');
  const response = await fetchImpl(`https://graph.facebook.com/${version}/${process.env.WHATSAPP_TEST_PHONE_NUMBER_ID}/messages`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body: text } })
  });
  if (!response.ok) throw new Error(`Cloud API request failed (${response.status})`);
  return response.json();
}

// This staged UI exposes no secrets and no real-send endpoint.
export const whatsappCloudOwnerRoutes = Router();
whatsappCloudOwnerRoutes.use((req, res, next) => {
  if (process.env.WHATSAPP_INTEGRATION_UI_ENABLED !== 'true' || String(req.store?.ownerId) !== String(process.env.WHATSAPP_SANDBOX_OWNER_ID || '')) return res.status(404).json({ error: 'Integration not available for this shop' });
  next();
});
whatsappCloudOwnerRoutes.get('/status', (req, res) => res.json({
  cloudEnabled: enabled(), testSendEnabled: process.env.WHATSAPP_TEST_SEND_ENABLED === 'true',
  testNumber: '+1 555 187 7826', phoneNumberId: process.env.WHATSAPP_TEST_PHONE_NUMBER_ID || '1261397693731087',
  wabaId: process.env.WHATSAPP_TEST_WABA_ID || '219715891199851',
  tokenConfigured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN),
  webhookConfigured: Boolean(process.env.WHATSAPP_VERIFY_TOKEN && process.env.META_APP_SECRET),
  recipientConfigured: /^\d{8,15}$/.test(process.env.WHATSAPP_TEST_RECIPIENT || '')
}));
whatsappCloudOwnerRoutes.post('/sandbox-check', (req, res) => {
  const text = req.body?.text;
  if (typeof text !== 'string' || !text.trim() || text.length > 4096) return res.status(400).json({ error: 'Use 1-4096 characters of message text' });
  // Construct a payload in memory. Do not use real credentials, network or sends.
  const payload = { messaging_product: 'whatsapp', recipient_type: 'individual', to: '15550000000', type: 'text', text: { body: text.trim() } };
  const simulated = JSON.parse(JSON.stringify(payload));
  if (simulated.text.body !== text.trim()) return res.status(500).json({ error: 'Sandbox check failed' });
  res.json({ simulated: true, sent: false, checks: ['Text validated', 'Payload round-trip checked', 'Real transport not called'] });
});
