import type { ComparisonKind } from 'marinear-engine'
import { ko } from '../i18n/ko'

/**
 * 화면 라벨은 src/i18n 으로 옮겼다 (useT()). 아래 상수는 한국어 원본을 가리키는 호환용 별칭이다.
 * 새 코드는 useT() 를 쓴다.
 */
export const COMPARISON_LABEL = ko.comparison
export const COMPARISON_HINT = ko.comparisonHint
export const REASON_LABEL = ko.reasons
export const AUDIO_FLAG_LABEL = ko.audioFlag
export const LIVE_INPUT_LABEL = ko.liveInput
export const GAP_REASON_LABEL = ko.gapReason
export const DIFF_FIELD_LABEL = { terminalId: ko.fields.terminalId, berthId: ko.fields.berthId }
export const REVIEW_LABEL = ko.review
export const TRANSLATION_STATUS_LABEL = ko.translationStatus
export const LANG_AVAILABILITY_LABEL = ko.langAvailability
export const STAGE_LABEL = ko.stage
export const ASSET_STATUS_LABEL = ko.assetStatus

/** 재확인 대상 판정 */
export function needsReview(kind: ComparisonKind | undefined): boolean {
  return kind === 'difference' || kind === 'ambiguous'
}

export function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** 시각 HH:MM:SS (24시간, 시안 표기) */
export function formatClock(iso: string): string {
  const d = new Date(iso)
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':')
}

/** 날짜 YYYY.MM.DD (시안 표기) */
export function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}
