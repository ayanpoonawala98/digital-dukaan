import { next } from '@vercel/edge';

const apiBase = process.env.VITE_API_URL || 'https://api.digitaldukaan.space';
const root = 'https://digitaldukaan.space';
const defaultImage = 'https://ik.imagekit.io/digitaldukaanayan/digital-dukaan/branding/digital-dukaan-hero_Z71uTHmDJ.jpg';
const safeSlug = slug => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && !['api', 'www'].includes(slug);
const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeJson = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
const xml = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const canonicalStore = slug => `https://${slug}.digitaldukaan.space/`;
const requestJson = async path => {
  const response = await fetch(`${apiBase}${path}`, { signal: AbortSignal.timeout(3500) });
  if (!response.ok) return { errorStatus: response.status };
  return response.json();
};

export const config = { matcher: ['/', '/store/:path*', '/product/:path*', '/sitemap.xml'] };

export default async function middleware(request) {
  const url = new URL(request.url);
  if (url.pathname === '/sitemap.xml' && ['digitaldukaan.space', 'www.digitaldukaan.space'].includes(url.hostname)) {
    try {
      const list = await requestJson('/api/public/sitemap-stores');
      if (!Array.isArray(list?.slugs)) return new Response('Sitemap temporarily unavailable', { status: 503 });
      const urls = [root + '/', ...list.slugs.filter(safeSlug).map(canonicalStore)];
      return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(link => `<url><loc>${xml(link)}</loc></url>`).join('')}</urlset>`, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, s-maxage=300, stale-while-revalidate=300' } });
    } catch { return new Response('Sitemap temporarily unavailable', { status: 503 }); }
  }
  const host = url.hostname.toLowerCase();
  const hostedSlug = host.endsWith('.digitaldukaan.space') ? host.slice(0, -'.digitaldukaan.space'.length) : null;
  const path = url.pathname.match(/^\/store\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/product\/(\d+))?\/?$/);
  const slug = hostedSlug && safeSlug(hostedSlug) ? hostedSlug : path?.[1];
  if (!slug || !safeSlug(slug)) return next();
  const productId = hostedSlug ? url.pathname.match(/^\/product\/(\d+)\/?$/)?.[1] : path?.[2];
  if (hostedSlug && !['/', '/index.html'].includes(url.pathname) && !productId) return next();
  try {
    const data = await requestJson(productId ? `/api/public/stores/${slug}/products/${productId}` : `/api/public/stores/${slug}`);
    if (data?.errorStatus === 404) return new Response('Store not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': 'noindex' } });
    const business = data?.business;
    if (data?.paused) {
      const base = await fetch(new URL('/index.html', url));
      if (!base.ok) return next();
      const html = (await base.text()).replace(/<title>.*?<link rel="preconnect"/s, `<title>${escapeHtml(data.business?.name || 'Store')} - temporarily closed</title><meta name="robots" content="noindex"/><link rel="preconnect"`);
      return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex', 'cache-control': 'public, s-maxage=60' } });
    }
    if (!business?.name) return next();
    const product = productId ? data.product : null;
    if (productId && !product?.name) return new Response('Product not found', { status: 404, headers: { 'x-robots-tag': 'noindex' } });
    const canonical = product ? `${canonicalStore(slug)}product/${product.id}` : canonicalStore(slug);
    const title = product ? `${product.name} - ${business.name} | Digital Shop` : `${business.name} | Digital Shop`;
    const description = (product?.description || (product ? `See ${product.name} at ${business.name}. Enquire on WhatsApp.` : business.description || `Explore ${business.name}'s storefront and products online.`)).slice(0, 190);
    const candidate = product?.imageUrl || business.coverUrl || '';
    const image = /^https:\/\/(?:ik\.imagekit\.io|[a-z0-9-]+\.imagekit\.io)\//i.test(candidate) ? candidate : defaultImage;
    const imageUrl = new URL(`${root}/api/og?slug=${encodeURIComponent(slug)}${product ? `&product=${product.id}` : ''}`); const structuredImage = new URL(image); structuredImage.searchParams.set('tr', 'w-1200,h-630,fo-auto');
    const structured = product ? { '@context': 'https://schema.org', '@type': 'Product', name: product.name, description, image: structuredImage.href, url: canonical, offers: { '@type': 'Offer', price: product.price, priceCurrency: 'INR', availability: product.stock === 0 ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock', url: canonical } } : { '@context': 'https://schema.org', '@type': 'LocalBusiness', name: business.name, description, url: canonical, image: structuredImage.href, ...(business.location ? { address: { '@type': 'PostalAddress', addressLocality: business.location } } : {}) };
    const base = await fetch(new URL('/index.html', url));
    if (!base.ok) return next();
    const html = await base.text();
    const tags = `<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"/><meta property="og:type" content="${product ? 'product' : 'website'}"/><meta property="og:title" content="${escapeHtml(title)}"/><meta property="og:description" content="${escapeHtml(description)}"/><meta property="og:url" content="${escapeHtml(canonical)}"/><meta property="og:image" content="${escapeHtml(imageUrl.href)}"/><meta property="og:image:width" content="1200"/><meta property="og:image:height" content="630"/><meta name="twitter:card" content="summary_large_image"/><meta name="twitter:title" content="${escapeHtml(title)}"/><meta name="twitter:description" content="${escapeHtml(description)}"/><meta name="twitter:image" content="${escapeHtml(imageUrl.href)}"/><link rel="canonical" href="${escapeHtml(canonical)}"/><script type="application/ld+json">${safeJson(structured)}</script>`;
    // Remove the platform's default metadata and schema; keep font preconnects.
    const custom = html.replace(/<title>.*?<link rel="preconnect"/s, tags + '<link rel="preconnect"');
    return new Response(custom, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300' } });
  } catch { return next(); }
}
