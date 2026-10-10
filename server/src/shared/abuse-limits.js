// Abuse limits for public order, enquiry and request forms. Each accepted order can trigger owner push,
// email/SMS billed to the owner and a WhatsApp send, so these are tighter than the general per-IP limit.
import rateLimit from 'express-rate-limit';

const skip = () => process.env.DISABLE_ABUSE_LIMITS === '1'; // tests place many orders from one address
const base = { skip, standardHeaders: 'draft-7', legacyHeaders: false, validate: { trustProxy: false, keyGeneratorIpFallback: false, ip: false } };
const make = (windowMs, limit, key, error) => rateLimit({ ...base, windowMs, limit, keyGenerator: key, message: { error } });
// The API sits behind Cloudflare, so req.ip is a rotating edge address; the visitor address is in cf-connecting-ip.
export const clientIp = req => String(req.headers['cf-connecting-ip'] || req.ip || '').trim();
const ip = req => `ip:${clientIp(req)}`;
const slug = req => `store:${req.params.slug}`;
const phone = req => {
  const raw = req.body?.customerPhone ?? req.body?.phone;
  const digits = typeof raw === 'string' ? raw.replace(/\D/g, '').slice(-10) : '';
  return digits ? `ph:${req.params.slug}:${digits}` : `ip:${clientIp(req)}`;
};
const busy = 'This shop is receiving a lot of orders right now. Please try again in a few minutes.';
const slow = 'Too many requests. Please wait a bit and try again.';

// Order-like POSTs: per store, per phone, per IP burst.
export const orderLimits = [
  make(10 * 60 * 1000, 30, slug, busy),
  make(10 * 60 * 1000, 5, phone, slow),
  make(60 * 1000, 10, ip, slow)
];
export const tableRequestLimits = [make(10 * 60 * 1000, 60, slug, busy), make(10 * 60 * 1000, 20, ip, slow)];
export const shopRequestLimit = make(60 * 60 * 1000, 5, ip, slow);

// Web Push endpoints must belong to a real push service, never an arbitrary URL the server would call.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /^web\.push\.apple\.com$/];
export function isAllowedPushEndpoint(value) {
  try {
    const u = new URL(String(value));
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
    return PUSH_HOSTS.some(re => re.test(u.hostname.toLowerCase()));
  } catch { return false; }
}
