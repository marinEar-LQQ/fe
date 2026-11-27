import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AnalysisResult, EngineEvent } from '../../contracts/types'
import { resetDbConnection } from '../../repositories/db'
import { displayTranscript } from '../report'
import { compareWithTask, mergeEntities } from './compare'
import { MockEngineClient } from './MockEngineClient'

const draft = { ownVessel: '해동호', targetVessel: 'A선박', terminalId: 'PNIT', berthId: 'T3', note: '' }

async function runDemo(engine: MockEngineClient, taskId: string) {
  const finals = new Map<string, AnalysisResult>()
  const events: EngineEvent[] = []
  engine.subscribe((e) => {
    events.push(e)
    if (e.type === 'analysis.final') {
      const prev = finals.get(e.payload.result.utteranceId)
      if (!prev || prev.revision < e.payload.result.revision) finals.set(e.payload.result.utteranceId, e.payload.result)
    }
  })
  await engine.openSession(taskId, 'demo')
  await new Promise((r) => setTimeout(r, 50))
  return { finals: [...finals.values()].sort((a, b) => a.timing.startMs - b.timing.startMs), events }
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  resetDbConnection()
})

describe('compare', () => {
  const snap = { taskId: 't', version: 1, ownVessel: '해동호', targetVessel: 'A선박', terminalId: 'PNIT', berthId: 'T3', note: '', createdAt: '', origin: 'manual' as const }

  it('raw/enhanced 터미널이 다르면 값은 null, 후보 둘 다 보존', () => {
    const m = mergeEntities({ vessel: 'A선박', terminalId: 'HPNT', berthId: 'T3' }, { vessel: 'A선박', terminalId: 'PNIT', berthId: 'T3' })
    expect(m.entities.terminalId).toBeNull()
    expect(m.uncertainties[0]).toMatchObject({ field: 'terminalId', alternatives: ['PNIT', 'HPNT'], reasonCode: 'ASR_DISAGREEMENT' })
    expect(compareWithTask(m.entities, m.uncertainties, snap).kind).toBe('ambiguous')
  })

  it('T3만 있으면 등록 터미널로 채우지 않고 ambiguous', () => {
    const c = compareWithTask({ vessel: 'A선박', terminalId: null, berthId: 'T3' }, [], snap)
    expect(c).toMatchObject({ kind: 'ambiguous', reasonCodes: ['TERMINAL_MISSING'] })
  })

  it('작업이 없으면 unknown/NO_TASK', () => {
    expect(compareWithTask({ vessel: 'A선박', terminalId: 'PNIT', berthId: 'T3' }, [], null)).toMatchObject({ kind: 'unknown', reasonCodes: ['NO_TASK'] })
  })
})

describe('MockEngineClient', () => {
  it('작업 저장 검증: 카탈로그에 없는 선석은 거절', async () => {
    const engine = new MockEngineClient({ speed: 0 })
    const r = await engine.saveTask({ ...draft, berthId: 'T9' })
    expect(r.ok).toBe(false)
  })

  it('시연 시나리오: 사례 A~D 분류와 교차 검사 revision', async () => {
    const engine = new MockEngineClient({ speed: 0 })
    const t = await engine.saveTask(draft)
    if (!t.ok) throw new Error('save failed')
    const { finals, events } = await runDemo(engine, t.value.taskId)
    expect(finals.map((f) => f.comparison?.kind)).toEqual(['match', 'difference', 'ambiguous', 'ambiguous', 'unrelated'])
    const caseB = finals[2]
    expect(caseB.revision).toBe(2)
    expect(caseB.crossCheck).toBe('complete')
    expect(displayTranscript(caseB)).toContain('[PNIT / HPNT]')
    // 같은 발화에 pending → complete 두 revision 이 발행됨
    const caseBEvents = events.filter((e) => e.type === 'analysis.final' && e.utteranceId === caseB.utteranceId)
    expect(caseBEvents.map((e) => e.revision)).toEqual([1, 2])
  })

  it('apply: 새 작업 버전 생성, 오래된 기준으로 반복 반영하면 VERSION_CONFLICT', async () => {
    const engine = new MockEngineClient({ speed: 0 })
    const t = await engine.saveTask(draft)
    if (!t.ok) throw new Error()
    const { finals } = await runDemo(engine, t.value.taskId)
    const caseA = finals[1]
    const cmd = { utteranceId: caseA.utteranceId, action: 'apply' as const, expectedTaskVersion: 1, expectedResultRevision: caseA.revision, confirmedByUser: true, patch: { terminalId: 'HPNT', berthId: 'T3' } }
    const first = await engine.reviewUtterance(cmd)
    expect(first.ok && first.value.taskVersionAfter).toBe(2)
    const again = await engine.reviewUtterance(cmd)
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.code).toBe('VERSION_CONFLICT')
    const active = await engine.getActiveTask()
    expect(active).toMatchObject({ version: 2, terminalId: 'HPNT', origin: 'review-apply' })
  })

  it('review/dismiss 는 작업 기준을 바꾸지 않는다', async () => {
    const engine = new MockEngineClient({ speed: 0 })
    const t = await engine.saveTask(draft)
    if (!t.ok) throw new Error()
    const { finals } = await runDemo(engine, t.value.taskId)
    const r = await engine.reviewUtterance({ utteranceId: finals[1].utteranceId, action: 'review', expectedTaskVersion: 1, expectedResultRevision: finals[1].revision, confirmedByUser: true })
    expect(r.ok).toBe(true)
    expect((await engine.getActiveTask())?.version).toBe(1)
  })

  it('이전 revision 으로 반영 요청하면 RESULT_STALE', async () => {
    const engine = new MockEngineClient({ speed: 0 })
    const t = await engine.saveTask(draft)
    if (!t.ok) throw new Error()
    const { finals } = await runDemo(engine, t.value.taskId)
    const caseB = finals[2]
    const r = await engine.reviewUtterance({ utteranceId: caseB.utteranceId, action: 'apply', expectedTaskVersion: 1, expectedResultRevision: 1, confirmedByUser: true, patch: { terminalId: 'PNIT', berthId: 'T3' } })
    expect(!r.ok && r.code).toBe('RESULT_STALE')
  })

  it('일지·내보내기: 건수는 저장 기록 기준, 불확실성 유지, 음성 미포함', async () => {
    const engine = new MockEngineClient({ speed: 0 })
    const t = await engine.saveTask(draft)
    if (!t.ok) throw new Error()
    await runDemo(engine, t.value.taskId)
    const log = await engine.getTaskLog(t.value.taskId)
    expect(log.ok && log.value.utterances).toHaveLength(5)
    const txt = await engine.exportTaskLog(t.value.taskId, 'txt')
    expect(txt.ok && txt.value.content).toContain('[PNIT / HPNT]')
    const json = await engine.exportTaskLog(t.value.taskId, 'json')
    expect(json.ok && JSON.parse(json.value.content).includesAudio).toBe(false)
  })

  it('번역: 보호 토큰 보존, 미설치 언어는 not-installed', async () => {
    const engine = new MockEngineClient({ speed: 0 })
    const t = await engine.saveTask(draft)
    if (!t.ok) throw new Error()
    const { finals, events } = await runDemo(engine, t.value.taskId)
    await engine.requestTranslation(finals[2].utteranceId, 2, 'id')
    await engine.requestTranslation(finals[2].utteranceId, 2, 'vi')
    await new Promise((r) => setTimeout(r, 20))
    const tr = events.filter((e) => e.type === 'translation.updated').map((e) => e.payload as { targetLang: string; status: string; text: string | null })
    expect(tr.find((x) => x.targetLang === 'id' && x.status === 'ready')?.text).toContain('[PNIT / HPNT]')
    expect(tr.find((x) => x.targetLang === 'vi')?.status).toBe('not-installed')
  })
})
