import { WorkerEngineClient, type EngineClient } from 'marinear-engine'

/**
 * 계약(EngineClient) 밖 확장 기능. 지원하는 구현일 때만 호출되도록 타입 가드로 감싼다.
 * markDisconnected 는 WorkerEngineClient 에만 노출한다 (README "계약 확장").
 */
export function supportsDisconnect(engine: EngineClient): engine is WorkerEngineClient {
  return engine instanceof WorkerEngineClient
}

/** 입력 장치 끊김 기록. Worker 엔진이 아니면 아무것도 하지 않는다. */
export async function markDisconnected(engine: EngineClient, sessionId: string): Promise<void> {
  if (supportsDisconnect(engine)) await engine.markDisconnected(sessionId)
}
