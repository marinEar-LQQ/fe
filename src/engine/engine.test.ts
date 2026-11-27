import 'fake-indexeddb/auto'
import { MockEngineClient, analyzePcm, isEngineError, type AnyEngineEvent } from 'marinear-engine'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { restoreActiveTask } from './restore'
import { applyEvent, initialState, reducer, type AppState } from '../app/state'
import { demoControls, findDemoTask } from './demo'
import { AUDIO_FLAG_LABEL, REASON_LABEL } from '../contracts/labels'
import { buildTimeline, correctionInfo, displayTranscript } from './report'

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
  it('reuses an existing 해동호 / A선박 / PNIT T3 task instead of seeding a new one', async () => {
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
    expect(entries).toHaveLength(6)
    for (const e of entries) {
      expect(e.result?.revision).toBeGreaterThanOrEqual(2)
      expect(e.result?.crossCheck).toBe('complete')
      expect(e.stage).toBe('done')
      expect(e.fixture).toBe(true) // 시연 데이터 배지
      expect(e.result?.origin).toBe('fixture')
    }

    const kinds = entries.map((e) => e.result!.comparison.kind)
    expect(kinds).toContain('difference') // 사례 A
    expect(kinds).toContain('unrelated') // 사례 D
    expect(kinds).toContain('match')
    // 사례 B: 원음 교차 검사 후 ambiguous, 불확실 값은 [A / B]
    const caseB = entries.find((e) => e.result!.comparison.reasonCodes.includes('ASR_DISAGREEMENT'))!
    expect(caseB.result!.comparison.kind).toBe('ambiguous')
    expect(displayTranscript(caseB.result!)).toMatch(/\[(PNIT \/ HPNT|HPNT \/ PNIT)\]/)
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

  it('exposes diffs, correction info and labels for every reason code / audio flag the engine emits', async () => {
    const { engine, demo } = await setup()
    const task = await demo.ensureDemoTask()
    await demo.playScenario(task.taskId)
    const log = await engine.getTaskLog(task.taskId)
    const results = log.utterances.map((u) => u.results[u.results.length - 1])

    for (const r of results) {
      for (const code of r.comparison.reasonCodes) expect(REASON_LABEL[code], code).toBeTruthy()
      for (const f of r.audioFlags) expect(AUDIO_FLAG_LABEL[f], f).toBeTruthy()
    }
    // 레이블 표는 ReasonCode 16개 전부 (Record<ReasonCode, string> 으로 타입 강제 + 개수 확인)
    expect(Object.keys(REASON_LABEL)).toHaveLength(16)

    const caseA = results.find((r) => r.comparison.kind === 'difference')!
    expect(caseA.comparison.diffs).toContainEqual({ field: 'terminalId', taskValue: 'PNIT', heardValue: 'HPNT' })

    const correction = results.map(correctionInfo).find((c) => c && c.negated.length > 0)
    expect(correction?.negated).toContain('HPNT')
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

  it('stores notes through engine.saveNote and hides deleted ones in the timeline', async () => {
    const { engine, demo } = await setup()
    const task = await demo.ensureDemoTask()
    const note = await engine.saveNote(task.taskId, '관제에 재확인 요청')
    let log = await engine.getTaskLog(task.taskId)
    expect(buildTimeline(log).filter((i) => i.kind === 'note').map((i) => i.detail)).toEqual(['관제에 재확인 요청'])
    await engine.saveNote(task.taskId, '', note.noteId)
    log = await engine.getTaskLog(task.taskId)
    expect(buildTimeline(log).filter((i) => i.kind === 'note')).toHaveLength(0)
  })
})
