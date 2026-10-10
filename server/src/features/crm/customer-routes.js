import { Router } from 'express';
import { Op } from 'sequelize';
import { sequelize, Lead, RestaurantOrder, PushSubscription } from '../../models/index.js';
import { bad, wrap } from '../../shared/utils/core.js';
import { resolveDeps, providerStatus, sendEmail, sendSms } from '../notifications/notify.js';
import { Customer, CustomerDevice, CustomerMessage, crmEnabled } from './crm.js';
import { orderPhone, orderAmount, pushMessage, canPush, channelAvailability, sendToDevices } from './customer-pure.js';
import { sendWebPush, pushConfigured } from './customer-push-wired.js';

// Reach-out and detail routes for the Customers section. Mounted under /owner/:storeId/customers, so every
// query below is scoped to req.store.id. Device endpoints and keys are never returned.
export const customerRoutes = Router();
customerRoutes.use((req, res, next) => crmEnabled() ? next() : res.status(404).json({ error: 'Not found' }));
const ownerOnly = (req, res, next) => req.user.role === 'owner' ? next() : res.status(403).json({ error: 'Only the store owner can do this' });
const id = req => { if (!/^\d+$/.test(req.params.id)) throw bad(400, 'Invalid customer ID'); return Number(req.params.id); };
const load = async req => {
  const customer = await Customer.findOne({ where: { id: id(req), businessId: req.store.id, archivedAt: null } });
  if (!customer) throw bad(404, 'Customer not found');
  return customer;
};
const summary = items => (Array.isArray(items) ? items : []).map(i => `${i.qty || 1} x ${i.name || 'item'}`).join(', ').slice(0, 160);
const sameCustomer = (rows, phone) => rows.filter(o => orderPhone(o.customerPhone) === phone);
// Orders store phones in whatever format the shopper typed, so match on the last 10 digits in SQL, then confirm in JS.
async function ordersFor(storeId, phone, limit = 50) {
  const tail = phone.slice(-10);
  const where = { businessId: storeId, [Op.and]: [sequelize.where(sequelize.fn('regexp_replace', sequelize.col('customerPhone'), '\\D', '', 'g'), { [Op.like]: `%${tail}` })] };
  const [leads, meals] = await Promise.all([
    Lead.findAll({ where, order: [['createdAt', 'DESC']], limit, attributes: ['id', 'orderNumber', 'status', 'price', 'items', 'productName', 'customerPhone', 'createdAt'] }),
    RestaurantOrder.findAll({ where, order: [['createdAt', 'DESC']], limit, attributes: ['id', 'orderNumber', 'status', 'total', 'items', 'orderType', 'customerPhone', 'createdAt'] })
  ]);
  return [...sameCustomer(leads, phone).map(o => ({ kind: 'order', id: o.id, number: o.orderNumber ?? o.id, status: o.status, total: orderAmount(o), summary: summary(o.items) || o.productName || '', createdAt: o.createdAt })),
    ...sameCustomer(meals, phone).map(o => ({ kind: o.orderType || 'restaurant', id: o.id, number: o.orderNumber ?? o.id, status: o.status, total: orderAmount(o), summary: summary(o.items), createdAt: o.createdAt }))]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, limit);
}
const providers = async store => providerStatus((await resolveDeps(store)).providers);
const log = (req, fields) => CustomerMessage.create({ businessId: req.store.id, sentByUserId: req.user.id, ...fields });

customerRoutes.get('/channels', wrap(async (req, res) => {
  const p = await providers(req.store);
  const known = new Set((await CustomerDevice.findAll({ where: { businessId: req.store.id, channel: 'push' }, attributes: ['endpoint'], limit: 5000 }).catch(() => [])).map(d => d.endpoint));
  const subs = await PushSubscription.count({ where: { businessId: req.store.id, ...(known.size ? { endpoint: { [Op.notIn]: [...known] } } : {}) } }).catch(() => 0);
  res.json({ pushDevices: known.size + subs, push: { configured: pushConfigured() }, email: { configured: p.email.configured, label: p.email.label }, sms: { configured: p.sms.configured, label: p.sms.label } });
}));
customerRoutes.get('/messages', wrap(async (req, res) => {
  res.json({ messages: await CustomerMessage.findAll({ where: { businessId: req.store.id }, order: [['id', 'DESC']], limit: 30 }) });
}));

// Pull people from past orders into the Customers list. Only creates missing records; never edits existing ones.
customerRoutes.post('/backfill', ownerOnly, wrap(async (req, res) => {
  const where = { businessId: req.store.id, customerPhone: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] } };
  const [leads, meals] = await Promise.all([
    Lead.findAll({ where, attributes: ['customerName', 'customerPhone', 'customerEmail', 'price', 'createdAt'], order: [['createdAt', 'ASC']], limit: 5000 }),
    RestaurantOrder.findAll({ where, attributes: ['customerName', 'customerPhone', 'customerEmail', 'total', 'createdAt'], order: [['createdAt', 'ASC']], limit: 5000 })
  ]);
  const people = new Map();
  for (const o of [...leads, ...meals]) {
    const phone = orderPhone(o.customerPhone); if (!phone) continue;
    const p = people.get(phone) || { phone, name: '', email: '', orderCount: 0, totalSpent: 0, lastOrderAt: null };
    p.orderCount++; p.totalSpent += orderAmount(o);
    if (o.customerName) p.name = String(o.customerName).trim().slice(0, 100);
    if (o.customerEmail) p.email = String(o.customerEmail).trim().toLowerCase().slice(0, 160);
    if (!p.lastOrderAt || o.createdAt > p.lastOrderAt) p.lastOrderAt = o.createdAt;
    people.set(phone, p);
  }
  let created = 0;
  for (const p of people.values()) {
    const [, isNew] = await Customer.findOrCreate({ where: { businessId: req.store.id, phone: p.phone }, defaults: { ...p, totalSpent: Number(p.totalSpent.toFixed(2)), businessId: req.store.id, source: 'order' } });
    if (isNew) created++;
  }
  res.json({ scanned: leads.length + meals.length, found: people.size, created });
}));

customerRoutes.post('/broadcast/push', ownerOnly, wrap(async (req, res) => {
  if (!pushConfigured()) throw bad(503, 'Push notifications are not configured on this server');
  const msg = pushMessage(req.body, req.store);
  if (msg.error) throw bad(400, msg.error);
  const hour = new Date(Date.now() - 3600e3);
  if (await CustomerMessage.count({ where: { businessId: req.store.id, channel: 'push', audience: 'all', createdAt: { [Op.gte]: hour } } }) >= 5) throw bad(429, 'You can send up to 5 broadcasts an hour. Try again later.');
  const devices = await CustomerDevice.findAll({ where: { businessId: req.store.id, channel: 'push' }, include: [{ model: Customer, required: true, where: { archivedAt: null, optInStatus: { [Op.ne]: 'opted_out' } }, attributes: [] }], limit: 5000 });
  // Visitors who tapped "Notify me" on the storefront without ordering are store subscribers, not customer rows. They are reachable too.
  const have = new Set(devices.map(d => d.endpoint));
  const strangers = (await PushSubscription.findAll({ where: { businessId: req.store.id }, limit: 5000 })).filter(p => !have.has(p.endpoint));
  const all = [...devices, ...strangers];
  if (!all.length) return res.json({ customers: 0, devices: 0, sent: 0, failed: 0 });
  const result = await sendToDevices(all, msg.payload, sendWebPush);
  const goneEndpoints = result.gone.map(d => d.endpoint);
  if (result.gone.length) { await CustomerDevice.destroy({ where: { businessId: req.store.id, endpoint: goneEndpoints } }); await PushSubscription.destroy({ where: { businessId: req.store.id, endpoint: goneEndpoints } }); }
  const customers = new Set(devices.map(d => d.customerId)).size;
  await log(req, { channel: 'push', audience: 'all', title: msg.title, body: msg.body, recipients: customers + strangers.length, sent: result.sent, failed: result.failed }).catch(e => console.error('broadcast log failed', e.message));
  return res.json({ customers: customers + strangers.length, devices: all.length, sent: result.sent, failed: result.failed });
}));

// Bulk email or SMS to customers the owner ticked. Same rules as one-to-one: owner only, the shop's OWN provider, recorded opt-in,
// explicit charge confirmation. Customers who do not qualify are skipped and listed with the reason, never messaged.
const BULK_MAX = 100;
customerRoutes.post('/broadcast/message', ownerOnly, wrap(async (req, res) => {
  const channel = req.body?.channel;
  if (!['email', 'sms'].includes(channel)) throw bad(400, 'Choose email or SMS');
  if (req.body?.confirmCosts !== true) throw bad(400, 'Confirm that your own provider may charge for these messages');
  const ids = [...new Set((Array.isArray(req.body?.customerIds) ? req.body.customerIds : []).map(Number))];
  if (!ids.length || ids.length > BULK_MAX || ids.some(n => !Number.isInteger(n) || n < 1)) throw bad(400, `Select 1 to ${BULK_MAX} customers`);
  const message = String(req.body?.message ?? '').trim(), subject = String(req.body?.subject ?? '').trim();
  if (!message || message.length > (channel === 'sms' ? 160 : 2000)) throw bad(400, channel === 'sms' ? 'Message is required, up to 160 characters' : 'Message is required, up to 2000 characters');
  if (channel === 'email' && (!subject || subject.length > 150 || /[\r\n]/.test(subject))) throw bad(400, 'Subject is required, up to 150 characters');
  const hour = new Date(Date.now() - 3600e3);
  if (await CustomerMessage.count({ where: { businessId: req.store.id, channel, audience: 'selected', createdAt: { [Op.gte]: hour } } }) >= 5) throw bad(429, 'You can send up to 5 bulk messages an hour. Try again later.');
  const deps = await resolveDeps(req.store);
  if (!(channel === 'email' ? deps.providers.email : deps.providers.sms)) throw bad(409, `Connect your own ${channel === 'email' ? 'email' : 'SMS'} provider in Notifications first`);
  const customers = await Customer.findAll({ where: { id: { [Op.in]: ids }, businessId: req.store.id, archivedAt: null } });
  const text = `${message}\n- ${req.store.name}\nReply STOP and the shop will stop messaging you.`;
  let sent = 0, failed = 0; const skipped = [];
  for (const id of ids) if (!customers.some(c => c.id === id)) skipped.push({ id, reason: 'Customer not found' });
  for (const c of customers) {
    const state = channelAvailability(c, 0, { email: deps.providers.email, sms: deps.providers.sms })[channel];
    if (!state.enabled) { skipped.push({ id: c.id, reason: state.reason }); continue; }
    let ok = false;
    try { const r = channel === 'email' ? await sendEmail({ to: c.email, subject, text, store: req.store.name }, deps) : await sendSms({ to: c.phone, text, store: req.store.name }, deps); ok = Boolean(r?.ok); } catch { ok = false; }
    if (ok) sent++; else failed++;
  }
  await log(req, { channel, audience: 'selected', title: subject, body: message, recipients: sent + failed, sent, failed });
  res.json({ selected: ids.length, sent, failed, skipped });
}));

customerRoutes.get('/:id', wrap(async (req, res) => {
  const customer = await load(req);
  const [devices, orders, messages, p] = await Promise.all([
    CustomerDevice.findAll({ where: { customerId: customer.id, businessId: req.store.id }, attributes: ['id', 'channel', 'label', 'createdAt', 'lastSeenAt'], order: [['id', 'DESC']] }),
    ordersFor(req.store.id, customer.phone),
    CustomerMessage.findAll({ where: { customerId: customer.id, businessId: req.store.id }, order: [['id', 'DESC']], limit: 20 }),
    providers(req.store)
  ]);
  res.json({ customer, devices, orders, messages, channels: channelAvailability(customer, devices.length, { email: p.email.configured, sms: p.sms.configured }) });
}));
customerRoutes.delete('/:id/devices/:deviceId', wrap(async (req, res) => {
  const customer = await load(req);
  if (!/^\d+$/.test(req.params.deviceId)) throw bad(400, 'Invalid device ID');
  const n = await CustomerDevice.destroy({ where: { id: Number(req.params.deviceId), customerId: customer.id, businessId: req.store.id } });
  if (!n) throw bad(404, 'Device not found');
  res.json({ removed: true });
}));
customerRoutes.post('/:id/push', wrap(async (req, res) => {
  if (!pushConfigured()) throw bad(503, 'Push notifications are not configured on this server');
  const customer = await load(req);
  if (!canPush(customer)) throw bad(409, 'This customer opted out');
  const msg = pushMessage(req.body, req.store);
  if (msg.error) throw bad(400, msg.error);
  const devices = await CustomerDevice.findAll({ where: { customerId: customer.id, businessId: req.store.id, channel: 'push' } });
  if (!devices.length) throw bad(409, 'No browser registered for this customer yet');
  const result = await sendToDevices(devices, msg.payload, sendWebPush);
  if (result.gone.length) await CustomerDevice.destroy({ where: { businessId: req.store.id, id: result.gone.map(d => d.id) } });
  await log(req, { customerId: customer.id, channel: 'push', title: msg.title, body: msg.body, recipients: 1, sent: result.sent ? 1 : 0, failed: result.sent ? 0 : 1 });
  res.json({ devices: devices.length, sent: result.sent, failed: result.failed });
}));
// Email and SMS go through the shop's OWN provider (never platform keys). They stay unavailable until the owner
// connects one in Notifications, and only reach customers with a recorded opt-in. One customer at a time.
customerRoutes.post('/:id/message', ownerOnly, wrap(async (req, res) => {
  const channel = req.body?.channel;
  if (!['email', 'sms'].includes(channel)) throw bad(400, 'Choose email or SMS');
  if (req.body?.confirmCosts !== true) throw bad(400, 'Confirm that your own provider may charge for this message');
  const customer = await load(req);
  const deps = await resolveDeps(req.store);
  const state = channelAvailability(customer, 0, { email: deps.providers.email, sms: deps.providers.sms })[channel];
  if (!state.enabled) throw bad(409, state.reason);
  const message = String(req.body?.message ?? '').trim(), subject = String(req.body?.subject ?? '').trim();
  if (!message || message.length > (channel === 'sms' ? 160 : 2000)) throw bad(400, channel === 'sms' ? 'Message is required, up to 160 characters' : 'Message is required, up to 2000 characters');
  if (channel === 'email' && (!subject || subject.length > 150 || /[\r\n]/.test(subject))) throw bad(400, 'Subject is required, up to 150 characters');
  const text = `${message}\n- ${req.store.name}\nReply STOP and the shop will stop messaging you.`;
  const result = channel === 'email' ? await sendEmail({ to: customer.email, subject, text, store: req.store.name }, deps) : await sendSms({ to: customer.phone, text, store: req.store.name }, deps);
  await log(req, { customerId: customer.id, channel, title: subject, body: message, recipients: 1, sent: result.ok ? 1 : 0, failed: result.ok ? 0 : 1 });
  if (!result.ok) throw bad(502, result.skipped || 'The provider did not accept the message');
  res.json({ sent: true });
}));
