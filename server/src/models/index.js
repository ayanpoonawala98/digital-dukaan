import { DataTypes } from 'sequelize';
export { sequelize };
import { sequelize } from '../db.js';

export const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false, unique: true, set(value) { this.setDataValue('email', String(value || '').toLowerCase().trim()); } },
  passwordHash: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.ENUM('owner', 'superadmin', 'staff'), defaultValue: 'owner' },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
  managerId: { type: DataTypes.INTEGER, allowNull: true },
  staffBusinessId: { type: DataTypes.INTEGER, allowNull: true }
}, { tableName: 'users', defaultScope: { attributes: { exclude: ['passwordHash'] } } });

export const Business = sequelize.define('Business', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  ownerId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
  name: { type: DataTypes.STRING(100), allowNull: false },
  slug: { type: DataTypes.STRING, allowNull: false, unique: true, validate: { is: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ } },
  whatsapp: { type: DataTypes.STRING, allowNull: false, validate: { is: /^[1-9]\d{7,14}$/ } },
  description: { type: DataTypes.STRING(1000), defaultValue: '' },
  location: { type: DataTypes.STRING(120), defaultValue: '' },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
  deletedAt: { type: DataTypes.DATE, allowNull: true },
  wasActiveBeforeDelete: { type: DataTypes.BOOLEAN, allowNull: true },
  storeType: { type: DataTypes.STRING(20), defaultValue: 'retail', allowNull: false },
  tableCount: { type: DataTypes.INTEGER, defaultValue: 0, allowNull: false },
  bannerText: { type: DataTypes.STRING(200), defaultValue: '' },
  bannerActive: { type: DataTypes.BOOLEAN, defaultValue: false },
  offerPopupActive: { type: DataTypes.BOOLEAN, defaultValue: false },
  offerPopupText: { type: DataTypes.STRING(220), defaultValue: '' },
  offerPopupTitle: { type: DataTypes.STRING(90), defaultValue: '' },
  offerPopupCtaText: { type: DataTypes.STRING(40), defaultValue: '' },
  offerPopupCtaUrl: { type: DataTypes.STRING(500), defaultValue: '' },
  offerPopupImageUrl: { type: DataTypes.STRING, defaultValue: '' },
  isOpen: { type: DataTypes.BOOLEAN, defaultValue: true },
  openingHours: { type: DataTypes.STRING(120), defaultValue: '' },
  deliveryCharge: { type: DataTypes.FLOAT, defaultValue: 0, validate: { min: 0 } },
  freeDeliveryAbove: { type: DataTypes.FLOAT, allowNull: true },
  logoUrl: { type: DataTypes.STRING, defaultValue: '' },
  coverUrl: { type: DataTypes.STRING, defaultValue: '' },
  accentColor: { type: DataTypes.STRING(9), defaultValue: '', validate: { is: /^$|^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/ } },
  upiId: { type: DataTypes.STRING(60), defaultValue: '' },
  gstin: { type: DataTypes.STRING(15), defaultValue: '' },
  minOrder: { type: DataTypes.FLOAT, defaultValue: 0, validate: { min: 0 } },
  featureLocks: { type: DataTypes.JSONB, defaultValue: {} },
  notifySettings: { type: DataTypes.JSONB, defaultValue: {} }
}, { tableName: 'businesses' });

export const Category = sequelize.define('Category', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  businessId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'businesses', key: 'id' } },
  name: { type: DataTypes.STRING(80), allowNull: false },
  slug: { type: DataTypes.STRING, allowNull: false }
}, { tableName: 'categories', indexes: [{ unique: true, fields: ['businessId', 'slug'] }] });

export const Product = sequelize.define('Product', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  businessId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'businesses', key: 'id' } },
  categoryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'categories', key: 'id' } },
  name: { type: DataTypes.STRING(120), allowNull: false },
  description: { type: DataTypes.STRING(2000), defaultValue: '' },
  price: { type: DataTypes.FLOAT, allowNull: false, validate: { min: 0 } },
  imageUrl: { type: DataTypes.STRING, defaultValue: '' },
  imageUrls: { type: DataTypes.JSONB, defaultValue: [] },
  kind: { type: DataTypes.ENUM('product', 'service'), defaultValue: 'product' },
  duration: { type: DataTypes.STRING(60), defaultValue: '' },
  stock: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 0 } },
  featured: { type: DataTypes.BOOLEAN, defaultValue: false },
  active: { type: DataTypes.BOOLEAN, defaultValue: true }
}, { tableName: 'products', indexes: [{ fields: ['businessId', 'categoryId'] }] });

export const Lead = sequelize.define('Lead', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  businessId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'businesses', key: 'id' } },
  productId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'products', key: 'id' } },
  productName: { type: DataTypes.STRING, allowNull: false },
  price: { type: DataTypes.FLOAT, allowNull: false },
  items: { type: DataTypes.JSONB, allowNull: true },
  status: { type: DataTypes.ENUM('new', 'confirmed', 'packed', 'shipped', 'out-for-delivery', 'delivered', 'in-progress', 'completed', 'cancelled'), defaultValue: 'new' },
  customerPhone: { type: DataTypes.STRING, defaultValue: '' },
  customerName: { type: DataTypes.STRING(100), defaultValue: '' },
  source: { type: DataTypes.STRING(80), defaultValue: '' },
  discount: { type: DataTypes.FLOAT, defaultValue: 0 },
  couponCode: { type: DataTypes.STRING(24), allowNull: true },
  referralCode: { type: DataTypes.STRING(24), allowNull: true }
}, { tableName: 'leads', timestamps: true, updatedAt: false });

User.hasMany(Business, { foreignKey: 'ownerId' });
Business.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });
Business.hasMany(Category, { foreignKey: 'businessId' });
Category.belongsTo(Business, { foreignKey: 'businessId' });
Category.hasMany(Product, { foreignKey: 'categoryId' });
Product.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });
Business.hasMany(Product, { foreignKey: 'businessId' });
Product.belongsTo(Business, { foreignKey: 'businessId' });
Business.hasMany(Lead, { foreignKey: 'businessId' });
Lead.belongsTo(Business, { foreignKey: 'businessId' });

export const PushSubscription = sequelize.define('PushSubscription', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  businessId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'businesses', key: 'id' } },
  endpoint: { type: DataTypes.TEXT, allowNull: false, unique: true },
  keys: { type: DataTypes.JSONB, allowNull: false }
}, { tableName: 'push_subscriptions', timestamps: true, updatedAt: false });

Business.hasMany(PushSubscription, { foreignKey: 'businessId' });
PushSubscription.belongsTo(Business, { foreignKey: 'businessId' });

// Per-order customer notification subscriptions, separate from store-wide broadcasts.
export const OrderPushSubscription = sequelize.define('OrderPushSubscription', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  businessId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'businesses', key: 'id' } },
  orderType: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'restaurant' }, // restaurant | lead
  orderId: { type: DataTypes.INTEGER, allowNull: false },
  endpoint: { type: DataTypes.TEXT, allowNull: false },
  keys: { type: DataTypes.JSONB, allowNull: false },
  returnPath: { type: DataTypes.STRING(600), allowNull: false }
}, { tableName: 'order_push_subscriptions', timestamps: true, updatedAt: false, indexes: [{ unique: true, fields: ['orderType', 'orderId', 'endpoint'], name: 'order_push_unique' }, { fields: ['businessId', 'endpoint'] }] });
Business.hasMany(OrderPushSubscription, { foreignKey: 'businessId' });
OrderPushSubscription.belongsTo(Business, { foreignKey: 'businessId' });

// Platform-level shop requests are separate from customer order enquiries.
export const ShopRequest = sequelize.define('ShopRequest', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  email: { type: DataTypes.STRING(254), allowNull: false },
  phone: { type: DataTypes.STRING(25), allowNull: false },
  shopName: { type: DataTypes.STRING(100), allowNull: false },
  message: { type: DataTypes.STRING(1000), defaultValue: '' },
  status: { type: DataTypes.ENUM('new', 'contacted'), defaultValue: 'new' }
}, { tableName: 'shop_requests' });

// Restaurant-only orders are intentionally separate from WhatsApp enquiry Leads.
export const RestaurantOrder = sequelize.define('RestaurantOrder', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  businessId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'businesses', key: 'id' } },
  orderType: { type: DataTypes.STRING(20), allowNull: false },
  tableNumber: { type: DataTypes.INTEGER, allowNull: true },
  customerName: { type: DataTypes.STRING(100), allowNull: true },
  customerPhone: { type: DataTypes.STRING(20), allowNull: true },
  deliveryAddress: { type: DataTypes.STRING(500), allowNull: true },
  items: { type: DataTypes.JSONB, allowNull: false },
  subtotal: { type: DataTypes.FLOAT, defaultValue: 0 },
  discount: { type: DataTypes.FLOAT, defaultValue: 0 },
  couponCode: { type: DataTypes.STRING(24), allowNull: true },
  referralCode: { type: DataTypes.STRING(24), allowNull: true },
  total: { type: DataTypes.FLOAT, allowNull: false },
  status: { type: DataTypes.STRING(20), defaultValue: 'new', allowNull: false }
}, { tableName: 'restaurant_orders', indexes: [{ fields: ['businessId', 'createdAt'] }] });
Business.hasMany(RestaurantOrder, { foreignKey: 'businessId' });
RestaurantOrder.belongsTo(Business, { foreignKey: 'businessId' });
RestaurantOrder.hasMany(OrderPushSubscription, { foreignKey: 'orderId' });
OrderPushSubscription.belongsTo(RestaurantOrder, { foreignKey: 'orderId' });

export const Coupon = sequelize.define('Coupon', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  businessId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'businesses', key: 'id' } },
  code: { type: DataTypes.STRING(24), allowNull: false },
  percentOff: { type: DataTypes.INTEGER, allowNull: false },
  active: { type: DataTypes.BOOLEAN, defaultValue: true, allowNull: false }
}, { tableName: 'coupons', indexes: [{ unique: true, fields: ['businessId', 'code'] }] });
Business.hasMany(Coupon, { foreignKey: 'businessId' });
Coupon.belongsTo(Business, { foreignKey: 'businessId' });

// Codes are owner-created and attached to a real customer phone by staff confirmation.
export const Referral = sequelize.define('Referral', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  businessId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'businesses', key: 'id' } },
  code: { type: DataTypes.STRING(24), allowNull: false },
  referrerPhone: { type: DataTypes.STRING(20), allowNull: false },
  referredPhone: { type: DataTypes.STRING(20), allowNull: true },
  orderId: { type: DataTypes.INTEGER, allowNull: true },
  orderKind: { type: DataTypes.STRING(20), allowNull: true },
  referrerRewardUsed: { type: DataTypes.BOOLEAN, defaultValue: false },
  referredRewardUsed: { type: DataTypes.BOOLEAN, defaultValue: false },
  status: { type: DataTypes.STRING(20), defaultValue: 'pending' }
}, { tableName: 'referrals', indexes: [{ unique: true, fields: ['businessId', 'code'] }] });
Business.hasMany(Referral, { foreignKey: 'businessId' });
Referral.belongsTo(Business, { foreignKey: 'businessId' });

// Per-store provider credentials. Kept in their own table (never on Business) so no store/overview/public response can ever carry them.
export const NotifySecret = sequelize.define('NotifySecret', {
  businessId: { type: DataTypes.INTEGER, primaryKey: true, references: { model: 'businesses', key: 'id' }, onDelete: 'CASCADE' },
  payload: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
}, { tableName: 'notify_secrets' });
