// Real dependencies for the status service. Each one is read-only.
import { Op } from 'sequelize';
import { sequelize, Business, NotifySecret } from '../../models/index.js';
import { platformProviders } from './platform-alerts.js';
import { resolveStoreProviders } from '../notifications/notify.js';
import { decryptJson } from '../notifications/notify-secrets.js';
import { sendSmtp } from '../../shared/smtp.js';
import { adapters, checkByoConnection, WhatsAppByoConnection } from '../whatsapp/whatsapp-byo.js';
import { WhatsAppConnection, legacyConnection, connectionToken } from '../whatsapp/whatsapp-merchants.js';
import { WhatsAppMessage } from '../whatsapp/whatsapp-cloud.js';
import { createStatusService } from './system-status.js';

const fail = statusCheck => Object.assign(new Error(statusCheck), { statusCheck });
// A missing table (feature never used) reads as "not connected", never as a failure and never creates the table.
const safe = async fn => { try { return await fn(); } catch { return null; } };

export const realDeps = {
  env: process.env,
  // SELECT 1 inside a transaction with a server-side statement timeout, so a stuck query cannot hold the small pool.
  dbQuery: () => sequelize.transaction(async transaction => {
    await sequelize.query('SET LOCAL statement_timeout = 3500', { transaction });
    await sequelize.query('SELECT 1', { transaction });
  }),
  platformProviders: () => safe(() => platformProviders()).then(p => p || { email: null, sms: null }),
  platformWhatsApp: () => (process.env.WHATSAPP_CLOUD_ENABLED === 'true' && process.env.WHATSAPP_ACCESS_TOKEN ? legacyConnection() : null),
  metaCheck: (c, f) => adapters.meta.check(c, f),
  byoCheck: (conn, f) => checkByoConnection(conn, f),
  smtpVerify: async p => {
    try { await sendSmtp({ host: p.host, port: p.port, secure: p.secure === true, user: p.user, pass: p.pass, from: p.from }, { to: 'status@invalid.invalid', subject: '', text: '' }, { verifyOnly: true, timeoutMs: 4500 }); }
    catch (e) {
      const m = String(e?.message || '');
      if (/not allowed/i.test(m)) throw fail('CONFIG_INCOMPLETE');
      if (/SMTP (4\d\d|5\d\d) on AUTH|on AUTH/i.test(m)) throw fail('AUTH_REJECTED');
      if (/timeout/i.test(m)) throw fail('CHECK_TIMEOUT');
      if (/greeting|STARTTLS/i.test(m)) throw fail('CHECK_FAILED');
      throw fail('CHECK_UNREACHABLE');
    }
  },
  // Documented account usage lookup. Account-level numbers only; no files are listed, uploaded or deleted.
  imagekitUsage: async (key, f) => {
    const end = new Date(), start = new Date(end.getTime() - 7 * 86400000), d = x => x.toISOString().slice(0, 10);
    const res = await f(`https://api.imagekit.io/v1/accounts/usage?startDate=${d(start)}&endDate=${d(end)}`, { headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}` } });
    if (!res.ok) throw fail(res.status === 401 || res.status === 403 ? 'AUTH_REJECTED' : res.status === 429 ? 'RATE_LIMITED' : res.status >= 500 ? 'PROVIDER_ERROR' : 'CHECK_FAILED');
    const body = await res.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail('CHECK_FAILED');
  },
  lastWhatsAppInbound: async () => {
    const bound = /^\d+$/.test(process.env.WHATSAPP_INTEGRATION_BUSINESS_ID || '') ? Number(process.env.WHATSAPP_INTEGRATION_BUSINESS_ID) : null;
    if (!bound) return null;
    const m = await safe(() => WhatsAppMessage.findOne({ where: { businessId: bound, direction: 'inbound' }, order: [['eventAt', 'DESC']], attributes: ['eventAt'] }));
    return m?.eventAt || null;
  },
  storeInfo: async id => {
    const b = await Business.findByPk(id, { attributes: ['id', 'name', 'slug'] });
    if (!b) return null;
    const secret = await safe(() => NotifySecret.findByPk(id));
    const providers = resolveStoreProviders(decryptJson(secret?.payload));
    const byoRow = await safe(() => WhatsAppByoConnection.findByPk(id));
    const merchantRow = await safe(() => WhatsAppConnection.findByPk(id));
    return {
      id: b.id, name: b.name, providers,
      byo: byoRow ? { conn: byoRow, enabled: byoRow.enabled, sender: byoRow.sender, providerLabel: ({ meta: 'Meta Cloud API', '360dialog': '360dialog', twilio: 'Twilio' })[byoRow.provider] || 'WhatsApp provider' } : null,
      merchant: merchantRow ? { state: merchantRow.state, displayPhone: merchantRow.displayPhone, phoneNumberId: merchantRow.phoneNumberId, token: () => connectionToken(merchantRow) } : null
    };
  }
};

export const statusService = createStatusService(realDeps);

export async function searchStores({ q, page, pageSize }) {
  const where = { deletedAt: null };
  if (q) { const e = q.replace(/[\\%_]/g, '\\$&'); where[Op.or] = [{ name: { [Op.iLike]: `%${e}%` } }, { slug: { [Op.iLike]: `%${e}%` } }]; }
  const { rows, count } = await Business.findAndCountAll({ where, attributes: ['id', 'name', 'slug', 'storeType'], order: [['name', 'ASC']], limit: pageSize, offset: (page - 1) * pageSize });
  return { stores: rows.map(b => ({ id: b.id, name: b.name, slug: b.slug, storeType: b.storeType })), total: count, page, pageSize, hasMore: page * pageSize < count };
}
