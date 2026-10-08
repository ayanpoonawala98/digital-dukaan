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
test('100 catalogue records use 15 initially then ten until exhausted',()=>{
 const all=Array.from({length:100},(_,i)=>({id:100-i,featured:false,createdAt:'2026-10-08T12:00:00.000Z'}));let offset=0;const counts=[],ids=[];
 while(offset<100){const size=offset===0?15:10;const page=catalogResult(all.slice(offset,offset+size+1),100,size);ids.push(...page.products.map(p=>p.id));offset+=page.products.length;counts.push(offset);assert.equal(page.hasMore,offset<100);}
 assert.deepEqual(counts,[15,25,35,45,55,65,75,85,95,100]);assert.equal(new Set(ids).size,100);assert.equal(catalogCursor({limit:10}).limit,10);
});
