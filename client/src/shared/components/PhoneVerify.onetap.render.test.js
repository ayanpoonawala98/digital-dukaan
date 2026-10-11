// One tap Verify opens WhatsApp itself; blocked popup falls back to the button; spinner covers the wait.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';

class FakeChannel { constructor() { const a = {}, b = {}; this.port1 = a; this.port2 = b; b.postMessage = () => { setTimeout(() => a.onmessage?.({ data: null }), 0); }; a.postMessage = () => { setTimeout(() => b.onmessage?.({ data: null }), 0); }; } }
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import PhoneVerify from ${JSON.stringify(fileURLToPath(new URL('./PhoneVerify.jsx', import.meta.url)))};
let root;
window.__mount = async () => { root = createRoot(document.getElementById('root')); await act(async () => { root.render(<PhoneVerify slug="s1" phone="9876543210" onState={() => {}} onPhone={() => {}} />); }); for (let i = 0; i < 3; i++) await act(async () => { await new Promise(r => setTimeout(r, 15)); }); };
window.__tick = async () => { for (let i = 0; i < 3; i++) await act(async () => { await new Promise(r => setTimeout(r, 15)); }); };
window.__click = async el => { await act(async () => { el.click(); }); };
window.__unmount = async () => { await act(async () => { root.unmount(); }); };
`;
async function boot({ openResult, startOk = true }) {
  const out = await build({ stdin: { contents: entry, resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' }, logLevel: 'silent' });
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { runScripts: 'outside-only', url: 'https://digitalshop.website/store/s1' });
  const w = dom.window, opened = [], win = { closed: false, opener: {}, location: { href: '' }, close() { this.closed = true; } };
  let release; const gate = new Promise(r => { release = r; });
  w.open = (...a) => { opened.push(a); return openResult === 'blocked' ? null : win; };
  w.fetch = async url => {
    const u = String(url); const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
    if (u.includes('/verify/session')) return json({ verified: false });
    if (u.includes('/verify/start')) { await gate; return startOk ? json({ challengeId: 'c', expiresInSeconds: 600, link: 'https://wa.me/919326069692?text=DS%20VERIFY%20x' }) : json({ error: 'Too many tries' }, 429); }
    return json({ status: 'pending' });
  };
  w.IS_REACT_ACT_ENVIRONMENT = true; w.MessageChannel = FakeChannel;
  w.eval(out.outputFiles[0].text); await w.__mount();
  return { w, win, opened, release, text: () => w.document.body.textContent, spin: () => w.document.querySelectorAll('.ds-spin').length, end: async () => { await w.__unmount(); w.close(); } };
}
const verifyBtn = t => [...t.w.document.querySelectorAll('button')].find(b => /Verify with WhatsApp|Starting/.test(b.textContent));

test('one tap: the tab opens inside the tap, spinner while the code is made, then WhatsApp loads in it', async () => {
  const t = await boot({});
  await t.w.__click(verifyBtn(t));
  assert.equal(t.opened.length, 1, 'window.open called synchronously in the tap'); assert.equal(t.opened[0][0], 'about:blank');
  assert.ok(t.spin() >= 1 && /Starting/.test(t.text()), 'spinner while the challenge is created');
  t.release(); await t.w.__tick();
  assert.match(t.win.location.href, /^https:\/\/wa\.me\/919326069692/); assert.equal(t.win.opener, null);
  assert.match(t.text(), /WhatsApp opened\./); assert.ok(t.spin() >= 1, 'spinner while waiting for the message');
  assert.ok([...t.w.document.querySelectorAll('a')].some(a => /Open WhatsApp/.test(a.textContent)), 'fallback button stays');
  await t.end();
});
test('blocked popup: no "opened" claim, the green Open WhatsApp button is the way forward', async () => {
  const t = await boot({ openResult: 'blocked' });
  await t.w.__click(verifyBtn(t)); t.release(); await t.w.__tick();
  assert.ok(!/WhatsApp opened\./.test(t.text())); const a = [...t.w.document.querySelectorAll('a')].find(x => /Open WhatsApp/.test(x.textContent));
  assert.ok(a && /btn-green/.test(a.className) && a.href.startsWith('https://wa.me/'));
  await t.end();
});
test('start fails: the pre-opened tab is closed and the error shows', async () => {
  const t = await boot({ startOk: false });
  await t.w.__click(verifyBtn(t)); t.release(); await t.w.__tick();
  assert.equal(t.win.closed, true); assert.match(t.text(), /Too many tries/); assert.ok(verifyBtn(t));
  await t.end();
});
