import { runDailyJobs } from './features/platform/reports.js';
import dotenv from 'dotenv';
import { fileURLToPath as envFilePath } from 'node:url';
import { dirname as envDirname, resolve as envResolve } from 'node:path';
dotenv.config({ path: envResolve(envDirname(envFilePath(import.meta.url)), '../../.env') });
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { maybeSendMonthlyDigest } from './features/platform/subscriptions.js';
import { clientIp } from './shared/abuse-limits.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import ownerRoutes from './routes/owner.js';
import adminRoutes from './routes/admin.js';
import { purgeExpiredStore } from './shared/retention.js';
import { whatsappWebhook } from './features/whatsapp/whatsapp-cloud.js';
import { byoWebhook } from './features/whatsapp/whatsapp-byo.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
const allowedOrigins = process.env.CLIENT_URL?.split(',').map(o => o.trim()) || ['http://localhost:5173'];
app.use(cors({ origin(origin, callback) {
  if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
  callback(null, false);
} }));
app.use('/api/integrations/whatsapp/webhook', whatsappWebhook);
app.use('/api/integrations/whatsapp-byo', rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false, validate: { trustProxy: false, keyGeneratorIpFallback: false, ip: false }, keyGenerator: req => `ip:${clientIp(req)}` }), byoWebhook);
app.use(express.json({ limit: '100kb' }));
app.use('/uploads', express.static(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../uploads')));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, validate: { trustProxy: false, keyGeneratorIpFallback: false, ip: false }, keyGenerator: req => `ip:${clientIp(req)}` }), authRoutes);
app.use('/api/public', rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false, validate: { trustProxy: false, keyGeneratorIpFallback: false, ip: false }, keyGenerator: req => `ip:${clientIp(req)}` }), publicRoutes);
const apiLimit = max => rateLimit({ windowMs: 60 * 1000, limit: max, standardHeaders: 'draft-7', legacyHeaders: false, validate: { trustProxy: false, keyGeneratorIpFallback: false, ip: false }, keyGenerator: req => `ip:${clientIp(req)}`, message: { error: 'Too many requests. Slow down and try again shortly.' } });
app.use('/api/owner', apiLimit(600), ownerRoutes);
app.use('/api/admin', apiLimit(300), adminRoutes);
app.get('/api/internal/purge-expired-stores', async (req, res, next) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });
  try { res.json(await purgeExpiredStore()); } catch (err) { next(err); }
});
app.get('/api/internal/daily-alerts', async (req, res, next) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });
  try { const jobs = await runDailyJobs(); res.json({ ...jobs, clientsDigest: await maybeSendMonthlyDigest() }); } catch (err) { next(err); }
});
app.get('/api/health', (_, res) => res.json({ status: 'ok' }));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  if (err.name === 'SequelizeUniqueConstraintError' || err.code === 11000) return res.status(409).json({ error: 'A record with that email or link already exists' });
  if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeDatabaseError' || err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: err.errors?.[0]?.message || err.message });
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});
export default app;
