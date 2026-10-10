import { Op } from 'sequelize';
import { sequelize, Business, User, Category, Product, Lead, PushSubscription, RestaurantOrder, Coupon } from '../models/index.js';
import { unregisterStoreDomain } from './utils/store-domain.js';

export const RESTORE_MS = 30 * 24 * 60 * 60 * 1000;
export const restoreDeadline = deletedAt => new Date(new Date(deletedAt).getTime() + RESTORE_MS);

// Bounded batch so a normal day's expirations do not form a multi-day backlog.
// Domain detach happens only once restoration is forbidden. If the DB transaction
// fails, the tombstone remains offline and a later run retries (404 detach is OK).
export async function purgeExpiredStore(now = new Date()) {
  const cutoff = new Date(now.getTime() - RESTORE_MS);
  const stores = await Business.findAll({ where: { deletedAt: { [Op.lte]: cutoff } }, order: [['deletedAt', 'ASC']], limit: 25 });
  let purged = 0;
  for (const store of stores) {
    await unregisterStoreDomain(store.slug);
    await sequelize.transaction(async transaction => {
      const options = { where: { businessId: store.id }, transaction };
      // CRM may have been enabled in the past even when its current flag is off.
      // Inspect existence, never create CRM tables from a purge/flag-off path.
      const [crmTables] = await sequelize.query("SELECT to_regclass('public.customers') AS customers, to_regclass('public.customer_devices') AS devices, to_regclass('public.customer_messages') AS cmessages, to_regclass('public.customer_import_batches') AS batches, to_regclass('public.whatsapp_messages') AS whatsapp, to_regclass('public.whatsapp_connections') AS wa_connections, to_regclass('public.whatsapp_signup_sessions') AS wa_sessions", { transaction });
      if (crmTables[0].wa_connections) await sequelize.query('DELETE FROM whatsapp_connections WHERE \"businessId\" = :id', { replacements: { id: store.id }, transaction });
      if (crmTables[0].wa_sessions) await sequelize.query('DELETE FROM whatsapp_signup_sessions WHERE \"businessId\" = :id', { replacements: { id: store.id }, transaction });
      if (crmTables[0].whatsapp) await sequelize.query('DELETE FROM whatsapp_messages WHERE "businessId" = :id', { replacements: { id: store.id }, transaction });
      if (crmTables[0].devices) await sequelize.query('DELETE FROM customer_devices WHERE "businessId" = :id', { replacements: { id: store.id }, transaction });
      if (crmTables[0].cmessages) await sequelize.query('DELETE FROM customer_messages WHERE "businessId" = :id', { replacements: { id: store.id }, transaction });
      if (crmTables[0].customers) await sequelize.query('DELETE FROM customers WHERE "businessId" = :id', { replacements: { id: store.id }, transaction });
      if (crmTables[0].batches) await sequelize.query('DELETE FROM customer_import_batches WHERE "businessId" = :id', { replacements: { id: store.id }, transaction });
      const [rv] = await sequelize.query("SELECT to_regclass('public.reviews') AS reviews", { transaction });
      if (rv[0].reviews) await sequelize.query('DELETE FROM reviews WHERE "businessId" = :id', { replacements: { id: store.id }, transaction });
      for (const Model of [PushSubscription, RestaurantOrder, Coupon, Lead, Product]) await Model.destroy(options);
      await Category.destroy(options);
      await User.destroy({ where: { role: 'staff', staffBusinessId: store.id }, transaction });
      await store.destroy({ transaction });
    });
    purged++;
  }
  return { purged, hasMore: stores.length === 25 };
}
