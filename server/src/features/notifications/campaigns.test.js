import test from 'node:test';import assert from 'node:assert/strict';
process.env.DATABASE_URL ||= 'postgres://local:local@localhost/test';
const {normalizeOfferAddress,consentInput,validateOfferProvider}=await import('./campaigns.js');
const {notifyNewOrder,notifyStatusChange}=await import('./notify.js');
test('email and SMS audiences normalize separately; permission must be specific and dated',()=>{
 assert.equal(normalizeOfferAddress('email',' USER@Shop.in '),'user@shop.in');assert.equal(normalizeOfferAddress('sms','+91 98765 43210'),'9876543210');
 assert.throws(()=>normalizeOfferAddress('sms','123'));assert.throws(()=>normalizeOfferAddress('whatsapp','9876543210'));
 assert.throws(()=>consentInput({channel:'email',address:'a@b.co'}));assert.throws(()=>consentInput({channel:'email',address:'a@b.co',consentSource:'Order',consentAt:'2099-01-01',confirmConsent:true}));
 assert.equal(consentInput({channel:'email',address:'a@b.co',consentSource:'Customer requested email offers at counter',consentAt:'2026-10-01T10:00:00Z',confirmConsent:true}).address,'a@b.co');
});
test('customer email requires store toggle, customer request and own email provider; statuses work without phone',async()=>{
 const calls=[],deps={creds:{emailMode:'resend',resend:{apiKey:'store-key',from:'shop@shop.in'}},fetchImpl:async(u,o)=>{calls.push(JSON.parse(o.body));return {ok:true};}};
 const store={id:8,name:'QA',notifySettings:{customerEmail:true}},order={id:44,customerEmail:'qa@example.test',customerEmailConsent:true,price:100};
 await notifyNewOrder(store,'lead',order,deps);assert.equal(calls.length,1);assert.match(calls[0].text,/not payment/);
 await notifyStatusChange(store,'lead',order,'packed',deps,'https://example.test/bill');assert.equal(calls.length,2);assert.match(calls[1].text,/packed/);
 await notifyNewOrder(store,'lead',{...order,customerEmailConsent:false},deps);assert.equal(calls.length,2);
 await notifyNewOrder({...store,notifySettings:{}},'lead',order,deps);assert.equal(calls.length,2);
 await notifyNewOrder(store,'lead',order,{env:{RESEND_API_KEY:'platform',EMAIL_FROM:'x@y.co'},fetchImpl:deps.fetchImpl});assert.equal(calls.length,2);
});
test('campaign routes isolate stores/channels, suppress at send, persist outcomes, reject repeats and changed providers',async()=>{
 const {default:express}=await import('express');const {OfferContact,OfferCampaign,campaignOwnerRoutes,campaignPublicRoutes}=await import('./campaigns.js');const {sequelize,Business,NotifySecret}=await import('../../models/index.js');const {encryptJson}=await import('./notify-secrets.js');const {Op}=await import('sequelize');
 const originals=[],patch=(obj,key,value)=>{originals.push([obj,key,obj[key]]);obj[key]=value;};const contacts=[],campaigns=[],calls=[];
 const match=(r,w={})=>Reflect.ownKeys(w).every(k=>{const v=w[k];if(v&&typeof v==='object'&&!(v instanceof Date)){if(v[Op.in])return v[Op.in].includes(r[k]);if(v[Op.gt])return r[k]>v[Op.gt];}return v==null?r[k]==null:String(r[k])===String(v);});
 const row=(data,list)=>{const r={id:list.length+1,createdAt:new Date(),updatedAt:new Date(),status:'review',...data};r.update=async values=>{Object.assign(r,structuredClone(values),{updatedAt:new Date()});return r;};return r;};
 for(const [model,list] of [[OfferContact,contacts],[OfferCampaign,campaigns]]){patch(model,'sync',async()=>{});patch(model,'findAll',async({where})=>list.filter(r=>match(r,where)));patch(model,'findOne',async({where})=>list.find(r=>match(r,where)));patch(model,'create',async data=>{const r=row(data,list);list.push(r);return r;});}
 patch(OfferContact,'findOrCreate',async({where,defaults})=>{const existing=contacts.find(r=>match(r,where));return existing?[existing,false]:[await OfferContact.create({...where,...defaults}),true];});
 patch(Business,'findByPk',async()=>({id:8}));let chain=Promise.resolve();patch(sequelize,'transaction',fn=>{const r=chain.then(()=>fn({LOCK:{UPDATE:'update'}}));chain=r.catch(()=>{});return r;});
 const oldSecret=process.env.JWT_SECRET;process.env.JWT_SECRET='test-only-not-a-live-secret';let provider={emailMode:'resend',resend:{apiKey:'mock-key',from:'qa@example.test'}};patch(NotifySecret,'findByPk',async()=>({payload:encryptJson(provider)}));const realFetch=global.fetch;global.fetch=async(url,options)=>{if(String(url).startsWith('https://api.resend.com/')){calls.push(JSON.parse(options.body));return {ok:true};}return realFetch(url,options);};
 const app=express();app.use(express.json());app.use('/owner/:storeId/campaigns',(req,res,next)=>{req.store={id:Number(req.params.storeId),name:'QA store'};req.user={id:1,role:req.headers['x-role']||'owner'};next();},campaignOwnerRoutes);app.use('/public',campaignPublicRoutes);app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 const request=async(path,body,headers={})=>{const response=await realFetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...headers},body:body?JSON.stringify(body):undefined});return {status:response.status,body:await response.json(),headers:response.headers};};
 try{
 const consent={channel:'email',address:'a@example.test',consentSource:'Separate email offers request',consentAt:'2026-10-01T10:00:00Z',confirmConsent:true};
 assert.equal((await request('/owner/8/campaigns/contacts',consent,{'x-role':'staff'})).status,403);
 assert.equal((await request('/owner/8/campaigns/contacts',consent)).status,201);await request('/owner/9/campaigns/contacts',{...consent,address:'b@example.test'});await request('/owner/8/campaigns/contacts',{...consent,channel:'sms',address:'9876543210'});
 const preview={channel:'email',subject:'QA offer',message:'Test offer',postalAddress:'QA business street',contactIds:[1]};
 assert.equal((await request('/owner/8/campaigns/preview',{...preview,contactIds:[2]})).status,400);assert.equal((await request('/owner/8/campaigns/preview',{...preview,contactIds:[3]})).status,400);assert.equal((await request('/owner/9/campaigns/contacts/1/suppress',{})).status,404);
 let result=await request('/owner/8/campaigns/preview',preview);assert.equal(result.status,201);const id=result.body.id;provider.resend.from='changed@example.test';const confirms={confirmCosts:true,confirmConsent:true,confirmTemplate:true};assert.equal((await request(`/owner/8/campaigns/${id}/send`,confirms)).status,409);assert.equal(calls.length,0);provider.resend.from='qa@example.test';
 const opt=await request(`/public/offers/opt-out/${contacts[0].token}`);assert.equal(opt.body.suppressed,false);assert.equal(opt.headers.get('cache-control'),'no-store');assert.equal(contacts[0].suppressedAt,undefined);await request(`/public/offers/opt-out/${contacts[0].token}`,{});
 result=await request(`/owner/8/campaigns/${id}/send`,confirms);assert.equal(result.status,200);assert.equal(result.body.results[0].status,'suppressed');assert.equal(calls.length,0);assert.equal((await request('/owner/8/campaigns/contacts',consent)).status,409);assert.equal((await request(`/owner/8/campaigns/${id}/send`,confirms)).status,429);
 campaigns[0].updatedAt=new Date(0);await request('/owner/8/campaigns/contacts',{...consent,address:'c@example.test'});result=await request('/owner/8/campaigns/preview',{...preview,contactIds:[4]});const id2=result.body.id;
 const race=await Promise.all([request(`/owner/8/campaigns/${id2}/send`,confirms),request(`/owner/8/campaigns/${id2}/send`,confirms)]);assert.deepEqual(race.map(r=>r.status).sort(),[200,429]);assert.equal(calls.length,1);assert.match(calls[0].text,/Stop offers:.*opt-out/);assert.equal(campaigns[1].results[0].status,'accepted');assert.equal((await request('/owner/9/campaigns')).body.contacts.length,1);
 }finally{await new Promise(r=>server.close(r));global.fetch=realFetch;for(const [obj,key,original] of originals.reverse())obj[key]=original;if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;}
});

test('custom offer providers must pass recipient and full message with real opt-out',()=>{assert.throws(()=>validateOfferProvider({kind:'http',url:'https://example.test/send',body:'{\"phone\":\"{{to}}\"}'}));assert.throws(()=>validateOfferProvider({kind:'smtp'}));assert.doesNotThrow(()=>validateOfferProvider({kind:'http',url:'https://example.test/send',body:'{{to}} {{message}}'}));});
