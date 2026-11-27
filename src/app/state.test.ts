import type { AnalysisResult, AnyEngineEvent, EngineEventType, EventPayloads, Readiness, Utterance } from 'marinear-engine'
import { describe, expect, it } from 'vitest'
import { applyEvent, buildFeed, engineStatus, initialState, reducer, translationKey, translationTargets, type AppState } from './state'

const utt: Utterance = {
  utteranceId: 'u1',
  sessionId: 's1',
  taskId: 't1',
  taskVersion: 1,
  startMs: 0,
  endMs: 1000,
  capturedAt: '2026-11-27T00:00:00Z',
  audioRefs: [],
  audioFlags: [],
}

const result = (revision: number, text: string, crossCheck: AnalysisResult['crossCheck'] = revision === 1 ? 'pending' : 'complete', origin: AnalysisResult['origin'] = 'model'): AnalysisResult => ({
  schemaVersion: 1,
  utteranceId: 'u1',
  sessionId: 's1',
  taskId: 't1',
  taskVersion: 1,
  revision,
  status: 'final',
  timing: { startMs: 0, endMs: 1000 },
  rawTranscript: null,
  enhancedTranscript: { text, segments: [], modelVersion: null, wordAligned: false },
  candidates: [],
  entities: { vessel: 'A선박', terminalId: null, berthId: null, time: null, distance: null, identifier: null, changeIntent: null, speed: null, course: null, instructions: [] },
  comparison: { kind: 'ambiguous', reasonCodes: ['TERMINAL_MISSING'], taskId: 't1', taskVersion: 1, diffs: [] },
  uncertainties: [],
  crossCheck,
  transcriptDiff: null,
  audioFlags: [],
  modelVersions: { asr: null, enhancer: null },
  catalogVersion: 'demo-catalog-v1',
  origin,
  createdAt: '2026-11-27T00:00:01Z',
})

let n = 0
function ev<T extends EngineEventType>(type: T, payload: EventPayloads[T], meta: Partial<AnyEngineEvent> = {}): AnyEngineEvent {
  return { schemaVersion: 1, eventId: `e${n++}`, seq: n, type, payload, ...meta } as AnyEngineEvent
}

const readiness = (over: Partial<Readiness> = {}): Readiness => ({
  engine: 'ready',
  queueDepth: 0,
  models: [],
  catalog: null,
  languages: { ko: 'source', my: 'ready', id: 'ready', en: 'ready', fil: 'not_installed', vi: 'not_installed' },
  storage: { usageBytes: null, quotaBytes: null, persisted: null },
  offlineReady: false,
  canAnalyze: true,
  fixtureMode: false,
  ...over,
})

const run = (events: AnyEngineEvent[], s: AppState = initialState()) => events.reduce(applyEvent, s)
const queued = () => ev('analysis.progress', { stage: 'queued', queueDepth: 1, utterance: utt }, { utteranceId: 'u1', sessionId: 's1' })

describe('applyEvent', () => {
  it('registers the utterance on analysis.progress(queued) and tracks stage', () => {
    const s = run([queued(), ev('analysis.progress', { stage: 'enhancing', queueDepth: 1 }, { utteranceId: 'u1' })])
    expect(s.messageState.order).toEqual(['u1'])
    expect(s.messageState.byId.u1.stage).toBe('enhancing')
    expect(s.messageState.byId.u1.result).toBeNull()
  })

  it('shows partial text only until a final result arrives', () => {
    let s = run([queued(), ev('transcript.partial', { variant: 'enhanced', text: '잠정' }, { utteranceId: 'u1' })])
    expect(s.messageState.byId.u1.partialText).toBe('잠정')
    s = run([ev('analysis.final', { result: result(1, '최종') }), ev('transcript.partial', { variant: 'enhanced', text: '늦은 잠정' }, { utteranceId: 'u1' })], s)
    expect(s.messageState.byId.u1.partialText).toBeNull()
    expect(s.messageState.byId.u1.result?.enhancedTranscript?.text).toBe('최종')
  })

  it('updates revision 1 (pending) → revision 2 (complete) and marks done', () => {
    let s = run([queued(), ev('analysis.final', { result: result(1, 'r1') }), ev('analysis.progress', { stage: 'asr_raw', queueDepth: 0 }, { utteranceId: 'u1' })])
    expect(s.messageState.byId.u1.result?.crossCheck).toBe('pending')
    expect(s.messageState.byId.u1.stage).toBe('asr_raw')
    s = run([ev('analysis.final', { result: result(2, 'r2') })], s)
    expect(s.messageState.byId.u1.result?.revision).toBe(2)
    expect(s.messageState.byId.u1.stage).toBe('done')
  })

  it('never overwrites a newer revision with a late older one', () => {
    const s = run([queued(), ev('analysis.final', { result: result(2, 'r2') }), ev('analysis.final', { result: result(1, 'r1 late') })])
    expect(s.messageState.byId.u1.result?.revision).toBe(2)
    expect(s.messageState.byId.u1.result?.enhancedTranscript?.text).toBe('r2')
  })

  it('ignores duplicate eventIds', () => {
    const e = queued()
    const s1 = run([e])
    expect(applyEvent(s1, e)).toBe(s1)
  })

  it('creates an entry from the result when queued was missed', () => {
    const s = run([ev('analysis.final', { result: result(2, 'only final') })])
    expect(s.messageState.byId.u1.utterance.sessionId).toBe('s1')
  })

  it('marks fixture entries by result origin or fixture-mode readiness', () => {
    expect(run([queued(), ev('analysis.final', { result: result(1, 'x', 'pending', 'fixture') })]).messageState.byId.u1.fixture).toBe(true)
    const mock = reducer(initialState(), { type: 'readiness', readiness: readiness({ fixtureMode: true }) })
    expect(run([queued()], mock).messageState.byId.u1.fixture).toBe(true)
    expect(run([queued()]).messageState.byId.u1.fixture).toBe(false)
  })

  it('keeps translations per utterance+revision+lang and does not regress ready → pending', () => {
    const t = { utteranceId: 'u1', sourceRevision: 2, targetLang: 'id' as const, protectedTokens: [], modelVersion: null, issues: [], createdAt: '', summary: null, reference: false }
    const s = run([ev('translation.updated', { translation: { ...t, status: 'ready', text: 'halo' } }), ev('translation.updated', { translation: { ...t, status: 'pending', text: null } })])
    expect(s.translations[translationKey('u1', 2, 'id')].status).toBe('ready')
    expect(s.translations[translationKey('u1', 1, 'id')]).toBeUndefined()
  })

  it('stores reviewState from review.updated and the new version from task.updated', () => {
    const version = { taskId: 't1', version: 2, ownVessel: '해동호', targetVessel: 'A선박', terminalId: 'HPNT', berthId: 'T3', note: '', createdAt: '', sourceReviewEventId: 'rev1' }
    const s = run([
      ev('review.updated', {
        event: { eventId: 'rev1', requestId: 'q', utteranceId: 'u1', taskId: 't1', resultRevision: 2, action: 'apply', at: '', confirmedByUser: true, taskVersionBefore: 1, taskVersionAfter: 2, patch: { terminalId: 'HPNT' }, note: null },
        reviewState: 'applied',
      }),
      ev('task.updated', { task: { taskId: 't1', activeVersion: 2, createdAt: '', updatedAt: '' }, version }),
    ])
    expect(s.reviewState.u1).toBe('applied')
    expect(s.taskState.active?.version).toBe(2)
  })

  it('pushes engine.error payloads as errors', () => {
    const s = run([ev('engine.error', { code: 'VERSION_CONFLICT', message: '충돌', recoverable: true })])
    expect(s.errors[0].code).toBe('VERSION_CONFLICT')
  })
})

describe('engineStatus', () => {
  it('is degraded when models are not ready and processing while an utterance is in progress', () => {
    const notReady = reducer(initialState(), { type: 'readiness', readiness: readiness({ canAnalyze: false, engine: 'degraded' }) })
    expect(engineStatus(initialState())).toBe('loading')
    expect(engineStatus(notReady)).toBe('degraded')
    const ready = reducer(initialState(), { type: 'readiness', readiness: readiness() })
    expect(engineStatus(run([queued()], ready))).toBe('processing')
    expect(engineStatus(run([queued(), ev('analysis.final', { result: result(2, 'done') })], ready))).toBe('ready')
  })
})

describe('translationTargets', () => {
  const ready = () => reducer(initialState(), { type: 'readiness', readiness: readiness() })

  it('requests only results whose cross-check is no longer pending (complete or unavailable)', () => {
    const pending = run([queued(), ev('analysis.final', { result: result(1, 'r1', 'pending') })], ready())
    expect(translationTargets(pending, 'id')).toEqual([])
    const unavailable = run([queued(), ev('analysis.final', { result: result(1, 'r1', 'unavailable') })], ready())
    expect(translationTargets(unavailable, 'id')).toEqual([{ utteranceId: 'u1', revision: 1 }])
    const complete = run([queued(), ev('analysis.final', { result: result(2, 'r2', 'complete') })], ready())
    expect(translationTargets(complete, 'id')).toEqual([{ utteranceId: 'u1', revision: 2 }])
  })

  it('skips Korean, uninstalled languages and already requested revisions', () => {
    const s = run([queued(), ev('analysis.final', { result: result(2, 'r2') })], ready())
    expect(translationTargets(s, 'ko')).toEqual([])
    expect(translationTargets(s, 'vi')).toEqual([]) // not_installed
    const requested = reducer(s, { type: 'translation', translation: { utteranceId: 'u1', sourceRevision: 2, targetLang: 'id', status: 'pending', text: null, protectedTokens: [], modelVersion: null, issues: [], createdAt: '', summary: null, reference: false } })
    expect(translationTargets(requested, 'id')).toEqual([])
  })
})

describe('live input status', () => {
  const live = () => reducer(initialState(), { type: 'session', sessionId: 's1', source: 'live' })
  const gap = { reason: 'AUDIO_GAP' as const, startMs: 1500, endMs: 1800, missingSeq: { from: 15, to: 17 }, at: '' }

  it('starts at receiving once the live session is open and follows input.status for that session only', () => {
    let s = live()
    expect(s.inputState.engine).toBe('receiving')
    s = run([ev('input.status', { status: 'gap', gap, queueDepth: 0 }, { sessionId: 's1' })], s)
    expect(s.inputState.engine).toBe('gap')
    s = run([ev('input.status', { status: 'closed', queueDepth: 0 }, { sessionId: 'other' })], s)
    expect(s.inputState.engine).toBe('gap')
    s = run([ev('input.status', { status: 'disconnected', queueDepth: 0 }, { sessionId: 's1' })], s)
    expect(s.inputState.status).toBe('disconnected')
    expect(reducer(s, { type: 'session', sessionId: null, source: null }).inputState.engine).toBeNull()
  })

  it('records each gap once and places it in the feed by session time (newest first), hidden in the review filter', () => {
    const e = ev('input.status', { status: 'gap', gap, queueDepth: 0 }, { sessionId: 's1' })
    let s = run([queued(), e, { ...e, eventId: 'dup-id' }], live())
    expect(s.gaps).toHaveLength(1)
    const later = { ...utt, utteranceId: 'u2', startMs: 3000 }
    s = run([ev('analysis.progress', { stage: 'queued', queueDepth: 1, utterance: later }, { utteranceId: 'u2' })], s)
    expect(buildFeed(s, 'all').map((i) => (i.kind === 'gap' ? 'gap' : i.entry.utterance.utteranceId))).toEqual(['u2', 'gap', 'u1'])
    expect(buildFeed(s, 'review').some((i) => i.kind === 'gap')).toBe(false)
    expect(reducer(s, { type: 'clear-messages' }).gaps).toEqual([])
  })
})
