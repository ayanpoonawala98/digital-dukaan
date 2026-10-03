// Optional SMS + email notifications. Everything here is best-effort and silent when no provider key is set:
// nothing throws into a request, nothing is sent without keys, and keys only ever come from the environment.

export const DEFAULT_SETTINGS = Object.freeze({
  ownerEmailAlerts: false, ownerEmail: '', ownerSmsAlerts: false, ownerPhone: '', customerSms: false,
});

export function providerStatus(env = process.env) {
  const smsMode = env.FAST2SMS_ROUTE === 'dlt' ? 'dlt' : 'quick';
  return {
    email: { provider: 'Resend', configured: Boolean(env.RESEND_API_KEY && env.EMAIL_FROM) },
    sms: { provider: 'Fast2SMS', mode: smsMode, configured: Boolean(env.FAST2SMS_API_KEY && (smsMode === 'quick' || (env.FAST2SMS_SENDER_ID && env.FAST2SMS_TEMPLATE_ID))) },
  };
}

// Indian mobile numbers only: 10 digits, optionally prefixed with 91 / +91 / 0.
export function indianMobile(value) {
  let d = String(value || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

export function cleanSettings(raw) {
  const s = { ...DEFAULT_SETTINGS, ...(raw && typeof raw === 'object' ? raw : {}) };
  return {
    ownerEmailAlerts: s.ownerEmailAlerts === true, ownerEmail: typeof s.ownerEmail === 'string' ? s.ownerEmail.trim().slice(0, 160) : '',
    ownerSmsAlerts: s.ownerSmsAlerts === true, ownerPhone: typeof s.ownerPhone === 'string' ? s.ownerPhone.trim().slice(0, 20) : '',
    customerSms: s.customerSms === true,
  };
}

export async function sendEmail({ to, subject, text }, { env = process.env, fetchImpl = fetch } = {}) {
  if (!providerStatus(env).email.configured) return { ok: false, skipped: 'Email provider is not configured' };
  if (!to) return { ok: false, skipped: 'No recipient' };
  try {
    const res = await fetchImpl('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject: String(subject).slice(0, 200), text: String(text).slice(0, 5000) }), signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { ok: false, error: `Email provider returned ${res.status}` };
    return { ok: true };
  } catch (err) { return { ok: false, error: `Email failed: ${err.message}` }; }
}

export async function sendSms({ to, text }, { env = process.env, fetchImpl = fetch } = {}) {
  const status = providerStatus(env).sms;
  if (!status.configured) return { ok: false, skipped: 'SMS provider is not configured' };
  const number = indianMobile(to);
  if (!number) return { ok: false, skipped: 'Not an Indian mobile number' };
  const message = String(text).replace(/\s+/g, ' ').trim().slice(0, 300);
  const body = status.mode === 'dlt'
    ? { route: 'dlt', sender_id: env.FAST2SMS_SENDER_ID, message: env.FAST2SMS_TEMPLATE_ID, variables_values: message.replace(/\|/g, '/'), numbers: number }
    : { route: 'q', message, numbers: number };
  try {
    const res = await fetchImpl('https://www.fast2sms.com/dev/bulkV2', { method: 'POST', headers: { Authorization: env.FAST2SMS_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.return === false) return { ok: false, error: `SMS provider rejected the message${data.message ? `: ${[].concat(data.message).join(' ')}` : ''}`.slice(0, 200) };
    return { ok: true };
  } catch (err) { return { ok: false, error: `SMS failed: ${err.message}` }; }
}

const rs = n => `Rs.${Number(n || 0).toFixed(0)}`;
const summary = (kind, order) => kind === 'restaurant' ? `${(order.items || []).reduce((s, i) => s + Number(i.qty || 0), 0)} items` : (order.productName || 'an item');

async function ownerEmailFor(store, settings) {
  if (settings.ownerEmail) return settings.ownerEmail;
  const { User } = await import('./models/index.js');
  const owner = await User.findByPk(store.ownerId).catch(() => null);
  return owner?.email || '';
}

// Never throws and never blocks the caller beyond the provider timeout.
export async function notifyNewOrder(store, kind, order, deps) {
  try {
    const providers = providerStatus(deps?.env);
    if (!providers.email.configured && !providers.sms.configured) return [];
    const s = cleanSettings(store.notifySettings);
    const label = kind === 'restaurant' ? `order #${order.id}` : `enquiry #${order.id}`;
    const who = order.customerName || order.customerPhone ? ` from ${[order.customerName, order.customerPhone].filter(Boolean).join(' ')}` : '';
    const line = `New ${label} at ${store.name}${who}: ${summary(kind, order)}, ${rs(order.price ?? order.total)}.`;
    const jobs = [];
    if (s.ownerEmailAlerts) jobs.push(ownerEmailFor(store, s).then(to => sendEmail({ to, subject: `New ${label} - ${store.name}`, text: `${line}\n\nOpen your dashboard to review it.` }, deps)));
    if (s.ownerSmsAlerts && s.ownerPhone) jobs.push(sendSms({ to: s.ownerPhone, text: line }, deps));
    if (s.customerSms && order.customerPhone) jobs.push(sendSms({ to: order.customerPhone, text: `Thanks! ${store.name} got your ${label} (${rs(order.price ?? order.total)}). We will update you soon.` }, deps));
    return await Promise.all(jobs);
  } catch (err) { console.error('Order notification failed', err.message); return []; }
}

export async function notifyStatusChange(store, kind, order, statusText, deps) {
  try {
    const s = cleanSettings(store.notifySettings);
    if (!s.customerSms || !order.customerPhone || !statusText || !providerStatus(deps?.env).sms.configured) return [];
    return [await sendSms({ to: order.customerPhone, text: `${store.name}: your order #${order.id} is ${statusText}.` }, deps)];
  } catch (err) { console.error('Status notification failed', err.message); return []; }
}

export async function saveSettings(store, input) {
  const s = cleanSettings({ ...cleanSettings(store.notifySettings), ...input });
  if (s.ownerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.ownerEmail)) { const e = new Error('Enter a valid alert email address'); e.status = 400; throw e; }
  if (s.ownerPhone) { const p = indianMobile(s.ownerPhone); if (!p) { const e = new Error('Enter a 10-digit Indian mobile number for SMS alerts'); e.status = 400; throw e; } s.ownerPhone = p; }
  await store.update({ notifySettings: s });
  return s;
}
