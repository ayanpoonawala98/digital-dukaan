import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ||= 'postgres://local:local@localhost:5432/test';
process.env.JWT_SECRET ||= 'test-secret-must-be-at-least-32-characters-long';
process.env.CLIENT_URL ||= 'http://localhost:5175';
const { default: app } = await import('./app.js');
const m = await import('./models/index.js');
const { default: jwt } = await import('jsonwebtoken');

test('enquiries optionally store customer name and phone, reject bad phones, and are searchable by them', async () => {
  const saved = { bf: m.Business.findOne, bp: m.Business.findByPk, pf: m.Product.findOne, lc: m.Lead.create, lf: m.Lead.findAndCountAll, uf: m.User.findByPk };
  const store = { id: 5, ownerId: 2, slug: 'shop', name: 'Shop', storeType: 'retail', active: true, deletedAt: null, whatsapp: '919876543210', featureLocks: {} };
  m.Business.findOne = async ({ where }) => (where.slug === 'shop' || (Number(where.id) === 5 && Number(where.ownerId) === 2) ? store : null);
  m.Business.findByPk = async () => store;
  m.User.findByPk = async () => ({ id: 2, role: 'owner', active: true });
  m.Product.findOne = async () => ({ id: 9, name: 'Frames', price: 849, stock: null, imageUrl: '' });
  const created = []; m.Lead.create = async row => { created.push(row); return { id: created.length, ...row }; };
  let query; m.Lead.findAndCountAll = async options => { query = options; return { rows: [], count: 0 }; };
  const server = app.listen(0); const base = `http://127.0.0.1:${server.address().port}/api`;
  const post = body => fetch(`${base}/public/stores/shop/products/9/enquire`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    assert.equal((await post({ qty: 1 })).status, 201);
    assert.equal(created[0].customerName, ''); assert.equal(created[0].customerPhone, '');
    assert.equal((await post({ qty: 1, customerName: '  Asha  ', customerPhone: '+91 98765 43210' })).status, 201);
    assert.equal(created[1].customerName, 'Asha'); assert.equal(created[1].customerPhone, '+91 98765 43210');
    assert.equal((await post({ qty: 1, customerPhone: 'call me' })).status, 400); assert.equal(created.length, 2);
    const token = jwt.sign({ sub: 2 }, process.env.JWT_SECRET);
    const r = await fetch(`${base}/owner/5/leads?q=Asha&status=new&from=2026-10-01&page=2&pageSize=10`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(r.status, 200); assert.equal(query.offset, 10);
    const text = JSON.stringify(query.where, (k, v) => (typeof k === 'symbol' ? undefined : v)) + Object.getOwnPropertySymbols(query.where).map(s => JSON.stringify(query.where[s])).join('');
    assert.match(text, /customerName/); assert.match(text, /customerPhone/); assert.match(text, /productName/);
    assert.equal(query.where.status, 'new');
  } finally { Object.assign(m.Business, { findOne: saved.bf, findByPk: saved.bp }); m.Product.findOne = saved.pf; m.Lead.create = saved.lc; m.Lead.findAndCountAll = saved.lf; m.User.findByPk = saved.uf; await new Promise(resolve => server.close(resolve)); }
});
