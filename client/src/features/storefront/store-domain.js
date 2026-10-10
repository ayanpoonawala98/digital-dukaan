export const hostedStoreSlug = () => {
  const host = window.location.hostname.toLowerCase();
  const suffix = '.digitaldukaan.space';
  if (!host.endsWith(suffix)) return null;
  const slug = host.slice(0, -suffix.length);
  return slug && !['api', 'www'].includes(slug) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : null;
};
export const storeLink = slug => {
  if (import.meta.env.VITE_STORE_SUBDOMAINS_READY === 'true' && slug && !['api', 'www'].includes(slug) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return `https://${slug}.digitaldukaan.space`;
  return `${window.location.origin}/store/${slug}`;
};
export const storePath = (slug, productId) => hostedStoreSlug() === slug
  ? (productId ? `/product/${productId}` : '/')
  : (productId ? `/store/${slug}/product/${productId}` : `/store/${slug}`);
