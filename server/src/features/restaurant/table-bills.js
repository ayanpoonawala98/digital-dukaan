// Tables view: live table status and settled bills. Bills are append-only history (never edited or deleted).
import { Op, DataTypes } from 'sequelize';
import { sequelize, Product, RestaurantOrder } from '../../models/index.js';
import { bad } from '../../shared/utils/core.js';

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
  cgst: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  sgst: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  total: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  paymentMode: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'cash' },
  customerName: { type: DataTypes.STRING(100), allowNull: true },
  paidAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, { tableName: 'table_bills', indexes: [{ fields: ['businessId', 'channel', 'tableNumber', 'paidAt'] }, { unique: true, fields: ['businessId', 'billNo'] }] });

let ready;
export function ensureTableBillSchema() {
  if (!ready) ready = (async () => {
    await TableBill.sync(); // new table only
    await sequelize.query('ALTER TABLE restaurant_orders ADD COLUMN IF NOT EXISTS "billId" integer');
    await sequelize.query('CREATE INDEX IF NOT EXISTS restaurant_orders_open_idx ON restaurant_orders ("businessId", "billId")');
  })().catch(e => { ready = null; throw e; });
  return ready;
}
const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const channelOf = o => (o.orderType === 'dine-in' ? 'table' : o.orderType === 'delivery' ? 'delivery' : o.orderType === 'counter' ? 'counter' : 'takeaway');
const CHANNEL_WINDOW_MS = 3 * 24 * 3600 * 1000;

export async function tablesState(store) {
  await ensureTableBillSchema();
  const orders = await sequelize.query(
    `SELECT id,"orderNumber","orderType","tableNumber","customerName","customerPhone","deliveryAddress",items,total,status,note,"createdAt" FROM restaurant_orders WHERE "businessId"=:b AND "billId" IS NULL AND status<>'cancelled' AND ("orderType"='dine-in' OR "createdAt">:since) ORDER BY "createdAt" ASC LIMIT 1000`,
    { replacements: { b: store.id, since: new Date(Date.now() - CHANNEL_WINDOW_MS) }, type: sequelize.QueryTypes.SELECT });
  const menu = await sequelize.query(`SELECT id,name,price FROM products WHERE "businessId"=:b AND active=true AND ("soldOutDate" IS NULL OR "soldOutDate"<>:today) ORDER BY name ASC LIMIT 600`, { replacements: { b: store.id, today: new Date(Date.now() + 19800000).toISOString().slice(0, 10) }, type: sequelize.QueryTypes.SELECT });
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
  const all = [...tables, ...Object.values(extra)].map(view);
  return { tableCount: count, menu, name: store.name, gstin: store.gstin || '', tables: all, channels: Object.fromEntries(Object.entries(channels).map(([k, v]) => [k, { orders: v.orders, total: sum(v.orders), open: v.orders.length }])) };
}

export async function billHistory(store, { channel, table, limit = 50 }) {
  await ensureTableBillSchema();
  const where = { businessId: store.id };
  if (channel) where.channel = channel;
  if (table !== undefined && table !== null && table !== '') where.tableNumber = Number(table);
  const rows = await TableBill.findAll({ where, order: [['paidAt', 'DESC'], ['id', 'DESC']], limit: Math.min(200, Math.max(1, Number(limit) || 50)) });
  return { bills: rows.map(r => r.toJSON()) };
}

export async function billsSummary(store, from, to) {
  await ensureTableBillSchema();
  const where = { businessId: store.id };
  if (from || to) where.paidAt = { ...(from ? { [Op.gte]: from } : {}), ...(to ? { [Op.lt]: to } : {}) };
  const rows = await TableBill.findAll({ where, attributes: ['subtotal', 'chargesTotal', 'discount', 'cgst', 'sgst', 'total'], raw: true });
  const s = k => round2(rows.reduce((a, r) => a + Number(r[k] || 0), 0));
  return { count: rows.length, total: s('total'), gst: round2(s('cgst') + s('sgst')), charges: s('chargesTotal'), discounts: s('discount') };
}

const cleanText = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

export async function settleBill(store, body, setDone) {
  await ensureTableBillSchema();
  const channel = ['table', 'delivery', 'takeaway', 'counter'].includes(body?.channel) ? body.channel : null;
  if (!channel) throw bad(400, 'Choose a table or order channel');
  const tableNumber = channel === 'table' ? Number(body.tableNumber) : null;
  if (channel === 'table' && (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > 1000)) throw bad(400, 'Invalid table');
  const orderIds = [...new Set((Array.isArray(body.orderIds) ? body.orderIds : []).map(Number))];
  if (orderIds.length > 100 || orderIds.some(n => !Number.isInteger(n) || n < 1)) throw bad(400, 'Invalid orders');
  const orders = orderIds.length ? await RestaurantOrder.findAll({ where: { id: { [Op.in]: orderIds }, businessId: store.id } }) : [];
  if (orders.length !== orderIds.length) throw bad(404, 'Order not found');
  for (const o of orders) {
    if (o.billId) throw bad(409, 'An order on this bill is already billed');
    if (o.status === 'cancelled') throw bad(400, 'A cancelled order cannot be billed');
    if (channelOf(o) !== channel || (channel === 'table' && o.tableNumber !== tableNumber)) throw bad(400, 'Orders do not belong to this table');
  }
  const raw = Array.isArray(body.lines) ? body.lines : [];
  if (raw.length > 200) throw bad(400, 'Too many bill lines');
  const orderPrice = new Map();
  for (const o of orders) for (const it of o.items || []) orderPrice.set(`${o.id}|${it.name}`, Number(it.price));
  const productIds = [...new Set(raw.filter(l => !l.orderId && l.productId).map(l => Number(l.productId)))];
  const products = productIds.length ? await Product.findAll({ where: { id: { [Op.in]: productIds }, businessId: store.id } }) : [];
  const pmap = new Map(products.map(p => [p.id, p]));
  const lines = [];
  for (const l of raw) {
    const qty = Number(l?.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) throw bad(400, 'Invalid quantity');
    if (l.orderId) {
      const price = orderPrice.get(`${Number(l.orderId)}|${l.name}`);
      if (price === undefined) throw bad(400, 'Bill line does not match its order');
      lines.push({ name: cleanText(l.name, 120), price, qty, orderId: Number(l.orderId), productId: l.productId ? Number(l.productId) : null });
    } else {
      const p = pmap.get(Number(l.productId));
      if (!p) throw bad(400, 'Added item not found on this menu');
      lines.push({ name: p.name, price: Number(p.price), qty, productId: p.id });
    }
  }
  if (!lines.length) throw bad(400, 'Add at least one item to the bill');
  const charges = (Array.isArray(body.charges) ? body.charges : []).slice(0, 10).map(c => ({ label: cleanText(c?.label, 40) || 'Charge', amount: Number(c?.amount) }));
  if (charges.some(c => !Number.isFinite(c.amount) || c.amount < 0 || c.amount > 1e6)) throw bad(400, 'Invalid charge');
  const subtotal = round2(lines.reduce((s, l) => s + l.price * l.qty, 0));
  const chargesTotal = round2(charges.reduce((s, c) => s + c.amount, 0));
  const d = body.discount || {};
  let discount = d.type === 'pct' ? subtotal * Number(d.value || 0) / 100 : Number(d.value || 0);
  if (!Number.isFinite(discount) || discount < 0 || (d.type === 'pct' && Number(d.value) > 100)) throw bad(400, 'Invalid discount');
  discount = round2(Math.min(discount, subtotal + chargesTotal));
  const gstPct = Number(body.gstPct ?? 0);
  if (![0, 5, 12, 18, 28].includes(gstPct)) throw bad(400, 'Choose a valid GST rate');
  const taxable = round2(subtotal + chargesTotal - discount);
  const half = round2(taxable * gstPct / 200);
  const total = Math.round(taxable + half * 2);
  const paymentMode = ['cash', 'upi', 'card'].includes(body.paymentMode) ? body.paymentMode : 'cash';
  const bill = await sequelize.transaction(async t => {
    await sequelize.query('SELECT pg_advisory_xact_lock(:k)', { replacements: { k: 770000 + store.id }, transaction: t });
    const [{ n }] = await sequelize.query('SELECT COALESCE(MAX("billNo"),0)+1 AS n FROM table_bills WHERE "businessId"=:b', { replacements: { b: store.id }, type: sequelize.QueryTypes.SELECT, transaction: t });
    const row = await TableBill.create({ businessId: store.id, billNo: Number(n), channel, tableNumber, orderIds, lines, charges, subtotal, chargesTotal, discount, gstPct, cgst: half, sgst: half, total, paymentMode, customerName: cleanText(body.customerName, 100) || null }, { transaction: t });
    if (orderIds.length) {
      const [, count] = await sequelize.query('UPDATE restaurant_orders SET "billId"=:id WHERE id IN (:ids) AND "businessId"=:b AND "billId" IS NULL', { replacements: { id: row.id, ids: orderIds, b: store.id }, transaction: t });
      if ((count?.rowCount ?? orderIds.length) !== orderIds.length) throw bad(409, 'An order on this bill was just billed elsewhere');
    }
    return row;
  });
  for (const o of orders) { try { await setDone(o); } catch (e) { /* bill is saved; stock/status issues must not undo history */ } }
  return { bill: bill.toJSON() };
}
