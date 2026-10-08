import {ownerList} from './owner-list-page.js';
import { DataTypes, Op } from 'sequelize';
import { sequelize, Business } from './models/index.js';
import { Router } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { bad, wrap } from './utils/core.js';

export const Customer = sequelize.define('Customer', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  businessId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'businesses', key: 'id' } },
  phone: { type: DataTypes.STRING(15), allowNull: false },
  name: { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },
  source: { type: DataTypes.STRING(80), allowNull: false, defaultValue: 'manual' },
  tags: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  notes: { type: DataTypes.STRING(2000), allowNull: false, defaultValue: '' },
  optInStatus: { type: DataTypes.ENUM('unknown', 'opted_in', 'opted_out'), allowNull: false, defaultValue: 'unknown' },
  optInPurpose: { type: DataTypes.STRING(200), allowNull: true },
  optInSource: { type: DataTypes.STRING(200), allowNull: true },
  optInAt: { type: DataTypes.DATE, allowNull: true },
  optOutAt: { type: DataTypes.DATE, allowNull: true },
  importBatchId: { type: DataTypes.UUID, allowNull: true },
  archivedAt: { type: DataTypes.DATE, allowNull: true }
}, { tableName: 'customers', indexes: [{ unique: true, fields: ['businessId', 'phone'] }, { fields: ['businessId', 'createdAt'] }] });
Business.hasMany(Customer, { foreignKey: 'businessId' });
Customer.belongsTo(Business, { foreignKey: 'businessId' });

export const CustomerImportBatch = sequelize.define('CustomerImportBatch', {
  id: { type: DataTypes.UUID, primaryKey: true },
  businessId: { type: DataTypes.INTEGER, allowNull: false },
  digest: { type: DataTypes.STRING(64), allowNull: false },
  createdCount: { type: DataTypes.INTEGER, allowNull: false },
  undoneAt: { type: DataTypes.DATE, allowNull: true }
}, { tableName: 'customer_import_batches' });

export async function ensureCrmSchema() {
  if (process.env.CRM_ENABLED !== 'true') return;
  await Customer.sync(); // CRM-owned table only; never alter existing store/catalog tables.
  await sequelize.query('ALTER TABLE customers ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP WITH TIME ZONE');
  await CustomerImportBatch.sync();
}

const phone = value => {
  const normalized = String(value ?? '').replace(/[\s()+.-]/g, '');
  if (!/^[1-9]\d{7,14}$/.test(normalized)) throw bad(400, 'Phone needs country code and 8-15 digits');
  return normalized;
};
export const normalizeCustomerPhone = phone;
const cleanString = (value, max, label) => {
  if (typeof value !== 'string' || value.trim().length > max) throw bad(400, `${label} must be at most ${max} characters`);
  return value.trim();
};
function customerFields(input, { imported = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw bad(400, 'Invalid customer');
  const result = { phone: phone(input.phone) };
  for (const [key, max] of [['name', 100], ['source', 80], ['notes', 2000]]) if (input[key] !== undefined) result[key] = cleanString(input[key], max, key);
  if (imported) {
    result.source = result.source || 'import';
    // Never infer marketing permission from a spreadsheet.
    return result;
  }
  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags) || input.tags.length > 20) throw bad(400, 'Use at most 20 tags');
    result.tags = [...new Set(input.tags.map(tag => cleanString(tag, 40, 'tag')).filter(Boolean))];
  }
  if (input.optInStatus !== undefined) {
    if (!['unknown', 'opted_in', 'opted_out'].includes(input.optInStatus)) throw bad(400, 'Invalid consent status');
    result.optInStatus = input.optInStatus;
    if (result.optInStatus === 'opted_in') {
      result.optInPurpose = cleanString(input.optInPurpose, 200, 'consent purpose');
      result.optInSource = cleanString(input.optInSource, 200, 'consent source');
      if (!result.optInPurpose || !result.optInSource || !input.optInAt || Number.isNaN(Date.parse(input.optInAt)) || new Date(input.optInAt) > new Date()) throw bad(400, 'Opt-in needs purpose, source and a past timestamp');
      result.optInAt = new Date(input.optInAt);
      result.optOutAt = null;
    } else if (result.optInStatus === 'opted_out') {
      result.optOutAt = new Date();
      result.optInAt = null; result.optInPurpose = null; result.optInSource = null;
    } else {
      result.optInAt = null; result.optOutAt = null; result.optInPurpose = null; result.optInSource = null;
    }
  } else if (['optInPurpose', 'optInSource', 'optInAt'].some(key => input[key] !== undefined)) throw bad(400, 'Change consent status with evidence fields together');
  return result;
}
function assertRows(rows) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 500) throw bad(400, 'Import 1-500 rows at a time');
  const seen = new Set(), valid = [], errors = [];
  rows.forEach((row, i) => {
    try {
      const item = customerFields(row, { imported: true });
      if (seen.has(item.phone)) errors.push({ row: i + 1, error: 'Duplicate phone in file' });
      else { seen.add(item.phone); valid.push(item); }
    } catch (err) { errors.push({ row: i + 1, error: err.message }); }
  });
  return { valid, errors };
}
export const crmRoutes = Router();
crmRoutes.use((req, res, next) => process.env.CRM_ENABLED === 'true' ? next() : res.status(404).json({ error: 'Not found' }));
crmRoutes.get('/', wrap(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100), status = String(req.query.status || 'all');
  if (!['all', 'unknown', 'opted_in', 'opted_out'].includes(status)) throw bad(400, 'Invalid filter');
  const page = Number(req.query.page || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw bad(400, 'Invalid page');
  const limit = 50;
  const where = { businessId: req.store.id, archivedAt: null, ...(status !== 'all' ? { optInStatus: status } : {}) };
  if (q) where[Op.or] = [{ phone: { [Op.like]: `%${q.replace(/[%_\\]/g, '\\$&')}%` } }, { name: { [Op.iLike]: `%${q.replace(/[%_\\]/g, '\\$&')}%` } }];
  if(req.query.limit!==undefined)return res.json(await ownerList(Customer,'customers',{query:{limit:req.query.limit,cursor:req.query.cursor}},where,[]));
  const result = await Customer.findAndCountAll({ where, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit, offset: (page - 1) * limit });
  res.json({ customers: result.rows, total: result.count, page, pageSize: limit });
}));
crmRoutes.post('/', wrap(async (req, res) => {
  const fields = customerFields(req.body);
  res.status(201).json({ customer: await Customer.create({ ...fields, businessId: req.store.id }) });
}));
crmRoutes.patch('/:id', wrap(async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) throw bad(400, 'Invalid customer ID');
  const customer = await sequelize.transaction(async transaction => {
  const customer = await Customer.findOne({ where: { id: Number(req.params.id), businessId: req.store.id, archivedAt: null }, transaction, lock: transaction.LOCK.UPDATE });
  if (!customer) throw bad(404, 'Customer not found');
  const fields = customerFields({ ...req.body, phone: req.body.phone ?? customer.phone });
  if (customer.optInStatus === 'opted_out' && fields.optInStatus && fields.optInStatus !== 'opted_out') throw bad(409, 'An opt-out cannot be reversed by editing; record new consent through a separate verified flow');
  // Repeated opt-out must not erase the original opt-out time.
  if (fields.optInStatus === 'opted_out' && customer.optInStatus === 'opted_out') fields.optOutAt = customer.optOutAt;
  await customer.update(fields, { transaction });
  return customer;
  });
  res.json({ customer });
}));
crmRoutes.delete('/:id', wrap(async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) throw bad(400, 'Invalid customer ID');
  const customer = await Customer.findOne({ where: { id: Number(req.params.id), businessId: req.store.id, archivedAt: null } });
  if (!customer) throw bad(404, 'Customer not found');
  // Hide from active CRM, but retain consent/suppression and the phone's unique key.
  // Reimport/recreation cannot erase a prior opt-out.
  await customer.update({ archivedAt: new Date() });
  res.json({ deleted: true });
}));
crmRoutes.post('/import/preview', wrap(async (req, res) => {
  const { valid, errors } = assertRows(req.body?.rows);
  const existing = valid.length ? await Customer.findAll({ where: { businessId: req.store.id, phone: valid.map(x => x.phone) }, attributes: ['phone'] }) : [];
  const known = new Set(existing.map(x => x.phone));
  res.json({ count: valid.length, newCount: valid.filter(x => !known.has(x.phone)).length, duplicateCount: known.size, errors,
    preview: valid.slice(0, 20).map(x => ({ ...x, action: known.has(x.phone) ? 'skip' : 'create' })),
    digest: createHash('sha256').update(JSON.stringify(req.body.rows)).digest('hex') });
}));
crmRoutes.post('/import/commit', wrap(async (req, res) => {
  const { valid, errors } = assertRows(req.body?.rows);
  const digest = createHash('sha256').update(JSON.stringify(req.body.rows)).digest('hex');
  if (!req.body.digest || req.body.digest !== digest || errors.length) throw bad(400, 'Preview this unchanged file and fix all errors before importing');
  const batchId = randomUUID();
  const result = await sequelize.transaction(async transaction => {
    const existing = await Customer.findAll({ where: { businessId: req.store.id, phone: valid.map(x => x.phone) }, attributes: ['phone'], transaction });
    const known = new Set(existing.map(x => x.phone));
    let created = 0, skipped = 0;
    for (const item of valid) {
      if (known.has(item.phone)) { skipped++; continue; }
      const [_, wasCreated] = await Customer.findOrCreate({ where: { businessId: req.store.id, phone: item.phone }, defaults: { ...item, businessId: req.store.id, importBatchId: batchId }, transaction });
      if (wasCreated) created++; else skipped++;
    }
    await CustomerImportBatch.create({ id: batchId, businessId: req.store.id, digest, createdCount: created }, { transaction });
    return { batchId, created, skipped };
  });
  res.status(201).json(result);
}));
crmRoutes.post('/import/:batchId/undo', wrap(async (req, res) => {
  const result = await sequelize.transaction(async transaction => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.batchId)) throw bad(400, 'Invalid batch ID');
    const batch = await CustomerImportBatch.findOne({ where: { id: req.params.batchId, businessId: req.store.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!batch) throw bad(404, 'Import not found');
    if (batch.undoneAt) throw bad(409, 'Already undone');
    // Only remove records from this batch that have not been manually changed since import.
    const rows = await Customer.findAll({ where: { businessId: req.store.id, importBatchId: batch.id }, transaction, lock: transaction.LOCK.UPDATE });
    let removed = 0;
    for (const row of rows) {
      if (row.updatedAt.getTime() !== row.createdAt.getTime()) continue;
      await row.destroy({ transaction }); removed++;
    }
    await batch.update({ undoneAt: new Date() }, { transaction });
    return { removed, retained: rows.length - removed };
  });
  res.json(result);
}));
