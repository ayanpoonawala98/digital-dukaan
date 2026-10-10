// Shareable bill page. Chat apps (WhatsApp, Telegram...) read this page's metadata to build the link preview, so it carries
// the STORE's name and photo. People who open it are sent straight on to the PDF. Access stays gated by the signed token
// in the URL; the metadata is store name, image, bill number and total only (no customer details).
const API = 'https://api.digitalshop.website';
const DEFAULT_IMAGE = 'https://ik.imagekit.io/digitaldukaanayan/digital-dukaan/branding/digital-dukaan-hero_Z71uTHmDJ.jpg';
export const config = { path: ['/bill/*', '/lead/*', '/restaurant/*'], onError: 'bypass' };
const e = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
// Previews want a modest JPEG. ImageKit URLs get a resize; anything else is used as is. Only https images.
export function previewImage(...candidates) {
  for (const value of candidates) {
    try {
      const u = new URL(value);
      if (u.protocol !== 'https:' || u.username || u.password) continue;
      if (u.hostname === 'ik.imagekit.io' && !u.searchParams.has('tr')) u.search = '?tr=w-1200,h-630,c-at_max,f-jpg,q-80';
      return u.href;
    } catch { /* try the next one */ }
  }
  return DEFAULT_IMAGE;
}
export const parseBillPath = (host, pathname) => {
  const bare = String(host).toLowerCase().startsWith('bill.');
  const m = pathname.match(bare ? /^(?:\/bill)?\/(lead|restaurant)\/(\d{1,10})\/([0-9a-f]{32})\/?$/ : /^\/bill\/(lead|restaurant)\/(\d{1,10})\/([0-9a-f]{32})\/?$/);
  return m ? { kind: m[1], id: m[2], sig: m[3] } : null;
};
export const pdfUrl = ({ kind, id, sig }) => `${API}/api/public/bill/${kind}/${id}/${sig}?design=2`;
export function billPage({ kind, id, sig }, meta, pageUrl) {
  const store = clean(meta.store?.name, 120) || 'Your shop';
  const num = clean(meta.number, 20) || id;
  const total = Number(meta.total) > 0 ? ` Total Rs.${Number(meta.total).toLocaleString('en-IN', { maximumFractionDigits: 2 })}.` : '';
  const title = `${kind === 'restaurant' ? 'Bill' : 'Order bill'} #${num} - ${store}`;
  const description = `${store} sent you your bill.${total} Tap to open it.`;
  const image = previewImage(meta.store?.logoUrl, meta.store?.coverUrl);
  const target = pdfUrl({ kind, id, sig });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)}</title><meta name="description" content="${e(description)}"/><meta name="robots" content="noindex,nofollow"/><meta name="referrer" content="no-referrer"/><meta property="og:type" content="website"/><meta property="og:site_name" content="${e(store)}"/><meta property="og:title" content="${e(title)}"/><meta property="og:description" content="${e(description)}"/><meta property="og:url" content="${e(pageUrl)}"/><meta property="og:image" content="${e(image)}"/><meta property="og:image:alt" content="${e(store)}"/><meta name="twitter:card" content="summary_large_image"/><meta name="twitter:title" content="${e(title)}"/><meta name="twitter:description" content="${e(description)}"/><meta name="twitter:image" content="${e(image)}"/><meta http-equiv="refresh" content="0;url=${e(target)}"/></head><body style="font-family:system-ui,sans-serif;text-align:center;padding:48px 16px"><h1 style="font-size:20px">${e(store)}</h1><p>Opening your bill...</p><p><a href="${e(target)}">Open the bill</a></p><script>location.replace(${JSON.stringify(target).replace(/</g, '\\u003c')})</script></body></html>`;
}
export default async function handler(request) {
  const url = new URL(request.url);
  const parts = parseBillPath(url.hostname, url.pathname);
  if (!parts || !['GET', 'HEAD'].includes(request.method)) return;
  const headers = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' };
  let meta;
  try {
    const r = await fetch(`${API}/api/public/bill/${parts.kind}/${parts.id}/${parts.sig}/meta`, { signal: AbortSignal.timeout(4000) });
    if (r.status === 404) return new Response('Bill not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': 'noindex' } });
    if (!r.ok) throw new Error('meta unavailable');
    meta = await r.json();
  } catch { return Response.redirect(pdfUrl(parts), 302); } // never block a bill because previews are down
  return new Response(request.method === 'HEAD' ? null : billPage(parts, meta, url.origin + url.pathname), { status: 200, headers });
}
