const C = 'stockbook-v7';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C && k !== 'stockbook-cfg').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.origin === location.origin) {
    // App files: try network first so updates show, fall back to cache when offline
    e.respondWith(
      fetch(e.request).then(r => { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; })
        .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    );
  } else if (u.hostname === 'www.gstatic.com') {
    // Firebase library: cache first
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request).then(res => { const cp = res.clone(); caches.open(C).then(c => c.put(e.request, cp)); return res; }))
    );
  }
});

// ---------- push notifications ----------
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let title = 'Stock Book', body = 'Stock was updated';
    try {
      const c = await caches.open('stockbook-cfg');
      const r = await c.match('cfg');
      const cfg = r ? await r.json() : {};
      if (cfg.db) {
        const v = await (await fetch(cfg.db + '/meta/lastChange.json', { cache: 'no-store' })).json();
        if (v) { title = v.title || title; body = v.body || body; }
      }
    } catch (err) {}
    await self.registration.showNotification(title, { body, icon: 'icon-192.png', tag: 'stock-' + Date.now(), data: { url: './' } });
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) if ('focus' in w) return w.focus();
    return clients.openWindow('./');
  }));
});
