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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// PWA: 앱 shell 캐시용 Service Worker (빌드 때 vite.config.ts 가 dist/sw.js 를 생성). 모델 캐시는 엔진이 관리한다.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* 설치 실패해도 앱 사용에는 영향 없음 */
    })
  })
}
