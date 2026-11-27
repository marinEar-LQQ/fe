import type { ResolvedEntities } from 'marinear-engine'
import { ko, type Messages } from '../i18n/ko'

/** 관제 지시어 코드 → 한국어 (호환용). 화면에서는 t.instruction */
export const INSTRUCTION_LABEL = ko.instruction

/** 식별값 표시: CALLSIGN 6KLM → 호출부호 6KLM, IMO1234567 → IMO 1234567, MMSI… → MMSI … */
export function formatIdentifier(id: string, t: Messages = ko): { label: string; value: string } {
  const call = /^CALLSIGN\s+(.+)$/i.exec(id)
  if (call) return { label: t.entity.callsign, value: call[1]! }
  const num = /^(IMO|MMSI)\s*(\d+)$/i.exec(id)
  if (num) return { label: num[1]!.toUpperCase(), value: num[2]! }
  return { label: t.entity.identifier, value: id }
}

/** 교신 카드 칩 / 재확인 목록에 쓰는 추가 추출값. null·빈 값은 뺀다 */
export function extraEntities(e: ResolvedEntities, t: Messages = ko): { key: string; label: string; value: string }[] {
  const out: { key: string; label: string; value: string }[] = []
  if (e.speed) out.push({ key: 'speed', label: t.entity.speed, value: e.speed })
  if (e.course) out.push({ key: 'course', label: t.entity.course, value: e.course })
  if (e.instructions.length) out.push({ key: 'instructions', label: t.entity.instructions, value: e.instructions.map((c) => t.instruction[c]).join(' · ') })
  if (e.identifier) {
    const id = formatIdentifier(e.identifier, t)
    out.push({ key: 'identifier', label: id.label, value: id.value })
  }
  return out
}
