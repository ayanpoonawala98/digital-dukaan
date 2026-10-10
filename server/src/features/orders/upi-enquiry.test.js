import test from 'node:test';
import assert from 'node:assert/strict';
import {whatsappUrl,whatsappCartUrl} from '../../shared/utils/core.js';
const store={name:'Demo',whatsapp:'910000000000',slug:'demo',upiId:'demo-do-not-pay@invalid'};
const product={id:1,name:'Sample',price:99};
const draft=url=>new URL(url).searchParams.get('text');
test('single-product enquiry includes saved UPI ID without adding payment or paid claims',()=>{
 const text=draft(whatsappUrl(store,product,'',[]));assert.match(text,/Price: ₹99\.00\nUPI: demo-do-not-pay@invalid/);assert.ok(!text.includes('paid'));
 assert.ok(!draft(whatsappUrl({...store,upiId:''},product,'',[])).includes('UPI:'));
});
test('cart still includes saved UPI after total, blank UPI omitted',()=>{
 const text=draft(whatsappCartUrl(store,[{qty:1,name:'Sample',price:99}],99,0,99,''));assert.match(text,/Total: Rs\.99\.00\nUPI: demo-do-not-pay@invalid/);
 assert.ok(!draft(whatsappCartUrl({...store,upiId:''},[{qty:1,name:'Sample',price:99}],99,0,99,'')).includes('UPI:'));
});
