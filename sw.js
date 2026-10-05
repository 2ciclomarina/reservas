const CACHE = 'planificador-v3'; // súbalo a v4, v5... cada vez que publique cambios
const CORE = [
  './', './index.html', './mi-agenda.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(CORE.map((u) => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Datos en vivo (Firebase): nunca interceptar
  if (url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('identitytoolkit.googleapis.com') ||
      url.hostname.includes('securetoken.googleapis.com')) return;

  // La página y los .js propios: primero internet (para recibir actualizaciones), si no hay usa la copia guardada
  const esPropioJs = url.origin === self.location.origin && /\.(js|webmanifest)$/.test(url.pathname);
  if (req.mode === 'navigate' || esPropioJs) {
    const clave = req.mode === 'navigate' ? './index.html' : req;
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(clave, copy)); }
          return res;
        })
        .catch(() => caches.match(clave))
    );
    return;
  }

  // Librerías, fuentes e imágenes: usa la copia y la actualiza en segundo plano
  e.respondWith(
    caches.match(req).then((cached) => {
      const red = fetch(req).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || red;
    })
  );
});
