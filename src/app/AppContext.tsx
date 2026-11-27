import { DEFAULT_ASSET_MANIFEST, analyzeFile, type EngineClient, type LoadProgress, type LangCode, type ReviewCommand, type ReviewEvent, type SaveTaskResult, type TaskDraft } from 'marinear-engine'
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { CaptureError, startCapture, type CaptureHandle } from '../audio/capture'
import { createEngine, type EngineKind, type EngineSetup } from '../engine'
import type { DemoControls } from '../engine/demo'
import { markDisconnected } from '../engine/extensions'
import { restoreActiveTask } from '../engine/restore'
import { LangContext, messagesFor } from '../i18n'
import { describeError } from './errors'
import { useLiveGuards } from './useLiveGuards'
import { entryFromLog, initialState, loadPreferences, reducer, translationTargets, type Action, type AppState } from './state'

interface AppApi {
  state: AppState
  dispatch: React.Dispatch<Action>
  engine: EngineClient
  engineKind: EngineKind
  /** online 모드 중계 서버 주소 */
  proxyUrl: string | null
  /** 실행 중인 엔진에 적용된 오프라인 모드 (allowRemote:false) */
  /** offline 모드에서 외부 다운로드를 막았는지 (allowRemote:false 적용 중) */
  blockRemote: boolean
  /** Mock 엔진일 때만 시연 시나리오를 쓸 수 있다 */
  demoAvailable: boolean
  startDemo: () => Promise<void>
  startFile: (file: File) => Promise<void>
  startLive: () => Promise<void>
  stop: () => Promise<void>
  /** 실패 시 EngineError 를 던진다 (VERSION_CONFLICT 등은 호출부에서 자동 재시도 금지) */
  saveTask: (draft: TaskDraft) => Promise<SaveTaskResult>
  review: (cmd: ReviewCommand) => Promise<ReviewEvent>
  refreshReadiness: () => Promise<void>
  /** loadAssets(DEFAULT_ASSET_MANIFEST) — 모델 다운로드(최초) 또는 캐시에서 다시 불러와 자체 검사 */
  loadModels: () => Promise<void>
  /** 온라인 모드: 중계 서버 연결 확인 (loadAssets → /api/health). 사용자가 누를 때만 — 자동 재시도 없음 */
  checkOnline: () => Promise<void>
  setLang: (lang: LangCode) => void
}

const Ctx = createContext<AppApi | null>(null)

/** 모델을 한 번이라도 준비 완료한 기기 표시 (모델 파일 자체는 브라우저 Cache Storage 에 있다) */
const ASSETS_INSTALLED_KEY = 'marinear.assetsInstalled'

export function AppProvider({ children, engine: injected }: { children: ReactNode; engine?: EngineSetup }) {
  const [setup, setSetup] = useState<EngineSetup | null>(injected ?? null)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    if (injected) return
    createEngine().then(setSetup, (e) => setFailure(describeError(e).message))
  }, [injected])

  // 엔진이 뜨기 전에는 저장된 언어로 안내한다
  if (!setup || failure) {
    const lang = loadPreferences().targetLang
    const t = messagesFor(lang)
    return (
      <LangContext.Provider value={lang}>
        <main className="page">
          {failure ? (
            <div className="notice danger" role="alert">
              {t.app.engineFailed(failure)}
            </div>
          ) : (
            <div className="card empty" role="status">
              <strong>{t.app.engineStarting}</strong>
            </div>
          )}
        </main>
      </LangContext.Provider>
    )
  }
  return <EngineProvider setup={setup}>{children}</EngineProvider>
}

function EngineProvider({ setup, children }: { setup: EngineSetup; children: ReactNode }) {
  const engine = setup.client
  const demo: DemoControls | null = setup.demo
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState(loadPreferences()))
  const captureRef = useRef<CaptureHandle | null>(null)
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  // 알림 문구용: 현재 화면 언어 사전 (참조가 바뀌지 않게 ref 로 읽는다 → 화면 꺼짐 방지 effect 가 매 렌더 재시작되지 않음)
  const getT = useCallback(() => messagesFor(stateRef.current.preferences.targetLang), [])
  useLiveGuards(state.session.source === 'live' && state.inputState.status === 'capturing', dispatch, getT)

  const fail = useCallback((e: unknown) => {
    const { code, message } = describeError(e)
    dispatch({ type: 'error', code, message })
  }, [])

  const refreshReadiness = useCallback(async () => {
    try {
      dispatch({ type: 'readiness', readiness: await engine.checkReadiness() })
    } catch (e) {
      fail(e)
    }
  }, [engine, fail])

  // 모델 준비: 진행률 이벤트가 매우 잦아서 200ms 단위로 모아 화면에 반영한다
  const progressBuf = useRef<Map<string, LoadProgress>>(new Map())
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flushProgress = useCallback(() => {
    progressTimer.current = null
    if (progressBuf.current.size === 0) return
    dispatch({ type: 'assets-progress', progress: [...progressBuf.current.values()] })
    progressBuf.current.clear()
  }, [])

  const checkOnline = useCallback(async () => {
    if (stateRef.current.online.status === 'checking') return
    dispatch({ type: 'online-status', status: 'checking' })
    try {
      const readiness = await engine.loadAssets(DEFAULT_ASSET_MANIFEST)
      dispatch({ type: 'readiness', readiness })
      // 번역 키가 없으면 엔진이 번역기를 빼므로 en 이 ready 가 아니다
      dispatch({ type: 'online-status', status: 'ok', translate: readiness.languages.en === 'ready' })
    } catch (e) {
      dispatch({ type: 'online-status', status: 'unavailable', error: describeError(e).message })
      await refreshReadiness()
    }
  }, [engine, refreshReadiness])

  const loadModels = useCallback(async () => {
    if (stateRef.current.assets.loading) return
    dispatch({ type: 'assets-start' })
    let error: string | null = null
    try {
      const readiness = await engine.loadAssets(DEFAULT_ASSET_MANIFEST, (p) => {
        progressBuf.current.set(p.modelId, p)
        progressTimer.current ??= setTimeout(flushProgress, 200)
      })
      dispatch({ type: 'readiness', readiness })
      if (readiness.canAnalyze) localStorage.setItem(ASSETS_INSTALLED_KEY, '1')
    } catch (e) {
      const { code, message } = describeError(e)
      error = `${message} (${code})`
      await refreshReadiness()
    } finally {
      if (progressTimer.current) clearTimeout(progressTimer.current)
      flushProgress()
      dispatch({ type: 'assets-done', error })
    }
  }, [engine, flushProgress, refreshReadiness])

  // 시작할 때: online 은 중계 서버 상태 확인(0.2초), offline 은 받아 둔 모델을 캐시에서 다시 불러온다
  useEffect(() => {
    if (setup.kind === 'online') void checkOnline()
    else if (setup.kind === 'offline' && localStorage.getItem(ASSETS_INSTALLED_KEY) === '1') void loadModels()
  }, [setup.kind, loadModels, checkOnline])

  // 엔진 이벤트 구독 + 초기 상태 복원
  useEffect(() => {
    const unsub = engine.subscribe((event) => dispatch({ type: 'engine-event', event }))
    restoreActiveTask(engine).then(
      async (task) => {
        dispatch({ type: 'task-loaded', task })
        if (!task) return
        // 새로고침 후 복원: 이 작업의 저장된 교신을 목록에 다시 채운다
        try {
          const log = await engine.getTaskLog(task.taskId)
          dispatch({
            type: 'hydrate',
            entries: log.utterances.map((u) => entryFromLog(u, log.sessions)),
            reviewStates: Object.fromEntries(log.utterances.map((u) => [u.utterance.utteranceId, u.reviewState])),
          })
        } catch (e) {
          fail(e)
        }
      },
      (e) => {
        fail(e)
        dispatch({ type: 'task-loaded', task: null })
      },
    )
    void refreshReadiness()
    return unsub
  }, [engine, fail, refreshReadiness])

  // 재확인 배지: 저장된 일지에서 미확인(장소 차이·재확인 필요) 건수를 센다. 이벤트가 몰리면 0.5초 모아서 한 번만
  const activeTaskId = state.taskState.active?.taskId
  useEffect(() => {
    if (!activeTaskId) {
      dispatch({ type: 'pending-reviews', count: 0 })
      return
    }
    const timer = setTimeout(() => {
      engine.getTaskLog(activeTaskId).then(
        (log) => {
          const count = log.utterances.filter((u) => {
            const kind = u.results[u.results.length - 1]?.comparison.kind
            return (kind === 'difference' || kind === 'ambiguous') && u.reviewState === 'unreviewed'
          }).length
          dispatch({ type: 'pending-reviews', count })
        },
        () => undefined,
      )
    }, 500)
    return () => clearTimeout(timer)
  }, [engine, activeTaskId, state.messageState, state.reviewState])

  // 선호 설정 저장 (작은 설정값만 localStorage)
  useEffect(() => {
    localStorage.setItem('marinear.prefs', JSON.stringify(state.preferences))
    document.documentElement.dataset.largeText = String(state.preferences.largeText)
    // 화면 언어 (교신 원문 요소는 lang="ko" 를 따로 단다)
    document.documentElement.lang = state.preferences.targetLang
  }, [state.preferences])

  // 선택 언어 번역: crossCheck !== 'pending' 인 최종 결과에 대해서만 요청한다 (결과는 그 revision 에 묶인다)
  useEffect(() => {
    const lang = state.preferences.targetLang
    for (const { utteranceId: id, revision } of translationTargets(state, lang)) {
      const base = { utteranceId: id, sourceRevision: revision, targetLang: lang, text: null, protectedTokens: [], modelVersion: null, createdAt: new Date().toISOString(), summary: null, reference: false }
      dispatch({ type: 'translation', translation: { ...base, status: 'pending', issues: [] } })
      engine.requestTranslation(id, revision, lang).then(
        (translation) => dispatch({ type: 'translation', translation }),
        (e) => {
          const { code, message } = describeError(e)
          dispatch({ type: 'translation', translation: { ...base, status: code === 'TRANSLATION_UNAVAILABLE' ? 'unavailable' : 'failed', issues: [message] } })
        },
      )
    }
  }, [engine, state])

  const stop = useCallback(async () => {
    const { sessionId, source } = stateRef.current.session
    if (captureRef.current) {
      await captureRef.current.stop()
      captureRef.current = null
    }
    // 파일·시연은 엔진 헬퍼가 세션을 직접 닫는다
    if (sessionId && source === 'live') {
      try {
        await engine.closeSession(sessionId)
      } catch (e) {
        fail(e)
      }
    }
    dispatch({ type: 'session', sessionId: null, source: null })
    dispatch({ type: 'input', status: 'idle' })
  }, [engine, fail])

  const startDemo = useCallback(async () => {
    if (!demo) return
    await stop()
    dispatch({ type: 'clear-messages' })
    dispatch({ type: 'session', sessionId: null, source: 'demo' })
    try {
      const task = await demo.ensureDemoTask()
      dispatch({ type: 'task-loaded', task })
      await demo.playScenario(task.taskId)
    } catch (e) {
      fail(e)
    } finally {
      dispatch({ type: 'session', sessionId: null, source: null })
    }
  }, [demo, stop, fail])

  const startFile = useCallback(
    async (file: File) => {
      const task = stateRef.current.taskState.active
      if (!task) return
      await stop()
      dispatch({ type: 'clear-messages' })
      dispatch({ type: 'session', sessionId: null, source: 'file' })
      try {
        // 파일 디코딩 → AudioFrame → 실시간과 같은 엔진 경로. 결과는 subscribe 이벤트로 도착한다.
        await analyzeFile(engine, task.taskId, file)
      } catch (e) {
        fail(e)
      } finally {
        dispatch({ type: 'session', sessionId: null, source: null })
      }
    },
    [engine, stop, fail],
  )

  const startLive = useCallback(async () => {
    const task = stateRef.current.taskState.active
    if (!task) return
    await stop()
    dispatch({ type: 'input', status: 'requesting' })
    let sessionId: string | null = null
    // 세션 기준으로 seq/startMs 를 다시 매긴다 (세션이 열리기 전 프레임은 버림)
    let seq = 0
    let samples = 0
    try {
      const handle = await startCapture(stateRef.current.preferences.inputDeviceId, {
        onFrame: (frame, level) => {
          dispatch({ type: 'input-level', level: level.rms })
          if (!sessionId) return
          const length = frame.pcm.length // transfer 전에 길이를 읽는다
          const startMs = Math.round((samples / frame.sampleRate) * 1000)
          samples += length
          // pcm 버퍼는 Worker 로 transfer 된다 — 이 호출 뒤 frame.pcm 을 다시 쓰지 않는다
          engine.appendAudio(sessionId, { ...frame, sessionId, seq: seq++, startMs }).catch(fail)
        },
        onDisconnected: () => {
          dispatch({ type: 'input', status: 'disconnected', issue: { kind: 'disconnected' } })
          dispatch({ type: 'error', code: 'INPUT_DISCONNECTED', message: messagesFor(stateRef.current.preferences.targetLang).capture.disconnectedToast })
          captureRef.current = null
          const sid = sessionId
          sessionId = null
          if (sid) {
            void markDisconnected(engine, sid)
              .then(() => engine.closeSession(sid))
              .catch(fail)
          }
          dispatch({ type: 'session', sessionId: null, source: null })
        },
      })
      captureRef.current = handle
      try {
        const settings = handle.info.appliedSettings
        // 브라우저 자동 처리 실제 적용값 기록 (echoCancellation 은 일부 브라우저에서 문자열일 수 있음)
        const flag = (v: unknown) => (typeof v === 'boolean' ? v : undefined)
        const session = await engine.openSession(task.taskId, 'live', {
          deviceLabel: handle.info.label,
          sampleRate: handle.info.sampleRate,
          appliedSettings: { noiseSuppression: flag(settings.noiseSuppression), autoGainControl: flag(settings.autoGainControl), echoCancellation: flag(settings.echoCancellation) },
        })
        sessionId = session.sessionId
      } catch (e) {
        await handle.stop()
        captureRef.current = null
        const { code, message } = describeError(e)
        dispatch({ type: 'input', status: 'error', issue: { kind: 'open-failed', extra: `${message} (${code})` } })
        return
      }
      dispatch({ type: 'session', sessionId, source: 'live' })
      dispatch({ type: 'input', status: 'capturing', device: { label: handle.info.label, sampleRate: handle.info.sampleRate } })
    } catch (err) {
      // 권한 거절·장치 없음 등은 종류만 저장하고 문구는 화면 언어로
      dispatch({ type: 'input', status: 'error', issue: err instanceof CaptureError ? { kind: err.kind } : { kind: 'unknown', extra: (err as Error).message } })
    }
  }, [engine, stop, fail])

  const api = useMemo<AppApi>(
    () => ({
      state,
      dispatch,
      engine,
      engineKind: setup.kind,
      proxyUrl: setup.proxyUrl,
      blockRemote: setup.blockRemote,
      demoAvailable: demo !== null,
      startDemo,
      startFile,
      startLive,
      stop,
      saveTask: (draft) => engine.saveTask(draft, stateRef.current.taskState.active?.version),
      review: (cmd) => engine.reviewUtterance(cmd),
      refreshReadiness,
      loadModels,
      checkOnline,
      setLang: (lang) => dispatch({ type: 'set-pref', prefs: { targetLang: lang } }),
    }),
    [state, engine, setup.kind, setup.proxyUrl, setup.blockRemote, demo, checkOnline, startDemo, startFile, startLive, stop, refreshReadiness, loadModels],
  )

  return (
    <Ctx.Provider value={api}>
      <LangContext.Provider value={state.preferences.targetLang}>{children}</LangContext.Provider>
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp(): AppApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp must be used inside AppProvider')
  return v
}
