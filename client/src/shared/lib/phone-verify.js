import { customHost } from '../../features/storefront/custom-host.js';
// Browser side of storefront WhatsApp phone verification. The session lives in a Secure HttpOnly cookie the page cannot read;
// this file only holds a throwaway browser id (a CSRF header and challenge binding) and the phone normaliser.
const BID = 'dd-browser-id';
const rand = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/[+/=]/g, c => ({ '+': '-', '/': '_', '=': '' }[c])); };
export function browserId() {
  try { let b = localStorage.getItem(BID); if (!b || !/^[A-Za-z0-9_-]{20,64}$/.test(b)) { b = rand(24); localStorage.setItem(BID, b); } return b; } catch { return 'x'.repeat(24); }
}
// Headers for public store calls that create orders or touch verification.
export function verifyHeaders(path, method = 'GET') {
  if (!/^\/public\/stores\/[^/]+\//.test(path)) return {};
  if (!path.includes('/verify/') && ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) return {};
  return { 'X-DS-Browser': browserId() };
}
// Cookies are needed only for verification and order calls, and only on the platform's own site. A client's custom domain is cross-site
// to the API, so it keeps the plain CORS request (no credentials) exactly as before.
export const needsCredentials = path => !customHost() && /^\/public\/stores\/[^/]+\/(verify\/|my-orders$|restaurant-orders|enquire-cart|products\/[^/]+\/enquire)/.test(path);
// Same normalisation as the server: bare 10 digit Indian mobiles get 91.
export function normalizePhone(value) {
  const d = String(value ?? '').replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(d)) return `91${d}`;
  if (d.length === 11 && d.startsWith('0') && /^[6-9]\d{9}$/.test(d.slice(1))) return `91${d.slice(1)}`;
  return /^[1-9]\d{7,14}$/.test(d) ? d : '';
}
// 43 char URL-safe secret. Proves to the server that this browser started the challenge. It is not the session.
export const newClaimSecret = () => rand(32);
