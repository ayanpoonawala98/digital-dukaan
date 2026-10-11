import test from 'node:test';
import assert from 'node:assert/strict';
import { formatAge, formatChecked, displayRows, summarize, allConnectivityOperational, buildFrontendRows, rowAriaLabel, latencyText, scopeLabel, afterRefresh } from './system-status-model.js';

const r = (o = {}) => ({ id: 'x', section: 'Platform', scope: 'platform', name: 'Database', checkType: 'connectivity', state: 'ok', label: 'Operational', code: 'DB_OK', reason: '', nextStep: '', latencyMs: 12, checkedAt: new Date().toISOString(), detail: '', verified: true, excluded: false, ...o });

test('age text', () => {
  assert.equal(formatAge(2000), 'just now'); assert.equal(formatAge(30000), '30 sec ago'); assert.equal(formatAge(5 * 60000), '5 min ago'); assert.equal(formatAge(3 * 3600000), '3 hr ago');
  const c = formatChecked('2026-10-11T08:31:05Z', Date.parse('2026-10-11T08:36:05Z'), 'en-IN');
  assert.match(c.clock, /\d/); assert.equal(c.age, '5 min ago');
  assert.deepEqual(formatChecked('nope'), { clock: '', age: '' });
});
test('stale ok results never look green; checking never keeps the old colour', () => {
  const old = r({ checkedAt: new Date(Date.now() - 10 * 60000).toISOString() });
  const [a] = displayRows([old], { ttlMs: 300000 });
  assert.equal(a.state, 'unknown'); assert.match(a.label, /^Stale/); assert.equal(a.verified, false);
  const [b] = displayRows([r()], { ttlMs: 300000, checking: true });
  assert.equal(b.state, 'checking'); assert.equal(b.label, 'Checking');
  const [c] = displayRows([r({ checkType: 'configuration', state: 'ok' })], { ttlMs: 300000, checking: true });
  assert.equal(c.state, 'ok', 'configuration rows do not flip to checking');
  const [d] = displayRows([r()], { ttlMs: 300000, stale: true });
  assert.equal(d.state, 'unknown', 'when the status request fails, retained results are stale, never green');
  const [e] = displayRows([r({ state: 'failed', label: 'Failed' })], { ttlMs: 300000, stale: true });
  assert.equal(e.state, 'failed'); assert.equal(e.stale, true);
});
test('summary: neutral and excluded rows are not counted, unverified ok is not operational, checking counts as not checked', () => {
  const rows = [r(), r({ id: 'b', state: 'attention' }), r({ id: 'c', state: 'failed' }), r({ id: 'd', state: 'unknown', verified: false }), r({ id: 'e', state: 'neutral' }), r({ id: 'f', excluded: true }), r({ id: 'g', state: 'ok', verified: false, checkType: 'configuration' }), r({ id: 'h', state: 'checking' })];
  assert.deepEqual(summarize(rows), { operational: 1, attention: 1, failed: 1, notChecked: 2 });
});
test('summary: operational counts verified connectivity rows only, not env, build or activity rows', () => {
  const rows = [r({ id: 'c1', checkType: 'connectivity' }), r({ id: 'env', checkType: 'configuration' }), r({ id: 'build', checkType: 'configuration' }), r({ id: 'act', checkType: 'activity' })];
  assert.equal(summarize(rows).operational, 1);
  assert.equal(summarize(rows.filter(x => x.checkType !== 'connectivity')).operational, 0);
  assert.equal(summarize([r({ id: 'c2', checkType: 'connectivity', stale: true })]).operational, 0);
});
test('"Checked connections operational" needs every enabled connectivity row verified, fresh, and at least one', () => {
  assert.equal(allConnectivityOperational([r(), r({ id: 'w' })]), true);
  assert.equal(allConnectivityOperational([r(), r({ id: 'w', state: 'unknown', verified: false })]), false);
  assert.equal(allConnectivityOperational([r({ stale: true })]), false);
  assert.equal(allConnectivityOperational([]), false);
  assert.equal(allConnectivityOperational([r({ checkType: 'configuration' })]), false);
  assert.equal(allConnectivityOperational([r(), r({ id: 'n', state: 'neutral', verified: false })]), true, 'neutral rows are ignored');
});
test('frontend vs backend revisions: differing is amber, equal or unknown is not', () => {
  const be = [{ id: 'build:be-revision', detail: 'abc1234' }];
  assert.equal(buildFrontendRows(be, { version: '1.0.0', revision: 'abc1234ffff' }).some(x => x.code === 'BUILD_MISMATCH'), false);
  const m = buildFrontendRows(be, { version: '1.0.0', revision: 'def5678' }).find(x => x.code === 'BUILD_MISMATCH');
  assert.equal(m.state, 'attention');
  const unknown = buildFrontendRows([{ id: 'build:be-revision', detail: '' }], { version: '', revision: '' });
  assert.ok(unknown.every(x => x.state === 'unknown') && unknown.every(x => x.label === 'Unknown'));
});
test('accessible names are service specific; config-only latency says Not measured', () => {
  assert.equal(rowAriaLabel(r({ name: 'Email', scope: 'store', checkType: 'configuration', label: 'Configuration only' }), 'QA Restaurant'), 'Email, Store: QA Restaurant, Configuration only: Configuration only');
  assert.equal(latencyText(r({ checkType: 'configuration' })), 'Not measured');
  assert.equal(latencyText(r()), '12 ms');
  assert.equal(scopeLabel(r()), 'Platform');
});
test('a failed refresh keeps the previous snapshot and flags it', () => {
  const prev = { sections: [] };
  assert.deepEqual(afterRefresh(prev, { ok: false }), { snap: prev, unavailable: true });
  assert.equal(afterRefresh(prev, { ok: true, data: { x: 1 } }).unavailable, false);
});
