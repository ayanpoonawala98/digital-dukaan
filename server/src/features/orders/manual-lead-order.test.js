process.env.DISABLE_ABUSE_LIMITS = '1';
import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

process.env.DATABASE_URL ||= 'postgres://local:local@localhost:5432/test';
process.env.JWT_SECRET ||= 'test-secret-must-be-at-least-32-characters-long';
const { default: app } = await import('../../app.js');
const { User, Business, Product, Lead, OwnerPushSubscription } = await import('../../models/index.js');

const store = { id: 72, ownerId: 7, slug: 'kirana', name: 'Kirana', active: true, storeType: 'retail', isOpen: true, minOrder: 0 };
const flour = { id: 91, businessId: 72, name: 'Atta', price: 40, stock: 10, active: true, soldOutToday: false };
const rice = { id: 92, businessId: 72, name: 'Rice', price: 60, stock: 2, active: true, soldOutToday: false };

function mockCatalog() {
  Product.findAll = async ({ where }) => {
    const ids = where.id[Object.getOwnPropertySymbols(where.id)[0]];
    return [flour, rice].filter(p => where.businessId === 72 && ids.includes(p.id));
  };
}

test('owner manually adds a retail order and it is validated like a customer order', async () => {
  const originals = [User.findByPk, Business.findOne, Product.findAll, Lead.create];
  User.findByPk = async () => ({ id: 7, role: 'owner', active: true });
  Business.findOne = async ({ where }) => where.id === 72 && where.ownerId === 7 ? { ...store } : null;
  mockCatalog();
  const created = [];
  Lead.create = async payload => { created.push(payload); return { id: 901, orderNumber: 12, status: 'new', ...payload }; };
  const server = app.listen(0);
  const token = jwt.sign({ sub: 7 }, process.env.JWT_SECRET), base = `http://127.0.0.1:${server.address().port}/api/owner/72/leads`;
  const post = body => fetch(base, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    // Happy path: duplicate rows merge, totals and productName come from the catalog, source marks it staff-entered.
    let r = await post({ customerName: '  Seema  ', customerPhone: '+91 98765 43210', items: [{ id: 91, qty: 2 }, { id: 91, qty: 1 }, { id: 92, qty: 1 }] });
    assert.equal(r.status, 201);
    const body = await r.json();
    assert.equal(body.order.orderNumber, 12);
    assert.equal(created.length, 1);
    assert.equal(created[0].source, 'staff');
    assert.equal(created[0].customerName, 'Seema');
    assert.equal(created[0].price, 180); // 3 x 40 + 1 x 60
    assert.equal(created[0].productName, '4 items');
    assert.equal(created[0].items.length, 2);
    assert.equal(created[0].items.find(i => i.productId === 91).qty, 3);
    assert.equal(created[0].discount, 0);
    assert.equal(created[0].couponCode, null);

    // Empty / invalid items
    assert.equal((await post({ items: [] })).status, 400);
    assert.equal((await post({ items: [{ id: 91, qty: 0 }] })).status, 400);
    assert.equal((await post({ items: [{ id: 91, qty: 100 }] })).status, 400);
    // Unknown product
    assert.equal((await post({ items: [{ id: 99, qty: 1 }] })).status, 400);
    // Not enough stock (2 in stock, merge 1+2 = 3)
    r = await post({ items: [{ id: 92, qty: 1 }, { id: 92, qty: 2 }] });
    assert.equal(r.status, 400); assert.match((await r.json()).error, /left in stock/);
    // Minimum order enforced
    const low = { ...store, minOrder: 500 };
    Business.findOne = async ({ where }) => where.id === 72 ? low : null;
    r = await post({ items: [{ id: 91, qty: 1 }] });
    assert.equal(r.status, 400); assert.match((await r.json()).error, /Minimum order/);
    Business.findOne = async ({ where }) => where.id === 72 && where.ownerId === 7 ? { ...store } : null;
    // Bad phone
    assert.equal((await post({ customerPhone: 'abc', items: [{ id: 91, qty: 1 }] })).status, 400);
    assert.equal(created.length, 1); // nothing extra was written
  } finally {
    [User.findByPk, Business.findOne, Product.findAll, Lead.create] = originals;
    await new Promise(resolve => server.close(resolve));
  }
});

test('manual order is unavailable for restaurants and respects staff permissions', async () => {
  const originals = [User.findByPk, Business.findOne, Product.findAll, Lead.create, OwnerPushSubscription.findAll];
  mockCatalog();
  Lead.create = async payload => ({ id: 902, orderNumber: 13, status: 'new', ...payload });
  OwnerPushSubscription.findAll = async () => [];
  const server = app.listen(0);
  const tokenFor = sub => jwt.sign({ sub }, process.env.JWT_SECRET);
  const base = `http://127.0.0.1:${server.address().port}/api/owner`;
  const post = (storeId, token, body) => fetch(`${base}/${storeId}/leads`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    // Restaurant stores use the restaurant order form instead.
    User.findByPk = async () => ({ id: 7, role: 'owner', active: true });
    Business.findOne = async ({ where }) => where.id === 72 ? { ...store, storeType: 'restaurant' } : null;
    assert.equal((await post(72, tokenFor(7), { items: [{ id: 91, qty: 1 }] })).status, 404);
    // Service stores are held out for now (scope under review).
    Business.findOne = async ({ where }) => where.id === 72 ? { ...store, storeType: 'service' } : null;
    assert.equal((await post(72, tokenFor(7), { items: [{ id: 91, qty: 1 }] })).status, 404);
    Business.findOne = async ({ where }) => where.id === 72 && where.ownerId === 7 ? { ...store } : null;
    // Staff with the leads permission can add an order; without it they get 403.
    User.findByPk = async () => ({ id: 83, role: 'staff', active: true, managerId: 7, staffBusinessId: 72, permissions: ['leads'] });
    Business.findOne = async ({ where }) => where.id === 72 && where.ownerId === 7 ? { ...store } : null;
    assert.equal((await post(72, tokenFor(83), { customerName: 'Ravi', items: [{ id: 91, qty: 1 }] })).status, 201);
    User.findByPk = async () => ({ id: 84, role: 'staff', active: true, managerId: 7, staffBusinessId: 72, permissions: ['products'] });
    assert.equal((await post(72, tokenFor(84), { items: [{ id: 91, qty: 1 }] })).status, 403);
  } finally {
    [User.findByPk, Business.findOne, Product.findAll, Lead.create, OwnerPushSubscription.findAll] = originals;
    await new Promise(resolve => server.close(resolve));
  }
});
