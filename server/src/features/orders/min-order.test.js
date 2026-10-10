process.env.DISABLE_ABUSE_LIMITS = '1';
import test from 'node:test';import assert from 'node:assert/strict';
process.env.DATABASE_URL||='postgres://local:local@localhost:5432/test';process.env.JWT_SECRET||='test-secret-must-be-at-least-32-characters-long';process.env.CLIENT_URL='http://localhost:5175';
const {default:app}=await import('../../app.js');const m=await import('../../models/index.js');
test('single item rejects below minimum before storing lead; quantity, subtotal and stock are correct',async()=>{
 const saved={b:m.Business.findOne,p:m.Product.findOne,l:m.Lead.create};const store={id:11,name:'Local QA',slug:'local-qa',storeType:'retail',active:true,deletedAt:null,minOrder:199,whatsapp:'919999999999',notifySettings:{}};const product={id:92,businessId:11,name:'Ring',price:150,stock:3,imageUrl:''};let rows=[];
 m.Business.findOne=async()=>store;m.Product.findOne=async()=>product;m.Lead.create=async row=>{rows.push(row);return {...row,id:999,orderNumber:2};};
 const server=app.listen(0),base=`http://127.0.0.1:${server.address().port}/api/public/stores/local-qa/products/92/enquire`;const post=body=>fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 try{
  let r=await post({qty:1});assert.equal(r.status,400);assert.match((await r.json()).error,/Minimum order/);assert.equal(rows.length,0);
  r=await post({qty:2});assert.equal(r.status,201);const out=await r.json();assert.equal(out.tracking.total,300);assert.equal(rows[0].price,300);assert.equal(rows[0].items[0].qty,2);assert.equal(rows[0].items[0].price,150);assert.match(decodeURIComponent(out.url),/Quantity: 2/);
  r=await post({qty:4});assert.equal(r.status,400);assert.equal(rows.length,1);for(const qty of [0,-1,100,1.5,'bad'])assert.equal((await post({qty})).status,400);assert.equal(rows.length,1);
  store.minOrder=150;assert.equal((await post({qty:1})).status,201);store.minOrder=0;assert.equal((await post({})).status,201);assert.equal(product.stock,3);
 }finally{m.Business.findOne=saved.b;m.Product.findOne=saved.p;m.Lead.create=saved.l;await new Promise(r=>server.close(r));}
});
