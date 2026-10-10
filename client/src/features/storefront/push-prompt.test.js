import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldInvite, hasSeenPushInvite, rememberPushInvite, PUSH_INVITE_KEY } from './push-prompt.js';
test('first eligible visitor gets a soft invitation',()=>assert.equal(shouldInvite({state:'ask'}),true));
test('dismissed/seen visitor is never nagged automatically',()=>assert.equal(shouldInvite({state:'ask',seen:true}),false));
test('subscribed, blocked and unsupported browsers are not asked',()=>{for(const state of ['on','denied','unsupported','loading','busy'])assert.equal(shouldInvite({state}),false);});
test('waits while offer/cart/other overlays are open',()=>assert.equal(shouldInvite({state:'ask',blocked:true}),false));
test('persists across stores and revisits, survives unavailable storage',()=>{const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};assert.equal(hasSeenPushInvite(storage),false);rememberPushInvite('dismissed',storage);assert.equal(JSON.parse(map.get(PUSH_INVITE_KEY)).reason,'dismissed');assert.equal(hasSeenPushInvite(storage),true);assert.equal(hasSeenPushInvite({getItem(){throw Error('disabled');}}),true);assert.doesNotThrow(()=>rememberPushInvite('subscribed',{setItem(){throw Error('disabled');}}));});
