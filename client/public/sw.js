const CACHE = 'dd-shell-v3';
const SHELL = ['/offline.html', '/icon-192.png', '/icon-512.png'];
self.addEventListener('install', event => {
  // Never let one failed asset block or crash the install.
  event.waitUntil(caches.open(CACHE).then(cache => Promise.all(SHELL.map(url => cache.add(url).catch(() => {})))).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).catch(() => {}), self.clients.claim()]));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(async () => (await caches.match('/offline.html')) || new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain' } })));
    return;
  }
  if (/^\/assets\/.+\.(?:js|css|woff2?|png|svg|webp|jpg|jpeg)$/.test(url.pathname)) {
    event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(response => {
      if (response.ok && response.type === 'basic') { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {}); }
      return response;
    })));
  }
});
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  event.waitUntil(self.registration.showNotification(data.title || 'Digital Shop', { body: data.body || '', icon: '/icon-192.png', badge: '/icon-192.png', ...(data.image ? { image: data.image } : {}), data: { url: typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/' } }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      if (new URL(client.url).origin === self.location.origin && 'navigate' in client) {
        try { await client.navigate(target); return await client.focus(); } catch {}
      }
    }
    return clients.openWindow(target);
  })());
});
