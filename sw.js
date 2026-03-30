const CACHE_NAME = 'gestion-hogar-v2'; // Cambié a V2 para forzar actualización
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './main.js',
    './manifest.json'
];

// Instalación: Guardar archivos iniciales
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))
        .then(() => self.skipWaiting())
    );
});

// Activación: Borrar cachés viejas
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

// Estrategia: Network First (Mejor para apps que sincronizan datos)
// Intentar red primero, si falla, usar caché.
self.addEventListener('fetch', e => {
    // Solo cacheamos archivos locales del proyecto
    if (e.request.url.includes('google.com') || e.request.url.includes('unpkg.com')) return;

    e.respondWith(
        fetch(e.request)
            .then(res => {
                const clone = res.clone();
                caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
                return res;
            })
            .catch(() => caches.match(e.request))
    );
});
