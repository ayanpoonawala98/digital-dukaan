import { Router, raw } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { DataTypes, Op } from 'sequelize';
import { sequelize } from '../../config/db.js';
import { bad, wrap } from '../../shared/utils/core.js';
import { merchantConnection, connectionForEvent, connectionToken, signupConfig, installSignupRoutes, legacyConnection } from './whatsapp-merchants.js';
import { Lead, Business } from '../../models/index.js';
import { installInboxRoutes } from './whatsapp-inbox.js';
import { orderBotEnabledFor, parseOrderRef, confirmationText, statusMessage, itemsText } from './whatsapp-orders.js';

export const WhatsAppMessage = sequelize.define('WhatsAppMessage', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  businessId: { type: DataTypes.INTEGER, allowNull: false },
  phoneNumberId: { type: DataTypes.STRING(40), allowNull: false },
  messageId: { type: DataTypes.STRING(255), unique: true, allowNull: true },
  requestKey: { type: DataTypes.STRING(100), unique: true, allowNull: true },
  direction: { type: DataTypes.STRING(10), allowNull: false },
  phone: { type: DataTypes.STRING(15), allowNull: false },
  text: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
  messageType: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'text' },
  eventAt: { type: DataTypes.DATE, allowNull: false },
  status: { type: DataTypes.STRING(30), allowNull: false },
  errorCode: { type: DataTypes.STRING(30), allowNull: true }
}, { tableName: 'whatsapp_messages', indexes: [{fields:['businessId','phone','eventAt']}] });
export const WhatsAppAutoReply = sequelize.define('WhatsAppAutoReply', {
  businessId: { type: DataTypes.INTEGER, primaryKey: true },
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  text: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' }
}, { tableName: 'whatsapp_auto_replies' });
let schemaReady;
let autoReplySchemaReady;
async function ensureAutoReplySchema() {
  await ensureSchema();
  if (!autoReplySchemaReady) autoReplySchemaReady = WhatsAppAutoReply.sync().catch(e=>{autoReplySchemaReady=null;throw e;});
  return autoReplySchemaReady;
}
async function ensureSchema() {
  if (!schemaReady) schemaReady = WhatsAppMessage.sync().catch(e=>{schemaReady=null;throw e;});
  await schemaReady;
}
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
whatsappWebhook.post('/', raw({ type: 'application/json', limit: '100kb' }), wrap(async (req, res) => {
  if (!enabled() || !Buffer.isBuffer(req.body) || !verifyMetaSignature(req.body, req.header('x-hub-signature-256'), process.env.META_APP_SECRET)) return res.sendStatus(403);
  let payload;
  try { payload = JSON.parse(req.body.toString('utf8')); } catch { return res.sendStatus(400); }
  if (payload.object !== 'whatsapp_business_account') return res.sendStatus(400);
  await persistWhatsAppEvents(payload);
  res.sendStatus(200);
}));

const bound = () => /^\d+$/.test(process.env.WHATSAPP_INTEGRATION_BUSINESS_ID || '') && /^\d+$/.test(process.env.WHATSAPP_PHONE_NUMBER_ID || '');
const outbound = () => enabled() && bound() && process.env.WHATSAPP_OUTBOUND_ENABLED === 'true' && Boolean(process.env.WHATSAPP_ACCESS_TOKEN) && /^v\d+\.0$/.test(process.env.WHATSAPP_GRAPH_VERSION || '');
export function serviceWindowOpen(date, now = Date.now()) {
  const t = new Date(date).getTime();
  return Number.isFinite(t) && t <= now && now - t < 24 * 60 * 60 * 1000;
}
const AUTO_REPLY_COOLDOWN_MS = 12 * 60 * 60 * 1000;
// Owner-configured, opt-in (off by default). Replies once per customer per 12 hours, only inside the free 24-hour window,
// never throws into the webhook, and never retries (Meta may have accepted a request before a timeout).
export async function maybeAutoReply({connection,businessId,phoneNumberId,phone,inboundId,eventAt,fetcher=fetch}) {
  try {
    if (!enabled() || process.env.WHATSAPP_OUTBOUND_ENABLED !== 'true' || !/^v\d+\.0$/.test(process.env.WHATSAPP_GRAPH_VERSION || '')) return false;
    await ensureAutoReplySchema();
    const cfg = await WhatsAppAutoReply.findByPk(businessId);
    const text = String(cfg?.text || '').trim();
    if (!cfg?.enabled || !text || !serviceWindowOpen(eventAt)) return false;
    const recent = await WhatsAppMessage.findOne({where:{businessId,phone,direction:'outbound',requestKey:{[Op.like]:'auto:%'},eventAt:{[Op.gt]:new Date(Date.now()-AUTO_REPLY_COOLDOWN_MS)}}});
    if (recent) return false;
    const [record,created] = await WhatsAppMessage.findOrCreate({where:{requestKey:`auto:${businessId}:${inboundId}`.slice(0,100)},defaults:{businessId,phoneNumberId,direction:'outbound',phone,text,eventAt:new Date(),status:'submitting'}});
    if (!created) return false;
    try {
      const messageId = await sendCloudText(phone,text,fetcher,connection);
      await record.update({messageId,status:'accepted'});
      return true;
    } catch (err) {
      await record.update({status:err.metaCode ? 'failed' : 'unknown',errorCode:err.metaCode ? String(err.metaCode) : null});
      return false;
    }
  } catch { return false; }
}
const coexistenceOn = () => process.env.WHATSAPP_COEXISTENCE_ENABLED === 'true';
export async function sendCloudTemplate(to, name, lang, params, fetcher = fetch, connection = legacyConnection()) {
  if (!connection) throw bad(503, 'No connected sender');
  const components = params?.length ? [{ type: 'body', parameters: params.map(text => ({ type: 'text', text: String(text).slice(0, 1024) })) }] : [];
  const result = await fetcher(`https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION}/${connection.phoneNumberId}/messages`, { method: 'POST', headers: { authorization: `Bearer ${connectionToken(connection)}`, 'content-type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'template', template: { name, language: { code: lang || 'en' }, components } }), signal: AbortSignal.timeout(15000) });
  const body = await result.json().catch(() => ({}));
  if (!result.ok || !body.messages?.[0]?.id) { const err = bad(502, 'Meta did not accept the template'); err.metaCode = body.error?.code; console.error('[wa-template]', name, lang || 'en', body.error?.code, body.error?.error_data?.details || body.error?.message || ''); throw err; }
  return body.messages[0].id;
}
const canSend = connection => Boolean(connection) && enabled() && process.env.WHATSAPP_OUTBOUND_ENABLED === 'true' && /^v\d+\.0$/.test(process.env.WHATSAPP_GRAPH_VERSION || '');
async function sendOnce({ connection, businessId, phone, text, key, fetcher }) {
  const [record, created] = await WhatsAppMessage.findOrCreate({ where: { requestKey: key.slice(0, 100) }, defaults: { businessId, phoneNumberId: connection.phoneNumberId, direction: 'outbound', phone, text, eventAt: new Date(), status: 'submitting' } });
  if (!created) return false;
  try {
    const messageId = await sendCloudText(phone, text, fetcher, connection);
    await record.update({ messageId, status: 'accepted' });
    return true;
  } catch (err) {
    await record.update({ status: err.metaCode ? 'failed' : 'unknown', errorCode: err.metaCode ? String(err.metaCode) : null });
    return false;
  }
}
// Customer messaged with "Order ref: DD-<id>": link the phone to the order and send a confirmation.
// Free text is allowed because the customer just messaged us (24-hour window is open).
export async function orderBot({ connection, businessId, phone, text, eventAt, fetcher = fetch }) {
  try {
    if (!orderBotEnabledFor(businessId) || !canSend(connection) || !serviceWindowOpen(eventAt)) return false;
    const id = parseOrderRef(text);
    if (!id) return false;
    const lead = await Lead.findOne({ where: { id, businessId } });
    if (!lead || Date.now() - new Date(lead.createdAt).getTime() > 24 * 60 * 60 * 1000) return false;
    const store = await Business.findByPk(businessId);
    if (!store || store.deletedAt) return false;
    if (!lead.customerPhone) await lead.update({ customerPhone: phone });
    return await sendOnce({ connection, businessId, phone, text: confirmationText(store, lead), key: `bot:confirm:${businessId}:${lead.id}`, fetcher });
  } catch { return false; }
}
// Generic bot send: free text if the 24h window is open, else the named approved template (env), else nothing.
async function botSend(store, phone, text, key, templateEnv, params, fetcher) {
  const connection = await merchantConnection(store.id);
  if (!canSend(connection) || !/^[1-9]\d{7,14}$/.test(String(phone || ''))) return false;
  await ensureSchema();
  const latest = await WhatsAppMessage.findOne({ where: { businessId: store.id, phone, direction: 'inbound' }, order: [['eventAt', 'DESC']] });
  if (latest && serviceWindowOpen(latest.eventAt)) return sendOnce({ connection, businessId: store.id, phone, text, key, fetcher });
  const template = process.env[templateEnv];
  if (!template) return false;
  const [record, created] = await WhatsAppMessage.findOrCreate({ where: { requestKey: key.slice(0, 100) }, defaults: { businessId: store.id, phoneNumberId: connection.phoneNumberId, direction: 'outbound', phone, text, messageType: 'template', eventAt: new Date(), status: 'submitting' } });
  if (!created) return false;
  try { const messageId = await sendCloudTemplate(phone, template, process.env.WHATSAPP_TEMPLATE_LANG || 'en', params, fetcher, connection); await record.update({ messageId, status: 'accepted' }); return true; }
  catch (err) { await record.update({ status: err.metaCode ? 'failed' : 'unknown', errorCode: err.metaCode ? String(err.metaCode) : null }); return false; }
}
// New order: alert the owner (notify settings ownerPhone) and confirm to the customer if their phone is known.
export async function notifyNewOrderWhatsApp(store, lead, fetcher = fetch) {
  try {
    if (!orderBotEnabledFor(store.id)) return false;
    const ref = `DD-${lead.id}`, items = itemsText(lead), total = `Rs.${Number(lead.price || 0).toFixed(2)}`;
    let owner = String(store.notifySettings?.ownerPhone || '').replace(/\D/g, '');
    if (owner.length === 10) owner = `91${owner}`; else if (owner.length === 11 && owner.startsWith('0')) owner = `91${owner.slice(1)}`;
    const jobs = [];
    if (owner) jobs.push(botSend(store, owner, `New order ${ref} at ${store.name}: ${items}, ${total}. Open your dashboard to review it.`, `bot:alert:${store.id}:${lead.id}`, 'WHATSAPP_TEMPLATE_ORDER_ALERT', [ref, items, total], fetcher));
    const cust = String(lead.customerPhone || '').replace(/\D/g, '');
    if (cust) jobs.push(botSend(store, cust, confirmationText(store, lead), `bot:confirm:${store.id}:${lead.id}`, 'WHATSAPP_TEMPLATE_ORDER_CONFIRM', [store.name, ref, total], fetcher));
    await Promise.all(jobs);
    return true;
  } catch { return false; }
}
// Status update to the customer. Free text inside the 24-hour window, else an approved template
// (WHATSAPP_TEMPLATE_ORDER_STATUS, body params: order ref, status) if configured, else nothing.
export async function sendOrderStatusWhatsApp(store, lead, status, fetcher = fetch) {
  try {
    if (!orderBotEnabledFor(store.id) || !status || !/^[1-9]\d{7,14}$/.test(String(lead.customerPhone || ''))) return false;
    const connection = await merchantConnection(store.id);
    if (!canSend(connection)) return false;
    const msg = statusMessage(store, lead, status);
    if (!msg) return false;
    await ensureSchema();
    const phone = String(lead.customerPhone);
    const latest = await WhatsAppMessage.findOne({ where: { businessId: store.id, phone, direction: 'inbound' }, order: [['eventAt', 'DESC']] });
    const key = `bot:status:${store.id}:${lead.id}:${status}`;
    if (latest && serviceWindowOpen(latest.eventAt)) return await sendOnce({ connection, businessId: store.id, phone, text: msg, key, fetcher });
    const template = process.env.WHATSAPP_TEMPLATE_ORDER_STATUS;
    if (!template) return false;
    const [record, created] = await WhatsAppMessage.findOrCreate({ where: { requestKey: key.slice(0, 100) }, defaults: { businessId: store.id, phoneNumberId: connection.phoneNumberId, direction: 'outbound', phone, text: msg, messageType: 'template', eventAt: new Date(), status: 'submitting' } });
    if (!created) return false;
    try { const messageId = await sendCloudTemplate(phone, template, process.env.WHATSAPP_TEMPLATE_LANG || 'en', [`DD-${lead.id}`, status], fetcher, connection); await record.update({ messageId, status: 'accepted' }); return true; }
    catch (err) { await record.update({ status: err.metaCode ? 'failed' : 'unknown', errorCode: err.metaCode ? String(err.metaCode) : null }); return false; }
  } catch { return false; }
}
export async function persistWhatsAppEvents(payload) {
  if (!bound() && process.env.WHATSAPP_MULTI_MERCHANT_ENABLED!=='true') return;
  await ensureSchema();
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value?.metadata?.phone_number_id) continue;
      if (change.field === 'smb_message_echoes' && coexistenceOn()) {
        // Messages the shop sent from its own WhatsApp Business app: mirror them into the inbox.
        const echoConn = await connectionForEvent(entry.id, value.metadata.phone_number_id);
        if (!echoConn) continue;
        for (const m of value.message_echoes || []) {
          const at = new Date(Number(m.timestamp) * 1000);
          if (!m.id || !/^[1-9]\d{7,14}$/.test(String(m.to || '')) || !Number.isFinite(at.getTime())) continue;
          await WhatsAppMessage.findOrCreate({ where: { messageId: m.id }, defaults: { businessId: echoConn.businessId, phoneNumberId: echoConn.phoneNumberId, direction: 'outbound', phone: String(m.to), text: m.type === 'text' ? String(m.text?.body || '').slice(0, 4096) : '[Message sent from the WhatsApp Business app: ' + String(m.type || 'unknown').slice(0, 30) + ']', messageType: String(m.type || 'unknown').slice(0, 30), eventAt: at, status: 'sent' } });
        }
        continue;
      }
      // history and smb_app_state_sync are acknowledged and not stored yet.
      if (change.field !== 'messages') continue;
      const connection=await connectionForEvent(entry.id,value.metadata.phone_number_id);
      if(!connection)continue;
      const {businessId,phoneNumberId}=connection;
      for (const message of value.messages || []) {
        const eventAt = new Date(Number(message.timestamp) * 1000);
        if (!message.id || !/^[1-9]\d{7,14}$/.test(message.from || '') || !Number.isFinite(eventAt.getTime()) || eventAt.getTime() > Date.now() + 60000) continue;
        const [inboundRecord,inboundCreated]=await WhatsAppMessage.findOrCreate({where:{messageId:message.id}, defaults:{businessId,phoneNumberId,direction:'inbound',phone:message.from,text:message.type === 'text' ? String(message.text?.body || '').slice(0,4096) : '[Unsupported message: ' + String(message.type || 'unknown').slice(0,30) + ']',messageType:String(message.type || 'unknown').slice(0,30),eventAt,status:'received'}});
        if (inboundCreated) { const handled = message.type === 'text' && await orderBot({connection,businessId,phone:message.from,text:message.text?.body,eventAt}); if (!handled) await maybeAutoReply({connection,businessId,phoneNumberId,phone:message.from,inboundId:message.id,eventAt}); }
      }
      for (const status of value.statuses || []) {
        const record = await WhatsAppMessage.findOne({where:{messageId:status.id,businessId,direction:'outbound'}});
        if (!record || !['sent','delivered','read','failed'].includes(status.status)) continue;
        const rank = {submitting:0,unknown:0,accepted:1,sent:2,delivered:3,read:4,failed:1};
        if ((rank[status.status] || 0) >= (rank[record.status] || 0)) await record.update({status:status.status,errorCode:status.errors?.[0]?.code ? String(status.errors[0].code) : null});
      }
    }
  }
}
export async function sendCloudText(to, text, fetcher = fetch, connection = legacyConnection()) {
  if(!connection)throw bad(503,'No connected sender');
  const result = await fetcher(`https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION}/${connection.phoneNumberId}/messages`, {method:'POST',headers:{authorization:`Bearer ${connectionToken(connection)}`,'content-type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to,type:'text',text:{body:text,preview_url:false}}),signal:AbortSignal.timeout(15000)});
  const body = await result.json().catch(()=>({}));
  if (!result.ok || !body.messages?.[0]?.id) { const err = bad(502,'Meta did not accept the message'); err.metaCode = body.error?.code; throw err; }
  return body.messages[0].id;
}
export const whatsappCloudOwnerRoutes = Router();
whatsappCloudOwnerRoutes.use((req,res,next) => {
  if (process.env.WHATSAPP_INTEGRATION_UI_ENABLED !== 'true' || (process.env.WHATSAPP_MULTI_MERCHANT_ENABLED !== 'true' && (String(req.store?.ownerId) !== String(process.env.WHATSAPP_INTEGRATION_OWNER_ID || '') || (bound() && String(req.store?.id) !== String(process.env.WHATSAPP_INTEGRATION_BUSINESS_ID))))) return res.status(404).json({error:'Integration not available for this shop'});
  next();
});
export function integrationStatus() {
  return {mode:'production',cloudEnabled:enabled(),outboundEnabled:outbound(),testSendEnabled:false,broadcastEnabled:false,callback:process.env.WHATSAPP_WEBHOOK_CALLBACK_URL || null,webhookConfigured:Boolean(process.env.META_APP_SECRET && process.env.WHATSAPP_VERIFY_TOKEN),merchantConnected:bound(),inboxEnabled:enabled() && bound(),sender:bound() ? process.env.WHATSAPP_DISPLAY_PHONE || null : null};
}
installSignupRoutes(whatsappCloudOwnerRoutes);
export function merchantStatus(connection) {
  const connected=connection?.state==='connected',expired=connection?.expiresAt && new Date(connection.expiresAt)<=new Date();
  return {...integrationStatus(),merchantConnected:Boolean(connected),inboxEnabled:enabled()&&Boolean(connected),outboundEnabled:enabled()&&connected&&!expired&&process.env.WHATSAPP_OUTBOUND_ENABLED==='true'&&/^v\d+\.0$/.test(process.env.WHATSAPP_GRAPH_VERSION||'')&&Boolean(connection?.accessToken||connection?.tokenCipher),sender:connection?.displayPhone||null,connectionState:expired?'expired':connection?.state||'disconnected',signup:signupConfig()};
}
whatsappCloudOwnerRoutes.get('/status',wrap(async(req,res)=>{const status=merchantStatus(await merchantConnection(req.store.id));if(req.user?.role==='staff')delete status.signup;res.json(status);}));
whatsappCloudOwnerRoutes.get('/webhook-readiness',async(req,res)=>{
  if(req.user?.role!=='owner') return res.status(404).json({error:'Integration not available for this shop'});
  const base=process.env.WHATSAPP_WEBHOOK_CALLBACK_URL;
  if(!enabled() || !base || !process.env.WHATSAPP_VERIFY_TOKEN || !process.env.META_APP_SECRET) return res.json({ready:false});
  // Callback must be an explicitly configured HTTPS origin, never a client input.
  try {
    const url=new URL(base);if(url.protocol!=='https:')return res.json({ready:false});
    url.search=new URLSearchParams({'hub.mode':'subscribe','hub.verify_token':process.env.WHATSAPP_VERIFY_TOKEN,'hub.challenge':'987654321'});
    const verification=await fetch(url);const exactChallenge=verification.ok && await verification.text()==='987654321';
    const body=JSON.stringify({object:'whatsapp_business_account',entry:[]});
    const signature='sha256='+createHmac('sha256',process.env.META_APP_SECRET).update(body).digest('hex');
    const signed=await fetch(base,{method:'POST',headers:{'content-type':'application/json','x-hub-signature-256':signature},body});
    const unsigned=await fetch(base,{method:'POST',headers:{'content-type':'application/json'},body});
    res.json({ready:exactChallenge && signed.status===200 && unsigned.status===403,exactChallenge,signedStatus:signed.status,unsignedStatus:unsigned.status,callback:base});
  } catch {res.status(502).json({ready:false,error:'Webhook self-check unavailable'});}
});

whatsappCloudOwnerRoutes.get('/auto-reply',wrap(async(req,res)=>{
  if(req.user?.role!=='owner') throw bad(403,'Only the shop owner can manage auto-replies');
  await ensureAutoReplySchema();
  const cfg=await WhatsAppAutoReply.findByPk(req.store.id);
  res.json({enabled:Boolean(cfg?.enabled),text:cfg?.text||''});
}));
whatsappCloudOwnerRoutes.put('/auto-reply',wrap(async(req,res)=>{
  if(req.user?.role!=='owner') throw bad(403,'Only the shop owner can manage auto-replies');
  const {enabled:on,text}=req.body||{};
  if(typeof on!=='boolean'||typeof text!=='string'||text.length>1000||(on&&!text.trim())) throw bad(400,'Turn on needs a reply text of up to 1000 characters');
  await ensureAutoReplySchema();
  await WhatsAppAutoReply.upsert({businessId:req.store.id,enabled:on,text:text.trim()});
  res.json({enabled:on,text:text.trim()});
}));
installInboxRoutes(whatsappCloudOwnerRoutes,{WhatsAppMessage,Lead,ensureSchema,merchantConnection,wrap,bad});
whatsappCloudOwnerRoutes.get('/messages',wrap(async(req,res)=>{
  if (!(await merchantConnection(req.store.id))) throw bad(503,'No shop number connected');
  await ensureSchema();
  const messages = await WhatsAppMessage.findAll({where:{businessId:req.store.id},order:[['eventAt','DESC'],['id','DESC']],limit:100});
  res.json({messages});
}));
whatsappCloudOwnerRoutes.post('/send',wrap(async(req,res)=>{
  const connection=await merchantConnection(req.store.id);
  if (!merchantStatus(connection).outboundEnabled) throw bad(503,'Production sender is not ready');
  const {to,text,requestId} = req.body || {};
  if (typeof to !== 'string' || typeof requestId !== 'string' || !/^[1-9]\d{7,14}$/.test(to || '') || typeof text !== 'string' || !text.trim() || text.length > 4096 || !/^[a-f0-9-]{36}$/i.test(requestId || '')) throw bad(400,'Valid phone, text and request ID required');
  await ensureSchema();
  const requestKey = `${req.store.id}:${requestId}`;
  const prior = await WhatsAppMessage.findOne({where:{requestKey}});
  if (prior) {
    if (prior.phone !== to || prior.text !== text.trim()) throw bad(409,'Request ID already used for different content');
    return res.json({message:prior,duplicate:true});
  }
  const latest = await WhatsAppMessage.findOne({where:{businessId:req.store.id,phone:to,direction:'inbound'},order:[['eventAt','DESC']]});
  if (!latest || !serviceWindowOpen(latest.eventAt)) throw bad(409,'Ask the customer to message the business first. Free replies require an open 24-hour service window.');
  const [record,created] = await WhatsAppMessage.findOrCreate({where:{requestKey},defaults:{businessId:req.store.id,phoneNumberId:connection.phoneNumberId,direction:'outbound',phone:to,text:text.trim(),eventAt:new Date(),status:'submitting'}});
  if (!created) {
    if (record.phone !== to || record.text !== text.trim()) throw bad(409,'Request ID already used for different content');
    return res.json({message:record,duplicate:true});
  }
  try {
    const messageId = await sendCloudText(to,text.trim(),fetch,connection);
    await record.update({messageId,status:'accepted'});
    res.status(201).json({message:record});
  } catch(err) {
    // Never retry automatically: Meta may have accepted a request before timeout.
    await record.update({status:err.metaCode ? 'failed' : 'unknown',errorCode:err.metaCode ? String(err.metaCode) : null});
    throw bad(502,'Message was not confirmed. Check the inbox before retrying.');
  }
}));
