/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** mock = MockEngineClient (시연 고정 데이터), 그 외/미설정 = WorkerEngineClient (실제 모델) */
  readonly VITE_ENGINE?: 'mock' | 'worker'
  /** 중계 서버 주소 (온라인 모드). 기본 http://localhost:8787 */
  readonly VITE_PROXY_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
