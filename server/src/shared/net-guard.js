// Stops store-owner-supplied hosts from pointing the server at internal networks (SSRF).
import dns from 'node:dns/promises';
import net from 'node:net';

// Expands any valid IPv6 text (including ::, zone ids and a dotted IPv4 tail) to eight 16-bit groups.
export function ipv6Groups(ip) {
  let v = String(ip).toLowerCase().split('%')[0];
  const tail = v.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    if (!net.isIPv4(tail[1])) return null;
    const [w, x, y, z] = tail[1].split('.').map(Number);
    v = v.slice(0, -tail[1].length) + ((w << 8) | x).toString(16) + ':' + ((y << 8) | z).toString(16);
  }
  const halves = v.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - left.length - right.length : 0;
  const parts = [...left, ...Array(Math.max(fill, 0)).fill('0'), ...right];
  if (parts.length !== 8) return null;
  const out = parts.map(x => (/^[0-9a-f]{1,4}$/.test(x) ? parseInt(x, 16) : NaN));
  return out.some(Number.isNaN) ? null : out;
}
export function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const g = ipv6Groups(ip);
    if (!g) return true;
    const [a, b, c, d, e, f, g6, h] = g;
    const v4 = (hi, lo) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
    if (g.every(x => x === 0) || (g.slice(0, 7).every(x => x === 0) && h === 1)) return true; // :: and ::1
    if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && (f === 0xffff || f === 0)) return isPrivateAddress(v4(g6, h)); // ::ffff:a.b.c.d (dotted or hex) and ::a.b.c.d
    if (a === 0x64 && b === 0xff9b && c === 0 && d === 0 && e === 0 && f === 0) return isPrivateAddress(v4(g6, h)); // NAT64 64:ff9b::/96
    if (a === 0x2002) return isPrivateAddress(v4(b, c)); // 6to4 embeds an IPv4 address
    if (a === 0x2001 && b === 0) return true; // Teredo
    if ((a & 0xffc0) === 0xfe80 || (a & 0xffc0) === 0xfec0 || (a & 0xfe00) === 0xfc00 || (a & 0xff00) === 0xff00) return true; // link-local, site-local, ULA, multicast
    return false;
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
