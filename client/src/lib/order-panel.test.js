import test from 'node:test';
import assert from 'node:assert/strict';
import {safeDashboardReturn,requestedOrderStore} from './order-panel.js';
test('login return is local dashboard only',()=>{
 assert.equal(safeDashboardReturn('/dashboard?store=qa&tab=leads'),'/dashboard?store=qa&tab=leads');
 for(const bad of ['https://evil.invalid','//evil.invalid','/dashboard/../admin','/dashboard\\evil','/store/qa',null]) assert.equal(safeDashboardReturn(bad),'/dashboard');
});
test('panel chooses the requested authorized store, never a different first store',()=>{
 const stores=[{id:1,slug:'first'},{id:8,slug:'qa'}];
 assert.equal(requestedOrderStore(stores,'?store=qa&tab=leads').id,8);
 assert.equal(requestedOrderStore(stores,'?store=missing&tab=leads'),false);
 assert.equal(requestedOrderStore(stores,'?tab=settings'),null);
});
