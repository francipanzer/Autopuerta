const CACHE_NAME = 'autopuerta-v147';  // Almacén: artículos de Sage 50 (importar / exportar, stock bidireccional)

// Hojas de medidas: se guardan al instalar para poder medir sin cobertura en la obra
const HOJAS_MEDIDAS = [
  'plantillas/plantillaseccional.webp',
  'plantillas/plantillarapidas.webp',
  'plantillas/plantillarapidaapilable.webp',
  'plantillas/plantillacorredera.webp',
  'plantillas/plantillacorrederacristal.webp',
  'plantillas/plantillacortafuegos.webp',
  'plantillas/plantillabasculante.webp',
  'plantillas/plantillaenrollable.webp',
  'plantillas/plantillabarrera.webp'
];

// Librerías que la app carga bajo demanda desde CDN (PDF): se precargan para que funcionen sin cobertura
const LIBS_CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js'
];

// Si la red no responde en este tiempo y hay copia en caché, se sirve la copia (cobertura mala ≠ sin cobertura)
const NETWORK_TIMEOUT_MS = 5000;
const INSTALL_BUDGET_MS = 25000;

// Rutas de scripts y hojas de estilo que referencia index.html (etiquetas <script>/<link> y LAZY_SCRIPTS/MEDIDAS_CSS).
// Así el precache nunca se desincroniza de los ?v= de index.html y no hay que mantener una lista a mano.
function extractAssetUrls(html) {
  const urls = new Set();
  const add = u => { if (u && !/^(data:|blob:|#|mailto:|javascript:)/i.test(u)) urls.add(u); };
  for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']stylesheet["']/gi)) add(m[1]);
  for (const m of html.matchAll(/['"]((?:js|css)\/[^'"\s]+\.(?:js|css)(?:\?[^'"\s]*)?)['"]/g)) add(m[1]);
  return [...urls];
}

// Fuentes (.woff2) que referencia una hoja de estilos, resueltas respecto a su URL
function extractFontUrls(cssText, cssUrl) {
  const out = new Set();
  for (const m of cssText.matchAll(/url\(\s*["']?([^"')]+\.woff2[^"')]*)["']?\s*\)/gi)) {
    try { out.add(new URL(m[1], cssUrl).href); } catch (_) { /* url no válida */ }
  }
  return [...out];
}

async function precacheEverything(cache) {
  const tasks = [];
  const addSafe = u => tasks.push(cache.add(u).catch(() => {}));

  HOJAS_MEDIDAS.forEach(addSafe);
  LIBS_CDN.forEach(addSafe);

  let assets = [];
  try {
    const res = await fetch('index.html', { cache: 'reload' });
    assets = extractAssetUrls(await res.text());
  } catch (_) { /* sin red: se cachearán bajo demanda */ }
  assets.forEach(addSafe);

  // Fuentes de las hojas CDN (Font Awesome): sin ellas los iconos salen vacíos offline
  for (const css of assets.filter(u => /^https:\/\/.*\.css(\?|$)/i.test(u))) {
    tasks.push(fetch(css).then(r => r.ok ? r.text() : '').then(txt => extractFontUrls(txt, css).forEach(addSafe)).catch(() => {}));
  }
  await Promise.race([Promise.all(tasks), new Promise(r => setTimeout(r, INSTALL_BUDGET_MS))]);
}

// ═══════════════════════════════════════
//  INSTALL
// ═══════════════════════════════════════
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      // Imprescindibles: si fallan, la instalación aborta (y se reintenta) en vez de dejar una app a medias
      await cache.addAll(['./', 'index.html', 'css/styles.css', 'manifest.json']);
      // El resto (JS, hojas, librerías) es "mejor esfuerzo": nunca bloquea la instalación
      await precacheEverything(cache);
    })
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] install parcial:', err))
  );
});

// ═══════════════════════════════════════════════════════════
//  ACTIVATE (limpieza de caches viejas)
// ═══════════════════════════════════════════════════════════
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    ).then(() => self.clients.claim())                    // ➕ toma el control YA
  );
});

// ═══════════════════════════════════════════════════════════
//  PUSH
// ═══════════════════════════════════════════════════════════
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) { data = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(data.title || 'Valgom', {
    body: data.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { page: data.page || '' },
    tag: data.page || 'valgom',
    renotify: true,
    vibrate: [200, 100, 200]
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const page = e.notification.data && e.notification.data.page;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) {
      if ('focus' in c) {
        c.postMessage({ type: 'valgom-navigate', page });
        return c.focus();
      }
    }
    return self.clients.openWindow('./' + (page ? '?page=' + encodeURIComponent(page) : ''));
  }));
});

// ═══════════════════════════════════════════════════════════
//  FETCH
// ═══════════════════════════════════════════════════════════
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (event.request.method !== 'GET') return;

  // ➕ AÑADIDO: Supabase SIEMPRE directo a red, jamás por caché.
  //    Tus datos en la nube no deben leerse nunca de una copia vieja.
  if (url.hostname.endsWith('.supabase.co')) return;

  const isHtml = event.request.mode === 'navigate'
    || event.request.headers.get('accept')?.includes('text/html');
  const isCode = /\.(js|css)$/i.test(url.pathname);       // 🔧 separado del resto
  const isMedia = /\.(png|jpg|jpeg|svg|ico|webp|woff2?)$/i.test(url.pathname);

  // Si no hay red ni copia en caché, se devuelve una respuesta válida en vez de undefined
  const offlineResponse = () => new Response('', { status: 503, statusText: 'Service Unavailable' });

  const putInCache = (request, response) => {
    // Solo respuestas completas y propias; las parciales (206) o opacas no se pueden cachear
    if (response.ok && response.status === 200) {
      const clone = response.clone();
      caches.open(CACHE_NAME).then(c => c.put(request, clone)).catch(() => {});
    }
  };

  // Las navegaciones pueden llevar ?page=… (notificaciones push): la copia de index.html sirve para todas
  const isNavigate = event.request.mode === 'navigate';
  const matchOpts = isNavigate ? { ignoreSearch: true } : undefined;
  const appShell = () => caches.match('index.html', { ignoreSearch: true }).then(r => r || caches.match('./', { ignoreSearch: true }));
  const fromCache = () => caches.match(event.request, matchOpts).then(r => r || (isNavigate ? appShell() : null));

  // Red primero con 'no-cache' (evita servir JS/HTML viejo del caché HTTP del móvil). Si hay copia en caché y la red
  // tarda más de NETWORK_TIMEOUT_MS (cobertura mala), se sirve la copia y la descarga sigue en segundo plano
  // para dejar la caché al día. Sin copia, se espera a la red.
  const networkFirst = () => {
    const net = fetch(new Request(event.request, { cache: 'no-cache' })).then(response => {
      putInCache(event.request, response);
      return response;
    });
    event.waitUntil(net.catch(() => {}));
    return fromCache().then(cached => {
      if (!cached) return net.catch(() => offlineResponse());
      const timeout = new Promise(resolve => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS));
      return Promise.race([net.catch(() => null), timeout]).then(response => response || cached);
    });
  };

  const cacheFirst = () =>
    caches.match(event.request).then(cached =>
      cached || fetch(event.request).then(response => {
        putInCache(event.request, response);
        return response;
      })
    ).catch(() => offlineResponse());

  if (isHtml)      event.respondWith(networkFirst());     // siempre última versión
  else if (isCode) event.respondWith(networkFirst());     // 🔧 ANTES cache-first → causa del bug
  else if (isMedia) event.respondWith(cacheFirst());      // iconos/fuentes: cache-first OK
  else             event.respondWith(networkFirst());
});