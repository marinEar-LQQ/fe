import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { CaptureError, startCapture, type CaptureHandle } from '../audio/capture'
import type { LangCode, ReviewCommand, TaskDraft } from '../contracts/types'
import { createEngine, type EngineClient } from '../engine'
import { initialState, loadPreferences, reducer, translationKey, type Action, type AppState } from './state'

interface AppApi {
  state: AppState
  dispatch: React.Dispatch<Action>
  engine: EngineClient
  startDemo: () => Promise<void>
  startFile: (file: File) => Promise<void>
  startLive: () => Promise<void>
  stop: () => Promise<void>
  saveTask: (draft: TaskDraft) => ReturnType<EngineClient['saveTask']>
  review: (cmd: ReviewCommand) => ReturnType<EngineClient['reviewUtterance']>
  setLang: (lang: LangCode) => void
}

const Ctx = createContext<AppApi | null>(null)

export function AppProvider({ children, engine: injected }: { children: ReactNode; engine?: EngineClient }) {
  const engine = useMemo(() => injected ?? createEngine(), [injected])
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState(loadPreferences()))
  const captureRef = useRef<CaptureHandle | null>(null)
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  // 엔진 이벤트 구독 + 초기 상태 복원
  useEffect(() => {
    const unsub = engine.subscribe((event) => dispatch({ type: 'engine-event', event }))
    engine.getActiveTask().then((task) => dispatch({ type: 'task-loaded', task }))
    engine.checkReadiness().then((readiness) => dispatch({ type: 'readiness', readiness }))
    return unsub
  }, [engine])

  // 선호 설정 저장 (작은 설정값만 localStorage)
  useEffect(() => {
    localStorage.setItem('marinear.prefs', JSON.stringify(state.preferences))
    document.documentElement.dataset.largeText = String(state.preferences.largeText)
  }, [state.preferences])

  // 선택 언어의 번역이 없는 최종 결과에 번역 요청 (해당 원문 revision 기준)
  useEffect(() => {
    const lang = state.preferences.targetLang
    if (lang === 'ko') return
    for (const id of state.messageState.order) {
      const r = state.messageState.byId[id]?.result
      if (!r) continue
      const key = translationKey(id, r.revision, lang)
      if (!state.translations[key]) {
        dispatch({
          type: 'engine-event',
          event: { schemaVersion: 1, eventId: `local-${key}`, seq: 0, type: 'translation.updated', payload: { utteranceId: id, sourceRevision: r.revision, targetLang: lang, status: 'loading', text: null, protectedTokens: [], modelVersion: null } },
        })
        void engine.requestTranslation(id, r.revision, lang)
      }
    }
  }, [engine, state.messageState, state.preferences.targetLang, state.translations])

  const stop = useCallback(async () => {
    const { sessionId } = stateRef.current.session
    if (captureRef.current) {
      await captureRef.current.stop()
      captureRef.current = null
    }
    if (sessionId) await engine.closeSession(sessionId)
    dispatch({ type: 'session', sessionId: null, source: null })
    dispatch({ type: 'input', status: 'idle' })
  }, [engine])

  const open = useCallback(
    async (source: 'demo' | 'file', file?: File) => {
      await stop()
      dispatch({ type: 'clear-messages' })
      const taskId = stateRef.current.taskState.active?.taskId ?? null
      const res = await engine.openSession(taskId, source, file)
      if (!res.ok) return dispatch({ type: 'error', code: res.code, message: res.message })
      dispatch({ type: 'session', sessionId: res.value.sessionId, source })
    },
    [engine, stop],
  )

  const startLive = useCallback(async () => {
    await stop()
    dispatch({ type: 'input', status: 'requesting' })
    const taskId = stateRef.current.taskState.active?.taskId ?? null
    let sessionId: string | null = null
    try {
      const handle = await startCapture(stateRef.current.preferences.inputDeviceId, {
        onFrame: (frame, level) => {
          if (sessionId) engine.appendAudio(sessionId, { ...frame, sessionId })
          dispatch({ type: 'input-level', level: level.rms })
        },
        onDisconnected: (reason) => {
          dispatch({ type: 'input', status: 'disconnected', detail: reason })
          dispatch({ type: 'error', code: 'INPUT_DISCONNECTED', message: `${reason} 수신을 중단했습니다. 장치를 다시 연결한 뒤 수신 시작을 누르세요.` })
          captureRef.current = null
          if (sessionId) void engine.closeSession(sessionId)
          dispatch({ type: 'session', sessionId: null, source: null })
        },
      })
      captureRef.current = handle
      const res = await engine.openSession(taskId, 'live')
      if (!res.ok) {
        await handle.stop()
        captureRef.current = null
        dispatch({ type: 'input', status: 'error', detail: res.message })
        return
      }
      sessionId = res.value.sessionId
      dispatch({ type: 'session', sessionId, source: 'live' })
      dispatch({ type: 'input', status: 'capturing', detail: `${handle.info.label || '기본 입력'} · ${handle.info.sampleRate} Hz` })
    } catch (err) {
      const message = err instanceof CaptureError ? err.message : `음성 입력 오류: ${(err as Error).message}`
      dispatch({ type: 'input', status: 'error', detail: message })
    }
  }, [engine, stop])

  const api: AppApi = {
    state,
    dispatch,
    engine,
    startDemo: () => open('demo'),
    startFile: (file) => open('file', file),
    startLive,
    stop,
    saveTask: (draft) => engine.saveTask(draft, stateRef.current.taskState.active?.version),
    review: (cmd) => engine.reviewUtterance(cmd),
    setLang: (lang) => dispatch({ type: 'set-pref', prefs: { targetLang: lang } }),
  }

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp(): AppApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp must be used inside AppProvider')
  return v
}
