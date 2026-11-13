// 서비스 워커: 네트워크 우선(온라인이면 항상 최신), 실패하면 캐시(오프라인).
// 설치 시 precache.json에 적힌 모든 파일(껍데기·코어·데이터·게임)을 미리 저장한다.
const CACHE = 'boardarchive-files';

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const list = await (await fetch('precache.json', { cache: 'reload' })).json();
    const c = await caches.open(CACHE);
    await Promise.all(list.files.map(f => c.add(new Request(f, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    } catch {
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') { const idx = await c.match('index.html'); if (idx) return idx; }
      throw new Error('오프라인이며 캐시에 없음');
    }
  })());
});
