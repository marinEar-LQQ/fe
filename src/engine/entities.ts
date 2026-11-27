import type { InstructionCode, ResolvedEntities } from 'marinear-engine'

/** 관제 지시어 코드 → 한국어 (엔진 정형 요약의 ko 문구와 같은 표현). 모든 코드를 타입으로 강제 */
export const INSTRUCTION_LABEL: Record<InstructionCode, string> = {
  REDUCE_SPEED: '감속',
  PASS_PORT_TO_PORT: '좌현 대 좌현 통과',
  PASS_STBD_TO_STBD: '우현 대 우현 통과',
  KEEP_CLEAR: '피해서 우회',
  STAND_BY: '대기',
  BERTH: '접안',
  PROCEED: '이동',
  ALTER_COURSE_STBD: '우현으로 변침',
  ALTER_COURSE_PORT: '좌현으로 변침',
  CORRECTION: '정정',
}

/** 식별값 표시: CALLSIGN 6KLM → 호출부호 6KLM, IMO1234567 → IMO 1234567, MMSI… → MMSI … */
export function formatIdentifier(id: string): { label: string; value: string } {
  const call = /^CALLSIGN\s+(.+)$/i.exec(id)
  if (call) return { label: '호출부호', value: call[1]! }
  const num = /^(IMO|MMSI)\s*(\d+)$/i.exec(id)
  if (num) return { label: num[1]!.toUpperCase(), value: num[2]! }
  return { label: '식별', value: id }
}

/** 교신 카드 칩 / 재확인 목록에 쓰는 추가 추출값. null·빈 값은 뺀다 */
export function extraEntities(e: ResolvedEntities): { key: string; label: string; value: string }[] {
  const out: { key: string; label: string; value: string }[] = []
  if (e.speed) out.push({ key: 'speed', label: '속력', value: e.speed })
  if (e.course) out.push({ key: 'course', label: '침로', value: e.course })
  if (e.instructions.length) out.push({ key: 'instructions', label: '지시', value: e.instructions.map((c) => INSTRUCTION_LABEL[c]).join(' · ') })
  if (e.identifier) {
    const id = formatIdentifier(e.identifier)
    out.push({ key: 'identifier', label: id.label, value: id.value })
  }
  return out
}
