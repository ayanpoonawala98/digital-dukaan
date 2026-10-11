// Host-to-store resolution for client custom domains. Pure helpers, no api.js import (so they are testable).
// Hosts that serve the Digital Shop app itself (platform inventory verified by the lead). Matching is exact or by dot-suffix,
// except deploy permalinks which are matched by the "--<site>.netlify.app" suffix.
const PLATFORM_HOSTS = ['digitalshop.website', 'www.digitalshop.website', 'bill.digitalshop.website', 'digital-dukaan-live.netlify.app', 'digital-dukaan-app.vercel.app', 'localhost', '127.0.0.1'];
const PLATFORM_SUFFIXES = ['.digitalshop.website', '--digital-dukaan-live.netlify.app'];
// Legacy per-store subdomains are handled by hostedStoreSlug() in store-domain.js. They are never treated as client domains here.
const LEGACY_SUFFIX = '.digitaldukaan.space';
export const platformHosts = () => [...PLATFORM_HOSTS, ...String(import.meta.env?.VITE_PLATFORM_HOSTS || '').split(',').map(h => h.trim().toLowerCase()).filter(Boolean)];
export function isPlatformHost(host, extra = platformHosts()) {
  const h = String(host || '').toLowerCase();
  return !h || h.endsWith('.localhost') || h.endsWith(LEGACY_SUFFIX) || h === LEGACY_SUFFIX.slice(1) || /^[0-9.]+$/.test(h) || h.includes(':') || extra.includes(h) || PLATFORM_SUFFIXES.some(x => h.endsWith(x));
}
export const customHost = (host = window.location.hostname) => isPlatformHost(host) ? null : String(host).toLowerCase();
// Which routes a client host may render. Login, admin, signup and password setup never render on a client host.
export const CLIENT_HOST_ROUTES = ['/', '/product/:id', '/store/:slug', '/store/:slug/product/:id', '/store/:slug/order/:id', '/store/:slug/order/lead/:id', '/store/:slug/orders', '/offers/opt-out/:token'];
export const BLOCKED_ON_CLIENT_HOST = ['/login', '/signup', '/set-password', '/dashboard', '/superadmin', '/near'];
export const clientHostAllows = path => !BLOCKED_ON_CLIENT_HOST.some(p => path === p || path.startsWith(`${p}/`));
