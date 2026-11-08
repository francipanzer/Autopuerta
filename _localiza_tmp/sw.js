const CACHE = 'localiza-v1';
const ESENCIALES = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ESSENCE_FILES()).catch(() => { })));
  self.skipWaiting();
});
function ESSENCE_FILES() { return ESENCIALES; }

self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // No cachear API de Supabase ni geocodificación
  if (url.hostname.includes('supabase') || url.hostname.includes('nominatim')) return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(resp => {
      if (e.request.method === 'GET' && resp.ok && (url.origin === location.origin || url.hostname.includes('unpkg') || url.hostname.includes('openstreetmap'))) {
        const copia = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copia));
      }
      return resp;
    }).catch(() => hit))
  );
});
