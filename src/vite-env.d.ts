/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** mock = MockEngineClient (시연 고정 데이터). 미설정이면 설정 화면의 모드(online 기본 / offline) */
  readonly VITE_ENGINE?: 'mock'
  /** online 모드 중계 서버 주소 (기본 http://localhost:8787) */
  readonly VITE_PROXY_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
