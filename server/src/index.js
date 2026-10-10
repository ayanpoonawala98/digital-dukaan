import app from './app.js';
import { sequelize } from './config/db.js';
import { ensureRestaurantSchema } from './features/restaurant/restaurant-schema.js';

if (!process.env.DATABASE_URL || !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || !process.env.PUBLIC_API_URL) {
  console.error('Set DATABASE_URL, PUBLIC_API_URL and a JWT_SECRET of at least 32 characters in .env');
  process.exit(1);
}
await sequelize.authenticate();
await ensureRestaurantSchema();
app.listen(Number(process.env.PORT || 4000), () => console.log(`API on port ${process.env.PORT || 4000}`));
