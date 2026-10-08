import test from 'node:test';import assert from 'node:assert/strict';import {Op} from 'sequelize';import {listOptions,ownerList} from './owner-list-page.js';
test('owner list keeps tenant scope, validates batches and cursor',()=>{assert.throws(()=>listOptions({limit:100},[],{businessId:11}));assert.throws(()=>listOptions({limit:15,cursor:'bad'},[],{}));const o=listOptions({limit:15,q:'ring',status:'active'},['name'],{businessId:11});assert.equal(o.where.businessId,11);assert.equal(o.where.active,true);assert.equal(o.limit,16);assert.ok(o.where[Op.or]);});
test('owner list returns fifteen and a stable next id; legacy export stays full',async()=>{const rows=Array.from({length:34},(_,i)=>({id:34-i}));const M={findAll:async o=>o.limit?rows.slice(0,o.limit):rows,count:async()=>34};const page=await ownerList(M,'products',{query:{limit:15}}, {businessId:11},[]);assert.equal(page.products.length,15);assert.equal(page.nextCursor,'20');assert.equal(page.total,34);assert.equal(page.hasMore,true);const full=await ownerList(M,'products',{query:{}},{businessId:11},[]);assert.equal(full.products.length,34);});
test('cursor scope and totals do not inherit cursor; stable id pages have no overlap',async()=>{
 const rows=Array.from({length:34},(_,i)=>({id:34-i,businessId:12}));let countScope;
 const M={findAll:async o=>{const below=o.where[Op.and]?.[1]?.id?.[Op.lt]??100;return rows.filter(r=>r.id<below).slice(0,o.limit);},count:async o=>(countScope=o.where,34)};
 const req={query:{limit:15}};const ids=[];let cursor;
 do{req.query.cursor=cursor;const page=await ownerList(M,'products',req,{businessId:12},[]);ids.push(...page.products.map(r=>r.id));cursor=page.nextCursor;assert.equal(countScope.businessId,12);assert.equal(countScope[Op.and],undefined);}while(cursor);
 assert.equal(ids.length,34);assert.equal(new Set(ids).size,34);
});
