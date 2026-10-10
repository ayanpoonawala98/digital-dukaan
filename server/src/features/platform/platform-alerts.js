// Superadmin alerts when someone asks to open a new store. The superadmin pastes the provider keys in the
// dashboard; they are encrypted with the same helper as store keys. Best-effort: never throws into the request,
// sends nothing unless switched on and a provider is connected.
import { DataTypes } from 'sequelize';
import { sequelize } from '../../models/index.js';
import { sendEmail, sendSms, resolveProviders, providerStatus, indianMobile } from '../notifications/notify.js';
import { encryptJson, decryptJson, mergeSecrets, publicView } from '../notifications/notify-secrets.js';
import { bad } from '../../shared/utils/core.js';

export const PlatformAlert = sequelize.define('PlatformAlert', {
  id: { type: DataTypes.INTEGER, primaryKey: true, defaultValue: 1 },
  payload: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
  settings: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
}, { tableName: 'platform_alerts' });

let ready;
const ensure = () => (ready ||= PlatformAlert.sync().catch(e => { ready = null; throw e; }));
export const DEFAULTS = Object.freeze({ ownerWelcomeEmails: false, welcomeEmailMode: 'credentials', emailAlerts: false, alertEmail: '', smsAlerts: false, alertPhone: '' });

export function cleanAlertSettings(raw) {
  const s = { ...DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) };
  return { welcomeEmailMode: s.welcomeEmailMode === 'setup' ? 'setup' : 'credentials', ownerWelcomeEmails: s.ownerWelcomeEmails === true, emailAlerts: s.emailAlerts === true, alertEmail: typeof s.alertEmail === 'string' ? s.alertEmail.trim().slice(0, 160) : '', smsAlerts: s.smsAlerts === true, alertPhone: typeof s.alertPhone === 'string' ? s.alertPhone.trim().slice(0, 20) : '' };
}
async function load() {
  await ensure();
  const row = await PlatformAlert.findByPk(1);
  return { creds: decryptJson(row?.payload) || {}, settings: cleanAlertSettings(row?.settings) };
}
export async function alertState(env = process.env) {
  const { creds, settings } = await load();
  return { settings, providers: providerStatus(resolveProviders(creds, env)), keys: publicView(creds) };
}
export async function saveAlertKeys(input) {
  const { creds } = await load();
  const next = mergeSecrets(creds, input || {});
  let payload;
  try { payload = encryptJson(next); } catch { throw bad(500, 'Saving keys is not available on this server yet'); }
  const [row] = await PlatformAlert.findOrCreate({ where: { id: 1 }, defaults: { payload: '', settings: {} } });
  await row.update({ payload }, { fields: ['payload'] });
  return alertState();
}
export async function saveAlertSettings(input = {}) {
  for (const k of ['emailAlerts', 'smsAlerts', 'ownerWelcomeEmails']) if (input[k] !== undefined && typeof input[k] !== 'boolean') throw bad(400, 'Invalid alert setting');
  const { settings } = await load();
  const next = cleanAlertSettings({ ...settings, ...Object.fromEntries(Object.entries(input).filter(([k]) => k in DEFAULTS)) });
  if (next.alertEmail && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(next.alertEmail)) throw bad(400, 'Enter a valid alert email');
  if (next.alertPhone && !indianMobile(next.alertPhone)) throw bad(400, 'Enter a 10-digit Indian mobile number');
  if (next.emailAlerts && !next.alertEmail) throw bad(400, 'Add the alert email first');
  if (next.smsAlerts && !next.alertPhone) throw bad(400, 'Add the alert mobile number first');
  const row = await PlatformAlert.findByPk(1);
  if(next.ownerWelcomeEmails && !resolveProviders(decryptJson(row?.payload)||{},{ }).email) throw bad(400, 'Connect a platform email provider before enabling owner welcome emails.');
  const [target] = await PlatformAlert.findOrCreate({ where: { id: 1 }, defaults: { payload: '', settings: {} } });
  await target.update({ settings: next }, { fields: ['settings'] });
  return alertState();
}
export async function sendAlertTest(channel, env = process.env, deps = {}) {
  if (!['email', 'sms'].includes(channel)) throw bad(400, 'Choose email or SMS');
  const { creds, settings } = await load();
  const providers = resolveProviders(creds, env);
  if (!providers[channel]) throw bad(400, `${channel === 'email' ? 'Email' : 'SMS'} provider is not connected yet`);
  const to = channel === 'email' ? settings.alertEmail : settings.alertPhone;
  if (!to) throw bad(400, channel === 'email' ? 'Save an alert email first' : 'Save an alert mobile number first');
  const d = { ...deps, providers };
  const r = channel === 'email' ? await sendEmail({ to, subject: 'Digital Shop platform email test', text: 'Digital Shop platform email test' }, d) : await sendSms({ to, text: 'Test alert from Digital Shop. New-store requests will be sent to this number.' }, d);
  if (!r.ok) throw bad(502, r.error || r.skipped || 'Could not send the test');
  return { ok: true };
}
// Called after a ShopRequest is saved. Returns the send results (for tests); never throws.
export async function notifyShopRequest(req, deps = {}) {
  try {
    const { creds, settings } = deps.loaded || await load();
    if (!settings.emailAlerts && !settings.smsAlerts) return [];
    const providers = deps.providers || resolveProviders(creds, deps.env || process.env), d = { ...deps, providers };
    const clean = v => String(v || '').replace(/[\r\n]+/g, ' ').trim();
    const line = `New store request: ${clean(req.shopName).slice(0, 80)} by ${clean(req.name).slice(0, 60)}, ${clean(req.phone).slice(0, 25)}.`;
    const jobs = [];
    if (settings.emailAlerts && settings.alertEmail) jobs.push(sendEmail({ to: settings.alertEmail, subject: `New store request - ${clean(req.shopName).slice(0, 80)}`, text: `${line}\nEmail: ${clean(req.email)}\n${clean(req.message).slice(0, 500)}\n\nOpen Shop requests in the superadmin dashboard.` }, d));
    if (settings.smsAlerts && settings.alertPhone) jobs.push(sendSms({ to: settings.alertPhone, text: line }, d));
    return await Promise.all(jobs);
  } catch (err) { console.error('Shop request alert failed', String(err.message).slice(0, 120)); return []; }
}
