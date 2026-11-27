// marinEar Service Worker — 앱 shell 캐시 (모델·WASM 캐시는 엔진 연결 단계에서 추가)
// 업데이트는 진행 중 세션을 방해하지 않도록 skipWaiting 을 자동 호출하지 않는다.
const CACHE = 'marinear-shell-v1'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/worklets/capture-processor.js']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('marinear-shell-') && k !== CACHE).map((k) => caches.delete(k)))))
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
  // 화면 이동: 네트워크 우선, 실패 시 캐시된 shell
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/index.html')))
    return
  }
  // 정적 자원: 캐시 우선 후 네트워크 결과를 캐시에 추가
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})
