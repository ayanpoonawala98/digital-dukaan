// Stops store-owner-supplied hosts from pointing the server at internal networks (SSRF).
import dns from 'node:dns/promises';
import net from 'node:net';

export function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::' || v === '::1' || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb') || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('ff')) return true;
    const m = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return m ? isPrivateAddress(m[1]) : false;
  }
  return true;
}
export function looksInternal(host) {
  const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.') && !net.isIP(h)) return true;
  return net.isIP(h) ? isPrivateAddress(h) : false;
}
// Resolves the host and returns a public address, or throws. lookup is injectable for tests.
export async function publicAddress(host, lookup = dns.lookup) {
  if (looksInternal(host)) throw new Error('That host is not allowed');
  const h = String(host).replace(/^\[|\]$/g, '');
  if (net.isIP(h)) return h;
  const list = await lookup(h, { all: true });
  if (!list.length || list.some(a => isPrivateAddress(a.address))) throw new Error('That host is not allowed');
  return list[0].address;
}
