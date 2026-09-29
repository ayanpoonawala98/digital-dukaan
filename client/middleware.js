import { next } from '@vercel/edge';

const apiBase = 'https://api.digitaldukaan.space';
const defaultImage = 'https://ik.imagekit.io/digitaldukaanayan/digital-dukaan/branding/digital-dukaan-hero_Z71uTHmDJ.jpg';
const safeSlug = slug => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && !['api', 'www'].includes(slug);
const escapeHtml = text => String(text || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const config = { matcher: ['/', '/store/:path*', '/product/:path*'] };

export default async function middleware(request) {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  const hostedSlug = host.endsWith('.digitaldukaan.space') ? host.slice(0, -'.digitaldukaan.space'.length) : null;
  const path = url.pathname.match(/^\/store\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/|$)/);
  const slug = hostedSlug && safeSlug(hostedSlug) ? hostedSlug : path?.[1];
  if (!slug || !safeSlug(slug)) return next();
  try {
    const api = await fetch(`${apiBase}/api/public/stores/${slug}`, { signal: AbortSignal.timeout(3500) });
    if (!api.ok) return next();
    const result = await api.json();
    const business = result.business;
    if (!business?.name || result.paused) return next();
    const title = `${business.name} | Digital Dukaan`;
    const description = (business.description || `Explore ${business.name}'s storefront and products online.`).slice(0, 190);
    const image = /^https:\/\/(?:ik\.imagekit\.io|.*\.imagekit\.io)\//.test(business.coverUrl || '') ? business.coverUrl : defaultImage;
    const imageUrl = new URL(image); imageUrl.searchParams.set('tr', 'w-1200,h-630,fo-auto');
    const base = await fetch(new URL('/index.html', url));
    if (!base.ok) return next();
    const html = await base.text();
    const tags = `<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"/><meta property="og:type" content="website"/><meta property="og:title" content="${escapeHtml(title)}"/><meta property="og:description" content="${escapeHtml(description)}"/><meta property="og:url" content="${escapeHtml(url.origin + url.pathname)}"/><meta property="og:image" content="${escapeHtml(imageUrl.href)}"/><meta name="twitter:card" content="summary_large_image"/><meta name="twitter:title" content="${escapeHtml(title)}"/><meta name="twitter:description" content="${escapeHtml(description)}"/><meta name="twitter:image" content="${escapeHtml(imageUrl.href)}"/>`;
    const custom = html.replace(/<title>.*?<\/title>(?:<meta[^>]*>)*?\s*<link rel="preconnect"/s, tags + '<link rel="preconnect"');
    return new Response(custom, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300' } });
  } catch { return next(); }
}
