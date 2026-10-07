import test from 'node:test';import assert from 'node:assert/strict';
process.env.DATABASE_URL ||= 'postgres://local:local@localhost/test';
const {aggregateSales,salesCsv}=await import('./platform-sales.js');
test('sales include fulfilled retail/services and restaurant only; commission uses historical store rate',()=>{
 const stores=[{id:1,name:'First',ownerId:2},{id:8,name:'QA',ownerId:3}],owners=[{id:2,name:'Owner'}];
 const leads=[{id:1,businessId:1,status:'delivered',price:90,createdAt:'2026-10-01T20:00:00Z',items:[{name:'Pen',qty:2,price:50}],paymentStatus:'paid'},{id:2,businessId:1,status:'new',price:400,createdAt:'2026-10-01'},{id:3,businessId:1,status:'cancelled',price:900,createdAt:'2026-10-01'},{id:4,businessId:8,status:'completed',price:100,createdAt:'2026-10-03'}];
 const orders=[{id:1,businessId:1,status:'served',total:200,createdAt:'2026-10-04',items:[{name:'Meal',qty:1,price:200}]}];
 const rules=[{businessId:1,percent:10,effectiveFrom:'2026-10-01'},{businessId:1,percent:20,effectiveFrom:'2026-10-03'}];
 const r=aggregateSales(stores,owners,leads,orders,rules);
 assert.equal(r.totals.sales,390);assert.equal(r.totals.commission,49);assert.equal(r.totals.requests,1);assert.equal(r.totals.cancelled,1);assert.equal(r.totals.paidSales,90);assert.equal(r.stores[1].commission,0);assert.equal(r.daily[0].date,'2026-10-02');assert.equal(r.products.find(p=>p.name==='Pen').units,2);assert.equal(r.products.find(p=>p.name==='Pen').itemValue,100);
 assert.match(salesCsv({...r,caveat:'Not a bill'}),/Not a bill/);
});
test('unknown stores excluded; products with same names remain store-specific',()=>{
 const r=aggregateSales([{id:1},{id:2}],[],[{businessId:1,status:'delivered',price:50,productName:'Same',createdAt:'2026-10-01'},{businessId:2,status:'completed',price:60,productName:'Same',createdAt:'2026-10-01'},{businessId:3,status:'completed',price:999,createdAt:'2026-10-01'}],[],[]);
 assert.equal(r.products.length,2);assert.equal(r.totals.sales,110);assert.equal(r.totals.commission,0);
});
