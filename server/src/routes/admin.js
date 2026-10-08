import { platformReport,sendPlatformReport } from '../platform-email-report.js';
import { sendOwnerInvite } from '../owner-invites.js';
import { validatePasswordChange } from '../password-security.js';
import { platformSales, salesCsv, CommissionRule, ensureCommissionSchema } from '../platform-sales.js';
import { dateWindow } from '../reporting.js';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { registerStoreDomain, storeDomain } from '../utils/store-domain.js';
import { sequelize, Business, User, Product, Category, Lead, ShopRequest } from '../models/index.js';
import { auth, roles } from '../middleware/auth.js';
import { bad, slugify, validEmail, validPhone, wrap } from '../utils/core.js';
import { restoreDeadline } from '../retention.js';
import { LOCKABLE_FEATURES, LOCKABLE_KEYS, locksOf } from '../feature-locks.js';
import { alertState, saveAlertKeys, saveAlertSettings, sendAlertTest } from '../platform-alerts.js';
const r = Router();
r.use(auth, roles('superadmin'));
const numId = value => { const n = Number(value); if (!Number.isInteger(n) || n <= 0) throw bad(400, 'Invalid ID'); return n; };
r.get('/email-summary',wrap(async(req,res)=>res.json(await platformReport(req.user))));
r.post('/email-summary',wrap(async(req,res)=>{
 const report=await platformReport(req.user);
 if(req.body?.confirm!==true||req.body?.to!==report.to||req.body?.text!==report.text)throw bad(409,'Summary changed or not confirmed. Preview it again.');
 res.json(await sendPlatformReport(report));
}));
r.post('/users/:id/password', wrap(async (req, res) => {
  const problem = validatePasswordChange(req.body);
  if (problem) throw bad(400, problem);
  const admin = await User.unscoped().findByPk(req.user.id);
  if (!await bcrypt.compare(req.body.currentPassword, admin.passwordHash)) throw bad(400, 'Your superadmin password is incorrect.');
  const owner = await User.unscoped().findByPk(numId(req.params.id));
  if (!owner || owner.role !== 'owner') throw bad(404, 'Store admin not found.');
  if (req.body.ownerEmail !== owner.email) throw bad(400, 'Type the exact owner email to confirm the account.');
  if (await bcrypt.compare(req.body.newPassword, owner.passwordHash)) throw bad(400, 'Choose a different new password.');
  await owner.update({ passwordHash: await bcrypt.hash(req.body.newPassword, 12), passwordChangedAt: new Date(), passwordSetupHash:null, passwordSetupExpiresAt:null });
  res.json({ changed: true, owner: { id: owner.id, name: owner.name, email: owner.email } });
}));
r.post('/users/:id/welcome-email', wrap(async(req,res)=>{
 const user=await User.unscoped().findByPk(numId(req.params.id));
 if(!user||user.role!=='owner')throw bad(404,'Store admin not found.');
 if(req.body?.ownerEmail!==user.email||req.body?.confirm!==true)throw bad(400,'Review and confirm the owner email before sending.');
 const store=await Business.findOne({where:{ownerId:user.id,deletedAt:null},order:[['createdAt','ASC']]});
 if(!store)throw bad(400,'This owner has no store.');
 res.json({welcomeEmail:await sendOwnerInvite(user,store)});
}));
// Only the authenticated superadmin can create an owner account and its first store.
r.post('/owners', wrap(async (req, res) => {
  const { name, email, password, shopName, slug, whatsapp, storeType = 'retail', tableCount = 0 } = req.body || {};
  if (!['retail', 'restaurant', 'services'].includes(storeType) || (storeType === 'restaurant' && (!Number.isInteger(Number(tableCount)) || Number(tableCount) < 1 || Number(tableCount) > 100))) throw bad(400, 'Choose a valid store type and 1-100 tables for a restaurant');
  const shopSlug = slugify(slug || shopName);
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100 || !validEmail(email) ||
      typeof password !== 'string' || password.length < 10 || password.length > 128 ||
      typeof shopName !== 'string' || !shopName.trim() || shopName.trim().length > 100 ||
      !shopSlug || !validPhone(whatsapp)) throw bad(400, 'Owner name, valid email, 10+ character password, store name and WhatsApp number with country code required');
  const cleanEmail = email.toLowerCase().trim();
  storeDomain(shopSlug);
  if (await User.findOne({ where: { email: cleanEmail } })) throw bad(409, 'Email already registered');
  if (await Business.findOne({ where: { slug: shopSlug } })) throw bad(409, 'Store link already taken');
  const passwordHash = await bcrypt.hash(password, 12);
  const { user, store } = await sequelize.transaction(async transaction => {
    const user = await User.create({ name: name.trim(), email: cleanEmail, passwordHash, role: 'owner' }, { transaction });
    const store = await Business.create({ ownerId: user.id, name: shopName.trim(), slug: shopSlug, whatsapp, storeType, tableCount: storeType === 'restaurant' ? Number(tableCount) : 0, active: false }, { transaction });
    return { user, store };
  });
  try {
    await registerStoreDomain(shopSlug);
    await store.update({ active: true });
  } catch (err) {
    await store.destroy();
    await user.destroy();
    throw bad(503, 'Store domain could not be registered. No owner or store was created. Try again later.');
  }
  const welcomeEmail = await sendOwnerInvite(user,store,{},password);
  res.status(201).json({ welcomeEmail, user: { id: user.id, name: user.name, email: user.email, role: user.role }, store });
}));
// New-store request alerts (superadmin only). Keys are encrypted and never returned.
let alertTestAt = 0;
r.get('/alerts', wrap(async (_, res) => res.json(await alertState())));
r.put('/alerts/keys', wrap(async (req, res) => res.json(await saveAlertKeys(req.body || {}))));
r.put('/alerts', wrap(async (req, res) => res.json(await saveAlertSettings(req.body || {}))));
r.post('/alerts/test', wrap(async (req, res) => {
  if (Date.now() - alertTestAt < 20000) throw bad(429, 'Wait a few seconds before sending another test');
  alertTestAt = Date.now();
  res.json(await sendAlertTest(req.body?.channel));
}));
r.get('/shop-requests', wrap(async (_, res) => {
  await ShopRequest.sync();
  res.json({ requests: await ShopRequest.findAll({ order: [['createdAt', 'DESC']], limit: 250 }) });
}));
r.patch('/shop-requests/:id', wrap(async (req, res) => {
  if (!['new', 'contacted'].includes(req.body?.status)) throw bad(400, 'Invalid status');
  await ShopRequest.sync();
  const request = await ShopRequest.findByPk(numId(req.params.id));
  if (!request) throw bad(404, 'Request not found');
  await request.update({ status: req.body.status });
  res.json({ request });
}));

r.get('/businesses', wrap(async (_, res) => res.json({ businesses: await Business.findAll({ where: { deletedAt: null }, order: [['createdAt', 'DESC']] }) })));
r.delete('/businesses/:id', wrap(async (req, res) => {
  const b = await Business.findByPk(numId(req.params.id));
  if (!b || b.deletedAt) throw bad(404, 'Business not found');
  if (req.body?.slug !== b.slug) throw bad(400, 'Enter the exact store link to remove it');
  const deletedAt = new Date();
  await b.update({ active: false, deletedAt, wasActiveBeforeDelete: b.active });
  res.json({ removed: true, slug: b.slug, restoreUntil: restoreDeadline(deletedAt) });
}));
r.get('/deleted-businesses', wrap(async (_, res) => res.json({ businesses: (await Business.findAll({ where: { deletedAt: { [sequelize.Sequelize.Op.ne]: null } }, order: [['deletedAt', 'DESC']] })).map(b => ({ id: b.id, name: b.name, slug: b.slug, deletedAt: b.deletedAt })) })));
r.post('/deleted-businesses/:id/restore', wrap(async (req, res) => {
  const b = await Business.findByPk(numId(req.params.id));
  if (!b?.deletedAt) throw bad(404, 'Deleted store not found');
  if (new Date() >= restoreDeadline(b.deletedAt)) throw bad(410, 'Restore window has expired');
  if (req.body?.slug !== b.slug) throw bad(400, 'Enter the exact store link to restore');
  await b.update({ deletedAt: null, active: b.wasActiveBeforeDelete === true, wasActiveBeforeDelete: null });
  res.json({ business: b });
}));
r.patch('/businesses/:id', wrap(async (req, res) => {
  if (typeof req.body.active !== 'boolean') throw bad(400, 'active must be true or false');
  const business = await Business.findByPk(numId(req.params.id));
  if (!business || business.deletedAt) throw bad(404, 'Business not found');
  await business.update({ active: req.body.active });
  res.json({ business });
}));
r.get('/users', wrap(async (_, res) => res.json({ users: await User.findAll({ order: [['createdAt', 'DESC']] }) })));
r.patch('/users/:id', wrap(async (req, res) => {
  if (typeof req.body.active !== 'boolean') throw bad(400, 'active must be true or false');
  if (String(req.user.id) === req.params.id && !req.body.active) throw bad(400, 'Cannot disable your own account');
  const user = await User.findByPk(numId(req.params.id));
  if (!user) throw bad(404, 'User not found');
  await user.update({ active: req.body.active });
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active } });
}));
// Superadmin master switches for owner dashboard features, enforced server-side.
r.get('/businesses/:id/feature-locks', wrap(async (req, res) => {
  const business = await Business.findByPk(numId(req.params.id));
  if (!business || business.deletedAt) throw bad(404, 'Business not found');
  res.json({ features: LOCKABLE_FEATURES, locks: locksOf(business) });
}));
r.patch('/businesses/:id/feature-locks', wrap(async (req, res) => {
  const feature = String(req.body?.feature || '');
  if ((!LOCKABLE_KEYS.includes(feature) && feature !== 'all') || typeof req.body?.locked !== 'boolean') throw bad(400, 'Choose a valid feature and locked true or false');
  const result = await sequelize.transaction(async transaction => {
    const business = await Business.findByPk(numId(req.params.id), { transaction, lock: transaction.LOCK.UPDATE });
    if (!business || business.deletedAt) throw bad(404, 'Business not found');
    const locks = { ...locksOf(business) };
    for (const key of feature === 'all' ? LOCKABLE_KEYS : [feature]) {
      if (req.body.locked) locks[key] = true; else delete locks[key];
    }
    await business.update({ featureLocks: locks }, { transaction });
    return { features: LOCKABLE_FEATURES, locks: locksOf(business) };
  });
  res.json(result);
}));

r.get('/stats', wrap(async (_, res) => {
  const [businesses, users, products, categories, leads] = await Promise.all([Business.count({ where: { deletedAt: null } }), User.count(), Product.count(), Category.count(), Lead.count()]);
  res.json({ businesses, users, products, categories, leads });
}));
r.get('/sales', wrap(async (req,res)=>res.json(await platformSales(req.query))));
r.get('/sales/report.csv', wrap(async (req,res)=>res.type('text/csv').attachment('platform-sales.csv').send(salesCsv(await platformSales(req.query)))));
r.post('/commission-rules', wrap(async(req,res)=>{
 const businessId=numId(req.body?.businessId),percent=Number(req.body?.percent),effectiveFrom=req.body?.effectiveFrom;
 if(req.body?.percent === '' || !Number.isFinite(percent)||percent<0||percent>100||Math.abs(Math.round(percent*100)-percent*100)>0.000001) throw bad(400,'Commission must be 0 to 100%, with at most two decimal places');
 if(!effectiveFrom)throw bad(400,'Choose an effective date'); dateWindow({from:effectiveFrom});
 if(!await Business.findByPk(businessId))throw bad(404,'Store not found');
 await ensureCommissionSchema();
 const [rule,created]=await CommissionRule.findOrCreate({where:{businessId,effectiveFrom},defaults:{percent,createdBy:req.user.id}});
 if(!created)throw bad(409,'A rate already exists for this store on that date. Choose a later effective date; saved history is not overwritten.');
 res.status(201).json({rule});
}));
export default r;
