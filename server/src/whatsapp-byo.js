// Bring-your-own WhatsApp provider: each shop connects its own sender (Meta Cloud API with its own
// token, 360dialog, or Twilio). Nothing here touches the shared-number Meta path; order alerts only
// come here when the shop has switched its own connection ON, otherwise the old path runs unchanged.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import express, { Router } from 'express';
import { DataTypes, Op } from 'sequelize';
import { sequelize } from './db.js';
import { Business, Lead } from './models/index.js';
import { bad, wrap } from './utils/core.js';
import { encryptCredential, decryptCredential } from './whatsapp-merchants.js';
import { WhatsAppMessage, WhatsAppAutoReply, serviceWindowOpen, notifyNewOrderWhatsApp, sendOrderStatusWhatsApp } from './whatsapp-cloud.js';
import { installInboxRoutes } from './whatsapp-inbox.js';
import { parseOrderRef, confirmationText, statusMessage, itemsText } from './whatsapp-orders.js';

export const PROVIDERS = ['meta', '360dialog', 'twilio'];
export const byoBusinessIds = () => (process.env.WHATSAPP_BYO_BUSINESS_IDS || '').split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s));
// WHATSAPP_BYO_ENABLED=true opens the feature for every shop. WHATSAPP_BYO_BUSINESS_IDS is an optional restriction: leave it empty or unset for all shops, or list ids to limit it.
export const byoAllowedFor = id => process.env.WHATSAPP_BYO_ENABLED === 'true' && (byoBusinessIds().length === 0 || byoBusinessIds().includes(String(id)));

export const WhatsAppByoConnection = sequelize.define('WhatsAppByoConnection', {
  businessId: { type: DataTypes.INTEGER, primaryKey: true },
  provider: { type: DataTypes.STRING(20), allowNull: false },
  credCipher: { type: DataTypes.TEXT, allowNull: false },
  secret: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  verifyToken: { type: DataTypes.STRING(64), allowNull: false },
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  sender: { type: DataTypes.STRING(40), allowNull: true },
  templates: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} }
}, { tableName: 'whatsapp_byo_connections' });
let ready;
export const ensureByoSchema = () => (ready ||= WhatsAppByoConnection.sync().catch(e => { ready = null; throw e; }));

const safeEqual = (a, b) => { if (typeof a !== 'string' || typeof b !== 'string') return false; const l = Buffer.from(a), r = Buffer.from(b); return l.length === r.length && timingSafeEqual(l, r); };
const digits = v => String(v || '').replace(/\D/g, '');
// Indian 10-digit mobiles (or 0-prefixed) get the 91 country code so WhatsApp sees full E.164.
const e164 = v => { const d = digits(v); if (/^[6-9]\d{9}$/.test(d)) return `91${d}`; if (/^0[6-9]\d{9}$/.test(d)) return `91${d.slice(1)}`; return d; };
const PHONE = /^[1-9]\d{7,14}$/;
const credsOf = c => { const o = JSON.parse(decryptCredential(c.credCipher, `byo:${c.businessId}`)); if (c.provider === 'twilio') { const u = webhookUrl(c, 'status'); if (u) o.statusCallback = u; } return o; };
export function webhookUrl(conn, kind = '') {
  const base = process.env.WHATSAPP_BYO_PUBLIC_BASE || (process.env.WHATSAPP_WEBHOOK_CALLBACK_URL ? new URL(process.env.WHATSAPP_WEBHOOK_CALLBACK_URL).origin : '');
  return base ? `${base.replace(/\/$/, '')}/api/integrations/whatsapp-byo/${conn.provider}/${conn.secret}${kind === 'status' ? '/status' : ''}` : null;
}
const fail = (msg, code) => { const e = bad(502, msg); e.metaCode = code; return e; };

// ---- adapters: pure request building/parsing, injectable fetcher ----
const metaFormat = {
  text: (to, text) => ({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: false, body: text } }),
  template: (to, name, lang, params) => ({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'template', template: { name, language: { code: lang || 'en' }, components: params?.length ? [{ type: 'body', parameters: params.map(t => ({ type: 'text', text: String(t).slice(0, 1024) })) }] : [] } })
};
export function parseMetaFormat(payload) {
  const out = { messages: [], statuses: [] };
  for (const entry of payload?.entry || []) for (const ch of entry.changes || []) {
    if (ch.field && ch.field !== 'messages') continue;
    for (const m of ch.value?.messages || []) out.messages.push({ id: m.id, from: String(m.from || ''), text: m.type === 'text' ? String(m.text?.body || '') : null, type: m.type || 'unknown', at: new Date(Number(m.timestamp) * 1000) });
    for (const s of ch.value?.statuses || []) out.statuses.push({ id: s.id, status: s.status, code: s.errors?.[0]?.code ? String(s.errors[0].code) : null });
  }
  return out;
}
async function postJson(url, headers, body, fetcher, what) {
  let res; try { res = await fetcher(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) }); } catch { throw fail(`${what} did not respond`); }
  const json = await res.json().catch(() => ({}));
  return { res, json };
}
export const adapters = {
  meta: {
    label: 'Meta Cloud API (your own Meta app)',
    credentialFields: ['accessToken', 'phoneNumberId', 'appSecret'], required: ['accessToken', 'phoneNumberId'],
    senderOf: c => c.phoneNumberId,
    async sendText(c, to, text, fetcher = fetch) {
      const { res, json } = await postJson(`https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || 'v21.0'}/${c.phoneNumberId}/messages`, { authorization: `Bearer ${c.accessToken}` }, metaFormat.text(to, text), fetcher, 'Meta');
      if (!res.ok || !json.messages?.[0]?.id) throw fail('Meta did not accept the message', json.error?.code); return json.messages[0].id;
    },
    async sendTemplate(c, to, t, params, fetcher = fetch) {
      const { res, json } = await postJson(`https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || 'v21.0'}/${c.phoneNumberId}/messages`, { authorization: `Bearer ${c.accessToken}` }, metaFormat.template(to, t.name, t.lang, params), fetcher, 'Meta');
      if (!res.ok || !json.messages?.[0]?.id) throw fail('Meta did not accept the template', json.error?.code); return json.messages[0].id;
    },
    async check(c, fetcher = fetch) {
      const res = await fetcher(`https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || 'v21.0'}/${c.phoneNumberId}?fields=display_phone_number,verified_name`, { headers: { authorization: `Bearer ${c.accessToken}` }, signal: AbortSignal.timeout(15000) });
      const j = await res.json().catch(() => ({})); if (!res.ok) throw fail('Meta rejected this token or phone number ID', j.error?.code); return j.display_phone_number || c.phoneNumberId;
    },
    verify(req, c, conn) { // optional: only if the shop gave us its app secret
      if (!c.appSecret) return true;
      const sig = req.header('x-hub-signature-256') || '';
      return /^sha256=[a-f0-9]{64}$/i.test(sig) && safeEqual(`sha256=${createHmac('sha256', c.appSecret).update(req.rawBody || '').digest('hex')}`, sig);
    },
    parse: req => parseMetaFormat(req.body)
  },
  '360dialog': {
    label: '360dialog',
    credentialFields: ['apiKey'], required: ['apiKey'],
    senderOf: () => '360dialog',
    async sendText(c, to, text, fetcher = fetch) {
      const { res, json } = await postJson('https://waba-v2.360dialog.io/messages', { 'D360-API-KEY': c.apiKey }, metaFormat.text(to, text), fetcher, '360dialog');
      if (!res.ok || !json.messages?.[0]?.id) throw fail('360dialog did not accept the message', json.error?.code || res.status); return json.messages[0].id;
    },
    async sendTemplate(c, to, t, params, fetcher = fetch) {
      const { res, json } = await postJson('https://waba-v2.360dialog.io/messages', { 'D360-API-KEY': c.apiKey }, metaFormat.template(to, t.name, t.lang, params), fetcher, '360dialog');
      if (!res.ok || !json.messages?.[0]?.id) throw fail('360dialog did not accept the template', json.error?.code || res.status); return json.messages[0].id;
    },
    async check(c, fetcher = fetch) {
      const res = await fetcher('https://waba-v2.360dialog.io/configs/webhook', { headers: { 'D360-API-KEY': c.apiKey }, signal: AbortSignal.timeout(15000) });
      if (res.status === 401 || res.status === 403) throw fail('360dialog rejected this API key'); if (res.status >= 500) throw fail('360dialog is not responding'); return '360dialog';
    },
    verify: () => true, // protected by the unguessable per-shop URL
    parse: req => parseMetaFormat(req.body)
  },
  twilio: {
    label: 'Twilio',
    credentialFields: ['accountSid', 'authToken', 'from'], required: ['accountSid', 'authToken', 'from'],
    senderOf: c => c.from,
    async post(c, form, fetcher) {
      let res; try { res = await fetcher(`https://api.twilio.com/2010-04-01/Accounts/${c.accountSid}/Messages.json`, { method: 'POST', headers: { authorization: `Basic ${Buffer.from(`${c.accountSid}:${c.authToken}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(c.statusCallback ? { ...form, StatusCallback: c.statusCallback } : form).toString(), signal: AbortSignal.timeout(15000) }); } catch { throw fail('Twilio did not respond'); }
      const j = await res.json().catch(() => ({})); if (!res.ok || !j.sid) throw fail('Twilio did not accept the message', j.code); return j.sid;
    },
    sendText(c, to, text, fetcher = fetch, mediaUrl = '') { return this.post(c, { From: `whatsapp:+${digits(c.from)}`, To: `whatsapp:+${to}`, Body: text, ...(mediaUrl ? { MediaUrl: mediaUrl } : {}) }, fetcher); },
    sendTemplate(c, to, t, params, fetcher = fetch) { return this.post(c, { From: `whatsapp:+${digits(c.from)}`, To: `whatsapp:+${to}`, ContentSid: t.name, ContentVariables: JSON.stringify(Object.fromEntries((params || []).map((p, i) => [String(i + 1), String(p)]))) }, fetcher); },
    async check(c, fetcher = fetch) {
      const res = await fetcher(`https://api.twilio.com/2010-04-01/Accounts/${c.accountSid}.json`, { headers: { authorization: `Basic ${Buffer.from(`${c.accountSid}:${c.authToken}`).toString('base64')}` }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw fail('Twilio rejected this Account SID or Auth Token'); return c.from;
    },
    verify(req, c, conn, kind) { // X-Twilio-Signature: base64 HMAC-SHA1 of the exact URL + sorted POST params
      const sig = req.header('x-twilio-signature'); const url = webhookUrl(conn, kind); if (!sig || !url) return false;
      // Twilio signs the exact URL it was given: accept the shop's own URL on any host that reaches this service.
      const path = new URL(url).pathname, hosts = new Set([new URL(url).origin, 'https://digital-dukaan-api.onrender.com', 'https://api.digitalshop.website']);
      const fh = String(req.header('x-forwarded-host') || req.header('host') || '').split(',')[0].trim(); if (/^[a-z0-9.-]+(:\d+)?$/i.test(fh)) hosts.add(`https://${fh}`);
      return [...hosts].some(h => safeEqual(twilioSignature(c.authToken, h + path, req.body || {}), sig));
    },
    parse(req) {
      const b = req.body || {}, out = { messages: [], statuses: [] };
      if (b.Body !== undefined && b.MessageSid && b.From) out.messages.push({ id: b.MessageSid, from: digits(String(b.From).replace('whatsapp:', '')), text: String(b.Body), type: Number(b.NumMedia) > 0 && !b.Body ? 'media' : 'text', at: new Date() });
      else if (b.MessageSid && b.MessageStatus) out.statuses.push({ id: b.MessageSid, status: { delivered: 'delivered', read: 'read', failed: 'failed', undelivered: 'failed', sent: 'sent', queued: 'sent' }[b.MessageStatus] || null, code: b.ErrorCode ? String(b.ErrorCode) : null });
      return out;
    }
  }
};
export const twilioSignature = (token, url, params) => createHmac('sha1', token).update(url + Object.keys(params).sort().map(k => k + params[k]).join('')).digest('base64');

// ---- connection lookup ----
export async function activeConnection(businessId) {
  if (!byoAllowedFor(businessId)) return null;
  await ensureByoSchema();
  const c = await WhatsAppByoConnection.findByPk(businessId);
  return c?.enabled ? c : null;
}
// ---- sending with a stored record (idempotent by key, never auto-retried) ----
async function recordSend(conn, businessId, phone, text, key, messageType, run) {
  await ensureByoSchema();
  const [record, created] = await WhatsAppMessage.findOrCreate({ where: { requestKey: String(key).slice(0, 100) }, defaults: { businessId, phoneNumberId: `byo:${conn.provider}`.slice(0, 40), direction: 'outbound', phone, text, messageType, eventAt: new Date(), status: 'submitting' } });
  if (!created) return false;
  try { const messageId = await run(); await record.update({ messageId, status: 'accepted' }); return true; }
  catch (err) { await record.update({ status: err.metaCode ? 'failed' : 'unknown', errorCode: err.metaCode ? String(err.metaCode).slice(0, 30) : null }); return false; }
}
// A skipped send is recorded so the shop can see why nothing went out (never silent).
async function recordSkip(conn, businessId, phone, text, key, reason) {
  try {
    await ensureByoSchema();
    const [rec, created] = await WhatsAppMessage.findOrCreate({ where: { requestKey: `${String(key).slice(0, 80)}:skip` }, defaults: { businessId, phoneNumberId: `byo:${conn.provider}`.slice(0, 40), direction: 'outbound', phone: String(phone || '').slice(0, 30), text, messageType: 'skipped', eventAt: new Date(), status: 'skipped', errorCode: reason } });
    if (!created) await rec.update({ eventAt: new Date(), errorCode: reason });
  } catch { /* diagnostics only */ }
  return false;
}
export const byoSendText = (conn, businessId, phone, text, key, fetcher = fetch, mediaUrl = '') =>
  recordSend(conn, businessId, phone, text, key, 'text', () => adapters[conn.provider].sendText(credsOf(conn), phone, text, fetcher, mediaUrl));
// The shop's own image (cover, else logo) as a hosted https URL; session messages only.
export const storeImageUrl = store => [store?.notifyImageUrl, store?.coverUrl, store?.logoUrl].find(u => /^https:\/\/[^\s]+$/.test(String(u || ''))) || '';
// Free text if the customer wrote in the last 24h, else the shop's approved template for this event, else nothing.
export async function byoSendOrTemplate(conn, businessId, phone, text, key, templateKey, params, fetcher = fetch, mediaUrl = '') {
  if (!PHONE.test(String(phone || ''))) return recordSkip(conn, businessId, phone, text, key, 'bad_phone');
  const latest = await WhatsAppMessage.findOne({ where: { businessId, phone, direction: 'inbound' }, order: [['eventAt', 'DESC']] });
  if (latest && serviceWindowOpen(latest.eventAt)) return byoSendText(conn, businessId, phone, text, key, fetcher, mediaUrl);
  const t = conn.templates?.[templateKey]; if (!t?.name) return recordSkip(conn, businessId, phone, text, key, 'no_window_no_template');
  return recordSend(conn, businessId, phone, text, key, 'template', () => adapters[conn.provider].sendTemplate(credsOf(conn), phone, { name: t.name, lang: t.lang || 'en' }, params, fetcher));
}
// ---- order notifications (dispatch: own connection if ON, else the existing shared path) ----
export async function notifyNewOrder(store, lead, fetcher = fetch) {
  let conn = null; try { conn = await activeConnection(store.id); } catch { /* fall through */ }
  if (!conn) return notifyNewOrderWhatsApp(store, lead, fetcher);
  try {
    const ref = `DD-${lead.id}`, items = itemsText(lead), total = `Rs.${Number(lead.price || 0).toFixed(2)}`;
    const owner = e164(store.notifySettings?.ownerPhone), cust = e164(lead.customerPhone), jobs = [];
    if (owner) jobs.push(byoSendOrTemplate(conn, store.id, owner, `New order ${ref} at ${store.name}: ${items}, ${total}. Open your dashboard to review it.`, `byo:alert:${store.id}:${lead.id}`, 'orderAlert', [ref, items, total], fetcher));
    if (cust) jobs.push(byoSendOrTemplate(conn, store.id, cust, confirmationText(store, lead), `byo:confirm:${store.id}:${lead.id}`, 'orderConfirm', [store.name, ref, total], fetcher, storeImageUrl(store)));
    await Promise.all(jobs); return true;
  } catch { return false; }
}
export async function sendOrderStatus(store, lead, status, fetcher = fetch) {
  let conn = null; try { conn = await activeConnection(store.id); } catch { /* fall through */ }
  if (!conn) return sendOrderStatusWhatsApp(store, lead, status, fetcher);
  try {
    const msg = status && statusMessage(store, lead, status); const phone = e164(lead.customerPhone);
    if (!msg || !PHONE.test(phone)) return false;
    return await byoSendOrTemplate(conn, store.id, phone, msg, `byo:status:${store.id}:${lead.id}:${status}`, 'orderStatus', [`DD-${lead.id}`, status], fetcher, storeImageUrl(store));
  } catch { return false; }
}
// ---- inbound ----
const AUTO_REPLY_COOLDOWN_MS = 12 * 60 * 60 * 1000;
async function orderBotByo(conn, businessId, m, fetcher) {
  const id = parseOrderRef(m.text); if (!id) return false;
  const lead = await Lead.findOne({ where: { id, businessId } });
  if (!lead || Date.now() - new Date(lead.createdAt).getTime() > 24 * 60 * 60 * 1000) return false;
  const store = await Business.findByPk(businessId); if (!store || store.deletedAt) return false;
  if (!lead.customerPhone) await lead.update({ customerPhone: m.from });
  return byoSendText(conn, businessId, m.from, confirmationText(store, lead), `byo:botconfirm:${businessId}:${lead.id}`, fetcher);
}
async function autoReplyByo(conn, businessId, m, fetcher) {
  const cfg = await WhatsAppAutoReply.findByPk(businessId); const text = String(cfg?.text || '').trim();
  if (!cfg?.enabled || !text || !serviceWindowOpen(m.at)) return false;
  const recent = await WhatsAppMessage.findOne({ where: { businessId, phone: m.from, direction: 'outbound', requestKey: { [Op.like]: 'byoauto:%' }, eventAt: { [Op.gt]: new Date(Date.now() - AUTO_REPLY_COOLDOWN_MS) } } });
  if (recent) return false;
  return byoSendText(conn, businessId, m.from, text, `byoauto:${businessId}:${m.id}`, fetcher);
}
const RANK = { submitting: 0, unknown: 0, accepted: 1, sent: 2, delivered: 3, read: 4, failed: 1 };
export async function processInbound(conn, parsed, fetcher = fetch) {
  const businessId = conn.businessId;
  await WhatsAppMessage.sync();
  for (const m of parsed.messages) {
    if (!m.id || !PHONE.test(m.from) || !Number.isFinite(m.at?.getTime()) || m.at.getTime() > Date.now() + 60000) continue;
    const text = m.text !== null && m.text !== undefined ? String(m.text).slice(0, 4096) : `[Unsupported message: ${String(m.type || 'unknown').slice(0, 20)}]`;
    const [, created] = await WhatsAppMessage.findOrCreate({ where: { messageId: String(m.id).slice(0, 255) }, defaults: { businessId, phoneNumberId: `byo:${conn.provider}`.slice(0, 40), direction: 'inbound', phone: m.from, text, messageType: m.text !== null && m.text !== undefined ? 'text' : 'unsupported', eventAt: m.at, status: 'received' } });
    if (!created) continue;
    try { const handled = m.text && await orderBotByo(conn, businessId, m, fetcher); if (!handled) await autoReplyByo(conn, businessId, m, fetcher); } catch { /* never fail the webhook */ }
  }
  for (const s of parsed.statuses) {
    if (!s.id || !['sent', 'delivered', 'read', 'failed'].includes(s.status)) continue;
    const rec = await WhatsAppMessage.findOne({ where: { messageId: String(s.id), businessId, direction: 'outbound' } });
    if (rec && (RANK[s.status] || 0) >= (RANK[rec.status] || 0)) await rec.update({ status: s.status, errorCode: s.code ? s.code.slice(0, 30) : null });
  }
}
// ---- public webhook ----
export const byoWebhook = Router();
const keep = (req, res, buf) => { req.rawBody = buf; };
byoWebhook.use(express.json({ limit: '200kb', verify: keep }), express.urlencoded({ extended: false, limit: '200kb', verify: keep }));
async function connBySecret(provider, secret) {
  if (process.env.WHATSAPP_BYO_ENABLED !== 'true' || !PROVIDERS.includes(provider) || !/^[a-f0-9]{48}$/.test(String(secret || ''))) return null;
  await ensureByoSchema();
  const c = await WhatsAppByoConnection.findOne({ where: { secret, provider } });
  return c && byoAllowedFor(c.businessId) ? c : null;
}
byoWebhook.get('/:provider/:secret', wrap(async (req, res) => { // Meta-style subscription check
  const c = await connBySecret(req.params.provider, req.params.secret);
  if (!c || req.query['hub.mode'] !== 'subscribe' || !safeEqual(String(req.query['hub.verify_token'] || ''), c.verifyToken)) return res.sendStatus(403);
  res.type('text/plain').send(String(req.query['hub.challenge'] || ''));
}));
async function handleWebhook(req, res, kind) {
  const c = await connBySecret(req.params.provider, req.params.secret);
  if (!c) return res.sendStatus(404);
  let creds; try { creds = credsOf(c); } catch { return res.sendStatus(503); }
  const a = adapters[c.provider];
  if (!a.verify(req, creds, c, kind)) { console.warn(`[byo-webhook] ${c.provider} ${kind || 'inbound'} rejected: bad signature (shop ${c.businessId}, has-signature=${Boolean(req.header('x-twilio-signature'))})`); return res.sendStatus(403); }
  console.log(`[byo-webhook] ${c.provider} ${kind || 'inbound'} accepted (shop ${c.businessId})`);
  const parsed = a.parse(req);
  if (kind === 'status') await processInbound(c, { messages: [], statuses: parsed.statuses }); // delivery updates only, kept even when the shop is OFF
  else await processInbound(c, c.enabled ? parsed : { messages: [], statuses: parsed.statuses });
  res.sendStatus(200);
}
byoWebhook.post('/:provider/:secret', wrap((req, res) => handleWebhook(req, res, '')));
byoWebhook.post('/:provider/:secret/status', wrap((req, res) => handleWebhook(req, res, 'status')));

// ---- owner routes (mounted at /api/owner/:storeId/whatsapp-byo) ----
export const TEMPLATE_GUIDE = [
  { key: 'orderConfirm', event: 'Order confirmation to the customer', body: 'Thanks for ordering from {{1}}! Your order {{2}} is confirmed. Total: {{3}}. We will update you here as it moves.', params: 'store name, order ref, total' },
  { key: 'orderAlert', event: 'New order alert to you (owner)', body: 'New order {{1}}: {{2}}. Total: {{3}}. Open your Digital Shop dashboard to review it.', params: 'order ref, items, total' },
  { key: 'orderStatus', event: 'Order status update to the customer', body: 'Update on your order {{1}}: {{2}}.', params: 'order ref, status' }
];
export const byoOwnerRoutes = Router({ mergeParams: true });
byoOwnerRoutes.use((req, res, next) => byoAllowedFor(req.store?.id) ? next() : res.status(404).json({ error: 'Integration not available for this shop' }));
const ownerOnly = (req, res, next) => req.user?.role === 'owner' ? next() : res.status(403).json({ error: 'Only the shop owner can manage the WhatsApp connection' });
const view = c => c ? { connected: true, provider: c.provider, enabled: c.enabled, sender: c.sender, webhookUrl: webhookUrl(c), statusUrl: c.provider === 'twilio' ? webhookUrl(c, 'status') : undefined, verifyToken: c.provider === 'meta' ? c.verifyToken : undefined, templates: c.templates || {} } : { connected: false };
const base = { providers: PROVIDERS.map(p => ({ id: p, label: adapters[p].label, fields: adapters[p].credentialFields, required: adapters[p].required })), guide: TEMPLATE_GUIDE };
byoOwnerRoutes.get('/status', wrap(async (req, res) => {
  await ensureByoSchema(); const c = await WhatsAppByoConnection.findByPk(req.store.id); let lastSend = null;
  if (c) { const m = await WhatsAppMessage.findOne({ where: { businessId: req.store.id, direction: 'outbound', phoneNumberId: `byo:${c.provider}` }, order: [['eventAt', 'DESC']] }); if (m) lastSend = { status: m.status, reason: m.errorCode || null, at: m.eventAt, kind: m.messageType, to: String(m.phone || '').replace(/\d(?=\d{3})/g, '*') }; }
  res.json({ ...base, ...view(c), lastSend });
}));
function cleanTemplates(input) {
  const out = {};
  for (const k of ['orderConfirm', 'orderAlert', 'orderStatus']) { const t = input?.[k]; if (t && typeof t.name === 'string' && t.name.trim()) { const name = t.name.trim(); if (name.length > 80 || /\s/.test(name)) throw bad(400, 'Template names cannot contain spaces'); const lang = typeof t.lang === 'string' && /^[a-z]{2}(_[A-Z]{2})?$/.test(t.lang) ? t.lang : 'en'; out[k] = { name, lang }; } }
  return out;
}
byoOwnerRoutes.put('/connection', ownerOnly, wrap(async (req, res) => {
  const { provider, credentials, templates } = req.body || {};
  if (!PROVIDERS.includes(provider) || typeof credentials !== 'object' || !credentials) throw bad(400, 'Choose a provider and enter its details');
  const a = adapters[provider], cleaned = {};
  const existing = await (await ensureByoSchema(), WhatsAppByoConnection.findByPk(req.store.id));
  const prior = existing && existing.provider === provider ? credsOf(existing) : {};
  for (const f of a.credentialFields) { const v = credentials[f]; cleaned[f] = typeof v === 'string' && v.trim() ? v.trim().slice(0, 500) : (prior[f] || ''); }
  for (const f of a.required) if (!cleaned[f]) throw bad(400, 'Fill in all required fields');
  if (provider === 'twilio' && !/^\+?[1-9]\d{7,14}$/.test(cleaned.from.replace(/^whatsapp:/, '').replace(/\s/g, ''))) throw bad(400, 'Twilio WhatsApp number must be in +91... format');
  if (provider === 'twilio') cleaned.from = cleaned.from.replace(/^whatsapp:/, '').replace(/\s/g, '');
  if (provider === 'meta' && !/^\d{5,25}$/.test(cleaned.phoneNumberId)) throw bad(400, 'Phone number ID must be digits only');
  let sender; try { sender = await a.check(cleaned); } catch (e) { throw bad(400, e.message); }
  const row = { businessId: req.store.id, provider, credCipher: encryptCredential(JSON.stringify(cleaned), `byo:${req.store.id}`), sender: String(sender || '').slice(0, 40), templates: cleanTemplates(templates) };
  if (existing && existing.provider === provider) await existing.update({ ...row, enabled: existing.enabled });
  else { if (existing) await existing.destroy(); await WhatsAppByoConnection.create({ ...row, secret: randomBytes(24).toString('hex'), verifyToken: randomBytes(16).toString('hex'), enabled: false }); }
  res.json({ ...base, ...view(await WhatsAppByoConnection.findByPk(req.store.id)) });
}));
byoOwnerRoutes.post('/toggle', ownerOnly, wrap(async (req, res) => {
  await ensureByoSchema(); const c = await WhatsAppByoConnection.findByPk(req.store.id);
  if (!c) throw bad(404, 'Connect a provider first'); if (typeof req.body?.enabled !== 'boolean') throw bad(400, 'enabled must be true or false');
  await c.update({ enabled: req.body.enabled }); res.json({ ...base, ...view(c) });
}));
byoOwnerRoutes.delete('/connection', ownerOnly, wrap(async (req, res) => {
  await ensureByoSchema(); await WhatsAppByoConnection.destroy({ where: { businessId: req.store.id } }); res.json({ ...base, connected: false });
}));
byoOwnerRoutes.get('/auto-reply', ownerOnly, wrap(async (req, res) => { const c = await WhatsAppAutoReply.findByPk(req.store.id); res.json({ enabled: Boolean(c?.enabled), text: c?.text || '' }); }));
byoOwnerRoutes.put('/auto-reply', ownerOnly, wrap(async (req, res) => {
  const { enabled: on, text } = req.body || {};
  if (typeof on !== 'boolean' || typeof text !== 'string' || text.length > 1000 || (on && !text.trim())) throw bad(400, 'Turn on needs a reply text of up to 1000 characters');
  await WhatsAppAutoReply.sync(); await WhatsAppAutoReply.upsert({ businessId: req.store.id, enabled: on, text: text.trim() }); res.json({ enabled: on, text: text.trim() });
}));
installInboxRoutes(byoOwnerRoutes, { WhatsAppMessage, Lead, ensureSchema: () => WhatsAppMessage.sync(), merchantConnection: id => activeConnection(id), wrap, bad });
byoOwnerRoutes.post('/send', wrap(async (req, res) => {
  const conn = await activeConnection(req.store.id); if (!conn) throw bad(503, 'Switch your connection ON first');
  const { to, text, requestId } = req.body || {};
  if (typeof to !== 'string' || !PHONE.test(to) || typeof text !== 'string' || !text.trim() || text.length > 4096 || typeof requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(requestId)) throw bad(400, 'Valid phone, text and request ID required');
  const latest = await WhatsAppMessage.findOne({ where: { businessId: req.store.id, phone: to, direction: 'inbound' }, order: [['eventAt', 'DESC']] });
  if (!latest || !serviceWindowOpen(latest.eventAt)) throw bad(409, 'Ask the customer to message first. Free replies need an open 24-hour window.');
  const key = `byo:send:${req.store.id}:${requestId}`; if (await WhatsAppMessage.findOne({ where: { requestKey: key.slice(0, 100) } })) return res.json({ duplicate: true });
  const ok = await byoSendText(conn, req.store.id, to, text.trim(), key);
  if (!ok) throw bad(502, 'Message was not confirmed. Check the inbox before retrying.');
  res.status(201).json({ ok: true });
}));
