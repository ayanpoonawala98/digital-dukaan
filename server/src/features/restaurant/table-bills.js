// Tables view: live table status and settled bills. Bills are append-only history (never edited or deleted).
import { Op, DataTypes } from 'sequelize';
import { sequelize, Product, RestaurantOrder, TableRequest } from '../../models/index.js';
import { bad } from '../../shared/utils/core.js';
import { normalizePayments, byMode } from './payments.js';
import { orderLine, addedLine } from './bill-lines.js';
import { gstSetting, billTotals, GST_RATES } from './gst.js';

export const TableBill = sequelize.define('TableBill', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  businessId: { type: DataTypes.INTEGER, allowNull: false },
  billNo: { type: DataTypes.INTEGER, allowNull: false },
  channel: { type: DataTypes.STRING(12), allowNull: false }, // table | delivery | takeaway | counter
  tableNumber: { type: DataTypes.INTEGER, allowNull: true },
  orderIds: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  lines: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  charges: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  subtotal: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  chargesTotal: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  discount: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  gstPct: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  gstMode: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'exclusive' },
  cgst: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  sgst: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  roundOff: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 }, // total minus (taxable + cgst + sgst), under 0.50
  total: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  paymentMode: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'cash' }, // cash | upi | card | split
  payments: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  customerName: { type: DataTypes.STRING(100), allowNull: true },
  settledByUserId: { type: DataTypes.INTEGER, allowNull: true },
  settledByRole: { type: DataTypes.STRING(10), allowNull: true },
  adjustNote: { type: DataTypes.STRING(200), allowNull: true },
  paidAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, { tableName: 'table_bills', indexes: [{ fields: ['businessId', 'channel', 'tableNumber', 'paidAt'] }, { unique: true, fields: ['businessId', 'billNo'] }] });

export const TableHold = sequelize.define('TableHold', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  businessId: { type: DataTypes.INTEGER, allowNull: false },
  tableNumber: { type: DataTypes.INTEGER, allowNull: false }
}, { tableName: 'table_holds', indexes: [{ unique: true, fields: ['businessId', 'tableNumber'] }] });
export async function setTableHold(store, n, held) {
  await ensureTableBillSchema();
  const t = Number(n);
  if (!Number.isInteger(t) || t < 1 || t > (Number(store.tableCount) || 0)) throw bad(400, 'Invalid table');
  if (held) await TableHold.findOrCreate({ where: { businessId: store.id, tableNumber: t } });
  else await TableHold.destroy({ where: { businessId: store.id, tableNumber: t } });
  return { ok: true, held: !!held };
}

let ready;
export function ensureTableBillSchema() {
  if (!ready) ready = (async () => {
    await TableBill.sync(); // new table only
    await TableHold.sync();
    await sequelize.query(`ALTER TABLE table_bills ADD COLUMN IF NOT EXISTS "payments" jsonb NOT NULL DEFAULT '[]'::jsonb`);
    await sequelize.query(`ALTER TABLE table_bills ADD COLUMN IF NOT EXISTS "gstMode" varchar(10) NOT NULL DEFAULT 'exclusive'`);
    await sequelize.query('ALTER TABLE table_bills ADD COLUMN IF NOT EXISTS "settledByUserId" integer');
    await sequelize.query('ALTER TABLE table_bills ADD COLUMN IF NOT EXISTS "settledByRole" varchar(10)');
    await sequelize.query('ALTER TABLE table_bills ADD COLUMN IF NOT EXISTS "adjustNote" varchar(200)');
    await sequelize.query('ALTER TABLE table_bills ADD COLUMN IF NOT EXISTS "roundOff" double precision NOT NULL DEFAULT 0');
    await sequelize.query('ALTER TABLE restaurant_orders ADD COLUMN IF NOT EXISTS "billId" integer');
    await sequelize.query('CREATE INDEX IF NOT EXISTS restaurant_orders_open_idx ON restaurant_orders ("businessId", "billId")');
  })().catch(e => { ready = null; throw e; });
  return ready;
}
const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const channelOf = o => (o.orderType === 'dine-in' ? 'table' : o.orderType === 'delivery' ? 'delivery' : o.orderType === 'counter' ? 'counter' : 'takeaway');
const ORDER_CAP = 2000;

export async function tablesState(store) {
  await ensureTableBillSchema();
  const orders = await sequelize.query(
    `SELECT id,"orderNumber","orderType","tableNumber","customerName","customerPhone","deliveryAddress",items,total,status,note,"createdAt" FROM restaurant_orders WHERE "businessId"=:b AND "billId" IS NULL AND status<>'cancelled' ORDER BY "createdAt" ASC LIMIT ${ORDER_CAP}`,
    { replacements: { b: store.id }, type: sequelize.QueryTypes.SELECT });
  // Old unbilled orders stay visible so they can still be billed or cancelled. If more than the cap exist, say so instead of hiding them.
  const [{ n: openCount }] = await sequelize.query(`SELECT COUNT(*)::int AS n FROM restaurant_orders WHERE "businessId"=:b AND "billId" IS NULL AND status<>'cancelled'`, { replacements: { b: store.id }, type: sequelize.QueryTypes.SELECT });
  const menu = await sequelize.query(`SELECT id,name,price,variants FROM products WHERE "businessId"=:b AND active=true AND ("soldOutDate" IS NULL OR "soldOutDate"<>:today) ORDER BY name ASC LIMIT 600`, { replacements: { b: store.id, today: new Date(Date.now() + 19800000).toISOString().slice(0, 10) }, type: sequelize.QueryTypes.SELECT });
  const count = Math.max(0, Number(store.tableCount) || 0);
  const tables = Array.from({ length: count }, (_, i) => ({ number: i + 1, orders: [] }));
  const channels = { delivery: { orders: [] }, takeaway: { orders: [] }, counter: { orders: [] } };
  const extra = {};
  for (const o of orders) {
    const ch = channelOf(o);
    if (ch === 'table') { const t = tables[o.tableNumber - 1] || (extra[o.tableNumber] ??= { number: o.tableNumber, orders: [] }); t.orders.push(o); } else channels[ch].orders.push(o);
  }
  const sum = list => round2(list.reduce((s, o) => s + Number(o.total || 0), 0));
  const view = t => ({ ...t, occupied: t.orders.length > 0, total: sum(t.orders), since: t.orders[0]?.createdAt || null });
  const reqs = await TableRequest.findAll({ where: { businessId: store.id, status: 'open' }, attributes: ['tableNumber', 'kind'], raw: true }).catch(() => []);
  const reqOf = n => { const k = reqs.filter(r => Number(r.tableNumber) === n).map(r => r.kind); return k.includes('bill') ? 'bill' : k.length ? 'waiter' : null; };
  const holds = new Set((await TableHold.findAll({ where: { businessId: store.id }, attributes: ['tableNumber'], raw: true })).map(h => h.tableNumber));
  const all = [...tables, ...Object.values(extra)].map(view).map(t => ({ ...t, request: reqOf(t.number), held: holds.has(t.number), occupied: t.occupied || holds.has(t.number) }));
  return { hiddenOrders: Math.max(0, openCount - orders.length), tableCount: count, menu, name: store.name, gstin: store.gstin || '', gstMode: store.gstMode || null, gstRate: store.gstRate ?? null, tables: all, channels: Object.fromEntries(Object.entries(channels).map(([k, v]) => [k, { orders: v.orders, total: sum(v.orders), open: v.orders.length }])) };
}

export async function billHistory(store, { channel, table, limit = 50, date }) {
  await ensureTableBillSchema();
  const where = { businessId: store.id };
  if (channel) where.channel = channel;
  if (table !== undefined && table !== null && table !== '') where.tableNumber = Number(table);
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) { const a = new Date(`${date}T00:00:00+05:30`); if (!Number.isNaN(a.getTime())) where.paidAt = { [Op.gte]: a, [Op.lt]: new Date(a.getTime() + 86400000) }; }
  const rows = await TableBill.findAll({ where, order: [['paidAt', 'DESC'], ['id', 'DESC']], limit: Math.min(200, Math.max(1, Number(limit) || 50)) });
  return { bills: rows.map(r => r.toJSON()) };
}

export async function billsSummary(store, from, to) {
  await ensureTableBillSchema();
  const where = { businessId: store.id };
  if (from || to) where.paidAt = { ...(from ? { [Op.gte]: from } : {}), ...(to ? { [Op.lt]: to } : {}) };
  const rows = await TableBill.findAll({ where, attributes: ['subtotal', 'chargesTotal', 'discount', 'cgst', 'sgst', 'total', 'paymentMode', 'payments'], raw: true });
  const s = k => round2(rows.reduce((a, r) => a + Number(r[k] || 0), 0));
  return { count: rows.length, total: s('total'), gst: round2(s('cgst') + s('sgst')), charges: s('chargesTotal'), discounts: s('discount'), byMode: byMode(rows) };
}

const cleanText = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

const STAFF_DISCOUNT_CAP_PCT = 10;
export async function settleBill(store, body, setDone, actor = {}) {
  await ensureTableBillSchema();
  const channel = ['table', 'delivery', 'takeaway', 'counter'].includes(body?.channel) ? body.channel : null;
  if (!channel) throw bad(400, 'Choose a table or order channel');
  const tableNumber = channel === 'table' ? Number(body.tableNumber) : null;
  if (channel === 'table' && (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > 1000)) throw bad(400, 'Invalid table');
  const orderIds = [...new Set((Array.isArray(body.orderIds) ? body.orderIds : []).map(Number))];
  if (orderIds.length > 100 || orderIds.some(n => !Number.isInteger(n) || n < 1)) throw bad(400, 'Invalid orders');
  if ((channel === 'delivery' || channel === 'takeaway') && orderIds.length !== 1) throw bad(400, 'Delivery and takeaway orders are billed one order at a time');
  const orders = orderIds.length ? await RestaurantOrder.findAll({ where: { id: { [Op.in]: orderIds }, businessId: store.id } }) : [];
  if (orders.length !== orderIds.length) throw bad(404, 'Order not found');
  for (const o of orders) {
    if (o.billId) throw bad(409, 'An order on this bill is already billed');
    if (o.status === 'cancelled') throw bad(400, 'A cancelled order cannot be billed');
    if (String(o.paymentStatus || '').toLowerCase() === 'paid') throw bad(409, `Order #${o.orderNumber || o.id} was already paid online, so it cannot be billed again. Ask the owner.`);
    if (channelOf(o) !== channel || (channel === 'table' && o.tableNumber !== tableNumber)) throw bad(400, 'Orders do not belong to this table');
  }
  const raw = Array.isArray(body.lines) ? body.lines : [];
  if (raw.length > 200) throw bad(400, 'Too many bill lines');
  const orderMap = new Map(orders.map(o => [o.id, o]));
  const productIds = [...new Set(raw.filter(l => !l.orderId && l.productId).map(l => Number(l.productId)))];
  const products = productIds.length ? await Product.findAll({ where: { id: { [Op.in]: productIds }, businessId: store.id } }) : [];
  const pmap = new Map(products.map(p => [p.id, p]));
  const lines = [];
  for (const l of raw) {
    const qty = Number(l?.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) throw bad(400, 'Invalid quantity');
    if (l.orderId) {
      const o = orderMap.get(Number(l.orderId));
      if (!o) throw bad(400, 'Bill line does not match its order');
      lines.push(orderLine(l, o, qty));
    } else {
      const p = pmap.get(Number(l.productId));
      if (!p) throw bad(400, 'Added item not found on this menu');
      lines.push(addedLine(l, p, qty));
    }
  }
  if (!lines.length) throw bad(400, 'Add at least one item to the bill');
  // Each order item may be billed at most its ordered quantity in total; a short bill needs a written reason.
  const used = new Map();
  for (const l of lines) if (l.orderId) { const k = `${l.orderId}|${l.itemIdx}`; used.set(k, (used.get(k) || 0) + l.qty); }
  let short = false;
  for (const o of orders) (Array.isArray(o.items) ? o.items : []).forEach((it, idx) => {
    const got = used.get(`${o.id}|${idx}`) || 0;
    if (got > Number(it.qty)) throw bad(400, `${it.name}: billed more than ordered`);
    if (got < Number(it.qty)) short = true;
  });
  const adjustNote = cleanText(body.adjustReason, 200);
  if (short && adjustNote.length < 3) throw bad(400, 'Some ordered items are missing or reduced on this bill. Add a short reason (for example "customer returned dish").');
  const charges = (Array.isArray(body.charges) ? body.charges : []).slice(0, 10).map(c => ({ label: cleanText(c?.label, 40) || 'Charge', amount: Number(c?.amount) }));
  if (charges.some(c => !Number.isFinite(c.amount) || c.amount < 0 || c.amount > 1e6)) throw bad(400, 'Invalid charge');
  const subtotal = round2(lines.reduce((s, l) => s + l.price * l.qty, 0));
  const chargesTotal = round2(charges.reduce((s, c) => s + c.amount, 0));
  const d = body.discount || {};
  let discount = d.type === 'pct' ? subtotal * Number(d.value || 0) / 100 : Number(d.value || 0);
  if (!Number.isFinite(discount) || discount < 0 || (d.type === 'pct' && Number(d.value) > 100)) throw bad(400, 'Invalid discount');
  discount = round2(Math.min(discount, subtotal + chargesTotal));
  if (actor.role === 'staff' && subtotal > 0 && discount > subtotal * STAFF_DISCOUNT_CAP_PCT / 100 + 0.005) throw bad(403, `Staff can give up to ${STAFF_DISCOUNT_CAP_PCT}% discount. Ask the owner for more.`);
  const g = gstSetting(store, body.gstPct);
  const gstPct = g.rate;
  // Shops that never picked a GST mode let the screen send the rate. Staff must not be able to change it: they can only repeat the
  // rate of the shop's last bill. With no earlier bill, the owner has to set GST in Settings (or bill it themselves).
  if (g.legacy && actor.role === 'staff') {
    const last = await TableBill.findOne({ where: { businessId: store.id }, order: [['id', 'DESC']], attributes: ['gstPct'], raw: true });
    if (!last) throw bad(403, 'GST is not set up for this shop. Ask the owner to choose a GST setting in Settings before billing.');
    if (Number(last.gstPct) !== gstPct) throw bad(403, `GST rate must be ${last.gstPct}% for staff. Ask the owner to change the GST setting in Settings.`);
  }
  if (!GST_RATES.includes(gstPct)) throw bad(400, 'Choose a valid GST rate');
  const { half, total, roundOff } = billTotals({ subtotal, chargesTotal, discount, mode: g.mode, rate: gstPct });
  const { payments, paymentMode } = normalizePayments(body.payments, total, body.paymentMode);
  const bill = await sequelize.transaction(async t => {
    await sequelize.query('SELECT pg_advisory_xact_lock(:k)', { replacements: { k: 770000 + store.id }, transaction: t });
    const [{ n }] = await sequelize.query('SELECT COALESCE(MAX("billNo"),0)+1 AS n FROM table_bills WHERE "businessId"=:b', { replacements: { b: store.id }, type: sequelize.QueryTypes.SELECT, transaction: t });
    if (orderIds.length) {
      const fresh = await RestaurantOrder.findAll({ where: { id: { [Op.in]: orderIds }, businessId: store.id }, transaction: t, lock: t.LOCK.UPDATE });
      if (fresh.length !== orders.length) throw bad(409, 'An order changed, reopen the bill');
      const snap = new Map(orders.map(o => [o.id, JSON.stringify(o.items || [])]));
      for (const f of fresh) {
        if (f.billId) throw bad(409, 'An order on this bill was just billed elsewhere');
        if (f.status === 'cancelled') throw bad(409, 'An order on this bill was cancelled');
        if (JSON.stringify(f.items || []) !== snap.get(f.id)) throw bad(409, 'Items were just added to an order. Reopen the bill and check it again.');
      }
    }
    const row = await TableBill.create({ settledByUserId: actor.id || null, settledByRole: actor.role || null, adjustNote: adjustNote || null, businessId: store.id, billNo: Number(n), channel, tableNumber, orderIds, lines, charges, subtotal, chargesTotal, discount, gstPct, gstMode: g.mode, cgst: half, sgst: half, roundOff, total, paymentMode, payments, customerName: cleanText(body.customerName, 100) || null }, { transaction: t });
    if (orderIds.length) {
      const [, count] = await sequelize.query('UPDATE restaurant_orders SET "billId"=:id WHERE id IN (:ids) AND "businessId"=:b AND "billId" IS NULL', { replacements: { id: row.id, ids: orderIds, b: store.id }, transaction: t });
      if ((count?.rowCount ?? orderIds.length) !== orderIds.length) throw bad(409, 'An order on this bill was just billed elsewhere');
    }
    return row;
  });
  // The bill is saved and stays saved. If marking an order done fails (stock, deleted product), tell the caller instead of hiding it.
  const warnings = [];
  for (const o of orders) { try { await setDone(o); } catch (e) { console.error('Bill saved but order not completed', { businessId: store.id, billId: bill.id, orderId: o.id, message: e?.message }); warnings.push({ orderId: o.id, orderNumber: o.orderNumber || o.id, message: `Bill saved, but order #${o.orderNumber || o.id} could not be marked done and its stock was not updated. Check it in Orders.` }); } }
  if (channel === "table") await TableHold.destroy({ where: { businessId: store.id, tableNumber } }).catch(() => {});
  return { bill: bill.toJSON(), ...(warnings.length ? { warnings } : {}) };
}

// Collections for one IST day, all channels.
export async function daySummary(store, date) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? date : new Date(Date.now() + 19800000).toISOString().slice(0, 10);
  const a = new Date(`${day}T00:00:00+05:30`);
  return { date: day, ...(await billsSummary(store, a, new Date(a.getTime() + 86400000))) };
}
