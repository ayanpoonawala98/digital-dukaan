// Client subscriptions: 1-month trial, then manual monthly payments. No payment gateway; a gateway can later
// write rows into subscription_payments (method 'gateway', gatewayRef) without a schema change.
import { DataTypes, Op } from 'sequelize';
import { sequelize, User, Business } from '../../models/index.js';
import { PlatformAlert } from './platform-alerts.js';
import { decryptJson } from '../notifications/notify-secrets.js';
import { resolveProviders, sendEmail } from '../notifications/notify.js';
import { bad } from '../../shared/utils/core.js';

export const DIGEST_EMAIL = 'digital.shops.website@gmail.com';
export const STATUSES = ['trial', 'active', 'past_due', 'suspended'];
const TRIAL_DAYS = 30, GRACE_DAYS = 5;

export const ClientSubscription = sequelize.define('ClientSubscription', {
  userId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  plan: { type: DataTypes.STRING(60), allowNull: false, defaultValue: 'Standard' },
  monthlyFee: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  trialStart: { type: DataTypes.DATEONLY, allowNull: false },
  trialEnd: { type: DataTypes.DATEONLY, allowNull: false },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'trial' },
  storeLimit: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  notes: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' }
}, { tableName: 'client_subscriptions' });

export const SubscriptionPayment = sequelize.define('SubscriptionPayment', {
  userId: { type: DataTypes.INTEGER, allowNull: false },
  month: { type: DataTypes.STRING(7), allowNull: false }, // YYYY-MM, the month the payment covers
  amount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  paidOn: { type: DataTypes.DATEONLY, allowNull: false },
  method: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'manual' },
  gatewayRef: { type: DataTypes.STRING(80), allowNull: true },
  note: { type: DataTypes.STRING(200), allowNull: false, defaultValue: '' }
}, { tableName: 'subscription_payments', indexes: [{ unique: true, fields: ['userId', 'month'] }] });

export const PlatformKv = sequelize.define('PlatformKv', {
  key: { type: DataTypes.STRING(60), primaryKey: true },
  value: { type: DataTypes.STRING(200), allowNull: false, defaultValue: '' }
}, { tableName: 'platform_kv' });

let ready;
export const ensureSubscriptionSchema = () => ready ||= Promise.all([ClientSubscription.sync(), SubscriptionPayment.sync(), PlatformKv.sync()]).catch(e => { ready = null; throw e; });

const istDay = (d = new Date()) => new Date(+d + 330 * 60000).toISOString().slice(0, 10);
const addDays = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const diffDays = (a, b) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000);
const validDay = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v)) && !Number.isNaN(Date.parse(v + 'T00:00:00Z'));
const validMonth = v => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v));

// Derived view of one client's billing state (pure, testable).
export function computeState(sub, paidMonths, today = istDay()) {
  const month = today.slice(0, 7);
  const trialDaysLeft = diffDays(sub.trialEnd, today);
  const inTrial = trialDaysLeft >= 0 && sub.status !== 'active';
  const billable = !inTrial && sub.status !== 'suspended' && Number(sub.monthlyFee) > 0;
  const paidThisMonth = paidMonths.includes(month);
  const firstDue = addDays(sub.trialEnd, 1);
  const dueDate = firstDue > month + '-01' ? firstDue : month + '-01';
  const monthPayment = !billable ? (inTrial ? 'trial' : sub.status === 'suspended' ? 'suspended' : 'no_fee') : paidThisMonth ? 'paid' : 'due';
  const overdue = billable && !paidThisMonth && today > addDays(dueDate, GRACE_DAYS);
  const trialEndingSoon = inTrial && trialDaysLeft <= 7;
  const effectiveStatus = sub.status === 'suspended' ? 'suspended' : overdue ? 'past_due' : inTrial ? 'trial' : sub.status === 'past_due' && !paidThisMonth ? 'past_due' : 'active';
  return { month, trialDaysLeft, inTrial, monthPayment, overdue, trialEndingSoon, dueDate, effectiveStatus };
}

async function subFor(user, storeCount) {
  await ensureSubscriptionSchema();
  let sub = await ClientSubscription.findOne({ where: { userId: user.id } });
  if (!sub) {
    const today = istDay();
    const count = storeCount ?? await Business.count({ where: { ownerId: user.id, deletedAt: null } });
    sub = await ClientSubscription.create({ userId: user.id, trialStart: today, trialEnd: addDays(today, TRIAL_DAYS), storeLimit: Math.max(1, count) });
  }
  return sub;
}

export async function clientList({ q = '', status = 'all' } = {}) {
  await ensureSubscriptionSchema();
  const owners = await User.findAll({ where: { role: 'owner' }, order: [['id', 'ASC']] });
  const stores = await Business.findAll({ where: { deletedAt: null }, attributes: ['id', 'ownerId', 'name', 'slug', 'storeType', 'active'] });
  const payments = await SubscriptionPayment.findAll({ order: [['month', 'DESC']] });
  const rows = [];
  for (const u of owners) {
    const mine = stores.filter(s => s.ownerId === u.id);
    const sub = await subFor(u, mine.length);
    const paid = payments.filter(p => p.userId === u.id);
    const st = computeState(sub, paid.map(p => p.month));
    rows.push({ userId: u.id, name: u.name, email: u.email, active: u.active, plan: sub.plan, monthlyFee: sub.monthlyFee, trialStart: sub.trialStart, trialEnd: sub.trialEnd, status: sub.status, storeLimit: sub.storeLimit, storesUsed: mine.length, stores: mine.map(s => ({ id: s.id, name: s.name, slug: s.slug, storeType: s.storeType })), notes: sub.notes, lastPaidMonth: paid[0]?.month || null, lastPaidOn: paid[0]?.paidOn || null, totalPaid: paid.reduce((n, p) => n + p.amount, 0), ...st });
  }
  const needle = String(q || '').toLowerCase().trim();
  const out = rows.filter(r => (!needle || `${r.name} ${r.email} ${r.stores.map(s => s.name).join(' ')}`.toLowerCase().includes(needle)) && (status === 'all' || !status || (status === 'overdue' ? r.overdue : status === 'due' ? r.monthPayment === 'due' : status === 'paid' ? r.monthPayment === 'paid' : r.effectiveStatus === status)));
  const expiring = rows.filter(r => r.trialEndingSoon), overdue = rows.filter(r => r.overdue);
  return { clients: out, summary: { total: rows.length, trial: rows.filter(r => r.effectiveStatus === 'trial').length, active: rows.filter(r => r.effectiveStatus === 'active').length, pastDue: overdue.length, suspended: rows.filter(r => r.effectiveStatus === 'suspended').length, dueThisMonth: rows.filter(r => r.monthPayment === 'due').length, paidThisMonth: rows.filter(r => r.monthPayment === 'paid').length, monthlyRecurring: rows.filter(r => r.effectiveStatus !== 'suspended').reduce((n, r) => n + r.monthlyFee, 0) }, alerts: { trialsEndingSoon: expiring.map(r => ({ userId: r.userId, name: r.name, daysLeft: r.trialDaysLeft, trialEnd: r.trialEnd })), overdue: overdue.map(r => ({ userId: r.userId, name: r.name, monthlyFee: r.monthlyFee, dueDate: r.dueDate })) } };
}

export async function updateClient(userId, body = {}) {
  const user = await User.findOne({ where: { id: userId, role: 'owner' } });
  if (!user) throw bad(404, 'Client not found');
  const sub = await subFor(user);
  const patch = {};
  if (body.plan !== undefined) { const v = String(body.plan).trim(); if (!v || v.length > 60) throw bad(400, 'Plan name must be 1-60 characters'); patch.plan = v; }
  if (body.monthlyFee !== undefined) { const n = Number(body.monthlyFee); if (!Number.isInteger(n) || n < 0 || n > 10000000) throw bad(400, 'Monthly fee must be a whole number of rupees, 0 or more'); patch.monthlyFee = n; }
  for (const k of ['trialStart', 'trialEnd']) if (body[k] !== undefined) { if (!validDay(body[k])) throw bad(400, 'Use dates like 2026-10-31'); patch[k] = body[k]; }
  if (body.status !== undefined) { if (!STATUSES.includes(body.status)) throw bad(400, 'Status must be trial, active, past_due or suspended'); patch.status = body.status; }
  if (body.storeLimit !== undefined) { const n = Number(body.storeLimit); if (!Number.isInteger(n) || n < 0 || n > 100) throw bad(400, 'Store limit must be 0 to 100'); patch.storeLimit = n; }
  if (body.notes !== undefined) patch.notes = String(body.notes).slice(0, 500);
  if ((patch.trialEnd || sub.trialEnd) < (patch.trialStart || sub.trialStart)) throw bad(400, 'Trial end cannot be before trial start');
  await sub.update(patch);
  return sub;
}

export async function clientPayments(userId) {
  await ensureSubscriptionSchema();
  return SubscriptionPayment.findAll({ where: { userId }, order: [['month', 'DESC']] });
}
export async function markPaid(userId, body = {}) {
  const user = await User.findOne({ where: { id: userId, role: 'owner' } });
  if (!user) throw bad(404, 'Client not found');
  const sub = await subFor(user);
  const month = body.month || istDay().slice(0, 7);
  if (!validMonth(month)) throw bad(400, 'Month must look like 2026-11');
  const amount = body.amount === undefined || body.amount === '' ? sub.monthlyFee : Number(body.amount);
  if (!Number.isInteger(amount) || amount < 0 || amount > 10000000) throw bad(400, 'Amount must be a whole number of rupees');
  const paidOn = body.paidOn && validDay(body.paidOn) ? body.paidOn : istDay();
  const method = ['manual', 'upi', 'bank', 'cash'].includes(body.method) ? body.method : 'manual';
  const [row, created] = await SubscriptionPayment.findOrCreate({ where: { userId, month }, defaults: { amount, paidOn, method, note: String(body.note || '').slice(0, 200) } });
  if (!created) throw bad(409, `${month} is already marked paid for this client.`);
  if (sub.status === 'past_due' || sub.status === 'trial') await sub.update({ status: 'active' });
  return row;
}
export async function undoPayment(userId, id) {
  await ensureSubscriptionSchema();
  const n = await SubscriptionPayment.destroy({ where: { id, userId } });
  if (!n) throw bad(404, 'Payment not found');
}

// Store limit (audit M7): owners cannot create more stores than the superadmin allows.
export async function assertCanCreateStore(user) {
  const count = await Business.count({ where: { ownerId: user.id, deletedAt: null } });
  const sub = await subFor(user, count);
  if (count >= sub.storeLimit) throw bad(403, `Your plan allows ${sub.storeLimit} store${sub.storeLimit === 1 ? '' : 's'}. Contact Digital Shop to add more.`);
}

async function platformMail(message) {
  await PlatformAlert.sync();
  const row = await PlatformAlert.findByPk(1);
  const providers = resolveProviders(decryptJson(row?.payload) || {}, {});
  if (!providers.email) throw bad(400, 'Connect a platform email provider first (Platform alerts).');
  const result = await sendEmail(message, { providers });
  if (!result.ok) throw bad(502, 'The email provider did not accept the message.');
  return { status: 'accepted', message: 'Provider accepted the email. Delivery is not yet confirmed.' };
}
const inr = n => 'Rs ' + Number(n || 0).toLocaleString('en-IN');

export function digestText(data, today = istDay()) {
  const c = data.clients, lines = c.map(r => `- ${r.name} (${r.email}): ${r.effectiveStatus.toUpperCase()}, ${r.plan} ${inr(r.monthlyFee)}/mo, this month ${r.monthPayment.toUpperCase()}${r.overdue ? ' (OVERDUE since ' + r.dueDate + ')' : ''}${r.inTrial ? `, trial ends ${r.trialEnd} (${r.trialDaysLeft} days)` : ''}, stores ${r.storesUsed}/${r.storeLimit}`);
  const s = data.summary;
  return `Digital Shop clients - ${today.slice(0, 7)}\n\nClients: ${s.total} | Trial: ${s.trial} | Active: ${s.active} | Past due: ${s.pastDue} | Suspended: ${s.suspended}\nPaid this month: ${s.paidThisMonth} | Due this month: ${s.dueThisMonth} | Monthly recurring: ${inr(s.monthlyRecurring)}\n\n${lines.join('\n') || 'No clients yet.'}\n\nOpen https://digitalshop.website/superadmin#clients to mark payments.`;
}
export async function sendDigest(now = new Date(), tag = '') {
  await ensureSubscriptionSchema();
  const today = istDay(now);
  const r = await platformMail({ to: DIGEST_EMAIL, subject: `${tag}Digital Shop clients - payment status ${today.slice(0, 7)}`, text: digestText(await clientList(), today) });
  if (!tag) await PlatformKv.upsert({ key: 'digest_last_month', value: today.slice(0, 7) });
  return r;
}
// Runs from the daily job, an hourly in-process timer and the cron endpoint. Sends once per month, on the 1st IST
// or at the first opportunity after it if the server was asleep.
export async function maybeSendMonthlyDigest(now = new Date()) {
  await ensureSubscriptionSchema();
  const month = istDay(now).slice(0, 7);
  const last = await PlatformKv.findByPk('digest_last_month');
  if (last?.value === month) return { sent: false, reason: 'already sent' };
  try { await sendDigest(now, ''); return { sent: true, month }; } catch (e) { return { sent: false, reason: e.message }; }
}
export async function sendPaymentMail(userId) {
  const user = await User.findOne({ where: { id: userId, role: 'owner' } });
  if (!user) throw bad(404, 'Client not found');
  const sub = await subFor(user);
  const st = computeState(sub, (await SubscriptionPayment.findAll({ where: { userId } })).map(p => p.month));
  const lead = st.inTrial ? `Your free trial ends on ${sub.trialEnd} (${st.trialDaysLeft} day${st.trialDaysLeft === 1 ? '' : 's'} left). After that the plan is ${inr(sub.monthlyFee)} per month.` : st.monthPayment === 'paid' ? `Your payment for ${st.month} is received. Thank you.` : `Your Digital Shop payment of ${inr(sub.monthlyFee)} for ${st.month} is ${st.overdue ? 'overdue' : 'due'}.`;
  return platformMail({ to: user.email, subject: 'Your Digital Shop subscription', text: `Hi ${user.name},\n\n${lead}\n\nPlan: ${sub.plan}\n\nIf you have already paid, please ignore this note or reply with the payment details.\n\nDigital Shop` });
}
