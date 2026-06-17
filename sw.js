/* 桃園教會服事平台 Service Worker
 * 策略：network-first（永遠先抓最新，離線才用快取），避免版本卡住。
 * 只快取 GET 的同源靜態資源；對 GAS 的 POST API 不攔截。
 */
const CACHE = 'svc-v1';
const SHELL = ['service.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL).catch(function () {}); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (ks) {
      return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return; // API（POST）走原本網路，不攔截
  if (new URL(req.url).origin !== self.location.origin) return; // 只處理同源
  e.respondWith(
    fetch(req).then(function (r) {
      var cp = r.clone();
      caches.open(CACHE).then(function (c) { c.put(req, cp); }).catch(function () {});
      return r;
    }).catch(function () { return caches.match(req); })
  );
});

/* ===== Web Push：背景接收推播並跳通知 ===== */
self.addEventListener('push', function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (e) { data = { title: '服事平台', body: event.data ? event.data.text() : '' }; }
  var title = data.title || '服事平台';
  var options = {
    body: data.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    data: { url: data.url || 'service.html' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || 'service.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
      for (var i = 0; i < cs.length; i++) {
        if (cs[i].url.indexOf(url) !== -1 && 'focus' in cs[i]) return cs[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
