// The REAL RestaurantCheckout in jsdom: edits made while phone verification is in flight must cancel the order,
// and an untouched order must still go through.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';

class FakeChannel { constructor() { const a = {}, b = {}; this.port1 = a; this.port2 = b; b.postMessage = () => { setTimeout(() => a.onmessage?.({ data: null }), 0); }; a.postMessage = () => { setTimeout(() => b.onmessage?.({ data: null }), 0); }; } }
const here = p => JSON.stringify(fileURLToPath(new URL(p, import.meta.url)));
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import RestaurantCheckout from ${here('./RestaurantCheckout.jsx')};
const cart = { items: [{ id: 1, name: 'Tea', qty: 1, price: 10, customFields: [], answers: {}, note: '' }], subtotal: 10, clear() {}, setAnswers() {}, setNote() {}, setQty() {} };
const business = { name: 'QA', tableCount: 5, blocksOrders: false, minOrder: 0, deliveryCharge: 0, freeDeliveryAbove: null };
let root;
window.__mount = async () => { root = createRoot(document.getElementById('root')); await act(async () => { root.render(<MemoryRouter><RestaurantCheckout slug="s1" business={business} cart={cart} open={true} onClose={() => {}} /></MemoryRouter>); }); };
window.__act = async fn => { await act(async () => { await fn(); }); };
window.__tick = async () => { for (let i = 0; i < 4; i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); }); };
window.__unmount = async () => { await act(async () => { root.unmount(); }); };
`;
async function boot() {
  const out = await build({ stdin: { contents: entry, resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' }, loader: { '.js': 'jsx' }, logLevel: 'silent', external: [] });
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { runScripts: 'outside-only', url: 'https://digitalshop.website/store/s1' });
  const w = dom.window, pending = [], posts = [];
  w.fetch = (url, o = {}) => new Promise(resolve => {
    const u = String(url), done = body => resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    if (u.includes('/verify/session')) pending.push(() => done({ verified: true, phone: '919876543210' }));
    else if (u.includes('/restaurant-orders')) { posts.push(JSON.parse(o.body)); done({ orderId: 9, trackingToken: 't', total: 10 }); }
    else done({});
  });
  w.IS_REACT_ACT_ENVIRONMENT = true; w.MessageChannel = FakeChannel; w.localStorage.setItem('x', '1');
  w.eval(out.outputFiles[0].text); await w.__mount();
  const $ = q => w.document.querySelector(q);
  const setVal = async (el, v) => { const proto = el.tagName === 'SELECT' ? w.HTMLSelectElement.prototype : w.HTMLInputElement.prototype; await w.__act(async () => { Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new w.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }); };
  const submit = async () => { await w.__act(async () => { $('form.restaurant-order-form button.btn-green').click(); }); await w.__tick(); };
  const answer = async () => { pending.splice(0).forEach(f => f()); await w.__tick(); };
  const table = async () => { const sel = [...w.document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === '2')); await setVal(sel, '2'); };
  return { w, $, posts, setVal, submit, answer, table, end: async () => { await w.__unmount(); w.close(); } };
}

test('untouched order proceeds after verification', async () => {
  const t = await boot(); await t.table(); await t.submit(); await t.answer();
  assert.equal(t.posts.length, 1); assert.equal(t.posts[0].tableNumber, 2); await t.end();
});
test('changing the coupon while verification is in flight cancels the order', async () => {
  const t = await boot(); await t.table(); await t.submit();
  await t.setVal(t.$('input[placeholder="SAVE10"]'), 'NEWCODE'); await t.answer();
  assert.equal(t.posts.length, 0); await t.end();
});
test('changing the table while verification is in flight cancels the order', async () => {
  const t = await boot(); await t.table(); await t.submit();
  const sel = [...t.w.document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === '3')); await t.setVal(sel, '3');
  await t.answer(); assert.equal(t.posts.length, 0); await t.end();
});
