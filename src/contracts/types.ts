/**
 * marinEar 공통 계약 (프론트·백엔드·통합 기술설명서 v1.0 기준)
 * - 이 파일의 이름과 의미는 세 문서에서 공통이다. 변경은 백엔드와 합의 후에만 한다.
 * - 값이 불명확하면 null 로 둔다. 임의로 추정하지 않는다.
 */

export const SCHEMA_VERSION = 1 as const

/* ───────── 언어 ───────── */
export type LangCode = 'ko' | 'my' | 'id' | 'en' | 'fil' | 'vi'

/* ───────── 작업 ───────── */
export interface TaskDraft {
  taskId?: string
  ownVessel: string
  targetVessel: string
  terminalId: string | null
  berthId: string | null
  note: string
}

/** 불변 작업 버전 */
export interface TaskVersion {
  taskId: string
  version: number
  ownVessel: string
  targetVessel: string
  terminalId: string | null
  berthId: string | null
  note: string
  createdAt: string // ISO 8601
  /** 어떤 경로로 생성되었는지: 직접 등록 / 교신 확인 후 반영 */
  origin: 'manual' | 'review-apply'
  sourceUtteranceId?: string
}

/* ───────── 세션 / 발화 ───────── */
export type SessionSource = 'file' | 'live' | 'demo'

export interface Session {
  sessionId: string
  taskId: string | null
  source: SessionSource
  startedAt: string
  endedAt: string | null
  inputInfo: Record<string, unknown> | null
  gapEvents: { atMs: number; missingFrames: number }[]
}

export interface AudioRef {
  variant: 'raw' | 'enhanced'
  available: boolean
  deleted?: boolean
}

export interface Utterance {
  utteranceId: string
  sessionId: string
  taskId: string | null
  taskVersion: number | null
  startMs: number
  endMs: number
  capturedAt: string
  audioRefs: AudioRef[]
  /** 시연 고정 데이터 여부 — 화면에서 반드시 별도 배지로 구분 */
  isFixture: boolean
}

/* ───────── 분석 결과 ───────── */
export type ComparisonKind = 'match' | 'difference' | 'ambiguous' | 'unrelated' | 'unknown'

export type ReasonCode =
  | 'ASR_DISAGREEMENT'
  | 'TERMINAL_MISSING'
  | 'VESSEL_UNCLEAR'
  | 'NO_TASK'
  | 'NOT_IN_CATALOG'
  | 'SILENCE'
  | 'CLIPPING'
  | 'AUDIO_GAP'
  | 'CROSS_CHECK_PENDING'

export interface Transcript {
  text: string
  segments?: { startMs: number; endMs: number; text: string }[]
  confidence?: number | null
}

export interface Entities {
  vessel: string | null
  terminalId: string | null
  berthId: string | null
  time?: string | null
  distance?: string | null
  identifier?: string | null
  changeIntent?: boolean | null
}

export interface Uncertainty {
  field: keyof Entities
  alternatives: string[]
  reasonCode: ReasonCode
}

export interface Comparison {
  kind: ComparisonKind
  reasonCodes: ReasonCode[]
  /** 비교에 사용한 작업 버전 (발화 시작 시점 스냅샷) */
  againstTaskVersion: number | null
}

export interface AnalysisResult {
  schemaVersion: typeof SCHEMA_VERSION
  utteranceId: string
  sessionId: string
  taskId: string | null
  taskVersion: number | null
  revision: number
  status: 'partial' | 'final'
  timing: { startMs: number; endMs: number }
  rawTranscript: Transcript | null
  enhancedTranscript: Transcript | null
  entities: Entities
  comparison: Comparison | null
  uncertainties: Uncertainty[]
  crossCheck: 'pending' | 'complete' | 'unavailable'
  modelVersions: Record<string, string>
  catalogVersion: string
  createdAt: string
}

/* ───────── 번역 ───────── */
export type TranslationStatus = 'loading' | 'ready' | 'unsupported' | 'not-installed' | 'failed' | 'needs-check'

export interface Translation {
  utteranceId: string
  sourceRevision: number
  targetLang: LangCode
  status: TranslationStatus
  text: string | null
  protectedTokens: string[]
  modelVersion: string | null
}

/* ───────── 검토 ───────── */
export type ReviewAction = 'review' | 'dismiss' | 'apply'
export type ReviewStatus = 'unreviewed' | 'reviewed' | 'dismissed' | 'applied'

export interface ReviewEvent {
  eventId: string
  utteranceId: string
  resultRevision: number
  action: ReviewAction
  at: string
  confirmedByUser: boolean
  taskVersionBefore: number | null
  taskVersionAfter: number | null
}

export interface ReviewCommand {
  utteranceId: string
  action: ReviewAction
  expectedTaskVersion: number | null
  expectedResultRevision: number
  confirmedByUser: boolean
  /** apply 일 때만: 사용자가 명시적으로 선택한 값 */
  patch?: { terminalId: string; berthId: string | null }
}

/* ───────── 메모 (계약 외 · 백엔드와 협의 필요) ───────── */
export interface Note {
  noteId: string
  taskId: string
  text: string
  at: string
}

/* ───────── 자원 / 준비 상태 ───────── */
export interface ReadinessItem {
  id: string
  label: string
  status: 'ready' | 'missing' | 'downloading' | 'integrity-failed' | 'not-applicable'
  bytes?: number
  version?: string
}

export interface Readiness {
  offlineReady: boolean
  items: ReadinessItem[]
  /** 엔진 구현 종류 — Mock 은 실제 분석이 아님을 화면에 알린다 */
  engineKind: 'mock' | 'worker' | 'pc'
}

export interface AssetManifest {
  version: string
  items: { id: string; url: string; sha256: string; bytes: number; role: string }[]
}

/* ───────── 오디오 ───────── */
export interface AudioFrame {
  sessionId: string
  seq: number
  startMs: number
  sampleRate: number
  channels: 1
  pcm: Float32Array
}

/* ───────── 이벤트 ───────── */
export type InputStatus = 'idle' | 'requesting' | 'ready' | 'capturing' | 'paused' | 'disconnected' | 'error'
export type EngineStatus = 'loading' | 'ready' | 'processing' | 'degraded' | 'error'

export type ErrorCode =
  | 'MODEL_NOT_READY'
  | 'MODEL_INTEGRITY'
  | 'INPUT_DISCONNECTED'
  | 'AUDIO_GAP'
  | 'QUEUE_OVERFLOW'
  | 'INFERENCE_FAILED'
  | 'VERSION_CONFLICT'
  | 'RESULT_STALE'
  | 'STORAGE_FULL'
  | 'TRANSLATION_UNAVAILABLE'
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'

interface EventBase {
  schemaVersion: typeof SCHEMA_VERSION
  eventId: string
  requestId?: string
  sessionId?: string
  utteranceId?: string
  seq: number
  revision?: number
}

export type EngineEvent =
  | (EventBase & { type: 'input.status'; payload: { status: InputStatus; level?: number; detail?: string } })
  | (EventBase & { type: 'analysis.progress'; payload: { engine: EngineStatus; queueDepth: number; stage?: string } })
  | (EventBase & { type: 'transcript.partial'; payload: { utterance: Utterance; text: string } })
  | (EventBase & { type: 'analysis.final'; payload: { utterance: Utterance; result: AnalysisResult } })
  | (EventBase & { type: 'translation.updated'; payload: Translation })
  | (EventBase & { type: 'review.updated'; payload: ReviewEvent })
  | (EventBase & { type: 'task.updated'; payload: { taskId: string; activeVersion: number; version: TaskVersion } })
  | (EventBase & { type: 'engine.error'; payload: { code: ErrorCode; message: string; recoverable: boolean } })

export type EngineEventType = EngineEvent['type']

/* ───────── 명령 결과 ───────── */
export type Result<T> = { ok: true; value: T } | { ok: false; code: ErrorCode; message: string }

export interface AudioClip {
  available: boolean
  reason?: 'DEMO_NO_AUDIO' | 'ENGINE_NOT_CONNECTED' | 'DELETED' | 'NOT_FOUND'
  blob?: Blob
  /** 단어 정렬이 검증되지 않았으면 발화 전체 구간 */
  wholeUtterance: boolean
}

export interface TaskLog {
  taskId: string
  activeVersion: number
  versions: TaskVersion[]
  utterances: { utterance: Utterance; result: AnalysisResult; review: ReviewStatus }[]
  reviewEvents: ReviewEvent[]
  notes: Note[]
}

export interface ExportFile {
  filename: string
  mime: string
  content: string
}
