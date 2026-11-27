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
  await new Promise<void>((done) => {
    const req = indexedDB.deleteDatabase('marinear')
    req.onsuccess = req.onerror = req.onblocked = () => done()
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
