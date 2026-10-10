import app from '../src/app.js';
import { sequelize } from '../src/config/db.js';
import { ensureRestaurantSchema } from '../src/features/restaurant/restaurant-schema.js';

// Never leave a rejected top-level connection promise unobserved. A cold Neon
// connection can drop once; retry connection setup before Express sees a request.
let ready;
async function ensureReady() {
  if (!ready) ready = (async () => {
    try { await sequelize.authenticate(); }
    catch { await new Promise(resolve => setTimeout(resolve, 250)); await sequelize.authenticate(); }
    await ensureRestaurantSchema();
  })().catch(error => { ready = null; throw error; });
  return ready;
}

export default async function handler(req, res) {
  try { await ensureReady(); }
  catch (error) { console.error('Database initialization failed:', error); return res.status(503).json({ error: 'Service temporarily unavailable' }); }
  return app(req, res);
}
