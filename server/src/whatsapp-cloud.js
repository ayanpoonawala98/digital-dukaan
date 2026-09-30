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

// Production plumbing contains no outbound transport.
export const whatsappCloudOwnerRoutes = Router();
whatsappCloudOwnerRoutes.use((req,res,next) => {
  if (process.env.WHATSAPP_INTEGRATION_UI_ENABLED !== 'true' || String(req.store?.ownerId) !== String(process.env.WHATSAPP_INTEGRATION_OWNER_ID || '')) return res.status(404).json({error:'Integration not available for this shop'});
  next();
});
export function integrationStatus() {
  return {mode:'production-plumbing',cloudEnabled:enabled(),outboundEnabled:false,testSendEnabled:false,broadcastEnabled:false,callback:process.env.WHATSAPP_WEBHOOK_CALLBACK_URL || null,webhookConfigured:Boolean(process.env.META_APP_SECRET && process.env.WHATSAPP_VERIFY_TOKEN),merchantConnected:false,inboxEnabled:false};
}
whatsappCloudOwnerRoutes.get('/status',(_,res)=>res.json(integrationStatus()));
whatsappCloudOwnerRoutes.get('/webhook-readiness',async(_,res)=>{
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
