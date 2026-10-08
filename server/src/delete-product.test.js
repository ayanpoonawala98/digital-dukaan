import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteCatalogProduct } from './delete-product.js';
test('product delete detaches only tenant references and preserves enquiry snapshots in one transaction', async () => {
 const tx={LOCK:{UPDATE:'UPDATE'}}, calls=[];
 const historical={productId:91,productName:'Ring',price:499,items:[{id:91,name:'Ring',price:499}],status:'completed'};
 const sequelize={transaction:async callback=>callback(tx)};
 const Product={findOne:async options=>{calls.push(['find',options]);return {destroy:async options=>calls.push(['destroy',options])};}};
 const Lead={update:async (values,options)=>{calls.push(['detach',values,options]);Object.assign(historical,values);}};
 assert.equal(await deleteCatalogProduct({sequelize,Product,Lead,businessId:11,productId:91}),true);
 assert.deepEqual(calls[0][1],{where:{id:91,businessId:11},transaction:tx,lock:'UPDATE'});
 assert.deepEqual(calls[1],['detach',{productId:null},{where:{productId:91,businessId:11},transaction:tx}]);
 assert.deepEqual(calls[2],['destroy',{transaction:tx}]);
 assert.deepEqual(historical,{productId:null,productName:'Ring',price:499,items:[{id:91,name:'Ring',price:499}],status:'completed'});
});
test('absent or wrong-tenant product does not touch enquiries',async()=>{
 let changed=false;const tx={LOCK:{UPDATE:'UPDATE'}};
 assert.equal(await deleteCatalogProduct({sequelize:{transaction:async fn=>fn(tx)},Product:{findOne:async()=>null},Lead:{update:async()=>{changed=true;}},businessId:12,productId:91}),false);
 assert.equal(changed,false);
});
test('delete failure propagates within managed transaction so detachment rolls back',async()=>{
 let rolledBack=false,detached=false;const tx={LOCK:{UPDATE:'UPDATE'}};
 const sequelize={transaction:async fn=>{try{return await fn(tx);}catch(e){rolledBack=true;detached=false;throw e;}}};
 await assert.rejects(deleteCatalogProduct({sequelize,Product:{findOne:async()=>({destroy:async()=>{throw Error('constraint');}})},Lead:{update:async()=>{detached=true;}},businessId:11,productId:91}),/constraint/);
 assert.equal(rolledBack,true);assert.equal(detached,false);
});
