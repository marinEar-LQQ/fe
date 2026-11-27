import type { SummaryLine, Translation } from 'marinear-engine'
import { ko } from '../i18n/ko'

/** 정형 요약 줄의 한국어 필드명 (관제·항해사용 보조 라벨). 모든 field 를 타입으로 강제 */
export const SUMMARY_FIELD_KO: Record<SummaryLine['field'], string> = ko.summaryField

export interface TranslationView {
  /** 정형 요약 카드 (항상 먼저, 크게). status 가 unavailable 이어도 summary 가 있으면 표시 */
  summary: SummaryLine[] | null
  /** 참고용 기계번역 (reference=true) — "참고 번역 (부정확할 수 있음)" 라벨로 작게 */
  referenceText: string | null
  /** 일반 문장 번역 (reference=false) */
  text: string | null
}

export function translationView(t: Translation | undefined): TranslationView {
  if (!t) return { summary: null, referenceText: null, text: null }
  const summary = t.summary?.lines.length ? t.summary.lines : null
  return {
    summary,
    referenceText: t.text && t.reference ? t.text : null,
    text: t.text && !t.reference ? t.text : null,
  }
}
