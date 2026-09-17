// 体重管理アプリのService Worker。
// index.html を書き換えたら CACHE_VERSION を上げると、次回起動時に新しいものへ入れ替わる。
const CACHE_VERSION = 'weight-v2-5';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const FONT_CACHE = `${CACHE_VERSION}-fonts`;

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // cache:'reload' でブラウザのキャッシュを迂回する。これが無いと、古いindex.htmlを
      // そのまま取り込んで以後ずっと配り続けることがある
      .then((cache) => cache.addAll(SHELL_FILES.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

/**
 * キャッシュがあれば即返し、裏で新しいものを取ってくる。
 * 起動のたびに通信を待たないため体感が速い。更新は次回起動時に反映される
 */
async function cacheFirstWithUpdate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request) || await cache.match('./index.html');
  const fetching = fetch(request)
    .then((response) => {
      if (response.ok) cache.put('./index.html', response.clone());
      return response;
    })
    .catch(() => null);
  if (cached) return cached;
  const fresh = await fetching;
  if (fresh) return fresh;
  throw new Error('offline and not cached');
}

/** まずキャッシュを返し、裏で更新しておく（フォントなど滅多に変わらないもの向け） */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetching = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || fetching || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(cacheFirstWithUpdate(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
});
