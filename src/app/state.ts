import type {
  AnalysisResult,
  AnalysisStage,
  AnyEngineEvent,
  ErrorCode,
  GapEvent,
  InputStatus,
  LangCode,
  LoadProgress,
  Readiness,
  ReviewState,
  Session,
  TaskVersion,
  Translation,
  Utterance,
  UtteranceLogEntry,
} from 'marinear-engine'
import { isUiLang, normalizeLang } from '../contracts/lang'

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
/** 입력 문제 종류 — 문구는 화면 언어로 (t.capture[kind]). extra 는 엔진·브라우저가 준 원문 */
export type InputIssueKind = 'insecure' | 'unsupported' | 'permission-denied' | 'no-device' | 'device-busy' | 'unknown' | 'disconnected' | 'open-failed'
export interface InputIssue {
  kind: InputIssueKind
  extra?: string
}
/** 화면에서 시작한 수신 종류. demo 는 Mock 의 playScenario */
export type UiSource = 'live' | 'file' | 'demo'
export type EngineStatus = Readiness['engine']
/** 엔진 오류 코드 + 화면에서 생기는 알림 (화면 꺼짐 방지 해제, 백그라운드 전환) */
export type NoticeCode = ErrorCode | 'WAKE_LOCK_RELEASED' | 'BACKGROUND_PAUSE'
export type WakeLockState = 'off' | 'active' | 'released' | 'failed' | 'unsupported'
export type OnlineStatus = 'unknown' | 'checking' | 'ok' | 'unavailable'

/** 교신 목록에 끼워 넣는 수신 누락 구간 (input.status 의 gap) */
export interface GapEntry {
  id: string
  sessionId: string
  gap: GapEvent
}

export interface AppState {
  taskState: { active: TaskVersion | null; loaded: boolean }
  /** status: 화면(마이크) 상태, engine: 현재 live 세션에 대해 엔진이 보낸 input.status */
  inputState: { status: UiInputStatus; level: number; device: { label: string; sampleRate: number } | null; issue: InputIssue | null; engine: InputStatus | null }
  wakeLock: WakeLockState
  engineState: { queueDepth: number; readiness: Readiness | null }
  /** 모델 다운로드·검사 진행 (설정 > 분석 엔진). 화면 이동해도 유지 */
  assets: { loading: boolean; progress: Record<string, LoadProgress>; error: string | null }
  /**
   * 온라인 모드 중계 서버 상태. loadAssets(=/api/health) 성공 → ok, 실패·분석 중 ONLINE_UNAVAILABLE → unavailable.
   * (엔진 readiness.canAnalyze 는 온라인 모드에서 서버 확인 전에도 true 라 이 상태로 분석 시작을 막는다)
   */
  online: { status: OnlineStatus; translate: boolean | null; error: string | null }
  /** source 가 있으면 수신/분석 중. 파일 분석은 analyzeFile 이 세션을 직접 열어 sessionId 가 없을 수 있다. */
  session: { sessionId: string | null; source: UiSource | null }
  messageState: { order: string[]; byId: Record<string, MessageEntry> }
  gaps: GapEntry[]
  /** 저장된 일지 기준 미확인 재확인 건수 (새로고침 후에도 하단 메뉴 배지 유지) */
  pendingReviews: number
  translations: Record<string, Translation>
  reviewState: Record<string, ReviewState>
  errors: { id: string; code: NoticeCode; message: string; at: number }[]
  /** langChosen: 시작 언어 선택(00)을 마쳤는지. onlineConsent: 온라인 분석(음성 외부 전송) 고지에 동의했는지 */
  preferences: { targetLang: LangCode; inputDeviceId: string | null; largeText: boolean; langChosen: boolean; onlineConsent: boolean }
  uiState: { filter: Filter }
  seenEventIds: Record<string, true>
}

export const translationKey = (utteranceId: string, revision: number, lang: LangCode) => `${utteranceId}:${revision}:${lang}`

export function loadPreferences(): AppState['preferences'] {
  try {
    const raw = JSON.parse(localStorage.getItem('marinear.prefs') ?? '{}')
    // 예전 버전에서 저장된 설정이 있으면 이미 앱을 쓴 사용자 → 시작 화면을 다시 보이지 않는다
    const langChosen = typeof raw.langChosen === 'boolean' ? raw.langChosen : 'targetLang' in raw
    return { targetLang: normalizeLang(raw.targetLang), inputDeviceId: raw.inputDeviceId ?? null, largeText: Boolean(raw.largeText), langChosen, onlineConsent: raw.onlineConsent === true }
  } catch {
    return { targetLang: 'ko', inputDeviceId: null, largeText: false, langChosen: false, onlineConsent: false }
  }
}

export function initialState(prefs?: AppState['preferences']): AppState {
  return {
    taskState: { active: null, loaded: false },
    inputState: { status: 'idle', level: 0, device: null, issue: null, engine: null },
    wakeLock: 'off',
    engineState: { queueDepth: 0, readiness: null },
    assets: { loading: false, progress: {}, error: null },
    online: { status: 'unknown', translate: null, error: null },
    session: { sessionId: null, source: null },
    messageState: { order: [], byId: {} },
    gaps: [],
    pendingReviews: 0,
    translations: {},
    reviewState: {},
    errors: [],
    preferences: prefs ?? { targetLang: 'ko', inputDeviceId: null, largeText: false, langChosen: false, onlineConsent: false },
    uiState: { filter: 'all' },
    seenEventIds: {},
  }
}

export type Action =
  | { type: 'engine-event'; event: AnyEngineEvent }
  | { type: 'task-loaded'; task: TaskVersion | null }
  | { type: 'readiness'; readiness: Readiness }
  | { type: 'assets-start' }
  | { type: 'assets-progress'; progress: LoadProgress[] }
  | { type: 'assets-done'; error: string | null }
  | { type: 'session'; sessionId: string | null; source: UiSource | null }
  | { type: 'input'; status: UiInputStatus; level?: number; device?: { label: string; sampleRate: number } | null; issue?: InputIssue | null }
  | { type: 'input-level'; level: number }
  | { type: 'translation'; translation: Translation }
  | { type: 'set-filter'; filter: Filter }
  | { type: 'set-pref'; prefs: Partial<AppState['preferences']> }
  | { type: 'error'; code: NoticeCode; message: string }
  | { type: 'wake-lock'; state: WakeLockState }
  | { type: 'pending-reviews'; count: number }
  /** 앱 시작·작업 불러오기 때 저장된 일지의 발화를 교신 목록에 채운다 (새로고침 후 복원) */
  | { type: 'hydrate'; entries: MessageEntry[]; reviewStates: Record<string, ReviewState> }
  | { type: 'online-status'; status: OnlineStatus; translate?: boolean | null; error?: string | null }
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
    case 'assets-start':
      return { ...state, assets: { loading: true, progress: {}, error: null } }
    case 'assets-progress': {
      const progress = { ...state.assets.progress }
      for (const pr of action.progress) progress[pr.modelId] = pr
      return { ...state, assets: { ...state.assets, progress } }
    }
    case 'assets-done':
      return { ...state, assets: { ...state.assets, loading: false, error: action.error } }
    case 'session':
      return {
        ...state,
        session: { sessionId: action.sessionId, source: action.source },
        // openSession 이 성공했다면 엔진은 이미 receiving 을 보냈다 (그 이벤트는 sessionId 를 알기 전에 도착)
        inputState: { ...state.inputState, engine: action.source === 'live' && action.sessionId ? 'receiving' : null },
      }
    case 'input':
      return {
        ...state,
        inputState: {
          ...state.inputState,
          status: action.status,
          level: action.level ?? (action.status === 'capturing' ? state.inputState.level : 0),
          device: action.device ?? (action.status === 'capturing' ? state.inputState.device : null),
          issue: action.issue ?? null,
        },
      }
    case 'wake-lock':
      return { ...state, wakeLock: action.state }
    case 'online-status':
      return { ...state, online: { status: action.status, translate: action.translate ?? state.online.translate, error: action.error ?? null } }
    case 'hydrate': {
      // 화면에 이미 있는(실시간으로 받은) 항목은 그대로 두고 없는 것만 더한다
      const byId = { ...state.messageState.byId }
      const order = [...state.messageState.order]
      for (const e of action.entries) {
        const id = e.utterance.utteranceId
        if (byId[id]) continue
        byId[id] = e
        order.push(id)
      }
      return { ...state, messageState: { order, byId }, reviewState: { ...action.reviewStates, ...state.reviewState } }
    }
    case 'pending-reviews':
      return state.pendingReviews === action.count ? state : { ...state, pendingReviews: action.count }
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
      return { ...state, messageState: { order: [], byId: {} }, gaps: [], translations: {}, reviewState: {} }
  }
}

function pushError(state: AppState, code: NoticeCode, message: string): AppState {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  // 같은 코드가 이미 떠 있으면 새로 쌓지 않고 바꾼다 (발화마다 같은 오류가 와도 알림은 하나)
  const rest = state.errors.filter((e) => e.code !== code)
  return { ...state, errors: [...rest.slice(-4), { id, code, message, at: Date.now() }] }
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
      const { status, gap, queueDepth } = event.payload
      let next: AppState = { ...s, engineState: { ...s.engineState, queueDepth } }
      if (gap && event.sessionId) next = withGap(next, event.sessionId, gap)
      if (!event.sessionId || event.sessionId !== s.session.sessionId) return next
      if (status === 'disconnected') return { ...next, inputState: { status: 'disconnected', level: 0, device: null, issue: { kind: 'disconnected' }, engine: status } }
      return { ...next, inputState: { ...next.inputState, engine: status } }
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

    case 'engine.error': {
      const next = pushError(s, event.payload.code, event.payload.message)
      // 온라인 분석 실패: 연결 상태를 '사용 불가'로 (자동 재시도하지 않는다 — 사용자가 다시 시도)
      if (event.payload.code === 'ONLINE_UNAVAILABLE') return { ...next, online: { ...next.online, status: 'unavailable', error: event.payload.message } }
      return next
    }
  }
}

function withMessage(s: AppState, entry: MessageEntry): AppState {
  const id = entry.utterance.utteranceId
  const order = s.messageState.order.includes(id) ? s.messageState.order : [...s.messageState.order, id]
  return { ...s, messageState: { order, byId: { ...s.messageState.byId, [id]: entry } } }
}

function withGap(s: AppState, sessionId: string, gap: GapEvent): AppState {
  const id = `${sessionId}:${gap.reason}:${gap.startMs}`
  if (s.gaps.some((g) => g.id === id)) return s
  return { ...s, gaps: [...s.gaps, { id, sessionId, gap }] }
}

/** 교신 목록 항목: 발화와 누락 구간을 세션 시간순으로 합친다 (최신이 위) */
export type FeedItem = { kind: 'utterance'; entry: MessageEntry } | { kind: 'gap'; gap: GapEntry }

/** 정렬 시각: 실제 시각(ISO) 기준, 없으면 세션 안 위치. 여러 세션·복원 항목이 섞여도 시간순 */
function timeOf(iso: string, startMs: number): number {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? startMs : t
}

export function buildFeed(state: AppState, filter: Filter): FeedItem[] {
  const items: { at: number; seq: number; item: FeedItem }[] = []
  state.messageState.order.forEach((id, seq) => {
    const entry = state.messageState.byId[id]
    const kind = entry.result?.comparison.kind
    if (filter === 'mine' && kind === 'unrelated') return
    if (filter === 'review' && !(kind === 'difference' || kind === 'ambiguous')) return
    items.push({ at: timeOf(entry.utterance.capturedAt, entry.utterance.startMs), seq, item: { kind: 'utterance', entry } })
  })
  // 누락 구간은 재확인 필터에서는 숨긴다 (판정 대상이 아님)
  if (filter !== 'review') state.gaps.forEach((gap, i) => items.push({ at: timeOf(gap.gap.at, gap.gap.startMs), seq: i, item: { kind: 'gap', gap } }))
  return items.sort((a, b) => b.at - a.at || b.seq - a.seq).map((x) => x.item)
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

/**
 * 번역을 요청할 결과: 원음 교차 검사가 끝난(complete 또는 unavailable) 최신 revision 중 아직 요청하지 않은 것.
 * 문장 번역 모델이 없어도 엔진이 정형 요약(summary)을 돌려주므로(status 'unavailable') 화면 언어면 요청한다.
 */
export function translationTargets(state: AppState, lang: LangCode): { utteranceId: string; revision: number }[] {
  if (lang === 'ko' || !isUiLang(lang)) return []
  const out: { utteranceId: string; revision: number }[] = []
  for (const id of state.messageState.order) {
    const r = state.messageState.byId[id]?.result
    // unavailable 이면 r2 가 오지 않으므로 그 결과로 번역한다
    if (!r || r.crossCheck === 'pending') continue
    if (state.translations[translationKey(id, r.revision, lang)]) continue
    out.push({ utteranceId: id, revision: r.revision })
  }
  return out
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
