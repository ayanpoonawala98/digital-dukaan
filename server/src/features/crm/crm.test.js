import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
process.env.DATABASE_URL ||= 'postgres://local:local@localhost:5432/test';
process.env.JWT_SECRET ||= 'test-secret-must-be-at-least-32-characters-long';
const { default: app } = await import('../../app.js');
const { User, Business } = await import('../../models/index.js');
const { Customer, normalizeCustomerPhone } = await import('./crm.js');

test('phone normalization keeps exact E.164 digits and rejects invalid forms', () => {
  assert.equal(normalizeCustomerPhone('+91 (887) 972-5802'), '918879725802');
  assert.throws(() => normalizeCustomerPhone('08879725802'));
  assert.throws(() => normalizeCustomerPhone('8879725802 ext 11'));
});
test('CRM off by default; owner-scoped reads, no inferred consent, staff blocked', async () => {
  const methods = [User.findByPk, Business.findOne, Customer.findAndCountAll, Customer.create];
  let actor = { id: 7, role: 'owner', active: true }, records = [];
  User.findByPk = async () => actor;
  Business.findOne = async ({ where }) => where.id === 72 && where.ownerId === 7 ? { id: 72, ownerId: 7 } : where.id === 73 && where.ownerId === 8 ? { id:73, ownerId:8 } : null;
  Customer.findAndCountAll = async ({ where }) => { assert.equal(where.businessId, 72); return { rows:records, count:records.length }; };
  Customer.create = async data => { assert.equal(data.businessId, 72); records.push(data); return data; };
  const server = app.listen(0), base = `http://127.0.0.1:${server.address().port}/api/owner`;
  const call = (url, method = 'GET', body) => fetch(base + url, { method, headers: { authorization: `Bearer ${jwt.sign({ sub: actor.id }, process.env.JWT_SECRET)}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    process.env.CRM_ENABLED = 'false';
    assert.equal((await call('/72/customers')).status, 404);
    process.env.CRM_ENABLED = 'true';
    assert.equal((await call('/72/customers')).status, 200);
    const created = await call('/72/customers', 'POST', { phone: '+91 88797 25802', name: 'Sample' });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).customer.phone, '918879725802');
    assert.equal(records[0].optInStatus, undefined);
    assert.equal((await call('/72/customers', 'POST', { phone:'919876543210', optInStatus:'opted_in' })).status, 400);
    assert.equal((await call('/73/customers')).status, 404);
    actor = { id: 83, role: 'staff', active:true, managerId:7, staffBusinessId:72 };
    assert.equal((await call('/72/customers')).status, 403);
  } finally {
    [User.findByPk, Business.findOne, Customer.findAndCountAll, Customer.create] = methods;
    delete process.env.CRM_ENABLED;
    await new Promise(resolve => server.close(resolve));
  }
});
