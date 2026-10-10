import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { DataTypes, Op } from 'sequelize';
import { sequelize, Business, Product, Lead, RestaurantOrder } from '../../models/index.js';
import { bad, wrap } from '../../shared/utils/core.js';
import { ownerList } from '../stores/owner-list-page.js';
import { orderPhone } from '../crm/customer-pure.js';
import { cleanReview, reviewerKey, publicName, reviewableProducts, summarize } from './reviews-pure.js';

// One row per customer per product. status 'hidden' is the admin's moderation switch; the row is kept so a
// hidden review cannot simply be re-posted. The reviewer is identified by phone (else the order), never shown.
export const Review = sequelize.define('Review', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  businessId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'businesses', key: 'id' } },
  productId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'products', key: 'id' } },
  orderKind: { type: DataTypes.STRING(12), allowNull: false },
  orderId: { type: DataTypes.INTEGER, allowNull: false },
  reviewerKey: { type: DataTypes.STRING(40), allowNull: false },
  customerName: { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },
  rating: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 5 } },
  text: { type: DataTypes.STRING(600), allowNull: false, defaultValue: '' },
  status: { type: DataTypes.STRING(8), allowNull: false, defaultValue: 'visible' }
}, { tableName: 'reviews', indexes: [{ unique: true, fields: ['productId', 'reviewerKey'], name: 'reviews_product_reviewer' }, { fields: ['businessId', 'id'] }, { fields: ['productId', 'status', 'id'] }] });
Review.belongsTo(Product, { foreignKey: 'productId' });

let ready;
export const ensureReviewsSchema = () => ready ||= (async () => {
  await Review.sync();
  await sequelize.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS "ratingAvg" double precision NOT NULL DEFAULT 0');
  await sequelize.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS "ratingCount" integer NOT NULL DEFAULT 0');
})().catch(e => { ready = null; throw e; });

// Cards read ratingAvg/ratingCount straight off the product row, so keep them current after any change.
export async function recalcProduct(productId, businessId) {
  const rows = await Review.findAll({ where: { productId, businessId, status: 'visible' }, attributes: ['rating'], raw: true });
  const { avg, count } = summarize(rows);
  await Product.update({ ratingAvg: avg, ratingCount: count }, { where: { id: productId, businessId } });
  return { avg, count };
}

const MODELS = { 'restaurant-orders': { kind: 'restaurant', model: () => RestaurantOrder }, 'lead-orders': { kind: 'lead', model: () => Lead } };
const bearer = req => req.header('authorization')?.match(/^Bearer (.+)$/)?.[1];
const numId = v => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
// Same capability the order tracking page uses: only the holder of the private tracking link can review.
function verify(token, id, kind) {
  let a;
  try { a = jwt.verify(token || '', process.env.JWT_SECRET, { audience: 'restaurant-tracking', issuer: 'digital-dukaan', algorithms: ['HS256'] }); } catch { throw bad(404, 'Order tracking link is invalid or expired'); }
  if (!id || a.orderId !== id || (a.kind || 'restaurant') !== kind) throw bad(404, 'Order tracking link is invalid or expired');
  return a;
}
async function trackedOrder(req) {
  const cfg = MODELS[req.params.segment], id = numId(req.params.id), access = verify(bearer(req), id, cfg.kind);
  const business = await Business.findOne({ where: { slug: req.params.slug, deletedAt: null } });
  if (!business || access.businessId !== business.id) throw bad(404, 'Order not found');
  const order = await cfg.model().findOne({ where: { id, businessId: business.id } });
  if (!order) throw bad(404, 'Order not found');
  return { business, order, kind: cfg.kind };
}

export const reviewPublicRoutes = Router();
reviewPublicRoutes.get('/stores/:slug/products/:id/reviews', wrap(async (req, res) => {
  const business = await Business.findOne({ where: { slug: req.params.slug, active: true, deletedAt: null } });
  const id = numId(req.params.id);
  if (!business || !id || !(await Product.findOne({ where: { id, businessId: business.id, active: true }, attributes: ['id'] }))) throw bad(404, 'Product not found');
  const cursor = req.query.cursor === undefined ? null : numId(req.query.cursor);
  if (req.query.cursor !== undefined && !cursor) throw bad(400, 'Invalid cursor');
  const where = { productId: id, businessId: business.id, status: 'visible' };
  const [all, page] = await Promise.all([
    Review.findAll({ where, attributes: ['rating'], raw: true }),
    Review.findAll({ where: cursor ? { ...where, id: { [Op.lt]: cursor } } : where, order: [['id', 'DESC']], limit: 11, attributes: ['id', 'rating', 'text', 'customerName', 'createdAt'] })
  ]);
  const rows = page.slice(0, 10);
  res.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=30');
  res.json({ summary: summarize(all), reviews: rows.map(r => ({ id: r.id, rating: r.rating, text: r.text, name: publicName(r.customerName), createdAt: r.createdAt, verified: true })), nextCursor: page.length > 10 ? String(rows.at(-1).id) : null });
}));
// What this order can review, with any review already given (so the customer can edit it).
reviewPublicRoutes.get('/stores/:slug/:segment(restaurant-orders|lead-orders)/:id/reviews', wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { business, order, kind } = await trackedOrder(req);
  const key = reviewerKey(order, kind, orderPhone(order.customerPhone));
  const items = reviewableProducts(order);
  const mine = items.length ? await Review.findAll({ where: { businessId: business.id, productId: items.map(i => i.productId), reviewerKey: key }, attributes: ['productId', 'rating', 'text', 'status'], raw: true }) : [];
  const byProduct = new Map(mine.map(r => [r.productId, r]));
  res.json({ items: items.map(i => ({ ...i, review: byProduct.has(i.productId) ? { rating: byProduct.get(i.productId).rating, text: byProduct.get(i.productId).text } : null })) });
}));
reviewPublicRoutes.post('/stores/:slug/:segment(restaurant-orders|lead-orders)/:id/reviews', wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { business, order, kind } = await trackedOrder(req);
  const productId = numId(req.body?.productId);
  if (!productId || !reviewableProducts(order).some(i => i.productId === productId)) throw bad(400, 'You can only review items from this order');
  const clean = cleanReview(req.body);
  if (clean.error) throw bad(400, clean.error);
  const key = reviewerKey(order, kind, orderPhone(order.customerPhone));
  const [row, created] = await Review.findOrCreate({ where: { productId, reviewerKey: key }, defaults: { businessId: business.id, productId, orderKind: kind, orderId: order.id, reviewerKey: key, customerName: String(order.customerName || '').slice(0, 100), rating: clean.rating, text: clean.text } });
  if (!created) await row.update({ rating: clean.rating, text: clean.text }); // editing keeps moderation status
  await recalcProduct(productId, business.id);
  res.status(created ? 201 : 200).json({ review: { rating: row.rating, text: row.text } });
}));

// Admin moderation. Owner only; every query is scoped to the store. No endpoint creates reviews for a store.
export const reviewOwnerRoutes = Router();
reviewOwnerRoutes.use((req, res, next) => req.user.role === 'owner' ? next() : res.status(403).json({ error: 'Only the store owner can manage reviews' }));
reviewOwnerRoutes.get('/', wrap(async (req, res) => {
  const where = { businessId: req.store.id };
  const vis = req.query.visibility ?? req.query.status;
  if (['visible', 'hidden'].includes(vis)) where.status = vis;
  const page = await ownerList(Review, 'reviews', req, where, ['customerName', 'text'], { include: [{ model: Product, attributes: ['name'] }] },
    r => ({ id: r.id, productId: r.productId, productName: r.Product?.name || '', rating: r.rating, text: r.text, customerName: r.customerName, status: r.status, orderKind: r.orderKind, orderId: r.orderId, createdAt: r.createdAt }));
  res.json(page);
}));
const load = async req => {
  if (!/^\d+$/.test(req.params.id)) throw bad(400, 'Invalid review ID');
  const r = await Review.findOne({ where: { id: Number(req.params.id), businessId: req.store.id } });
  if (!r) throw bad(404, 'Review not found');
  return r;
};
reviewOwnerRoutes.patch('/:id', wrap(async (req, res) => {
  const r = await load(req);
  if (!['visible', 'hidden'].includes(req.body?.status)) throw bad(400, 'Choose visible or hidden');
  await r.update({ status: req.body.status });
  await recalcProduct(r.productId, req.store.id);
  res.json({ ok: true, status: r.status });
}));
reviewOwnerRoutes.delete('/:id', wrap(async (req, res) => {
  const r = await load(req);
  await r.destroy();
  await recalcProduct(r.productId, req.store.id);
  res.json({ deleted: true });
}));
