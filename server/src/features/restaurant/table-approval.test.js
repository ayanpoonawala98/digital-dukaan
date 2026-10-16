process.env.DISABLE_ABUSE_LIMITS = '1';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

process.env.DATABASE_URL ||= 'postgres://local:local@localhost:5432/test';
process.env.JWT_SECRET ||= 'test-secret-must-be-at-least-32-characters-long';
const { default: app } = await import('../../app.js');
const { default: jwt } = await import('jsonwebtoken');
const { Business, Product, RestaurantOrder, OrderPushSubscription, Coupon, User } = await import('../../models/index.js');
const { sequelize } = await import('../../config/db.js');
const { TableHold, TableBill } = await import('../../features/restaurant/table-bills.js');
const { KotPrint, KotPrintLead } = await import('../../features/restaurant/kot.js');
const { PlatformSession, PlatformIdentity } = await import('../../features/whatsapp/storefront-verify.js');

const sha = v => createHash('sha256').update(String(v)).digest('hex');
const restaurant = { id: 72, slug: 'test-restaurant', name: 'Test restaurant', active: true, storeType: 'restaurant', tableCount: 3, isOpen: true };
const product = { id: 91, businessId: 72, name: 'Dal', price: 125, stock: 4, active: true };
const items = [{ id: 91, qty: 2 }];
const browser = 'b'.repeat(24);

function fakePublicBase(created) {
  const olds = [Business.findOne, Product.findAll, RestaurantOrder.create, Coupon.findOne, OrderPushSubscription.findOrCreate, OrderPushSubscription.destroy, OrderPushSubscription.findAll, TableHold.findOne, TableBill.sync, TableHold.sync, sequelize.query];
  Business.findOne = async ({ where }) => where.slug === 'test-restaurant' ? restaurant : null;
  Product.findAll = async () => [product];
  RestaurantOrder.create = async payload => { created.push(payload); return { id: 900 + created.length, status: 'new', approvalStatus: payload.approvalStatus || '' }; };
  Coupon.findOne = async () => null;
  OrderPushSubscription.findOrCreate = async () => [{ update: async () => {} }, true];
  OrderPushSubscription.destroy = async () => {};
  OrderPushSubscription.findAll = async () => [];
  TableHold.findOne = async () => null;
  TableBill.sync = async () => {}; TableHold.sync = async () => {};
  sequelize.query = async () => [];
  return olds;
}
function restorePublic(olds) {
  [Business.findOne, Product.findAll, RestaurantOrder.create, Coupon.findOne, OrderPushSubscription.findOrCreate, OrderPushSubscription.destroy, OrderPushSubscription.findAll, TableHold.findOne, TableBill.sync, TableHold.sync, sequelize.query] = olds;
}

test('customer orders of every type wait for approval only when the store enables it; reserved tables gate by phone or browser', async () => {
  const created = [];
  const olds = fakePublicBase(created);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/public/stores/test-restaurant/restaurant-orders`;
  const post = (payload, headers = {}) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload) });
  try {
    // 1. approval off: no gate
    restaurant.orderApproval = false;
    let r = await post({ orderType: 'dine-in', tableNumber: 2, items });
    assert.equal(r.status, 201); assert.equal((await r.json()).pendingApproval, undefined); assert.equal(created[0].approvalStatus, undefined);
    // 2. approval on: pending
    restaurant.orderApproval = true;
    r = await post({ orderType: 'dine-in', tableNumber: 2, items });
    let body = await r.json();
    assert.equal(r.status, 201); assert.equal(body.pendingApproval, true); assert.equal(created[1].approvalStatus, 'pending');
    // 3. takeaway and delivery are gated too while the toggle is on
    r = await post({ orderType: 'takeaway', customerName: 'A', customerPhone: '+91 98765 00000', items });
    assert.equal(r.status, 201); assert.equal((await r.json()).pendingApproval, true); assert.equal(created[2].approvalStatus, 'pending');
    r = await post({ orderType: 'delivery', customerName: 'A', customerPhone: '+91 98765 00000', deliveryAddress: '12 MG Road', items });
    assert.equal(r.status, 201); assert.equal((await r.json()).pendingApproval, true); assert.equal(created[3].approvalStatus, 'pending');
    // toggle back off: every type goes straight to the kitchen again
    restaurant.orderApproval = false;
    r = await post({ orderType: 'takeaway', customerName: 'A', customerPhone: '+91 98765 00000', items });
    assert.equal(r.status, 201); assert.equal((await r.json()).pendingApproval, undefined); assert.equal(created[4].approvalStatus, undefined);
    restaurant.orderApproval = true;
    // 4. reserved table: no phone, no browser match -> 409 TABLE_RESERVED
    const hold = { phone: '919876543210', browserHash: '', update: async v => { Object.assign(hold, v); return hold; } };
    TableHold.findOne = async () => hold;
    r = await post({ orderType: 'dine-in', tableNumber: 2, items }, { 'X-DS-Browser': browser });
    body = await r.json();
    assert.equal(r.status, 409); assert.equal(body.code, 'TABLE_RESERVED');
    // 5. wrong phone -> 409
    r = await post({ orderType: 'dine-in', tableNumber: 2, customerPhone: '+91 90000 00000', items }, { 'X-DS-Browser': browser });
    assert.equal(r.status, 409);
    // 6. reserved phone typed -> 201 and the browser gets bound
    r = await post({ orderType: 'dine-in', tableNumber: 2, customerPhone: '9876543210', items }, { 'X-DS-Browser': browser });
    assert.equal(r.status, 201); assert.equal(hold.browserHash, sha(browser));
    // 7. bound browser alone -> 201 without a phone
    r = await post({ orderType: 'dine-in', tableNumber: 2, items }, { 'X-DS-Browser': browser });
    assert.equal(r.status, 201);
    // 8. a different browser with no phone -> 409 again
    r = await post({ orderType: 'dine-in', tableNumber: 2, items }, { 'X-DS-Browser': 'z'.repeat(24) });
    assert.equal(r.status, 409);
    // 9. verified WhatsApp session on the reserved phone passes without typing
    const tok = 's'.repeat(43);
    const oldS = [PlatformSession.findOne, PlatformIdentity.findOne];
    PlatformSession.findOne = async () => ({ identityId: 5 });
    PlatformIdentity.findOne = async () => ({ id: 5, phone: '919876543210' });
    r = await post({ orderType: 'dine-in', tableNumber: 2, items }, { 'X-DS-Browser': 'z'.repeat(24), Cookie: `ds_id=${tok}` });
    assert.equal(r.status, 201);
    [PlatformSession.findOne, PlatformIdentity.findOne] = oldS;
    // 10. a session on a different phone is refused
    PlatformSession.findOne = async () => ({ identityId: 6 });
    PlatformIdentity.findOne = async () => ({ id: 6, phone: '919000000000' });
    r = await post({ orderType: 'dine-in', tableNumber: 2, items }, { 'X-DS-Browser': 'z'.repeat(24), Cookie: `ds_id=${tok}` });
    assert.equal(r.status, 409);
    [PlatformSession.findOne, PlatformIdentity.findOne] = oldS;
  } finally { restorePublic(olds); await new Promise(resolve => server.close(resolve)); }
});

test('owner approval endpoints: kitchen list hides pending, status/kot/bill refuse pending, approve and reject work once', async () => {
  const olds = [User.findByPk, Business.findOne, RestaurantOrder.findOne, RestaurantOrder.findAndCountAll, KotPrint.sync, KotPrintLead.sync, sequelize.query];
  User.findByPk = async () => ({ id: 7, role: 'owner', active: true });
  Business.findOne = async ({ where }) => where.id === 72 && where.ownerId === 7 ? { id: 72, ownerId: 7, storeType: 'restaurant', name: 'A', tableCount: 3 } : null;
  KotPrint.sync = async () => {}; KotPrintLead.sync = async () => {}; sequelize.query = async () => [];
  const pending = { id: 5, businessId: 72, orderType: 'dine-in', status: 'new', approvalStatus: 'pending', items: [{ name: 'Dal', qty: 1, price: 125 }], tableNumber: 2, update: async v => Object.assign(pending, v) };
  RestaurantOrder.findOne = async ({ where }) => where.id === 5 ? pending : null;
  let lastWhere = null;
  RestaurantOrder.findAndCountAll = async ({ where }) => { lastWhere = where; return { rows: [], count: 0 }; };
  const server = app.listen(0);
  const token = jwt.sign({ sub: 7 }, process.env.JWT_SECRET), base = `http://127.0.0.1:${server.address().port}/api/owner/72`;
  const call = (path, method = 'GET', body) => fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    // kitchen view excludes pending
    let r = await call('/restaurant-orders?view=kitchen');
    assert.equal(r.status, 200);
    assert.ok(lastWhere.approvalStatus, 'kitchen filter sets approvalStatus');
    // plain list has no such filter
    r = await call('/restaurant-orders');
    assert.equal(r.status, 200); assert.equal(lastWhere.approvalStatus, undefined);
    // status change refused
    r = await call('/restaurant-orders/5', 'PATCH', { status: 'accepted' });
    assert.equal(r.status, 409); assert.match((await r.json()).error, /Approve this order first/);
    // KOT refused
    r = await call('/restaurant-orders/5/kot', 'POST', {});
    assert.equal(r.status, 409);
    // approve
    r = await call('/restaurant-orders/5/approval', 'POST', { decision: 'approve' });
    assert.equal(r.status, 200); assert.equal(pending.approvalStatus, 'approved'); assert.equal(pending.approvedByUserId, 7); assert.ok(pending.approvedAt);
    // not again
    r = await call('/restaurant-orders/5/approval', 'POST', { decision: 'approve' });
    assert.equal(r.status, 409);
    // reject cancels
    pending.approvalStatus = 'pending';
    r = await call('/restaurant-orders/5/approval', 'POST', { decision: 'reject' });
    assert.equal(r.status, 200); assert.equal(pending.approvalStatus, 'rejected'); assert.equal(pending.status, 'cancelled');
    r = await call('/restaurant-orders/5/approval', 'POST', { decision: 'maybe' });
    assert.equal(r.status, 400);
  } finally {
    [User.findByPk, Business.findOne, RestaurantOrder.findOne, RestaurantOrder.findAndCountAll, KotPrint.sync, KotPrintLead.sync, sequelize.query] = olds;
    await new Promise(resolve => server.close(resolve));
  }
});

test('reserve route: phone normalised and validated, plain hold unchanged', async () => {
  const olds = [User.findByPk, Business.findOne, TableHold.findOrCreate, TableHold.destroy, TableBill.sync, TableHold.sync, sequelize.query];
  User.findByPk = async () => ({ id: 7, role: 'owner', active: true });
  Business.findOne = async ({ where }) => where.id === 72 && where.ownerId === 7 ? { id: 72, ownerId: 7, storeType: 'restaurant', name: 'A', tableCount: 3 } : null;
  TableBill.sync = async () => {}; TableHold.sync = async () => {}; sequelize.query = async () => [];
  const calls = [];
  TableHold.findOrCreate = async ({ where, defaults }) => { calls.push({ where, defaults }); return [{ ...defaults, phone: defaults.phone }, true]; };
  TableHold.destroy = async () => 1;
  const server = app.listen(0);
  const token = jwt.sign({ sub: 7 }, process.env.JWT_SECRET), base = `http://127.0.0.1:${server.address().port}/api/owner/72`;
  const call = (path, body) => fetch(`${base}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  try {
    let r = await call('/tables/2/hold', { held: true, phone: '9876543210' });
    let body = await r.json();
    assert.equal(r.status, 200); assert.equal(calls[0].defaults.phone, '919876543210'); assert.equal(body.phone, '919876543210'); assert.equal(calls[0].defaults.createdByUserId, 7);
    r = await call('/tables/2/hold', { held: true, phone: 'not-a-phone' });
    assert.equal(r.status, 400);
    r = await call('/tables/2/hold', { held: true });
    assert.equal(r.status, 200); assert.equal(calls[1].defaults.phone, '');
    r = await call('/tables/2/hold', { held: false });
    assert.equal(r.status, 200);
  } finally {
    [User.findByPk, Business.findOne, TableHold.findOrCreate, TableHold.destroy, TableBill.sync, TableHold.sync, sequelize.query] = olds;
    await new Promise(resolve => server.close(resolve));
  }
});
