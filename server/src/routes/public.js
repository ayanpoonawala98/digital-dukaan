import { Router } from 'express';
import { Op } from 'sequelize';
import { storeUrl } from '../utils/store-domain.js';
import QRCode from 'qrcode';
import { Business, Category, Product, Lead, PushSubscription, ShopRequest, RestaurantOrder, Coupon, Referral } from '../models/index.js';
import { bad, validEmail, wrap, publicImageUrl, whatsappUrl, whatsappCartUrl, escapeLike } from '../utils/core.js';
const r = Router();
const shop = async slug => { const b = await Business.findOne({ where: { slug, active: true, deletedAt: null } }); if (!b) throw bad(404, 'Shop not found'); return b; };
const numId = value => { const n = Number(value); return Number.isInteger(n) && n > 0 ? n : null; };
const shopUrl = slug => process.env.STORE_SUBDOMAINS_READY === 'true' ? storeUrl(slug) : `${(process.env.CLIENT_URL || '').split(',')[0].replace(/\/$/, '')}/store/${slug}`;
const categoryInclude = { model: Category, as: 'category', attributes: ['name', 'slug'] };
const applyCoupon = async (businessId, subtotal, code) => {
  if (!code) return { discount: 0, code: null };
  if (typeof code !== 'string' || !/^[A-Z0-9-]{3,24}$/.test(code.trim().toUpperCase())) throw bad(400, 'Invalid coupon code');
  const coupon = await Coupon.findOne({ where: { businessId, code: code.trim().toUpperCase(), active: true } });
  if (!coupon) throw bad(400, 'Coupon not found or no longer active');
  return { discount: Number((subtotal * coupon.percentOff / 100).toFixed(2)), code: coupon.code };
};

const checkReferral = async (businessId, referralCode) => {
  if (!referralCode) return null;
  if (typeof referralCode !== 'string' || !/^[A-Z0-9-]{5,24}$/.test(referralCode.trim().toUpperCase())) throw bad(400, 'Invalid referral code');
  const referral = await Referral.findOne({ where: { businessId, code: referralCode.trim().toUpperCase() } });
  if (!referral || referral.status !== 'pending') throw bad(400, 'Referral code is not active');
  return referral;
};

// Creates only an enquiry. It never creates a login or a store.
r.post('/shop-requests', wrap(async (req, res) => {
  const { name, email, phone, shopName, message = '' } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100 || !validEmail(email) ||
      typeof phone !== 'string' || !/^[+\d()\s-]{8,25}$/.test(phone.trim()) ||
      typeof shopName !== 'string' || !shopName.trim() || shopName.trim().length > 100 ||
      typeof message !== 'string' || message.length > 1000) throw bad(400, 'Name, email, phone and shop name are required');
  await ShopRequest.sync(); // Targeted first-deploy table creation, never alter existing tables.
  await ShopRequest.create({ name: name.trim(), email: email.toLowerCase().trim(), phone: phone.trim(), shopName: shopName.trim(), message: message.trim() });
  res.status(201).json({ ok: true });
}));


r.get('/stores/:slug', wrap(async (req, res) => {
  const business = await Business.findOne({ where: { slug: req.params.slug } });
  if (!business || business.deletedAt) throw bad(404, 'Shop not found');
  // Only the storefront metadata endpoint reveals a paused shop. All catalog, QR,
  // subscription and enquiry endpoints continue to reject it through shop().
  if (!business.active) return res.json({ paused: true, business: { name: business.name, slug: business.slug }, categories: [] });
  const categories = await Category.findAll({ where: { businessId: business.id }, order: [['name', 'ASC']] });
  res.json({ business, categories });
}));

r.post('/stores/:slug/restaurant-orders', wrap(async (req, res) => {
  const business = await shop(req.params.slug);
  if (business.storeType !== 'restaurant') throw bad(404, 'Restaurant orders unavailable');
  const { orderType, tableNumber, customerName, customerPhone, deliveryAddress } = req.body || {};
  if (!['dine-in', 'takeaway', 'delivery'].includes(orderType)) throw bad(400, 'Select order type');
  const table = Number(tableNumber);
  if (orderType === 'dine-in' && (!Number.isInteger(table) || table < 1 || table > business.tableCount)) throw bad(400, 'Select a valid table number');
  if (orderType !== 'dine-in' && (typeof customerName !== 'string' || !customerName.trim() || customerName.trim().length > 100 || typeof customerPhone !== 'string' || !/^[+\d()\s-]{8,25}$/.test(customerPhone.trim()))) throw bad(400, 'Name and phone number required');
  if (orderType === 'delivery' && (typeof deliveryAddress !== 'string' || !deliveryAddress.trim() || deliveryAddress.trim().length > 500)) throw bad(400, 'Delivery address required');
  const raw = req.body?.items;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 50) throw bad(400, 'Select items');
  const ids = raw.map(e => Number(e.id));
  if (ids.some(n => !Number.isInteger(n) || n < 1) || new Set(ids).size !== ids.length) throw bad(400, 'Invalid items');
  const products = await Product.findAll({ where: { id: { [Op.in]: ids }, businessId: business.id, active: true } });
  if (products.length !== ids.length) throw bad(400, 'An item is no longer available');
  const byId = new Map(products.map(p => [p.id, p]));
  const items = raw.map(entry => {
    const product = byId.get(Number(entry.id)), qty = Number(entry.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99 || product.stock === 0 || (product.stock !== null && qty > product.stock)) throw bad(400, 'Invalid quantity or insufficient stock');
    return { productId: product.id, name: product.name, price: product.price, qty };
  });
  const subtotal = items.reduce((sum, item) => sum + Number(item.price) * item.qty, 0);
  const { discount, code } = await applyCoupon(business.id, subtotal, req.body?.couponCode);
  const referral = await checkReferral(business.id, req.body?.referralCode);
  const total = Number((subtotal - discount).toFixed(2));
  const order = await RestaurantOrder.create({ businessId: business.id, orderType, tableNumber: orderType === 'dine-in' ? table : null, customerName: orderType === 'dine-in' ? null : customerName.trim(), customerPhone: orderType === 'dine-in' ? null : customerPhone.trim(), deliveryAddress: orderType === 'delivery' ? deliveryAddress.trim() : null, items, subtotal, discount, couponCode: code, referralCode: referral?.code || null, total, status: 'new' });
  res.status(201).json({ orderId: order.id, status: order.status, subtotal, discount, total });
}));

r.get('/stores/:slug/products', wrap(async (req, res) => {
  const business = await shop(req.params.slug);
  const where = { businessId: business.id, active: true };
  if (req.query.category) {
    const category = await Category.findOne({ where: { businessId: business.id, slug: String(req.query.category) } });
    if (!category) return res.json({ products: [] });
    where.categoryId = category.id;
  }
  if (req.query.search) where.name = { [Op.iLike]: `%${escapeLike(String(req.query.search).slice(0, 80))}%` };
  const products = await Product.findAll({ where, include: [categoryInclude], order: [['featured', 'DESC'], ['createdAt', 'DESC']], limit: 100 });
  res.json({ products });
}));

r.get('/stores/:slug/products/:id', wrap(async (req, res) => {
  const business = await shop(req.params.slug);
  const id = numId(req.params.id);
  const product = id && await Product.findOne({ where: { id, businessId: business.id, active: true }, include: [categoryInclude] });
  if (!product) throw bad(404, 'Product not found');
  res.json({ business, product });
}));

r.post('/stores/:slug/products/:id/enquire', wrap(async (req, res) => {
  const business = await shop(req.params.slug);
  if (business.storeType === 'restaurant') throw bad(400, 'Order from the menu instead');
  const id = numId(req.params.id);
  const product = id && await Product.findOne({ where: { id, businessId: business.id, active: true } });
  if (!product) throw bad(404, 'Product not found');
  if (product.stock === 0) throw bad(400, 'This product is out of stock right now');
  await Lead.create({ businessId: business.id, productId: product.id, productName: product.name, price: product.price });
  res.status(201).json({ url: whatsappUrl(business, product, publicImageUrl(product.imageUrl, process.env.PUBLIC_API_URL)) });
}));

r.post('/stores/:slug/enquire-cart', wrap(async (req, res) => {
  const business = await shop(req.params.slug);
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
    lines.push({ productId: product.id, name: product.name, price: product.price, qty });
  }
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
  if (business.minOrder > 0 && subtotal < business.minOrder) throw bad(400, `Minimum order is Rs.${business.minOrder.toFixed(0)}`);
  const { discount, code } = await applyCoupon(business.id, subtotal, req.body?.couponCode);
  const referral = await checkReferral(business.id, req.body?.referralCode);
  const delivery = business.freeDeliveryAbove !== null && subtotal >= business.freeDeliveryAbove ? 0 : Number(business.deliveryCharge || 0);
  const total = Number((subtotal - discount + delivery).toFixed(2));
  await Lead.create({ businessId: business.id, productId: null, productName: `${lines.reduce((s, l) => s + l.qty, 0)} items`, price: total, items: lines, discount, couponCode: code, referralCode: referral?.code || null });
  const url = whatsappCartUrl(business, lines, subtotal, delivery, total, shopUrl(req.params.slug), code, discount);
  const finalUrl = new URL(url); if (referral) finalUrl.searchParams.set('text', `${finalUrl.searchParams.get('text')}\nReferral: ${referral.code} (reward after shop confirms order)`);
  res.status(201).json({ url: finalUrl.toString(), total, discount });
}));

r.get('/stores/:slug/qr', wrap(async (req, res) => {
  const business = await shop(req.params.slug);
  const table = Number(req.query.table);
  if (req.query.table !== undefined && (business.storeType !== 'restaurant' || !Number.isInteger(table) || table < 1 || table > business.tableCount)) throw bad(400, 'Invalid restaurant table');
  const destination = req.query.table === undefined ? shopUrl(business.slug) : `${shopUrl(business.slug)}?table=${table}`;
  const svg = await QRCode.toString(destination, { type: 'svg', margin: 1, width: 512, color: { dark: '#1a1a1a', light: '#ffffff' } });
  res.type('image/svg+xml').send(svg);
}));

r.get('/stores/:slug/push-key', wrap(async (req, res) => {
  await shop(req.params.slug);
  res.json({ vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '' });
}));

r.post('/stores/:slug/push-subscription', wrap(async (req, res) => {
  const business = await shop(req.params.slug);
  const { endpoint, keys } = req.body || {};
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') || typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string') throw bad(400, 'Invalid push subscription');
  await PushSubscription.upsert({ businessId: business.id, endpoint: endpoint.slice(0, 1000), keys: { p256dh: keys.p256dh, auth: keys.auth } });
  res.status(201).json({ ok: true });
}));

export default r;
