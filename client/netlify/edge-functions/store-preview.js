// Response-time store metadata: social crawlers do not execute the React app.
const API = 'https://api.digitalshop.website';
const ROOT = 'https://digitalshop.website';
export const config = { path: '/store/*' };
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function logoUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; } catch { return ''; }
}
export function storeHtml(html, business, slug, paused = false) {
  const name = String(business.name).slice(0, 200);
  const description = paused ? `${name} is temporarily unavailable.` : String(business.description || `Explore ${name}'s products and shop on WhatsApp.`).replace(/\s+/g, ' ').slice(0, 300);
  const canonical = `${ROOT}/store/${slug}`;
  const image = paused ? '' : logoUrl(business.logoUrl);
  const e = escapeHtml;
  const tags = `<title>${e(name)}</title><meta name="description" content="${e(description)}"/><meta property="og:type" content="website"/><meta property="og:site_name" content="${e(name)}"/><meta property="og:title" content="${e(name)}"/><meta property="og:description" content="${e(description)}"/><meta property="og:url" content="${e(canonical)}"/>${image ? `<meta property="og:image" content="${e(image)}"/><meta property="og:image:alt" content="${e(name)} logo"/>` : ''}<meta name="twitter:card" content="summary"/><meta name="twitter:title" content="${e(name)}"/><meta name="twitter:description" content="${e(description)}"/>${image ? `<meta name="twitter:image" content="${e(image)}"/>` : ''}<link rel="canonical" href="${e(canonical)}"/>${paused ? '<meta name="robots" content="noindex"/>' : ''}`;
  // Remove only metadata/schema, never app scripts, styles, fonts or the app root.
  return html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\b[^>]*(?:property\s*=\s*["']og:[^"']+["']|name\s*=\s*["'](?:twitter:[^"']+|description)["'])[^>]*>/gi, '')
    .replace(/<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/gi, '')
    .replace(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<meta\b[^>]*name\s*=\s*["']robots["'][^>]*>/gi, paused ? '' : '$&')
    .replace(/<\/head>/i, `${tags}</head>`);
}
export default async function handler(request, context) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/store\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/);
  if (!match || !['GET','HEAD'].includes(request.method)) return;
  const slug = match[1];
  // Only public metadata, fixed API origin, no auth/cookies or order/customer data.
  let data;
  try {
    const response = await fetch(`${API}/api/public/stores/${slug}`, { signal: AbortSignal.timeout(5000) });
    if (response.status === 404) return new Response('Shop not found', { status:404, headers:{'content-type':'text/plain; charset=utf-8','x-robots-tag':'noindex'} });
    if (!response.ok) return;
    data = await response.json();
    if (!data?.business?.name) return;
  } catch { return; } // Keep the storefront available if the public API is down.
  const base = await context.next();
  if (!base.ok || !base.headers.get('content-type')?.includes('text/html')) return base;
  const html = storeHtml(await base.text(), data.business, slug, Boolean(data.paused));
  const headers = new Headers(base.headers);
  for (const name of ['etag','content-length','content-encoding','last-modified']) headers.delete(name);
  headers.set('content-type','text/html; charset=utf-8');
  headers.set('cache-control','public, max-age=0, must-revalidate');
  headers.set('x-store-preview','store-logo-v1');
  if (data.paused) headers.set('x-robots-tag','noindex');
  return new Response(request.method === 'HEAD' ? null : html, {status:base.status, headers});
}
