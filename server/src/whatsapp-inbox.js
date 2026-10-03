// Conversation-list inbox for the shop owner: one row per customer phone, paged, with unread counts.
import { DataTypes, Op, fn, col, where as sqlWhere } from 'sequelize';
import { sequelize } from './db.js';

export const WhatsAppThreadRead = sequelize.define('WhatsAppThreadRead', {
  businessId: { type: DataTypes.INTEGER, primaryKey: true },
  phone: { type: DataTypes.STRING(15), primaryKey: true },
  lastReadId: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 }
}, { tableName: 'whatsapp_thread_reads' });
let readsReady;
const ensureReads = () => (readsReady ||= WhatsAppThreadRead.sync().catch(e => { readsReady = null; throw e; }));
const PHONE = /^[1-9]\d{7,14}$/;
const clampLimit = (v, def, max) => { const n = Number.parseInt(v, 10); return Number.isInteger(n) && n > 0 ? Math.min(n, max) : def; };
const cursor = v => (typeof v === 'string' && /^\d{1,18}$/.test(v) ? v : null);

export function installInboxRoutes(router, { WhatsAppMessage, Lead, ensureSchema, merchantConnection, wrap, bad }) {
  router.get('/conversations', wrap(async (req, res) => {
    if (!(await merchantConnection(req.store.id))) throw bad(503, 'No shop number connected');
    await ensureSchema(); await ensureReads();
    const businessId = req.store.id, limit = clampLimit(req.query.limit, 30, 50), before = cursor(req.query.before);
    const q = typeof req.query.q === 'string' ? req.query.q.replace(/\D/g, '').slice(0, 15) : '';
    const messageWhere = { businessId, ...(q ? { phone: { [Op.like]: `%${q}%` } } : {}) };
    const groups = await WhatsAppMessage.findAll({
      attributes: ['phone', [fn('MAX', col('id')), 'lastId']], where: messageWhere, group: ['phone'],
      having: before ? sqlWhere(fn('MAX', col('id')), '<', before) : undefined,
      order: [[fn('MAX', col('id')), 'DESC']], limit: limit + 1, raw: true
    });
    const hasMore = groups.length > limit, page = groups.slice(0, limit);
    const phones = page.map(g => g.phone), lastIds = page.map(g => g.lastId);
    const [lasts, reads, leads] = phones.length ? await Promise.all([
      WhatsAppMessage.findAll({ where: { id: { [Op.in]: lastIds } }, attributes: ['id', 'phone', 'text', 'direction', 'status', 'eventAt', 'messageType'], raw: true }),
      WhatsAppThreadRead.findAll({ where: { businessId, phone: { [Op.in]: phones } }, raw: true }),
      Lead.findAll({ where: { businessId, customerPhone: { [Op.in]: phones } }, attributes: ['customerPhone', 'customerName', 'createdAt'], order: [['createdAt', 'DESC']], limit: 500, raw: true })
    ]) : [[], [], []];
    const lastBy = new Map(lasts.map(m => [m.phone, m])), readBy = new Map(reads.map(r => [r.phone, String(r.lastReadId)]));
    const nameBy = new Map(); for (const l of leads) if (l.customerName && !nameBy.has(l.customerPhone)) nameBy.set(l.customerPhone, l.customerName);
    const unread = await Promise.all(phones.map(p => WhatsAppMessage.count({ where: { businessId, phone: p, direction: 'inbound', id: { [Op.gt]: readBy.get(p) || '0' } } })));
    const conversations = page.map((g, i) => {
      const m = lastBy.get(g.phone) || {};
      return { phone: g.phone, name: nameBy.get(g.phone) || '', lastId: String(g.lastId), lastText: String(m.text || '').slice(0, 140), lastDirection: m.direction || '', lastStatus: m.status || '', lastAt: m.eventAt || null, unread: unread[i] };
    });
    res.json({ conversations, nextBefore: hasMore ? String(page[page.length - 1].lastId) : null });
  }));

  router.get('/thread', wrap(async (req, res) => {
    if (!(await merchantConnection(req.store.id))) throw bad(503, 'No shop number connected');
    const phone = String(req.query.phone || '');
    if (!PHONE.test(phone)) throw bad(400, 'Valid phone required');
    await ensureSchema();
    const limit = clampLimit(req.query.limit, 40, 100), before = cursor(req.query.before);
    const rows = await WhatsAppMessage.findAll({ where: { businessId: req.store.id, phone, ...(before ? { id: { [Op.lt]: before } } : {}) }, order: [['id', 'DESC']], limit: limit + 1 });
    const hasMore = rows.length > limit, page = rows.slice(0, limit).reverse();
    res.json({ messages: page, nextBefore: hasMore ? String(page[0].id) : null });
  }));

  router.post('/read', wrap(async (req, res) => {
    if (!(await merchantConnection(req.store.id))) throw bad(503, 'No shop number connected');
    const phone = String(req.body?.phone || '');
    if (!PHONE.test(phone)) throw bad(400, 'Valid phone required');
    await ensureSchema(); await ensureReads();
    const latest = await WhatsAppMessage.findOne({ where: { businessId: req.store.id, phone }, order: [['id', 'DESC']], attributes: ['id'], raw: true });
    await WhatsAppThreadRead.upsert({ businessId: req.store.id, phone, lastReadId: latest ? latest.id : 0 });
    res.json({ ok: true });
  }));
}
