import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL ||= 'postgres://local:local@localhost:5432/test';
process.env.JWT_SECRET ||= 'test-secret-must-be-at-least-32-characters-long';
const { default: app } = await import('./app.js');
const { Business } = await import('./models/index.js');
const { restoreDeadline } = await import('./retention.js');

test('purge endpoint rejects callers without the cron secret; restore deadline is thirty days', async () => {
  const server = app.listen(0), url = `http://127.0.0.1:${server.address().port}/api/internal/purge-expired-stores`;
  const before = Business.findAll;
  Business.findAll = async () => { throw Error('DB should not be reached by unauthorized request'); };
  const oldSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'test-cron-secret-not-for-production';
  try {
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: { Authorization: 'Bearer wrong' } })).status, 401);
    assert.equal(restoreDeadline('2026-09-01T00:00:00Z').toISOString(), '2026-10-01T00:00:00.000Z');
  } finally {
    Business.findAll = before; if (oldSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = oldSecret;
    await new Promise(resolve => server.close(resolve));
  }
});

test('purge does not touch database when domain removal fails', async () => {
  const { purgeExpiredStore } = await import('./retention.js');
  const { sequelize } = await import('./models/index.js');
  const priorFind = Business.findAll, priorTxn = sequelize.transaction, priorFetch = globalThis.fetch, priorToken = process.env.VERCEL_STORE_DOMAIN_TOKEN;
  let transactionCalled = false;
  Business.findAll = async () => [{ id: 72, slug: 'test-restaurant' }];
  sequelize.transaction = async () => { transactionCalled = true; };
  globalThis.fetch = async () => ({ ok: false, status: 503 });
  process.env.VERCEL_STORE_DOMAIN_TOKEN = 'test-token';
  try {
    await assert.rejects(purgeExpiredStore(), /domain removal failed \(503\)/);
    assert.equal(transactionCalled, false);
  } finally {
    Business.findAll = priorFind; sequelize.transaction = priorTxn; globalThis.fetch = priorFetch;
    if (priorToken === undefined) delete process.env.VERCEL_STORE_DOMAIN_TOKEN; else process.env.VERCEL_STORE_DOMAIN_TOKEN = priorToken;
  }
});


test('purge keeps an expired tombstone when database cleanup fails after domain detachment', async () => {
  const { purgeExpiredStore } = await import('./retention.js');
  const { sequelize } = await import('./models/index.js');
  const priorFind = Business.findAll, priorTxn = sequelize.transaction, priorFetch = globalThis.fetch, priorToken = process.env.VERCEL_STORE_DOMAIN_TOKEN;
  let detached = false;
  const store = { id: 72, slug: 'test-restaurant', deletedAt: new Date('2026-01-01') };
  Business.findAll = async () => [store];
  sequelize.transaction = async () => { throw Error('simulated DB rollback'); };
  globalThis.fetch = async () => { detached = true; return { ok: true, status: 204 }; };
  process.env.VERCEL_STORE_DOMAIN_TOKEN = 'test-token';
  try {
    await assert.rejects(purgeExpiredStore(), /simulated DB rollback/);
    assert.equal(detached, true);
    assert.equal(store.deletedAt.toISOString(), '2026-01-01T00:00:00.000Z');
  } finally {
    Business.findAll = priorFind; sequelize.transaction = priorTxn; globalThis.fetch = priorFetch;
    if (priorToken === undefined) delete process.env.VERCEL_STORE_DOMAIN_TOKEN; else process.env.VERCEL_STORE_DOMAIN_TOKEN = priorToken;
  }
});
