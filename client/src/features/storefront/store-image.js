// Resize delivery only; originals and their full framing are retained.
export function storeImage(value, width = 720) {
  if (typeof value !== 'string' || !value) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'ik.imagekit.io' || url.searchParams.has('tr')) return value;
    url.searchParams.set('tr', `w-${Math.max(96, Math.min(1600, Math.round(width)))},q-80`);
    return url.href;
  } catch { return value; }
}
