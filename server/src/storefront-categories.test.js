import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {populatedCategories} from './storefront-categories.js';
test('only categories containing catalogue products appear, preserving order and stock-zero products',()=>{
 const cats=[{id:1,name:'Empty'},{id:2,name:'Live'},{id:3,name:'Out'}];
 assert.deepEqual(populatedCategories(cats,[{categoryId:2},{categoryId:'3',stock:0},{categoryId:null}]),cats.slice(1));assert.deepEqual(populatedCategories(cats,[]),[]);
});
test('storefront lookup scopes visible category membership to active tenant products',()=>{
 const s=fs.readFileSync(new URL('./routes/public.js',import.meta.url),'utf8');assert.match(s,/where: \{ businessId: business.id, active: true \}, attributes: \['categoryId'\]/);
});
test('category row is single-line with horizontal overflow and nonshrinking pills',()=>{
 const s=fs.readFileSync(new URL('../../client/src/styles.css',import.meta.url),'utf8');assert.match(s,/\.filter-tabs \{[^}]*flex-wrap: nowrap;[^}]*overflow-x: auto/);assert.match(s,/\.filter-tabs button \{ flex: 0 0 auto; white-space: nowrap;/);
});
