// CJX Inspect — Service Worker
// กลยุทธ์: network-first เฉพาะไฟล์ของเราเอง (index/ไอคอน/manifest)
// - ออนไลน์: ดึงของสดเสมอ (แอปใช้ Supabase สด ๆ ต้องได้ข้อมูลล่าสุด)
// - ออฟไลน์: เสิร์ฟ shell ที่แคชไว้ให้เปิดแอปได้
// - ไม่ยุ่งกับ POST และไม่ยุ่งกับ Supabase/CDN (cross-origin) เด็ดขาด
const CACHE = 'cjx-inspect-v1';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                    // อย่าแตะการเขียนข้อมูล (POST)
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;     // อย่าแตะ Supabase / CDN
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});

// ===== Push Notification (เด้งมือถือแม้ปิดแอป) =====
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  const title = d.title || '🔔 CJX Inspect';
  const opts = {
    body: d.body || 'มีงานที่ต้องแก้ไข',
    icon: './icon-192.png', badge: './icon-192.png',
    data: { url: d.url || './' },
    tag: d.tag || 'cjx-noti', renotify: true, vibrate: [80, 40, 80]
  };
  // เลขบนไอคอนแอป (App Badge) — ดึงจำนวนจาก payload หรือจากข้อความ
  let cnt = (typeof d.badge === 'number') ? d.badge : 0;
  if (!cnt) { const m = (opts.body || '').match(/(\d+)/); if (m) cnt = +m[1]; }
  e.waitUntil(Promise.all([
    self.registration.showNotification(title, opts),
    (self.navigator && self.navigator.setAppBadge && cnt > 0)
      ? self.navigator.setAppBadge(cnt).catch(() => {}) : Promise.resolve()
  ]));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) { try { c.navigate(url); } catch (_) {} return c.focus(); } }
    if (clients.openWindow) return clients.openWindow(url);
  }));
});
