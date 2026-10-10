// Daily job: low-stock digest (every day) and the Monday weekly report. Each store is isolated; nothing throws out of the job.
import { Op } from 'sequelize';
const models = () => import('../../models/index.js');
import { insights } from './sales-insights.js';
import { cleanSettings, resolveDeps, sendEmail, sendSms } from '../notifications/notify.js';

const rs = n => `Rs.${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const istDate = (d = new Date()) => new Date(+d + 330 * 60000).toISOString().slice(0, 10);
const istWeekday = (d = new Date()) => new Date(+d + 330 * 60000).getUTCDay();

export const lowStockItems = (products, threshold) => products.filter(p => p.active !== false && p.stock !== null && p.stock !== undefined && Number(p.stock) <= threshold).sort((a, b) => a.stock - b.stock);

export function weeklyText(store, leads, orders, low, now = new Date()) {
  const ins = insights(orders, leads, now, 14), w = ins.week, restaurant = store.storeType === 'restaurant';
  const chg = (a, b) => (b > 0 ? ` (${a >= b ? '+' : ''}${Math.round(((a - b) / b) * 100)}% vs last week)` : '');
  const lines = [`Weekly report - ${store.name} (last 7 days)`];
  if (restaurant) {
    lines.push(`Orders: ${w.last7.orders}${chg(w.last7.orders, w.prev7.orders)}`, `Served: ${w.last7.servedOrders}, recorded value ${rs(w.last7.servedValue)}${chg(w.last7.servedValue, w.prev7.servedValue)}`);
    const top = ins.topDishes.slice(0, 3).map(d => `${d.name} (${d.units})`); if (top.length) lines.push(`Top dishes: ${top.join(', ')}`);
  } else {
    lines.push(`Enquiries: ${w.last7.enquiries}${chg(w.last7.enquiries, w.prev7.enquiries)}`, `Enquiry value: ${rs(w.last7.enquiryValue)}${chg(w.last7.enquiryValue, w.prev7.enquiryValue)} (requests, not confirmed sales)`);
    const top = ins.topEnquired.slice(0, 3).map(d => `${d.name} (${d.units})`); if (top.length) lines.push(`Most enquired: ${top.join(', ')}`);
  }
  if (!w.last7.enquiries && !w.last7.orders) lines.push('No new orders or enquiries this week.');
  if (low.length) lines.push(`Low stock: ${low.slice(0, 8).map(p => `${p.name} (${p.stock})`).join(', ')}`);
  lines.push('Totals are recorded values, not verified payments.');
  return lines.join('\n');
}
const shortSms = (text, max = 300) => text.length <= max ? text : `${text.slice(0, max - 3)}...`;

async function ownerTargets(store, s, deps) {
  const { User } = await import('../../models/index.js');
  const jobs = [];
  if (s.ownerEmailAlerts && deps.providers.email) { const to = s.ownerEmail || (await User.findByPk(store.ownerId).catch(() => null))?.email; if (to) jobs.push({ ch: 'email', to }); }
  if (s.ownerSmsAlerts && s.ownerPhone && deps.providers.sms) jobs.push({ ch: 'sms', to: s.ownerPhone });
  return jobs;
}
export async function sendToOwner(store, subject, text, deps0) {
  const s = cleanSettings(store.notifySettings), deps = await resolveDeps(store, deps0), targets = await ownerTargets(store, s, deps);
  const out = [];
  for (const t of targets) { try { out.push(t.ch === 'email' ? await sendEmail({ to: t.to, subject, text, store: store.name }, deps) : await sendSms({ to: t.to, text: shortSms(text), store: store.name }, deps)); } catch (e) { console.error('Owner report send failed', t.ch, e.message); } }
  return { channels: targets.map(t => t.ch), sent: out.length };
}
export async function loadWeek(store, now = new Date()) {
  const { Lead, RestaurantOrder, Product } = await models();
  const since = new Date(+now - 15 * 86400000);
  const [leads, orders, products] = await Promise.all([Lead.findAll({ where: { businessId: store.id, createdAt: { [Op.gte]: since } } }), RestaurantOrder.findAll({ where: { businessId: store.id, createdAt: { [Op.gte]: since } } }), Product.findAll({ where: { businessId: store.id, active: true } })]);
  return { leads, orders, products };
}
export async function sendWeeklyReport(store, now = new Date(), deps) {
  const s = cleanSettings(store.notifySettings), { leads, orders, products } = await loadWeek(store, now);
  const text = weeklyText(store, leads, orders, lowStockItems(products, s.lowStockThreshold), now);
  return { text, ...(await sendToOwner(store, `Weekly report - ${store.name}`, text, deps)) };
}
export async function runDailyJobs(now = new Date(), deps) {
  const { Business, Product } = await models();
  const stores = await Business.findAll({ where: { deletedAt: null, active: true } });
  const today = istDate(now), monday = istWeekday(now) === 1, res = { stores: stores.length, lowStock: 0, weekly: 0 };
  for (const store of stores) {
    try {
      const s = cleanSettings(store.notifySettings);
      if (!s.lowStockAlerts && !s.weeklyReport) continue;
      const patch = {};
      const products = s.lowStockAlerts || s.weeklyReport ? await Product.findAll({ where: { businessId: store.id, active: true } }) : [];
      const low = lowStockItems(products, s.lowStockThreshold);
      if (s.lowStockAlerts && low.length && s.lastLowStockDate !== today) {
        const sig = low.map(p => `${p.id}:${p.stock}`).join(',');
        if (s.lastLowStockSig !== sig) {
          const text = `Low stock at ${store.name}: ${low.slice(0, 10).map(p => `${p.name} (${p.stock} left)`).join(', ')}. Restock soon so customers do not see sold-out items.`;
          const r = await sendToOwner(store, `Low stock alert - ${store.name}`, text, deps);
          if (r.sent) { res.lowStock++; patch.lastLowStockDate = today; patch.lastLowStockSig = sig; }
        }
      } else if (s.lowStockAlerts && !low.length && s.lastLowStockSig) patch.lastLowStockSig = '';
      if (s.weeklyReport && monday && s.lastWeeklyDate !== today) {
        const r = await sendWeeklyReport(store, now, deps);
        if (r.sent) { res.weekly++; patch.lastWeeklyDate = today; }
      }
      if (Object.keys(patch).length) await store.update({ notifySettings: { ...cleanSettings(store.notifySettings), ...patch } });
    } catch (e) { console.error('Daily job failed for store', store.id, e.message); }
  }
  return res;
}
