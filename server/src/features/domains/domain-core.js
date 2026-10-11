// Pure domain state rules. No DB, no network: the service feeds results in, the UI renders what comes out.
import crypto from 'node:crypto';
import { publicSuffixOf } from './domain-name.js';

export const OWNERSHIP_LABEL = '_digitalshop-verify';
export const OWNERSHIP_TTL_MS = 7 * 86400000;
export const CODES = ['OWNERSHIP_MISSING', 'OWNERSHIP_EXPIRED', 'DNS_MISMATCH', 'DNS_NOT_FOUND', 'DOMAIN_ALREADY_ASSIGNED', 'HOSTING_CONFLICT', 'SERVER_SETUP_REQUIRED', 'TLS_PENDING', 'TLS_FAILED', 'ROUTING_MISMATCH', 'CHECK_TIMEOUT', 'CHECK_UNAVAILABLE', 'HOSTING_AUTH_REJECTED', 'HOSTING_UNAVAILABLE', 'RATE_LIMITED'];

export const newOwnershipToken = () => crypto.randomBytes(24).toString('hex');
export const ownershipRecord = (hostname, token) => ({ type: 'TXT', host: `${OWNERSHIP_LABEL}.${hostname}`, value: `digitalshop-verify=${token}`, ttl: 300 });
export function tokenMatches(values, token) {
  const want = Buffer.from(`digitalshop-verify=${token}`);
  return (values || []).some(v => { const got = Buffer.from(String(v).trim().replace(/^"|"$/g, '')); return got.length === want.length && crypto.timingSafeEqual(got, want); });
}

// Records the client must add once the server is ready. Never invents targets: with no verified hosting config, none are shown.
// An apex (example.com, example.co.in) cannot be a CNAME, so it gets A/AAAA when the hosting has them. A subdomain gets the
// CNAME when the hosting has one. Falls back to whichever record type the hosting provides.
export const isApex = hostname => { const l = hostname.split('.').length; return l === publicSuffixOf(hostname).split('.').length + 1; };
export function routingRecords(hostname, hosting) {
  if (!hosting?.configured) return [];
  const addr = [...(hosting.ipv4 || []).map(v => ({ type: 'A', host: hostname, value: v, ttl: 300 })), ...(hosting.ipv6 || []).map(v => ({ type: 'AAAA', host: hostname, value: v, ttl: 300 }))];
  const cname = hosting.cname ? [{ type: 'CNAME', host: hostname, value: hosting.cname, ttl: 300 }] : [];
  return isApex(hostname) ? (addr.length ? addr : cname) : (cname.length ? cname : addr);
}

// Compares resolved DNS to the expected routing targets. Returns { ok, code }.
export function dnsMatches(resolved, hosting) {
  if (!hosting?.configured) return { ok: false, code: 'SERVER_SETUP_REQUIRED' };
  const a = resolved?.a || [], aaaa = resolved?.aaaa || [], cname = (resolved?.cname || []).map(c => c.toLowerCase().replace(/\.$/, ''));
  if (!a.length && !aaaa.length && !cname.length) return { ok: false, code: 'DNS_NOT_FOUND' };
  if (hosting.cname && cname.includes(hosting.cname.toLowerCase())) return { ok: true };
  if (hosting.ipv4?.length && a.length && a.every(x => hosting.ipv4.includes(x))) return { ok: true };
  if (hosting.ipv6?.length && aaaa.length && aaaa.every(x => hosting.ipv6.includes(x))) return { ok: true };
  return { ok: false, code: 'DNS_MISMATCH' };
}

const STEP = { unknown: 'unknown', pending: 'pending', ok: 'ok', failed: 'failed' };
export const stepState = v => STEP[v] || 'unknown';

// Overall state from the four separate checks. Live needs ALL of them. Amber states stay amber until a real failure.
export function overallState(d, hostingReady) {
  if (d.detachedAt) return 'disconnected';
  const o = stepState(d.ownershipStatus), n = stepState(d.dnsStatus), h = stepState(d.hostingStatus), t = stepState(d.httpsStatus), r = stepState(d.routingStatus);
  if (o === 'failed' || n === 'failed' || h === 'failed' || t === 'failed' || r === 'failed') return 'failed';
  if (d.activatedAt && o === 'ok' && n === 'ok' && h === 'ok' && t === 'ok' && r === 'ok') return 'live';
  if (o !== 'ok') return 'pending_dns';
  if (!hostingReady) return 'server_setup_required';
  if (n !== 'ok') return 'verifying';
  if (h !== 'ok' || t !== 'ok') return 'provisioning';
  return r === 'ok' ? 'ready_to_activate' : 'provisioning';
}
export const STATE_TONE = { live: 'green', pending_dns: 'amber', verifying: 'amber', provisioning: 'amber', server_setup_required: 'amber', ready_to_activate: 'amber', failed: 'red', disconnected: 'neutral' };

// May the server authorise a TLS certificate for this domain? Ownership + DNS verified, hosting configured and the domain
// has been moved to provisioning. Decided from stored results only: never from live DNS at handshake time.
export const tlsAuthorized = (d, hostingReady) => !d.detachedAt && hostingReady && stepState(d.ownershipStatus) === 'ok' && stepState(d.dnsStatus) === 'ok' && d.provisioningAuthorizedAt != null;
export const canActivate = (d, hostingReady) => !d.detachedAt && hostingReady && ['ownershipStatus', 'dnsStatus', 'hostingStatus', 'httpsStatus', 'routingStatus'].every(k => stepState(d[k]) === 'ok');

export function nextAction(state, d) {
  switch (state) {
    case 'pending_dns': return d.ownershipCode === 'OWNERSHIP_EXPIRED' ? 'The ownership record expired. Press "New ownership record", add it at the DNS provider, then press "Check again".' : 'Add the ownership TXT record at the client\'s DNS provider, then press "Check again".';
    case 'server_setup_required': return 'Ownership is confirmed. Routing records appear here once the Digital Shop server is set up.';
    case 'verifying': return 'Add the routing records at the DNS provider, then press "Check again". DNS changes can take up to a few hours to show.';
    case 'provisioning': return 'HTTPS is being set up. Press "Check again" in a few minutes.';
    case 'ready_to_activate': return 'Everything checks out. Press "Activate" to make the storefront live.';
    case 'failed': return 'Fix the problem shown, then press "Check again".';
    case 'live': return 'Nothing to do. The domain is serving the storefront.';
    default: return '';
  }
}

export const HOSTING_STEP_LABELS = { setup_required: 'Server setup required', pending: 'Pending', provisioned: 'Provisioned', failed: 'Failed' };
