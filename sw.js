// کش آفلاین Vault. فقط کش‌های خودش (پیشوند vault-) رو پاک می‌کنه تا به اپ‌های دیگه‌ی همین دامنه (مثل FI) دست نزنه.
const VERSION = 'vault-v5';
const FILES = ['./', 'index.html', 'core.js', 'invest.js', 'invest-ui.js', 'app.js', 'xlsx.full.min.js', 'manifest.webmanifest',
  'fonts/vazirmatn.woff2', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('vault-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).catch(() => caches.match('index.html'))));
});
