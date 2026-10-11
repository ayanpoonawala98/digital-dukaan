// Custom domain storage and workflow. Superadmin only (routes enforce it). Deps are injectable so tests never touch DNS or HTTPS.
import { DataTypes, Op } from 'sequelize';
import { sequelize, Business } from '../../models/index.js';
import { bad } from '../../shared/utils/core.js';
import { normalizeHostname, safeHostname, err } from './domain-name.js';
import { OWNERSHIP_TTL_MS, newOwnershipToken, ownershipRecord, routingRecords, tokenMatches, dnsMatches, overallState, STATE_TONE, nextAction, tlsAuthorized, canActivate } from './domain-core.js';
import { activeAdapter, adapterByName, hostingSummary } from './hosting.js';
import { defaultProbes } from './domain-probes.js';

export const CustomDomain = sequelize.define('CustomDomain', {
  hostname: { type: DataTypes.STRING(253), allowNull: false },
  // Equals hostname while the mapping is attached, NULL once detached (tombstone). Unique, so one live mapping per hostname.
  activeKey: { type: DataTypes.STRING(253), unique: true },
  businessId: { type: DataTypes.INTEGER, allowNull: false },
  ownershipToken: { type: DataTypes.STRING(64), allowNull: false },
  ownershipIssuedAt: DataTypes.DATE,
  ownershipExpiresAt: DataTypes.DATE,
  ownershipStatus: { type: DataTypes.STRING(12), defaultValue: 'pending' },
  ownershipCode: DataTypes.STRING(40),
  ownershipCheckedAt: DataTypes.DATE,
  dnsStatus: { type: DataTypes.STRING(12), defaultValue: 'unknown' },
  dnsCode: DataTypes.STRING(40),
  dnsCheckedAt: DataTypes.DATE,
  hostingAdapter: { type: DataTypes.STRING(40), allowNull: false },
  hostingStatus: { type: DataTypes.STRING(12), defaultValue: 'unknown' },
  hostingCode: DataTypes.STRING(40),
  provisioningAuthorizedAt: DataTypes.DATE,
  httpsStatus: { type: DataTypes.STRING(12), defaultValue: 'unknown' },
  httpsCode: DataTypes.STRING(40),
  tlsExpiresAt: DataTypes.DATE,
  httpsCheckedAt: DataTypes.DATE,
  routingStatus: { type: DataTypes.STRING(12), defaultValue: 'unknown' },
  routingCode: DataTypes.STRING(40),
  activatedAt: DataTypes.DATE,
  lastCheckedAt: DataTypes.DATE,
  detachedAt: DataTypes.DATE,
  createdBy: DataTypes.INTEGER
}, { tableName: 'custom_domains', indexes: [{ fields: ['businessId'] }] });

export const DomainAudit = sequelize.define('DomainAudit', {
  hostname: { type: DataTypes.STRING(253), allowNull: false },
  businessId: DataTypes.INTEGER,
  actorId: DataTypes.INTEGER,
  action: { type: DataTypes.STRING(24), allowNull: false },
  outcome: { type: DataTypes.STRING(12), allowNull: false },
  code: DataTypes.STRING(40)
}, { tableName: 'custom_domain_audit', updatedAt: false });

// Which adapter handles a domain: its recorded one once provisioning started, otherwise the one currently selected, so a
// domain saved before hosting was configured moves to the configured adapter instead of staying "setup required".
const adapterFor = d => d.provisioningAuthorizedAt ? adapterByName(d.hostingAdapter) : activeAdapter();

let ready;
export function ensureDomainSchema() {
  if (!ready) ready = CustomDomain.sync().then(() => DomainAudit.sync()).catch(e => { ready = null; throw e; });
  return ready;
}

const audit = (d, actor, action, outcome, code) => DomainAudit.create({ hostname: d.hostname, businessId: d.businessId, actorId: actor?.id ?? null, action, outcome, code: code || null }).catch(() => null);

// Origin allowlist cache: exact https origins of live domains. Refreshed on a timer and after any change; a failed refresh keeps
// the last good set (never widens), and an unknown origin is simply not allowed.
let origins = { at: 0, set: new Set(), byBusiness: new Map() };
export function invalidateOrigins() { origins.at = 0; }
export async function liveOrigins(now = Date.now()) {
  if (now - origins.at < 60000) return origins;
  try {
    await ensureDomainSchema();
    const rows = await CustomDomain.findAll({ where: { detachedAt: null, activatedAt: { [Op.ne]: null } }, attributes: ['hostname', 'businessId', 'ownershipStatus', 'dnsStatus', 'hostingStatus', 'httpsStatus', 'routingStatus'] });
    const verified = rows.filter(d => ['ownershipStatus', 'dnsStatus', 'hostingStatus', 'httpsStatus', 'routingStatus'].every(k => d[k] === 'ok'));
    // A paused or deleted store drops out of the allowlist on the next refresh.
    const stores = verified.length ? await Business.findAll({ where: { id: verified.map(d => d.businessId), active: true, deletedAt: null }, attributes: ['id'] }) : [];
    const okIds = new Set(stores.map(s => s.id));
    const live = verified.filter(d => okIds.has(d.businessId));
    origins = { at: now, set: new Set(live.map(d => `https://${d.hostname}`)), byBusiness: new Map(live.map(d => [d.businessId, d.hostname])) };
  } catch { origins.at = now - 50000; }
  return origins;
}
export const originAllowed = async origin => (await liveOrigins()).set.has(String(origin || ''));
// Public storefront origin for a store: its live custom domain, else null (callers fall back to the platform base URL).
export const customOriginFor = async businessId => { const h = (await liveOrigins()).byBusiness.get(businessId); return h ? `https://${h}` : null; };

export function view(d, { detail = false, hosting = hostingSummary() } = {}) {
  const hostingReady = hosting.configured;
  const state = overallState(d, hostingReady);
  const j = d.toJSON ? d.toJSON() : d;
  const out = {
    id: j.id, hostname: j.hostname, businessId: j.businessId, storeName: j.storeName || null, storeSlug: j.storeSlug || null,
    state, tone: STATE_TONE[state],
    steps: {
      ownership: { status: j.ownershipStatus, code: j.ownershipCode || null, checkedAt: j.ownershipCheckedAt },
      dns: { status: j.dnsStatus, code: j.dnsCode || null, checkedAt: j.dnsCheckedAt },
      hosting: { status: hostingReady ? j.hostingStatus : 'setup_required', code: j.hostingCode || (hostingReady ? null : 'SERVER_SETUP_REQUIRED'), checkedAt: j.lastCheckedAt },
      https: { status: j.httpsStatus, code: j.httpsCode || null, checkedAt: j.httpsCheckedAt, expiresAt: j.tlsExpiresAt }
    },
    routing: { status: j.routingStatus, code: j.routingCode || null },
    lastCheckedAt: j.lastCheckedAt, activatedAt: j.activatedAt, detachedAt: j.detachedAt, ownershipExpiresAt: j.ownershipExpiresAt,
    serverSetupRequired: !hostingReady, canActivate: canActivate(j, hostingReady), nextAction: nextAction(state, { ownershipCode: j.ownershipCode })
  };
  if (detail) out.records = { ownership: ownershipRecord(j.hostname, j.ownershipToken), routing: routingRecords(j.hostname, hosting), routingNote: hostingReady ? '' : 'Exact DNS values come after server setup.' };
  return out;
}

async function load(id) {
  await ensureDomainSchema();
  const d = await CustomDomain.findByPk(Number(id));
  if (!d) throw bad(404, 'Domain not found');
  return d;
}
const withStore = async rows => {
  const ids = [...new Set(rows.map(r => r.businessId))];
  const stores = ids.length ? await Business.findAll({ where: { id: ids }, attributes: ['id', 'name', 'slug'] }) : [];
  const m = new Map(stores.map(s => [s.id, s]));
  return rows.map(r => Object.assign(r, { storeName: m.get(r.businessId)?.name, storeSlug: m.get(r.businessId)?.slug }));
};
const present = async (d, o) => view((await withStore([d]))[0], o);

export async function listDomains({ q = '', includeDisconnected = false, limit = 25, page = 1 } = {}) {
  await ensureDomainSchema();
  const where = includeDisconnected ? {} : { detachedAt: null };
  const s = String(q || '').trim().toLowerCase().slice(0, 100);
  if (s) where.hostname = { [Op.like]: `%${s.replace(/[\\%_]/g, '\\$&')}%` };
  const lim = Math.min(Math.max(Number(limit) || 25, 1), 50), pg = Math.max(Number(page) || 1, 1);
  const { rows, count } = await CustomDomain.findAndCountAll({ where, order: [['createdAt', 'DESC']], limit: lim, offset: (pg - 1) * lim });
  const hosting = hostingSummary();
  return { domains: (await withStore(rows)).map(d => view(d, { hosting })), total: count, page: pg, limit: lim, hosting: { configured: hosting.configured, adapter: hosting.adapter } };
}
export async function getDomain(id) { return present(await load(id), { detail: true }); }

// Idempotent: the same hostname for the same store returns the existing mapping. A different store gets DOMAIN_ALREADY_ASSIGNED.
export async function createDomain({ hostname: raw, businessId, actor }) {
  await ensureDomainSchema();
  const { hostname } = normalizeHostname(raw);
  const store = await Business.findOne({ where: { id: Number(businessId), deletedAt: null }, attributes: ['id', 'name', 'slug'] });
  if (!store) throw bad(404, 'Store not found');
  const existing = await CustomDomain.findOne({ where: { activeKey: hostname } });
  if (existing) {
    if (existing.businessId !== store.id) { await audit({ hostname, businessId: store.id }, actor, 'create', 'denied', 'DOMAIN_ALREADY_ASSIGNED'); throw Object.assign(bad(409, 'That domain is already connected to another store.'), { code: 'DOMAIN_ALREADY_ASSIGNED' }); }
    return { created: false, domain: await present(existing, { detail: true }) };
  }
  const now = Date.now();
  let d;
  try {
    d = await CustomDomain.create({ hostname, activeKey: hostname, businessId: store.id, ownershipToken: newOwnershipToken(), ownershipIssuedAt: new Date(now), ownershipExpiresAt: new Date(now + OWNERSHIP_TTL_MS), hostingAdapter: activeAdapter().name, createdBy: actor?.id ?? null });
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') throw Object.assign(bad(409, 'That domain is already connected to another store.'), { code: 'DOMAIN_ALREADY_ASSIGNED' });
    throw e;
  }
  await audit(d, actor, 'create', 'ok');
  return { created: true, domain: await present(d, { detail: true }) };
}

export async function rotateOwnership(id, actor) {
  const d = await load(id);
  if (d.detachedAt) throw bad(409, 'This domain is disconnected.');
  if (d.ownershipStatus === 'ok') throw bad(409, 'Ownership is already verified.');
  const now = Date.now();
  await d.update({ ownershipToken: newOwnershipToken(), ownershipIssuedAt: new Date(now), ownershipExpiresAt: new Date(now + OWNERSHIP_TTL_MS), ownershipStatus: 'pending', ownershipCode: null });
  await audit(d, actor, 'rotate', 'ok');
  return present(d, { detail: true });
}

const inflight = new Map();
// One check at a time per domain; concurrent callers share the result. Timeouts are saved as Unknown, never as a pass.
export function checkDomain(id, actor, deps = {}) {
  const key = String(id);
  if (inflight.has(key)) return inflight.get(key);
  const p = runCheck(id, actor, deps).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
async function runCheck(id, actor, { probes = defaultProbes, adapter, now = () => new Date() } = {}) {
  const d = await load(id);
  if (d.detachedAt) throw bad(409, 'This domain is disconnected.');
  let patchAdapter = null;
  const ad = adapter || adapterFor(d);
  const hosting = { adapter: ad.name, ...ad.config() };
  if (!adapter && d.hostingAdapter !== ad.name && !d.provisioningAuthorizedAt) patchAdapter = ad.name;
  const t = now();
  const patch = { lastCheckedAt: t };
  // 1. Ownership: the per-request TXT record at the prefixed label, until it expires.
  if (d.ownershipStatus !== 'ok') {
    if (d.ownershipExpiresAt && new Date(d.ownershipExpiresAt) < t) Object.assign(patch, { ownershipStatus: 'failed', ownershipCode: 'OWNERSHIP_EXPIRED', ownershipCheckedAt: t });
    else {
      const r = await probes.txt(`${ownershipRecord(d.hostname, '').host}`);
      if (!r.ok) Object.assign(patch, { ownershipStatus: 'pending', ownershipCode: r.code, ownershipCheckedAt: t });
      else if (tokenMatches(r.values, d.ownershipToken)) Object.assign(patch, { ownershipStatus: 'ok', ownershipCode: null, ownershipCheckedAt: t });
      else Object.assign(patch, { ownershipStatus: 'pending', ownershipCode: 'OWNERSHIP_MISSING', ownershipCheckedAt: t });
    }
  }
  const owned = (patch.ownershipStatus || d.ownershipStatus) === 'ok';
  // 2. Routing DNS, only once ownership is proven and the server has verified targets to compare against.
  if (owned && hosting.configured) {
    const r = await probes.route(d.hostname);
    if (!r.ok) Object.assign(patch, { dnsStatus: 'unknown', dnsCode: r.code, dnsCheckedAt: t });
    else { const m = dnsMatches(r, hosting); Object.assign(patch, m.ok ? { dnsStatus: 'ok', dnsCode: null, dnsCheckedAt: t } : { dnsStatus: m.code === 'DNS_NOT_FOUND' ? 'pending' : 'failed', dnsCode: m.code, dnsCheckedAt: t }); }
  } else if (owned) Object.assign(patch, { dnsStatus: 'unknown', dnsCode: 'SERVER_SETUP_REQUIRED', dnsCheckedAt: t });
  // 3. Hosting + HTTPS + storefront, only after provisioning was authorised and DNS is verified.
  const dnsOk = (patch.dnsStatus || d.dnsStatus) === 'ok';
  if (owned && dnsOk && hosting.configured && d.provisioningAuthorizedAt) {
    let certPending = false;
    try { const s = await ad.status(d); certPending = !!s.certPending; Object.assign(patch, { hostingStatus: s.status === 'provisioned' ? 'ok' : s.status === 'failed' ? 'failed' : 'pending', hostingCode: s.status === 'provisioned' ? null : s.code || null }); } catch (e) { Object.assign(patch, { hostingStatus: 'unknown', hostingCode: ['SERVER_SETUP_REQUIRED', 'HOSTING_AUTH_REJECTED', 'RATE_LIMITED', 'CHECK_TIMEOUT'].includes(e.code) ? e.code : 'CHECK_UNAVAILABLE' }); }
    if ((patch.hostingStatus) === 'ok') {
      const h = await probes.https(d.hostname);
      // The adapter knows the certificate is still being issued: that is pending, not a failure.
      if (h.ok && !h.tls && h.code === 'TLS_FAILED' && certPending) h.code = 'TLS_PENDING';
      if (!h.ok) Object.assign(patch, { httpsStatus: 'unknown', httpsCode: h.code, httpsCheckedAt: t });
      else if (!h.tls) Object.assign(patch, { httpsStatus: h.code === 'TLS_FAILED' ? 'failed' : 'pending', httpsCode: h.code, httpsCheckedAt: t, routingStatus: 'unknown' });
      else {
        Object.assign(patch, { httpsStatus: 'ok', httpsCode: null, httpsCheckedAt: t, tlsExpiresAt: h.expires || null });
        const store = await Business.findByPk(d.businessId, { attributes: ['slug'] });
        Object.assign(patch, h.routed && store && h.slug === store.slug ? { routingStatus: 'ok', routingCode: null } : { routingStatus: 'failed', routingCode: 'ROUTING_MISMATCH' });
      }
    }
  }
  // A live domain that now fails a check is no longer live.
  const next = Object.assign(d, patch);
  if (next.activatedAt && !canActivate(next, hosting.configured)) patch.activatedAt = null;
  if (patchAdapter) patch.hostingAdapter = patchAdapter;
  await d.update(patch);
  invalidateOrigins();
  await audit(d, actor, 'check', 'ok', patch.ownershipCode || patch.dnsCode || patch.httpsCode || patch.routingCode);
  return present(d, { detail: true, hosting });
}

// Moves a verified domain to provisioning. Disabled until the server has verified hosting config.
export async function startProvisioning(id, actor, { adapter } = {}) {
  const d = await load(id);
  const ad = adapter || adapterFor(d);
  if (d.detachedAt) throw bad(409, 'This domain is disconnected.');
  if (!ad.config().configured) { await audit(d, actor, 'provision', 'denied', 'SERVER_SETUP_REQUIRED'); throw Object.assign(bad(409, 'Server setup is required before this domain can be activated.'), { code: 'SERVER_SETUP_REQUIRED' }); }
  if (d.ownershipStatus !== 'ok' || d.dnsStatus !== 'ok') throw Object.assign(bad(409, 'Verify ownership and DNS first.'), { code: 'DNS_MISMATCH' });
  if (d.provisioningAuthorizedAt) return present(d, { detail: true });
  await ad.provision(d);
  await d.update({ provisioningAuthorizedAt: new Date(), hostingStatus: 'pending', hostingAdapter: ad.name });
  invalidateOrigins();
  await audit(d, actor, 'provision', 'ok');
  return present(d, { detail: true });
}

export async function activateDomain(id, actor, { adapter } = {}) {
  const d = await load(id);
  const hostingReady = (adapter || adapterFor(d)).config().configured;
  if (d.detachedAt) throw bad(409, 'This domain is disconnected.');
  if (!hostingReady) { await audit(d, actor, 'activate', 'denied', 'SERVER_SETUP_REQUIRED'); throw Object.assign(bad(409, 'Server setup is required before this domain can be activated.'), { code: 'SERVER_SETUP_REQUIRED' }); }
  if (d.activatedAt) return present(d, { detail: true });
  if (!canActivate(d, hostingReady)) { await audit(d, actor, 'activate', 'denied', 'CHECKS_INCOMPLETE'); throw Object.assign(bad(409, 'Every check must pass before activating.'), { code: 'CHECKS_INCOMPLETE' }); }
  await d.update({ activatedAt: new Date() });
  invalidateOrigins();
  await audit(d, actor, 'activate', 'ok');
  return present(d, { detail: true });
}

// Detach keeps the row as a tombstone (history, audit) and frees the hostname. Store data is not touched. Idempotent.
export async function detachDomain(id, actor, { adapter } = {}) {
  const d = await load(id);
  if (d.detachedAt) return present(d, { detail: true });
  // Nothing was ever attached at the host for an unprovisioned domain, so detaching it must not depend on the host being up.
  if (d.provisioningAuthorizedAt) await (adapter || adapterByName(d.hostingAdapter)).release(d);
  await d.update({ detachedAt: new Date(), activeKey: null, activatedAt: null, provisioningAuthorizedAt: null });
  invalidateOrigins();
  await audit(d, actor, 'detach', 'ok');
  return present(d, { detail: true });
}

// Public: only an active, fully verified domain resolves, and only to its store's public slug.
export async function publicResolve(host) {
  const hostname = safeHostname(host);
  if (!hostname) return null;
  await ensureDomainSchema();
  const d = await CustomDomain.findOne({ where: { activeKey: hostname, detachedAt: null, activatedAt: { [Op.ne]: null } } });
  if (!d || !['ownershipStatus', 'dnsStatus', 'hostingStatus', 'httpsStatus', 'routingStatus'].every(k => d[k] === 'ok')) return null;
  const store = await Business.findOne({ where: { id: d.businessId, active: true, deletedAt: null }, attributes: ['slug'] });
  return store ? { slug: store.slug } : null;
}

// Internal TLS "ask": stored results only, one indexed read, no DNS or network. Any doubt or failure denies.
export async function tlsAsk(host, hostingReady = hostingSummary().configured) {
  const hostname = safeHostname(host);
  if (!hostname || hostname !== host) return false;
  await ensureDomainSchema();
  const d = await CustomDomain.findOne({ where: { activeKey: hostname } });
  return !!d && tlsAuthorized(d, hostingReady);
}
