// Placing state: the modal stays up (spinner) until the order attempt settles, cannot be dismissed meanwhile, and goes away on success AND failure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';

class FakeChannel { constructor() { const a = {}, b = {}; this.port1 = a; this.port2 = b; b.postMessage = () => { setTimeout(() => a.onmessage?.({ data: null }), 0); }; a.postMessage = () => { setTimeout(() => b.onmessage?.({ data: null }), 0); }; } }
const entry = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { useVerifyGate } from ${JSON.stringify(fileURLToPath(new URL('./VerifyGate.jsx', import.meta.url)))};
let root;
function Shop() {
  const [phone, setPhone] = useState('9876543210'); const [placed, setPlaced] = useState(0);
  const gate = useVerifyGate({ slug: 's1', phone, setPhone, onProceed: () => new Promise((res, rej) => { window.__settle = { res: () => { setPlaced(n => n + 1); res(); }, rej }; }), active: true, contextKey: 'a' });
  return <div><span id="placed">{placed}</span><button id="order" onClick={() => gate.run()}>Place</button>{gate.modal}</div>;
}
window.__mount = async () => { root = createRoot(document.getElementById('root')); await act(async () => { root.render(<Shop />); }); };
window.__tick = async () => { for (let i = 0; i < 4; i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); }); };
window.__act = async fn => { await act(async () => { await fn(); }); };
window.__unmount = async () => { await act(async () => { root.unmount(); }); };
`;
async function reachPlacing() {
  const out = await build({ stdin: { contents: entry, resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' }, logLevel: 'silent' });
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { runScripts: 'outside-only', url: 'https://digitalshop.website/store/s1' });
  const w = dom.window; let verified = false;
  w.fetch = async url => { const u = String(url), j = b => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (u.includes('/verify/session')) return j({ verified: false });
    if (u.includes('/verify/start')) return j({ challengeId: 'c', expiresInSeconds: 600, link: 'https://wa.me/x' });
    return j({ status: verified ? 'verified' : 'pending' }); };
  w.open = () => null; w.IS_REACT_ACT_ENVIRONMENT = true; w.MessageChannel = FakeChannel;
  w.eval(out.outputFiles[0].text); await w.__mount();
  const $ = q => w.document.querySelector(q);
  await w.__act(() => $('#order').click()); await w.__tick();
  await w.__act(() => [...w.document.querySelectorAll('[role=dialog] button')].find(b => /Verify with WhatsApp/.test(b.textContent)).click()); await w.__tick();
  verified = true; await new Promise(r => setTimeout(r, 2700)); await w.__tick();
  return { w, $, end: async () => { await w.__unmount(); w.close(); } };
}
test('placing: modal shows a spinner, cannot be dismissed, and closes when the order succeeds', async () => {
  const t = await reachPlacing();
  const d = t.$('[role=alertdialog]'); assert.ok(d, 'placing dialog is up while the order promise is pending'); assert.equal(d.getAttribute('aria-busy'), 'true');
  assert.match(d.textContent, /Placing your order/); assert.ok(d.querySelector('.ds-spin')); assert.equal(t.$('#placed').textContent, '0');
  assert.ok(![...d.querySelectorAll('button')].length, 'no Cancel while placing');
  await t.w.__act(() => t.w.document.dispatchEvent(new t.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))); await t.w.__tick();
  assert.ok(t.$('[role=alertdialog]'), 'Escape does not dismiss');
  await t.w.__act(() => t.$('.modal-overlay').dispatchEvent(new t.w.MouseEvent('mousedown', { bubbles: true }))); await t.w.__tick();
  assert.ok(t.$('[role=alertdialog]'), 'overlay click does not dismiss');
  await t.w.__act(() => t.w.__settle.res()); await t.w.__tick();
  assert.equal(t.$('[role=alertdialog]'), null); assert.equal(t.$('[role=dialog]'), null); assert.equal(t.$('#placed').textContent, '1');
  await t.end();
});
test('placing: modal also disappears when the order attempt fails', async () => {
  const t = await reachPlacing();
  assert.ok(t.$('[role=alertdialog]'));
  await t.w.__act(() => t.w.__settle.rej(new Error('boom'))); await t.w.__tick();
  assert.equal(t.$('[role=alertdialog]'), null); assert.equal(t.$('[role=dialog]'), null); assert.equal(t.$('#placed').textContent, '0');
  await t.end();
});
