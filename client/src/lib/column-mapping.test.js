import test from 'node:test';import assert from 'node:assert/strict';
import {IMPORT_FIELDS,suggestMapping,mapRows} from './column-mapping.js';import {parseCsv} from './parse-csv.js';
test('suggests aliases but ambiguous names remain unmapped',()=>{
 const f=IMPORT_FIELDS.products;assert.equal(suggestMapping(['Item Name','Rate'],f).name,'Item Name');assert.equal(suggestMapping(['Name','Product Name'],f).name,'');
 assert.throws(()=>mapRows([{Name:'A'}],{name:'Name'},f));assert.throws(()=>mapRows([{Name:'A'}],{name:'Name',price:'Name'},f));
 assert.deepEqual(mapRows([{'Item Name':'Tea','Rate':'10'}],{name:'Item Name',price:'Rate'},f),[{name:'Tea',price:'10'}]);
});
test('CSV multiline values parse and malformed duplicate headers fail',()=>{
 assert.deepEqual(parseCsv('Name,Price\n"A, B",10'),[{Name:'A, B',Price:'10'}]);assert.throws(()=>parseCsv('Name,Name\nA,B'));assert.throws(()=>parseCsv('Name,Price\n"A,10'));assert.throws(()=>parseCsv('Name,Price\nA,10,extra'));
});
