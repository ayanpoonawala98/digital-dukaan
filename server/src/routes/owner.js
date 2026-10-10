import { tablesState, billHistory, billsSummary, settleBill } from '../features/restaurant/table-bills.js';
import { assertCanCreateStore } from '../features/platform/subscriptions.js';
import {optimizeUpload} from '../features/catalog/optimize-upload.js';
import {ownerList} from '../features/stores/owner-list-page.js';
import { customerOrderPushTitle } from '../features/orders/customer-order-push.js';
import {streamBill} from '../features/billing/invoice.js';
import {updateOrderStock,RETAIL_DEDUCT,RESTAURANT_DEDUCT} from '../features/orders/order-stock.js';
import {OrderStockLedger,historicalOrder,ensureOrderStockSchema} from '../features/orders/order-stock-schema.js';
import {shopCardPdf} from '../features/stores/shop-card-pdf.js';
import { productCatalogPdf } from '../features/catalog/product-pdf.js';
import { deleteCatalogProduct } from '../features/catalog/delete-product.js';
import {campaignOwnerRoutes} from '../features/notifications/campaigns.js';
import { TIME_RE } from '../features/stores/hours.js';
import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { uploadImageKit } from '../shared/utils/imagekit.js';
import { registerStoreDomain, storeDomain, storeUrl } from '../shared/utils/store-domain.js';
import { effective as staffPerms, clean as cleanPerms, staffAllowed } from '../shared/permissions.js';
import QRCode from 'qrcode';
import {qrBrand} from '../features/stores/shop-qr.js';
import PDFDocument from 'pdfkit';
import { whatsappCloudOwnerRoutes } from '../features/whatsapp/whatsapp-cloud.js';
import { byoOwnerRoutes, sendOrderStatus as sendOrderStatusWhatsApp } from '../features/whatsapp/whatsapp-byo.js';
import { crmRoutes } from '../features/crm/crm.js';
import webpush from 'web-push';
import { notifyNewProduct } from '../features/notifications/new-product-push.js';
import { flowFor, ORDER_FLOWS, RESTAURANT_DONE, RESTAURANT_STATUS_TEXT, restaurantStatusAllowed } from '../features/orders/order-flows.js';
import { cleanVariants, cleanAddonGroups, cleanVeg, cleanTags, istDay } from '../features/restaurant/menu-options.js';
import { featureForOwnerRoute, isLocked } from '../features/platform/feature-locks.js';
import { sequelize, Business, User, Category, Product, Lead, PushSubscription, OwnerPushSubscription, RestaurantOrder, OrderPushSubscription, Coupon, Referral, TableRequest } from '../models/index.js';
import { buildLine, cleanNote } from '../features/restaurant/menu-options.js';
import { validateProductRows } from '../features/catalog/product-import.js';
import { insights } from '../features/platform/sales-insights.js';
import { dateWhere, dateWindow, summarize, saleRows, ordersCsv, csvCell as reportCell } from '../features/platform/reporting.js';
import { auth, roles } from '../shared/middleware/auth.js';
import { bad, slugify, validEmail, validPhone, validPrice, wrap, clientBase } from '../shared/utils/core.js';

const r = Router();
import { restoreDeadline } from '../shared/retention.js';
import { mergePaymentKeys, paymentView, createPaymentLink, fetchPaymentLink, verifyKeys } from '../features/billing/razorpay.js';
import { cleanFieldDefs } from '../features/catalog/custom-fields.js';
import { invoiceUrl } from '../features/billing/invoice.js';
import { sendWeeklyReport } from '../features/platform/reports.js';
import { notifyStatusChange, providerStatus, resolveStoreProviders, cleanSettings, saveSettings, sendEmail, sendSms } from '../features/notifications/notify.js';
import { NotifySecret, PaymentSecret } from '../models/index.js';
import { encryptJson, decryptJson, mergeSecrets, publicView } from '../features/notifications/notify-secrets.js';
const restoreUntil = restoreDeadline;
r.use(auth, roles('owner', 'staff'));
const ownerOnly = roles('owner');


if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@digitaldukaan.app', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
}

const numId = (value, label = 'ID') => {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw bad(400, `Invalid ${label}`);
  return n;
};

r.get('/stores', wrap(async (req, res) => res.json({ stores: await Business.findAll({ where: req.user.role === 'staff' ? { id: req.user.staffBusinessId, ownerId: req.user.managerId, deletedAt: null } : { ownerId: req.user.id, deletedAt: null }, order: [['createdAt', 'DESC']] }) })));
r.get('/deleted-stores', ownerOnly, wrap(async (req, res) => {
  const stores = await Business.findAll({ where: { ownerId: req.user.id, deletedAt: { [sequelize.Sequelize.Op.ne]: null } }, order: [['deletedAt', 'DESC']] });
  res.json({ stores: stores.map(store => ({ id: store.id, name: store.name, slug: store.slug, deletedAt: store.deletedAt, restoreUntil: restoreUntil(store.deletedAt) })) });
}));
r.post('/deleted-stores/:storeId/restore', ownerOnly, wrap(async (req, res) => {
  const store = await Business.findOne({ where: { id: numId(req.params.storeId, 'store ID'), ownerId: req.user.id } });
  if (!store?.deletedAt) throw bad(404, 'Deleted store not found');
  if (new Date() >= restoreUntil(store.deletedAt)) throw bad(410, 'Restore window has expired');
  if (req.body?.slug !== store.slug) throw bad(400, 'Enter the exact store link to restore');
  await store.update({ deletedAt: null, active: store.wasActiveBeforeDelete === true, wasActiveBeforeDelete: null });
  res.json({ store });
}));
r.post('/stores', ownerOnly, wrap(async (req, res) => {
  const { name, slug, whatsapp, description = '', location = '', storeType = 'retail', tableCount = 0 } = req.body;
  if (!['retail', 'restaurant', 'services'].includes(storeType) || (storeType === 'restaurant' && (!Number.isInteger(Number(tableCount)) || Number(tableCount) < 1 || Number(tableCount) > 100))) throw bad(400, 'Choose a valid store type and 1-100 tables for a restaurant');
  const shopSlug = slugify(slug || name);
  if (!name?.trim() || !shopSlug || !validPhone(whatsapp)) throw bad(400, 'Store name and WhatsApp number with country code required');
  storeDomain(shopSlug);
  await assertCanCreateStore(req.user);
  const store = await Business.create({ ownerId: req.user.id, name: name.trim(), slug: shopSlug, whatsapp, description, location, storeType, tableCount: storeType === 'restaurant' ? Number(tableCount) : 0, active: false });
  try {
    await registerStoreDomain(shopSlug);
    await store.update({ active: true });
    res.status(201).json({ store });
  } catch (err) {
    await store.destroy();
    throw bad(503, 'Store domain could not be registered. No store was created. Try again later.');
  }
}));

const bid = req => req.store.id;
r.use('/:storeId', wrap(async (req, res, next) => {
  const store = await Business.findOne({ where: { id: numId(req.params.storeId, 'store ID'), ownerId: req.user.role === 'owner' ? req.user.id : req.user.managerId, deletedAt: null } });
  if (!store || (req.user.role === 'staff' && Number(req.user.staffBusinessId) !== store.id)) throw bad(404, 'Store not found');
  req.store = store;
  if (req.user.role === 'staff') {
    const route = req.path.replace(/^\//, '');
    if (!staffAllowed(staffPerms(req.user), req.method, route)) throw bad(403, 'Your owner has not given you access to this. Ask them to update your permissions.');
  }
  const lockedFeature = featureForOwnerRoute(req.method, req.path);
  if (lockedFeature && isLocked(req.store, lockedFeature)) throw bad(403, 'Kindly contact admin to enable this feature.');
  next();
}));

const testCooldown = new Map();
const loadCreds = async store => decryptJson((await NotifySecret.findByPk(store.id))?.payload);
const notifyState = async store => { const creds = await loadCreds(store); return { settings: cleanSettings(store.notifySettings), providers: providerStatus(resolveStoreProviders(creds)), keys: publicView(creds) }; };
r.get('/:storeId/notifications', ownerOnly, wrap(async (req, res) => res.json(await notifyState(req.store))));
r.put('/:storeId/notifications/keys', ownerOnly, wrap(async (req, res) => {
  let next;
  try { next = mergeSecrets(await loadCreds(req.store), req.body || {}); } catch (err) { throw bad(err.status || 500, err.message); }
  let payload;
  try { payload = encryptJson(next); } catch { throw bad(500, 'Saving keys is not available on this server yet'); }
  await NotifySecret.upsert({ businessId: req.store.id, payload });
  res.json(await notifyState(req.store));
}));
r.put('/:storeId/notifications', ownerOnly, wrap(async (req, res) => {
  const b = req.body || {};
  for (const k of ['ownerEmailAlerts', 'ownerSmsAlerts', 'customerSms', 'customerEmail', 'lowStockAlerts', 'weeklyReport']) if (b[k] !== undefined && typeof b[k] !== 'boolean') throw bad(400, 'Invalid notification setting');
  const input = {}; for (const k of ['ownerEmailAlerts', 'ownerEmail', 'ownerSmsAlerts', 'ownerPhone', 'customerSms', 'customerEmail', 'lowStockAlerts', 'lowStockThreshold', 'weeklyReport']) if (Object.hasOwn(b, k)) input[k] = b[k];
  try { await saveSettings(req.store, input); res.json(await notifyState(req.store)); } catch (err) { throw bad(err.status || 500, err.message); }
}));
r.post('/:storeId/notifications/test', ownerOnly, wrap(async (req, res) => {
  const channel = req.body?.channel, s = cleanSettings(req.store.notifySettings), providerSet = resolveStoreProviders(await loadCreds(req.store)), providers = providerStatus(providerSet);
  if (!['email', 'sms'].includes(channel)) throw bad(400, 'Choose email or SMS');
  if (Date.now() - (testCooldown.get(req.store.id) || 0) < 20000) throw bad(429, 'Wait a few seconds before sending another test');
  if (!providers[channel].configured) throw bad(400, `${channel === 'email' ? 'Email' : 'SMS'} sending is not set up yet. Add your own key in the section above.`);
  const to = channel === 'email' ? (s.ownerEmail || req.user.email) : s.ownerPhone;
  if (!to) throw bad(400, channel === 'email' ? 'Add an alert email first' : 'Save a mobile number for SMS alerts first');
  testCooldown.set(req.store.id, Date.now());
  const result = channel === 'email' ? await sendEmail({ to, subject: `Test alert - ${req.store.name}`, text: `This is a test alert from ${req.store.name}. Order alerts will arrive here.` }, { providers: providerSet }) : await sendSms({ to, text: `Test alert from ${req.store.name}. Order alerts will arrive on this number.` }, { providers: providerSet });
  if (!result.ok) throw bad(502, result.error || result.skipped || 'Could not send the test');
  res.json({ ok: true });
}));
r.use('/:storeId/whatsapp-byo', byoOwnerRoutes);
r.use('/:storeId/whatsapp-cloud', whatsappCloudOwnerRoutes); // owner owns connect/manage; staff may read the inbox and send reviewed replies (allow-list above)
r.use('/:storeId/campaigns',campaignOwnerRoutes);
r.use('/:storeId/customers', (req,res,next)=>req.user.role === 'staff' && !/^\/import\/(preview|commit)$/.test(req.path) ? res.status(403).json({error:'Staff can preview and import customers only.'}) : next(), crmRoutes);

r.delete('/:storeId', ownerOnly, wrap(async (req, res) => {
  if (req.body?.slug !== req.store.slug) throw bad(400, 'Enter the exact store link to remove it');
  const deletedAt = new Date();
  await req.store.update({ active: false, deletedAt, wasActiveBeforeDelete: req.store.active });
  res.json({ removed: true, slug: req.store.slug, restoreUntil: restoreUntil(deletedAt) });
}));
r.get('/:storeId/staff', ownerOnly, wrap(async(req,res)=>res.json(await ownerList(User,'staff',req,{managerId:req.user.id,staffBusinessId:bid(req),role:'staff'},['name','email'],{},u=>({id:u.id,name:u.name,email:u.email,active:u.active,permissions:staffPerms(u)})))));
r.post('/:storeId/staff', ownerOnly, wrap(async (req, res) => {
  const name = String(req.body?.name || '').trim(), email = String(req.body?.email || '').trim().toLowerCase(), password = req.body?.password;
  if (!name || name.length > 100 || !validEmail(email) || typeof password !== 'string' || password.length < 12 || password.length > 128) throw bad(400, 'Name, valid email and a temporary password of at least 12 characters are required');
  const passwordHash = await bcrypt.hash(password, 12);
  let permissions = null;
  if (req.body?.permissions !== undefined) { permissions = cleanPerms(req.body.permissions); if (!permissions) throw bad(400, 'Unknown permission'); }
  const staff = await User.create({ name, email, passwordHash, role:'staff', managerId:req.user.id, staffBusinessId:bid(req), active:true, permissions });
  res.status(201).json({ staff:{ id:staff.id, name:staff.name, email:staff.email, active:true, permissions:staffPerms(staff) } });
}));
r.patch('/:storeId/staff/:id', ownerOnly, wrap(async (req, res) => {
  const hasActive = req.body?.active !== undefined, hasPerms = req.body?.permissions !== undefined;
  if (!hasActive && !hasPerms) throw bad(400, 'Send active or permissions');
  if (hasActive && typeof req.body.active !== 'boolean') throw bad(400, 'Active must be true or false');
  let permissions;
  if (hasPerms) { permissions = cleanPerms(req.body.permissions); if (!permissions) throw bad(400, 'Unknown permission'); }
  const staff = await User.findOne({ where: { id:numId(req.params.id), managerId:req.user.id, staffBusinessId:bid(req), role:'staff' } });
  if (!staff) throw bad(404, 'Staff not found');
  await staff.update({ ...(hasActive ? { active:req.body.active } : {}), ...(hasPerms ? { permissions } : {}) });
  res.json({ staff:{ id:staff.id, name:staff.name, email:staff.email, active:staff.active, permissions:staffPerms(staff) } });
}));

r.get('/:storeId/overview', wrap(async (req, res) => {
  if (req.user.role === 'staff') return res.json({ business:req.store, products:0, categories:0, leads:0, subscribers:0, topProducts:[], lowStock:[] });
  const [products, categories, leads, subscribers] = await Promise.all([
    Product.count({ where: { businessId: bid(req) } }),
    Category.count({ where: { businessId: bid(req) } }),
    Lead.count({ where: { businessId: bid(req) } }),
    PushSubscription.count({ where: { businessId: bid(req) } })
  ]);
  const topProducts = await Lead.findAll({
    attributes: ['productName', [sequelize.fn('count', sequelize.col('productName')), 'count']],
    where: { businessId: bid(req) },
    group: ['productName'],
    order: [[sequelize.literal('count'), 'DESC']],
    limit: 5,
    raw: true
  });
  const lowStock = await Product.findAll({ where: { businessId: bid(req), active: true, stock: { [sequelize.Sequelize.Op.ne]: null, [sequelize.Sequelize.Op.lte]: 5 } }, order: [['stock', 'ASC']], limit: 10 });
  res.json({ business: req.store, products, categories, leads, subscribers, topProducts, lowStock });
}));

const EDITABLE = ['name', 'description', 'location', 'whatsapp', 'bannerText', 'bannerActive', 'offerPopupActive', 'offerPopupText', 'offerPopupTitle', 'offerPopupCtaText', 'offerPopupCtaUrl', 'offerPopupImageUrl', 'isOpen', 'autoHours', 'blockWhenClosed', 'openTime', 'closeTime', 'openingHours', 'deliveryCharge', 'freeDeliveryAbove', 'prepMinutes', 'logoUrl', 'coverUrl', 'notifyImageUrl', 'latitude', 'longitude', 'area', 'pincode', 'listInDirectory', 'serviceRadiusKm', 'accentColor', 'upiId', 'gstin', 'minOrder', 'storeType', 'tableCount'];
r.patch('/:storeId/business', wrap(async (req, res) => {
  const changes = {};
  for (const key of EDITABLE) if (Object.hasOwn(req.body, key)) changes[key] = req.body[key];
  if (changes.storeType !== undefined && !['retail', 'restaurant', 'services'].includes(changes.storeType)) throw bad(400, 'Invalid store type');
  if (changes.tableCount !== undefined && (!Number.isInteger(Number(changes.tableCount)) || Number(changes.tableCount) < 0 || Number(changes.tableCount) > 100)) throw bad(400, 'Table count must be 0-100');
  if ((changes.storeType || req.store.storeType) === 'restaurant' && Number(changes.tableCount ?? req.store.tableCount) < 1) throw bad(400, 'Restaurant needs at least one table');
  if (changes.storeType && changes.storeType !== 'restaurant') changes.tableCount = 0;
  if (changes.name !== undefined && (typeof changes.name !== 'string' || !changes.name.trim())) throw bad(400, 'Shop name required');
  if (changes.whatsapp !== undefined && !validPhone(changes.whatsapp)) throw bad(400, 'WhatsApp number needs country code without +');
  if (changes.prepMinutes !== undefined) { if (changes.prepMinutes === '' || changes.prepMinutes === null) changes.prepMinutes = null; else { const m = Number(changes.prepMinutes); if (!Number.isInteger(m) || m < 1 || m > 240) throw bad(400, 'Ready-in minutes must be 1 to 240'); changes.prepMinutes = m; } }
  for (const key of ['deliveryCharge', 'freeDeliveryAbove', 'minOrder']) {
    if (changes[key] !== undefined && changes[key] !== null && changes[key] !== '' && !validPrice(Number(changes[key]))) throw bad(400, 'Charges must be non-negative numbers');
    if (changes[key] !== undefined) changes[key] = changes[key] === '' || changes[key] === null ? (key === 'freeDeliveryAbove' ? null : 0) : Number(changes[key]);
  }
  if (changes.offerPopupText !== undefined && (typeof changes.offerPopupText !== 'string' || changes.offerPopupText.length > 220)) throw bad(400, 'Offer text must be at most 220 characters');
  for (const [key, max] of [['offerPopupTitle', 90], ['offerPopupCtaText', 40]]) if (changes[key] !== undefined && (typeof changes[key] !== 'string' || changes[key].length > max)) throw bad(400, 'Offer title or button is too long');
  if (changes.offerPopupCtaUrl !== undefined) {
    if (typeof changes.offerPopupCtaUrl !== 'string' || changes.offerPopupCtaUrl.length > 500 || (changes.offerPopupCtaUrl && !/^https:\/\/[^\s]+$/i.test(changes.offerPopupCtaUrl))) throw bad(400, 'Use a secure https:// offer link');
  }
  if (changes.offerPopupActive && !(changes.offerPopupText ?? req.store.offerPopupText)?.trim()) throw bad(400, 'Write an offer message before enabling the popup');
  const ctaText = changes.offerPopupCtaText ?? req.store.offerPopupCtaText;
  const ctaUrl = changes.offerPopupCtaUrl ?? req.store.offerPopupCtaUrl;
  if (!!ctaText?.trim() !== !!ctaUrl?.trim()) throw bad(400, 'Provide both a button label and its link, or leave both blank');
  for (const [k, lo, hi, label] of [['latitude', -90, 90, 'Latitude'], ['longitude', -180, 180, 'Longitude']]) {
    if (changes[k] === undefined) continue;
    if (changes[k] === '' || changes[k] === null) { changes[k] = null; continue; }
    const n = Number(changes[k]);
    if (typeof changes[k] === 'boolean' || !Number.isFinite(n) || n < lo || n > hi) throw bad(400, `${label} must be a number between ${lo} and ${hi}`);
    changes[k] = Number(n.toFixed(6));
  }
  if (changes.serviceRadiusKm !== undefined) {
    if (changes.serviceRadiusKm === '' || changes.serviceRadiusKm === null) changes.serviceRadiusKm = null;
    else { const n = Number(changes.serviceRadiusKm); if (typeof changes.serviceRadiusKm === 'boolean' || !Number.isFinite(n) || n < 0.5 || n > 100) throw bad(400, 'Delivery radius must be between 0.5 and 100 km'); changes.serviceRadiusKm = Number(n.toFixed(1)); }
  }
  if (changes.area !== undefined) { changes.area = String(changes.area ?? '').trim(); if (changes.area.length > 80) throw bad(400, 'Area is too long (80 characters max)'); }
  if (changes.pincode !== undefined) { changes.pincode = String(changes.pincode ?? '').trim(); if (changes.pincode && !/^[A-Za-z0-9 -]{3,10}$/.test(changes.pincode)) throw bad(400, 'Enter a valid pincode'); }
  if (changes.listInDirectory !== undefined) {
    changes.listInDirectory = changes.listInDirectory === true || changes.listInDirectory === 'true';
    const la = changes.latitude !== undefined ? changes.latitude : req.store.latitude, lo2 = changes.longitude !== undefined ? changes.longitude : req.store.longitude;
    if (changes.listInDirectory && (la === null || la === undefined || lo2 === null || lo2 === undefined)) throw bad(400, 'Set your shop location on the map before listing it in the nearby directory');
  }
  if (changes.latitude !== undefined || changes.longitude !== undefined) { const laN = (changes.latitude !== undefined ? changes.latitude : req.store.latitude) == null, loN = (changes.longitude !== undefined ? changes.longitude : req.store.longitude) == null; if (laN !== loN) throw bad(400, 'Set both latitude and longitude, or clear both'); }
  if (changes.notifyImageUrl !== undefined && changes.notifyImageUrl && (typeof changes.notifyImageUrl !== 'string' || !/^https:\/\/ik\.imagekit\.io\//.test(changes.notifyImageUrl) || changes.notifyImageUrl.length > 255)) throw bad(400, 'Use an uploaded image');
  if (changes.offerPopupImageUrl !== undefined && changes.offerPopupImageUrl && (!/^https:\/\/ik\.imagekit\.io\//.test(changes.offerPopupImageUrl) || changes.offerPopupImageUrl.length > 255)) throw bad(400, 'Use an ImageKit image');
  if (changes.openTime !== undefined && changes.openTime !== '' && !TIME_RE.test(String(changes.openTime))) throw bad(400, 'Opening time must look like 09:00');
  if (changes.closeTime !== undefined && changes.closeTime !== '' && !TIME_RE.test(String(changes.closeTime))) throw bad(400, 'Closing time must look like 21:00');
  if (changes.autoHours) {
    const ot = changes.openTime !== undefined ? changes.openTime : req.store.openTime, ct = changes.closeTime !== undefined ? changes.closeTime : req.store.closeTime;
    if (!TIME_RE.test(String(ot || '')) || !TIME_RE.test(String(ct || ''))) throw bad(400, 'Set both opening and closing time for automatic hours');
  }
  for (const key of ['bannerActive', 'offerPopupActive', 'isOpen', 'autoHours', 'blockWhenClosed']) if (changes[key] !== undefined) changes[key] = Boolean(changes[key]);
  if (changes.accentColor !== undefined && !/^$|^#[0-9a-fA-F]{6}$/.test(changes.accentColor)) throw bad(400, 'Accent color must be a hex color like #0e9f6e');
  if (changes.upiId !== undefined) changes.upiId = String(changes.upiId || '').slice(0, 60);
  if (changes.gstin !== undefined) {
    changes.gstin = String(changes.gstin || '').toUpperCase().trim();
    if (changes.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(changes.gstin)) throw bad(400, 'Enter a valid 15-character GSTIN or leave it blank');
  }
  await req.store.update(changes);
  res.json({ business: req.store });
}));

r.get('/:storeId/categories', wrap(async(req,res)=>res.json(await ownerList(Category,'categories',req,{businessId:bid(req)},['name','slug']))));
r.post('/:storeId/categories', wrap(async (req, res) => {
  const name = String(req.body.name || '').trim(), slug = slugify(name);
  if (!slug) throw bad(400, 'Category name required');
  res.status(201).json({ category: await Category.create({ name, slug, businessId: bid(req) }) });
}));
r.patch('/:storeId/categories/:id', wrap(async (req, res) => {
  const name = String(req.body.name || '').trim(), slug = slugify(name);
  if (!slug) throw bad(400, 'Category name required');
  const category = await Category.findOne({ where: { id: numId(req.params.id, 'category ID'), businessId: bid(req) } });
  if (!category) throw bad(404, 'Category not found');
  await category.update({ name, slug });
  res.json({ category });
}));
r.delete('/:storeId/categories/:id', wrap(async (req, res) => {
  const category = await Category.findOne({ where: { id: numId(req.params.id, 'category ID'), businessId: bid(req) } });
  if (!category) throw bad(404, 'Category not found');
  if (await Product.findOne({ where: { businessId: bid(req), categoryId: category.id } })) throw bad(409, 'Move or remove products in this category first');
  await category.destroy();
  res.status(204).end();
}));

const categoryInclude = { model: Category, as: 'category', attributes: ['name', 'slug'] };
r.get('/:storeId/products', wrap(async(req,res)=>res.json(await ownerList(Product,'products',req,{businessId:bid(req)},['name','description','$category.name$'],{include:[categoryInclude]}))));

async function productFields(req) {
  const fields = {};
  for (const key of ['name', 'description', 'price', 'imageUrl', 'active', 'featured', 'duration']) if (Object.hasOwn(req.body, key)) fields[key] = req.body[key];
  if (Object.hasOwn(req.body, 'kind')) {
    if (!['product', 'service'].includes(req.body.kind)) throw bad(400, 'Kind must be product or service');
    fields.kind = req.body.kind;
  }
  if (fields.duration !== undefined) fields.duration = String(fields.duration || '').slice(0, 60);
  if (Object.hasOwn(req.body, 'stock')) {
    const raw = req.body.stock;
    if (raw === null || raw === '') fields.stock = null;
    else {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) throw bad(400, 'Stock must be a whole number of 0 or more, or blank for unlimited');
      fields.stock = n;
    }
  }
  if (fields.price !== undefined) {
    fields.price = Number(fields.price);
    if (!validPrice(fields.price)) throw bad(400, 'Price must be a non-negative number');
  }
  if (Object.hasOwn(req.body, 'customFields')) fields.customFields = cleanFieldDefs(req.body.customFields);
  if (Object.hasOwn(req.body, 'variants')) fields.variants = cleanVariants(req.body.variants);
  if (Object.hasOwn(req.body, 'addonGroups')) fields.addonGroups = cleanAddonGroups(req.body.addonGroups);
  if (Object.hasOwn(req.body, 'veg')) fields.veg = cleanVeg(req.body.veg);
  if (Object.hasOwn(req.body, 'tags')) fields.tags = cleanTags(req.body.tags);
  if (Object.hasOwn(req.body, 'soldOutToday')) fields.soldOutDate = req.body.soldOutToday ? istDay() : null;
  if (fields.active !== undefined) fields.active = Boolean(fields.active);
  if (fields.featured !== undefined) fields.featured = Boolean(fields.featured);
  if (fields.imageUrl && !(/^https?:\/\//i.test(fields.imageUrl) || fields.imageUrl.startsWith('/uploads/'))) throw bad(400, 'Image must be an HTTP(S) URL or uploaded image');
  if (Object.hasOwn(req.body, 'imageUrls')) {
    const images = req.body.imageUrls;
    if (!Array.isArray(images) || images.length > 5 || images.some(url => typeof url !== 'string' || url.length > 2048 || !(/^(https?:\/\/|\/uploads\/)/i.test(url)))) throw bad(400, 'Add up to 5 valid photo URLs');
    if (new Set(images).size !== images.length) throw bad(400, 'Duplicate photos are not allowed');
    fields.imageUrls = images;
    fields.imageUrl = images[0] || '';
  }
  if (fields.imageUrl !== undefined && fields.imageUrls === undefined) fields.imageUrls = fields.imageUrl ? [fields.imageUrl] : [];
  if (Object.hasOwn(req.body, 'category')) {
    const category = await Category.findOne({ where: { id: numId(req.body.category, 'category ID'), businessId: bid(req) } });
    if (!category) throw bad(400, 'Choose one of your shop categories');
    fields.categoryId = category.id;
  }
  return fields;
}
r.post('/:storeId/products', wrap(async (req, res) => {
  const fields = await productFields(req);
  if (!fields.name?.trim()) throw bad(400, 'Product name required');
  if (fields.price === undefined) throw bad(400, 'Price required');
  if (!fields.categoryId) throw bad(400, 'Choose one of your shop categories');
  const product = await Product.create({ ...fields, businessId: bid(req) });
  void notifyNewProduct({ store: req.store, product, PushSubscription, send: (sub, payload) => webpush.sendNotification(sub, payload), configured: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY), log: (msg, m) => console.error(msg, m) });
  res.status(201).json({ product });
}));
r.patch('/:storeId/products/:id', wrap(async (req, res) => {
  const fields = await productFields(req);
  const product = await Product.findOne({ where: { id: numId(req.params.id, 'product ID'), businessId: bid(req) } });
  if (!product) throw bad(404, 'Product not found');
  const wasLive = product.active;
  await product.update(fields);
  if (!wasLive && product.active) void notifyNewProduct({ store: req.store, product, PushSubscription, send: (sub, payload) => webpush.sendNotification(sub, payload), configured: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY), log: (msg, m) => console.error(msg, m) });
  res.json({ product });
}));
r.delete('/:storeId/products/:id', wrap(async (req, res) => {
  const removed = await deleteCatalogProduct({ sequelize, Product, Lead, businessId: bid(req), productId: numId(req.params.id, 'product ID') });
  if (!removed) throw bad(404, 'Product not found');
  res.status(204).end();
}));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_, file, done) => done(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) });
r.post('/:storeId/upload', upload.single('image'), wrap(async (req, res) => {
  if (!req.file) throw bad(400, 'Choose a JPEG, PNG or WebP image under 5 MB');
  const optimized=await optimizeUpload(req.file.buffer,req.file.mimetype);
  if (process.env.IMAGEKIT_PRIVATE_KEY) {
    const imageUrl = await uploadImageKit(optimized.buffer, `${randomUUID()}${optimized.ext}`, `${process.env.IMAGEKIT_UPLOAD_ROOT || "/digital-dukaan"}/${bid(req)}`);
    return res.status(201).json({ imageUrl });
  }
  if (process.env.VERCEL) throw bad(503, 'Image hosting is not configured');
  const ext = optimized.ext;
  const name = `${randomUUID()}${ext}`;
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), optimized.buffer);
  res.status(201).json({ imageUrl: `/uploads/${name}` });
}));

const listWhere = (req, kind) => {
  const Op = sequelize.Sequelize.Op;
  const where = { businessId: bid(req), ...dateWhere(req.query, Op) };
  const statuses = kind === 'restaurant' ? ORDER_FLOWS.restaurant.statuses : ['new','confirmed','packed','shipped','out-for-delivery','delivered','in-progress','completed','cancelled'];
  if (req.query.status && req.query.status !== 'all') { if (!statuses.includes(req.query.status)) throw bad(400, 'Invalid order status'); where.status = req.query.status; }
  const q = String(req.query.q || '').trim().slice(0,100);
  if (q) { const escaped = q.replace(/[\\%_]/g, '\\$&'); where[Op.or] = [{ customerPhone: { [Op.iLike]: `%${escaped}%` } }, { customerName: { [Op.iLike]: `%${escaped}%` } }, ...(kind === 'restaurant' ? [] : [{ productName: { [Op.iLike]: `%${escaped}%` } }])]; if (/^#?\d+$/.test(q)) where[Op.or].push({ orderNumber: Number(q.replace('#','')) }); }
  return where;
};
const orderPage = async (req, Model, kind) => {
  if(req.query.limit!==undefined)return ownerList(Model,kind==='restaurant'?'orders':'leads',{query:{limit:req.query.limit,cursor:req.query.cursor}},listWhere(req,kind),[]);
  const page = Number(req.query.page || 1);
  if(!Number.isSafeInteger(page) || page<1 || page>100000) throw bad(400,'Invalid page');
  const asked = Number(req.query.pageSize); const limit = req.query.page ? (Number.isInteger(asked) && asked >= 5 && asked <= 100 ? asked : 50) : kind === 'restaurant' ? 200 : 500;
  const { rows, count } = await Model.findAndCountAll({ where: listWhere(req, kind), order: [['createdAt','DESC'],['id','DESC']], limit, offset: (page-1)*limit });
  return { [kind === 'restaurant' ? 'orders':'leads']: rows, total: count, page, pageSize: limit };
};
r.get('/:storeId/products/catalog.pdf', wrap(async(req,res)=>{
 const products=await Product.findAll({where:{businessId:bid(req)},include:[{model:Category,as:'category',attributes:['name']}],order:[['createdAt','DESC'],['id','DESC']]});
 if(products.length>1000)throw bad(400,'Catalog PDF supports up to 1,000 products. Use CSV for larger catalogs.');
 const doc=productCatalogPdf(req.store,products);
 res.type('application/pdf').attachment(`products-${req.store.slug}.pdf`);doc.pipe(res);doc.end();
}));
r.get('/:storeId/shop-qr.pdf', wrap(async(req,res)=>{
  // Same canonical URL helper as public storefront QR; no guessed hostname.
  const url = process.env.STORE_SUBDOMAINS_READY === 'true' ? storeUrl(req.store.slug) : `${clientBase()}/store/${req.store.slug}`;
  if(!/^https?:\/\//.test(url)) throw bad(503,'Shop link is not configured. Kindly contact admin.');
  const doc=await shopCardPdf(req.store,url);
  res.type('application/pdf').attachment(`${req.store.slug}-business-card.pdf`);doc.pipe(res);doc.end();
}));
r.get('/:storeId/leads', wrap(async (req,res) => res.json(await orderPage(req,Lead,'whatsapp'))));
r.get('/:storeId/leads/report.csv', wrap(async (req,res) => {
  const where = listWhere(req,'whatsapp');
  if (await Lead.count({where}) > 10000) throw bad(400,'Choose a smaller date range (maximum 10,000 orders per report)');
  const orders = await Lead.findAll({where,order:[['createdAt','DESC'],['id','DESC']]});
  res.type('text/csv').attachment(`orders-${req.store.slug}.csv`).send(ordersCsv(orders,'whatsapp'));
}));


// ---- Online payments (Razorpay payment links, owner's own keys) ----
const apiBase = req => `${req.hostname === 'localhost' ? 'http' : 'https'}://${req.get('host')}`;
const razorpayLocked = () => process.env.RAZORPAY_ENABLED !== 'true'; // online payments are locked until the owner enables them
const assertPaymentsOpen = () => { if (razorpayLocked()) throw bad(403, 'Online payments are coming soon'); };
const loadPayCreds = async store => decryptJson((await PaymentSecret.findByPk(store.id))?.payload);
const orderModel = kind => (kind === 'leads' ? Lead : kind === 'restaurant-orders' ? RestaurantOrder : null);
r.get('/:storeId/payments', ownerOnly, wrap(async (req, res) => res.json({ razorpay: { ...paymentView(await loadPayCreds(req.store)), locked: razorpayLocked() } })));
r.put('/:storeId/payments', ownerOnly, wrap(async (req, res) => {
  assertPaymentsOpen();
  let next; try { next = mergePaymentKeys(await loadPayCreds(req.store), req.body || {}); } catch (err) { throw bad(err.status || 500, err.message); }
  let payload; try { payload = encryptJson(next); } catch { throw bad(500, 'Saving keys is not available on this server yet'); }
  if (req.body?.verify !== false && next.keyId && next.keySecret) { try { await verifyKeys(next); } catch (err) { throw bad(err.status || 502, err.message); } }
  await PaymentSecret.upsert({ businessId: req.store.id, payload });
  res.json({ razorpay: paymentView(next) });
}));
r.post('/:storeId/:kind(leads|restaurant-orders)/:id/payment-link', ownerOnly, wrap(async (req, res) => {
  assertPaymentsOpen();
  const Model = orderModel(req.params.kind), order = await Model.findOne({ where: { id: numId(req.params.id), businessId: bid(req) } });
  if (!order) throw bad(404, 'Order not found');
  if (order.status === 'cancelled') throw bad(400, 'This order is cancelled');
  if (order.paymentStatus === 'paid') throw bad(409, 'This order is already paid');
  const creds = await loadPayCreds(req.store);
  if (order.paymentLinkUrl && order.paymentStatus === 'created' && !req.body?.renew) return res.json({ order, url: order.paymentLinkUrl, whatsappUrl: payWhatsapp(req.store, order) });
  const amount = req.params.kind === 'leads' ? order.price : order.total;
  const link = await createPaymentLink(creds, { amount, referenceId: `${req.params.kind === 'leads' ? 'L' : 'R'}${order.id}-${Date.now().toString(36)}`, description: `Order #${order.id} at ${req.store.name}`, name: order.customerName, phone: order.customerPhone }).catch(err => { throw bad(err.status || 502, err.message); });
  await order.update({ paymentStatus: 'created', paymentLinkId: link.id, paymentLinkUrl: link.url, paidAt: null });
  res.status(201).json({ order, url: link.url, whatsappUrl: payWhatsapp(req.store, order) });
}));
r.post('/:storeId/:kind(leads|restaurant-orders)/:id/payment-link/refresh', ownerOnly, wrap(async (req, res) => {
  assertPaymentsOpen();
  const Model = orderModel(req.params.kind), order = await Model.findOne({ where: { id: numId(req.params.id), businessId: bid(req) } });
  if (!order || !order.paymentLinkId) throw bad(404, 'No payment link on this order');
  const st = await fetchPaymentLink(await loadPayCreds(req.store), order.paymentLinkId).catch(err => { throw bad(err.status || 502, err.message); });
  const map = { paid: 'paid', expired: 'expired', cancelled: 'cancelled', partially_paid: 'created', created: 'created' };
  const paymentStatus = map[st.status] || order.paymentStatus;
  await order.update({ paymentStatus, paidAt: st.paid ? (order.paidAt || new Date()) : order.paidAt });
  res.json({ order, status: paymentStatus });
}));
function payWhatsapp(store, order) {
  const phone = String(order.customerPhone || '').replace(/\D/g, ''); if (!phone || !order.paymentLinkUrl) return '';
  const total = Number(order.price ?? order.total) || 0;
  return `https://wa.me/${phone}?text=${encodeURIComponent(`Hi! Your order #${order.id} at ${store.name} is Rs.${total.toFixed(2)}. Pay securely online (UPI, cards, netbanking): ${order.paymentLinkUrl}`)}`;
}
r.get('/:storeId/:kind(leads|restaurant-orders)/:id/bill-link', wrap(async (req, res) => {
  const Model = orderModel(req.params.kind), order = await Model.findOne({ where: { id: numId(req.params.id), businessId: bid(req) } });
  if (!order) throw bad(404, 'Order not found');
  const url = invoiceUrl(apiBase(req), req.params.kind === 'leads' ? 'lead' : 'restaurant', order.id), phone = String(order.customerPhone || '').replace(/\D/g, '');
  res.json({ url, whatsappUrl: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(`Hi! Here is your bill for order #${order.id} from ${req.store.name}: ${url}`)}` : '' });
}));
r.post('/:storeId/notifications/report', ownerOnly, wrap(async (req, res) => {
  if (Date.now() - (testCooldown.get(`r${req.store.id}`) || 0) < 20000) throw bad(429, 'Wait a few seconds before sending another report');
  testCooldown.set(`r${req.store.id}`, Date.now());
  const out = await sendWeeklyReport(req.store);
  if (!out.sent) throw bad(400, 'Turn on email or SMS alerts and add a provider first, then send a sample report.');
  res.json({ sent: out.sent, channels: out.channels, preview: out.text });
}));

r.get('/:storeId/leads/:leadId/invoice', wrap(async (req, res) => {
  const lead = await Lead.findOne({ where: { id: numId(req.params.leadId, 'enquiry ID'), businessId: bid(req) } });
  if (!lead) throw bad(404, 'Enquiry not found');
  await streamBill(res, req.store, lead, 'lead', { estimate: true });
}));



// Customers opt in from their private tracking page or My Orders; the store-wide broadcast flow is untouched.
const pushImage = (store, own = '') => [/^https:\/\/ik\.imagekit\.io\/[^\s]{1,200}$/.test(String(own || '')) ? own : '', store?.notifyImageUrl, store?.coverUrl, store?.logoUrl].find(u => /^https:\/\/[^\s]+$/.test(String(u || ''))) || '';
async function notifyOrderSubscribers(store, kind, order) {
  const label = flowFor(kind === 'restaurant' ? 'restaurant' : store.storeType).push[order.status];
  if (!label || !process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  try {
    const subs = await OrderPushSubscription.findAll({ where: { orderType: kind, orderId: order.id, businessId: store.id } });
    await Promise.allSettled(subs.map(async sub => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify({ title: customerOrderPushTitle(store, order), body: `${label} Tap to view.`, url: sub.returnPath, ...(pushImage(store) ? { image: pushImage(store) } : {}) }));
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) await sub.destroy();
        console.error('Customer status push failed', { category: err.statusCode ? 'push-service' : 'transport-or-config', statusCode: Number(err.statusCode) || null, businessId: store.id, orderType: kind, orderId: order.id });
      }
    }));
  } catch (err) { console.error('Customer status push lookup failed', { category: 'subscription-query', businessId: store.id, orderType: kind, orderId: order.id }); }
}

r.post('/:storeId/leads/:leadId/status', wrap(async (req, res) => {
  const { status, customerPhone } = req.body;
  if (status !== undefined && !flowFor(req.store.storeType).statuses.includes(status)) throw bad(400, 'Invalid status for this store type');
  if (customerPhone !== undefined && customerPhone !== '' && !validPhone(customerPhone)) throw bad(400, 'Customer WhatsApp number needs country code without +');
  const changes = {};
  if (status) changes.status = status;
  if (customerPhone !== undefined) changes.customerPhone = customerPhone;
  await ensureOrderStockSchema();
  const result=await updateOrderStock({sequelize,Order:Lead,Product,Ledger:OrderStockLedger,businessId:bid(req),orderId:numId(req.params.leadId,'enquiry ID'),kind:'lead',status,changes,deductStatuses:RETAIL_DEDUCT,grandfather:order=>historicalOrder('lead',order)});
  if(!result)throw bad(404,'Enquiry not found');
  const {order:lead,changed:statusChanged}=result;
  if (statusChanged) await notifyOrderSubscribers(req.store, 'lead', lead);
  if (statusChanged) void sendOrderStatusWhatsApp(req.store, lead, status);
  let url = '';
  if (status && status !== 'new' && (lead.customerPhone||lead.customerEmail)) {
    const labels = { confirmed: 'confirmed', packed: 'packed and getting ready', shipped: 'shipped', 'out-for-delivery': 'out for delivery', delivered: 'delivered. Thank you for shopping with us!', 'in-progress': 'in progress', completed: 'completed. Thank you!', cancelled: 'cancelled. Sorry for the inconvenience.' };
    const billable = !['new', 'cancelled'].includes(status), billLink = billable ? invoiceUrl(apiBase(req), 'lead', lead.id) : '';
    if (statusChanged && labels[status]) void notifyStatusChange(req.store, 'lead', lead, labels[status], undefined, billLink);
    const items = Array.isArray(lead.items) && lead.items.length ? lead.items.map(i => `${i.qty} x ${i.name}`).join(', ') : lead.productName;
    const text = `Hi! Update on your order from ${req.store.name} (${items}): your order is ${labels[status]}. Total: Rs.${Number(lead.price).toFixed(2)}${billLink ? `. Your bill: ${billLink}` : ''}`;
    url = `https://wa.me/${lead.customerPhone}?text=${encodeURIComponent(text)}`;
  }
  res.json({ lead, url });
}));



const pick = (row, ...keys) => { for (const k of keys) { const hit = Object.keys(row).find(h => h.trim().toLowerCase() === k.toLowerCase()); if (hit !== undefined && row[hit] !== '' && row[hit] !== undefined) return row[hit]; } return undefined; };
const parseVyaparDate = value => {
  if (!value) return null;
  const s = String(value).trim();
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    const d = new Date(Number(m[3].length === 2 ? `20${m[3]}` : m[3]), Number(m[2]) - 1, Number(m[1]));
    if (!Number.isNaN(d.getTime())) return d;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) { const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])); if (!Number.isNaN(d.getTime())) return d; }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};
r.post('/:storeId/products/import/preview', wrap(async(req,res)=>{
  const result=validateProductRows(req.body.rows);
  const existing=await Product.findAll({where:{businessId:bid(req)}});
  const names=new Set(existing.map(p=>p.name.toLowerCase()));
  res.json({digest:result.digest,errors:result.errors,newCount:result.rows.filter(p=>!names.has(p.name.toLowerCase())).length,existingCount:result.rows.filter(p=>names.has(p.name.toLowerCase())).length,preview:result.rows.slice(0,20).map(p=>({...p,action:names.has(p.name.toLowerCase())?'Skip existing':'Create'}))});
}));
r.post('/:storeId/products/import/commit', wrap(async(req,res)=>{
  const result=validateProductRows(req.body.rows);
  if(result.errors.length) throw bad(400,'Fix every row error before importing');
  if(req.body.digest!==result.digest) throw bad(409,'Import changed. Preview the mapped file again.');
  const counts=await sequelize.transaction(async transaction=>{
    // Serializes imports on this store; repeat clicks skip rows rather than duplicate them.
    await Business.findByPk(bid(req),{transaction,lock:transaction.LOCK.UPDATE});
    const existing=await Product.findAll({where:{businessId:bid(req)},transaction});
    const names=new Set(existing.map(p=>p.name.toLowerCase())); let created=0,skipped=0;
    for(const row of result.rows){
      if(names.has(row.name.toLowerCase())){skipped++;continue;}
      const [category]=await Category.findOrCreate({where:{businessId:bid(req),slug:slugify(row.category)},defaults:{name:row.category},transaction});
      await Product.create({businessId:bid(req),categoryId:category.id,name:row.name,price:row.price,stock:row.stock,description:row.description,active:true},{transaction});
      names.add(row.name.toLowerCase());created++;
    }
    return {created,skipped};
  });
  res.json(counts);
}));

r.post('/:storeId/import/vyapar', wrap(async (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows.slice(0, 2000) : [];
  if (!rows.length) throw bad(400, 'No rows found in the file');
  const isSales = rows.some(row => pick(row, 'Invoice No', 'Invoice Number', 'InvoiceNo') !== undefined || pick(row, 'Date', 'Invoice Date') !== undefined);
  const result = { type: isSales ? 'sales' : 'items', created: 0, updated: 0, skipped: 0 };
  if (isSales) {
    const invoices = new Map();
    for (const row of rows) {
      const name = String(pick(row, 'Item Name', 'ItemName', 'Product Name', 'Particulars') || '').trim();
      if (!name) { result.skipped += 1; continue; }
      const invNo = String(pick(row, 'Invoice No', 'Invoice Number', 'InvoiceNo') || '').trim();
      const key = invNo || `row-${invoices.size}`;
      const qty = Math.max(1, Math.round(Number(pick(row, 'Quantity', 'Qty')) || 1));
      const price = Number(String(pick(row, 'Price/Unit', 'Price', 'Sale Price', 'Rate') || '0').replace(/[^0-9.]/g, '')) || 0;
      if (!invoices.has(key)) invoices.set(key, { date: parseVyaparDate(pick(row, 'Date', 'Invoice Date')), items: [] });
      invoices.get(key).items.push({ name: name.slice(0, 120), qty, price });
    }
    for (const [invNo, invoice] of invoices) {
      const source = `vyapar:${req.store.id}:${invNo}`;
      if (await Lead.findOne({ where: { businessId: bid(req), source } })) { result.skipped += 1; continue; }
      const total = invoice.items.reduce((sum, i) => sum + i.qty * i.price, 0);
      const lead = await Lead.create({ businessId: bid(req), productId: null, productName: (n => `${n} item${n === 1 ? '' : 's'}`)(invoice.items.reduce((s, i) => s + i.qty, 0)), price: total, items: invoice.items, status: 'delivered', source });
      if (invoice.date) await lead.update({ createdAt: invoice.date });
      result.created += 1;
    }
  } else {
    const fallbackCategory = async name => {
      const catName = String(name || 'Imported').trim().slice(0, 80) || 'Imported';
      const slug = slugify(catName) || 'imported';
      const [category] = await Category.findOrCreate({ where: { businessId: bid(req), slug }, defaults: { name: catName } });
      return category;
    };
    for (const row of rows) {
      const name = String(pick(row, 'Item Name', 'ItemName', 'Product Name', 'Name') || '').trim();
      if (!name) { result.skipped += 1; continue; }
      const price = Number(String(pick(row, 'Sale Price', 'Price', 'MRP', 'Price/Unit') || '0').replace(/[^0-9.]/g, ''));
      if (!validPrice(price)) { result.skipped += 1; continue; }
      const stockRaw = pick(row, 'Stock Quantity', 'Stock Qty', 'Quantity', 'Stock');
      const stock = stockRaw === undefined ? null : Math.max(0, Math.round(Number(stockRaw) || 0));
      const category = await fallbackCategory(pick(row, 'Category', 'Category Name'));
      const existing = await Product.findOne({ where: { businessId: bid(req), name: name.slice(0, 120) } });
      if (existing) {
        await existing.update({ price, ...(stock !== null ? { stock } : {}), categoryId: category.id });
        result.updated += 1;
      } else {
        await Product.create({ businessId: bid(req), categoryId: category.id, name: name.slice(0, 120), price, stock, description: String(pick(row, 'Description', 'Item Description') || '').slice(0, 2000), active: true });
        result.created += 1;
      }
    }
  }
  res.json(result);
}));

const csvCell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
r.get('/:storeId/export/vyapar.csv', wrap(async (req, res) => {
  const leads = await Lead.findAll({ where: { businessId: bid(req), status: { [sequelize.Sequelize.Op.ne]: 'cancelled' } }, order: [['createdAt', 'ASC']], limit: 5000 });
  const rows = [['Date', 'Invoice No', 'Party Name', 'Party Phone', 'Item Name', 'Quantity', 'Unit', 'Price/Unit', 'Total', 'Order Status', 'Notes'].join(',')];
  for (const lead of leads) {
    const date = new Date(lead.createdAt).toLocaleDateString('en-IN');
    const items = Array.isArray(lead.items) && lead.items.length ? lead.items : [{ name: lead.productName, qty: 1, price: lead.price }];
    for (const item of items) {
      rows.push([csvCell(date), csvCell(`DD-${lead.id}`), csvCell(lead.customerPhone ? 'WhatsApp Customer' : 'WhatsApp Customer'), csvCell(lead.customerPhone || ''), csvCell(item.name), csvCell(Number(item.qty) || 1), csvCell('PCS'), csvCell((Number(item.price) || 0).toFixed(2)), csvCell(((Number(item.qty) || 1) * (Number(item.price) || 0)).toFixed(2)), csvCell(lead.status), csvCell('Ordered via WhatsApp storefront')].join(','));
    }
    const subtotal = items.reduce((sum, item) => sum + (Number(item.qty) || 1) * (Number(item.price) || 0), 0);
    const discount = Math.max(0, Number(lead.discount) || 0);
    const delivery = Math.max(0, Number(lead.price) - subtotal + discount);
    const adjustment = (name, amount) => rows.push([csvCell(date), csvCell(`DD-${lead.id}`), csvCell('WhatsApp Customer'), csvCell(lead.customerPhone || ''), csvCell(name), csvCell(1), csvCell('ADJUSTMENT'), csvCell(amount.toFixed(2)), csvCell(amount.toFixed(2)), csvCell(lead.status), csvCell('Order adjustment, not a product or tax invoice')].join(','));
    if (discount) adjustment(`Coupon discount${lead.couponCode ? ` (${lead.couponCode})` : ''}`, -discount);
    if (delivery) adjustment('Delivery charge', delivery);
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="vyapar-sales-${req.store.slug}.csv"`);
  res.send(`\uFEFF${rows.join('\n')}`);
}));

r.get('/:storeId/order-push-subscription', wrap(async (req, res) => {
  const endpoint = String(req.query.endpoint || '');
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000) return res.json({ enrolled: false });
  res.json({ enrolled: Boolean(await OwnerPushSubscription.findOne({ where: { businessId: bid(req), endpoint } })) });
}));
r.post('/:storeId/order-push-subscription', wrap(async (req, res) => {
  const push = req.body || {};
  if (typeof push.endpoint !== 'string' || !/^https:\/\//.test(push.endpoint) || push.endpoint.length > 1000 || !push.keys || typeof push.keys.p256dh !== 'string' || typeof push.keys.auth !== 'string' || push.keys.p256dh.length > 300 || push.keys.auth.length > 300) throw bad(400, 'Invalid push subscription');
  const [row, created] = await OwnerPushSubscription.findOrCreate({ where: { endpoint: push.endpoint }, defaults: { businessId: bid(req), userId: req.user.id, keys: push.keys } });
  if (!created) await row.update({ businessId: bid(req), userId: req.user.id, keys: push.keys });
  res.status(201).json({ ok: true });
}));
r.delete('/:storeId/order-push-subscription', wrap(async (req, res) => {
  const endpoint = String(req.body?.endpoint || '');
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000) throw bad(400, 'Invalid push subscription');
  await OwnerPushSubscription.destroy({ where: { businessId: bid(req), endpoint } });
  res.status(204).end();
}));
r.get('/:storeId/push-subscribers', wrap(async (req, res) => {
  res.json({ subscribers: await PushSubscription.count({ where: { businessId: bid(req) } }) });
}));
const pushLink = (store, raw) => {
  const text = String(raw || '').trim();
  if (!text) return '';
  const base = (process.env.CLIENT_URL || '').split(',').map(u => u.trim()).filter(Boolean);
  const hosts = new Set([...base.map(u => { try { return new URL(u).host; } catch { return ''; } }), 'digitalshop.website', 'www.digitalshop.website']);
  let url;
  try { url = new URL(text, 'https://digitalshop.website'); } catch { throw bad(400, 'Link is not valid'); }
  const own = `/store/${store.slug}`;
  const ok = ['https:', 'http:'].includes(url.protocol) && (/^\//.test(text) || hosts.has(url.host) || url.host.endsWith('.digitaldukaan.space')) && (url.pathname === own || url.pathname.startsWith(`${own}/`));
  if (!ok) throw bad(400, 'Link must open a page of this shop');
  return `${url.pathname}${url.search}`.slice(0, 300);
};
r.post('/:storeId/push-broadcast', wrap(async (req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) throw bad(500, 'Push notifications are not configured');
  const title = String(req.body.title || '').trim().slice(0, 80);
  const bodyText = String(req.body.body || '').trim().slice(0, 200);
  if (!title || !bodyText) throw bad(400, 'Title and message required');
  let target = pushLink(req.store, req.body.link);
  if (!target && req.body.productId) {
    const product = await Product.findOne({ where: { id: numId(req.body.productId), businessId: bid(req) } });
    if (!product) throw bad(400, 'Product not found in this shop');
    target = `/store/${req.store.slug}/product/${product.id}`;
  }
  const subs = await PushSubscription.findAll({ where: { businessId: bid(req) } });
  const payload = JSON.stringify({ title, body: bodyText, url: target || `/store/${req.store.slug}`, ...(pushImage(req.store, req.body.image) ? { image: pushImage(req.store, req.body.image) } : {}) });
  let sent = 0, gone = 0;
  await Promise.all(subs.map(async sub => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload);
      sent += 1;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) { gone += 1; await sub.destroy(); }
    }
  }));
  res.json({ sent, gone, total: subs.length });
}));

r.get('/:storeId/referrals', ownerOnly, wrap(async(req,res)=>res.json(await ownerList(Referral,'referrals',req,{businessId:bid(req)},['code','referrerPhone','referredPhone']))));
r.post('/:storeId/referrals', ownerOnly, wrap(async (req, res) => {
  const phone = String(req.body?.referrerPhone || '').trim();
  if (!validPhone(phone)) throw bad(400, 'Referrer phone needs a country code');
  const code = `FR${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
  const referral = await Referral.create({ businessId: bid(req), code, referrerPhone:phone, status:'pending' });
  res.status(201).json({ referral, shareUrl:`${process.env.STORE_SUBDOMAINS_READY === 'true' ? 'https://' + storeDomain(req.store.slug) : clientBase() + '/store/' + req.store.slug}?ref=${code}` });
}));
r.post('/:storeId/referrals/:id/confirm', ownerOnly, wrap(async (req, res) => {
  const referral = await Referral.findOne({ where:{ id:numId(req.params.id), businessId:bid(req), status:'pending' } });
  if (!referral) throw bad(404, 'Pending referral not found');
  const referredPhone = String(req.body?.referredPhone || '').trim(), orderKind = req.body?.orderKind, orderId = numId(req.body?.orderId);
  if (!validPhone(referredPhone) || referredPhone === referral.referrerPhone) throw bad(400, 'Enter the distinct referred customer phone');
  if (!['retail','restaurant'].includes(orderKind)) throw bad(400, 'Choose a valid order type');
  const Order = orderKind === 'retail' ? Lead : RestaurantOrder;
  const order = await Order.findOne({ where:{ id:orderId, businessId:bid(req), referralCode:referral.code } });
  if (!order || !(orderKind === 'retail' ? ['confirmed','packed','shipped','out-for-delivery','delivered','in-progress','completed'].includes(order.status) : RESTAURANT_DEDUCT.includes(order.status))) throw bad(400, 'Find a confirmed order linked to this referral first');
  if (!order.customerPhone || String(order.customerPhone).replace(/\D/g, '') !== referredPhone) throw bad(400, 'A matching customer phone must be attached to the confirmed order');
  const [changed] = await Referral.update({ status:'confirmed', referredPhone, orderId, orderKind }, { where:{ id:referral.id, businessId:bid(req), status:'pending' } });
  if (!changed) throw bad(409, 'Referral was already confirmed');
  res.json({ ok:true });
}));

r.post('/:storeId/referrals/:id/redeem', ownerOnly, wrap(async (req, res) => {
  const referral = await Referral.findOne({ where:{ id:numId(req.params.id), businessId:bid(req), status:'confirmed' } });
  if (!referral) throw bad(404, 'Confirmed referral not found');
  const side = req.body?.side;
  if (!['referrer','referred'].includes(side)) throw bad(400, 'Select referrer or referred');
  const field = side === 'referrer' ? 'referrerRewardUsed' : 'referredRewardUsed';
  const [changed] = await Referral.update({ [field]:true }, { where:{ id:referral.id, businessId:bid(req), status:'confirmed', [field]:false } });
  if (!changed) throw bad(409, 'Reward already marked used');
  res.json({ ok:true });
}));

r.get('/:storeId/coupons', wrap(async(req,res)=>res.json(await ownerList(Coupon,'coupons',req,{businessId:bid(req)},['code']))));
r.post('/:storeId/coupons', wrap(async (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase();
  const percentOff = Number(req.body?.percentOff);
  if (!/^[A-Z0-9-]{3,24}$/.test(code) || !Number.isInteger(percentOff) || percentOff < 1 || percentOff > 90) throw bad(400, 'Code must be 3-24 letters/numbers and discount 1-90%');
  const [coupon, created] = await Coupon.findOrCreate({ where: { businessId: bid(req), code }, defaults: { percentOff, active: true } });
  if (!created) throw bad(409, 'Coupon code already exists');
  res.status(201).json({ coupon });
}));
r.patch('/:storeId/coupons/:id', wrap(async (req, res) => {
  if (typeof req.body?.active !== 'boolean') throw bad(400, 'Active must be true or false');
  const coupon = await Coupon.findOne({ where: { businessId: bid(req), id: numId(req.params.id) } });
  if (!coupon) throw bad(404, 'Coupon not found');
  await coupon.update({ active: req.body.active });
  res.json({ coupon });
}));

const salesReport = async req => {
  const where = { businessId: bid(req), ...dateWhere(req.query, sequelize.Sequelize.Op) };
  const counts=await Promise.all([Lead.count({where}),RestaurantOrder.count({where})]);
  if(counts.some(n=>n>50000)) throw bad(400,'Choose a smaller date range (maximum 50,000 records per type).');
  const [leads, orders] = await Promise.all([Lead.findAll({where,order:[['createdAt','DESC']]}),RestaurantOrder.findAll({where,order:[['createdAt','DESC']]})]);
  const movement = new Set(saleRows(orders,leads).flatMap(o=>(o.items || []).map(i=>i.name)));
  const products = isLocked(req.store,'products') ? [] : await Product.findAll({where:{businessId:bid(req),active:true}});
  const bills = req.store.storeType === 'restaurant' ? await billsSummary(req.store, req.query.from ? new Date(req.query.from) : null, req.query.to ? new Date(new Date(req.query.to).getTime() + 86400000) : null).catch(() => null) : null;
  return { ...summarize(orders,leads), bills, insights: insights(orders,leads), noMovement:products.filter(p=>Number(p.stock)>0 && !movement.has(p.name)).map(p=>({id:p.id,name:p.name,stock:p.stock,price:p.price})), from: req.query.from || null, to: req.query.to || null };
};
r.get('/:storeId/sales-summary', wrap(async (req,res) => res.json(await salesReport(req))));
r.get('/:storeId/sales-summary/report.csv', wrap(async (req,res) => {
  const report = await salesReport(req);
  const rows = [['Digital Shop recorded sales report',req.store.name],['From (IST)',report.from || 'All time'],['Through (IST)',report.to || 'All time'],['Important',report.caveat],['Recorded total INR',report.recordedTotal],['Served orders',report.completedOrders],['Average served order INR',report.averageOrder],['Pending restaurant orders',report.restaurantPending],['Cancelled restaurant orders',report.cancelledOrders],['WhatsApp requests (not sales)',report.whatsappEnquiries],[],['Date (IST)','Recorded total INR','Served orders'],...report.daily.map(d=>[d.date,d.total,d.orders]),[],['Item','Units in served orders','Item value INR (before discounts/delivery)'],...report.topProducts.map(p=>[p.name,p.quantity,p.itemValue]),[],['No recorded movement (not proof of unsold stock)','Stock','Listed price INR'],...report.noMovement.map(p=>[p.name,p.stock,p.price])];
  res.type('text/csv').attachment(`sales-report-${req.store.slug}.csv`).send('\uFEFF'+rows.map(row=>row.map(reportCell).join(',')).join('\r\n'));
}));
r.get('/:storeId/restaurant-orders', wrap(async (req,res) => {
  if(req.store.storeType !== 'restaurant') throw bad(404,'Restaurant orders unavailable');
  res.json(await orderPage(req,RestaurantOrder,'restaurant'));
}));
r.get('/:storeId/restaurant-orders/report.csv', wrap(async (req,res) => {
  if(req.store.storeType !== 'restaurant') throw bad(404,'Restaurant orders unavailable');
  const where=listWhere(req,'restaurant');
  if(await RestaurantOrder.count({where}) > 10000) throw bad(400,'Choose a smaller date range (maximum 10,000 orders per report)');
  res.type('text/csv').attachment(`table-orders-${req.store.slug}.csv`).send(ordersCsv(await RestaurantOrder.findAll({where,order:[['createdAt','DESC'],['id','DESC']]}),'restaurant'));
}));

r.patch('/:storeId/restaurant-orders/:id', wrap(async (req, res) => {
  if (req.store.storeType !== 'restaurant') throw bad(404, 'Restaurant orders unavailable');
  if (!ORDER_FLOWS.restaurant.statuses.includes(req.body?.status)) throw bad(400, 'Invalid order status');
  const existing = await RestaurantOrder.findOne({ where: { id: numId(req.params.id), businessId: bid(req) } });
  if (!existing) throw bad(404, 'Order not found');
  if (!restaurantStatusAllowed(existing.orderType, req.body.status, existing.status)) throw bad(400, `A ${existing.orderType} order cannot be set to ${req.body.status}`);
  await ensureOrderStockSchema();
  const result=await updateOrderStock({sequelize,Order:RestaurantOrder,Product,Ledger:OrderStockLedger,businessId:bid(req),orderId:numId(req.params.id),kind:'restaurant',status:req.body.status,deductStatuses:RESTAURANT_DEDUCT,grandfather:order=>historicalOrder('restaurant',order)});
  if(!result)throw bad(404,'Order not found');
  const {order,changed}=result;
  if (changed) await notifyOrderSubscribers(req.store, 'restaurant', order);
  if (changed && RESTAURANT_STATUS_TEXT[order.status]) void notifyStatusChange(req.store, 'restaurant', order, RESTAURANT_STATUS_TEXT[order.status]);
  res.json({ order });
}));


// Staff-created order (phone / walk-in / no QR). Lands in Kitchen exactly like a customer order (status new, same table/channel rules).
r.post('/:storeId/restaurant-orders', wrap(async (req, res) => {
  if (req.store.storeType !== 'restaurant') throw bad(404, 'Restaurant orders unavailable');
  const { orderType, tableNumber, customerName, customerPhone, deliveryAddress } = req.body || {};
  if (!['dine-in', 'takeaway', 'delivery'].includes(orderType)) throw bad(400, 'Select order type');
  const table = Number(tableNumber);
  if (orderType === 'dine-in' && (!Number.isInteger(table) || table < 1 || table > 1000)) throw bad(400, 'Select a valid table number');
  const name = String(customerName ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 100);
  const phone = String(customerPhone ?? '').trim().slice(0, 20);
  if (orderType !== 'dine-in' && !name) throw bad(400, 'Enter the customer name');
  if (phone && !/^[+\d()\s-]{8,25}$/.test(phone)) throw bad(400, 'Phone number looks wrong');
  if (orderType === 'delivery' && (!phone || !String(deliveryAddress ?? '').trim())) throw bad(400, 'Delivery needs a phone and an address');
  const raw = Array.isArray(req.body?.items) ? req.body.items : [];
  if (raw.length < 1 || raw.length > 50) throw bad(400, 'Add at least one item');
  const ids = [...new Set(raw.map(e => Number(e?.id)))];
  if (raw.some(e => !Number.isInteger(Number(e?.id)) || Number(e.id) < 1 || !Number.isInteger(Number(e?.qty)) || Number(e.qty) < 1 || Number(e.qty) > 99)) throw bad(400, 'Invalid items');
  const { Op: SOp } = sequelize.Sequelize;
  const products = await Product.findAll({ where: { id: { [SOp.in]: ids }, businessId: req.store.id, active: true } });
  if (products.length !== ids.length) throw bad(400, 'An item is not on the menu');
  const byId = new Map(products.map(p => [p.id, p]));
  const merged = new Map();
  for (const e of raw) merged.set(Number(e.id), (merged.get(Number(e.id)) || 0) + Number(e.qty));
  const items = [...merged].map(([id, qty]) => { const p = byId.get(id); if (p.stock === 0 || (p.stock !== null && qty > p.stock)) throw bad(400, `${p.name}: not enough stock`); return buildLine(p, { id, qty }, qty); });
  const subtotal = Number(items.reduce((a, i) => a + Number(i.price) * i.qty, 0).toFixed(2));
  const note = cleanNote(req.body?.note, 200);
  const order = await RestaurantOrder.create({ businessId: req.store.id, orderType, tableNumber: orderType === 'dine-in' ? table : null, customerName: name || null, customerPhone: phone || null, deliveryAddress: orderType === 'delivery' ? String(deliveryAddress).trim().slice(0, 500) : null, items, subtotal, discount: 0, deliveryFee: 0, total: subtotal, note: note ? `[Staff] ${note}`.slice(0, 300) : '[Staff] entered by staff', status: 'new' });
  res.status(201).json({ order });
}));
// Tables view: live status per table/channel, settle a bill (append-only history).
const restaurantOnly = req => { if (req.store.storeType !== 'restaurant') throw bad(404, 'Tables unavailable'); };
r.get('/:storeId/tables', wrap(async (req, res) => { restaurantOnly(req); res.json(await tablesState(req.store)); }));
r.get('/:storeId/tables/history', wrap(async (req, res) => { restaurantOnly(req); res.json(await billHistory(req.store, req.query)); }));
r.post('/:storeId/table-bills', wrap(async (req, res) => {
  restaurantOnly(req);
  await ensureOrderStockSchema();
  const doneFor = o => (o.orderType === 'dine-in' ? 'served' : o.orderType === 'delivery' ? 'delivered' : 'picked-up');
  const out = await settleBill(req.store, req.body, async o => {
    if (RESTAURANT_DONE.includes(o.status)) return;
    await updateOrderStock({ sequelize, Order: RestaurantOrder, Product, Ledger: OrderStockLedger, businessId: bid(req), orderId: o.id, kind: 'restaurant', status: doneFor(o), deductStatuses: RESTAURANT_DEDUCT, grandfather: order => historicalOrder('restaurant', order) });
  });
  res.status(201).json(out);
}));
// Waiter / bill requests raised from a table QR. Staff with order access can see and clear them.
r.get('/:storeId/table-requests', wrap(async (req, res) => {
  if (req.store.storeType !== 'restaurant') throw bad(404, 'Table requests unavailable');
  res.json({ requests: await TableRequest.findAll({ where: { businessId: bid(req), status: 'open' }, order: [['createdAt', 'ASC']], limit: 100 }) });
}));
r.patch('/:storeId/table-requests/:id', wrap(async (req, res) => {
  if (req.store.storeType !== 'restaurant') throw bad(404, 'Table requests unavailable');
  const [changed] = await TableRequest.update({ status: 'done' }, { where: { id: numId(req.params.id), businessId: bid(req), status: 'open' } });
  res.json({ ok: true, changed });
}));
export default r;
