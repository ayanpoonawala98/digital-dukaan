import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { DataTypes } from 'sequelize';
import jwt from 'jsonwebtoken';
import { sequelize } from '../../config/db.js';
import { bad, wrap } from '../../shared/utils/core.js';

// Credentials never leave the API. Use a dedicated 32-byte key, not an app secret.
export const WhatsAppConnection = sequelize.define('WhatsAppConnection', {
  businessId: {type:DataTypes.INTEGER,primaryKey:true},
  wabaId: {type:DataTypes.STRING(40),allowNull:false},
  phoneNumberId: {type:DataTypes.STRING(40),unique:true,allowNull:false},
  displayPhone: {type:DataTypes.STRING(40)},
  tokenCipher: {type:DataTypes.TEXT,allowNull:false},
  pinCipher: {type:DataTypes.TEXT,allowNull:true},
  state: {type:DataTypes.STRING(30),allowNull:false,defaultValue:'pending'},
  expiresAt: {type:DataTypes.DATE,allowNull:true}
}, {tableName:'whatsapp_connections'});
export const WhatsAppSignup = sequelize.define('WhatsAppSignup', {
  id: {type:DataTypes.STRING(64),primaryKey:true},
  businessId: {type:DataTypes.INTEGER,allowNull:false},
  ownerId: {type:DataTypes.INTEGER,allowNull:false},
  tokenCipher: {type:DataTypes.TEXT,allowNull:true},
  expiresAt: {type:DataTypes.DATE,allowNull:false},
  tokenExpiresAt: {type:DataTypes.DATE,allowNull:true},
  state: {type:DataTypes.STRING(20),allowNull:false,defaultValue:'started'}
}, {tableName:'whatsapp_signup_sessions'});
let ready;
export async function ensureMerchantSchema() {
  if (!ready) ready=Promise.all([WhatsAppConnection.sync(),WhatsAppSignup.sync()]).catch(e=>{ready=null;throw e;});
  await ready;
}
function encryptionKey() {
  const value=process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY;
  if (!/^[a-f0-9]{64}$/i.test(value||'')) throw bad(503,'Secure merchant token storage is not configured');
  return Buffer.from(value,'hex');
}
export function encryptCredential(value, context) {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);
  cipher.setAAD(Buffer.from(String(context)));
  const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return [iv,cipher.getAuthTag(),data].map(b=>b.toString('base64')).join('.');
}
export function decryptCredential(value, context) {
  const [iv,tag,data]=value.split('.').map(v=>Buffer.from(v,'base64'));
  const cipher=createDecipheriv('aes-256-gcm',encryptionKey(),iv);
  cipher.setAAD(Buffer.from(String(context)));cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data),cipher.final()]).toString('utf8');
}
export function legacyConnection(businessId) {
  if (!/^\d+$/.test(process.env.WHATSAPP_INTEGRATION_BUSINESS_ID||'') || !/^\d+$/.test(process.env.WHATSAPP_PHONE_NUMBER_ID||'')) return null;
  if (businessId!==undefined && String(businessId)!==process.env.WHATSAPP_INTEGRATION_BUSINESS_ID) return null;
  return {businessId:Number(process.env.WHATSAPP_INTEGRATION_BUSINESS_ID),wabaId:process.env.WHATSAPP_WABA_ID,phoneNumberId:process.env.WHATSAPP_PHONE_NUMBER_ID,displayPhone:process.env.WHATSAPP_DISPLAY_PHONE||null,state:'connected',accessToken:process.env.WHATSAPP_ACCESS_TOKEN};
}
export async function merchantConnection(businessId) {
  const legacy=legacyConnection(businessId);if(legacy)return legacy;
  // This gate keeps the existing production connection independent of new schema/config.
  if(process.env.WHATSAPP_MULTI_MERCHANT_ENABLED!=='true')return null;
  await ensureMerchantSchema();
  return WhatsAppConnection.findByPk(businessId);
}
export async function connectionForEvent(wabaId,phoneNumberId) {
  const legacy=legacyConnection();
  if(legacy && String(wabaId)===legacy.wabaId && String(phoneNumberId)===legacy.phoneNumberId)return legacy;
  if(process.env.WHATSAPP_MULTI_MERCHANT_ENABLED!=='true')return null;
  await ensureMerchantSchema();
  return WhatsAppConnection.findOne({where:{wabaId:String(wabaId),phoneNumberId:String(phoneNumberId),state:'connected'}});
}
export function connectionToken(connection) {
  return connection.accessToken || decryptCredential(connection.tokenCipher,`store:${connection.businessId}`);
}
export function signupConfig() {
  const configured=process.env.WHATSAPP_MULTI_MERCHANT_ENABLED==='true' && /^[a-f0-9]{64}$/i.test(process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY||'') && /^\d+$/.test(process.env.META_APP_ID||'') && /^\d+$/.test(process.env.WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID||'') && Boolean(process.env.META_APP_SECRET) && /^v\d+\.0$/.test(process.env.WHATSAPP_GRAPH_VERSION||'');
  return {available:configured && process.env.WHATSAPP_EMBEDDED_SIGNUP_ENABLED==='true',appId:process.env.META_APP_ID||null,configId:process.env.WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID||null,version:process.env.WHATSAPP_GRAPH_VERSION||null,reason:configured?'Meta approval must be complete before public onboarding is enabled.':'Meta Embedded Signup configuration and secure storage are not ready yet.'};
}
export async function graph(path, token, options={}, fetcher=fetch) {
  if(!/^v\d+\.0$/.test(process.env.WHATSAPP_GRAPH_VERSION||''))throw bad(503,'Graph API version not configured');
  const result=await fetcher(`https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION}/${path}`,{...options,headers:{authorization:`Bearer ${token}`,'content-type':'application/json',...options.headers},signal:AbortSignal.timeout(15000)});
  const body=await result.json().catch(()=>({}));
  if(!result.ok || body.error){const e=bad(502,'Meta could not finish connecting this number. Check Meta setup and try a new connection.');e.metaCode=body.error?.code;throw e;}
  return body;
}
export async function verifyMerchantAssets(token,wabaId,phoneNumberId,fetcher=fetch) {
  if(!/^\d{1,40}$/.test(wabaId||'')||!/^\d{1,40}$/.test(phoneNumberId||''))throw bad(400,'Valid WhatsApp account and phone IDs required');
  const debug=await graph(`debug_token?${new URLSearchParams({input_token:token})}`,`${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`,{},fetcher);
  if(!debug.data?.is_valid || String(debug.data.app_id)!==process.env.META_APP_ID || !['whatsapp_business_management','whatsapp_business_messaging'].every(s=>debug.data.scopes?.includes(s)))throw bad(403,'Meta did not grant the required WhatsApp permissions');
  if(debug.data.expires_at && debug.data.expires_at*1000<=Date.now())throw bad(403,'Meta permission has expired');
  // Never trust the popup's asset IDs without verifying the WABA's phone collection.
  let path=`${wabaId}/phone_numbers?fields=id,display_phone_number,code_verification_status&limit=100`,phone;
  for(let page=0;page<10;page++) {
    const phones=await graph(path,token,{},fetcher);
    phone=phones.data?.find(p=>String(p.id)===phoneNumberId);if(phone)break;
    const after=phones.paging?.cursors?.after;if(!phones.paging?.next||!after)break;
    path=`${wabaId}/phone_numbers?${new URLSearchParams({fields:'id,display_phone_number,code_verification_status',limit:'100',after})}`;
  }
  if(!phone || phone.code_verification_status!=='VERIFIED')throw bad(403,'The verified phone number does not belong to the authorized WhatsApp account');
  return {phone,expiresAt:debug.data.expires_at?new Date(debug.data.expires_at*1000):null};
}
function readState(req) {
  try {
    const data=jwt.verify(req.body?.state||'',process.env.JWT_SECRET,{audience:'whatsapp-signup',issuer:'digital-dukaan'});
    if(data.ownerId!==req.user.id || data.businessId!==req.store.id)throw new Error();return data;
  } catch {throw bad(403,'Connection session expired. Start connecting again.');}
}
async function getSession(req) {
  const state=readState(req);await ensureMerchantSchema();
  const session=await WhatsAppSignup.findByPk(state.nonce);
  if(!session || session.ownerId!==req.user.id || session.businessId!==req.store.id || session.expiresAt<=new Date())throw bad(403,'Connection session expired. Start again.');
  return session;
}
export function installSignupRoutes(router) {
  router.post('/connect/start',wrap(async(req,res)=>{
    if(!signupConfig().available)throw bad(503,'Self-serve WhatsApp connection is waiting for Meta configuration and approval');
    if(await merchantConnection(req.store.id))throw bad(409,'This shop already has a WhatsApp connection');
    await ensureMerchantSchema();
    const nonce=randomBytes(24).toString('hex'),expiresAt=new Date(Date.now()+10*60*1000);
    await WhatsAppSignup.create({id:nonce,businessId:req.store.id,ownerId:req.user.id,expiresAt});
    const state=jwt.sign({nonce,businessId:req.store.id,ownerId:req.user.id},process.env.JWT_SECRET,{audience:'whatsapp-signup',issuer:'digital-dukaan',expiresIn:'10m'});
    res.json({state,...signupConfig()});
  }));
  router.post('/connect/exchange',wrap(async(req,res)=>{
    if(!signupConfig().available)throw bad(503,'WhatsApp onboarding is not enabled');
    const session=await getSession(req),code=req.body?.code;
    if(typeof code!=='string'||code.length<10||code.length>5000)throw bad(400,'Meta authorization code required');
    const [claimed]=await WhatsAppSignup.update({state:'exchanging'},{where:{id:session.id,state:'started'}});
    if(!claimed)throw bad(409,'This Meta code has already been used. Start again if connection was interrupted.');
    try {
      const params=new URLSearchParams({client_id:process.env.META_APP_ID,client_secret:process.env.META_APP_SECRET,code});
      const result=await graph(`oauth/access_token?${params}`,`${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`);
      if(!result.access_token)throw bad(502,'Meta did not return a business token');
      await session.update({state:'authorized',tokenCipher:encryptCredential(result.access_token,`session:${session.id}`),tokenExpiresAt:result.expires_in?new Date(Date.now()+result.expires_in*1000):null});
      res.json({authorized:true});
    } catch(e){await session.update({state:'failed',tokenCipher:null});throw e;}
  }));
  router.post('/connect/complete',wrap(async(req,res)=>{
    if(!signupConfig().available)throw bad(503,'WhatsApp onboarding is not enabled');
    const session=await getSession(req);
    const [claimed]=await WhatsAppSignup.update({state:'completing'},{where:{id:session.id,state:'authorized'}});
    if(!claimed)throw bad(409,'Connection already completed or interrupted. Refresh the connection status.');
    let connection;
    try {
      const {wabaId,phoneNumberId}=req.body||{};
      const token=decryptCredential(session.tokenCipher,`session:${session.id}`);
      const {phone,expiresAt}=await verifyMerchantAssets(token,wabaId,phoneNumberId);
      const legacy=legacyConnection();
      if(legacy && (legacy.phoneNumberId===phoneNumberId||legacy.businessId===req.store.id))throw bad(409,'This phone or shop is already connected');
      // Unique store + phone reservation happens BEFORE subscription/registration.
      connection=await WhatsAppConnection.create({businessId:req.store.id,wabaId,phoneNumberId,displayPhone:phone.display_phone_number,tokenCipher:encryptCredential(token,`store:${req.store.id}`),expiresAt:expiresAt||session.tokenExpiresAt,state:'pending'}).catch(()=>{throw bad(409,'This shop or phone is already connected. Contact support if a previous setup was interrupted.');});
      const subscribed=await graph(`${wabaId}/subscribed_apps`,token,{method:'POST'});
      if(subscribed.success!==true)throw bad(502,'Meta subscription was not confirmed');
      // The merchant explicitly chooses Connect; the UI explains managed 2FA.
      const pin=String(randomBytes(4).readUInt32BE()%1000000).padStart(6,'0');
      await connection.update({pinCipher:encryptCredential(pin,`pin:${req.store.id}`)});
      const registered=await graph(`${phoneNumberId}/register`,token,{method:'POST',body:JSON.stringify({messaging_product:'whatsapp',pin})});
      if(registered.success!==true)throw bad(502,'Meta registration was not confirmed');
      await connection.update({state:'connected'});
      await session.update({state:'completed',tokenCipher:null});
      res.json({connected:true,sender:phone.display_phone_number});
    } catch(e){
      // Preserve a failed reservation for support reconciliation. Never auto-retry
      // a registration whose upstream result may be uncertain.
      if(connection)await connection.update({state:'needs_attention'});
      await session.update({state:'failed',tokenCipher:null});throw e;
    }
  }));
}
