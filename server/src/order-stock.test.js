import test from 'node:test';import assert from 'node:assert/strict';import {updateOrderStock,orderQuantities,RETAIL_DEDUCT} from './order-stock.js';
function fixture({stock=10,kind='product',legacy=false,items=[{productId:5,qty:2}],status='new'}={}){
 const order={id:1,businessId:7,status,items,update:async function(v){Object.assign(this,v);}},product={id:5,businessId:7,name:'Ring',stock,kind,update:async function(v){Object.assign(this,v);}};let saved,transactions=0;
 const ledgerModel={findOne:async()=>saved,create:async v=>saved={...v,settled:false,update:async function(v){Object.assign(this,v);}}};
 const deps={sequelize:{transaction:async fn=>{transactions++;const snap={stock:product.stock,status:order.status,ledger:saved?{...saved}:undefined};try{return await fn({LOCK:{UPDATE:'UPDATE'}});}catch(e){product.stock=snap.stock;order.status=snap.status;saved=snap.ledger;throw e;}}},Order:{findOne:async({where})=>where.businessId===7?order:null},Product:{findOne:async({where})=>where.businessId===7&&where.id===5?product:null},Ledger:ledgerModel,businessId:7,orderId:1,kind:'lead',deductStatuses:RETAIL_DEDUCT,grandfather:()=>legacy};
 return {order,product,run:status=>updateOrderStock({...deps,status}),deps,get ledger(){return saved;}};
}
test('new placement untouched, confirmed down once, active transitions keep deducted, placed/cancel restore once',async()=>{
 const f=fixture();await f.run('new');assert.equal(f.product.stock,10);await f.run('confirmed');assert.equal(f.product.stock,8);await f.run('confirmed');await f.run('shipped');assert.equal(f.product.stock,8);await f.run('packed');assert.equal(f.product.stock,8);await f.run('packed');assert.equal(f.product.stock,8);await f.run('shipped');assert.equal(f.product.stock,8);await f.run('new');assert.equal(f.product.stock,10);await f.run('delivered');assert.equal(f.product.stock,8);await f.run('cancelled');await f.run('cancelled');assert.equal(f.product.stock,10);
});
test('insufficient stock, missing products and wrong tenants roll back without status changes',async()=>{
 const f=fixture({stock:1});await assert.rejects(f.run('confirmed'),/Insufficient/);assert.equal(f.product.stock,1);assert.equal(f.order.status,'new');
 const g=fixture({items:[{productId:99,qty:1}]});await assert.rejects(g.run('confirmed'),/deleted/);assert.equal(g.order.status,'new');
 assert.equal(await updateOrderStock({...f.deps,businessId:8,status:'confirmed'}),null);
});
test('unlimited/services do not change stock or later decrement after manual finite stock setting',async()=>{
 for(const opts of [{stock:null},{kind:'service'}]){const f=fixture(opts);await f.run('confirmed');assert.equal(f.product.stock,opts.stock===null?null:10);f.product.stock=30;await f.run('delivered');assert.equal(f.product.stock,30);await f.run('cancelled');assert.equal(f.product.stock,30);}
});
test('explicit legacy flag never deducts or restores historic inventory',async()=>{const f=fixture({legacy:true,status:'confirmed'});await f.run('packed');await f.run('confirmed');await f.run('cancelled');assert.equal(f.product.stock,10);});
test('group duplicate quantities, stable IDs, no name fallback',()=>{assert.deepEqual(orderQuantities({items:[{productId:5,qty:2},{id:5,qty:3},{productId:2,qty:1}]}),[{productId:2,qty:1},{productId:5,qty:5}]);assert.throws(()=>orderQuantities({items:[{name:'Ring',qty:1}]}),/matched/);});
