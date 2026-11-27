/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** mock = MockEngineClient (시연 고정 데이터), 그 외/미설정 = WorkerEngineClient (실제 모델) */
  readonly VITE_ENGINE?: 'mock' | 'worker'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
