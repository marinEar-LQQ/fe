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

async function resetIfRequested(): Promise<void> {
  if (localStorage.getItem(RESET_KEY) !== '1') return
  localStorage.removeItem(RESET_KEY)
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
