import { MockEngineClient, WorkerEngineClient, type EngineClient } from 'marinear-engine'
import EngineWorker from 'marinear-engine/worker?worker'
import { demoControls, type DemoControls } from './demo'

/**
 * 엔진 주입 지점 (이 파일 한 곳에서만 구현을 고른다).
 *   VITE_ENGINE=mock → MockEngineClient (메인 스레드, 시연 고정 데이터, 시연 버튼 표시)
 *   기본            → WorkerEngineClient (Web Worker, 실제 모델)
 */
export type EngineKind = 'mock' | 'worker'

export interface EngineSetup {
  kind: EngineKind
  client: EngineClient
  /** Mock 일 때만 존재 — Worker 모드에서는 시연 버튼을 숨긴다 */
  demo: DemoControls | null
}

let setupPromise: Promise<EngineSetup> | null = null

/** 앱 전체에서 엔진은 하나만 만든다 (StrictMode 이중 실행에도 Worker 1개) */
export function createEngine(): Promise<EngineSetup> {
  setupPromise ??= (async (): Promise<EngineSetup> => {
    if (import.meta.env.VITE_ENGINE === 'mock') {
      const mock = await MockEngineClient.create()
      return { kind: 'mock', client: mock, demo: demoControls(mock) }
    }
    return { kind: 'worker', client: new WorkerEngineClient(new EngineWorker(), { allowRemote: true }), demo: null }
  })()
  return setupPromise
}

export type { EngineClient }
