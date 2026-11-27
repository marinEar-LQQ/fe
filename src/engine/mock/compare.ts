import type { Comparison, Entities, TaskVersion, Uncertainty } from '../../contracts/types'

/**
 * raw/enhanced 엔티티 병합: 핵심 필드가 다르면 값은 null, 후보는 둘 다 보존 (ASR_DISAGREEMENT)
 * 두 결과가 일치해도 정확함의 증명은 아니다.
 */
export function mergeEntities(enhanced: Entities, raw: Entities | null): { entities: Entities; uncertainties: Uncertainty[] } {
  if (!raw) return { entities: { ...enhanced }, uncertainties: [] }
  const entities: Entities = { ...enhanced }
  const uncertainties: Uncertainty[] = []
  for (const field of ['vessel', 'terminalId', 'berthId'] as const) {
    const a = enhanced[field]
    const b = raw[field]
    if (a !== b && (a !== null || b !== null)) {
      entities[field] = null
      uncertainties.push({
        field,
        alternatives: [b, a].filter((v): v is string => v !== null),
        reasonCode: 'ASR_DISAGREEMENT',
      })
    }
  }
  return { entities, uncertainties }
}

/**
 * 발화 시점 작업 버전(snapshot)과 비교.
 * - 등록 터미널로 빈칸을 채우지 않는다.
 * - "차이"는 교신 언급과 앱 기록이 다르다는 뜻일 뿐, 작업 지시 확정이 아니다.
 */
export function compareWithTask(entities: Entities, uncertainties: Uncertainty[], snapshot: TaskVersion | null): Comparison {
  if (!snapshot) return { kind: 'unknown', reasonCodes: ['NO_TASK'], againstTaskVersion: null }
  const base = { againstTaskVersion: snapshot.version }

  const vesselUncertain = uncertainties.some((u) => u.field === 'vessel')
  if (vesselUncertain || !entities.vessel) return { ...base, kind: 'unknown', reasonCodes: ['VESSEL_UNCLEAR'] }

  const mine = entities.vessel === snapshot.targetVessel || entities.vessel === snapshot.ownVessel
  if (!mine) return { ...base, kind: 'unrelated', reasonCodes: [] }

  const placeUncertain = uncertainties.filter((u) => u.field === 'terminalId' || u.field === 'berthId')
  if (placeUncertain.length > 0) return { ...base, kind: 'ambiguous', reasonCodes: ['ASR_DISAGREEMENT'] }

  if (!entities.terminalId) {
    if (entities.berthId) return { ...base, kind: 'ambiguous', reasonCodes: ['TERMINAL_MISSING'] }
    return { ...base, kind: 'unknown', reasonCodes: [] }
  }

  const sameTerminal = entities.terminalId === snapshot.terminalId
  const sameBerth = !entities.berthId || entities.berthId === snapshot.berthId
  if (sameTerminal && sameBerth) return { ...base, kind: 'match', reasonCodes: [] }
  return { ...base, kind: 'difference', reasonCodes: [] }
}
