// Public host lookup and the internal TLS ask. Neither reads the Host header: the hostname is always an explicit parameter.
import { Router } from 'express';
import crypto from 'node:crypto';
import { publicResolve, tlsAsk } from './domain-service.js';
export const publicDomainRoutes = Router();
publicDomainRoutes.get('/domain-resolve', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try { const hit = typeof req.query.host === 'string' ? await publicResolve(req.query.host) : null; return hit ? res.json({ slug: hit.slug }) : res.status(404).json({ error: 'Not found' }); }
  catch { return res.status(404).json({ error: 'Not found' }); }
});
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
// GET /api/internal/tls-ask?domain=host  ->  200 allow, anything else deny. Needs DOMAINS_TLS_ASK_SECRET as a Bearer token; unset = deny all.
export async function tlsAskHandler(req, res) {
  res.set('Cache-Control', 'no-store');
  const secret = process.env.DOMAINS_TLS_ASK_SECRET;
  if (!secret || !same(req.headers.authorization || '', `Bearer ${secret}`)) return res.status(401).end();
  try { return (typeof req.query.domain === 'string' && await tlsAsk(req.query.domain)) ? res.status(200).end() : res.status(403).end(); }
  catch { return res.status(503).end(); }
}
