// Superadmin custom domains API. Mounted behind auth + roles('superadmin'); every response is private and uncacheable.
import { Router } from 'express';
import { Op } from 'sequelize';
import { Business } from '../../models/index.js';
import { wrap, bad } from '../../shared/utils/core.js';
import { listDomains, getDomain, createDomain, checkDomain, rotateOwnership, startProvisioning, activateDomain, detachDomain, CustomDomain, ensureDomainSchema } from './domain-service.js';
import { normalizeHostname } from './domain-name.js';
import { hostingSummary, adapterByName, activeAdapter } from './hosting.js';
import { genericGuide, personalGuide } from './domain-guide.js';

const r = Router();
r.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); res.set('Vary', 'Authorization'); next(); });
const numId = v => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw bad(400, 'Invalid ID'); return n; };
const fail = (res, e) => res.status(e.status || 500).json({ error: e.message, code: e.code || undefined });

// Per-user limit on live checks (they reach DNS and the client's server).
const hits = new Map();
const checkLimit = (req, res, next) => {
  const k = req.user.id, now = Date.now(), list = (hits.get(k) || []).filter(t => now - t < 60000);
  if (list.length >= 12) { res.set('Retry-After', String(Math.ceil((60000 - (now - list[0])) / 1000))); return res.status(429).json({ error: 'Too many checks. Wait a moment.', code: 'RATE_LIMITED' }); }
  list.push(now); hits.set(k, list); next();
};

r.get('/', wrap(async (req, res) => res.json(await listDomains({ q: req.query.q, includeDisconnected: req.query.disconnected === '1', page: req.query.page, limit: req.query.limit }))));
r.get('/status', wrap(async (req, res) => { const h = hostingSummary(); res.json({ hosting: { configured: h.configured, adapter: h.adapter } }); }));
// Paginated, searchable store picker. Never loads every store.
r.get('/stores', wrap(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80), page = Math.max(Number(req.query.page) || 1, 1), limit = 15;
  const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
  const { rows, count } = await Business.findAndCountAll({ where: { deletedAt: null, ...(q ? { [Op.or]: [{ name: { [Op.iLike]: like } }, { slug: { [Op.iLike]: like } }] } : {}) }, attributes: ['id', 'name', 'slug'], order: [['name', 'ASC']], limit, offset: (page - 1) * limit });
  res.json({ stores: rows.map(s => ({ id: s.id, name: s.name, slug: s.slug })), total: count, page, limit });
}));
// Review step: normalise and show conflicts without saving.
r.post('/preview', wrap(async (req, res) => {
  try {
    const { hostname, display } = normalizeHostname(req.body?.hostname);
    const store = await Business.findOne({ where: { id: numId(req.body?.businessId), deletedAt: null }, attributes: ['id', 'name', 'slug'] });
    if (!store) throw bad(404, 'Store not found');
    await ensureDomainSchema();
    const existing = await CustomDomain.findOne({ where: { activeKey: hostname }, attributes: ['businessId'] });
    res.json({ hostname, display, store: { id: store.id, name: store.name, slug: store.slug }, conflict: existing && existing.businessId !== store.id ? 'DOMAIN_ALREADY_ASSIGNED' : null, alreadyConnected: !!existing && existing.businessId === store.id });
  } catch (e) { fail(res, e); }
}));
r.post('/', wrap(async (req, res) => {
  try { const out = await createDomain({ hostname: req.body?.hostname, businessId: numId(req.body?.businessId), actor: req.user }); res.status(out.created ? 201 : 200).json(out); } catch (e) { fail(res, e); }
}));
r.get('/guide', wrap(async (req, res) => { res.type('text/plain').set('Content-Disposition', 'attachment; filename="custom-domain-guide.txt"').send(genericGuide()); }));
r.get('/:id', wrap(async (req, res) => res.json({ domain: await getDomain(numId(req.params.id)) })));
r.get('/:id/guide', wrap(async (req, res) => {
  await ensureDomainSchema();
  const d = await CustomDomain.findByPk(numId(req.params.id));
  if (!d) throw bad(404, 'Domain not found');
  const text = personalGuide(d, { ...(d.provisioningAuthorizedAt ? adapterByName(d.hostingAdapter) : activeAdapter()).config() });
  if (!text) return res.status(409).json({ error: 'The personalised guide is available after server setup.', code: 'SERVER_SETUP_REQUIRED' });
  res.type('text/plain').set('Content-Disposition', `attachment; filename="domain-guide-${d.hostname}.txt"`).send(text);
}));
const act = (fn) => wrap(async (req, res) => { try { res.json({ domain: await fn(numId(req.params.id), req.user) }); } catch (e) { fail(res, e); } });
r.post('/:id/check', checkLimit, act(checkDomain));
r.post('/:id/rotate', act(rotateOwnership));
r.post('/:id/provision', act(startProvisioning));
r.post('/:id/activate', act(activateDomain));
r.post('/:id/detach', wrap(async (req, res) => {
  try {
    await ensureDomainSchema();
    const d = await CustomDomain.findByPk(numId(req.params.id));
    if (!d) throw bad(404, 'Domain not found');
    if (req.body?.confirm !== d.hostname) throw Object.assign(bad(400, 'Type the exact hostname to disconnect it.'), { code: 'CONFIRM_MISMATCH' });
    res.json({ domain: await detachDomain(d.id, req.user) });
  } catch (e) { fail(res, e); }
}));
export default r;
