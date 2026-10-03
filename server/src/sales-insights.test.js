import test from 'node:test';
import assert from 'node:assert/strict';
import { insights } from './sales-insights.js';

const now = new Date('2026-10-03T10:00:00+05:30');
const at = (d, h = 12) => new Date(`${d}T${String(h).padStart(2, '0')}:00:00+05:30`);
test('empty store gives zero-filled, non-crashing insights', () => {
  const r = insights([], [], now);
  assert.equal(r.series.length, 1); assert.equal(r.peakHour, null); assert.deepEqual(r.customers, { identified: 0, repeat: 0, withoutContact: 0 }); assert.equal(r.avgEnquiry, 0);
});
test('retail: enquiries by day, status, top products, repeat customers, IST hours', () => {
  const leads = [
    { status: 'new', price: 500, productName: 'Frame', createdAt: at('2026-10-03', 10), customerPhone: '+91 98765 43210' },
    { status: 'delivered', price: 700, productName: 'Frame', createdAt: at('2026-10-01', 23), customerPhone: '9876543210' },
    { status: 'cancelled', price: 900, productName: 'Lens', createdAt: at('2026-10-02') },
    { status: 'new', price: 300, items: [{ name: 'Cleaner', qty: 3, price: 100 }], productName: '3 items', createdAt: at('2026-10-02', 0), couponCode: 'SAVE10', discount: 30 },
  ];
  const r = insights([], leads, now);
  assert.deepEqual(r.series.map(s => [s.date, s.enquiries, s.enquiryValue]), [['2026-10-01', 1, 700], ['2026-10-02', 1, 300], ['2026-10-03', 1, 500]]);
  assert.equal(r.leadStatus.cancelled, 1); assert.equal(r.topEnquired[0].name, 'Cleaner'); assert.equal(r.topEnquired[0].units, 3);
  assert.equal(r.topEnquired.find(t => t.name === 'Frame').enquiries, 2); assert.ok(!r.topEnquired.some(t => t.name === 'Lens'));
  assert.equal(r.customers.identified, 1); assert.equal(r.customers.repeat, 1); assert.equal(r.customers.withoutContact, 1);
  assert.equal(r.hourly[23], 1); assert.equal(r.hourly[0], 1); assert.deepEqual(r.coupons, [{ code: 'SAVE10', uses: 1, discount: 30 }]);
  assert.deepEqual(r.fulfilment, { total: 4, done: 1, cancelled: 1, open: 2 });
});
test('restaurant: served value series, order types, tables, dishes, week comparison', () => {
  const orders = [
    { status: 'served', total: 400, orderType: 'dine-in', tableNumber: 4, items: [{ name: 'Biryani', qty: 2, price: 200 }], createdAt: at('2026-10-03', 13) },
    { status: 'new', total: 100, orderType: 'takeaway', items: [{ name: 'Chai', qty: 1, price: 100 }], createdAt: at('2026-10-03', 13) },
    { status: 'cancelled', total: 999, orderType: 'delivery', items: [{ name: 'Biryani', qty: 9, price: 100 }], createdAt: at('2026-10-03') },
    { status: 'served', total: 250, orderType: 'dine-in', tableNumber: 4, items: [], createdAt: at('2026-09-24') },
  ];
  const r = insights(orders, [], now);
  assert.equal(r.series.at(-1).servedValue, 400); assert.equal(r.orderTypes['dine-in'], 2); assert.equal(r.orderTypes.delivery, undefined);
  assert.deepEqual(r.tables, [{ table: '4', orders: 2, value: 650 }]); assert.equal(r.topDishes[0].name, 'Biryani'); assert.equal(r.topDishes[0].units, 2);
  assert.equal(r.week.last7.servedValue, 400); assert.equal(r.week.prev7.servedValue, 250); assert.equal(r.peakHour, 13);
});
test('long history is capped to the last 60 days', () => {
  const r = insights([], [{ status: 'new', price: 1, createdAt: at('2026-01-01') }, { status: 'new', price: 1, createdAt: at('2026-10-03') }], now);
  assert.equal(r.series.length, 60); assert.equal(r.truncated, true);
});
