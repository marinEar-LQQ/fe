import { MockEngineClient, WorkerEngineClient, type EngineClient } from 'marinear-engine'
import EngineWorker from 'marinear-engine/worker?worker'
import { demoControls, type DemoControls } from './demo'

/**
 * 엔진 주입 지점 (이 파일 한 곳에서만 구현을 고른다).
 *   VITE_ENGINE=mock → MockEngineClient (메인 스레드, 시연 고정 데이터, 시연 버튼 표시)
 *   기본            → WorkerEngineClient (Web Worker)
 *     온라인(기본)  : 중계 서버(VITE_PROXY_URL, 기본 http://localhost:8787)로 받아쓰기·번역. 모델 다운로드 없음
 *     기기 안        : 브라우저에서 모델 실행. 오프라인 모드면 allowRemote:false — 캐시 모델만, 외부 요청 차단 (현장용)
 */
export type EngineKind = 'mock' | 'worker'

export interface EngineSetup {
  kind: EngineKind
  client: EngineClient
  /** Mock 일 때만 존재 — Worker 모드에서는 시연 버튼을 숨긴다 */
  demo: DemoControls | null
  /** 이 엔진이 만들어질 때 적용된 오프라인 모드 (설정을 바꾸면 새로고침 후 적용) */
  offlineMode: boolean
  /** 이 엔진이 만들어질 때 적용된 분석 위치 */
  engineMode: EngineMode
}

/** online = 중계 서버(클라우드 받아쓰기·번역), local = 브라우저 안 모델 */
export type EngineMode = 'online' | 'local'
const ENGINE_MODE_KEY = 'marinear.engineMode'
export const PROXY_URL: string = import.meta.env.VITE_PROXY_URL ?? 'http://localhost:8787'

export function getEngineModePref(): EngineMode {
  try {
    return localStorage.getItem(ENGINE_MODE_KEY) === 'local' ? 'local' : 'online'
  } catch {
    return 'online'
  }
}

export function setEngineModePref(mode: EngineMode): void {
  localStorage.setItem(ENGINE_MODE_KEY, mode)
}

const OFFLINE_MODE_KEY = 'marinear.offlineMode'

/** 저장된 오프라인 모드 설정 (다음 엔진 생성 때 적용) */
export function getOfflineModePref(): boolean {
  try {
    return localStorage.getItem(OFFLINE_MODE_KEY) === '1'
  } catch {
    return false
  }
}

export function setOfflineModePref(on: boolean): void {
  localStorage.setItem(OFFLINE_MODE_KEY, on ? '1' : '0')
}

let setupPromise: Promise<EngineSetup> | null = null

/** 앱 전체에서 엔진은 하나만 만든다 (StrictMode 이중 실행에도 Worker 1개) */
export function createEngine(): Promise<EngineSetup> {
  setupPromise ??= (async (): Promise<EngineSetup> => {
    if (import.meta.env.VITE_ENGINE === 'mock') {
      const mock = await MockEngineClient.create()
      return { kind: 'mock', client: mock, demo: demoControls(mock), offlineMode: false, engineMode: 'local' }
    }
    const engineMode = getEngineModePref()
    const offlineMode = engineMode === 'local' && getOfflineModePref()
    const options = engineMode === 'online' ? { mode: 'online' as const, proxyUrl: PROXY_URL } : { mode: 'offline' as const, allowRemote: !offlineMode }
    return { kind: 'worker', client: new WorkerEngineClient(new EngineWorker(), options), demo: null, offlineMode, engineMode }
  })()
  return setupPromise
}

export type { EngineClient }
