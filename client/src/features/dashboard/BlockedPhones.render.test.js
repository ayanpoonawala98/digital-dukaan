// BlockToggle must match the EXACT normalized number: +1 and +91 numbers that share the last 10 digits are different customers.
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
import { BlockToggle } from ${here('./BlockedPhones.jsx')};
let root;
window.__mount = async phone => { root = createRoot(document.getElementById('root')); await act(async () => { root.render(<BlockToggle token="t" storeId={1} phone={phone}/>); }); };
window.__tick = async () => { for (let i = 0; i < 4; i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); }); };
window.__click = async el => { await act(async () => { el.click(); }); };
window.__unmount = async () => { await act(async () => { root.unmount(); }); };
`;
async function boot(phone) {
  const out = await build({ stdin: { contents: entry, resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' }, loader: { '.js': 'jsx' }, logLevel: 'silent' });
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { runScripts: 'outside-only', url: 'https://digitalshop.website/dashboard' });
  const w = dom.window, calls = [];
  w.fetch = async (url, o = {}) => { calls.push(`${o.method || 'GET'} ${url}`); const body = (o.method || 'GET') === 'GET' ? { blocked: [{ id: 1, phone: '919876543210' }], truncated: false } : { ok: true }; return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }); };
  w.IS_REACT_ACT_ENVIRONMENT = true; w.MessageChannel = FakeChannel; w.localStorage.setItem('x', '1');
  w.eval(out.outputFiles[0].text); await w.__mount(phone); await w.__tick();
  return { w, calls, text: () => w.document.body.textContent, btn: re => [...w.document.querySelectorAll('button')].find(b => re.test(b.textContent)), end: async () => { await w.__unmount(); w.close(); } };
}
test('a +1 number sharing the last 10 digits with a blocked +91 number is NOT shown as blocked, and cannot unblock it', async () => {
  const t = await boot('+1 987 654 3210');
  assert.ok(!/Blocked: this number/.test(t.text())); assert.ok(t.btn(/Block this customer/)); assert.equal(t.btn(/^Unblock$/), undefined);
  await t.end();
});
test('the exact blocked number shows Blocked and Unblock deletes exactly that number', async () => {
  const t = await boot('+91 98765 43210');
  assert.match(t.text(), /Blocked: this number/);
  await t.w.__click(t.btn(/^Unblock$/)); await t.w.__tick();
  assert.ok(t.calls.some(c => c.startsWith('DELETE ') && c.endsWith('/blocked-phones/919876543210')), t.calls.join(' | '));
  await t.end();
});
