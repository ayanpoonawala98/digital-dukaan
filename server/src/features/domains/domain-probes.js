// Fixed, bounded DNS and HTTPS probes for client domains. Only the hostname being verified is ever contacted, always through
// the existing SSRF guard (public addresses only), with a hard deadline and no redirects. Results use app-owned codes.
import dns from 'node:dns/promises';
import https from 'node:https';
import { publicAddress } from '../../shared/net-guard.js';

const withDeadline = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'CHECK_TIMEOUT' })), ms).unref())]);
const resolver = () => { const r = new dns.Resolver({ timeout: 2500, tries: 1 }); if (process.env.DOMAINS_DNS_SERVERS) r.setServers(process.env.DOMAINS_DNS_SERVERS.split(',').map(s => s.trim()).filter(Boolean)); return r; };
const EMPTY = new Set(['ENODATA', 'ENOTFOUND', 'NOTFOUND', 'NODATA']);
const classify = e => e?.code === 'CHECK_TIMEOUT' || e?.code === 'ETIMEOUT' ? 'CHECK_TIMEOUT' : 'CHECK_UNAVAILABLE';

async function safe(fn) { try { return await fn(); } catch (e) { if (EMPTY.has(e?.code)) return []; throw e; } }

export async function lookupTxt(name, ms = 5000) {
  try {
    const rows = await withDeadline(safe(() => resolver().resolveTxt(name)), ms);
    return { ok: true, values: rows.map(r => r.join('')) };
  } catch (e) { return { ok: false, code: classify(e) }; }
}
export async function lookupRoute(host, ms = 5000) {
  try {
    const r = resolver();
    const [a, aaaa, cname] = await withDeadline(Promise.all([safe(() => r.resolve4(host)), safe(() => r.resolve6(host)), safe(() => r.resolveCname(host))]), ms);
    return { ok: true, a, aaaa, cname };
  } catch (e) { return { ok: false, code: classify(e) }; }
}

// HTTPS probe: connects to the public address of `host`, validates the certificate for that exact name, then asks the
// storefront which store it serves. 3xx is a mismatch (no redirect following). Body capped at 4 KB.
export function probeHttps(host, { lookup, ms = 5000, requestImpl = https.request } = {}) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    publicAddress(host, lookup).then(ip => {
      const req = requestImpl({ host: ip, servername: host, port: 443, method: 'GET', path: `/api/public/domain-resolve?host=${encodeURIComponent(host)}`, headers: { Host: host, Accept: 'application/json', 'User-Agent': 'DigitalShopDomainCheck/1' }, rejectUnauthorized: true, timeout: ms }, res => {
        const cert = res.socket?.getPeerCertificate?.();
        const expires = cert?.valid_to ? new Date(cert.valid_to) : null;
        if (res.statusCode >= 300 && res.statusCode < 400) { res.resume(); return finish({ ok: true, tls: true, expires, routed: false, code: 'ROUTING_MISMATCH' }); }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', c => { body += c; if (body.length > 4096) { res.destroy(); } });
        res.on('end', () => { let slug = ''; try { const j = JSON.parse(body); slug = typeof j.slug === 'string' ? j.slug : ''; } catch { /* malformed upstream */ } finish({ ok: true, tls: true, expires, routed: res.statusCode === 200 && !!slug, slug, code: res.statusCode === 200 && slug ? undefined : 'ROUTING_MISMATCH' }); });
        res.on('close', () => finish({ ok: true, tls: true, expires, routed: false, code: 'ROUTING_MISMATCH' }));
      });
      req.on('timeout', () => { req.destroy(); finish({ ok: false, code: 'CHECK_TIMEOUT' }); });
      req.on('error', e => finish(/CERT|SELF_SIGNED|certificate|ERR_TLS|altname/i.test(`${e.code} ${e.message}`) ? { ok: true, tls: false, code: 'TLS_FAILED' } : e.code === 'ECONNREFUSED' || e.code === 'ECONNRESET' ? { ok: true, tls: false, code: 'TLS_PENDING' } : { ok: false, code: classify(e) }));
      req.end();
    }).catch(() => finish({ ok: false, code: 'CHECK_UNAVAILABLE' }));
    setTimeout(() => finish({ ok: false, code: 'CHECK_TIMEOUT' }), ms + 1000).unref();
  });
}
export const defaultProbes = { txt: lookupTxt, route: lookupRoute, https: probeHttps };
