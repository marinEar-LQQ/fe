import { describe, expect, it } from 'vitest'
import type { AnalysisResult, EngineEvent, Utterance } from '../contracts/types'
import { applyEvent, initialState, translationKey } from './state'

const utt: Utterance = {
  utteranceId: 'u1',
  sessionId: 's1',
  taskId: 't1',
  taskVersion: 1,
  startMs: 0,
  endMs: 1000,
  capturedAt: '2026-11-27T00:00:00Z',
  audioRefs: [],
  isFixture: true,
}

const result = (revision: number, text: string): AnalysisResult => ({
  schemaVersion: 1,
  utteranceId: 'u1',
  sessionId: 's1',
  taskId: 't1',
  taskVersion: 1,
  revision,
  status: 'final',
  timing: { startMs: 0, endMs: 1000 },
  rawTranscript: null,
  enhancedTranscript: { text },
  entities: { vessel: 'A', terminalId: null, berthId: null },
  comparison: null,
  uncertainties: [],
  crossCheck: 'complete',
  modelVersions: {},
  catalogVersion: 'x',
  createdAt: '',
})

let n = 0
const final = (revision: number, text: string, eventId = `e${++n}`): EngineEvent => ({
  schemaVersion: 1,
  eventId,
  seq: n,
  type: 'analysis.final',
  utteranceId: 'u1',
  revision,
  payload: { utterance: utt, result: result(revision, text) },
})

describe('이벤트 수신 규칙', () => {
  it('같은 eventId 는 한 번만 처리한다', () => {
    const ev = final(1, 'a', 'dup')
    const s1 = applyEvent(initialState(), ev)
    const s2 = applyEvent(s1, ev)
    expect(s2).toBe(s1)
    expect(s2.messageState.order).toEqual(['u1'])
  })

  it('늦게 도착한 이전 revision 이 최신 결과를 덮어쓰지 않는다', () => {
    let s = applyEvent(initialState(), final(2, 'new'))
    s = applyEvent(s, final(1, 'old'))
    expect(s.messageState.byId.u1.result?.revision).toBe(2)
    expect(s.messageState.byId.u1.result?.enhancedTranscript?.text).toBe('new')
  })

  it('같은 revision 의 중복 수신은 교신 건수를 늘리지 않는다', () => {
    let s = applyEvent(initialState(), final(1, 'a'))
    s = applyEvent(s, final(1, 'a'))
    expect(s.messageState.order).toHaveLength(1)
  })

  it('final 이후 도착한 partial 은 무시한다', () => {
    let s = applyEvent(initialState(), final(1, 'final'))
    s = applyEvent(s, { schemaVersion: 1, eventId: 'p1', seq: 9, type: 'transcript.partial', utteranceId: 'u1', payload: { utterance: utt, text: 'partial' } })
    expect(s.messageState.byId.u1.result).not.toBeNull()
    expect(s.messageState.byId.u1.partialText).toBeNull()
  })

  it('번역은 언어·revision 별로 분리되어 이전 언어의 늦은 응답이 현재 언어를 덮지 않는다', () => {
    const tr = (lang: 'my' | 'id', text: string, id: string): EngineEvent => ({
      schemaVersion: 1,
      eventId: id,
      seq: 1,
      type: 'translation.updated',
      payload: { utteranceId: 'u1', sourceRevision: 1, targetLang: lang, status: 'ready', text, protectedTokens: [], modelVersion: null },
    })
    let s = applyEvent(initialState(), tr('id', 'indo', 't1'))
    s = applyEvent(s, tr('my', 'myan', 't2'))
    expect(s.translations[translationKey('u1', 1, 'id')].text).toBe('indo')
    expect(s.translations[translationKey('u1', 1, 'my')].text).toBe('myan')
  })

  it('완료된 번역을 늦게 온 loading 으로 되돌리지 않는다', () => {
    const base = { utteranceId: 'u1', sourceRevision: 1, targetLang: 'id' as const, protectedTokens: [], modelVersion: null }
    let s = applyEvent(initialState(), { schemaVersion: 1, eventId: 'a', seq: 1, type: 'translation.updated', payload: { ...base, status: 'ready', text: 'x' } })
    s = applyEvent(s, { schemaVersion: 1, eventId: 'b', seq: 2, type: 'translation.updated', payload: { ...base, status: 'loading', text: null } })
    expect(s.translations[translationKey('u1', 1, 'id')].status).toBe('ready')
  })
})
