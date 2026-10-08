// Guarda o app no celular para abrir sem internet.
const CACHE = 'cozinha-v5';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon.svg', './firebase-config.js'];
const EXTRA = ['https://www.gstatic.com/firebasejs/', 'https://fonts.googleapis.com/', 'https://fonts.gstatic.com/'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (e.request.method !== 'GET') return;
  if (!url.startsWith(self.location.origin) && !EXTRA.some(p => url.startsWith(p))) return; // o banco do Firebase passa direto
  // Rede primeiro (pega versões novas do app); sem internet, usa a cópia guardada.
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
