// Leaflet + OpenStreetMap tiles (free, no API key). Loaded on demand from a CDN so the main bundle stays small.
let pending;
export function loadLeaflet() {
  if (typeof window === 'undefined') return Promise.reject(Error('No window'));
  if (window.L?.map) return Promise.resolve(window.L);
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet]')) {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; css.dataset.leaflet = '1';
      document.head.appendChild(css);
    }
    const js = document.createElement('script');
    js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; js.async = true;
    js.onload = () => window.L ? resolve(window.L) : reject(Error('Map failed to load'));
    js.onerror = () => { pending = null; reject(Error('Map failed to load. Check your connection.')); };
    document.head.appendChild(js);
  });
  return pending;
}
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
// Polite Nominatim use: one request per tap, India only, never on every keystroke.
export async function geocode(query) {
  const q = String(query || '').trim();
  if (q.length < 3) throw Error('Type a city, area or pincode');
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw Error('Search is busy. Try again in a moment.');
  const rows = await res.json();
  if (!rows.length) throw Error('Could not find that place. Try a nearby area or the pincode.');
  return { lat: Number(rows[0].lat), lng: Number(rows[0].lon), label: String(rows[0].display_name || q).split(',').slice(0, 3).join(',').trim() };
}
export const currentPosition = () => new Promise((resolve, reject) => {
  if (!navigator.geolocation) return reject(Error('This device cannot share its location. Type your area or pincode instead.'));
  navigator.geolocation.getCurrentPosition(p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), err => reject(Error(err.code === 1 ? 'Location permission was denied. Type your area or pincode instead.' : 'Could not get your location. Type your area or pincode instead.')), { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
});
