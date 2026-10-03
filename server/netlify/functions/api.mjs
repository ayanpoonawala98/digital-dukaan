import serverless from 'serverless-http';
import app from '../../src/app.js';
import { sequelize } from '../../src/db.js';
import { ensureRestaurantSchema } from '../../src/restaurant-schema.js';

// Same startup as the Vercel handler: connect once per warm instance, retry a dropped cold Neon connection.
let ready;
async function ensureReady() {
  if (!ready) ready = (async () => {
    try { await sequelize.authenticate(); }
    catch { await new Promise(resolve => setTimeout(resolve, 250)); await sequelize.authenticate(); }
    await ensureRestaurantSchema();
  })().catch(error => { ready = null; throw error; });
  return ready;
}

const handle = serverless(app, { binary: ['application/pdf', 'image/*', 'application/octet-stream'] });

export const handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  try { await ensureReady(); }
  catch (error) {
    console.error('Database initialization failed:', error);
    return { statusCode: 503, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ error: 'Service temporarily unavailable' }) };
  }
  return handle(event, context);
};
