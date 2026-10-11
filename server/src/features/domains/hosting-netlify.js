// Netlify hosting adapter: attaches a client's hostname as a domain alias on the Digital Shop Netlify site, removes it on
// detach, and reports the site's routing targets and certificate state. Netlify issues the certificate itself once DNS points
// at it. This adapter never touches the site's primary domain, builds, env vars, or any alias it did not add.
//
// Env: NETLIFY_API_TOKEN (secret, never logged or returned) and NETLIFY_SITE_ID. Optional NETLIFY_APEX_IPV4 (default
// 75.2.60.5) and NETLIFY_SITE_HOST (default digital-dukaan-live.netlify.app).
import { normalizeHostname } from './domain-name.js';

const API = 'https://api.netlify.com/api/v1';
const DEFAULT_IPV4 = '75.2.60.5', DEFAULT_HOST = 'digital-dukaan-live.netlify.app';
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });

// One Netlify write at a time in this process. The alias list is replaced as a whole by the API, so writes read, change and
// verify inside this lock. The lock is per process only: an edit made at the same moment elsewhere (Netlify UI or CLI, another
// server instance) can still replace the list. The read-after-write check and one retry self-heal the usual case, which is
// acceptable for a superadmin-only tool.
let chain = Promise.resolve();
const locked = fn => { const run = chain.then(fn, fn); chain = run.catch(() => {}); return run; };

export function createNetlifyAdapter({ fetchImpl = (...a) => globalThis.fetch(...a), env = process.env } = {}) {
  const token = () => env.NETLIFY_API_TOKEN, site = () => env.NETLIFY_SITE_ID;
  const siteHost = () => (env.NETLIFY_SITE_HOST || DEFAULT_HOST).toLowerCase();
  const configured = () => !!(token() && site() && /^[0-9a-f-]{20,}$/i.test(site()));

  async function call(method, path, body) {
    if (!configured()) throw fail(409, 'SERVER_SETUP_REQUIRED', 'Hosting is not configured.');
    let res;
    try {
      res = await fetchImpl(`${API}/sites/${encodeURIComponent(site())}${path}`, { method, redirect: 'error', signal: AbortSignal.timeout(8000), headers: { Authorization: `Bearer ${token()}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    } catch (e) { throw fail(502, e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'CHECK_TIMEOUT' : 'HOSTING_UNAVAILABLE', 'Hosting did not respond.'); }
    if (res.status === 429) throw Object.assign(fail(429, 'RATE_LIMITED', 'Hosting is rate limiting requests.'), { retryAfter: Number(res.headers?.get?.('retry-after')) || 30 });
    if (res.status === 401 || res.status === 403) throw fail(502, 'HOSTING_AUTH_REJECTED', 'Hosting rejected the saved credentials.');
    const json = await res.json().catch(() => null);
    if (res.status === 404 && path === '/ssl') return { status: 404, json: null };
    if (res.status === 422 || res.status === 409) throw fail(409, 'HOSTING_CONFLICT', 'Hosting refused this domain. It may be used by another site or over the plan limit.');
    if (!res.ok) throw fail(502, 'HOSTING_UNAVAILABLE', 'Hosting returned an error.');
    return { status: res.status, json };
  }
  const getSite = async () => { const { json } = await call('GET', ''); if (!json || typeof json !== 'object' || (json.domain_aliases != null && !Array.isArray(json.domain_aliases))) throw fail(502, 'HOSTING_UNAVAILABLE', 'Hosting returned an unexpected answer.'); return json; };
  const aliasesOf = s => (s.domain_aliases || []).map(a => String(a).toLowerCase());
  // Defence in depth: only a normalised customer hostname, never a platform or shared host, ever reaches the API.
  const clean = d => { const h = normalizeHostname(d.hostname).hostname; if (h === siteHost() || h.endsWith('.netlify.app')) throw fail(400, 'HOSTNAME_RESERVED', 'That hostname cannot be attached.'); return h; };

  return {
    name: 'netlify',
    config: () => configured() ? { configured: true, ipv4: [env.NETLIFY_APEX_IPV4 || DEFAULT_IPV4], ipv6: [], cname: siteHost() } : { configured: false, ipv4: [], ipv6: [], cname: '' },
    // Idempotent: already attached is a success. Verifies after writing, and retries once if another writer replaced the list.
    provision: d => locked(async () => {
      const h = clean(d);
      for (let i = 0; i < 2; i++) {
        const s = await getSite(), list = aliasesOf(s);
        if (list.includes(h)) return { status: 'pending' };
        if (s.custom_domain && String(s.custom_domain).toLowerCase() === h) return { status: 'pending' };
        await call('PATCH', '', { domain_aliases: [...(s.domain_aliases || []), h] });
      }
      if (!aliasesOf(await getSite()).includes(h)) throw fail(502, 'HOSTING_UNAVAILABLE', 'The domain could not be attached. Try again.');
      return { status: 'pending' };
    }),
    // Idempotent: only removes this hostname, leaves every other alias as it was.
    release: d => locked(async () => {
      const h = clean(d);
      const s = await getSite();
      if (!aliasesOf(s).includes(h)) return { released: true };
      await call('PATCH', '', { domain_aliases: (s.domain_aliases || []).filter(a => String(a).toLowerCase() !== h) });
      return { released: true };
    }),
    // Read-only. Hosting is "provisioned" once the alias is attached. The certificate is reported as pending until Netlify says
    // it has issued one that covers this hostname; the HTTPS probe still decides whether HTTPS actually works.
    async status(d) {
      const h = clean(d);
      const s = await getSite();
      if (!aliasesOf(s).includes(h)) return { status: 'pending', httpsStatus: 'unknown', code: 'HOSTING_CONFLICT' };
      const { json: ssl } = await call('GET', '/ssl');
      const covered = ssl && Array.isArray(ssl.domains) && ssl.domains.map(x => String(x).toLowerCase()).includes(h);
      const issued = covered && /^(issued|ok|provisioned)$/i.test(String(ssl.state || ''));
      return { status: 'provisioned', httpsStatus: issued ? 'ok' : 'pending', certPending: !issued, tlsExpiresAt: issued && ssl.expires_at ? new Date(ssl.expires_at) : null, code: issued ? undefined : 'TLS_PENDING' };
    }
  };
}
export const netlifyAdapter = createNetlifyAdapter();
