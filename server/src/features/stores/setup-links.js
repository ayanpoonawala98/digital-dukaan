import { createHash, randomBytes } from 'node:crypto';
// The model loads lazily so the pure helpers below stay importable without a database.
let model, ready;
async function getModel() {
  if (model) return model;
  const { DataTypes } = await import('sequelize');
  const { sequelize } = await import('../../models/index.js');
  // Append-only trail for owner set-password links. Stores who/what/when, never the token or the URL.
  model = sequelize.define('SetupLinkEvent', {
    userId: { type: DataTypes.INTEGER, allowNull: false },
    actorId: { type: DataTypes.INTEGER, allowNull: true },
    action: { type: DataTypes.STRING(20), allowNull: false }, // created | emailed | used
  }, { tableName: 'setup_link_events', updatedAt: false, indexes: [{ fields: ['userId', 'createdAt'] }] });
  return model;
}
export const ensureSetupLinkSchema = async () => { const m = await getModel(); return (ready ||= m.sync().catch(e => { ready = null; throw e; })); };
export const SETUP_LINK_TTL_MS = 24 * 60 * 60 * 1000;
export const hashToken = token => createHash('sha256').update(token).digest('hex');

export async function logSetupEvent(userId, action, actorId = null) {
  try { await ensureSetupLinkSchema(); await (await getModel()).create({ userId, actorId, action }); } catch { /* the audit trail must never break the flow */ }
}

// Mints a fresh single-use token. Any older link for this owner stops working. Returns the URL once; only its hash is stored.
export async function mintSetupLink(user, actorId, origin, now = Date.now()) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(now + SETUP_LINK_TTL_MS);
  await user.update({ passwordSetupHash: hashToken(token), passwordSetupExpiresAt: expiresAt });
  await logSetupEvent(user.id, 'created', actorId);
  return { url: `${origin}/set-password#token=${token}&email=${encodeURIComponent(user.email)}`, expiresAt };
}

export async function setupLinkStatus(user, now = Date.now()) {
  await ensureSetupLinkSchema();
  const events = await (await getModel()).findAll({ where: { userId: user.id }, order: [['id', 'DESC']], limit: 5, raw: true });
  const active = Boolean(user.passwordSetupHash) && user.passwordSetupExpiresAt && new Date(user.passwordSetupExpiresAt).getTime() > now;
  return { active, expiresAt: active ? user.passwordSetupExpiresAt : null, events: events.map(e => ({ action: e.action, at: e.createdAt, by: e.actorId ? 'superadmin' : 'owner' })) };
}
