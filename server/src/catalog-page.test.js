import test from 'node:test';import assert from 'node:assert/strict';import {Op} from 'sequelize';import {catalogCursor,afterCatalogCursor,catalogResult} from './catalog-page.js';
test('15-row cursor pages have stable tie breaker and no overlap',()=>{
 const rows=Array.from({length:31},(_,i)=>({id:31-i,featured:i<18,createdAt:'2026-10-08T12:00:00.000Z'}));const first=catalogResult(rows.slice(0,16),31);assert.equal(first.products.length,15);assert.equal(first.hasMore,true);
 const page=catalogCursor({limit:'15',cursor:first.nextCursor});assert.equal(page.cursor.id,17);const where=afterCatalogCursor(page.cursor);assert.equal(where[Op.or].at(-1).id[Op.lt],17);
 const second=catalogResult(rows.slice(15,31),31);assert.equal(second.products.length,15);assert.equal(new Set([...first.products,...second.products].map(p=>p.id)).size,30);
 const last=catalogResult(rows.slice(30),31);assert.equal(last.hasMore,false);assert.equal(last.nextCursor,null);
});
test('pagination validation, full export compatibility and empty results',()=>{
 assert.equal(catalogCursor({}),null);assert.throws(()=>catalogCursor({limit:'100'}));assert.throws(()=>catalogCursor({limit:'15',cursor:'bad'}));assert.deepEqual(catalogResult([],0),{products:[],total:0,hasMore:false,nextCursor:null});assert.deepEqual(afterCatalogCursor(null),{});
});
