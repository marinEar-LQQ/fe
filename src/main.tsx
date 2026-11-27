import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// 글꼴은 앱에 포함한다 (Google Fonts 대신 — 오프라인·COEP require-corp 대응)
import '@fontsource/ibm-plex-sans-kr/400.css'
import '@fontsource/ibm-plex-sans-kr/500.css'
import '@fontsource/ibm-plex-sans-kr/600.css'
import '@fontsource/ibm-plex-sans-kr/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import '@fontsource/ibm-plex-mono/700.css'
import App from './app/App'
import './index.css'

/** 설정의 "기록 초기화"가 남긴 예약. 엔진(Worker)이 DB 를 잡고 있으면 지울 수 없어서, 새로 여는 순간에 지운다 */
const RESET_KEY = 'marinear.resetOnLoad'
/** 이 탭에서 이미 앱을 열었는지. sessionStorage 는 새로고침에는 남고 탭을 새로 열면 비어 있다 */
const SESSION_KEY = 'marinear.session'

/**
 * 링크로 새로 들어오면(새 탭) 항상 처음 상태로 시작한다: 지난 기록을 지우고 시작 화면(언어 선택)부터.
 * 같은 탭에서 새로고침하면 하던 것을 유지한다 (시연 중 실수로 새로고침해도 기록이 남게).
 * 언어·외부 전송 동의 같은 설정은 남기고 "언어를 골랐음" 표시만 지워 시작 화면이 다시 나오게 한다.
 */
async function resetIfRequested(): Promise<void> {
  const newVisit = sessionStorage.getItem(SESSION_KEY) !== '1'
  const requested = localStorage.getItem(RESET_KEY) === '1'
  sessionStorage.setItem(SESSION_KEY, '1')
  if (!newVisit && !requested) return
  localStorage.removeItem(RESET_KEY)
  if (newVisit) {
    try {
      const prefs = JSON.parse(localStorage.getItem('marinear.prefs') ?? '{}')
      localStorage.setItem('marinear.prefs', JSON.stringify({ ...prefs, langChosen: false }))
    } catch {
      localStorage.removeItem('marinear.prefs')
    }
  }
  await clearRecords()
}

/**
 * 기록 저장소(IndexedDB 'marinear')의 내용만 비운다.
 * DB 를 통째로 지우면(deleteDatabase) 다른 탭의 앱이 열어 둔 연결 때문에 끝나지 않고 이 탭이 멈춘다 (실측).
 * 내용 비우기는 다른 탭이 열려 있어도 바로 끝난다. DB 가 아직 없으면 아무것도 하지 않는다.
 */
async function clearRecords(): Promise<void> {
  try {
    const list = (await indexedDB.databases?.()) ?? null
    if (list && !list.some((d) => d.name === 'marinear')) return
  } catch {
    /* databases() 를 못 쓰는 브라우저: 그대로 열어 본다 */
  }
  await new Promise<void>((done) => {
    const open = indexedDB.open('marinear')
    // 없던 DB 를 여기서 만들면 엔진이 표를 만들지 못하므로, 새로 만드는 경우는 취소한다
    open.onupgradeneeded = () => open.transaction?.abort()
    open.onerror = () => done()
    open.onblocked = () => done()
    open.onsuccess = () => {
      const db = open.result
      const names = [...db.objectStoreNames]
      if (names.length === 0) {
        db.close()
        return done()
      }
      const tx = db.transaction(names, 'readwrite')
      for (const n of names) tx.objectStore(n).clear()
      tx.oncomplete = tx.onerror = tx.onabort = () => {
        db.close()
        done()
      }
    }
  })
}

void resetIfRequested().then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
)

// PWA: 앱 shell 캐시용 Service Worker (빌드 때 vite.config.ts 가 dist/sw.js 를 생성). 모델 캐시는 엔진이 관리한다.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* 설치 실패해도 앱 사용에는 영향 없음 */
    })
  })
}
