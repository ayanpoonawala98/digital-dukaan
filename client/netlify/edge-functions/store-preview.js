// Response-time store metadata: social crawlers do not execute the React app.
const API = 'https://api.digitalshop.website';
const ROOT = 'https://digitalshop.website';
export const config = { path: '/store/*', onError: 'bypass' };
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Preview image: the shop's own picture, resized for chat apps; the platform image only when the shop has none.
export function shareImage(...candidates) {
  for (const value of candidates) {
    const u = logoUrl(value);
    if (!u) continue;
    try { const x = new URL(u); if (x.hostname === 'ik.imagekit.io' && !x.searchParams.has('tr')) x.search = '?tr=w-1200,h-630,c-at_max,f-jpg,q-80'; return x.href; } catch { /* next */ }
  }
  return ''; // no shop picture: show none rather than the platform's
}
export function logoUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; } catch { return ''; }
}
const jsonLdText = obj => JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
const clean = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const TYPES = { restaurant: 'Restaurant', retail: 'Store', services: 'LocalBusiness' };
// Structured data for a shop. Only fields the public storefront already shows; no phone numbers, owner or customer data.
export function storeSchema(business, slug) {
  const url = `${ROOT}/store/${slug}`, image = logoUrl(business.logoUrl) || logoUrl(business.coverUrl);
  const place = clean(business.area || business.location, 120), pin = clean(business.pincode, 10);
  const node = { '@context': 'https://schema.org', '@type': TYPES[business.storeType] || 'LocalBusiness', '@id': `${url}#shop`, name: clean(business.name, 200), url, ...(clean(business.description, 500) ? { description: clean(business.description, 500) } : {}), ...(image ? { image } : {}) };
  if (place || pin) node.address = { '@type': 'PostalAddress', ...(place ? { addressLocality: place } : {}), ...(pin ? { postalCode: pin } : {}), addressCountry: 'IN' };
  if (Number.isFinite(Number(business.latitude)) && Number.isFinite(Number(business.longitude)) && business.latitude !== null && business.longitude !== null) node.geo = { '@type': 'GeoCoordinates', latitude: Number(business.latitude), longitude: Number(business.longitude) };
  if (business.autoHours && /^\d{2}:\d{2}$/.test(business.openTime || '') && /^\d{2}:\d{2}$/.test(business.closeTime || '')) node.openingHoursSpecification = { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], opens: business.openTime, closes: business.closeTime };
  if (business.storeType === 'restaurant') node.hasMenu = url;
  return node;
}
export function productSchema(business, product, slug) {
  const url = `${ROOT}/store/${slug}/product/${product.id}`, shop = `${ROOT}/store/${slug}`;
  const images = [product.imageUrl, ...(Array.isArray(product.imageUrls) ? product.imageUrls : [])].map(logoUrl).filter(Boolean).slice(0, 6);
  const variants = Array.isArray(product.variants) ? product.variants.map(v => Number(v.price)).filter(Number.isFinite) : [];
  const price = variants.length ? Math.min(...variants) : Number(product.price);
  const out = product.stock === 0 || product.soldOutToday;
  const node = { '@context': 'https://schema.org', '@type': 'Product', '@id': `${url}#product`, name: clean(product.name, 200), url, ...(clean(product.description, 500) ? { description: clean(product.description, 500) } : {}), ...(images.length ? { image: images } : {}), ...(product.category?.name ? { category: clean(product.category.name, 80) } : {}), brand: { '@type': 'Brand', name: clean(business.name, 200) } };
  if (Number.isFinite(price)) node.offers = { '@type': 'Offer', url, priceCurrency: 'INR', price: price.toFixed(2), availability: out ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock', seller: { '@type': 'Organization', name: clean(business.name, 200), url: shop } };
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Digital Shop', item: `${ROOT}/` }, { '@type': 'ListItem', position: 2, name: clean(business.name, 200), item: shop }, { '@type': 'ListItem', position: 3, name: clean(product.name, 200), item: url }] };
  return [node, crumbs];
}
// Replace only metadata/schema, never app scripts, styles, fonts or the app root.
export function pageHtml(html, { title, siteName = '', description, canonical, image, imageAlt, type = 'website', robots = '', schema = [], noscript = '' }) {
  const e = escapeHtml;
  const tags = `<title>${e(title)}</title><meta name="description" content="${e(description)}"/><meta property="og:type" content="${e(type)}"/><meta property="og:site_name" content="${e(siteName || title)}"/><meta property="og:title" content="${e(title)}"/><meta property="og:description" content="${e(description)}"/><meta property="og:url" content="${e(canonical)}"/>${image ? `<meta property="og:image" content="${e(image)}"/><meta property="og:image:alt" content="${e(imageAlt || title)}"/>` : ''}<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}"/><meta name="twitter:title" content="${e(title)}"/><meta name="twitter:description" content="${e(description)}"/>${image ? `<meta name="twitter:image" content="${e(image)}"/>` : ''}<link rel="canonical" href="${e(canonical)}"/>${robots ? `<meta name="robots" content="${e(robots)}"/>` : ''}${schema.map(n => `<script type="application/ld+json">${jsonLdText(n)}</script>`).join('')}`;
  let out = html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\b[^>]*(?:property\s*=\s*["']og:[^"']+["']|name\s*=\s*["'](?:twitter:[^"']+|description)["'])[^>]*>/gi, '')
    .replace(/<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/gi, '')
    .replace(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<meta\b[^>]*name\s*=\s*["']robots["'][^>]*>/gi, robots ? '' : '$&')
    .replace(/<\/head>/i, `${tags}</head>`);
  if (noscript) out = out.replace(/<div id="root"><\/div>/, `<div id="root"></div><noscript>${noscript}</noscript>`);
  return out;
}
export function storeHtml(html, business, slug, paused = false) {
  const name = clean(business.name, 200);
  const description = paused ? `${name} is temporarily unavailable.` : clean(business.description || `Explore ${name}'s products and shop on WhatsApp.`, 300);
  const image = paused ? '' : shareImage(business.logoUrl, business.coverUrl);
  const e = escapeHtml;
  return pageHtml(html, { title: name, siteName: name, description, canonical: `${ROOT}/store/${slug}`, image, imageAlt: `${name} logo`, robots: paused ? 'noindex' : '', schema: paused ? [] : [storeSchema(business, slug)], noscript: paused ? '' : `<main><h1>${e(name)}</h1><p>${e(description)}</p><p>Enable JavaScript to browse the menu and order on WhatsApp.</p></main>` });
}
export function productHtml(html, business, product, slug) {
  const shop = clean(business.name, 200), name = clean(product.name, 200), e = escapeHtml;
  const description = clean(product.description || `${name} from ${shop}. Order on WhatsApp.`, 300);
  const image = shareImage(product.imageUrl, ...(Array.isArray(product.imageUrls) ? product.imageUrls : []), business.logoUrl, business.coverUrl);
  return pageHtml(html, { title: `${name} - ${shop}`, siteName: shop, description, canonical: `${ROOT}/store/${slug}/product/${product.id}`, image, imageAlt: name, type: 'product', schema: productSchema(business, product, slug), noscript: `<main><h1>${e(name)}</h1><p>${e(description)}</p><p>Enable JavaScript to order on WhatsApp.</p></main>` });
}
export default async function handler(request, context) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/store\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/product\/(\d{1,10}))?\/?$/);
  if (!match || !['GET','HEAD'].includes(request.method)) return;
  const slug = match[1], productId = match[2];
  // Only public metadata, fixed API origin, no auth/cookies or order/customer data.
  let data;
  try {
    const response = await fetch(`${API}/api/public/stores/${slug}${productId ? `/products/${productId}` : ''}`, { signal: AbortSignal.timeout(5000) });
    if (response.status === 404) return new Response(productId ? 'Product not found' : 'Shop not found', { status:404, headers:{'content-type':'text/plain; charset=utf-8','x-robots-tag':'noindex'} });
    if (!response.ok) return;
    data = await response.json();
    if (!data?.business?.name || (productId && !data?.product?.name)) return;
  } catch { return; } // Keep the storefront available if the public API is down.
  const base = await context.next();
  if (!base.ok || !base.headers.get('content-type')?.includes('text/html')) return base;
  const source = await base.text();
  const html = productId ? productHtml(source, data.business, data.product, slug) : storeHtml(source, data.business, slug, Boolean(data.paused));
  const headers = new Headers(base.headers);
  for (const name of ['etag','content-length','content-encoding','last-modified']) headers.delete(name);
  headers.set('content-type','text/html; charset=utf-8');
  headers.set('cache-control','public, max-age=0, must-revalidate');
  headers.set('x-store-preview','store-seo-v2');
  if (data.paused) headers.set('x-robots-tag','noindex');
  return new Response(request.method === 'HEAD' ? null : html, {status:base.status, headers});
}
