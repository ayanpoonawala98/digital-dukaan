import dotenv from 'dotenv';
import { fileURLToPath as envFilePath } from 'node:url';
import { dirname as envDirname, resolve as envResolve } from 'node:path';
dotenv.config({ path: envResolve(envDirname(envFilePath(import.meta.url)), '../../.env') });
import bcrypt from 'bcryptjs';
import { sequelize, Business, User, Category, Product } from './models/index.js';

for (const key of ['DATABASE_URL', 'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'SEED_OWNER_EMAIL', 'SEED_OWNER_PASSWORD', 'SEED_STORE_WHATSAPP']) {
  if (!process.env[key]) throw Error(`Set ${key} in .env before seeding`);
}
await sequelize.authenticate();
await sequelize.sync();
try {
  const [admin] = await User.findOrCreate({
    where: { email: process.env.SEED_ADMIN_EMAIL.toLowerCase() },
    defaults: { name: 'Ayan Poonawala', role: 'superadmin', passwordHash: await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD, 12) }
  });
  const [owner] = await User.findOrCreate({
    where: { email: process.env.SEED_OWNER_EMAIL.toLowerCase() },
    defaults: { name: 'Demo Owner', role: 'owner', passwordHash: await bcrypt.hash(process.env.SEED_OWNER_PASSWORD, 12) }
  });
  const [shop] = await Business.findOrCreate({
    where: { slug: 'apna-kirana-store' },
    defaults: {
      ownerId: owner.id,
      name: 'Apna Kirana Store',
      whatsapp: process.env.SEED_STORE_WHATSAPP,
      description: 'Fresh groceries, daily essentials and everything your home needs - delivered with a smile.',
      location: 'Thane, Maharashtra',
      bannerText: 'Free delivery on orders above Rs.499! Fresh stock arrives every morning.',
      bannerActive: true,
      isOpen: true,
      openingHours: '8:00 AM - 10:00 PM, open all days',
      deliveryCharge: 30,
      freeDeliveryAbove: 499,
      minOrder: 0,
      accentColor: '#0e9f6e'
    }
  });
  const categories = {};
  for (const [name, slug] of [['Staples', 'staples'], ['Spices & Masala', 'spices-masala'], ['Snacks & Biscuits', 'snacks-biscuits'], ['Beverages', 'beverages'], ['Personal Care', 'personal-care'], ['Household', 'household']]) {
    const [category] = await Category.findOrCreate({ where: { businessId: shop.id, slug }, defaults: { name } });
    categories[slug] = category;
  }
  const img = key => process.env.SEED_IMAGE_BASE_URL ? `${process.env.SEED_IMAGE_BASE_URL.replace(/\/$/, '')}/${key}.jpg` : '';
  const products = [
    { name: 'Whole Wheat Atta 5 kg', cat: 'staples', price: 245, description: 'Chakki-fresh whole wheat flour for soft, fluffy rotis every day.', image: 'atta', stock: 24, featured: true },
    { name: 'Basmati Rice 1 kg', cat: 'staples', price: 148, description: 'Long-grain aromatic basmati, perfect for biryani and pulao.', image: 'rice', stock: 40 },
    { name: 'Toor Dal 1 kg', cat: 'staples', price: 165, description: 'Unpolished toor dal, rich in protein and taste.', image: 'dal', stock: 32 },
    { name: 'Sugar 1 kg', cat: 'staples', price: 45, description: 'Refined white sugar for your daily chai and sweets.', image: 'sugar', stock: 50 },
    { name: 'Tata Salt 1 kg', cat: 'staples', price: 28, description: 'Iodised salt, vacuum evaporated for purity.', image: 'salt', stock: 60 },
    { name: 'Turmeric Powder 200 g', cat: 'spices-masala', price: 52, description: 'Pure haldi with natural colour and aroma.', image: 'turmeric', stock: 18 },
    { name: 'Red Chilli Powder 200 g', cat: 'spices-masala', price: 68, description: 'Fiery red chilli powder ground from premium chillies.', image: 'chilli', stock: 15 },
    { name: 'Garam Masala 100 g', cat: 'spices-masala', price: 85, description: 'A warming blend of whole spices, ground fresh.', image: 'garam-masala', stock: 4 },
    { name: 'Cumin Seeds 100 g', cat: 'spices-masala', price: 42, description: 'Whole jeera with a bold, earthy flavour.', image: 'cumin', stock: 22 },
    { name: 'Glucose Biscuits Family Pack', cat: 'snacks-biscuits', price: 30, description: 'The classic chai-time biscuit for the whole family.', image: 'biscuits', stock: 45, featured: true },
    { name: 'Salted Potato Chips 150 g', cat: 'snacks-biscuits', price: 35, description: 'Crispy, golden, perfectly salted chips.', image: 'chips', stock: 0 },
    { name: 'Roasted Namkeen Mix 400 g', cat: 'snacks-biscuits', price: 80, description: 'Crunchy roasted mixture, ideal for evening snacking.', image: 'namkeen', stock: 12 },
    { name: 'Premium Tea Powder 500 g', cat: 'beverages', price: 260, description: 'Strong Assam blend for the perfect kadak chai.', image: 'tea', stock: 20, featured: true },
    { name: 'Instant Coffee 100 g', cat: 'beverages', price: 180, description: 'Rich instant coffee for a quick, satisfying cup.', image: 'coffee', stock: 10 },
    { name: 'Mango Juice 1 L', cat: 'beverages', price: 110, description: 'Thick, sweet mango drink made from real pulp.', image: 'juice', stock: 16 },
    { name: 'Neem Soap Pack of 4', cat: 'personal-care', price: 120, description: 'Antibacterial neem soap for everyday protection.', image: 'soap', stock: 25 },
    { name: 'Herbal Shampoo 340 ml', cat: 'personal-care', price: 165, description: 'Gentle herbal shampoo for soft, healthy hair.', image: 'shampoo', stock: 3 },
    { name: 'Dishwash Bar Pack of 3', cat: 'household', price: 60, description: 'Tough on grease, gentle on hands.', image: 'dishwash', stock: 30 },
    { name: 'Floor Cleaner 1 L', cat: 'household', price: 99, description: 'Disinfectant floor cleaner with a fresh fragrance.', image: 'cleaner', stock: 14 }
  ];
  for (const p of products) {
    await Product.findOrCreate({
      where: { businessId: shop.id, name: p.name },
      defaults: { categoryId: categories[p.cat].id, price: p.price, description: p.description, imageUrl: img(p.image), stock: p.stock, featured: Boolean(p.featured), active: true }
    });
  }
  console.log(`Seeded. Superadmin: ${admin.email} | Owner: ${owner.email} | Demo shop: /store/apna-kirana-store`);
} finally { await sequelize.close(); }
