// marinEar Service Worker — 빌드 때 vite.config.ts(marinear-sw 플러그인)가 이 템플릿으로 dist/sw.js 를 만든다.
// - 앱 shell(HTML·해시된 JS/CSS·엔진 Worker·worklet·manifest)을 설치 시점에 미리 캐시한다.
// - 모델·ONNX Runtime 파일은 엔진(transformers.js)이 자기 Cache Storage 로 관리한다. 여기서는 건드리지 않는다
//   (교차 출처 요청은 가로채지 않고, marinear-shell-* 가 아닌 캐시는 지우지 않는다).
// - 업데이트는 진행 중 수신을 방해하지 않도록 skipWaiting 을 자동 호출하지 않는다 (모든 탭을 닫으면 새 버전 적용).
const VERSION = __SW_VERSION__
const PRECACHE = __SW_PRECACHE__
const BASE = __SW_BASE__
const CACHE = `marinear-shell-${VERSION}`

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('marinear-shell-') && k !== CACHE).map((k) => caches.delete(k)))),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'version') event.ports[0]?.postMessage({ version: VERSION, files: PRECACHE.length })
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
  // 화면 이동: 네트워크 우선, 실패(오프라인) 시 캐시된 shell
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match(`${BASE}index.html`, { cacheName: CACHE })))
    return
  }
  // 정적 자원: 캐시 우선. 미리 캐시하지 않은 같은 출처 자원(예: 대용량 .wasm)은 처음 쓸 때 캐시에 추가
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})
