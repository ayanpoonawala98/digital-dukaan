import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL='postgres://test:test@localhost:5432/test';
const { serviceWindowOpen, sendCloudText, persistWhatsAppEvents, integrationStatus } = await import('./whatsapp-cloud.js');
const { WhatsAppMessage } = await import('./whatsapp-cloud.js');
WhatsAppMessage.sync=async()=>{};
test('service window never permits future, expired or invalid inbound timestamps',()=>{
 const now=Date.now();assert.equal(serviceWindowOpen(new Date(now-1000),now),true);assert.equal(serviceWindowOpen(new Date(now-86400000),now),false);assert.equal(serviceWindowOpen(new Date(now+1000),now),false);assert.equal(serviceWindowOpen('invalid',now),false);
});
test('Cloud transport uses configured sender and fixed Graph origin, no templates or preview',async()=>{
 process.env.WHATSAPP_INTEGRATION_BUSINESS_ID='7';process.env.WHATSAPP_PHONE_NUMBER_ID='123';process.env.WHATSAPP_GRAPH_VERSION='v26.0';process.env.WHATSAPP_ACCESS_TOKEN='test-only';
 const id=await sendCloudText('919999999999','Test',async(url,opts)=>{
 assert.equal(url,'https://graph.facebook.com/v26.0/123/messages');assert.equal(opts.headers.authorization,'Bearer test-only');assert.deepEqual(JSON.parse(opts.body),{messaging_product:'whatsapp',recipient_type:'individual',to:'919999999999',type:'text',text:{body:'Test',preview_url:false}});return {ok:true,json:async()=>({messages:[{id:'wamid.test'}]})};});assert.equal(id,'wamid.test');
 await assert.rejects(sendCloudText('919999999999','Test',async()=>({ok:false,json:async()=>({error:{code:190,message:'sensitive'}})})),err=>err.metaCode===190&&!err.message.includes('sensitive'));
});
test('event storage ignores other accounts and numbers and deduplicates by Meta ID',async()=>{
 process.env.WHATSAPP_INTEGRATION_BUSINESS_ID='7';process.env.WHATSAPP_PHONE_NUMBER_ID='123';process.env.WHATSAPP_WABA_ID='456';
 const prior=WhatsAppMessage.findOrCreate;const rows=new Map();let calls=0;WhatsAppMessage.findOrCreate=async({where,defaults})=>{calls++;if(!rows.has(where.messageId))rows.set(where.messageId,defaults);return [rows.get(where.messageId),false];};
 const payload=(account,number)=>({entry:[{id:account,changes:[{field:'messages',value:{metadata:{phone_number_id:number},messages:[{id:'wamid.in',from:'919999999999',type:'text',text:{body:'Hi'},timestamp:String(Math.floor(Date.now()/1000))}]}}]}]});
 try {await persistWhatsAppEvents(payload('other','123'));await persistWhatsAppEvents(payload('456','other'));assert.equal(calls,0);await persistWhatsAppEvents(payload('456','123'));await persistWhatsAppEvents(payload('456','123'));assert.equal(rows.size,1);assert.equal(rows.get('wamid.in').businessId,7);assert.equal(rows.get('wamid.in').text,'Hi');}finally{WhatsAppMessage.findOrCreate=prior;}
});
test('outbound readiness needs explicit flag and configured version; broadcasts stay off',()=>{
 process.env.WHATSAPP_CLOUD_ENABLED='true';delete process.env.WHATSAPP_OUTBOUND_ENABLED;assert.equal(integrationStatus().outboundEnabled,false);process.env.WHATSAPP_OUTBOUND_ENABLED='true';assert.equal(integrationStatus().outboundEnabled,true);assert.equal(integrationStatus().broadcastEnabled,false);process.env.WHATSAPP_GRAPH_VERSION='bad';assert.equal(integrationStatus().outboundEnabled,false);
});
test('send route enforces shop binding, service window and idempotent request content',async()=>{
 process.env.JWT_SECRET='test-secret-32-characters-long-for-route-tests';
 const {default:app}=await import('./app.js');const {User,Business}=await import('./models/index.js');const jwt=(await import('jsonwebtoken')).default;
 const prior={u:User.findByPk,b:Business.findOne,one:WhatsAppMessage.findOne,create:WhatsAppMessage.findOrCreate,fetch:globalThis.fetch};
 User.findByPk=async()=>({id:1,role:'owner',active:true});Business.findOne=async()=>({id:7,ownerId:1});
 Object.assign(process.env,{WHATSAPP_CLOUD_ENABLED:'true',WHATSAPP_INTEGRATION_UI_ENABLED:'true',WHATSAPP_INTEGRATION_OWNER_ID:'1',WHATSAPP_INTEGRATION_BUSINESS_ID:'7',WHATSAPP_PHONE_NUMBER_ID:'123',WHATSAPP_WABA_ID:'456',WHATSAPP_OUTBOUND_ENABLED:'true',WHATSAPP_GRAPH_VERSION:'v26.0',WHATSAPP_ACCESS_TOKEN:'test-only'});
 let accepted=0,stored;WhatsAppMessage.findOne=async({where})=>where.requestKey?stored:{eventAt:new Date()};WhatsAppMessage.findOrCreate=async({defaults})=>{stored={...defaults,async update(values){Object.assign(this,values);}};return [stored,true];};
 const server=app.listen(0),realFetch=prior.fetch,base=`http://127.0.0.1:${server.address().port}/api/owner/7/whatsapp-cloud/send`;
 globalThis.fetch=async()=>{accepted++;return {ok:true,json:async()=>({messages:[{id:'wamid.sent'}]})};};
 const body={to:'919999999999',text:'Approved reply',requestId:'11111111-1111-4111-8111-111111111111'};
 const call=(data=body)=>realFetch(base,{method:'POST',headers:{authorization:`Bearer ${jwt.sign({sub:1},process.env.JWT_SECRET)}`,'content-type':'application/json'},body:JSON.stringify(data)});
 try {
  assert.equal((await call()).status,201);assert.equal(accepted,1);assert.equal(stored.status,'accepted');assert.equal((await call()).status,200);assert.equal(accepted,1);assert.equal((await call({...body,text:'Changed'})).status,409);
  stored=null;WhatsAppMessage.findOne=async({where})=>where.requestKey?null:{eventAt:new Date(Date.now()-86400000)};assert.equal((await call()).status,409);assert.equal(accepted,1);
  process.env.WHATSAPP_INTEGRATION_BUSINESS_ID='8';assert.equal((await call()).status,404);
 }finally{User.findByPk=prior.u;Business.findOne=prior.b;WhatsAppMessage.findOne=prior.one;WhatsAppMessage.findOrCreate=prior.create;globalThis.fetch=prior.fetch;await new Promise(r=>server.close(r));}
});
