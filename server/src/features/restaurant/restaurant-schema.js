import {ensurePerformanceIndexes} from '../../shared/performance-indexes.js';
import {ensureOrderStockSchema} from '../orders/order-stock-schema.js';
import { ensureOrderNumbers } from '../orders/order-numbers.js';
import { sequelize } from '../../config/db.js';
import { TableRequest, RestaurantOrder, OrderPushSubscription, OwnerPushSubscription, Coupon, NotifySecret, PaymentSecret } from '../../models/index.js';
import { ensureCrmSchema } from '../crm/crm.js';
let ready;
export function ensureRestaurantSchema() {
  if (!ready) ready = (async () => {
    await sequelize.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "passwordSetupHash" varchar(64)');
    await sequelize.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "passwordSetupExpiresAt" timestamp with time zone');
    await sequelize.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "passwordChangedAt" timestamp with time zone');
    await sequelize.query("ALTER TABLE businesses ADD COLUMN IF NOT EXISTS \"storeType\" varchar(20) NOT NULL DEFAULT 'retail'");
    await sequelize.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS "notifyImageUrl" varchar(255) NOT NULL DEFAULT ''`);
    await sequelize.query('ALTER TABLE businesses ADD COLUMN IF NOT EXISTS "gstMode" varchar(10)');
    await sequelize.query('ALTER TABLE businesses ADD COLUMN IF NOT EXISTS "gstRate" double precision');
    await sequelize.query('ALTER TABLE businesses ADD COLUMN IF NOT EXISTS "latitude" double precision');
    await sequelize.query('ALTER TABLE businesses ADD COLUMN IF NOT EXISTS "longitude" double precision');
    await sequelize.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS "area" varchar(80) NOT NULL DEFAULT ''`);
    await sequelize.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS "pincode" varchar(10) NOT NULL DEFAULT ''`);
    await sequelize.query('ALTER TABLE businesses ADD COLUMN IF NOT EXISTS "listInDirectory" boolean NOT NULL DEFAULT false');
    await sequelize.query('ALTER TABLE businesses ADD COLUMN IF NOT EXISTS "serviceRadiusKm" double precision');
    await sequelize.query('ALTER TABLE businesses ADD COLUMN IF NOT EXISTS "tableCount" integer NOT NULL DEFAULT 0');
    await sequelize.query('ALTER TABLE businesses ADD COLUMN IF NOT EXISTS "deletedAt" timestamp with time zone');
    await sequelize.query('ALTER TABLE businesses ADD COLUMN IF NOT EXISTS "wasActiveBeforeDelete" boolean');
    await sequelize.query('ALTER TABLE businesses ADD COLUMN IF NOT EXISTS "offerPopupActive" boolean NOT NULL DEFAULT false');
    await sequelize.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS "offerPopupText" varchar(220) NOT NULL DEFAULT ''`);
    await sequelize.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS "offerPopupTitle" varchar(90) NOT NULL DEFAULT ''`);
    await sequelize.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS "offerPopupCtaText" varchar(40) NOT NULL DEFAULT ''`);
    await sequelize.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS "offerPopupCtaUrl" varchar(500) NOT NULL DEFAULT ''`);
    await sequelize.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS "offerPopupImageUrl" varchar(255) NOT NULL DEFAULT ''`);
    await sequelize.query('ALTER TABLE businesses ADD COLUMN IF NOT EXISTS "autoHours" boolean NOT NULL DEFAULT false');
    await sequelize.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS "openTime" varchar(5) NOT NULL DEFAULT ''`);
    await sequelize.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS "closeTime" varchar(5) NOT NULL DEFAULT ''`);
    await sequelize.query('ALTER TABLE businesses ADD COLUMN IF NOT EXISTS "blockWhenClosed" boolean');
    await sequelize.query('ALTER TABLE restaurant_orders ADD COLUMN IF NOT EXISTS "billId" integer');
    await sequelize.query('ALTER TABLE restaurant_orders ADD COLUMN IF NOT EXISTS "createdByUserId" integer');
    await RestaurantOrder.sync(); // New table only. Do not alter production tables.
    for(const table of ['leads','restaurant_orders']) { await sequelize.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS "customerEmail" varchar(160) DEFAULT ''`); await sequelize.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS "customerEmailConsent" boolean DEFAULT false`); }
    await OrderPushSubscription.sync(); // New table only, separate from store broadcast subscriptions.
    await OwnerPushSubscription.sync(); // New table only: owner/staff devices for new-order alerts.
    // orderId holds restaurant order ids AND retail lead ids, so an FK to restaurant_orders rejects retail orders.
    await sequelize.query('ALTER TABLE order_push_subscriptions DROP CONSTRAINT IF EXISTS "order_push_subscriptions_orderId_fkey"');
    await sequelize.query('ALTER TABLE restaurant_orders ADD COLUMN IF NOT EXISTS "subtotal" double precision NOT NULL DEFAULT 0');
    await sequelize.query('ALTER TABLE restaurant_orders ADD COLUMN IF NOT EXISTS "discount" double precision NOT NULL DEFAULT 0');
    await sequelize.query('ALTER TABLE restaurant_orders ADD COLUMN IF NOT EXISTS "couponCode" varchar(24)');
    await sequelize.query('ALTER TABLE leads ADD COLUMN IF NOT EXISTS "discount" double precision NOT NULL DEFAULT 0');
    await sequelize.query('ALTER TABLE leads ADD COLUMN IF NOT EXISTS "couponCode" varchar(24)');
    await sequelize.query("ALTER TABLE leads ADD COLUMN IF NOT EXISTS \"customerName\" varchar(100) NOT NULL DEFAULT ''");
    await sequelize.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS \"imageUrls\" jsonb NOT NULL DEFAULT '[]'::jsonb");
    await sequelize.query("ALTER TABLE businesses ADD COLUMN IF NOT EXISTS \"featureLocks\" jsonb NOT NULL DEFAULT '{}'::jsonb");
    await sequelize.query("ALTER TABLE businesses ADD COLUMN IF NOT EXISTS \"notifySettings\" jsonb NOT NULL DEFAULT '{}'::jsonb");
    // Additive enum values for per-store-type order flows. ADD VALUE IF NOT EXISTS never rewrites data.
    for (const value of ['shipped', 'in-progress', 'completed']) await sequelize.query(`ALTER TYPE "enum_leads_status" ADD VALUE IF NOT EXISTS '${value}'`);
    await Coupon.sync(); // New table only.
    await sequelize.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS "customFields" jsonb NOT NULL DEFAULT '[]'::jsonb`);
    await sequelize.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS "variants" jsonb NOT NULL DEFAULT '[]'::jsonb`);
    await sequelize.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS "addonGroups" jsonb NOT NULL DEFAULT '[]'::jsonb`);
    await sequelize.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS "veg" varchar(8) NOT NULL DEFAULT ''`);
    await sequelize.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS "tags" jsonb NOT NULL DEFAULT '[]'::jsonb`);
    await sequelize.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS "soldOutDate" varchar(10)`);
    await sequelize.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS "prepMinutes" integer`);
    await sequelize.query(`ALTER TABLE restaurant_orders ADD COLUMN IF NOT EXISTS "deliveryFee" double precision NOT NULL DEFAULT 0`);
    await sequelize.query(`ALTER TABLE restaurant_orders ADD COLUMN IF NOT EXISTS "note" varchar(300) NOT NULL DEFAULT ''`);
    await sequelize.query(`ALTER TABLE restaurant_orders ADD COLUMN IF NOT EXISTS "estimateMinutes" integer`);
    await TableRequest.sync(); // additive table
    await PaymentSecret.sync(); // additive table
    await sequelize.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS "paymentStatus" varchar(20) NOT NULL DEFAULT ''`);
    await sequelize.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS "paymentLinkId" varchar(60)`);
    await sequelize.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS "paymentLinkUrl" varchar(300)`);
    await sequelize.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS "paidAt" timestamp with time zone`);
    await sequelize.query(`ALTER TABLE restaurant_orders ADD COLUMN IF NOT EXISTS "paymentStatus" varchar(20) NOT NULL DEFAULT ''`);
    await sequelize.query(`ALTER TABLE restaurant_orders ADD COLUMN IF NOT EXISTS "paymentLinkId" varchar(60)`);
    await sequelize.query(`ALTER TABLE restaurant_orders ADD COLUMN IF NOT EXISTS "paymentLinkUrl" varchar(300)`);
    await sequelize.query(`ALTER TABLE restaurant_orders ADD COLUMN IF NOT EXISTS "paidAt" timestamp with time zone`);
    await NotifySecret.sync(); // New table only.
    await sequelize.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "managerId" integer');
    await sequelize.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "staffBusinessId" integer');
    await sequelize.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions jsonb');
    await sequelize.query("ALTER TYPE \"enum_users_role\" ADD VALUE IF NOT EXISTS 'staff'");
    // Workhorse owner views filter by store and order recent enquiries.
    await sequelize.query('CREATE INDEX IF NOT EXISTS leads_business_created_at_idx ON leads ("businessId", "createdAt" DESC)');
    await sequelize.query('CREATE INDEX IF NOT EXISTS businesses_owner_deleted_idx ON businesses ("ownerId", "deletedAt")');
    await sequelize.query('CREATE INDEX IF NOT EXISTS products_business_active_featured_idx ON products ("businessId", active, featured DESC, "createdAt" DESC)');
    await ensurePerformanceIndexes(sequelize);
    await ensureCrmSchema();
    await ensureOrderNumbers();
    await ensureOrderStockSchema();
  })().catch(e => { ready = null; throw e; });
  return ready;
}
