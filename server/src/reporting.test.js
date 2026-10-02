import test from 'node:test';
import assert from 'node:assert/strict';
import {dateWindow,dateWhere,summarize,ordersCsv,csvCell} from './reporting.js';
import {validateProductRows} from './product-import.js';
test('IST inclusive dates use an exclusive next-day bound and reject invalid dates',()=>{
 const w=dateWindow({from:'2026-10-01',to:'2026-10-01'});
 assert.equal(new Date(w.from).toISOString(),'2026-09-30T18:30:00.000Z');assert.equal(new Date(w.until).toISOString(),'2026-10-01T18:30:00.000Z');
 for(const q of [{from:'2026-02-30'},{from:'bad'},{from:'2026-10-02',to:'2026-10-01'}])assert.throws(()=>dateWindow(q));
});
test('only served restaurant orders count as recorded totals, not requests',()=>{
 const order=(status,total,createdAt)=>({status,total,createdAt,items:[{name:'Tea',qty:2,price:10}]});
 const r=summarize([order('served',25,'2026-09-30T19:00:00Z'),order('new',100,'2026-10-01T10:00:00Z'),order('cancelled',99,'2026-10-01T10:00:00Z')],[{price:999,status:'delivered'}],new Date('2026-10-01T12:00:00Z'));
 assert.equal(r.recordedTotal,25);assert.equal(r.whatsappEnquiries,1);assert.equal(r.today,25);assert.equal(r.topProducts[0].itemValue,20);assert.equal(r.daily[0].date,'2026-10-01');assert.equal(r.restaurantPending,1);
});
test('CSV quotes and neutralizes spreadsheet formulas without exposing payment claims',()=>{
 assert.match(csvCell('=HYPERLINK("evil")'),/^"'/);assert.equal(csvCell('A,"B"'),'"A,""B"""');
 assert.match(ordersCsv([{id:1,status:'served',total:25,createdAt:'2026-10-01',customerName:'=bad'}],'restaurant'),/Payment verified/);
});
test('product imports validate every row, reject duplicates and bind preview digest',()=>{
 const valid=validateProductRows([{name:'Tea',price:'10',stock:'0'}]);assert.equal(valid.errors.length,0);assert.equal(valid.rows[0].stock,0);
 const bad=validateProductRows([{name:'Tea',price:'bad',stock:'-2'},{name:'tea',price:'10'}]);assert.equal(bad.errors.length,3);
 assert.notEqual(valid.digest,validateProductRows([{name:'Tea',price:'11',stock:'0'}]).digest);
});

test('report and import endpoints preserve staff scopes and store boundaries', async()=>{
 process.env.DATABASE_URL ||= 'postgres://local:local@localhost:5432/test';process.env.JWT_SECRET ||= 'test-secret-must-be-at-least-32-characters-long';process.env.CLIENT_URL='http://localhost:5175';
 const {default:app}=await import('./app.js');const m=await import('./models/index.js');const {default:jwt}=await import('jsonwebtoken');
 const originals={};for(const [key,model] of Object.entries(m))if(['Business','User','Lead','RestaurantOrder','Product','Category'].includes(key))for(const method of ['findByPk','findOne','findAll','findAndCountAll','count','create','findOrCreate'])originals[`${key}.${method}`]=model[method];
 const originalTransaction=m.sequelize.transaction;const store={id:5,ownerId:2,slug:'local-qa',name:'Local QA',storeType:'restaurant',active:true,deletedAt:null,featureLocks:{}};
 const users={1:{id:1,role:'superadmin',active:true},2:{id:2,role:'owner',active:true},3:{id:3,role:'staff',managerId:2,staffBusinessId:5,active:true}};
 m.User.findByPk=async id=>users[id] || null;m.Business.findOne=async({where})=>Number(where.id)===5&&Number(where.ownerId)===2?store:null;m.Business.findByPk=async()=>store;
 m.sequelize.transaction=async fn=>fn({LOCK:{UPDATE:'UPDATE'}});
 let created=0,query;m.Product.findAll=async()=>[];m.Product.create=async()=>{created++;return {};};m.Category.findOrCreate=async()=>[{id:1},true];
 m.Lead.findAndCountAll=async options=>{query=options;return {rows:[],count:0};};m.RestaurantOrder.findAndCountAll=async()=>({rows:[],count:0});
 m.Lead.count=m.RestaurantOrder.count=async()=>0;m.Lead.findAll=m.RestaurantOrder.findAll=async()=>[];
 const server=app.listen(0);const base=`http://127.0.0.1:${server.address().port}/api/owner`;const call=(url,method='GET',body,sub=3)=>fetch(base+url,{method,headers:{authorization:`Bearer ${jwt.sign({sub},process.env.JWT_SECRET)}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 try{
  assert.equal((await call('/5/leads')).status,403);assert.equal((await call('/999/products/import/preview','POST',{rows:[{name:'Tea',price:'10'}]})).status,404);
  assert.equal((await call('/5/products/import/preview','POST',{rows:[{name:'Tea',price:'10'}]})).status,200);
  const rows=[{name:'Tea',price:'10'}],p=await (await call('/5/products/import/preview','POST',{rows})).json();
  assert.equal((await call('/5/products/import/commit','POST',{rows,digest:'wrong'})).status,409);assert.equal(created,0);
  assert.equal((await call('/5/products/import/commit','POST',{rows,digest:p.digest})).status,200);assert.equal(created,1);
  store.featureLocks={products:true};assert.equal((await call('/5/products/import/preview','POST',{rows})).status,403);store.featureLocks={};
  const r=await call('/5/leads?from=2026-10-01&to=2026-10-01&q=Tea&page=2','GET',null,2);assert.equal(r.status,200);assert.equal(query.offset,50);assert.equal(query.limit,50);assert.ok(query.where.createdAt);
  assert.equal((await call('/5/restaurant-orders/report.csv')).status,200);
  assert.equal((await call('/5/products','POST',{name:'Unauthorized edit'})).status,403);
  store.featureLocks={sales:true};assert.equal((await call('/5/sales-summary/report.csv','GET',null,2)).status,403);store.featureLocks={};
  const pdf=await call('/5/shop-qr.pdf');assert.equal(pdf.status,200);assert.match(pdf.headers.get('content-type'),/pdf/);(await import('node:fs/promises')).writeFile('/downloads/dukaan-local-qr.pdf',Buffer.from(await pdf.arrayBuffer()));
 }finally{for(const [key,value]of Object.entries(originals)){const [model,method]=key.split('.');m[model][method]=value;}m.sequelize.transaction=originalTransaction;await new Promise(r=>server.close(r));}
});
