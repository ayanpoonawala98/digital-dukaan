// Kitchen order tickets (KOT). The server remembers what quantity of each line was already printed, so a reprint after
// "Add items" lists only the new quantities. Read-only with respect to orders and bills: nothing here changes money.
import { DataTypes } from 'sequelize';
import { sequelize, RestaurantOrder } from '../../models/index.js';
import { kotLines, printedMap } from './kot-lines.js';
import { bad } from '../../shared/utils/core.js';

export const KotPrint = sequelize.define('KotPrint', {
  orderId: { type: DataTypes.INTEGER, primaryKey: true },
  businessId: { type: DataTypes.INTEGER, allowNull: false },
  printed: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
}, { tableName: 'kot_prints' });

let ready;
export function ensureKotSchema() {
  if (!ready) ready = KotPrint.sync().catch(e => { ready = null; throw e; });
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
