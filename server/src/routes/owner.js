import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { uploadImageKit } from '../utils/imagekit.js';
import { registerStoreDomain, storeDomain, storeUrl } from '../utils/store-domain.js';
import QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import { whatsappCloudOwnerRoutes } from '../whatsapp-cloud.js';
import { crmRoutes } from '../crm.js';
import webpush from 'web-push';
import { flowFor } from '../order-flows.js';
import { featureForOwnerRoute, isLocked } from '../feature-locks.js';
import { sequelize, Business, User, Category, Product, Lead, PushSubscription, RestaurantOrder, OrderPushSubscription, Coupon, Referral } from '../models/index.js';
import { validateProductRows } from '../product-import.js';
import { dateWhere, dateWindow, summarize, ordersCsv, csvCell as reportCell } from '../reporting.js';
import { auth, roles } from '../middleware/auth.js';
import { bad, slugify, validEmail, validPhone, validPrice, wrap } from '../utils/core.js';

const r = Router();
import { restoreDeadline } from '../retention.js';
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
    const allowed = (req.method === 'GET' && /^(?:overview|shop-qr\.pdf|restaurant-orders(?:\/report\.csv)?|whatsapp-cloud\/(?:status|messages))$/.test(route)) || (req.method === 'PATCH' && /^restaurant-orders\/\d+$/.test(route)) || (req.method === 'POST' && (route === 'whatsapp-cloud/send' || /^(?:products\/import|customers\/import)\/(?:preview|commit)$/.test(route)));
    if (!allowed) throw bad(403, 'Staff access is read-only except restaurant order status');
  }
  const lockedFeature = featureForOwnerRoute(req.method, req.path);
  if (lockedFeature && isLocked(req.store, lockedFeature)) throw bad(403, 'Kindly contact admin to enable this feature.');
  next();
}));

r.use('/:storeId/whatsapp-cloud', whatsappCloudOwnerRoutes); // owner owns connect/manage; staff may read the inbox and send reviewed replies (allow-list above)
r.use('/:storeId/customers', (req,res,next)=>req.user.role === 'staff' && !/^\/import\/(preview|commit)$/.test(req.path) ? res.status(403).json({error:'Staff can preview and import customers only.'}) : next(), crmRoutes);

r.delete('/:storeId', ownerOnly, wrap(async (req, res) => {
  if (req.body?.slug !== req.store.slug) throw bad(400, 'Enter the exact store link to remove it');
  const deletedAt = new Date();
  await req.store.update({ active: false, deletedAt, wasActiveBeforeDelete: req.store.active });
  res.json({ removed: true, slug: req.store.slug, restoreUntil: restoreUntil(deletedAt) });
}));
r.get('/:storeId/staff', ownerOnly, wrap(async (req, res) => res.json({ staff: (await User.findAll({ where: { managerId: req.user.id, staffBusinessId: bid(req), role: 'staff' } })).map(u => ({ id:u.id, name:u.name, email:u.email, active:u.active })) })));
r.post('/:storeId/staff', ownerOnly, wrap(async (req, res) => {
  const name = String(req.body?.name || '').trim(), email = String(req.body?.email || '').trim().toLowerCase(), password = req.body?.password;
  if (!name || name.length > 100 || !validEmail(email) || typeof password !== 'string' || password.length < 12 || password.length > 128) throw bad(400, 'Name, valid email and a temporary password of at least 12 characters are required');
  const passwordHash = await bcrypt.hash(password, 12);
  const staff = await User.create({ name, email, passwordHash, role:'staff', managerId:req.user.id, staffBusinessId:bid(req), active:true });
  res.status(201).json({ staff:{ id:staff.id, name:staff.name, email:staff.email, active:true } });
}));
r.patch('/:storeId/staff/:id', ownerOnly, wrap(async (req, res) => {
  if (typeof req.body?.active !== 'boolean') throw bad(400, 'Active must be true or false');
  const staff = await User.findOne({ where: { id:numId(req.params.id), managerId:req.user.id, staffBusinessId:bid(req), role:'staff' } });
  if (!staff) throw bad(404, 'Staff not found');
  await staff.update({ active:req.body.active });
  res.json({ staff:{ id:staff.id, name:staff.name, email:staff.email, active:staff.active } });
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

const EDITABLE = ['name', 'description', 'location', 'whatsapp', 'bannerText', 'bannerActive', 'offerPopupActive', 'offerPopupText', 'offerPopupTitle', 'offerPopupCtaText', 'offerPopupCtaUrl', 'offerPopupImageUrl', 'isOpen', 'openingHours', 'deliveryCharge', 'freeDeliveryAbove', 'logoUrl', 'coverUrl', 'accentColor', 'upiId', 'gstin', 'minOrder', 'storeType', 'tableCount'];
r.patch('/:storeId/business', wrap(async (req, res) => {
  const changes = {};
  for (const key of EDITABLE) if (Object.hasOwn(req.body, key)) changes[key] = req.body[key];
  if (changes.storeType !== undefined && !['retail', 'restaurant', 'services'].includes(changes.storeType)) throw bad(400, 'Invalid store type');
  if (changes.tableCount !== undefined && (!Number.isInteger(Number(changes.tableCount)) || Number(changes.tableCount) < 0 || Number(changes.tableCount) > 100)) throw bad(400, 'Table count must be 0-100');
  if ((changes.storeType || req.store.storeType) === 'restaurant' && Number(changes.tableCount ?? req.store.tableCount) < 1) throw bad(400, 'Restaurant needs at least one table');
  if (changes.storeType && changes.storeType !== 'restaurant') changes.tableCount = 0;
  if (changes.name !== undefined && (typeof changes.name !== 'string' || !changes.name.trim())) throw bad(400, 'Shop name required');
  if (changes.whatsapp !== undefined && !validPhone(changes.whatsapp)) throw bad(400, 'WhatsApp number needs country code without +');
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
  if (changes.offerPopupImageUrl !== undefined && changes.offerPopupImageUrl && (!/^https:\/\/ik\.imagekit\.io\//.test(changes.offerPopupImageUrl) || changes.offerPopupImageUrl.length > 255)) throw bad(400, 'Use an ImageKit image');
  for (const key of ['bannerActive', 'offerPopupActive', 'isOpen']) if (changes[key] !== undefined) changes[key] = Boolean(changes[key]);
  if (changes.accentColor !== undefined && !/^$|^#[0-9a-fA-F]{6}$/.test(changes.accentColor)) throw bad(400, 'Accent color must be a hex color like #0e9f6e');
  if (changes.upiId !== undefined) changes.upiId = String(changes.upiId || '').slice(0, 60);
  if (changes.gstin !== undefined) {
    changes.gstin = String(changes.gstin || '').toUpperCase().trim();
    if (changes.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(changes.gstin)) throw bad(400, 'Enter a valid 15-character GSTIN or leave it blank');
  }
  await req.store.update(changes);
  res.json({ business: req.store });
}));

r.get('/:storeId/categories', wrap(async (req, res) => res.json({ categories: await Category.findAll({ where: { businessId: bid(req) }, order: [['name', 'ASC']] }) })));
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
r.get('/:storeId/products', wrap(async (req, res) => res.json({ products: await Product.findAll({ where: { businessId: bid(req) }, include: [categoryInclude], order: [['createdAt', 'DESC']] }) })));

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
  res.status(201).json({ product: await Product.create({ ...fields, businessId: bid(req) }) });
}));
r.patch('/:storeId/products/:id', wrap(async (req, res) => {
  const fields = await productFields(req);
  const product = await Product.findOne({ where: { id: numId(req.params.id, 'product ID'), businessId: bid(req) } });
  if (!product) throw bad(404, 'Product not found');
  await product.update(fields);
  res.json({ product });
}));
r.delete('/:storeId/products/:id', wrap(async (req, res) => {
  const product = await Product.findOne({ where: { id: numId(req.params.id, 'product ID'), businessId: bid(req) } });
  if (!product) throw bad(404, 'Product not found');
  await product.destroy();
  res.status(204).end();
}));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_, file, done) => done(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) });
r.post('/:storeId/upload', upload.single('image'), wrap(async (req, res) => {
  if (!req.file) throw bad(400, 'Choose a JPEG, PNG or WebP image under 5 MB');
  if (process.env.IMAGEKIT_PRIVATE_KEY) {
    const imageUrl = await uploadImageKit(req.file.buffer, `${randomUUID()}${({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' })[req.file.mimetype]}`, `${process.env.IMAGEKIT_UPLOAD_ROOT || "/digital-dukaan"}/${bid(req)}`);
    return res.status(201).json({ imageUrl });
  }
  if (process.env.VERCEL) throw bad(503, 'Image hosting is not configured');
  const ext = ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' })[req.file.mimetype] || '';
  const name = `${randomUUID()}${ext}`;
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), req.file.buffer);
  res.status(201).json({ imageUrl: `/uploads/${name}` });
}));

const listWhere = (req, kind) => {
  const Op = sequelize.Sequelize.Op;
  const where = { businessId: bid(req), ...dateWhere(req.query, Op) };
  const statuses = kind === 'restaurant' ? ['new','preparing','served','cancelled'] : ['new','confirmed','packed','shipped','out-for-delivery','delivered','in-progress','completed','cancelled'];
  if (req.query.status && req.query.status !== 'all') { if (!statuses.includes(req.query.status)) throw bad(400, 'Invalid order status'); where.status = req.query.status; }
  const q = String(req.query.q || '').trim().slice(0,100);
  if (q) { const escaped = q.replace(/[\\%_]/g, '\\$&'); where[Op.or] = [{ customerPhone: { [Op.iLike]: `%${escaped}%` } }, { [kind === 'restaurant' ? 'customerName' : 'productName']: { [Op.iLike]: `%${escaped}%` } }]; if (/^#?\d+$/.test(q)) where[Op.or].push({ id: Number(q.replace('#','')) }); }
  return where;
};
const orderPage = async (req, Model, kind) => {
  const page = Number(req.query.page || 1);
  if(!Number.isSafeInteger(page) || page<1 || page>100000) throw bad(400,'Invalid page');
  const limit = req.query.page ? 50 : kind === 'restaurant' ? 200 : 500;
  const { rows, count } = await Model.findAndCountAll({ where: listWhere(req, kind), order: [['createdAt','DESC'],['id','DESC']], limit, offset: (page-1)*limit });
  return { [kind === 'restaurant' ? 'orders':'leads']: rows, total: count, page, pageSize: limit };
};
r.get('/:storeId/shop-qr.pdf', wrap(async(req,res)=>{
  // Same canonical URL helper as public storefront QR; no guessed hostname.
  const url = process.env.STORE_SUBDOMAINS_READY === 'true' ? storeUrl(req.store.slug) : `${(process.env.CLIENT_URL || '').split(',')[0].replace(/\/$/, '')}/store/${req.store.slug}`;
  if(!/^https?:\/\//.test(url)) throw bad(503,'Shop link is not configured. Kindly contact admin.');
  const png=await QRCode.toBuffer(url,{type:'png',width:1024,margin:4,errorCorrectionLevel:'H'});
  const doc=new PDFDocument({size:'A4',margin:50});
  res.type('application/pdf').attachment(`${req.store.slug}-shop-qr.pdf`);doc.pipe(res);
  doc.registerFont('ShopText',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../fonts/DejaVuSans.ttf'));doc.font('ShopText');
  doc.fontSize(16).fillColor('#0e9f6e').text('DIGITAL DUKAAN',{align:'center'});doc.moveDown();doc.fontSize(28).fillColor('#162b1d').text(req.store.name,{align:'center'});doc.moveDown();doc.fontSize(16).text('Scan to browse our shop',{align:'center'});const qrTop=Math.max(220,doc.y+20);doc.image(png,137,qrTop,{width:320});doc.fontSize(11).text(url,50,qrTop+340,{align:'center',width:495});doc.fontSize(12).text('Your shop. One link away.',50,qrTop+385,{align:'center',width:495});doc.end();
}));
r.get('/:storeId/leads', wrap(async (req,res) => res.json(await orderPage(req,Lead,'whatsapp'))));
r.get('/:storeId/leads/report.csv', wrap(async (req,res) => {
  const where = listWhere(req,'whatsapp');
  if (await Lead.count({where}) > 10000) throw bad(400,'Choose a smaller date range (maximum 10,000 orders per report)');
  const orders = await Lead.findAll({where,order:[['createdAt','DESC'],['id','DESC']]});
  res.type('text/csv').attachment(`orders-${req.store.slug}.csv`).send(ordersCsv(orders,'whatsapp'));
}));

r.get('/:storeId/leads/:leadId/invoice', wrap(async (req, res) => {
  const lead = await Lead.findOne({ where: { id: numId(req.params.leadId, 'enquiry ID'), businessId: bid(req) } });
  if (!lead) throw bad(404, 'Enquiry not found');
  const shop = req.store;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="estimate-${lead.id}.pdf"`);
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  doc.pipe(res);
  doc.fontSize(20).text(shop.name, { align: 'left' });
  if (shop.location) doc.fontSize(10).fillColor('#666').text(shop.location);
  if (shop.gstin) doc.fontSize(10).fillColor('#666').text(`GSTIN: ${shop.gstin}`);
  doc.moveDown(0.5);
  doc.fontSize(13).fillColor('#000').text('ORDER ESTIMATE', { align: 'right' });
  doc.fontSize(10).fillColor('#666').text(`Estimate #${lead.id}`, { align: 'right' }).text(new Date(lead.createdAt).toLocaleString('en-IN'), { align: 'right' });
  doc.moveDown(1.5);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ddd').stroke();
  doc.moveDown(0.5);
  const items = Array.isArray(lead.items) && lead.items.length ? lead.items : [{ name: lead.productName, qty: 1, price: lead.price }];
  let y = doc.y;
  const row = (name, qty, price, amount, header = false) => {
    doc.fontSize(10).fillColor(header ? '#666' : '#000');
    doc.text(String(name), 50, y, { width: 265 });
    doc.text(String(qty), 325, y, { width: 50, align: 'right' });
    doc.text(String(price), 390, y, { width: 70, align: 'right' });
    doc.text(String(amount), 470, y, { width: 75, align: 'right' });
    y += 28;
  };
  row('ITEM', 'QTY', 'PRICE', 'AMOUNT', true);
  let subtotal = 0;
  for (const item of items) {
    if (y > 690) { doc.addPage(); y = 50; row('ITEM', 'QTY', 'PRICE', 'AMOUNT', true); }
    const qty = Number(item.qty) || 1, price = Number(item.price) || 0, amount = qty * price;
    subtotal += amount;
    row(String(item.name).slice(0, 45), qty, `Rs.${price.toFixed(2)}`, `Rs.${amount.toFixed(2)}`);
  }
  if (y > 620) { doc.addPage(); y = 50; }
  doc.moveTo(50, y).lineTo(545, y).strokeColor('#ddd').stroke(); y += 16;
  const totalRow = (label, amount) => { doc.fontSize(11).fillColor('#000').text(label, 330, y, { width:130 }); doc.text(amount, 470, y, {width:75,align:'right'}); y += 24; };
  totalRow('Subtotal', `Rs.${subtotal.toFixed(2)}`);
  const discount = Math.max(0, Number(lead.discount) || 0);
  if (discount) totalRow(`Discount${lead.couponCode ? ` (${lead.couponCode})` : ''}`, `-Rs.${discount.toFixed(2)}`);
  const delivery = Math.max(0, Number(lead.price) - subtotal + discount);
  if (Array.isArray(lead.items) && lead.items.length) totalRow('Delivery', delivery > 0 ? `Rs.${delivery.toFixed(2)}` : 'FREE');
  totalRow('Total', `Rs.${Number(lead.price).toFixed(2)}`);
  doc.fontSize(8).fillColor('#777').text('This is an estimate generated from a WhatsApp enquiry on Digital Dukaan. It is not a tax invoice. Prices confirmed on WhatsApp at order time.', 50, y + 30, { width: 495, align: 'center' });
  doc.end();
}));



// Customers opt in from their private tracking page or My Orders; the store-wide broadcast flow is untouched.
async function notifyOrderSubscribers(store, kind, order) {
  const label = flowFor(kind === 'restaurant' ? 'restaurant' : store.storeType).push[order.status];
  if (!label || !process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  try {
    const subs = await OrderPushSubscription.findAll({ where: { orderType: kind, orderId: order.id, businessId: store.id } });
    await Promise.allSettled(subs.map(async sub => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify({ title: `Order #${order.id} at ${store.name}`, body: `${label} Tap to view.`, url: sub.returnPath }));
      } catch (err) { if (err.statusCode === 404 || err.statusCode === 410) await sub.destroy(); }
    }));
  } catch (err) { console.error('Order push failed', err.message); }
}

r.post('/:storeId/leads/:leadId/status', wrap(async (req, res) => {
  const lead = await Lead.findOne({ where: { id: numId(req.params.leadId, 'enquiry ID'), businessId: bid(req) } });
  if (!lead) throw bad(404, 'Enquiry not found');
  const { status, customerPhone } = req.body;
  if (status !== undefined && !flowFor(req.store.storeType).statuses.includes(status)) throw bad(400, 'Invalid status for this store type');
  if (customerPhone !== undefined && customerPhone !== '' && !validPhone(customerPhone)) throw bad(400, 'Customer WhatsApp number needs country code without +');
  const changes = {}, statusChanged = Boolean(status) && status !== lead.status;
  if (status) changes.status = status;
  if (customerPhone !== undefined) changes.customerPhone = customerPhone;
  await lead.update(changes);
  if (statusChanged) await notifyOrderSubscribers(req.store, 'lead', lead);
  let url = '';
  if (status && status !== 'new' && lead.customerPhone) {
    const labels = { confirmed: 'confirmed', packed: 'packed and getting ready', shipped: 'shipped', 'out-for-delivery': 'out for delivery', delivered: 'delivered. Thank you for shopping with us!', 'in-progress': 'in progress', completed: 'completed. Thank you!', cancelled: 'cancelled. Sorry for the inconvenience.' };
    const items = Array.isArray(lead.items) && lead.items.length ? lead.items.map(i => `${i.qty} x ${i.name}`).join(', ') : lead.productName;
    const text = `Hi! Update on your order from ${req.store.name} (${items}): your order is ${labels[status]}. Total: Rs.${Number(lead.price).toFixed(2)}`;
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
      const lead = await Lead.create({ businessId: bid(req), productId: null, productName: `${invoice.items.reduce((s, i) => s + i.qty, 0)} items`, price: total, items: invoice.items, status: 'delivered', source });
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

r.get('/:storeId/push-subscribers', wrap(async (req, res) => {
  res.json({ subscribers: await PushSubscription.count({ where: { businessId: bid(req) } }) });
}));
r.post('/:storeId/push-broadcast', wrap(async (req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) throw bad(500, 'Push notifications are not configured');
  const title = String(req.body.title || '').trim().slice(0, 80);
  const bodyText = String(req.body.body || '').trim().slice(0, 200);
  if (!title || !bodyText) throw bad(400, 'Title and message required');
  const subs = await PushSubscription.findAll({ where: { businessId: bid(req) } });
  const payload = JSON.stringify({ title, body: bodyText, url: `/store/${req.store.slug}` });
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

r.get('/:storeId/referrals', ownerOnly, wrap(async (req, res) => res.json({ referrals: await Referral.findAll({ where: { businessId: bid(req) }, order: [['createdAt', 'DESC']], limit: 100 }) })));
r.post('/:storeId/referrals', ownerOnly, wrap(async (req, res) => {
  const phone = String(req.body?.referrerPhone || '').trim();
  if (!validPhone(phone)) throw bad(400, 'Referrer phone needs a country code');
  const code = `FR${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
  const referral = await Referral.create({ businessId: bid(req), code, referrerPhone:phone, status:'pending' });
  res.status(201).json({ referral, shareUrl:`${process.env.STORE_SUBDOMAINS_READY === 'true' ? 'https://' + storeDomain(req.store.slug) : (process.env.CLIENT_URL || '').split(',')[0].replace(/\/$/, '') + '/store/' + req.store.slug}?ref=${code}` });
}));
r.post('/:storeId/referrals/:id/confirm', ownerOnly, wrap(async (req, res) => {
  const referral = await Referral.findOne({ where:{ id:numId(req.params.id), businessId:bid(req), status:'pending' } });
  if (!referral) throw bad(404, 'Pending referral not found');
  const referredPhone = String(req.body?.referredPhone || '').trim(), orderKind = req.body?.orderKind, orderId = numId(req.body?.orderId);
  if (!validPhone(referredPhone) || referredPhone === referral.referrerPhone) throw bad(400, 'Enter the distinct referred customer phone');
  if (!['retail','restaurant'].includes(orderKind)) throw bad(400, 'Choose a valid order type');
  const Order = orderKind === 'retail' ? Lead : RestaurantOrder;
  const order = await Order.findOne({ where:{ id:orderId, businessId:bid(req), referralCode:referral.code } });
  if (!order || !(orderKind === 'retail' ? ['confirmed','packed','shipped','out-for-delivery','delivered','in-progress','completed'].includes(order.status) : ['preparing','served'].includes(order.status))) throw bad(400, 'Find a confirmed order linked to this referral first');
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

r.get('/:storeId/coupons', wrap(async (req, res) => res.json({ coupons: await Coupon.findAll({ where: { businessId: bid(req) }, order: [['createdAt', 'DESC']], limit: 100 }) })));
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
  const movement = new Set(orders.filter(o=>o.status === 'served').flatMap(o=>(o.items || []).map(i=>i.name)));
  const products = isLocked(req.store,'products') ? [] : await Product.findAll({where:{businessId:bid(req),active:true}});
  return { ...summarize(orders,leads), noMovement:products.filter(p=>Number(p.stock)>0 && !movement.has(p.name)).map(p=>({id:p.id,name:p.name,stock:p.stock,price:p.price})), from: req.query.from || null, to: req.query.to || null };
};
r.get('/:storeId/sales-summary', wrap(async (req,res) => res.json(await salesReport(req))));
r.get('/:storeId/sales-summary/report.csv', wrap(async (req,res) => {
  const report = await salesReport(req);
  const rows = [['Digital Dukaan recorded sales report',req.store.name],['From (IST)',report.from || 'All time'],['Through (IST)',report.to || 'All time'],['Important',report.caveat],['Recorded total INR',report.recordedTotal],['Served orders',report.completedOrders],['Average served order INR',report.averageOrder],['Pending restaurant orders',report.restaurantPending],['Cancelled restaurant orders',report.cancelledOrders],['WhatsApp requests (not sales)',report.whatsappEnquiries],[],['Date (IST)','Recorded total INR','Served orders'],...report.daily.map(d=>[d.date,d.total,d.orders]),[],['Item','Units in served orders','Item value INR (before discounts/delivery)'],...report.topProducts.map(p=>[p.name,p.quantity,p.itemValue]),[],['No recorded movement (not proof of unsold stock)','Stock','Listed price INR'],...report.noMovement.map(p=>[p.name,p.stock,p.price])];
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
  if (!['new', 'preparing', 'served', 'cancelled'].includes(req.body?.status)) throw bad(400, 'Invalid order status');
  const order = await RestaurantOrder.findOne({ where: { id: numId(req.params.id), businessId: bid(req) } });
  if (!order) throw bad(404, 'Order not found');
  const changed = order.status !== req.body.status;
  await order.update({ status: req.body.status });
  if (changed) await notifyOrderSubscribers(req.store, 'restaurant', order);
  res.json({ order });
}));
export default r;
