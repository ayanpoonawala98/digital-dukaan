import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CLIENT_GUIDES, listState, LOAD_FAILED, stateLabel, toneOf, problemOf, stepsOf, recordCards, actions, age, confirmDisconnectText, codeText, flowStep, FLOW } from './domains-model.js';
import { isPlatformHost, customHost, clientHostAllows } from '../storefront/custom-host.js';
const base = { state: 'pending_dns', hostname: 'shop.example.com', storeName: 'Store A', serverSetupRequired: true, canActivate: false, steps: { ownership: { status: 'pending' }, dns: { status: 'unknown' }, hosting: { status: 'setup_required' }, https: { status: 'unknown' } }, routing: {}, records: { ownership: { type: 'TXT', host: '_digitalshop-verify.shop.example.com', value: 'digitalshop-verify=abc', ttl: 300 }, routing: [] } };
test('tones: green only live, amber in progress, red failure, neutral disconnected', () => {
  assert.equal(toneOf('live'), 'green'); assert.equal(toneOf('verifying'), 'amber'); assert.equal(toneOf('server_setup_required'), 'amber'); assert.equal(toneOf('failed'), 'red'); assert.equal(toneOf('disconnected'), 'neutral'); assert.equal(toneOf('nonsense'), 'neutral');
  assert.equal(stateLabel('provisioning'), 'Provisioning HTTPS');
});
test('record cards: ownership only before server setup, routing cards when sent', () => {
  assert.equal(recordCards(base).length, 1);
  const c = recordCards({ ...base, records: { ...base.records, routing: [{ type: 'A', host: 'shop.example.com', value: '203.0.113.5', ttl: 300 }] } });
  assert.deepEqual(c.map(x => x.kind), ['Ownership', 'Routing']); assert.equal(c[1].ttlText, '300 seconds');
});
test('actions: activation and personalised guide disabled until server setup', () => {
  const a = actions(base); assert.equal(a.activate, false); assert.equal(a.provision, false); assert.equal(a.guide, 'generic'); assert.equal(a.rotate, true);
  const ready = { ...base, state: 'ready_to_activate', serverSetupRequired: false, canActivate: true, steps: { ownership: { status: 'ok' }, dns: { status: 'ok' }, hosting: { status: 'ok' }, https: { status: 'ok' } } };
  assert.equal(actions(ready).activate, true); assert.equal(actions(ready).guide, 'personal');
  assert.equal(actions({ ...ready, state: 'disconnected' }).check, false);
  assert.equal(actions({ ...ready, state: 'provisioning', steps: { ...ready.steps, hosting: { status: 'pending' } } }).provision, true);
});
test('problems, steps, age, disconnect copy, flow step', () => {
  assert.equal(problemOf({ ...base, steps: { ...base.steps, ownership: { status: 'pending', code: 'OWNERSHIP_MISSING' } } }).code, 'OWNERSHIP_MISSING');
  assert.equal(problemOf(base), null);
  assert.equal(stepsOf(base)[2].text, 'Server setup required'); assert.equal(stepsOf(base)[0].tone, 'amber');
  assert.equal(age(null), 'Never'); assert.equal(age(new Date(Date.now() - 5 * 60000).toISOString()), '5 min ago');
  const t = confirmDisconnectText(base); assert.match(t, /shop\.example\.com/); assert.match(t, /Store A/); assert.match(t, /not changed/); assert.match(t, /DNS/);
  assert.equal(codeText('CHECK_TIMEOUT'), 'The check timed out. Result unknown.'); assert.equal(flowStep(base), 5, 'a saved pending domain is on verification, not Review');
});
test('host resolution: platform and preview hosts are not client hosts; client hosts never allow login/admin', () => {
  for (const h of ['digitalshop.website', 'www.digitalshop.website', 'bill.digitalshop.website', 'digital-dukaan-live.netlify.app', 'abc123--digital-dukaan-live.netlify.app', 'x.digitaldukaan.space', 'digitaldukaan.space', 'localhost', '127.0.0.1']) assert.equal(isPlatformHost(h), true, h);
  assert.equal(customHost('shop.example.com'), 'shop.example.com'); assert.equal(customHost('digitalshop.website'), null); assert.equal(customHost('other.netlify.app'), 'other.netlify.app'); assert.equal(customHost('evildigitalshop.website'), 'evildigitalshop.website'); assert.equal(customHost('x.digitaldukaan.space'), null);
  for (const p of ['/login', '/dashboard', '/superadmin', '/signup', '/set-password', '/dashboard/x']) assert.equal(clientHostAllows(p), false, p);
  for (const p of ['/', '/product/3', '/store/a']) assert.equal(clientHostAllows(p), true, p);
});
test('list state: error never shows with loading, empty and ready are distinct', () => {
  assert.equal(listState({ list: null, err: '' }), 'loading');
  assert.equal(listState({ list: null, err: 'Not found' }), 'error');
  assert.equal(listState({ list: { domains: [{ id: 1 }] }, err: 'Not found' }), 'error');
  assert.equal(listState({ list: { domains: [] }, err: '' }), 'empty');
  assert.equal(listState({ list: { domains: [{ id: 1 }] }, err: '' }), 'ready');
  assert.match(LOAD_FAILED.title, /Could not load domains/);
});
test('client guide PDFs are shipped with the client and labelled as PDFs', () => {
  assert.deepEqual(CLIENT_GUIDES.map(g => g.label), ['Client guide (English, PDF)', 'Client guide (Hindi, PDF)']);
  for (const g of CLIENT_GUIDES) { const f = new URL(`../../../public${g.href}`, import.meta.url); assert.equal(fs.readFileSync(f).subarray(0, 5).toString(), '%PDF-', g.href); assert.ok(g.href.startsWith('/guides/') && g.href.endsWith('.pdf')); }
});
test('progress step follows the saved state', () => {
  const s = (state, steps = {}) => flowStep({ ...base, state, steps: { ...base.steps, ...steps } });
  assert.equal(s('pending_dns'), 5); assert.equal(s('server_setup_required'), 5); assert.equal(s('verifying'), 5);
  assert.equal(s('provisioning'), 6); assert.equal(s('ready_to_activate'), 7); assert.equal(s('live'), 8); assert.equal(s('disconnected'), 0);
  assert.equal(s('failed', { dns: { status: 'failed' } }), 5); assert.equal(s('failed', { https: { status: 'failed' } }), 6);
  for (const st of ['pending_dns', 'server_setup_required', 'verifying']) assert.notEqual(FLOW[s(st) - 1], 'Review');
});
