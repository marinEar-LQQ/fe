import { MockEngineClient, WorkerEngineClient, type EngineClient } from 'marinear-engine'
import EngineWorker from 'marinear-engine/worker?worker'
import { demoControls, type DemoControls } from './demo'

/**
 * 엔진 주입 지점 (이 파일 한 곳에서만 구현을 고른다).
 *   VITE_ENGINE=mock → MockEngineClient (메인 스레드, 시연 고정 데이터, 시연 버튼 표시)
 *   online (기본)    → WorkerEngineClient { mode: 'online', proxyUrl } — 중계 서버를 통한 클라우드 전사·번역.
 *                       음성이 외부 서비스(Google Gemini, NVIDIA)로 전송된다 → 화면 고지·동의 필요
 *   offline          → WorkerEngineClient { mode: 'offline', allowRemote } — 기기 안 모델.
 *                       "다운로드 차단"(현장용)이면 allowRemote:false
 * 모드 설정은 localStorage 에 두고 새로고침 때 적용한다 (실행 중인 Worker 를 바꾸지 않는다).
 */
export type EngineKind = 'mock' | 'online' | 'offline'
export type EngineModePref = 'online' | 'offline'

export interface EngineSetup {
  kind: EngineKind
  client: EngineClient
  /** Mock 일 때만 존재 — 다른 모드에서는 시연 버튼을 숨긴다 */
  demo: DemoControls | null
  /** offline 모드에서 외부 다운로드를 막았는지 (allowRemote:false) */
  blockRemote: boolean
  /** online 모드의 중계 서버 주소 */
  proxyUrl: string | null
}

const MODE_KEY = 'marinear.engineMode'
/** 예전 이름 그대로 둔다: '1' 이면 offline 모드에서 allowRemote:false */
const BLOCK_REMOTE_KEY = 'marinear.offlineMode'

export const PROXY_URL = import.meta.env.VITE_PROXY_URL || 'http://localhost:8787'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** 저장된 엔진 모드 (기본 online). 다음 시작 때 적용 */
export function getEngineModePref(): EngineModePref {
  return read(MODE_KEY) === 'offline' ? 'offline' : 'online'
}
export function setEngineModePref(mode: EngineModePref): void {
  localStorage.setItem(MODE_KEY, mode)
}

/** offline 모드의 외부 다운로드 차단(현장용) 설정 */
export function getBlockRemotePref(): boolean {
  return read(BLOCK_REMOTE_KEY) === '1'
}
export function setBlockRemotePref(on: boolean): void {
  localStorage.setItem(BLOCK_REMOTE_KEY, on ? '1' : '0')
}

let setupPromise: Promise<EngineSetup> | null = null

/** 앱 전체에서 엔진은 하나만 만든다 (StrictMode 이중 실행에도 Worker 1개) */
export function createEngine(): Promise<EngineSetup> {
  setupPromise ??= (async (): Promise<EngineSetup> => {
    if (import.meta.env.VITE_ENGINE === 'mock') {
      const mock = await MockEngineClient.create()
      return { kind: 'mock', client: mock, demo: demoControls(mock), blockRemote: false, proxyUrl: null }
    }
    if (getEngineModePref() === 'online') {
      return { kind: 'online', client: new WorkerEngineClient(new EngineWorker(), { mode: 'online', proxyUrl: PROXY_URL }), demo: null, blockRemote: false, proxyUrl: PROXY_URL }
    }
    const blockRemote = getBlockRemotePref()
    return { kind: 'offline', client: new WorkerEngineClient(new EngineWorker(), { mode: 'offline', allowRemote: !blockRemote }), demo: null, blockRemote, proxyUrl: null }
  })()
  return setupPromise
}

export type { EngineClient }
