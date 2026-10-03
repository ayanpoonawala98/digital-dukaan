const CACHE = 'dd-shell-v2';
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/offline.html','/icon-192.png','/icon-512.png','/manifest.webmanifest']))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(Promise.all([caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))), self.clients.claim()])); });
self.addEventListener('fetch', event => {
  const req=event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') event.respondWith(fetch(req).catch(async () => (await caches.match('/offline.html')) || Response.error()));
  else if (/\.(?:js|css|woff2?|png|svg|webp|jpg|jpeg)$/.test(new URL(req.url).pathname)) event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(response => { if(response.ok && response.type==='basic') { const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(req,copy)); } return response; })));
});
self.addEventListener('push', event => {
  let data={};try { data=event.data?event.data.json():{}; } catch {}
  event.waitUntil(self.registration.showNotification(data.title||'Digital Shop',{body:data.body||'',icon:'/icon-192.png',badge:'/icon-192.png',data:{url:data.url||'/'}}));
});
self.addEventListener('notificationclick', event => {event.notification.close();event.waitUntil(clients.openWindow(event.notification.data?.url||'/'));});
