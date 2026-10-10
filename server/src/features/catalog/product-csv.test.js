import test from 'node:test';
import assert from 'node:assert/strict';
import {productsCsv,productCsvTemplate,PRODUCT_CSV_COLUMNS} from '../../../../client/src/lib/product-csv.js';
import {parseCsv} from '../../../../client/src/lib/parse-csv.js';
import {validateProductRows} from './product-import.js';
test('product export round trips supported import fields including multiline commas quotes and unlimited stock',()=>{
 const product={name:'Ring, "green"',price:499,stock:null,category:{name:'Rings'},description:'Green\ndiamond'};
 const parsed=parseCsv(productsCsv([product]));
 assert.deepEqual(Object.keys(parsed[0]),PRODUCT_CSV_COLUMNS);
 const result=validateProductRows(parsed);assert.deepEqual(result.errors,[]);
 assert.deepEqual(result.rows[0],{name:product.name,price:499,stock:null,category:'Rings',description:'Green\ndiamond'});
});
test('template validates and formula text is neutralized',()=>{
 assert.deepEqual(validateProductRows(parseCsv(productCsvTemplate())).errors,[]);
 assert.equal(parseCsv(productsCsv([{name:'=CMD()',price:1,stock:0,category:'Test',description:'@SUM(A1)'}]))[0].name,"'=CMD()");
 assert.equal(parseCsv(productsCsv([])).length,0);
});
