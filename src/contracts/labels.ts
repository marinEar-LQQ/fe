import type { AnalysisStage, AssetStatus, AudioFlag, ComparisonKind, FieldDiff, GapReason, InputStatus, LangAvailability, ReasonCode, ReviewState, TranslationStatus } from 'marinear-engine'

/**
 * 화면용 라벨. 타입·계약은 marinear-engine 이 원본이고 여기엔 표시 문구만 둔다.
 * 상태는 색상만으로 구분하지 않고 항상 텍스트 라벨을 함께 쓴다.
 */
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
  BERTH_MISSING: '선석 언급 없음',
  VESSEL_MISSING: '선박 언급 없음',
  VESSEL_AMBIGUOUS: '선박 후보 여러 개',
  MULTIPLE_CANDIDATES: '장소 후보 여러 개',
  CORRECTION_UNCLEAR: '정정 내용 불명확',
  CATALOG_UNKNOWN: '카탈로그에 없는 장소',
  BERTH_NOT_IN_TERMINAL: '해당 터미널에 없는 선석',
  NUMBER_TYPE_UNCLEAR: '숫자 의미 불명확',
  OTHER_VESSEL: '다른 선박 교신',
  LOCATION_DIFFERS: '장소가 기준과 다름',
  LOCATION_MATCHES: '장소가 기준과 같음',
  NO_TASK: '등록된 작업 없음',
  CROSS_CHECK_PENDING: '원음 교차 검사 중',
  AUDIO_QUALITY: '음질 문제',
  ASR_CONFUSABLE: '인식이 불확실합니다. 확인 필요',
}

/** 입력 품질 근거 (Utterance/AnalysisResult.audioFlags) */
export const AUDIO_FLAG_LABEL: Record<AudioFlag, string> = {
  SILENCE: '무음 구간 포함',
  CLIPPING: '입력 포화 · 소리 깨짐',
  AUDIO_GAP: '수신 누락 구간 포함',
  TRUNCATED: '발화가 잘림 (최대 길이 초과)',
}

/** 엔진이 보는 실시간 입력 상태 (input.status) */
export const LIVE_INPUT_LABEL: Record<InputStatus, string> = {
  receiving: '엔진 수신 중',
  gap: '누락 구간 발생',
  disconnected: '입력 끊김',
  closed: '수신 종료',
}

export const GAP_REASON_LABEL: Record<GapReason, string> = {
  AUDIO_GAP: '입력 프레임 누락',
  INPUT_DISCONNECTED: '입력 장치 끊김',
  QUEUE_OVERFLOW: '처리 대기열 초과 (원음 보존)',
}

export const DIFF_FIELD_LABEL: Record<FieldDiff['field'], string> = {
  terminalId: '터미널',
  berthId: '선석',
}

export const REVIEW_LABEL: Record<ReviewState, string> = {
  unreviewed: '미확인',
  reviewed: '확인함',
  dismissed: '관련 없음',
  applied: '기록 반영',
}

export const TRANSLATION_STATUS_LABEL: Record<TranslationStatus, string> = {
  pending: '번역 중…',
  ready: '번역 완료',
  needs_check: '번역 확인 필요 · 코드/숫자가 바뀌었을 수 있음',
  failed: '번역 실패 · 한국어 원문을 확인하세요',
  unavailable: '번역 자원 없음 · 한국어 원문을 확인하세요',
}

export const LANG_AVAILABILITY_LABEL: Record<LangAvailability, string> = {
  source: '원문',
  ready: '사용 가능',
  not_installed: '번역 자원 미설치 · 설정에서 다운로드 필요',
  unsupported: '지원하지 않는 언어',
}

/** 카드에 보여줄 분석 진행 단계 */
export const STAGE_LABEL: Record<AnalysisStage | 'done', string> = {
  queued: '분석 대기',
  segmenting: '발화 분리 중',
  enhancing: '잡음 완화 중',
  asr_enhanced: '완화음 인식 중',
  asr_raw: '원음 교차 인식 중',
  extracting: '장소·선박 추출 중',
  comparing: '기준과 비교 중',
  failed: '분석 실패 · 원음은 보존됨',
  done: '분석 완료',
}

export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  missing: '다운로드 필요',
  downloading: '다운로드 중',
  verifying: '검증 중',
  ready: '준비됨',
  integrity_failed: '검증 실패',
  error: '오류',
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
