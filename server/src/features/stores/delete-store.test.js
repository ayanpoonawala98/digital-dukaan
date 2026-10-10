import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
process.env.DATABASE_URL ||= 'postgres://local:local@localhost:5432/test';
process.env.JWT_SECRET ||= 'test-secret-must-be-at-least-32-characters-long';
const { default: app } = await import('../../app.js');
const { User, Business } = await import('../../models/index.js');

test('owner removes only own store after exact slug, can restore in window, staff cannot delete', async () => {
  const original = [User.findByPk, Business.findOne, Business.findAll];
  let owner = { id: 7, role: 'owner', active: true };
  const store = { id: 72, ownerId: 7, slug: 'my-shop', name: 'My Shop', active: true, deletedAt: null, wasActiveBeforeDelete: null,
    async update(values) { Object.assign(this, values); return this; } };
  User.findByPk = async () => owner;
  Business.findOne = async ({ where }) => where.id === 72 && where.ownerId === 7 && (where.deletedAt === undefined || where.deletedAt === store.deletedAt) ? store : null;
  Business.findAll = async ({ where }) => where.ownerId === 7 && (where.deletedAt === null ? !store.deletedAt : Boolean(store.deletedAt)) ? [store] : [];
  const server = app.listen(0), base = `http://127.0.0.1:${server.address().port}/api/owner`;
  const call = (path, method = 'GET', body) => fetch(base + path, { method, headers: { Authorization: `Bearer ${jwt.sign({ sub: owner.id }, process.env.JWT_SECRET)}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    assert.equal((await call('/72', 'DELETE', { slug: 'wrong' })).status, 400);
    assert.equal(store.deletedAt, null);
    owner = { id: 8, role: 'owner', active: true };
    assert.equal((await call('/72', 'DELETE', { slug: 'my-shop' })).status, 404);
    owner = { id: 83, role: 'staff', active: true, managerId: 7, staffBusinessId: 72 };
    assert.equal((await call('/72', 'DELETE', { slug: 'my-shop' })).status, 403);
    owner = { id: 7, role: 'owner', active: true };
    const removed = await call('/72', 'DELETE', { slug: 'my-shop' });
    assert.equal(removed.status, 200); assert.equal(store.active, false); assert.ok(store.deletedAt); assert.equal(store.wasActiveBeforeDelete, true);
    assert.deepEqual((await (await call('/stores')).json()).stores, []);
    assert.equal((await (await call('/deleted-stores')).json()).stores[0].slug, 'my-shop');
    assert.equal((await call('/72/overview')).status, 404);
    assert.equal((await call('/deleted-stores/72/restore', 'POST', { slug: 'wrong' })).status, 400);
    assert.equal((await call('/deleted-stores/72/restore', 'POST', { slug: 'my-shop' })).status, 200);
    assert.equal(store.deletedAt, null); assert.equal(store.active, true);
    await store.update({ deletedAt: new Date(Date.now() - 31 * 86400000), active: false });
    assert.equal((await call('/deleted-stores/72/restore', 'POST', { slug: 'my-shop' })).status, 410);
  } finally { [User.findByPk, Business.findOne, Business.findAll] = original; await new Promise(resolve => server.close(resolve)); }
});
