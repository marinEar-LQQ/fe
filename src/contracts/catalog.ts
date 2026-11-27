import { DEMO_CATALOG, validateTaskDraft, type CatalogManifest, type TaskDraft, type TerminalEntry } from 'marinear-engine'

/**
 * 장소 카탈로그 화면 헬퍼. 카탈로그 원본은 엔진(marinear-engine)이 쓰는 것과 같은 DEMO_CATALOG 다.
 * ⚠️ kind='demo' — 선석 T1~T5 와 별칭은 시연 fixture. 화면에서 임의로 실재 장소 대응을 추가하지 않는다.
 */
export const CATALOG: CatalogManifest = DEMO_CATALOG

export function findTerminal(catalog: CatalogManifest, terminalId: string | null | undefined): TerminalEntry | undefined {
  if (!terminalId) return undefined
  return catalog.terminals.find((t) => t.terminalId === terminalId)
}

/** 엔진과 같은 검증 규칙(validateTaskDraft) + 화면 규칙(터미널·선석 필수) */
export function validateDraft(draft: TaskDraft, catalog: CatalogManifest = CATALOG): Partial<Record<keyof TaskDraft, string>> {
  const errors: Partial<Record<keyof TaskDraft, string>> = {}
  for (const issue of validateTaskDraft(draft, catalog)) {
    const field = issue.field as keyof TaskDraft
    errors[field] ??= issue.message
  }
  if (!draft.terminalId) errors.terminalId ??= 'required'
  else if (!draft.berthId) errors.berthId ??= 'required'
  return errors
}
