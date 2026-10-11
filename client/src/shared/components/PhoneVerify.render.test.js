// Rendered interaction test: real React + real PhoneVerify in jsdom, a parent that passes INLINE callbacks and stores an object in state
// (the exact shape ContactFields uses). The session check must run once, not on every parent render.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';

// React's scheduler needs a MessageChannel. Node's real one keeps the process alive, so use a timer-backed stand-in.
class FakeChannel { constructor() { const a = {}, b = {}; this.port1 = a; this.port2 = b; b.postMessage = () => { setTimeout(() => a.onmessage?.({ data: null }), 0); }; a.postMessage = () => { setTimeout(() => b.onmessage?.({ data: null }), 0); }; } }
const entry = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import PhoneVerify from ${JSON.stringify(fileURLToPath(new URL('./PhoneVerify.jsx', import.meta.url)))};
function Parent() {
  const [v, setV] = useState({}); const [phone, setPhone] = useState('9876543210');
  return <div><span id="s">{JSON.stringify(v)}</span><PhoneVerify slug="s1" phone={phone} onState={x => setV(x)} onPhone={p => setPhone(p)} /></div>;
}
import { useVerifyGate } from ${JSON.stringify(fileURLToPath(new URL('./VerifyGate.jsx', import.meta.url)))};
let setActiveFn, setCtxFn;
function Shop() {
  const [phone, setPhone] = useState('9876543210'); const [placed, setPlaced] = useState(0); const [active, setActive] = useState(true), [ctx, setCtx] = useState('a');
  setActiveFn = setActive; setCtxFn = setCtx;
  const gate = useVerifyGate({ slug: 's1', phone, setPhone, onProceed: () => setPlaced(n => n + 1), active, contextKey: ctx });
  return <div><span id="placed">{placed}</span><button id="order" onClick={() => gate.run()}>Place</button>{gate.modal}</div>;
}
let theRoot;
window.__mountShop = async () => { theRoot = createRoot(document.getElementById('root')); await act(async () => { theRoot.render(<Shop />); }); };
window.__setActive = async v => { await act(async () => { setActiveFn(v); }); };
window.__setCtx = async v => { await act(async () => { setCtxFn(v); }); };
window.__unmountParent = async () => { await act(async () => { try { rootA?.unmount(); } catch {} try { theRoot?.unmount(); } catch {} }); };
window.__unmountShop = async () => { await act(async () => { theRoot.unmount(); theRoot = null; }); };
window.__tick = async () => { for (let i = 0; i < 4; i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); }); };
let rootA;
window.__mount = async () => { const el = document.getElementById('root'); const root = rootA = createRoot(el); await act(async () => { root.render(<Parent />); }); for (let i = 0; i < 5; i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); }); };
`;

test('PhoneVerify with inline parent callbacks checks the session once and settles', async () => {
  const out = await build({ stdin: { contents: entry, resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' }, loader: { '.js': 'jsx' }, logLevel: 'silent' });
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { runScripts: 'outside-only', url: 'https://digitalshop.website/store/s1' });
  const calls = [];
  dom.window.fetch = async url => { calls.push(String(url)); return new Response(JSON.stringify({ verified: false }), { status: 200, headers: { 'Content-Type': 'application/json' } }); };
  dom.window.IS_REACT_ACT_ENVIRONMENT = true; dom.window.MessageChannel = FakeChannel;
  dom.window.eval(out.outputFiles[0].text);
  await dom.window.__mount();
  const sessionCalls = calls.filter(u => u.includes('/verify/session')).length;
  assert.equal(sessionCalls, 1, `session checked ${sessionCalls} times: ${calls.join(', ')}`);
  assert.match(dom.window.document.getElementById('s').textContent, /"required":true/);
  assert.ok(!dom.window.document.body.textContent.includes('Could not check'), 'session check succeeded');
  await (dom.window.__unmountParent?.()); dom.window.close();
});

test('ordering opens the verify modal only on Place Order, then proceeds once verified', async () => {
  const out = await build({ stdin: { contents: entry, resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' }, loader: { '.js': 'jsx' }, logLevel: 'silent' });
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { runScripts: 'outside-only', url: 'https://digitalshop.website/store/s1' });
  const calls = []; let verified = false;
  dom.window.fetch = async (url, o = {}) => {
    calls.push(String(url));
    const body = String(url).includes('/verify/session') ? { verified, phone: '919876543210' } : String(url).includes('/verify/start') ? { challengeId: 'c', expiresInSeconds: 600, link: 'https://wa.me/x' } : { status: verified ? 'verified' : 'pending' };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  dom.window.IS_REACT_ACT_ENVIRONMENT = true; dom.window.MessageChannel = FakeChannel;
  dom.window.eval(out.outputFiles[0].text);
  await dom.window.__mountShop(); await dom.window.__tick();
  assert.equal(calls.length, 0, 'browsing makes no verify call');
  assert.equal(dom.window.document.querySelector('[role=dialog]'), null);
  dom.window.document.getElementById('order').click(); await dom.window.__tick();
  assert.ok(dom.window.document.querySelector('[role=dialog]'), 'modal opens on Place Order ');
  assert.equal(dom.window.document.getElementById('placed').textContent, '0', 'order not placed before verification');
  const vb = [...dom.window.document.querySelectorAll('[role=dialog] button')].find(b => /Verify with WhatsApp/.test(b.textContent)); assert.ok(vb, 'verify button in modal'); vb.click(); await dom.window.__tick();
  verified = true; await new Promise(r => setTimeout(r, 2700)); await dom.window.__tick();
  assert.equal(dom.window.document.getElementById('placed').textContent, '1', 'order proceeds after verification');
  assert.equal(dom.window.document.querySelector('[role=dialog]'), null);
  await (dom.window.__unmountParent?.()); dom.window.close();
});

// ---- stale-intent regressions: a late response must never place an order after the ordering UI went away ----
async function boot() {
  const out = await build({ stdin: { contents: entry, resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' }, loader: { '.js': 'jsx' }, logLevel: 'silent' });
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { runScripts: 'outside-only', url: 'https://digitalshop.website/store/s1' });
  const pending = []; let sessionBody = { verified: true, phone: '919876543210' }, statusBody = { status: 'pending' };
  dom.window.fetch = url => new Promise(resolve => {
    const u = String(url), done = body => resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    if (u.includes('/verify/session')) pending.push(() => done(sessionBody));
    else if (u.includes('/verify/start')) done({ challengeId: 'c', expiresInSeconds: 600, link: 'https://wa.me/x' });
    else pending.push(() => done(statusBody)), void 0;
  });
  dom.window.IS_REACT_ACT_ENVIRONMENT = true; dom.window.MessageChannel = FakeChannel;
  dom.window.eval(out.outputFiles[0].text);
  await dom.window.__mountShop();
  const w = dom.window, $ = q => w.document.querySelector(q);
  return { w, $, placed: () => $('#placed').textContent, tap: async () => { $('#order').click(); await w.__tick(); },
    answer: async (body) => { if (body) sessionBody = body; const f = pending.splice(0); f.forEach(x => x()); await w.__tick(); },
    setStatus: b => { statusBody = b; }, end: async () => { await w.__unmountParent(); w.close(); } };
}
test('closing the order UI before the session response cancels the order', async () => {
  const t = await boot(); await t.tap(); await t.w.__setActive(false); await t.answer();
  assert.equal(t.placed(), '0'); await t.end();
});
test('changing the cart/order context while the session check is in flight cancels the order', async () => {
  const t = await boot(); await t.tap(); await t.w.__setCtx('b'); await t.answer();
  assert.equal(t.placed(), '0'); await t.end();
});
test('unmounting before the session response places nothing and does not throw', async () => {
  const t = await boot(); await t.tap(); await t.w.__unmountShop(); await t.answer();
  assert.equal(t.w.document.getElementById('placed'), null); await t.end();
});
test('a newer tap supersedes an older one: exactly one order proceeds', async () => {
  const t = await boot(); await t.tap(); await t.w.__setCtx('b'); await t.tap(); await t.answer();
  assert.equal(t.placed(), '1'); await t.end();
});
test('Cancel in the modal, then a late verified poll, places nothing', async () => {
  const t = await boot(); await t.tap(); await t.answer({ verified: false }); await t.answer();
  assert.ok(t.$('[role=dialog]'), 'modal open');
  [...t.w.document.querySelectorAll('[role=dialog] button')].find(b => /Verify with WhatsApp/.test(b.textContent)).click(); await t.w.__tick();
  t.setStatus({ status: 'verified' });
  [...t.w.document.querySelectorAll('[role=dialog] button')].filter(b => b.textContent === 'Cancel').pop().click(); await t.w.__tick();
  assert.equal(t.$('[role=dialog]'), null); await t.answer(); await new Promise(r => setTimeout(r, 2700)); await t.answer();
  assert.equal(t.placed(), '0'); await t.end();
});
test('the drawer closing while the modal is open removes the modal and places nothing', async () => {
  const t = await boot(); await t.tap(); await t.answer({ verified: false });
  assert.ok(t.$('[role=dialog]')); await t.w.__setActive(false);
  assert.equal(t.$('[role=dialog]'), null); assert.equal(t.placed(), '0'); await t.end();
});
