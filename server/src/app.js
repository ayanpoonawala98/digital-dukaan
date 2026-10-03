import { runDailyJobs } from './reports.js';
import dotenv from 'dotenv';
import { fileURLToPath as envFilePath } from 'node:url';
import { dirname as envDirname, resolve as envResolve } from 'node:path';
dotenv.config({ path: envResolve(envDirname(envFilePath(import.meta.url)), '../../.env') });
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import ownerRoutes from './routes/owner.js';
import adminRoutes from './routes/admin.js';
import { purgeExpiredStore } from './retention.js';
import { whatsappWebhook } from './whatsapp-cloud.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
const allowedOrigins = process.env.CLIENT_URL?.split(',').map(o => o.trim()) || ['http://localhost:5173'];
app.use(cors({ origin(origin, callback) {
  if (!origin || allowedOrigins.includes(origin) || /^https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.digitaldukaan\.space$/.test(origin)) return callback(null, true);
  callback(null, false);
} }));
app.use('/api/integrations/whatsapp/webhook', whatsappWebhook);
app.use(express.json({ limit: '100kb' }));
app.use('/uploads', express.static(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../uploads')));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, validate: { trustProxy: false } }), authRoutes);
app.use('/api/public', rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false, validate: { trustProxy: false } }), publicRoutes);
app.use('/api/owner', ownerRoutes);
app.use('/api/admin', adminRoutes);
app.get('/api/internal/purge-expired-stores', async (req, res, next) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });
  try { res.json(await purgeExpiredStore()); } catch (err) { next(err); }
});
app.get('/api/internal/daily-alerts', async (req, res, next) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });
  try { res.json(await runDailyJobs()); } catch (err) { next(err); }
});
app.get('/api/health', (_, res) => res.json({ status: 'ok' }));
app.use((err, req, res, next) => {
  if (err.name === 'SequelizeUniqueConstraintError' || err.code === 11000) return res.status(409).json({ error: 'A record with that email or link already exists' });
  if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeDatabaseError' || err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: err.errors?.[0]?.message || err.message });
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});
export default app;
