import { sequelize } from './db.js';
import { RestaurantOrder, Coupon, Referral } from './models/index.js';
let ready;
export function ensureRestaurantSchema() {
  if (!ready) ready = (async () => {
    await sequelize.query("ALTER TABLE businesses ADD COLUMN IF NOT EXISTS \"storeType\" varchar(20) NOT NULL DEFAULT 'retail'");
    await sequelize.query('ALTER TABLE businesses ADD COLUMN IF NOT EXISTS "tableCount" integer NOT NULL DEFAULT 0');
    await sequelize.query('ALTER TABLE businesses ADD COLUMN IF NOT EXISTS "deletedAt" timestamp with time zone');
    await sequelize.query('ALTER TABLE businesses ADD COLUMN IF NOT EXISTS "wasActiveBeforeDelete" boolean');
    await sequelize.query('ALTER TABLE businesses ADD COLUMN IF NOT EXISTS "offerPopupActive" boolean NOT NULL DEFAULT false');
    await sequelize.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS "offerPopupText" varchar(220) NOT NULL DEFAULT ''`);
    await sequelize.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS "offerPopupImageUrl" varchar(255) NOT NULL DEFAULT ''`);
    await RestaurantOrder.sync(); // New table only. Do not alter production tables.
    await sequelize.query('ALTER TABLE restaurant_orders ADD COLUMN IF NOT EXISTS "subtotal" double precision NOT NULL DEFAULT 0');
    await sequelize.query('ALTER TABLE restaurant_orders ADD COLUMN IF NOT EXISTS "discount" double precision NOT NULL DEFAULT 0');
    await sequelize.query('ALTER TABLE restaurant_orders ADD COLUMN IF NOT EXISTS "couponCode" varchar(24)');
    await sequelize.query('ALTER TABLE leads ADD COLUMN IF NOT EXISTS "discount" double precision NOT NULL DEFAULT 0');
    await sequelize.query('ALTER TABLE leads ADD COLUMN IF NOT EXISTS "couponCode" varchar(24)');
    await sequelize.query('ALTER TABLE restaurant_orders ADD COLUMN IF NOT EXISTS "referralCode" varchar(24)');
    await sequelize.query('ALTER TABLE leads ADD COLUMN IF NOT EXISTS "referralCode" varchar(24)');
    await Coupon.sync(); // New table only.
    await Referral.sync();
    await sequelize.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "managerId" integer');
    await sequelize.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "staffBusinessId" integer');
    await sequelize.query("ALTER TYPE \"enum_users_role\" ADD VALUE IF NOT EXISTS 'staff'");
  })().catch(e => { ready = null; throw e; });
  return ready;
}
