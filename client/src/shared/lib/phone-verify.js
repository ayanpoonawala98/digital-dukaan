// Browser side of storefront WhatsApp phone verification. The session token lives in localStorage per store and is sent as a header.
const BID = 'dd-browser-id', tokKey = slug => `dd-verify:${slug}`;
export function browserId() {
  try { let b = localStorage.getItem(BID); if (!b || !/^[A-Za-z0-9_-]{20,64}$/.test(b)) { const a = new Uint8Array(24); crypto.getRandomValues(a); b = btoa(String.fromCharCode(...a)).replace(/[+/=]/g, c => ({ '+': '-', '/': '_', '=': '' }[c])); localStorage.setItem(BID, b); } return b; } catch { return 'x'.repeat(24); }
}
export const getToken = slug => { try { return localStorage.getItem(tokKey(slug)) || ''; } catch { return ''; } };
export const setToken = (slug, t) => { try { t ? localStorage.setItem(tokKey(slug), t) : localStorage.removeItem(tokKey(slug)); } catch { /* storage can be blocked */ } };
// Headers for public store calls that create orders or touch verification.
export function verifyHeaders(path, method = 'GET') {
  const m = /^\/public\/stores\/([^/]+)\//.exec(path);
  if (!m) return {};
  const isVerify = path.includes('/verify/');
  if (!isVerify && ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) return {};
  const h = { 'X-DS-Browser': browserId() }, t = getToken(decodeURIComponent(m[1]));
  if (t) h['X-DS-Verify'] = t;
  return h;
}
// Same normalisation as the server: bare 10 digit Indian mobiles get 91.
export function normalizePhone(value) {
  const d = String(value ?? '').replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(d)) return `91${d}`;
  if (d.length === 11 && d.startsWith('0') && /^[6-9]\d{9}$/.test(d.slice(1))) return `91${d.slice(1)}`;
  return /^[1-9]\d{7,14}$/.test(d) ? d : '';
}

// 43 char URL-safe secret (256 bits). The browser creates it, the server stores only its hash.
export function newSessionSecret() { const a = new Uint8Array(32); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/[+/=]/g, c => ({ '+': '-', '/': '_', '=': '' }[c])); }
