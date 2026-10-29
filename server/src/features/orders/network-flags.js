// Order velocity signals per store network. A burst of orders from one network at one shop within a short window is a
// yellow flag for the owner - never a block, throttle or ban. Indian carriers put many people behind the same address
// (CGNAT), so the signal is a hint to check, nothing more. Keys are HMACs of the network and phone, never raw values.
// Fail-open: a schema or database hiccup logs and lets the order through unflagged.
import { createHmac } from 'node:crypto';
import { DataTypes, Op } from 'sequelize';
import { sequelize } from '../../config/db.js';
import { orderPhone } from '../crm/customer-pure.js';

export const OrderNetworkSignal = sequelize.define('OrderNetworkSignal', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  businessId: { type: DataTypes.INTEGER, allowNull: false },
  kind: { type: DataTypes.STRING(12), allowNull: false }, // restaurant | lead
  orderId: { type: DataTypes.INTEGER, allowNull: false },
  networkKey: { type: DataTypes.STRING(64), allowNull: false },
  phoneKey: { type: DataTypes.STRING(64), allowNull: false, defaultValue: '' }
}, { tableName: 'order_network_signals', indexes: [{ fields: ['businessId', 'networkKey', 'createdAt'] }], updatedAt: false });

let ready;
export function ensureNetworkFlagSchema() {
  if (!ready) ready = (async () => {
    await OrderNetworkSignal.sync(); // additive table only
    await sequelize.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS "networkFlag" boolean NOT NULL DEFAULT false`);
    await sequelize.query(`ALTER TABLE restaurant_orders ADD COLUMN IF NOT EXISTS "networkFlag" boolean NOT NULL DEFAULT false`);
  })().catch(e => { ready = null; throw e; });
  return ready;
}

const WINDOW_MIN = () => Number(process.env.NETWORK_FLAG_WINDOW_MIN) > 0 ? Number(process.env.NETWORK_FLAG_WINDOW_MIN) : 60;
const THRESHOLD = () => Number(process.env.NETWORK_FLAG_THRESHOLD) > 0 ? Number(process.env.NETWORK_FLAG_THRESHOLD) : 5;
const RETENTION_DAYS = 14;

// A /24 for IPv4, a /64-style prefix for IPv6: one household or carrier pool reads as one network, one person hopping
// between towers does not.
function networkOf(ip) {
  const v = String(ip || '').replace(/^::ffff:/, '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) return v.split('.').slice(0, 3).join('.') + '.0/24';
  if (v.includes(':')) return v.split(':').slice(0, 4).join(':') + '::/64';
  return '';
}
const hmac = (scope, value) => createHmac('sha256', process.env.NETWORK_FLAG_SECRET || process.env.JWT_SECRET || '').update(`network-flag|${scope}|${value}`).digest('hex');

let lastPurge = 0;
async function purgeOld() {
  if (Date.now() - lastPurge < 10 * 60 * 1000) return;
  lastPurge = Date.now();
  await OrderNetworkSignal.destroy({ where: { createdAt: { [Op.lt]: new Date(Date.now() - RETENTION_DAYS * 86400000) } }, limit: 1000 }).catch(err => console.error('Network signal cleanup failed', { message: err.message }));
}

// Record one order's signal and say whether this order trips the flag (>= threshold signals from this network at this
// store inside the window, this order included). Returns { networkFlag } - false on any uncertainty.
export async function recordNetworkSignal(req, business, kind, orderId, rawPhone) {
  try {
    await ensureNetworkFlagSchema();
    const net = networkOf(req.ip);
    if (!net || !orderId) return { networkFlag: false };
    void purgeOld();
    const networkKey = hmac(`${business.id}|net`, net);
    const phone = orderPhone(rawPhone);
    const phoneKey = phone ? hmac(`${business.id}|ph`, phone) : '';
    await OrderNetworkSignal.create({ businessId: business.id, kind, orderId, networkKey, phoneKey });
    const since = new Date(Date.now() - WINDOW_MIN() * 60000);
    const count = await OrderNetworkSignal.count({ where: { businessId: business.id, networkKey, createdAt: { [Op.gte]: since } } });
    return { networkFlag: count >= THRESHOLD() };
  } catch (err) {
    console.error('Network signal failed; order unflagged', { businessId: business.id, kind, message: err.message });
    return { networkFlag: false };
  }
}
