import { Router } from 'express';
import { createStatusService } from './system-status.js';

// Per-user limit for "Check connections": 4 runs a minute. The service itself dedupes and caches.
const runs = new Map();
export function checkAllowed(userId, nowMs = Date.now()) {
  const recent = (runs.get(userId) || []).filter(t => nowMs - t < 60000);
  if (recent.length >= 4) { runs.set(userId, recent); return Math.max(1, Math.ceil((60000 - (nowMs - recent[0])) / 1000)); }
  recent.push(nowMs); runs.set(userId, recent); return 0;
}
const parseStoreId = v => { if (v === undefined || v === '' || v === null) return null; const n = Number(v); return Number.isInteger(n) && n > 0 ? n : NaN; };

// The caller mounts this behind auth + roles('superadmin'). Nothing below runs before that gate.
export function systemStatusRouter({ service, searchStores, wrap, bad }) {
  const r = Router();
  r.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); res.set('Pragma', 'no-cache'); next(); });
  r.get('/', wrap(async (req, res) => {
    const storeId = parseStoreId(req.query.storeId);
    if (Number.isNaN(storeId)) throw bad(400, 'Invalid store');
    res.json(await service.snapshot({ storeId }));
  }));
  r.post('/check', wrap(async (req, res) => {
    const storeId = parseStoreId(req.body?.storeId);
    if (Number.isNaN(storeId)) throw bad(400, 'Invalid store');
    const wait = checkAllowed(req.user.id);
    if (wait) { res.set('Retry-After', String(wait)); throw bad(429, 'Checks are limited. Try again shortly.'); }
    res.json(await service.check({ storeId }));
  }));
  r.get('/stores', wrap(async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 80);
    const page = Math.min(Math.max(Number.parseInt(req.query.page, 10) || 1, 1), 1000);
    res.json(await searchStores({ q, page, pageSize: 10 }));
  }));
  return r;
}
export { createStatusService };
