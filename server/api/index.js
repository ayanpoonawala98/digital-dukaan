import app from '../src/app.js';
import { sequelize } from '../src/db.js';
import { ensureRestaurantSchema } from '../src/restaurant-schema.js';

const ready = sequelize.authenticate();

export default async function handler(req, res) {
  await ready;
  await ensureRestaurantSchema();
  return app(req, res);
}
