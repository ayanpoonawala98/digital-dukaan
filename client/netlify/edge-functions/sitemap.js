// Live sitemap: the landing pages plus every active shop and its products, built from the public API.
const API = 'https://api.digitalshop.website';
const ROOT = 'https://digitalshop.website';
export const config = { path: '/sitemap.xml', onError: 'bypass' };
const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
export const sitemapXml = (slugs, products) => {
  const url = (path, freq, prio) => `<url><loc>${esc(ROOT + path)}</loc><changefreq>${freq}</changefreq><priority>${prio}</priority></url>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[
    url('/', 'weekly', '1.0'), url('/near', 'daily', '0.8'), url('/signup', 'monthly', '0.6'), url('/privacy.html', 'yearly', '0.3'), url('/terms.html', 'yearly', '0.3'),
    ...slugs.filter(s => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)).map(s => url(`/store/${s}`, 'weekly', '0.7')),
    ...products.filter(p => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug) && Number.isInteger(p.id)).map(p => url(`/store/${p.slug}/product/${p.id}`, 'weekly', '0.5'))
  ].join('\n')}\n</urlset>\n`;
};
export default async function handler() {
  let slugs = [], products = [];
  try {
    const [a, b] = await Promise.all([fetch(`${API}/api/public/sitemap-stores`, { signal: AbortSignal.timeout(5000) }), fetch(`${API}/api/public/sitemap-products`, { signal: AbortSignal.timeout(5000) })]);
    if (a.ok) slugs = (await a.json()).slugs || [];
    if (b.ok) products = (await b.json()).products || [];
  } catch { return; } // fall back to the static file
  return new Response(sitemapXml(slugs, products), { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300, s-maxage=3600' } });
}
