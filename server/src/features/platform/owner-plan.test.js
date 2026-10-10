import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL ||= 'postgres://local:local@localhost:5432/test';
process.env.JWT_SECRET ||= 'test-secret-must-be-at-least-32-characters-long';
const { computeState, planMessage } = await import('./subscriptions.js');
const sub = o => ({ trialStart: '2026-10-01', trialEnd: '2026-10-31', status: 'trial', monthlyFee: 500, plan: 'Standard', ...o });
test('trial shows days left and warns in the last week', () => {
  let st = computeState(sub(), [], '2026-10-11');
  assert.deepEqual([planMessage(sub(), st).tone, st.trialDaysLeft], ['info', 20]);
  st = computeState(sub(), [], '2026-10-28');
  assert.equal(planMessage(sub(), st).tone, 'warn');
  assert.match(planMessage(sub(), st).text, /3 days left/);
});
test('after trial: due, overdue, paid and suspended read clearly', () => {
  const s = sub({ status: 'active' });
  assert.match(planMessage(s, computeState(s, [], '2026-11-02')).text, /Payment due/);
  assert.equal(planMessage(s, computeState(s, [], '2026-11-20')).tone, 'error');
  assert.match(planMessage(s, computeState(s, ['2026-11'], '2026-11-20')).text, /Paid for 2026-11/);
  const x = sub({ status: 'suspended' });
  assert.match(planMessage(x, computeState(x, [], '2026-11-02')).text, /suspended/);
});
