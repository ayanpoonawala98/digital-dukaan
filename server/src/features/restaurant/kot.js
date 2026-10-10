// Kitchen order tickets (KOT). The server remembers what quantity of each line was already printed, so a reprint after
// "Add items" lists only the new quantities. Read-only with respect to orders and bills: nothing here changes money.
import { DataTypes } from 'sequelize';
import { sequelize, RestaurantOrder, Lead } from '../../models/index.js';
import { kotLines, printedMap } from './kot-lines.js';
import { bad } from '../../shared/utils/core.js';

export const KotPrint = sequelize.define('KotPrint', {
  orderId: { type: DataTypes.INTEGER, primaryKey: true },
  businessId: { type: DataTypes.INTEGER, allowNull: false },
  printed: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
}, { tableName: 'kot_prints' });

// Retail / service orders (leads) cannot take extra items, so every print lists the whole order; later prints are marked REPRINT.
export const KotPrintLead = sequelize.define('KotPrintLead', {
  orderId: { type: DataTypes.INTEGER, primaryKey: true },
  businessId: { type: DataTypes.INTEGER, allowNull: false },
  count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
}, { tableName: 'kot_prints_leads' });

let ready;
export function ensureKotSchema() {
  if (!ready) ready = Promise.all([KotPrint.sync(), KotPrintLead.sync()]).catch(e => { ready = null; throw e; });
  return ready;
}

export async function makeKot(store, orderId, mode) {
  await ensureKotSchema();
  const order = await RestaurantOrder.findOne({ where: { id: orderId, businessId: store.id } });
  if (!order) throw bad(404, 'Order not found');
  const rec = await KotPrint.findByPk(order.id);
  const printed = rec?.printed || {};
  const lines = kotLines(order.items, printed, mode);
  const kotNo = (rec?.count || 0) + (lines.length ? 1 : 0);
  if (lines.length) await KotPrint.upsert({ orderId: order.id, businessId: store.id, printed: printedMap(order.items), count: kotNo });
  return { kot: { orderId: order.id, orderNumber: order.orderNumber ?? order.id, orderType: order.orderType, tableNumber: order.tableNumber, customerName: order.customerName, note: order.note, createdAt: order.createdAt, kotNo, isReprint: mode === 'all' && !!rec, followUp: mode !== 'all' && !!rec, lines, storeName: store.name } };
}

export async function makeLeadKot(store, leadId) {
  await ensureKotSchema();
  const lead = await Lead.findOne({ where: { id: leadId, businessId: store.id } });
  if (!lead) throw bad(404, 'Order not found');
  const items = Array.isArray(lead.items) && lead.items.length ? lead.items : [{ name: lead.productName, qty: 1 }];
  const rec = await KotPrintLead.findByPk(lead.id);
  const count = (rec?.count || 0) + 1;
  await KotPrintLead.upsert({ orderId: lead.id, businessId: store.id, count });
  return { kot: { orderId: lead.id, orderNumber: lead.orderNumber ?? lead.id, orderType: store.storeType === 'services' ? 'service' : 'retail', tableNumber: null, customerName: lead.customerName || '', customerPhone: lead.customerPhone || '', note: '', createdAt: lead.createdAt, kotNo: count, isReprint: count > 1, followUp: false, lines: kotLines(items, {}, 'all'), storeName: store.name, storeType: store.storeType } };
}
