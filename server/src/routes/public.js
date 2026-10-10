import { catalogCursor, afterCatalogCursor, catalogResult } from '../features/catalog/catalog-page.js';
import { populatedCategories } from '../features/catalog/storefront-categories.js';
import {shopCardPdf} from '../features/stores/shop-card-pdf.js';
import {campaignPublicRoutes} from '../features/notifications/campaigns.js';
import { publicBusiness, effectiveOpen, blocksOrders } from '../features/stores/hours.js';
import { Router } from 'express';
import { orderLimits, tableRequestLimits, shopRequestLimit, isAllowedPushEndpoint } from '../shared/abuse-limits.js';
import { haversineKm } from '../shared/utils/geo.js';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import { storeUrl } from '../shared/utils/store-domain.js';
import {shopQrSvg} from '../features/stores/shop-qr.js';
import { recordCustomerOrder, attachCustomerDevice, removeCustomerDevice } from '../features/crm/customer-sync.js';
import { Business, Category, Product, Lead, PushSubscription, ShopRequest, RestaurantOrder, OrderPushSubscription, Coupon, TableRequest } from '../models/index.js';
import { buildLine, cleanNote } from '../features/restaurant/menu-options.js';
import { isLocked } from '../features/platform/feature-locks.js';
import { notifyNewOrder } from '../features/notifications/notify.js';
import { notifyOwnerDevices } from '../features/orders/order-push-wired.js';
import { validateAnswers } from '../features/catalog/custom-fields.js';
import { invoiceSigValid, streamBill } from '../features/billing/invoice.js';
import { bad, validEmail, wrap, publicImageUrl, whatsappUrl, whatsappCartUrl, escapeLike, clientBase } from '../shared/utils/core.js';
import { orderBotEnabledFor, withOrderRef } from '../features/whatsapp/whatsapp-orders.js';
import { notifyNewOrder as notifyNewOrderWhatsApp } from '../features/whatsapp/whatsapp-byo.js';
import { notifyShopRequest } from '../features/platform/platform-alerts.js';
const r = Router();
r.post('/stores/:slug/restaurant-orders', ...orderLimits);
r.post('/stores/:slug/products/:id/enquire', ...orderLimits);
r.post('/stores/:slug/enquire-cart', ...orderLimits);
r.post('/stores/:slug/table-requests', ...tableRequestLimits);
r.post('/shop-requests', shopRequestLimit);
r.use(campaignPublicRoutes);
// The storefront is edited by its owner. Keep this short so pauses and stock changes propagate quickly.
const storefrontCache = (req, res, next) => { res.set('Cache-Control', 'public, s-maxage=20, stale-while-revalidate=10'); next(); };
const shop = async slug => { const b = await Business.findOne({ where: { slug, active: true, deletedAt: null } }); if (!b) throw bad(404, 'Shop not found'); return b; };
const numId = value => { const n = Number(value); return Number.isInteger(n) && n > 0 ? n : null; };
const shopUrl = slug => process.env.STORE_SUBDOMAINS_READY === 'true' ? storeUrl(slug) : `${clientBase()}/store/${slug}`;
const categoryInclude = { model: Category, as: 'category', attributes: ['name', 'slug'] };
const applyCoupon = async (business, subtotal, code) => {
  if (!code) return { discount: 0, code: null };
  if (isLocked(business, 'coupons')) throw bad(400, 'Coupons are currently unavailable for this store');
  if (typeof code !== 'string' || !/^[A-Z0-9-]{3,24}$/.test(code.trim().toUpperCase())) throw bad(400, 'Invalid coupon code');
  const coupon = await Coupon.findOne({ where: { businessId: business.id, code: code.trim().toUpperCase(), active: true } });
  if (!coupon) throw bad(400, 'Coupon not found or no longer active');
  return { discount: Number((subtotal * coupon.percentOff / 100).toFixed(2)), code: coupon.code };
};


// Creates only an enquiry. It never creates a login or a store.
r.post('/shop-requests', wrap(async (req, res) => {
  const { name, email, phone, shopName, message = '' } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100 || !validEmail(email) ||
      typeof phone !== 'string' || !/^[+\d()\s-]{8,25}$/.test(phone.trim()) ||
      typeof shopName !== 'string' || !shopName.trim() || shopName.trim().length > 100 ||
      typeof message !== 'string' || message.length > 1000) throw bad(400, 'Name, email, phone and shop name are required');
  await ShopRequest.sync(); // Targeted first-deploy table creation, never alter existing tables.
  const created = await ShopRequest.create({ name: name.trim(), email: email.toLowerCase().trim(), phone: phone.trim(), shopName: shopName.trim(), message: message.trim() });
  void notifyShopRequest(created);
  res.status(201).json({ ok: true });
}));


// Only online, non-deleted shops belong in search discovery.
// Nearby shops directory. POST so the visitor's coordinates never appear in a URL or access log, and they are never stored.
r.post('/nearby', wrap(async (req, res) => {
  const lat = Number(req.body?.lat), lng = Number(req.body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180 || req.body?.lat === '' || req.body?.lng === '') throw bad(400, 'Location is not valid');
  const radius = Math.min(100, Math.max(1, Number(req.body?.radiusKm) || 25));
  const type = ['retail', 'restaurant', 'services'].includes(req.body?.type) ? req.body.type : null;
  const rows = await Business.findAll({ where: { active: true, deletedAt: null, listInDirectory: true, latitude: { [Op.ne]: null }, longitude: { [Op.ne]: null }, ...(type ? { storeType: type } : {}) }, attributes: ['name', 'slug', 'description', 'logoUrl', 'coverUrl', 'storeType', 'area', 'pincode', 'isOpen', 'autoHours', 'openTime', 'closeTime', 'latitude', 'longitude', 'serviceRadiusKm', 'createdAt'] });
  const now = Date.now();
  let shops = rows.map(b => { const d = haversineKm(lat, lng, b.latitude, b.longitude); return { name: b.name, slug: b.slug, description: (b.description || '').slice(0, 120), logoUrl: b.logoUrl || '', coverUrl: b.coverUrl || '', storeType: b.storeType, area: b.area || '', pincode: b.pincode || '', isOpen: effectiveOpen(b), latitude: b.latitude, longitude: b.longitude, distanceKm: Number(d.toFixed(1)), deliversToYou: b.serviceRadiusKm ? d <= b.serviceRadiusKm : null, serviceRadiusKm: b.serviceRadiusKm, isNew: now - new Date(b.createdAt).getTime() < 14 * 86400000, _d: d }; }).filter(s => s._d <= radius);
  if (req.body?.openNow === true) shops = shops.filter(s => s.isOpen);
  shops.sort((a, b) => a._d - b._d); res.set('Cache-Control', 'no-store');
  res.json({ shops: shops.slice(0, 60).map(({ _d, ...s }) => s), radiusKm: radius });
}));
r.get('/sitemap-stores', wrap(async (req, res) => {
  const stores = await Business.findAll({ where: { active: true, deletedAt: null }, attributes: ['slug'], order: [['slug', 'ASC']], limit: 5000 });
  res.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
  res.json({ slugs: stores.map(store => store.slug) });
}));

r.get('/sitemap-products', wrap(async (req, res) => {
  const rows = await Product.findAll({ where: { active: true }, attributes: ['id'], include: [{ model: Business, attributes: ['slug'], where: { active: true, deletedAt: null }, required: true }], order: [['id', 'ASC']], limit: 20000 });
  res.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
  res.json({ products: rows.map(p => ({ id: p.id, slug: p.Business.slug })) });
}));
r.get('/stores/:slug', storefrontCache, wrap(async (req, res) => {
  const business = await Business.findOne({ where: { slug: req.params.slug } });
  if (!business || business.deletedAt) throw bad(404, 'Shop not found');
  // Only the storefront metadata endpoint reveals a paused shop. All catalog, QR,
  // subscription and enquiry endpoints continue to reject it through shop().
  if (!business.active) return res.json({ paused: true, business: { name: business.name, slug: business.slug }, categories: [] });
  const categories = await Category.findAll({ where: { businessId: business.id }, order: [['name', 'ASC']] });
  const visibleProducts = await Product.findAll({ where: { businessId: business.id, active: true }, attributes: ['categoryId'], group: ['categoryId'] });
  res.json({ business: publicBusiness(business), categories: populatedCategories(categories, visibleProducts) });
}));

r.post('/stores/:slug/table-requests', wrap(async (req, res) => {
  const business = await shop(req.params.slug);
  if (business.storeType !== 'restaurant') throw bad(404, 'Table requests unavailable');
  if (blocksOrders(business)) throw bad(409, 'The restaurant is closed right now.');
  const table = Number(req.body?.tableNumber), kind = req.body?.kind;
  if (!['waiter', 'bill'].includes(kind)) throw bad(400, 'Choose call waiter or ask for bill');
  if (!Number.isInteger(table) || table < 1 || table > business.tableCount) throw bad(400, 'Select a valid table number');
  const open = await TableRequest.findOne({ where: { businessId: business.id, tableNumber: table, kind, status: 'open' } });
  const request = open || await TableRequest.create({ businessId: business.id, tableNumber: table, kind });
  res.set('Cache-Control', 'no-store');
  res.status(201).json({ ok: true, alreadyAsked: Boolean(open) });
}));

r.post('/stores/:slug/restaurant-orders', wrap(async (req, res) => {
  const business = await shop(req.params.slug);
  if (blocksOrders(business)) throw bad(409, 'The shop is closed right now and is not taking orders. Please try again when it opens.');
  if (business.storeType !== 'restaurant') throw bad(404, 'Restaurant orders unavailable');
  const { orderType, tableNumber, customerName, customerPhone, deliveryAddress } = req.body || {};
  if (!['dine-in', 'takeaway', 'delivery'].includes(orderType)) throw bad(400, 'Select order type');
  const table = Number(tableNumber);
  if (orderType === 'dine-in' && (!Number.isInteger(table) || table < 1 || table > business.tableCount)) throw bad(400, 'Select a valid table number');
  if (orderType !== 'dine-in' && (typeof customerName !== 'string' || !customerName.trim() || customerName.trim().length > 100)) throw bad(400, 'Please enter your name');
  if (orderType !== 'dine-in' && (typeof customerPhone !== 'string' || !customerPhone.trim())) throw bad(400, 'Please enter your phone number');
  if (orderType !== 'dine-in' && !/^[+\d()\s-]{8,25}$/.test(customerPhone.trim())) throw bad(400, 'Phone number looks wrong. Use digits only, 8 to 15 digits, with country code');
  if (orderType === 'delivery' && (typeof deliveryAddress !== 'string' || !deliveryAddress.trim() || deliveryAddress.trim().length > 500)) throw bad(400, 'Delivery address required');
  const raw = req.body?.items;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 50) throw bad(400, 'Select items');
  const ids = [...new Set(raw.map(e => Number(e?.id)))];
  if (raw.some(e => !Number.isInteger(Number(e?.id)) || Number(e.id) < 1)) throw bad(400, 'Invalid items');
  const products = await Product.findAll({ where: { id: { [Op.in]: ids }, businessId: business.id, active: true } });
  if (products.length !== ids.length) throw bad(400, 'An item is no longer available');
  const byId = new Map(products.map(p => [p.id, p]));
  const perProduct = new Map();
  const items = raw.map(entry => {
    const product = byId.get(Number(entry.id)), qty = Number(entry.qty);
    if (product.soldOutToday) throw bad(400, `${product.name} is sold out for today`);
    perProduct.set(product.id, (perProduct.get(product.id) || 0) + (Number.isInteger(qty) ? qty : 0));
    if (!Number.isInteger(qty) || qty < 1 || qty > 99 || product.stock === 0 || (product.stock !== null && perProduct.get(product.id) > product.stock)) throw bad(400, 'Invalid quantity or insufficient stock');
    const answers = validateAnswers(product.customFields, entry.answers, product.name);
    const line = buildLine(product, entry, qty);
    return { ...line, ...(answers.length ? { answers } : {}) };
  });
  const lineKeys = items.map(i => JSON.stringify([i.productId, i.variant || '', (i.addons || []).map(a => a.group + a.name).sort(), i.note || '', i.answers || null]));
  if (new Set(lineKeys).size !== lineKeys.length) throw bad(400, 'Invalid items');
  const subtotal = Number(items.reduce((sum, item) => sum + Number(item.price) * item.qty, 0).toFixed(2));
  if (business.minOrder > 0 && subtotal < business.minOrder) throw bad(400, `Minimum order is Rs.${business.minOrder.toFixed(0)}`);
  const { discount, code } = await applyCoupon(business, subtotal, req.body?.couponCode);
  const freeAbove = business.freeDeliveryAbove;
  const deliveryFee = orderType === 'delivery' && !(freeAbove !== null && freeAbove !== undefined && subtotal >= freeAbove) ? Number(business.deliveryCharge || 0) : 0;
  const total = Number((subtotal - discount + deliveryFee).toFixed(2));
  const orderNote = cleanNote(req.body?.note, 200);
  const estimateMinutes = orderType === 'takeaway' && business.prepMinutes ? business.prepMinutes : null;
  const order = await RestaurantOrder.create({ deliveryFee, note: orderNote, estimateMinutes, businessId: business.id, orderType, tableNumber: orderType === 'dine-in' ? table : null, deliveryAddress: orderType === 'delivery' ? deliveryAddress.trim() : null, ...optionalContact(req.body), customerName:orderType==='dine-in'?null:customerName.trim(), customerPhone:orderType==='dine-in'?null:customerPhone.trim(), items, subtotal, discount, couponCode: code, total, status: 'new' });
  void notifyNewOrder(business, 'restaurant', order);
  void recordCustomerOrder(business.id, order);
  void notifyOwnerDevices(business, 'restaurant', order);
  const trackingToken = signTracking('restaurant', order.id, business.id);
  res.set('Cache-Control', 'no-store');
  res.status(201).json({ orderId: order.id, orderNumber: order.orderNumber, status: order.status, subtotal, discount, deliveryFee, estimateMinutes, total, trackingToken });
}));

const TRACKING_KINDS = { 'restaurant-orders': { kind: 'restaurant', model: () => RestaurantOrder, allowed: b => b.storeType === 'restaurant' }, 'lead-orders': { kind: 'lead', model: () => Lead, allowed: b => b.storeType !== 'restaurant' } };
const kindModel = kind => (kind === 'restaurant' ? RestaurantOrder : Lead);
function signTracking(kind, orderId, businessId) { return jwt.sign({ orderId, businessId, kind }, process.env.JWT_SECRET, { audience: 'restaurant-tracking', issuer: 'digital-dukaan', expiresIn: '30d' }); }
const verifyTracking = (token, id, kind) => {
  let access;
  try { access = jwt.verify(token || '', process.env.JWT_SECRET, { audience: 'restaurant-tracking', issuer: 'digital-dukaan', algorithms: ['HS256'] }); } catch { throw bad(404, 'Order tracking link is invalid or expired'); }
  if (!id || access.orderId !== id || (access.kind || 'restaurant') !== kind) throw bad(404, 'Order tracking link is invalid or expired');
  return access;
};
const bearer = req => req.header('authorization')?.match(/^Bearer (.+)$/)?.[1];
const trackingPath = (slug, kind, id, token) => `/store/${slug}/order/${kind === 'lead' ? 'lead/' : ''}${id}#token=${token}`;
// No customer PII is returned from any tracking read.
const serializeOrder = (kind, o) => kind === 'restaurant'
  ? { id: o.id, orderNumber: o.orderNumber, kind, status: o.status, orderType: o.orderType, tableNumber: o.tableNumber, items: o.items, subtotal: o.subtotal, discount: o.discount, deliveryFee: o.deliveryFee, estimateMinutes: o.estimateMinutes, total: o.total, createdAt: o.createdAt, updatedAt: o.updatedAt }
  : { id: o.id, orderNumber: o.orderNumber, kind, status: o.status, items: Array.isArray(o.items) && o.items.length ? o.items.map(i => ({ name: i.name, qty: i.qty, price: i.price })) : [{ name: o.productName, qty: 1, price: o.price }], discount: o.discount, total: o.price, createdAt: o.createdAt };
const trackedBusiness = async (slug, cfg, access) => {
  // A paused store may still have outstanding orders; deleted stores remain private.
  const business = await Business.findOne({ where: { slug, deletedAt: null } });
  if (!business || !cfg.allowed(business) || access.businessId !== business.id) throw bad(404, 'Order not found');
  return business;
};
const validPushBody = body => {
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : '';
  let url;
  try { url = new URL(endpoint); } catch { return null; }
  const keys = body?.keys;
  if (url.protocol !== 'https:' || !isAllowedPushEndpoint(endpoint) || endpoint.length > 1000 || !keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string' || !keys.p256dh || !keys.auth || keys.p256dh.length > 300 || keys.auth.length > 300) return null;
  return { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
};
const savePushSubscription = async (business, kind, orderId, token, push, order, userAgent) => {
  const returnPath = trackingPath(business.slug, kind, orderId, token).slice(0, 600);
  const [row, created] = await OrderPushSubscription.findOrCreate({ where: { orderType: kind, orderId, endpoint: push.endpoint }, defaults: { businessId: business.id, keys: push.keys, returnPath } });
  if (!created) await row.update({ keys: push.keys, returnPath });
  if (order) await attachCustomerDevice(business.id, order, push, userAgent);
};
for (const [segment, cfg] of Object.entries(TRACKING_KINDS)) {
  const { kind } = cfg;
  // A scoped capability, never a guessable order-ID lookup.
  r.get(`/stores/:slug/${segment}/:id`, wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const id = numId(req.params.id), access = verifyTracking(bearer(req), id, kind);
    const business = await trackedBusiness(req.params.slug, cfg, access);
    const order = await cfg.model().findOne({ where: { id, businessId: business.id } });
    if (!order) throw bad(404, 'Order not found');
    res.json({ order: serializeOrder(kind, order), restaurant: { name: business.name, slug: business.slug }, store: { name: business.name, slug: business.slug, storeType: business.storeType, logoUrl: business.logoUrl } });
  }));
  r.get(`/stores/:slug/${segment}/:id/push-subscription`, wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const id = numId(req.params.id), access = verifyTracking(bearer(req), id, kind);
    const business = await trackedBusiness(req.params.slug, cfg, access);
    if (!(await cfg.model().findOne({ where: { id, businessId: business.id } }))) throw bad(404, 'Order not found');
    const endpoint = typeof req.query.endpoint === 'string' ? req.query.endpoint : '';
    const row = endpoint && await OrderPushSubscription.findOne({ where: { businessId: business.id, orderType: kind, orderId: id, endpoint } });
    res.json({ enrolled: Boolean(row) });
  }));
  // Same tracking capability as the status read: only the holder of the private link can register or remove.
  r.post(`/stores/:slug/${segment}/:id/push-subscription`, wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const id = numId(req.params.id), token = bearer(req), access = verifyTracking(token, id, kind);
    const business = await trackedBusiness(req.params.slug, cfg, access);
    const order = await cfg.model().findOne({ where: { id, businessId: business.id } });
    if (!order) throw bad(404, 'Order not found');
    const push = validPushBody(req.body);
    if (!push) throw bad(400, 'Invalid push subscription');
    await savePushSubscription(business, kind, id, token, push, order, req.get('user-agent'));
    res.status(201).json({ ok: true });
  }));
  r.delete(`/stores/:slug/${segment}/:id/push-subscription`, wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const id = numId(req.params.id), access = verifyTracking(bearer(req), id, kind);
    const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : '';
    await OrderPushSubscription.destroy({ where: { businessId: access.businessId, orderType: kind, orderId: id, endpoint } });
    await removeCustomerDevice(access.businessId, endpoint);
    res.status(204).end();
  }));
}

// "My Orders": the customer's browser identifies itself by its push endpoint (an unguessable capability
// URL only this browser holds) plus any private tracking tokens saved on the device. No login, no PII.
const myOrderRefs = (body, businessId) => {
  const refs = new Map();
  for (const item of (Array.isArray(body?.orders) ? body.orders.slice(0, 50) : [])) {
    const kind = item?.kind === 'lead' ? 'lead' : 'restaurant', id = Number(item?.id);
    try { verifyTracking(item?.token, id, kind); } catch { continue; }
    const access = jwt.decode(item.token);
    if (access.businessId !== businessId) continue;
    refs.set(`${kind}:${id}`, { kind, id, token: item.token });
  }
  return refs;
};
r.post('/stores/:slug/my-orders', wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const business = await Business.findOne({ where: { slug: req.params.slug, deletedAt: null } });
  if (!business) throw bad(404, 'Store not found');
  const refs = myOrderRefs(req.body, business.id);
  const endpoint = typeof req.body?.endpoint === 'string' && req.body.endpoint.length <= 1000 ? req.body.endpoint : '';
  const paths = new Map();
  if (endpoint) {
    const subs = await OrderPushSubscription.findAll({ where: { businessId: business.id, endpoint }, order: [['createdAt', 'DESC']], limit: 50 });
    for (const sub of subs) { const key = `${sub.orderType}:${sub.orderId}`; if (!refs.has(key)) refs.set(key, { kind: sub.orderType, id: sub.orderId }); paths.set(key, sub.returnPath); }
  }
  const out = [];
  for (const kind of ['restaurant', 'lead']) {
    const ids = [...refs.values()].filter(x => x.kind === kind).map(x => x.id);
    if (!ids.length) continue;
    const rows = await kindModel(kind).findAll({ where: { businessId: business.id, id: { [Op.in]: ids } } });
    for (const row of rows) {
      const key = `${kind}:${row.id}`, ref = refs.get(key);
      out.push({ ...serializeOrder(kind, row), path: ref?.token ? trackingPath(business.slug, kind, row.id, ref.token) : paths.get(key) || null });
    }
  }
  out.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  res.json({ orders: out.slice(0, 50), store: { name: business.name, slug: business.slug, storeType: business.storeType, logoUrl: business.logoUrl } });
}));
r.post('/stores/:slug/my-orders/push-subscription', wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const business = await Business.findOne({ where: { slug: req.params.slug, deletedAt: null } });
  if (!business) throw bad(404, 'Store not found');
  const push = validPushBody(req.body);
  if (!push) throw bad(400, 'Invalid push subscription');
  const refs = [...myOrderRefs(req.body, business.id).values()];
  for (const ref of refs) {
    const order = await kindModel(ref.kind).findOne({ where: { id: ref.id, businessId: business.id } });
    if (order) await savePushSubscription(business, ref.kind, ref.id, ref.token, push, order, req.get('user-agent'));
  }
  res.status(201).json({ ok: true, registered: refs.length });
}));
r.delete('/stores/:slug/my-orders/push-subscription', wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const business = await Business.findOne({ where: { slug: req.params.slug, deletedAt: null } });
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : '';
  if (business && endpoint) { await OrderPushSubscription.destroy({ where: { businessId: business.id, endpoint } }); await removeCustomerDevice(business.id, endpoint); }
  res.status(204).end();
}));

r.get('/stores/:slug/products', storefrontCache, wrap(async (req, res) => {
  const business = await shop(req.params.slug);
  const where = { businessId: business.id, active: true };
  if (req.query.category) {
    const category = await Category.findOne({ where: { businessId: business.id, slug: String(req.query.category) } });
    if (!category) return res.json({ products: [],total:0,hasMore:false,nextCursor:null });
    where.categoryId = category.id;
  }
  if (req.query.search) where.name = { [Op.iLike]: `%${escapeLike(String(req.query.search).slice(0, 80))}%` };
  const page = catalogCursor(req.query);
  if (!page) {
    const products = await Product.findAll({ where, include: [categoryInclude], order: [['featured','DESC'],['createdAt','DESC'],['id','DESC']], limit:100 });
    return res.json({products});
  }
  const [rows,total] = await Promise.all([
    Product.findAll({where:{...where,...afterCatalogCursor(page.cursor)},include:[categoryInclude],order:[['featured','DESC'],['createdAt','DESC'],['id','DESC']],limit:page.limit+1}),
    Product.count({where})
  ]);
  res.json(catalogResult(rows,total,page.limit));
}));

r.get('/stores/:slug/products/:id', wrap(async (req, res) => {
  const business = await shop(req.params.slug);
  const id = numId(req.params.id);
  const product = id && await Product.findOne({ where: { id, businessId: business.id, active: true }, include: [categoryInclude] });
  if (!product) throw bad(404, 'Product not found');
  res.json({ business: publicBusiness(business), product });
}));

const optionalContact = body => {
  const name = typeof body?.customerName === 'string' ? body.customerName.trim().slice(0, 100) : '';
  const phone = typeof body?.customerPhone === 'string' ? body.customerPhone.trim() : '';
  if (phone && !/^[+\d()\s-]{8,25}$/.test(phone)) throw bad(400, 'Enter a valid phone number or leave it blank');
  const email=typeof body?.customerEmail==='string'?body.customerEmail.trim().toLowerCase():'';
  if(email&&(email.length>160||!validEmail(email)))throw bad(400,'Enter a valid email or leave it blank');
  if(body?.customerEmailConsent===true&&!email)throw bad(400,'Add an email for order updates');
  return { customerName: name, customerPhone: phone, customerEmail:email, customerEmailConsent:body?.customerEmailConsent===true };
};
r.post('/stores/:slug/products/:id/enquire', wrap(async (req, res) => {
  const business = await shop(req.params.slug);
  if (blocksOrders(business)) throw bad(409, 'The shop is closed right now and is not taking orders. Please try again when it opens.');
  if (business.storeType === 'restaurant') throw bad(400, 'Order from the menu instead');
  const id = numId(req.params.id);
  const product = id && await Product.findOne({ where: { id, businessId: business.id, active: true } });
  if (!product) throw bad(404, 'Product not found');
  const qty=Number(req.body?.qty??1);
  if(!Number.isInteger(qty)||qty<1||qty>99)throw bad(400,'Invalid quantity');
  if (product.stock === 0) throw bad(400, 'This product is out of stock right now');
  if(product.stock!==null&&qty>product.stock)throw bad(400,`Only ${product.stock} left in stock for ${product.name}`);
  const subtotal=Number((product.price*qty).toFixed(2));
  if(business.minOrder>0&&subtotal<business.minOrder)throw bad(400,`Minimum order is Rs.${business.minOrder.toFixed(0)}. Add more quantity or use the cart.`);
  const answers = validateAnswers(product.customFields, req.body?.answers, product.name);
  const lines=[{productId:product.id,name:product.name,price:product.price,qty,...(answers.length?{answers}:{})}];
  const lead = await Lead.create({ businessId: business.id, productId: product.id, productName: product.name, price: subtotal, items:lines, ...optionalContact(req.body) });
  void notifyNewOrder(business, 'lead', lead);
  void recordCustomerOrder(business.id, lead);
  void notifyOwnerDevices(business, 'lead', lead);
  void notifyNewOrderWhatsApp(business, lead);
  res.set('Cache-Control', 'no-store');
  const waUrl = whatsappUrl({ ...(typeof business.get === 'function' ? business.get({ plain: true }) : business), orderNumber: lead.orderNumber }, {...(typeof product.get==='function'?product.get({plain:true}):product),price:subtotal,orderQty:qty,unitPrice:product.price}, publicImageUrl(product.imageUrl, process.env.PUBLIC_API_URL), answers);
  res.status(201).json({ url: orderBotEnabledFor(business.id) ? withOrderRef(waUrl, lead.id) : waUrl, tracking: { kind: 'lead', id: lead.id, orderNumber: lead.orderNumber, token: signTracking('lead', lead.id, business.id), total: subtotal } });
}));

r.post('/stores/:slug/enquire-cart', wrap(async (req, res) => {
  const business = await shop(req.params.slug);
  if (blocksOrders(business)) throw bad(409, 'The shop is closed right now and is not taking orders. Please try again when it opens.');
  if (business.storeType === 'restaurant') throw bad(400, 'Order from the menu instead');
  const raw = Array.isArray(req.body.items) ? req.body.items.slice(0, 50) : [];
  if (!raw.length) throw bad(400, 'Your cart is empty');
  const lines = [];
  for (const entry of raw) {
    const id = numId(entry.id), qty = Number(entry.qty);
    if (!id || !Number.isInteger(qty) || qty < 1 || qty > 99) throw bad(400, 'Invalid cart item');
    const product = await Product.findOne({ where: { id, businessId: business.id, active: true } });
    if (!product) throw bad(400, 'A product in your cart is no longer available');
    if (product.stock !== null && qty > product.stock) throw bad(400, `Only ${product.stock} left in stock for ${product.name}`);
    const answers = validateAnswers(product.customFields, entry.answers, product.name);
    lines.push({ productId: product.id, name: product.name, price: product.price, qty, ...(answers.length ? { answers } : {}) });
  }
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
  if (business.minOrder > 0 && subtotal < business.minOrder) throw bad(400, `Minimum order is Rs.${business.minOrder.toFixed(0)}`);
  const { discount, code } = await applyCoupon(business, subtotal, req.body?.couponCode);
  const delivery = business.freeDeliveryAbove !== null && subtotal >= business.freeDeliveryAbove ? 0 : Number(business.deliveryCharge || 0);
  const total = Number((subtotal - discount + delivery).toFixed(2));
  const lead = await Lead.create({ businessId: business.id, productId: null, productName: (n => `${n} item${n === 1 ? '' : 's'}`)(lines.reduce((s, l) => s + l.qty, 0)), price: total, items: lines, discount, couponCode: code, ...optionalContact(req.body) });
  void notifyNewOrder(business, 'lead', lead);
  void recordCustomerOrder(business.id, lead);
  void notifyOwnerDevices(business, 'lead', lead);
  void notifyNewOrderWhatsApp(business, lead);
  const url = whatsappCartUrl({ ...(typeof business.get === 'function' ? business.get({ plain: true }) : business), orderNumber: lead.orderNumber }, lines, subtotal, delivery, total, shopUrl(req.params.slug), code, discount);
  const finalUrl = new URL(url);
  res.set('Cache-Control', 'no-store');
  res.status(201).json({ url: orderBotEnabledFor(business.id) ? withOrderRef(finalUrl.toString(), lead.id) : finalUrl.toString(), total, discount, tracking: { kind: 'lead', id: lead.id, orderNumber: lead.orderNumber, token: signTracking('lead', lead.id, business.id), total } });
}));

r.get('/bill/:kind(lead|restaurant)/:id/:sig', wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1 || !invoiceSigValid(req.params.kind, id, req.params.sig)) throw bad(404, 'Bill not found');
  const order = await (req.params.kind === 'lead' ? Lead : RestaurantOrder).findByPk(id);
  const shopRow = order && await Business.findByPk(order.businessId);
  if (!order || !shopRow || shopRow.deletedAt) throw bad(404, 'Bill not found');
  await streamBill(res, shopRow, order, req.params.kind);
}));

r.get('/stores/:slug/qr', wrap(async (req, res) => {
  const business = await shop(req.params.slug);
  const table = Number(req.query.table);
  if (req.query.table !== undefined && (business.storeType !== 'restaurant' || !Number.isInteger(table) || table < 1 || table > business.tableCount)) throw bad(400, 'Invalid restaurant table');
  const destination = req.query.table === undefined ? shopUrl(business.slug) : `${shopUrl(business.slug)}?table=${table}`;
  const mark = await shopQrSvg(business, destination, req.query.table === undefined ? null : table);
  res.type('image/svg+xml').send(mark);
}));

r.get('/stores/:slug/business-card.pdf', wrap(async(req,res)=>{
 const business=await shop(req.params.slug);
 const doc=await shopCardPdf(business,shopUrl(business.slug));
 res.type('application/pdf').attachment(`${business.slug}-business-card.pdf`);doc.pipe(res);doc.end();
}));

r.get('/stores/:slug/push-key', wrap(async (req, res) => {
  await shop(req.params.slug);
  res.json({ vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '' });
}));

r.post('/stores/:slug/push-subscription', wrap(async (req, res) => {
  const business = await shop(req.params.slug);
  const { endpoint, keys } = req.body || {};
  if (typeof endpoint !== 'string' || !isAllowedPushEndpoint(endpoint) || typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string') throw bad(400, 'Invalid push subscription');
  const existing = await PushSubscription.findOne({ where: { endpoint: endpoint.slice(0, 1000) } });
  if (existing && existing.businessId !== business.id) return res.status(201).json({ ok: true }); // never re-point another store's subscription
  await PushSubscription.upsert({ businessId: business.id, endpoint: endpoint.slice(0, 1000), keys: { p256dh: keys.p256dh, auth: keys.auth } });
  res.status(201).json({ ok: true });
}));

export default r;
