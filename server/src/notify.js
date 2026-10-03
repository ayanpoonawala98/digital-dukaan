// Optional SMS + email notifications. Best-effort and silent when nothing is configured: nothing throws into a request,
// nothing is sent without a provider, and keys come only from the store's own encrypted settings or the platform env.
import { publicAddress } from './net-guard.js';
import { sendSmtp } from './smtp.js';

export const DEFAULT_SETTINGS = Object.freeze({ ownerEmailAlerts: false, ownerEmail: '', ownerSmsAlerts: false, ownerPhone: '', customerSms: false });

// Indian mobile numbers: 10 digits, optionally prefixed with 91 / +91 / 0.
export function indianMobile(value) {
  let d = String(value || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}
const anyNumber = v => { const d = String(v || '').replace(/\D/g, ''); const i = indianMobile(v); return i ? { to: i, intl: `91${i}` } : (d.length >= 8 && d.length <= 15 ? { to: d, intl: d } : null); };

export function cleanSettings(raw) {
  const s = { ...DEFAULT_SETTINGS, ...(raw && typeof raw === 'object' ? raw : {}) };
  return { ownerEmailAlerts: s.ownerEmailAlerts === true, ownerEmail: typeof s.ownerEmail === 'string' ? s.ownerEmail.trim().slice(0, 160) : '', ownerSmsAlerts: s.ownerSmsAlerts === true, ownerPhone: typeof s.ownerPhone === 'string' ? s.ownerPhone.trim().slice(0, 20) : '', customerSms: s.customerSms === true };
}

// Pick the provider per channel: the store's own complete setup first, then the platform env presets.
export function resolveProviders(creds = {}, env = process.env) {
  const c = creds || {}; let email = null, sms = null;
  const r = c.resend || {}, sm = c.smtp || {}, eh = c.emailHttp || {}, f = c.fast2sms || {}, sh = c.smsHttp || {};
  const mode = c.emailMode;
  if (mode === 'resend' && r.apiKey && r.from) email = { kind: 'resend', label: 'Resend', apiKey: r.apiKey, from: r.from, source: 'own' };
  else if (mode === 'smtp' && sm.host && sm.port && sm.from && (!sm.user || sm.pass)) email = { kind: 'smtp', label: 'SMTP', ...sm, source: 'own' };
  else if (mode === 'http' && eh.url) email = { kind: 'http', label: 'Custom email API', ...eh, source: 'own' };
  else if (env.RESEND_API_KEY && env.EMAIL_FROM) email = { kind: 'resend', label: 'Resend', apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM, source: 'platform' };
  const smode = c.smsMode;
  const dltOk = x => x.route !== 'dlt' || (x.senderId && x.templateId);
  if (smode === 'fast2sms' && f.apiKey && dltOk(f)) sms = { kind: 'fast2sms', label: 'Fast2SMS', ...f, source: 'own' };
  else if (smode === 'http' && sh.url) sms = { kind: 'http', label: 'Custom SMS API', ...sh, source: 'own' };
  else if (env.FAST2SMS_API_KEY && (env.FAST2SMS_ROUTE !== 'dlt' || (env.FAST2SMS_SENDER_ID && env.FAST2SMS_TEMPLATE_ID))) sms = { kind: 'fast2sms', label: 'Fast2SMS', apiKey: env.FAST2SMS_API_KEY, route: env.FAST2SMS_ROUTE === 'dlt' ? 'dlt' : 'quick', senderId: env.FAST2SMS_SENDER_ID, templateId: env.FAST2SMS_TEMPLATE_ID, source: 'platform' };
  return { email, sms };
}
export const providerStatus = providers => ({ email: { configured: Boolean(providers?.email), label: providers?.email?.label || '', source: providers?.email?.source || '' }, sms: { configured: Boolean(providers?.sms), label: providers?.sms?.label || '', source: providers?.sms?.source || '' } });

// Fill {{placeholders}} for a custom HTTP provider. Values are escaped for the place they land in.
const esc = { url: encodeURIComponent, form: encodeURIComponent, json: v => JSON.stringify(String(v)).slice(1, -1), text: v => String(v), header: v => String(v).replace(/[\r\n]+/g, ' ') };
const fill = (tpl, vars, mode) => String(tpl || '').replace(/\{\{\s*([a-z_0-9]+)\s*\}\}/gi, (_, k) => esc[mode](vars[k.toLowerCase()] ?? ''));
export function buildHttpRequest(cfg, vars) {
  const v = { ...vars, key: cfg.key || '', key_b64: Buffer.from(cfg.key || '', 'utf8').toString('base64') };
  const method = cfg.method === 'GET' ? 'GET' : 'POST', type = ['json', 'form', 'text'].includes(cfg.contentType) ? cfg.contentType : 'json';
  const headers = {};
  for (const line of String(cfg.headers || '').split('\n').filter(Boolean)) { const i = line.indexOf(':'); headers[line.slice(0, i).trim()] = fill(line.slice(i + 1).trim(), v, 'header'); }
  let body;
  if (method === 'POST') {
    body = fill(cfg.body, v, type === 'json' ? 'json' : type === 'form' ? 'form' : 'text');
    if (!Object.keys(headers).some(h => h.toLowerCase() === 'content-type')) headers['Content-Type'] = { json: 'application/json', form: 'application/x-www-form-urlencoded', text: 'text/plain' }[type];
  }
  return { url: fill(cfg.url, v, 'url'), method, headers, body };
}
async function callHttp(cfg, vars, deps) {
  const req = buildHttpRequest(cfg, vars), u = new URL(req.url);
  if (u.protocol !== 'https:') return { ok: false, error: 'API URL must be https' };
  await publicAddress(u.hostname, deps.lookup);
  const res = await (deps.fetchImpl || fetch)(req.url, { method: req.method, headers: req.headers, body: req.body, redirect: 'manual', signal: AbortSignal.timeout(8000) });
  return res.status >= 200 && res.status < 300 ? { ok: true } : { ok: false, error: `Provider returned ${res.status}` };
}

export async function sendEmail({ to, subject, text, store = '' }, deps = {}) {
  const p = deps.providers?.email;
  if (!p) return { ok: false, skipped: 'Email provider is not configured' };
  if (!to) return { ok: false, skipped: 'No recipient' };
  const fetchImpl = deps.fetchImpl || fetch;
  try {
    if (p.kind === 'resend') {
      const res = await fetchImpl('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${p.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: p.from, to: [to], subject: String(subject).slice(0, 200), text: String(text).slice(0, 5000) }), signal: AbortSignal.timeout(8000) });
      return res.ok ? { ok: true } : { ok: false, error: `Email provider returned ${res.status}` };
    }
    if (p.kind === 'smtp') return await (deps.smtp || sendSmtp)({ host: p.host, port: p.port, secure: p.secure === true, user: p.user, pass: p.pass, from: p.from }, { to, subject: String(subject).slice(0, 200), text: String(text).slice(0, 5000) }, { lookup: deps.lookup });
    return await callHttp(p, { to, message: text, subject, store }, deps);
  } catch (err) { return { ok: false, error: `Email failed: ${String(err.message).slice(0, 120)}` }; }
}

export async function sendSms({ to, text, store = '' }, deps = {}) {
  const p = deps.providers?.sms;
  if (!p) return { ok: false, skipped: 'SMS provider is not configured' };
  const num = p.kind === 'http' ? anyNumber(to) : (indianMobile(to) && { to: indianMobile(to) });
  if (!num) return { ok: false, skipped: p.kind === 'http' ? 'Not a valid phone number' : 'Not an Indian mobile number' };
  const message = String(text).replace(/\s+/g, ' ').trim().slice(0, 300);
  try {
    if (p.kind === 'http') return await callHttp(p, { to: num.to, to_intl: num.intl, message, store }, deps);
    const body = p.route === 'dlt' ? { route: 'dlt', sender_id: p.senderId, message: p.templateId, variables_values: message.replace(/\|/g, '/'), numbers: num.to } : { route: 'q', message, numbers: num.to };
    const res = await (deps.fetchImpl || fetch)('https://www.fast2sms.com/dev/bulkV2', { method: 'POST', headers: { Authorization: p.apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.return === false) return { ok: false, error: `SMS provider rejected the message${data.message ? `: ${[].concat(data.message).join(' ')}` : ''}`.slice(0, 200) };
    return { ok: true };
  } catch (err) { return { ok: false, error: `SMS failed: ${String(err.message).slice(0, 120)}` }; }
}

// deps.creds / deps.env are test hooks; production loads the store's encrypted settings.
export async function resolveDeps(store, deps = {}) {
  let creds = deps.creds;
  if (!creds && !deps.env && !deps.providers) {
    try {
      const { NotifySecret } = await import('./models/index.js');
      const { decryptJson } = await import('./notify-secrets.js');
      creds = decryptJson((await NotifySecret.findByPk(store.id))?.payload);
    } catch { creds = {}; }
  }
  return { ...deps, providers: deps.providers || resolveProviders(creds || {}, deps.env || process.env) };
}

const rs = n => `Rs.${Number(n || 0).toFixed(0)}`;
const summary = (kind, order) => kind === 'restaurant' ? `${(order.items || []).reduce((s, i) => s + Number(i.qty || 0), 0)} items` : (order.productName || 'an item');
async function ownerEmailFor(store, settings) {
  if (settings.ownerEmail) return settings.ownerEmail;
  const { User } = await import('./models/index.js');
  return (await User.findByPk(store.ownerId).catch(() => null))?.email || '';
}

// Never throws and never blocks the caller beyond the provider timeout.
export async function notifyNewOrder(store, kind, order, deps0) {
  try {
    const s = cleanSettings(store.notifySettings);
    if (!s.ownerEmailAlerts && !s.ownerSmsAlerts && !s.customerSms) return [];
    const deps = await resolveDeps(store, deps0);
    if (!deps.providers.email && !deps.providers.sms) return [];
    const label = kind === 'restaurant' ? `order #${order.id}` : `enquiry #${order.id}`;
    const who = order.customerName || order.customerPhone ? ` from ${[order.customerName, order.customerPhone].filter(Boolean).join(' ')}` : '';
    const line = `New ${label} at ${store.name}${who}: ${summary(kind, order)}, ${rs(order.price ?? order.total)}.`;
    const jobs = [];
    if (s.ownerEmailAlerts) jobs.push(ownerEmailFor(store, s).then(to => sendEmail({ to, subject: `New ${label} - ${store.name}`, text: `${line}\n\nOpen your dashboard to review it.`, store: store.name }, deps)));
    if (s.ownerSmsAlerts && s.ownerPhone) jobs.push(sendSms({ to: s.ownerPhone, text: line, store: store.name }, deps));
    if (s.customerSms && order.customerPhone) jobs.push(sendSms({ to: order.customerPhone, text: `Thanks! ${store.name} got your ${label} (${rs(order.price ?? order.total)}). We will update you soon.`, store: store.name }, deps));
    return await Promise.all(jobs);
  } catch (err) { console.error('Order notification failed', err.message); return []; }
}
export async function notifyStatusChange(store, kind, order, statusText, deps0) {
  try {
    const s = cleanSettings(store.notifySettings);
    if (!s.customerSms || !order.customerPhone || !statusText) return [];
    const deps = await resolveDeps(store, deps0);
    if (!deps.providers.sms) return [];
    return [await sendSms({ to: order.customerPhone, text: `${store.name}: your order #${order.id} is ${statusText}.`, store: store.name }, deps)];
  } catch (err) { console.error('Status notification failed', err.message); return []; }
}
export async function saveSettings(store, input) {
  const s = cleanSettings({ ...cleanSettings(store.notifySettings), ...input });
  if (s.ownerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.ownerEmail)) { const e = new Error('Enter a valid alert email address'); e.status = 400; throw e; }
  if (s.ownerPhone) { const p = anyNumber(s.ownerPhone); if (!p) { const e = new Error('Enter a valid mobile number for SMS alerts'); e.status = 400; throw e; } s.ownerPhone = p.to; }
  await store.update({ notifySettings: s });
  return s;
}
