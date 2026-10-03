// Per-shop AiSensy connection. The shop makes its own AiSensy account (own number, own billing),
// pastes its API campaign key here, and we send order messages through AiSensy's campaign API.
// Dark by default: only shops listed in AISENSY_STORE_IDS can use it.
import { DataTypes } from 'sequelize';
import { Router } from 'express';
import { sequelize } from './db.js';
import { encryptJson, decryptJson } from './notify-secrets.js';
import { itemsText, orderRef, STATUS_LABELS } from './whatsapp-orders.js';
import { bad, wrap } from './utils/core.js';

export const AISENSY_URL = 'https://backend.aisensy.com/campaign/t1/api/v2';
export const AiSensyConnection = sequelize.define('AiSensyConnection', {
  businessId: { type: DataTypes.INTEGER, primaryKey: true },
  payload: { type: DataTypes.TEXT, allowNull: false },
  campaigns: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  keyHint: { type: DataTypes.STRING(8), allowNull: true },
  lastStatus: { type: DataTypes.STRING(20), allowNull: true },
  lastError: { type: DataTypes.STRING(200), allowNull: true },
  lastAt: { type: DataTypes.DATE, allowNull: true }
}, { tableName: 'aisensy_connections' });
let ready;
export const ensureAiSensySchema = async () => { if (!ready) ready = AiSensyConnection.sync().catch(e => { ready = null; throw e; }); await ready; };

export const CAMPAIGN_KINDS = ['confirm', 'alert', 'status'];
export const allowedStoreIds = () => (process.env.AISENSY_STORE_IDS || '').split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s));
export const aisensyAllowedFor = id => allowedStoreIds().includes(String(id));
export const cleanKey = v => { if (typeof v !== 'string') throw bad(400, 'Paste your AiSensy API key'); const k = v.trim(); if (k.length < 20 || k.length > 1500 || !/^[A-Za-z0-9._~+/=-]+$/.test(k)) throw bad(400, 'That does not look like an AiSensy API campaign key. Copy it exactly from AiSensy > Developer.'); return k; };
export const cleanCampaigns = v => {
  const out = {};
  for (const k of CAMPAIGN_KINDS) {
    const raw = v?.[k]; if (raw === undefined || raw === null || raw === '') continue;
    if (typeof raw !== 'string' || raw.trim().length > 100 || /[\r\n\0]/.test(raw)) throw bad(400, 'Campaign names must be short, one line each');
    out[k] = raw.trim();
  }
  return out;
};
export const toDestination = phone => { const d = String(phone || '').replace(/\D/g, ''); const n = d.length === 10 ? `91${d}` : d; return /^[1-9]\d{9,14}$/.test(n) ? `+${n}` : null; };

// One call to AiSensy. Returns {ok, error?}. Never throws, never logs the key.
export async function sendCampaign({ apiKey, campaignName, destination, userName, templateParams = [] }, fetcher = fetch) {
  try {
    const res = await fetcher(AISENSY_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apiKey, campaignName, destination, userName: String(userName || 'Customer').slice(0, 100), source: 'Digital Shop', templateParams: templateParams.map(p => String(p).slice(0, 500)) }), signal: AbortSignal.timeout(15000) });
    const body = await res.json().catch(() => ({}));
    const failed = !res.ok || body.success === false || body.success === 'false';
    if (failed) return { ok: false, error: String(body.message || body.error || `AiSensy said no (${res.status})`).slice(0, 200) };
    return { ok: true };
  } catch { return { ok: false, error: 'Could not reach AiSensy' }; }
}
async function load(businessId) {
  await ensureAiSensySchema();
  const row = await AiSensyConnection.findByPk(businessId);
  if (!row) return null;
  const { apiKey } = decryptJson(row.payload);
  return apiKey ? { row, apiKey } : null;
}
const record = (row, r) => row.update({ lastStatus: r.ok ? 'ok' : 'failed', lastError: r.ok ? null : r.error, lastAt: new Date() }).catch(() => {});

// Hooks used by the order flow. Return true when the AiSensy route owns this shop (so the shared-number path is skipped).
export async function aisensyRoutes(store) {
  if (!aisensyAllowedFor(store.id)) return null;
  const c = await load(store.id).catch(() => null);
  return c && c.row.enabled ? c : null;
}
export async function aisensyNewOrder(c, store, lead, fetcher = fetch) {
  const ref = orderRef(lead.id), items = itemsText(lead), total = `Rs.${Number(lead.price || 0).toFixed(2)}`, camps = c.row.campaigns || {};
  const owner = toDestination(store.notifySettings?.ownerPhone), cust = toDestination(lead.customerPhone);
  const jobs = [];
  if (owner && camps.alert) jobs.push(sendCampaign({ apiKey: c.apiKey, campaignName: camps.alert, destination: owner, userName: 'Shop owner', templateParams: [ref, items, total] }, fetcher));
  if (cust && camps.confirm) jobs.push(sendCampaign({ apiKey: c.apiKey, campaignName: camps.confirm, destination: cust, userName: lead.customerName, templateParams: [store.name, ref, total] }, fetcher));
  const results = await Promise.all(jobs);
  const bad1 = results.find(r => !r.ok);
  if (results.length) await record(c.row, bad1 || { ok: true });
  return results.length > 0;
}
export async function aisensyStatus(c, store, lead, status, fetcher = fetch) {
  const dest = toDestination(lead.customerPhone), label = STATUS_LABELS[status];
  if (!dest || !label || !c.row.campaigns?.status) return false;
  const r = await sendCampaign({ apiKey: c.apiKey, campaignName: c.row.campaigns.status, destination: dest, userName: lead.customerName, templateParams: [orderRef(lead.id), label] }, fetcher);
  await record(c.row, r);
  return r.ok;
}

const view = (row, store) => ({ available: true, connected: Boolean(row), enabled: Boolean(row?.enabled), keyHint: row?.keyHint || '', campaigns: row?.campaigns || {}, lastStatus: row?.lastStatus || null, lastError: row?.lastError || null, lastAt: row?.lastAt || null, ownerPhone: store.notifySettings?.ownerPhone || '' });
const cooldown = new Map();
export const aisensyOwnerRoutes = Router({ mergeParams: true });
aisensyOwnerRoutes.use((req, res, next) => req.user?.role !== 'owner' || !aisensyAllowedFor(req.store?.id) ? res.status(404).json({ error: 'Not available for this shop yet' }) : next());
aisensyOwnerRoutes.get('/', wrap(async (req, res) => { await ensureAiSensySchema(); res.json(view(await AiSensyConnection.findByPk(req.store.id), req.store)); }));
aisensyOwnerRoutes.put('/', wrap(async (req, res) => {
  await ensureAiSensySchema();
  const b = req.body || {}, prev = await AiSensyConnection.findByPk(req.store.id);
  if (b.enabled !== undefined && typeof b.enabled !== 'boolean') throw bad(400, 'Invalid setting');
  const campaigns = b.campaigns === undefined ? prev?.campaigns || {} : cleanCampaigns(b.campaigns);
  let payload = prev?.payload, keyHint = prev?.keyHint;
  if (b.apiKey) { const k = cleanKey(b.apiKey); try { payload = encryptJson({ apiKey: k }); } catch { throw bad(500, 'Saving keys is not available on this server yet'); } keyHint = k.slice(-4); }
  if (!payload) throw bad(400, 'Paste your AiSensy API key first');
  const enabled = b.enabled ?? prev?.enabled ?? false;
  if (enabled && !Object.keys(campaigns).length) throw bad(400, 'Add at least one campaign name before turning this on');
  await AiSensyConnection.upsert({ businessId: req.store.id, payload, campaigns, enabled, keyHint });
  res.json(view(await AiSensyConnection.findByPk(req.store.id), req.store));
}));
aisensyOwnerRoutes.delete('/', wrap(async (req, res) => { await ensureAiSensySchema(); await AiSensyConnection.destroy({ where: { businessId: req.store.id } }); res.json(view(null, req.store)); }));
// Send one sample message to a number the owner types (their own phone). Counts against their AiSensy wallet.
aisensyOwnerRoutes.post('/test', wrap(async (req, res) => {
  const kind = req.body?.kind, dest = toDestination(req.body?.phone);
  if (!CAMPAIGN_KINDS.includes(kind)) throw bad(400, 'Pick which message to test');
  if (!dest) throw bad(400, 'Enter a valid mobile number');
  const c = await load(req.store.id); if (!c) throw bad(400, 'Save your AiSensy key first');
  const name = c.row.campaigns?.[kind]; if (!name) throw bad(400, 'Add the campaign name for this message first');
  if (Date.now() - (cooldown.get(req.store.id) || 0) < 20000) throw bad(429, 'Wait a few seconds before another test');
  cooldown.set(req.store.id, Date.now());
  const params = { confirm: [req.store.name, 'DD-TEST', 'Rs.100.00'], alert: ['DD-TEST', '1 x Sample item', 'Rs.100.00'], status: ['DD-TEST', 'confirmed'] }[kind];
  const r = await sendCampaign({ apiKey: c.apiKey, campaignName: name, destination: dest, userName: 'Test', templateParams: params });
  await record(c.row, r);
  if (!r.ok) throw bad(502, r.error);
  res.json({ ok: true });
}));
