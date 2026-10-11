// Hosting provider interface for client domains. Adapters know how a domain gets routed and given HTTPS. Nothing else in the
// domain feature names a hosting vendor. The only adapter today is "self-hosted pending": it reports "server setup required"
// and refuses to provision. DOMAINS_HOSTING_ADAPTER=netlify selects the Netlify adapter (hosting-netlify.js). Another adapter
// (for example a Caddy server) is added the same way and registered in ADAPTERS.
//
// An adapter provides:
//   name                       short id stored on each domain row
//   config()                   { configured, ipv4[], ipv6[], cname } verified routing targets, or { configured:false }
//   provision(domain)          start routing + HTTPS for the domain -> { status: 'pending'|'provisioned' }
//   status(domain)             -> { status, httpsStatus, tlsExpiresAt?, code? }
//   release(domain)            stop serving the domain (idempotent)
import { netlifyAdapter } from './hosting-netlify.js';
export const selfHostedPending = {
  name: 'self-hosted-pending',
  config: () => ({ configured: false, ipv4: [], ipv6: [], cname: '' }),
  async provision() { throw Object.assign(new Error('The Digital Shop server is not set up for custom domains yet.'), { status: 409, code: 'SERVER_SETUP_REQUIRED' }); },
  async status() { return { status: 'setup_required', httpsStatus: 'unknown' }; },
  async release() { return { released: true }; }
};
const ADAPTERS = { [selfHostedPending.name]: selfHostedPending, [netlifyAdapter.name]: netlifyAdapter };
export const activeAdapter = () => ADAPTERS[process.env.DOMAINS_HOSTING_ADAPTER] || selfHostedPending;
export const adapterByName = name => ADAPTERS[name] || selfHostedPending;
export const hostingSummary = (adapter = activeAdapter()) => { const c = adapter.config(); return { adapter: adapter.name, configured: !!c.configured, ipv4: c.ipv4 || [], ipv6: c.ipv6 || [], cname: c.cname || '' }; };
