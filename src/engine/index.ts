import type { EngineClient } from './EngineClient'
import { MockEngineClient } from './mock/MockEngineClient'

/**
 * 엔진 주입 지점. 실제 Worker adapter 가 준비되면 여기서만 교체한다.
 *   VITE_ENGINE=mock (기본) | worker | pc
 */
export function createEngine(): EngineClient {
  const kind = import.meta.env.VITE_ENGINE ?? 'mock'
  switch (kind) {
    // case 'worker': return new WorkerEngineClient(new Worker(new URL('../workers/engine.worker.ts', import.meta.url), { type: 'module' }))
    default:
      return new MockEngineClient()
  }
}

export type { EngineClient }
