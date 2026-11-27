import { isEngineError, type ErrorCode } from 'marinear-engine'

/** 엔진은 실패를 EngineError 예외로 던진다. 화면 표시용으로 code/message 를 꺼낸다. */
export function describeError(e: unknown): { code: ErrorCode; message: string } {
  if (isEngineError(e)) return { code: e.code, message: e.message }
  return { code: 'INTERNAL', message: e instanceof Error ? e.message : String(e) }
}

/** 이 코드들은 자동 재시도하지 않는다 — 최신 기준·결과를 다시 보여주고 사용자가 다시 판단한다. */
export const NO_AUTO_RETRY: readonly ErrorCode[] = ['VERSION_CONFLICT', 'RESULT_STALE']

export function isStale(code: ErrorCode): boolean {
  return NO_AUTO_RETRY.includes(code)
}
