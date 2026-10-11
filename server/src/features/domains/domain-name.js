// Hostname rules for client custom domains. Pure, no network. One normalised form is used everywhere
// (storage, uniqueness, lookups, CORS, TLS allow), so a lookalike spelling can never reach a different row.
import net from 'node:net';
import { domainToASCII, domainToUnicode } from 'node:url';

// Multi-label public suffixes we refuse to treat as a client's own domain. A client domain must sit below one.
// Not the full public suffix list: it covers the suffixes our clients use. Unknown suffixes fall back to "one label + TLD".
const MULTI_SUFFIXES = new Set(['co.in', 'net.in', 'org.in', 'gen.in', 'firm.in', 'ind.in', 'ac.in', 'edu.in', 'res.in', 'gov.in', 'nic.in', 'co.uk', 'org.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'co.za', 'com.sg', 'com.my', 'com.pk', 'com.bd', 'com.np', 'com.lk', 'co.ae', 'com.sa', 'com.br', 'com.mx', 'co.jp', 'co.id', 'com.cn', 'com.hk', 'com.tr']);
// Hosting platforms where every customer shares one parent: nobody owns the parent, so it can't be proven.
const SHARED_PARENTS = ['netlify.app', 'vercel.app', 'onrender.com', 'herokuapp.com', 'github.io', 'pages.dev', 'workers.dev', 'web.app', 'firebaseapp.com', 'azurewebsites.net', 'amazonaws.com', 'cloudfront.net', 'ngrok.io', 'ngrok-free.app', 'trycloudflare.com', 'nip.io', 'sslip.io', 'xip.io'];
const PLATFORM_ROOTS = ['digitalshop.website', 'digitaldukaan.space'];
const RESERVED_LABELS = new Set(['api', 'admin', 'bill', 'bills', 'preview', 'login', 'dashboard', 'superadmin', 'internal', 'staging']);

export const err = (code, message) => Object.assign(new Error(message), { status: 400, code });

function envHosts() {
  return (process.env.CLIENT_URL || '').split(',').map(u => { try { return new URL(u.trim()).hostname.toLowerCase(); } catch { return ''; } }).filter(Boolean);
}
export function isPlatformHost(host, extra = envHosts()) {
  const h = String(host || '').toLowerCase();
  return [...PLATFORM_ROOTS, ...extra].some(root => h === root || h.endsWith(`.${root}`)) || h === 'localhost' || h.endsWith('.localhost');
}

export function publicSuffixOf(host) {
  const parts = host.split('.');
  const two = parts.slice(-2).join('.');
  return MULTI_SUFFIXES.has(two) ? two : parts[parts.length - 1];
}

// Returns { hostname, display }. Throws err(code, message) with an app-owned code.
export function normalizeHostname(input) {
  if (typeof input !== 'string') throw err('HOSTNAME_INVALID', 'Enter a domain name.');
  let v = input.trim();
  if (!v || v.length > 600) throw err('HOSTNAME_INVALID', 'Enter a domain name.');
  if (/[\s\u0000-\u001f\u007f]/.test(v)) throw err('HOSTNAME_INVALID', 'A domain cannot contain spaces.');
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v) || v.includes('/') || v.includes('?') || v.includes('#') || v.includes('\\')) throw err('HOSTNAME_HAS_URL', 'Enter only the domain, like shop.example.com, without https:// or a path.');
  if (v.startsWith('[')) throw err('HOSTNAME_IS_IP', 'Use a domain name, not an IP address.');
  if (v.includes('@')) throw err('HOSTNAME_HAS_CREDENTIALS', 'A domain cannot contain a username or password.');
  if (v.includes(':')) throw err('HOSTNAME_HAS_PORT', 'A domain cannot include a port number.');
  if (v.includes('*')) throw err('HOSTNAME_WILDCARD', 'Wildcard domains are not supported. Enter one exact hostname.');
  if (v.endsWith('.')) v = v.slice(0, -1);
  if (net.isIP(v) || /^[0-9.]+$/.test(v) || /^0x[0-9a-f]+$/i.test(v)) throw err('HOSTNAME_IS_IP', 'Use a domain name, not an IP address.');
  const hostname = domainToASCII(v.toLowerCase());
  if (!hostname) throw err('HOSTNAME_INVALID', 'That is not a valid domain name.');
  if (hostname.length > 253) throw err('HOSTNAME_INVALID', 'That domain is too long.');
  const labels = hostname.split('.');
  if (labels.length < 2 || labels.some(l => !l || l.length > 63 || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(l) || (l.slice(2, 4) === '--' && !l.startsWith('xn--')))) throw err('HOSTNAME_INVALID', 'That is not a valid domain name.');
  const tld = labels[labels.length - 1];
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/.test(tld)) throw err('HOSTNAME_INVALID', 'That domain ending is not valid.');
  const suffix = publicSuffixOf(hostname);
  if (hostname === suffix || labels.length <= suffix.split('.').length) throw err('HOSTNAME_PUBLIC_SUFFIX', 'That is a public domain ending. Enter the client\'s own domain, like shop.example.com.');
  if (SHARED_PARENTS.some(p => hostname === p || hostname.endsWith(`.${p}`))) throw err('HOSTNAME_SHARED_HOST', 'Domains on shared hosting addresses cannot be verified. Use the client\'s own domain.');
  if (isPlatformHost(hostname)) throw err('HOSTNAME_RESERVED', 'That domain belongs to Digital Shop and cannot be connected to a store.');
  if (RESERVED_LABELS.has(labels[0]) && labels.length > suffix.split('.').length + 1) throw err('HOSTNAME_RESERVED', 'That hostname is reserved. Pick a different one.');
  return { hostname, display: domainToUnicode(hostname) || hostname };
}
// For lookups: never throws, returns '' for anything that is not a plain valid hostname.
export function safeHostname(input) {
  try { return normalizeHostname(input).hostname; } catch { return ''; }
}
