// ManualLeadOrder: the "Add order" form lists products, validates, posts the order and refreshes the list.
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
import ManualLeadOrder from ${here('./ManualLeadOrder.jsx')};
let root;
window.__created = 0; window.__storeType = '';
window.__mount = async () => { root = createRoot(document.getElementById('root')); await act(async () => { root.render(<ManualLeadOrder token="t" storeId={1} storeType={window.__storeType || 'retail'} onCreated={() => window.__created++}/>); }); };
window.__tick = async () => { for (let i = 0; i < 6; i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); }); };
window.__click = async el => { await act(async () => { el.click(); }); };
window.__setSelect = async (el, v) => { await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new window.Event('change', { bubbles: true })); }); };
window.__submit = async form => { await act(async () => { form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); }); };
window.__unmount = async () => { await act(async () => { root.unmount(); }); };
`;
async function boot() {
  const out = await build({ stdin: { contents: entry, resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' }, loader: { '.js': 'jsx' }, logLevel: 'silent' });
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { runScripts: 'outside-only', url: 'https://digitalshop.website/dashboard' });
  const w = dom.window, calls = [];
  w.fetch = async (url, o = {}) => {
    const method = o.method || 'GET';
    calls.push(`${method} ${url} ${o.body || ''}`);
    const body = method === 'GET'
      ? { products: [{ id: 91, name: 'Atta', price: 40, stock: 10, active: true }, { id: 92, name: 'Hidden', price: 5, stock: 1, active: false }], total: 2 }
      : { order: { id: 901 } };
    return new Response(JSON.stringify(body), { status: method === 'GET' ? 200 : 201, headers: { 'Content-Type': 'application/json' } });
  };
  w.IS_REACT_ACT_ENVIRONMENT = true; w.MessageChannel = FakeChannel; w.localStorage.setItem('x', '1');
  w.eval(out.outputFiles[0].text); await w.__mount(); await w.__tick();
  return { w, calls, text: () => w.document.body.textContent, btn: re => [...w.document.querySelectorAll('button')].find(b => re.test(b.textContent)), end: async () => { await w.__unmount(); w.close(); } };
}

test('Add order opens the form, lists only live products, posts the order and refreshes', async () => {
  const t = await boot();
  assert.ok(t.btn(/^Add order$/)); assert.ok(!t.w.document.querySelector('select'));
  await t.w.__click(t.btn(/^Add order$/)); await t.w.__tick();
  assert.ok(t.calls.some(c => c.startsWith('GET /api/owner/1/products')), t.calls.join(' | '));
  const options = [...t.w.document.querySelectorAll('select option')].map(o => o.textContent);
  assert.equal(options.length, 2); // placeholder + Atta; the hidden product is not offered
  assert.ok(options.some(o => /Atta/.test(o)));
  await t.w.__setSelect(t.w.document.querySelector('select'), '91'); await t.w.__tick();
  assert.match(t.text(), /₹40/);
  await t.w.__submit(t.w.document.querySelector('form')); await t.w.__tick();
  const post = t.calls.find(c => c.startsWith('POST /api/owner/1/leads'));
  assert.ok(post, t.calls.join(' | '));
  assert.match(post, /"items":\[{"id":91,"qty":1}\]/);
  assert.equal(t.w.__created, 1);
  assert.ok(t.btn(/^Add order$/)); // form closed after saving
  await t.end();
});

test('submitting with no product chosen shows an inline error and posts nothing', async () => {
  const t = await boot();
  await t.w.__click(t.btn(/^Add order$/)); await t.w.__tick();
  await t.w.__submit(t.w.document.querySelector('form')); await t.w.__tick();
  assert.match(t.text(), /Add at least one item/);
  assert.ok(!t.calls.some(c => c.startsWith('POST ')), t.calls.join(' | '));
  assert.equal(t.w.__created, 0);
  await t.end();
});

test('the button stays hidden on service stores while scope is under review', async () => {
  const t = await boot();
  t.w.__storeType = 'service';
  await t.w.__unmount();
  const root = t.w.document.getElementById('root');
  await t.w.__mount(); await t.w.__tick();
  assert.ok(!t.btn(/^Add order$/)); assert.ok(!t.calls.some(c => c.startsWith('GET ')), t.calls.join(' | '));
  await t.w.__unmount(); t.w.close();
});

test('the form opens as a labelled dialog and the backdrop closes it', async () => {
  const t = await boot();
  await t.w.__click(t.btn(/^Add order$/)); await t.w.__tick();
  const dialog = t.w.document.querySelector('[role="dialog"]');
  assert.ok(dialog); assert.equal(dialog.getAttribute('aria-modal'), 'true');
  await t.w.__click(dialog); await t.w.__tick(); // backdrop click
  assert.ok(!t.w.document.querySelector('[role="dialog"]'));
  assert.ok(t.btn(/^Add order$/));
  await t.end();
});
