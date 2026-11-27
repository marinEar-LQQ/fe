import 'fake-indexeddb/auto'
import { MockEngineClient, analyzePcm, isEngineError, type AnyEngineEvent } from 'marinear-engine'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { restoreActiveTask } from './restore'
import { applyEvent, buildFeed, initialState, reducer, type AppState } from '../app/state'
import { demoControls, findDemoTask } from './demo'
import { AUDIO_FLAG_LABEL, REASON_LABEL } from '../contracts/labels'
import { buildTimeline, displayTranscript } from './report'

/**
 * marinear-engine 의 MockEngineClient(실제 EngineCore·규칙·IndexedDB + 시연 ASR)로
 * 화면 reducer 까지 이어서 검증한다.
 */
let n = 0
async function setup() {
  const engine = await MockEngineClient.create({ dbName: `fe-test-${Date.now()}-${n++}`, asrDelayMs: 0 })
  const events: AnyEngineEvent[] = []
  engine.subscribe((e) => events.push(e))
  return { engine, events, demo: demoControls(engine) }
}

async function expectEngineError(p: Promise<unknown>, code: string) {
  try {
    await p
  } catch (e) {
    expect(isEngineError(e)).toBe(true)
    expect((e as { code: string }).code).toBe(code)
    return
  }
  throw new Error(`expected EngineError ${code}`)
}

describe('demo task reuse', () => {
  it('reuses an existing demo task (DEMO_TASK) instead of seeding a new one', async () => {
    const { engine, demo } = await setup()
    expect(await findDemoTask(engine)).toBeNull()
    const first = await demo.ensureDemoTask()
    const second = await demo.ensureDemoTask()
    expect(second.taskId).toBe(first.taskId)
    expect(await engine.listTasks()).toHaveLength(1)
    expect((await restoreActiveTask(engine))?.taskId).toBe(first.taskId)
  })
})

describe('MockEngineClient scenario → UI state', () => {
  it('delivers revision 1 (pending) then revision 2 (complete) per utterance and the reducer keeps the latest', async () => {
    const { engine, events, demo } = await setup()
    const task = await demo.ensureDemoTask()
    let state: AppState = reducer(initialState(), { type: 'readiness', readiness: await engine.checkReadiness() })
    const session = await demo.playScenario(task.taskId)
    expect(session.inputInfo.fixtureMode).toBe(true)
    state = events.reduce(applyEvent, state)

    const finals = events.filter((e) => e.type === 'analysis.final')
    const firstRev = finals.find((e) => e.type === 'analysis.final' && e.payload.result.revision === 1)
    expect(firstRev && firstRev.type === 'analysis.final' && firstRev.payload.result.crossCheck).toBe('pending')

    const entries = state.messageState.order.map((id) => state.messageState.byId[id])
    expect(entries).toHaveLength(9) // 팀 대본 3개, 9개 대사
    for (const e of entries) {
      expect(e.result?.revision).toBeGreaterThanOrEqual(2)
      expect(e.result?.crossCheck).toBe('complete')
      expect(e.stage).toBe('done')
      expect(e.fixture).toBe(true) // 시연 데이터 배지
      expect(e.result?.origin).toBe('fixture')
    }

    const kinds = entries.map((e) => e.result!.comparison.kind)
    expect(kinds).toContain('difference') // 기록은 PNIT, 교신은 HPNT
    expect(kinds).toContain('ambiguous')
    expect(kinds).toContain('unrelated') // 다른 선박 교신
    // 사례 B: 원음 교차 검사 후 ambiguous, 불확실 값은 [A / B]
    // 장소 후보 여럿: 불확실 값은 [A / B]
    const multi = entries.find((e) => e.result!.comparison.reasonCodes.includes('MULTIPLE_CANDIDATES') && e.result!.comparison.kind === 'ambiguous')!
    expect(displayTranscript(multi.result!)).toMatch(/\[(PNIT \/ HPNT|HPNT \/ PNIT)\]/)
    // 오인식 후보 사전(TNIC→PNIT): 원음/완화음 단어 차이가 transcriptDiff 로 온다
    const confusable = entries.find((e) => e.result!.comparison.reasonCodes.includes('ASR_CONFUSABLE'))!
    expect(confusable.result!.transcriptDiff).toContainEqual({ op: 'changed', raw: 'TNIC', enhanced: 'PNIT' })
  })

  it('separates review / dismiss / apply and refuses stale or conflicting commands without retry', async () => {
    const { engine, demo } = await setup()
    const task = await demo.ensureDemoTask()
    await demo.playScenario(task.taskId)
    const log = await engine.getTaskLog(task.taskId)
    const latest = (i: number) => log.utterances[i].results[log.utterances[i].results.length - 1]
    const diffIdx = log.utterances.findIndex((_, i) => latest(i).comparison.kind === 'difference')
    const caseA = latest(diffIdx)

    // 확인/관련 없음은 기준을 바꾸지 않는다
    const reviewed = await engine.reviewUtterance({ requestId: 'r-1', utteranceId: caseA.utteranceId, action: 'review', expectedResultRevision: caseA.revision, expectedTaskVersion: 1, confirmedByUser: true })
    expect(reviewed.taskVersionAfter).toBe(1)

    // 이전 revision 으로 반영 시도 → RESULT_STALE
    await expectEngineError(
      engine.reviewUtterance({ requestId: 'r-2', utteranceId: caseA.utteranceId, action: 'apply', expectedResultRevision: caseA.revision - 1, expectedTaskVersion: 1, confirmedByUser: true, patch: { terminalId: 'HPNT', berthId: 'T3' } }),
      'RESULT_STALE',
    )

    // 반영 → v2
    const applied = await engine.reviewUtterance({ requestId: 'r-3', utteranceId: caseA.utteranceId, action: 'apply', expectedResultRevision: caseA.revision, expectedTaskVersion: 1, confirmedByUser: true, patch: { terminalId: 'HPNT', berthId: 'T3' } })
    expect(applied.taskVersionAfter).toBe(2)
    // 같은 requestId 재전송은 같은 결과 (멱등)
    const again = await engine.reviewUtterance({ requestId: 'r-3', utteranceId: caseA.utteranceId, action: 'apply', expectedResultRevision: caseA.revision, expectedTaskVersion: 1, confirmedByUser: true, patch: { terminalId: 'HPNT', berthId: 'T3' } })
    expect(again.eventId).toBe(applied.eventId)

    // 옛 기준 버전으로 저장 → VERSION_CONFLICT
    await expectEngineError(engine.saveTask({ taskId: task.taskId, ownVessel: '해동호', targetVessel: 'A선박', terminalId: 'PNIT', berthId: 'T1', note: '' }, 1), 'VERSION_CONFLICT')

    const after = await engine.getTaskLog(task.taskId)
    expect(after.task.activeVersion).toBe(2)
    expect(after.versions[1].sourceReviewEventId).toBe(applied.eventId)
    expect(after.counts.applied).toBe(1)
  })

  it('exposes diffs and labels for every reason code / audio flag the engine emits', async () => {
    const { engine, demo } = await setup()
    const task = await demo.ensureDemoTask()
    await demo.playScenario(task.taskId)
    const log = await engine.getTaskLog(task.taskId)
    const results = log.utterances.map((u) => u.results[u.results.length - 1])

    for (const r of results) {
      for (const code of r.comparison.reasonCodes) expect(REASON_LABEL[code], code).toBeTruthy()
      for (const f of r.audioFlags) expect(AUDIO_FLAG_LABEL[f], f).toBeTruthy()
    }
    // 레이블 표는 ReasonCode 17개 전부 (Record<ReasonCode, string> 으로 타입 강제 + 개수 확인)
    expect(Object.keys(REASON_LABEL)).toHaveLength(17)

    const caseA = results.find((r) => r.comparison.kind === 'difference')!
    expect(caseA.comparison.diffs).toContainEqual({ field: 'terminalId', taskValue: 'PNIT', heardValue: 'HPNT' })

  })

  it('analyzes a fixture WAV through the file path (analyzePcm) with progress stages and r1 → r2', async () => {
    const { engine, events, demo } = await setup()
    const task = await demo.ensureDemoTask()
    // analyzeFile = decodeAudioFile(AudioContext, 브라우저 전용) + analyzePcm. Node 에선 PCM16 WAV 를 직접 읽는다.
    const buf = readFileSync(fileURLToPath(new URL('../../node_modules/marinear-engine/fixtures/audio/radio-case-b.wav', import.meta.url)))
    const sampleRate = buf.readUInt32LE(24)
    const pcm16 = new Int16Array(buf.buffer.slice(buf.byteOffset + 44, buf.byteOffset + buf.length))
    const pcm = Float32Array.from(pcm16, (v) => v / 32768)
    const session = await analyzePcm(engine, task.taskId, pcm, sampleRate, { fileName: 'radio-case-b.wav' })
    await engine.whenIdle()
    expect(session.source).toBe('file')
    expect(session.inputInfo.fileName).toBe('radio-case-b.wav')

    const stages = events.flatMap((e) => (e.type === 'analysis.progress' ? [e.payload.stage] : []))
    expect(stages).toEqual(expect.arrayContaining(['queued', 'enhancing', 'asr_enhanced', 'asr_raw']))
    const state = events.reduce(applyEvent, initialState())
    const entries = state.messageState.order.map((id) => state.messageState.byId[id])
    expect(entries.length).toBeGreaterThan(0)
    for (const e of entries) {
      expect(e.result?.crossCheck).toBe('complete')
      expect(e.stage).toBe('done')
    }
  })

  it('reports seq gaps of a live session as input.status gap entries in the feed', async () => {
    const { engine, events, demo } = await setup()
    const task = await demo.ensureDemoTask()
    const session = await engine.openSession(task.taskId, 'live', { deviceLabel: 'test' })
    let state = reducer(initialState(), { type: 'session', sessionId: session.sessionId, source: 'live' })
    const sr = 16000
    const frame = (seq: number) => ({ sessionId: session.sessionId, seq, startMs: seq * 100, sampleRate: sr, channels: 1 as const, pcm: new Float32Array(sr / 10) })
    for (const seq of [0, 1, 2, 6, 7]) await engine.appendAudio(session.sessionId, frame(seq)) // 3~5 누락
    await engine.closeSession(session.sessionId)
    await engine.whenIdle()
    state = events.reduce(applyEvent, state)
    expect(state.gaps.length).toBeGreaterThan(0)
    expect(state.gaps[0].gap.reason).toBe('AUDIO_GAP')
    expect(buildFeed(state, 'all').some((i) => i.kind === 'gap')).toBe(true)
  })

  it('exports a task log as JSON and imports it into another device (fresh DB) for demo prep', async () => {
    const a = await setup()
    const task = await a.demo.ensureDemoTask()
    await a.demo.playScenario(task.taskId)
    const file = await a.engine.exportTaskLog(task.taskId, 'json')
    const before = await a.engine.getTaskLog(task.taskId)

    const b = await setup() // 다른 기기·브라우저
    const imported = await b.engine.importTaskLog(file.content)
    expect(imported.taskId).toBe(task.taskId)
    const after = await b.engine.getTaskLog(imported.taskId)
    expect(after.counts.utterances).toBe(before.counts.utterances)
    expect(after.utterances.every((u) => u.results.at(-1)?.origin === 'fixture')).toBe(true) // origin 유지
    expect((await restoreActiveTask(b.engine))?.taskId).toBe(task.taskId)
    expect(b.events.some((e) => e.type === 'task.updated')).toBe(true)

    await expectEngineError(b.engine.importTaskLog('{not json'), 'VALIDATION_FAILED')
    await expectEngineError(b.engine.importTaskLog(JSON.stringify({ hello: 1 })), 'VALIDATION_FAILED')
  })

  it('stores notes through engine.saveNote and hides deleted ones in the timeline', async () => {
    const { engine, demo } = await setup()
    const task = await demo.ensureDemoTask()
    const note = await engine.saveNote(task.taskId, '관제에 재확인 요청')
    let log = await engine.getTaskLog(task.taskId)
    expect(buildTimeline(log).flatMap((i) => (i.kind === 'note' ? [i.note.text] : []))).toEqual(['관제에 재확인 요청'])
    await engine.saveNote(task.taskId, '', note.noteId)
    log = await engine.getTaskLog(task.taskId)
    expect(buildTimeline(log).filter((i) => i.kind === 'note')).toHaveLength(0)
  })
})
