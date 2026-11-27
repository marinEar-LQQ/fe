import type { ComparisonKind, ReasonCode, ReviewStatus, TranslationStatus } from './types'

/** 상태는 색상만으로 구분하지 않고 항상 텍스트 라벨을 함께 쓴다 */
export const COMPARISON_LABEL: Record<ComparisonKind, string> = {
  match: '일치',
  difference: '장소 차이',
  ambiguous: '불명확',
  unrelated: '다른 선박',
  unknown: '미확정',
}

export const COMPARISON_HINT: Record<ComparisonKind, string> = {
  match: '등록 작업과 같습니다. 자동 승인은 아닙니다.',
  difference: '교신 언급이 앱 기록과 다릅니다. 실제 작업 지시 확정을 뜻하지 않습니다.',
  ambiguous: '후보가 여러 개이거나 정보가 빠졌습니다. 재확인이 필요합니다.',
  unrelated: '내 작업과 관련 없는 교신으로 분류했습니다.',
  unknown: '대상이나 장소를 판별할 정보가 부족합니다.',
}

export const REASON_LABEL: Record<ReasonCode, string> = {
  ASR_DISAGREEMENT: '원음·완화음 인식 결과가 다름',
  TERMINAL_MISSING: '터미널 언급 없음',
  VESSEL_UNCLEAR: '선박 미확정',
  NO_TASK: '등록된 작업 없음',
  NOT_IN_CATALOG: '카탈로그에 없는 장소',
  SILENCE: '무음',
  CLIPPING: '입력 포화',
  AUDIO_GAP: '입력 누락 구간',
  CROSS_CHECK_PENDING: '원음 교차 검사 중',
}

export const REVIEW_LABEL: Record<ReviewStatus, string> = {
  unreviewed: '미확인',
  reviewed: '확인함',
  dismissed: '관련 없음',
  applied: '기록 반영',
}

export const TRANSLATION_STATUS_LABEL: Record<TranslationStatus, string> = {
  loading: '번역 중…',
  ready: '번역 완료',
  unsupported: '지원하지 않는 언어',
  'not-installed': '번역 자원 미설치 · 설정에서 다운로드 필요',
  failed: '번역 실패 · 한국어 원문을 확인하세요',
  'needs-check': '번역 확인 필요 · 코드/숫자가 바뀌었을 수 있음',
}

/** 재확인 대상 판정 */
export function needsReview(kind: ComparisonKind | undefined): boolean {
  return kind === 'difference' || kind === 'ambiguous'
}

export function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function formatClock(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}
