// Superadmin "System status": read-only checks with fixed adapters and fixed destinations.
// Nothing here sends a message, uploads a file, changes a setting or calls a payment API.
// Every result carries an app-owned code and text. Provider bodies, SQL errors, stack traces
// and secret values never reach a result.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const TTL_MS = 5 * 60 * 1000;       // remote results are reused for 5 minutes
export const CHECK_MS = 5000;               // each remote check
export const RUN_MS = 15000;                // a whole "Check connections" run
export const MAX_CONCURRENT = 3;
export const SHORT_TTL_MS = 30 * 1000;   // timeouts and unreachable answers are not a verdict
const SHORT_CODES = new Set(['CHECK_TIMEOUT', 'CHECK_UNREACHABLE', 'PROVIDER_ERROR', 'CHECK_FAILED']);
const ttlFor = r => (SHORT_CODES.has(r.code) ? SHORT_TTL_MS : TTL_MS);
export const SECTIONS = ['Platform', 'Messaging providers', 'Storage & configuration', 'Build information'];

// code -> [state, label, reason, next step]
const CODES = {
  API_OK: ['ok', 'Operational', 'The status API answered this signed-in request.', ''],
  DB_OK: ['ok', 'Operational', 'The database answered a simple query.', ''],
  DB_TIMEOUT: ['failed', 'Not responding', 'The database did not answer within 4 seconds.', 'Check the database host and its connection limit, then run the check again.'],
  DB_UNAVAILABLE: ['failed', 'Unavailable', 'The database refused or dropped the connection.', 'Check that the database is running and DATABASE_URL is correct.'],
  CREDENTIALS_ACCEPTED: ['ok', 'Credentials accepted', 'The provider accepted the saved credentials. This does not prove message delivery or webhooks.', ''],
  AUTH_REJECTED: ['failed', 'Credentials rejected', 'The provider rejected the saved credentials.', 'Reconnect the provider with a fresh key or token.'],
  RATE_LIMITED: ['attention', 'Rate limited', 'The provider asked us to slow down.', 'Wait a few minutes and check again.'],
  CHECK_TIMEOUT: ['attention', 'Slow or no answer', 'The provider did not answer within 5 seconds.', 'Check again in a minute. If it keeps happening, check the provider status page.'],
  CHECK_UNREACHABLE: ['attention', 'Could not reach provider', 'The check could not connect to the provider.', 'Check again in a minute.'],
  PROVIDER_ERROR: ['attention', 'Provider error', 'The provider reported a server problem.', 'Check the provider status page, then check again.'],
  CHECK_FAILED: ['attention', 'Unexpected answer', 'The provider answered in a way this check does not understand.', 'Check again. If it repeats, review the connection details.'],
  RUN_DEADLINE: ['unknown', 'Not checked', 'The 15 second limit for this run was reached before this check finished.', 'Press Check connections again.'],
  NOT_CHECKED: ['unknown', 'Not checked', 'Connection checks have not been run yet.', 'Press Check connections.'],
  NOT_CONFIGURED: ['neutral', 'Not configured', 'This is not set up.', ''],
  DISABLED: ['neutral', 'Disabled', 'This is switched off.', ''],
  CONFIG_INCOMPLETE: ['attention', 'Setup incomplete', 'Some required details are missing or malformed.', 'Complete the connection details.'],
  CONFIG_PRESENT: ['unknown', 'Configured, not tested', 'Details are saved and look well formed. The connection was not tested.', ''],
  CHECK_UNSUPPORTED: ['unknown', 'Configuration only', 'This provider has no safe read-only check, so only the saved details were checked.', ''],
  EMAIL_NOT_CONFIGURED: ['neutral', 'Not configured', 'No email provider is connected.', ''],
  ENV_OK: ['ok', 'Set', 'Present and well formed.', ''],
  ENV_MISSING_REQUIRED: ['failed', 'Missing', 'A required setting is missing.', 'Add this setting on the server and restart.'],
  ENV_INVALID: ['failed', 'Invalid format', 'The setting is present but not in the expected format.', 'Correct this setting on the server and restart.'],
  ENV_OPTIONAL_INVALID: ['attention', 'Invalid format', 'An optional setting is present but not in the expected format.', 'Correct or remove this setting.'],
  ENV_OPTIONAL_UNSET: ['neutral', 'Not set', 'Optional and not used.', ''],
  LOCKED: ['neutral', 'Locked - configuration only', 'Payments are locked. Nothing is called and no validity is claimed.', ''],
  NO_RECENT_OBSERVATION: ['unknown', 'No recent observation', 'Nothing was recorded recently. That is not proof that it is down.', ''],
  ACTIVITY_OK: ['ok', 'Recent activity recorded', 'A recent success was recorded.', ''],
  BUILD_OK: ['ok', 'Known', '', ''],
  BUILD_UNKNOWN: ['unknown', 'Unknown', 'No deployment metadata is available.', ''],
  BUILD_MISMATCH: ['attention', 'Revisions differ', 'The frontend and backend report different revisions.', 'Confirm both were deployed from the same commit.']
};
export const codeInfo = code => CODES[code];

export function row(o) {
  const [state, label, reason, nextStep] = CODES[o.code] || CODES.CHECK_FAILED;
  return {
    id: o.id, section: o.section, scope: o.scope || 'platform', storeId: o.storeId ?? null,
    name: o.name, checkType: o.checkType, state: o.state || state, label: o.label || label, code: o.code,
    reason: (o.state || state) === 'ok' && !o.keepReason ? '' : (o.reason ?? reason), nextStep: o.nextStep ?? nextStep,
    latencyMs: Number.isFinite(o.latencyMs) ? Math.round(o.latencyMs) : null,
    checkedAt: o.checkedAt || null, detail: o.detail || '', verified: o.verified === true, excluded: o.excluded === true,
    httpStatus: Number.isInteger(o.httpStatus) ? o.httpStatus : undefined, retryAfterUntil: o.retryAfterUntil || undefined
  };
}

const withTimeout = (promise, ms, onTimeout) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(onTimeout()), ms);
  promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
});
const tooSlow = () => Object.assign(new Error('timeout'), { statusCheck: 'CHECK_TIMEOUT' });

// Masks a phone number to its last four digits.
export const maskNumber = value => { const d = String(value || '').replace(/\D/g, ''); return d.length >= 4 ? `ending ${d.slice(-4)}` : ''; };

// Wraps fetch so every provider call is bounded, never follows redirects, and records the status.
export function boundedFetch(fetchImpl, ms = CHECK_MS) {
  const seen = { status: null, retryAfter: null };
  const f = async (url, init = {}) => {
    const res = await fetchImpl(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(ms) });
    seen.status = res.status;
    seen.retryAfter = res.headers?.get?.('retry-after') || null;
    return res;
  };
  return { fetch: f, seen };
}
const retryAfterMs = value => {
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0) return Math.min(n, 3600) * 1000;
  const t = Date.parse(value || '');
  return Number.isFinite(t) ? Math.min(Math.max(t - Date.now(), 0), 3600 * 1000) : 0;
};
// Turns a thrown error or odd status from a provider call into a stable app code. Never copies a provider message.
export function classify(err, seen) {
  if (err?.statusCheck) return err.statusCheck;
  if ([190, 100, 10, 200, 102].includes(Number(err?.metaCode))) return 'AUTH_REJECTED';
  if ([4, 17, 32, 613, 80007].includes(Number(err?.metaCode))) return 'RATE_LIMITED';
  const s = seen?.status;
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError' || /timeout|timed out/i.test(String(err?.message))) return 'CHECK_TIMEOUT';
  if (s === 401 || s === 403 || err?.status === 401 || err?.status === 403) return 'AUTH_REJECTED';
  if (s === 429) return 'RATE_LIMITED';
  if (s >= 500) return 'PROVIDER_ERROR';
  if (s >= 300 && s < 400) return 'CHECK_FAILED';
  if (/rejected (this|the)/i.test(String(err?.message || '')) && s === null) return 'AUTH_REJECTED';
  if (/did not respond|not responding/i.test(String(err?.message || ''))) return 'CHECK_UNREACHABLE';
  if (s) return 'CHECK_FAILED';
  return 'CHECK_UNREACHABLE';
}

// ---- environment (booleans only: values, lengths and suffixes are never returned) ----
const httpsUrl = v => { try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; } };
const originList = v => String(v).split(',').map(s => s.trim()).filter(Boolean).every(o => { try { const u = new URL(o); return (u.protocol === 'https:' || u.hostname === 'localhost') && !u.username && !u.password && u.origin === o.replace(/\/$/, ''); } catch { return false; } });
export const ENV_RULES = [
  { key: 'DATABASE_URL', required: true, group: 'Database', valid: v => /^postgres(ql)?:\/\//.test(v) },
  { key: 'JWT_SECRET', required: true, group: 'Sign-in', valid: v => v.length >= 32 },
  { key: 'CLIENT_URL', required: true, group: 'Allowed origins', valid: originList },
  { key: 'NOTIFY_ENC_KEY', required: false, group: 'Encryption', valid: v => v.length >= 32 },
  { key: 'INVOICE_LINK_SECRET', required: false, group: 'Encryption', valid: v => v.length >= 32 },
  { key: 'WHATSAPP_TOKEN_ENCRYPTION_KEY', required: false, group: 'Encryption', valid: v => /^[a-f0-9]{64}$/i.test(v) },
  { key: 'PUBLIC_API_URL', required: false, group: 'Origins', valid: httpsUrl },
  { key: 'IMAGEKIT_URL_ENDPOINT', required: false, group: 'Uploads', valid: v => httpsUrl(v) && /^https:\/\/ik\.imagekit\.io\/[A-Za-z0-9_-]+\/?$/.test(v) },
  { key: 'IMAGEKIT_PRIVATE_KEY', required: false, group: 'Uploads', valid: v => /^private_[A-Za-z0-9+/=_-]{10,}$/.test(v) },
  { key: 'VAPID_PUBLIC_KEY', required: false, group: 'Push', valid: v => /^[A-Za-z0-9_-]{80,100}$/.test(v) },
  { key: 'VAPID_PRIVATE_KEY', required: false, group: 'Push', valid: v => /^[A-Za-z0-9_-]{40,50}$/.test(v) },
  { key: 'CRON_SECRET', required: false, group: 'Background jobs', valid: v => v.length >= 16 },
  { key: 'META_APP_SECRET', required: false, group: 'WhatsApp', valid: v => v.length >= 16 },
  { key: 'WHATSAPP_VERIFY_TOKEN', required: false, group: 'WhatsApp', valid: v => v.length >= 8 },
  { key: 'WHATSAPP_GRAPH_VERSION', required: false, group: 'WhatsApp', valid: v => /^v\d+\.0$/.test(v) }
];
export function environmentRows(env, now) {
  const checkedAt = now().toISOString();
  return ENV_RULES.map(rule => {
    const v = env[rule.key];
    const present = typeof v === 'string' && v.length > 0;
    let code;
    if (!present) code = rule.required ? 'ENV_MISSING_REQUIRED' : 'ENV_OPTIONAL_UNSET';
    else if (rule.valid(v)) code = 'ENV_OK';
    else code = rule.required ? 'ENV_INVALID' : 'ENV_OPTIONAL_INVALID';
    return row({ id: `env:${rule.key}`, section: 'Storage & configuration', name: rule.key, checkType: 'configuration', code, checkedAt, detail: rule.group, verified: code === 'ENV_OK' });
  });
}

// ---- email / sms / imagekit / razorpay / webhooks (local, configuration only) ----
const emailForm = p => {
  if (!p) return 'EMAIL_NOT_CONFIGURED';
  if (p.kind === 'resend') return /^re_[A-Za-z0-9_]{8,}$/.test(p.apiKey || '') && /@/.test(p.from || '') ? 'CONFIG_PRESENT' : 'CONFIG_INCOMPLETE';
  if (p.kind === 'smtp') return p.host && Number.isInteger(Number(p.port)) && Number(p.port) > 0 && Number(p.port) < 65536 && /@/.test(p.from || '') && (!p.user || p.pass) ? 'CONFIG_PRESENT' : 'CONFIG_INCOMPLETE';
  if (p.kind === 'http') return httpsUrl(p.url) ? 'CONFIG_PRESENT' : 'CONFIG_INCOMPLETE';
  return 'CONFIG_INCOMPLETE';
};
export function emailRowLocal({ id, scope, storeId, provider, checkedAt }) {
  const base = { id, section: 'Messaging providers', scope, storeId, name: 'Email', checkType: 'configuration', checkedAt };
  const code = emailForm(provider);
  if (!provider) return row({ ...base, code: 'EMAIL_NOT_CONFIGURED', detail: '' });
  const detail = provider.label + (provider.source === 'platform' ? ' (platform)' : '');
  if (code === 'CONFIG_PRESENT') return row({ ...base, code: 'CHECK_UNSUPPORTED', detail, reason: provider.kind === 'smtp' ? 'Saved details look well formed. Press Check connections to test the login.' : 'No safe read-only check exists for this provider without sending, so only the saved details were checked.' });
  return row({ ...base, code, detail });
}
export function smsRowLocal({ id, scope, storeId, provider, checkedAt }) {
  const base = { id, section: 'Messaging providers', scope, storeId, name: 'SMS', checkType: 'configuration', checkedAt };
  if (!provider) return row({ ...base, code: 'NOT_CONFIGURED', detail: '', reason: 'No SMS provider is connected.' });
  const okForm = provider.kind === 'http' ? httpsUrl(provider.url) : Boolean(provider.apiKey);
  return row({ ...base, code: okForm ? 'CHECK_UNSUPPORTED' : 'CONFIG_INCOMPLETE', detail: provider.label + (provider.source === 'platform' ? ' (platform)' : ''), label: okForm ? 'Delivery not tested' : undefined, reason: okForm ? 'Only the saved details were checked. No SMS was sent and no balance was used.' : undefined });
}
export function imagekitRowLocal(env, checkedAt) {
  const base = { id: 'imagekit', section: 'Storage & configuration', name: 'ImageKit uploads', checkType: 'configuration', checkedAt };
  const hasKey = Boolean(env.IMAGEKIT_PRIVATE_KEY), endpoint = env.IMAGEKIT_URL_ENDPOINT;
  if (!hasKey && !endpoint) return row({ ...base, code: 'NOT_CONFIGURED', reason: 'Uploads use the server disk. ImageKit is not set up.' });
  const endpointOk = !endpoint || ENV_RULES.find(r => r.key === 'IMAGEKIT_URL_ENDPOINT').valid(endpoint);
  if (!hasKey || !endpointOk) return row({ ...base, code: 'CONFIG_INCOMPLETE' });
  return row({ ...base, code: 'CONFIG_PRESENT', label: 'Configured, not tested', reason: 'The key is present and the endpoint looks right. Press Check connections to test the key. Uploads are never tested.' });
}
export function razorpayRow(env, checkedAt) {
  return row({ id: 'razorpay', section: 'Storage & configuration', name: 'Razorpay', checkType: 'configuration', code: 'LOCKED', checkedAt, excluded: true, detail: env.RAZORPAY_ENABLED === 'true' ? 'Flag is on' : 'Flag is off' });
}
export function webhookRows(env, checkedAt, lastInboundAt) {
  const base = { section: 'Storage & configuration', scope: 'platform', checkedAt };
  const wa = Boolean(env.WHATSAPP_VERIFY_TOKEN) && Boolean(env.META_APP_SECRET);
  const rows = [
    row({ ...base, id: 'webhook-whatsapp', name: 'WhatsApp webhook', checkType: 'configuration', code: env.WHATSAPP_CLOUD_ENABLED !== 'true' ? 'DISABLED' : wa ? 'CONFIG_PRESENT' : 'CONFIG_INCOMPLETE', reason: env.WHATSAPP_CLOUD_ENABLED !== 'true' ? 'WhatsApp Cloud is switched off.' : undefined }),
    row({ ...base, id: 'push', name: 'Web push', checkType: 'configuration', code: env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY ? 'CONFIG_PRESENT' : 'NOT_CONFIGURED', reason: env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY ? undefined : 'Push keys are not set, so push alerts are off.' }),
    row({ ...base, id: 'jobs', name: 'Background jobs', checkType: 'configuration', code: env.CRON_SECRET ? 'CONFIG_PRESENT' : 'NOT_CONFIGURED', reason: env.CRON_SECRET ? 'The job secret is set. Whether the scheduler calls it is not checked.' : 'The job secret is not set, so scheduled jobs cannot run.' })
  ];
  if (env.WHATSAPP_CLOUD_ENABLED === 'true') {
    rows.push(row({ ...base, id: 'webhook-whatsapp-activity', name: 'WhatsApp inbound messages', checkType: 'activity', code: lastInboundAt ? 'ACTIVITY_OK' : 'NO_RECENT_OBSERVATION', detail: lastInboundAt ? `Last recorded ${new Date(lastInboundAt).toISOString()}` : '', verified: Boolean(lastInboundAt), checkedAt, reason: lastInboundAt ? 'Last recorded inbound message shown. Older than a day does not mean down.' : undefined, keepReason: true }));
  }
  return rows;
}

// ---- build information ----
let pkgVersion = '';
try { pkgVersion = JSON.parse(readFileSync(fileURLToPath(new URL('../../../package.json', import.meta.url)), 'utf8')).version || ''; } catch { /* unknown */ }
const REV_KEYS = ['RENDER_GIT_COMMIT', 'VERCEL_GIT_COMMIT_SHA', 'GIT_COMMIT', 'SOURCE_VERSION', 'HEROKU_SLUG_COMMIT', 'COMMIT_REF'];
export function buildInfo(env, now, uptimeSec = process.uptime()) {
  const rev = String(REV_KEYS.map(k => env[k]).find(v => /^[a-f0-9]{7,40}$/i.test(v || '')) || '').slice(0, 7).toLowerCase();
  const deployedAt = Number.isFinite(Date.parse(env.DEPLOYED_AT || '')) ? new Date(env.DEPLOYED_AT).toISOString() : null;
  return {
    backend: { version: pkgVersion || null, revision: rev || null, startedAt: new Date(now().getTime() - uptimeSec * 1000).toISOString(), uptimeSeconds: Math.round(uptimeSec), lastDeployAt: deployedAt },
    note: 'A restart is not a deploy. Last deploy shows only when the host reports it.'
  };
}

export function buildRows(env, now) {
  const b = buildInfo(env, now).backend, checkedAt = now().toISOString();
  const mk = (id, name, value, extra = {}) => row({ id, section: 'Build information', name, checkType: 'configuration', code: value ? 'BUILD_OK' : 'BUILD_UNKNOWN', detail: value || '', checkedAt, verified: Boolean(value), ...extra });
  return [mk('build:be-version', 'Backend version', b.version), mk('build:be-revision', 'Backend revision', b.revision), mk('build:be-started', 'Process started (a restart is not a deploy)', b.startedAt), mk('build:be-uptime', 'Process uptime', `${b.uptimeSeconds} seconds`), mk('build:be-deploy', 'Last deploy', b.lastDeployAt)];
}

// ---- the service ----
export function createStatusService(deps) {
  const now = deps.now || (() => new Date());
  const checkMs = deps.checkMs || CHECK_MS, runMs = deps.runMs || RUN_MS;
  const cache = new Map();       // probe key -> row (remote results)
  const inflight = new Map();    // probe key -> promise
  const retryUntil = new Map();  // probe key -> ms epoch
  let dbFlight = null;
  let running = 0; const waiters = [];
  const acquire = () => new Promise(res => { if (running < MAX_CONCURRENT) { running++; res(); } else waiters.push(res); });
  const release = () => { const w = waiters.shift(); if (w) w(); else running--; };

  async function dbRow() {
    // One probe at a time: a slow probe is shared, never stacked on the small connection pool.
    if (!dbFlight) {
      const started = Date.now();
      dbFlight = withTimeout(Promise.resolve().then(() => deps.dbQuery()), 4000, () => Object.assign(new Error('t'), { code: 'DB_TIMEOUT' }))
        .then(() => ({ code: 'DB_OK', ms: Date.now() - started }), e => ({ code: e.code === 'DB_TIMEOUT' ? 'DB_TIMEOUT' : 'DB_UNAVAILABLE', ms: Date.now() - started }))
        .finally(() => { dbFlight = null; });
    }
    const r = await dbFlight;
    return row({ id: 'db', section: 'Platform', name: 'Database (PostgreSQL)', checkType: 'connectivity', code: r.code, latencyMs: r.ms, checkedAt: now().toISOString(), verified: r.code === 'DB_OK' });
  }
  const apiRow = () => row({ id: 'api', section: 'Platform', name: 'API availability', checkType: 'connectivity', code: 'API_OK', checkedAt: now().toISOString(), verified: true, latencyMs: 0, detail: 'Signed-in status request' });

  // Remote probe definitions for the platform and (optionally) one store.
  async function describeProbes(storeId) {
    const env = deps.env, checkedAt = now().toISOString();
    const probes = [], local = [];
    const sec = 'Messaging providers';
    // Platform WhatsApp
    const legacy = deps.platformWhatsApp ? deps.platformWhatsApp() : null;
    const waBase = { section: sec, scope: 'platform', checkType: 'connectivity' };
    if (!legacy) local.push(row({ ...waBase, id: 'wa:platform', name: 'WhatsApp (platform sender)', code: env.WHATSAPP_CLOUD_ENABLED === 'true' ? 'CONFIG_INCOMPLETE' : 'NOT_CONFIGURED', checkedAt, reason: env.WHATSAPP_CLOUD_ENABLED === 'true' ? undefined : 'No platform WhatsApp sender is set up.' }));
    else probes.push({ key: 'wa:platform', meta: { ...waBase, id: 'wa:platform', name: 'WhatsApp (platform sender)', detail: `Meta Cloud API ${maskNumber(legacy.displayPhone)}`.trim() }, run: f => deps.metaCheck({ accessToken: legacy.accessToken, phoneNumberId: legacy.phoneNumberId }, f) });
    // Platform email
    const pp = await deps.platformProviders();
    const mailProbe = (key, id, scope, sid, provider) => {
      if (provider?.kind === 'smtp' && emailForm(provider) === 'CONFIG_PRESENT') probes.push({ key, meta: { section: sec, scope, storeId: sid, id, name: 'Email', checkType: 'connectivity', detail: 'SMTP (login only, nothing sent)' }, run: () => deps.smtpVerify(provider) });
      else local.push(emailRowLocal({ id, scope, storeId: sid, provider, checkedAt }));
    };
    mailProbe('smtp:platform', 'email:platform', 'platform', null, pp.email);
    local.push(smsRowLocal({ id: 'sms:platform', scope: 'platform', provider: pp.sms, checkedAt }));
    // ImageKit
    const ik = imagekitRowLocal(env, checkedAt);
    if (ik.code === 'CONFIG_PRESENT' && deps.imagekitUsage) probes.push({ key: 'imagekit', meta: { section: 'Storage & configuration', scope: 'platform', id: 'imagekit', name: 'ImageKit uploads', checkType: 'connectivity', detail: 'Account usage lookup (no files touched, uploads not tested)' }, run: f => deps.imagekitUsage(env.IMAGEKIT_PRIVATE_KEY, f) });
    else local.push(ik);
    // Selected store
    let store = null;
    if (storeId) {
      store = await deps.storeInfo(storeId);
      if (store) {
        const sb = { section: sec, scope: 'store', storeId: store.id, checkType: 'connectivity' };
        if (store.byo) {
          if (!store.byo.enabled) local.push(row({ ...sb, id: `wa:byo:${store.id}`, name: 'WhatsApp (own provider)', code: 'DISABLED', checkedAt, detail: store.byo.providerLabel + (store.byo.sender ? ` ${maskNumber(store.byo.sender)}` : '') }));
          else probes.push({ key: `wa:byo:${store.id}`, meta: { ...sb, id: `wa:byo:${store.id}`, name: 'WhatsApp (own provider)', detail: `${store.byo.providerLabel} ${maskNumber(store.byo.sender)}`.trim() }, run: f => deps.byoCheck(store.byo.conn, f) });
        }
        if (store.merchant) {
          if (store.merchant.state !== 'connected') local.push(row({ ...sb, id: `wa:merchant:${store.id}`, name: 'WhatsApp (connected number)', code: 'DISABLED', checkedAt, detail: maskNumber(store.merchant.displayPhone) }));
          else probes.push({ key: `wa:merchant:${store.id}`, meta: { ...sb, id: `wa:merchant:${store.id}`, name: 'WhatsApp (connected number)', detail: `Meta Cloud API ${maskNumber(store.merchant.displayPhone)}`.trim() }, run: f => deps.metaCheck({ accessToken: store.merchant.token(), phoneNumberId: store.merchant.phoneNumberId }, f) });
        }
        if (!store.byo && !store.merchant) local.push(row({ ...sb, id: `wa:none:${store.id}`, name: 'WhatsApp', code: 'NOT_CONFIGURED', checkedAt, reason: 'This store has no WhatsApp connection.' }));
        mailProbe(`smtp:store:${store.id}`, `email:store:${store.id}`, 'store', store.id, store.providers.email);
        local.push(smsRowLocal({ id: `sms:store:${store.id}`, scope: 'store', storeId: store.id, provider: store.providers.sms, checkedAt }));
      }
    }
    return { probes, local, store };
  }

  const cachedOrPlaceholder = (p, t) => {
    const hit = cache.get(p.key);
    if (hit) { const stale = t - Date.parse(hit.checkedAt) > ttlFor(hit); return { ...hit, stale }; }
    return { ...row({ ...p.meta, code: 'NOT_CHECKED' }), stale: false };
  };

  async function snapshot({ storeId } = {}) {
    const t = now().getTime();
    const [dbr, d] = await Promise.all([dbRow(), describeProbes(storeId)]);
    const checkedAt = now().toISOString();
    let lastInbound = null;
    try { lastInbound = await deps.lastWhatsAppInbound?.(); } catch { lastInbound = null; }
    const rows = [apiRow(), dbr, ...buildRows(deps.env, now), ...d.probes.map(p => cachedOrPlaceholder(p, t)), ...d.local, ...environmentRows(deps.env, now), razorpayRow(deps.env, checkedAt), ...webhookRows(deps.env, checkedAt, lastInbound)];
    return finish(rows, { storeId: d.store?.id ?? null, storeName: d.store?.name || null, storeRequested: storeId ? Boolean(d.store) : null, checkedAt });
  }

  async function runProbe(p, deadlineAt) {
    if (inflight.has(p.key)) return inflight.get(p.key);
    const hit = cache.get(p.key);
    const t = now().getTime();
    if (hit && t - Date.parse(hit.checkedAt) <= ttlFor(hit)) return hit;
    if ((retryUntil.get(p.key) || 0) > t && hit) return hit;
    const job = (async () => {
      await acquire();
      try {
        if (Date.now() >= deadlineAt) return row({ ...p.meta, code: 'RUN_DEADLINE', checkedAt: now().toISOString() });
        const { fetch: f, seen } = boundedFetch(deps.fetchImpl || fetch, Math.min(checkMs, Math.max(50, deadlineAt - Date.now())));
        const started = Date.now();
        let code = 'CREDENTIALS_ACCEPTED';
        try { await withTimeout(Promise.resolve().then(() => p.run(f)), checkMs + 100, tooSlow); }
        catch (e) { code = classify(e, seen); }
        if (code === 'CREDENTIALS_ACCEPTED' && seen.status !== null && (seen.status < 200 || seen.status >= 300)) code = classify(null, seen);
        const result = row({ ...p.meta, code, latencyMs: Date.now() - started, checkedAt: now().toISOString(), verified: code === 'CREDENTIALS_ACCEPTED', httpStatus: Number.isInteger(seen.status) && code !== 'CREDENTIALS_ACCEPTED' ? seen.status : undefined });
        if (code === 'RATE_LIMITED') { const ms = retryAfterMs(seen.retryAfter) || 60000; retryUntil.set(p.key, Date.now() + ms); result.retryAfterUntil = new Date(Date.now() + ms).toISOString(); }
        // Timeouts and unreachable answers are not cached for the full TTL as if they were a verdict.
        cache.set(p.key, result);
        return result;
      } finally { release(); }
    })().finally(() => inflight.delete(p.key));
    inflight.set(p.key, job);
    return job;
  }

  async function check({ storeId } = {}) {
    const deadlineAt = Date.now() + runMs;
    const d = await describeProbes(storeId);
    let timer;
    await Promise.race([
      Promise.allSettled(d.probes.map(p => runProbe(p, deadlineAt))),
      new Promise(res => { timer = setTimeout(res, runMs); })
    ]);
    clearTimeout(timer);
    return snapshot({ storeId });
  }

  function finish(rows, meta) {
    const counted = rows.filter(r => !r.excluded && r.state !== 'neutral');
    const summary = {
      // Operational counts live connectivity checks only. Config, env, build and activity rows keep their own states but are not connections.
      operational: counted.filter(r => r.checkType === 'connectivity' && r.state === 'ok' && r.verified).length,
      attention: counted.filter(r => r.state === 'attention').length,
      failed: counted.filter(r => r.state === 'failed').length,
      notChecked: counted.filter(r => r.state === 'unknown').length
    };
    const connectivity = rows.filter(r => r.checkType === 'connectivity' && r.state !== 'neutral');
    const fresh = r => !r.stale;
    const allConnectivityOk = connectivity.length > 0 && connectivity.every(r => r.state === 'ok' && r.verified && fresh(r));
    return { generatedAt: meta.checkedAt, ttlMs: TTL_MS, store: meta.storeId ? { id: meta.storeId, name: meta.storeName } : null, storeFound: meta.storeRequested, summary: { ...summary, checkedConnectionsOperational: allConnectivityOk }, sections: SECTIONS.map(name => ({ name, rows: rows.filter(r => r.section === name) })), build: buildInfo(deps.env, now) };
  }
  // The build section rows come from buildInfo on the client; the server also provides plain rows for completeness.
  return { snapshot, check, _cache: cache };
}
