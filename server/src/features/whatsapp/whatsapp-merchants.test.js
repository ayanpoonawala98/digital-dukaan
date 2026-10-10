import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL='postgres://test:test@localhost:5432/test';
const {encryptCredential,decryptCredential,verifyMerchantAssets,connectionForEvent,WhatsAppConnection,WhatsAppSignup,merchantConnection,signupConfig}=await import('./whatsapp-merchants.js');
const {merchantStatus,sendCloudText,persistWhatsAppEvents,WhatsAppMessage}=await import('./whatsapp-cloud.js');
WhatsAppConnection.sync=WhatsAppSignup.sync=WhatsAppMessage.sync=async()=>{};
process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY='ab'.repeat(32);
process.env.WHATSAPP_GRAPH_VERSION='v26.0';process.env.META_APP_ID='10';process.env.META_APP_SECRET='test-secret';
test('tokens are authenticated, random, and bound to their store',()=>{
 const one=encryptCredential('private-token','store:1'),two=encryptCredential('private-token','store:1');assert.notEqual(one,two);assert.ok(!one.includes('private-token'));assert.equal(decryptCredential(one,'store:1'),'private-token');assert.throws(()=>decryptCredential(one,'store:2'));assert.throws(()=>decryptCredential(one.slice(0,-3)+'abc','store:1'));
 delete process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY;assert.throws(()=>encryptCredential('secret','store:1'));process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY='ab'.repeat(32);
});
test('popup IDs require valid app token, both scopes and verified phone under WABA',async()=>{
 const debug={data:{is_valid:true,app_id:'10',scopes:['whatsapp_business_management','whatsapp_business_messaging'],expires_at:0}};
 const f=async url=>({ok:true,json:async()=>url.includes('debug_token')?debug:{data:[{id:'22',display_phone_number:'+919999999999',code_verification_status:'VERIFIED'}]}});
 assert.equal((await verifyMerchantAssets('secret','11','22',f)).phone.id,'22');
 await assert.rejects(verifyMerchantAssets('secret','11','33',f));debug.data.app_id='12';await assert.rejects(verifyMerchantAssets('secret','11','22',f));debug.data.app_id='10';debug.data.scopes=[];await assert.rejects(verifyMerchantAssets('secret','11','22',f));
});
test('per-store sender, routing and inbox isolation; legacy number is reserved',async()=>{
 Object.assign(process.env,{WHATSAPP_MULTI_MERCHANT_ENABLED:'true',WHATSAPP_CLOUD_ENABLED:'true',WHATSAPP_OUTBOUND_ENABLED:'true',WHATSAPP_INTEGRATION_BUSINESS_ID:'7',WHATSAPP_PHONE_NUMBER_ID:'123',WHATSAPP_WABA_ID:'456',WHATSAPP_ACCESS_TOKEN:'legacy'});
 const connections=[{businessId:8,wabaId:'800',phoneNumberId:'801',state:'connected',tokenCipher:encryptCredential('eight','store:8')},{businessId:9,wabaId:'900',phoneNumberId:'901',state:'connected',tokenCipher:encryptCredential('nine','store:9')}];
 const old={one:WhatsAppConnection.findOne,pk:WhatsAppConnection.findByPk,create:WhatsAppMessage.findOrCreate};
 WhatsAppConnection.findOne=async({where})=>connections.find(c=>Object.entries(where).every(([k,v])=>c[k]===v));WhatsAppConnection.findByPk=async id=>connections.find(c=>c.businessId===id)||null;
 try {
  assert.equal((await merchantConnection(7)).accessToken,'legacy');assert.equal(await merchantConnection(10),null);assert.equal(await connectionForEvent('800','901'),undefined);assert.equal((await connectionForEvent('900','901')).businessId,9);
  const rows=[];WhatsAppMessage.findOrCreate=async({defaults})=>{rows.push(defaults);return [defaults,true];};
  const entry=(id,phone)=>({id,changes:[{field:'messages',value:{metadata:{phone_number_id:phone},messages:[{id:'wamid.'+phone,from:'919999999999',type:'text',text:{body:'Hi'},timestamp:String(Math.floor(Date.now()/1000))}]}}]});
  await persistWhatsAppEvents({entry:[entry('800','801'),entry('900','901'),entry('800','901'),entry('456','123')]});assert.deepEqual(rows.map(r=>r.businessId),[8,9,7]);
  await sendCloudText('919999999999','Reply',async(url,opts)=>{assert.equal(url,'https://graph.facebook.com/v26.0/901/messages');assert.equal(opts.headers.authorization,'Bearer nine');return {ok:true,json:async()=>({messages:[{id:'ok'}]})};},connections[1]);
  assert.equal(merchantStatus(null).outboundEnabled,false);assert.equal(merchantStatus({...connections[0],expiresAt:new Date(Date.now()-1)}).outboundEnabled,false);
  assert.ok(!JSON.stringify(merchantStatus(connections[0])).includes('tokenCipher'));assert.equal(signupConfig().available,false);
 }finally{WhatsAppConnection.findOne=old.one;WhatsAppConnection.findByPk=old.pk;WhatsAppMessage.findOrCreate=old.create;}
});
