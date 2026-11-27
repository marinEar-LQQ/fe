import type {
  AnalysisResult,
  AnalysisStage,
  AnyEngineEvent,
  ErrorCode,
  LangCode,
  Readiness,
  ReviewState,
  Session,
  TaskVersion,
  Translation,
  Utterance,
  UtteranceLogEntry,
} from 'marinear-engine'
import { normalizeLang } from '../contracts/lang'

/** 카드 진행 단계: 엔진 AnalysisStage + 최종(crossCheck 완료) */
export type CardStage = AnalysisStage | 'done'

/** UI 상태와 업무 기록을 분리한다. 업무 원본은 엔진(IndexedDB)에 있고 여기엔 화면용 사본만 둔다. */
export interface MessageEntry {
  utterance: Utterance
  stage: CardStage | null
  partialText: string | null
  result: AnalysisResult | null
  /** origin==='fixture' 또는 session.inputInfo.fixtureMode — "시연 데이터" 배지 */
  fixture: boolean
}

export type Filter = 'all' | 'mine' | 'review'
/** 화면의 입력 장치 상태 (엔진 input.status 와 별개로, 마이크 권한·캡처 상태를 나타낸다) */
export type UiInputStatus = 'idle' | 'requesting' | 'capturing' | 'disconnected' | 'error'
/** 화면에서 시작한 수신 종류. demo 는 Mock 의 playScenario */
export type UiSource = 'live' | 'file' | 'demo'
export type EngineStatus = Readiness['engine']

export interface AppState {
  taskState: { active: TaskVersion | null; loaded: boolean }
  inputState: { status: UiInputStatus; level: number; detail: string | null }
  engineState: { queueDepth: number; readiness: Readiness | null }
  /** source 가 있으면 수신/분석 중. 파일 분석은 analyzeFile 이 세션을 직접 열어 sessionId 가 없을 수 있다. */
  session: { sessionId: string | null; source: UiSource | null }
  messageState: { order: string[]; byId: Record<string, MessageEntry> }
  translations: Record<string, Translation>
  reviewState: Record<string, ReviewState>
  errors: { id: string; code: ErrorCode; message: string; at: number }[]
  preferences: { targetLang: LangCode; inputDeviceId: string | null; largeText: boolean }
  uiState: { filter: Filter }
  seenEventIds: Record<string, true>
}

export const translationKey = (utteranceId: string, revision: number, lang: LangCode) => `${utteranceId}:${revision}:${lang}`

export function loadPreferences(): AppState['preferences'] {
  try {
    const raw = JSON.parse(localStorage.getItem('marinear.prefs') ?? '{}')
    return { targetLang: normalizeLang(raw.targetLang), inputDeviceId: raw.inputDeviceId ?? null, largeText: Boolean(raw.largeText) }
  } catch {
    return { targetLang: 'ko', inputDeviceId: null, largeText: false }
  }
}

export function initialState(prefs?: AppState['preferences']): AppState {
  return {
    taskState: { active: null, loaded: false },
    inputState: { status: 'idle', level: 0, detail: null },
    engineState: { queueDepth: 0, readiness: null },
    session: { sessionId: null, source: null },
    messageState: { order: [], byId: {} },
    translations: {},
    reviewState: {},
    errors: [],
    preferences: prefs ?? { targetLang: 'ko', inputDeviceId: null, largeText: false },
    uiState: { filter: 'all' },
    seenEventIds: {},
  }
}

export type Action =
  | { type: 'engine-event'; event: AnyEngineEvent }
  | { type: 'task-loaded'; task: TaskVersion | null }
  | { type: 'readiness'; readiness: Readiness }
  | { type: 'session'; sessionId: string | null; source: UiSource | null }
  | { type: 'input'; status: UiInputStatus; level?: number; detail?: string | null }
  | { type: 'input-level'; level: number }
  | { type: 'translation'; translation: Translation }
  | { type: 'set-filter'; filter: Filter }
  | { type: 'set-pref'; prefs: Partial<AppState['preferences']> }
  | { type: 'error'; code: ErrorCode; message: string }
  | { type: 'dismiss-error'; id: string }
  | { type: 'clear-messages' }

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'engine-event':
      return applyEvent(state, action.event)
    case 'task-loaded':
      return { ...state, taskState: { active: action.task, loaded: true } }
    case 'readiness':
      return { ...state, engineState: { ...state.engineState, readiness: action.readiness } }
    case 'session':
      return { ...state, session: { sessionId: action.sessionId, source: action.source } }
    case 'input':
      return { ...state, inputState: { status: action.status, level: action.level ?? (action.status === 'capturing' ? state.inputState.level : 0), detail: action.detail ?? null } }
    case 'input-level':
      return state.inputState.status === 'capturing' ? { ...state, inputState: { ...state.inputState, level: action.level } } : state
    case 'translation':
      return withTranslation(state, action.translation)
    case 'set-filter':
      return { ...state, uiState: { ...state.uiState, filter: action.filter } }
    case 'set-pref':
      return { ...state, preferences: { ...state.preferences, ...action.prefs } }
    case 'error':
      return pushError(state, action.code, action.message)
    case 'dismiss-error':
      return { ...state, errors: state.errors.filter((e) => e.id !== action.id) }
    case 'clear-messages':
      return { ...state, messageState: { order: [], byId: {} }, translations: {}, reviewState: {} }
  }
}

function pushError(state: AppState, code: ErrorCode, message: string): AppState {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  return { ...state, errors: [...state.errors.slice(-4), { id, code, message, at: Date.now() }] }
}

/** 완료된 번역을 늦게 온 pending 으로 되돌리지 않는다 */
function withTranslation(s: AppState, t: Translation): AppState {
  const key = translationKey(t.utteranceId, t.sourceRevision, t.targetLang)
  const prev = s.translations[key]
  if (prev && prev.status !== 'pending' && t.status === 'pending') return s
  return { ...s, translations: { ...s.translations, [key]: t } }
}

/**
 * 이벤트 수신 규칙
 * - 같은 eventId 는 한 번만 처리한다.
 * - 발화는 analysis.progress(queued) 의 utterance 로 등록한다.
 * - utteranceId+revision 으로 중복·역순 갱신을 막는다 (이전 revision 으로 덮어쓰기 금지).
 * - partial 은 final 이 이미 있으면 무시한다. partial 은 검토·반영에 쓰지 않는다.
 * - 번역은 utteranceId+sourceRevision+lang 키로 따로 보관해 언어 전환 후 늦은 응답이 현재 카드를 덮지 않게 한다.
 */
export function applyEvent(state: AppState, event: AnyEngineEvent): AppState {
  if (state.seenEventIds[event.eventId]) return state
  const s: AppState = { ...state, seenEventIds: { ...state.seenEventIds, [event.eventId]: true } }

  switch (event.type) {
    case 'input.status': {
      const { status } = event.payload
      if (status === 'disconnected' && event.sessionId && event.sessionId === s.session.sessionId)
        return { ...s, inputState: { status: 'disconnected', level: 0, detail: '입력 장치 연결이 끊겼습니다.' } }
      return { ...s, engineState: { ...s.engineState, queueDepth: event.payload.queueDepth } }
    }

    case 'analysis.progress': {
      const { stage, queueDepth, utterance } = event.payload
      const next = { ...s, engineState: { ...s.engineState, queueDepth } }
      const id = utterance?.utteranceId ?? event.utteranceId
      if (!id) return next
      const existing = next.messageState.byId[id]
      if (existing) {
        if (existing.stage === 'done') return next
        return withMessage(next, { ...existing, stage })
      }
      if (!utterance) return next
      const fixture = Boolean(next.engineState.readiness?.fixtureMode) || next.session.source === 'demo'
      return withMessage(next, { utterance, stage, partialText: null, result: null, fixture })
    }

    case 'transcript.partial': {
      const id = event.utteranceId
      const existing = id ? s.messageState.byId[id] : undefined
      if (!existing || existing.result) return s
      return withMessage(s, { ...existing, partialText: event.payload.text })
    }

    case 'analysis.final': {
      const { result } = event.payload
      const existing = s.messageState.byId[result.utteranceId]
      if (existing?.result && existing.result.revision >= result.revision) return s
      return withMessage(s, {
        utterance: existing?.utterance ?? utteranceFromResult(result),
        stage: result.crossCheck === 'pending' ? (existing?.stage ?? null) : 'done',
        partialText: null,
        result,
        fixture: Boolean(existing?.fixture) || result.origin === 'fixture',
      })
    }

    case 'translation.updated':
      return withTranslation(s, event.payload.translation)

    case 'review.updated': {
      const { event: ev, reviewState } = event.payload
      return { ...s, reviewState: { ...s.reviewState, [ev.utteranceId]: reviewState } }
    }

    case 'task.updated':
      return { ...s, taskState: { active: event.payload.version, loaded: true } }

    case 'engine.error':
      return pushError(s, event.payload.code, event.payload.message)
  }
}

function withMessage(s: AppState, entry: MessageEntry): AppState {
  const id = entry.utterance.utteranceId
  const order = s.messageState.order.includes(id) ? s.messageState.order : [...s.messageState.order, id]
  return { ...s, messageState: { order, byId: { ...s.messageState.byId, [id]: entry } } }
}

/** queued 이벤트를 놓쳤을 때 결과만으로 최소 발화 정보를 만든다 */
export function utteranceFromResult(r: AnalysisResult): Utterance {
  return {
    utteranceId: r.utteranceId,
    sessionId: r.sessionId,
    taskId: r.taskId ?? '',
    taskVersion: r.taskVersion ?? 0,
    startMs: r.timing.startMs,
    endMs: r.timing.endMs,
    capturedAt: r.createdAt,
    audioRefs: [],
    audioFlags: r.audioFlags,
  }
}

/** 저장된 일지 항목 → 화면 항목 (최신 revision 기준) */
export function entryFromLog(u: UtteranceLogEntry, sessions: Session[]): MessageEntry {
  const result = u.results[u.results.length - 1] ?? null
  const session = sessions.find((x) => x.sessionId === u.utterance.sessionId)
  return {
    utterance: u.utterance,
    stage: result && result.crossCheck !== 'pending' ? 'done' : null,
    partialText: null,
    result,
    fixture: u.results.some((r) => r.origin === 'fixture') || Boolean(session?.inputInfo.fixtureMode),
  }
}

const ACTIVE_STAGES = new Set<CardStage>(['queued', 'segmenting', 'enhancing', 'asr_enhanced', 'asr_raw', 'extracting', 'comparing'])

/** 엔진 상태 표시: readiness + 진행 중인 발화로 계산 */
export function engineStatus(state: AppState): EngineStatus {
  const r = state.engineState.readiness
  if (!r) return 'loading'
  if (r.engine === 'error') return 'error'
  const busy = state.messageState.order.some((id) => {
    const stage = state.messageState.byId[id]?.stage
    return stage ? ACTIVE_STAGES.has(stage) : false
  })
  if (busy || r.engine === 'processing') return 'processing'
  return r.canAnalyze ? 'ready' : 'degraded'
}
