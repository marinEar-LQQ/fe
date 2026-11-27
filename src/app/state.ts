import { normalizeLang } from '../contracts/lang'
import type {
  AnalysisResult,
  EngineEvent,
  EngineStatus,
  ErrorCode,
  InputStatus,
  LangCode,
  Readiness,
  ReviewStatus,
  SessionSource,
  TaskVersion,
  Translation,
  Utterance,
} from '../contracts/types'

/** UI 상태와 업무 기록을 분리한다. 업무 원본은 엔진(IndexedDB)에 있고 여기엔 화면용 사본만 둔다. */
export interface MessageEntry {
  utterance: Utterance
  partialText: string | null
  result: AnalysisResult | null
}

export type Filter = 'all' | 'mine' | 'review'

export interface AppState {
  taskState: { active: TaskVersion | null; loaded: boolean }
  inputState: { status: InputStatus; level: number; detail: string | null }
  engineState: { status: EngineStatus; queueDepth: number; stage: string | null; readiness: Readiness | null }
  session: { sessionId: string | null; source: SessionSource | null }
  messageState: { order: string[]; byId: Record<string, MessageEntry> }
  translations: Record<string, Translation>
  reviewState: Record<string, ReviewStatus>
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
    engineState: { status: 'loading', queueDepth: 0, stage: null, readiness: null },
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
  | { type: 'engine-event'; event: EngineEvent }
  | { type: 'task-loaded'; task: TaskVersion | null }
  | { type: 'readiness'; readiness: Readiness }
  | { type: 'session'; sessionId: string | null; source: SessionSource | null }
  | { type: 'input'; status: InputStatus; level?: number; detail?: string | null }
  | { type: 'input-level'; level: number }
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
      return { ...state, engineState: { ...state.engineState, readiness: action.readiness, status: state.engineState.status === 'loading' ? 'ready' : state.engineState.status } }
    case 'session':
      return { ...state, session: { sessionId: action.sessionId, source: action.source } }
    case 'input':
      return { ...state, inputState: { status: action.status, level: action.level ?? (action.status === 'capturing' ? state.inputState.level : 0), detail: action.detail ?? null } }
    case 'input-level':
      return state.inputState.status === 'capturing' ? { ...state, inputState: { ...state.inputState, level: action.level } } : state
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

/**
 * 이벤트 수신 규칙
 * - 같은 eventId 는 한 번만 처리한다.
 * - utteranceId+revision 으로 중복·역순 갱신을 막는다 (이전 revision 으로 덮어쓰기 금지).
 * - partial 은 final 이 이미 있으면 무시한다.
 * - 번역은 utteranceId+sourceRevision+lang 키로 따로 보관해 언어 전환 후 늦은 응답이 현재 카드를 덮지 않게 한다.
 */
export function applyEvent(state: AppState, event: EngineEvent): AppState {
  if (state.seenEventIds[event.eventId]) return state
  const s: AppState = { ...state, seenEventIds: { ...state.seenEventIds, [event.eventId]: true } }

  switch (event.type) {
    case 'input.status':
      return { ...s, inputState: { status: event.payload.status, level: event.payload.level ?? 0, detail: event.payload.detail ?? null } }

    case 'analysis.progress':
      if (event.payload.stage === 'SESSION_CLOSED' && event.sessionId === s.session.sessionId) {
        return { ...s, session: { sessionId: null, source: null }, engineState: { ...s.engineState, status: event.payload.engine, queueDepth: 0, stage: null } }
      }
      return { ...s, engineState: { ...s.engineState, status: event.payload.engine, queueDepth: event.payload.queueDepth, stage: event.payload.stage ?? null } }

    case 'transcript.partial': {
      const { utterance, text } = event.payload
      const existing = s.messageState.byId[utterance.utteranceId]
      if (existing?.result) return s
      return withMessage(s, { utterance, partialText: text, result: null })
    }

    case 'analysis.final': {
      const { utterance, result } = event.payload
      const existing = s.messageState.byId[utterance.utteranceId]
      if (existing?.result && existing.result.revision >= result.revision) return s
      return withMessage(s, { utterance, partialText: null, result })
    }

    case 'translation.updated': {
      const t = event.payload
      const key = translationKey(t.utteranceId, t.sourceRevision, t.targetLang)
      const prev = s.translations[key]
      // 완료된 번역을 늦게 온 loading 으로 되돌리지 않는다
      if (prev && prev.status !== 'loading' && t.status === 'loading') return s
      return { ...s, translations: { ...s.translations, [key]: t } }
    }

    case 'review.updated': {
      const ev = event.payload
      const status: ReviewStatus = ev.action === 'apply' ? 'applied' : ev.action === 'dismiss' ? 'dismissed' : 'reviewed'
      return { ...s, reviewState: { ...s.reviewState, [ev.utteranceId]: status } }
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
