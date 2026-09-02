/* sw.js — Network-First للملفات المحلية + Cache-First لمكتبات CDN → عمل أوفلاين كامل */
/* عزل الكاش لكل تطبيق على نفس النطاق (كان يحذف كاش التطبيقات الأخرى) */
const NS = (() => { try {
  let seg = self.location.pathname.replace(/\/[^/]*$/,'').split('/').filter(Boolean).pop() || 'root';
  try { seg = decodeURIComponent(seg); } catch(e){}
  /* ⚠️ المسار قد يكون عربياً — الحذف الأعمى لغير ASCII يجعل النطاق فارغاً ومشتركاً بين التطبيقات */
  const safe = String(seg).toLowerCase().replace(/[^\p{L}\p{N}_-]/gu,'-');
  let h = 0; for (let i=0;i<seg.length;i++){ h = ((h<<5)-h+seg.charCodeAt(i))|0; }
  return (safe || 'root') + '#' + (h>>>0).toString(36);
} catch(e){ return 'root'; } })();
const CACHE_PREFIX = 'goldpro@' + NS + '-';
const CACHE = CACHE_PREFIX + 'v187';

/* ملفات التطبيق المحلية (تُخزَّن عند التثبيت) */
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './firebase.js',
  './app.js',
  './assistant.js',
  './inventory.js',
  './invoice.js',
  './raffinage.js',
  './auth.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/icon-180.png',
];

/* مكتبات CDN التي يعتمد عليها إقلاع التطبيق — تُخزَّن مسبقاً (best-effort) كي يعمل أوفلاين */
const CRITICAL_CDN = [
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js',
  'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js',
];

/* مضيفات CDN تُخدَّم Cache-First (مكتبات + خطوط + أيقونات). لا تشمل واجهات Firebase الحية. */
const CDN_HOSTS = new Set([
  'www.gstatic.com',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
]);

/* تثبيت: خزّن ملفات التطبيق (إلزامي) + مكتبات CDN الحرجة (اختياري لا يُفشل التثبيت) */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      c.addAll(ASSETS).then(() =>
        Promise.all(CRITICAL_CDN.map(u =>
          c.add(new Request(u, { mode: 'cors' })).catch(() => {})
        ))
      )
    ).then(() => self.skipWaiting())
  );
});

/* تفعيل: حذف كاشات قديمة لهذا التطبيق فقط */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  /* ① ملفات التطبيق (نفس النطاق): Network-First → عند فشل الإنترنت يُقرأ من الكاش */
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
          return res;
        })
        .catch(() => caches.open(CACHE).then(c => c.match(e.request)))
    );
    return;
  }

  /* ② مكتبات وخطوط CDN: Cache-First → تُخزَّن أول مرة أونلاين وتُخدَّم أوفلاين بعدها */
  if (CDN_HOSTS.has(url.hostname)) {
    e.respondWith(
      caches.open(CACHE).then(c =>
        c.match(e.request).then(hit =>
          hit || fetch(e.request).then(res => {
            if (res && (res.ok || res.type === 'opaque')) c.put(e.request, res.clone());
            return res;
          }).catch(() => hit)
        )
      )
    );
    return;
  }

  /* ③ باقي الطلبات (واجهات Firebase الحية للبيانات/المصادقة): تمريرها للشبكة دون تدخّل */
});
