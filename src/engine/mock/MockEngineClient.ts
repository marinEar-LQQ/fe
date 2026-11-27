import { DEMO_CATALOG, validatePlace, type Catalog } from '../../contracts/catalog'
import {
  SCHEMA_VERSION,
  type AnalysisResult,
  type AssetManifest,
  type AudioClip,
  type AudioFrame,
  type EngineEvent,
  type ExportFile,
  type LangCode,
  type Readiness,
  type Result,
  type ReviewCommand,
  type ReviewEvent,
  type ReviewStatus,
  type Session,
  type SessionSource,
  type TaskDraft,
  type TaskLog,
  type TaskVersion,
  type Translation,
  type Utterance,
} from '../../contracts/types'
import { getDb, listNotes } from '../../repositories/db'
import type { EngineClient } from '../EngineClient'
import { compareWithTask, mergeEntities } from './compare'
import { DEMO_SCENARIO, INSTALLED_FIXTURE_LANGS, type FixtureUtterance } from './fixtures'
import { buildTxtReport } from '../report'

type Listener = (e: EngineEvent) => void
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never
type EventInput = DistributiveOmit<EngineEvent, 'schemaVersion' | 'eventId' | 'seq'>

const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`
const nowIso = () => new Date().toISOString()

export interface MockOptions {
  /** 시연 진행 속도 배율 (테스트에서는 0 으로 즉시 진행) */
  speed?: number
  catalog?: Catalog
}

/**
 * 화면 검증용 Mock adapter.
 * - 실제 음성 분석을 하지 않는다. 시연·파일 세션은 고정 fixture 결과를 내보내고 isFixture=true 로 표시한다.
 * - 실시간(live) 세션은 입력 프레임 수신·누락만 확인하고 자막을 만들지 않는다.
 * - 저장·버전·검토 규칙은 계약대로 구현해 실제 엔진으로 교체해도 화면이 그대로 동작하도록 한다.
 */
export class MockEngineClient implements EngineClient {
  private listeners = new Set<Listener>()
  private seqBySession = new Map<string, number>()
  private globalSeq = 0
  private sessions = new Map<string, Session & { lastFrameSeq: number; frames: number; file?: File }>()
  private timers = new Set<ReturnType<typeof setTimeout>>()
  private speed: number
  private catalog: Catalog

  constructor(opts: MockOptions = {}) {
    this.speed = opts.speed ?? 1
    this.catalog = opts.catalog ?? DEMO_CATALOG
  }

  /* ───────── 이벤트 ───────── */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(e: EventInput) {
    let seq: number
    if (e.sessionId) {
      seq = (this.seqBySession.get(e.sessionId) ?? 0) + 1
      this.seqBySession.set(e.sessionId, seq)
    } else {
      seq = ++this.globalSeq
    }
    const event = { ...e, schemaVersion: SCHEMA_VERSION, eventId: uid('evt'), seq } as EngineEvent
    this.listeners.forEach((l) => l(event))
  }

  private later(ms: number, fn: () => void | Promise<void>) {
    const t = setTimeout(() => {
      this.timers.delete(t)
      void fn()
    }, ms * this.speed)
    this.timers.add(t)
  }

  dispose() {
    this.timers.forEach(clearTimeout)
    this.timers.clear()
    this.listeners.clear()
  }

  /* ───────── 자원 ───────── */
  async loadAssets(_manifest: AssetManifest): Promise<Result<Readiness>> {
    void _manifest
    return { ok: true, value: await this.checkReadiness() }
  }

  async checkReadiness(): Promise<Readiness> {
    return {
      engineKind: 'mock',
      offlineReady: false,
      items: [
        { id: 'app-shell', label: '앱 화면 (App shell)', status: 'ready' },
        { id: 'worker', label: '분석 Worker', status: 'missing' },
        { id: 'wasm', label: 'WASM 실행 파일', status: 'missing' },
        { id: 'asr', label: '한국어 음성인식 모델', status: 'missing' },
        { id: 'denoise', label: '잡음 완화 모델', status: 'missing' },
        { id: 'catalog', label: `장소 카탈로그 (${this.catalog.catalogVersion} · 시연용)`, status: 'ready', version: this.catalog.catalogVersion },
        { id: 'mt-my', label: '번역 자원 · 미얀마어', status: 'missing' },
        { id: 'mt-id', label: '번역 자원 · 인도네시아어', status: 'missing' },
      ],
    }
  }

  /* ───────── 작업 ───────── */
  async getActiveTask(): Promise<TaskVersion | null> {
    const db = await getDb()
    const meta = (await db.get('meta', 'activeTask'))?.value as { taskId: string; activeVersion: number } | undefined
    if (!meta) return null
    return (await db.get('taskVersions', [meta.taskId, meta.activeVersion])) ?? null
  }

  async saveTask(draft: TaskDraft, expectedVersion?: number): Promise<Result<TaskVersion>> {
    if (!draft.ownVessel.trim()) return { ok: false, code: 'VALIDATION_FAILED', message: '내 배 이름을 입력하세요.' }
    if (!draft.targetVessel.trim()) return { ok: false, code: 'VALIDATION_FAILED', message: '대상 선박을 입력하세요.' }
    const place = validatePlace(this.catalog, draft.terminalId, draft.berthId)
    if (!place.ok) return { ok: false, code: 'VALIDATION_FAILED', message: place.message }
    return this.createTaskVersion(draft, expectedVersion, 'manual')
  }

  private async createTaskVersion(
    draft: TaskDraft,
    expectedVersion: number | undefined,
    origin: TaskVersion['origin'],
    sourceUtteranceId?: string,
    reviewEvent?: (versionBefore: number | null, versionAfter: number) => ReviewEvent,
  ): Promise<Result<TaskVersion>> {
    const db = await getDb()
    const tx = db.transaction(['meta', 'taskVersions', 'reviewEvents'], 'readwrite')
    try {
      const meta = (await tx.objectStore('meta').get('activeTask'))?.value as { taskId: string; activeVersion: number } | undefined
      const isSameTask = meta && (!draft.taskId || draft.taskId === meta.taskId)
      const current = isSameTask ? meta.activeVersion : null
      if (expectedVersion !== undefined && expectedVersion !== current) {
        tx.abort()
        return { ok: false, code: 'VERSION_CONFLICT', message: `작업 기준이 이미 v${current ?? '-'}로 바뀌었습니다.` }
      }
      const taskId = isSameTask ? meta.taskId : (draft.taskId ?? uid('task'))
      const version = (current ?? 0) + 1
      const tv: TaskVersion = {
        taskId,
        version,
        ownVessel: draft.ownVessel.trim(),
        targetVessel: draft.targetVessel.trim(),
        terminalId: draft.terminalId,
        berthId: draft.berthId,
        note: draft.note,
        createdAt: nowIso(),
        origin,
        sourceUtteranceId,
      }
      await tx.objectStore('taskVersions').put(tv)
      await tx.objectStore('meta').put({ key: 'activeTask', value: { taskId, activeVersion: version } })
      let ev: ReviewEvent | undefined
      if (reviewEvent) {
        ev = reviewEvent(current, version)
        await tx.objectStore('reviewEvents').put(ev)
      }
      await tx.done
      // 저장 성공 후에만 이벤트 발행
      this.emit({ type: 'task.updated', payload: { taskId, activeVersion: version, version: tv } })
      if (ev) this.emit({ type: 'review.updated', utteranceId: ev.utteranceId, revision: ev.resultRevision, payload: ev })
      return { ok: true, value: tv }
    } catch (err) {
      return { ok: false, code: 'STORAGE_FULL', message: `저장 실패: ${(err as Error).message}` }
    }
  }

  /* ───────── 세션 ───────── */
  async openSession(taskId: string | null, source: SessionSource, file?: File): Promise<Result<{ sessionId: string }>> {
    const sessionId = uid('ses')
    this.sessions.set(sessionId, {
      sessionId,
      taskId,
      source,
      startedAt: nowIso(),
      endedAt: null,
      inputInfo: file ? { fileName: file.name, size: file.size, type: file.type } : null,
      gapEvents: [],
      lastFrameSeq: -1,
      frames: 0,
      file,
    })

    if (source === 'live') {
      this.emit({
        type: 'engine.error',
        sessionId,
        payload: {
          code: 'MODEL_NOT_READY',
          message: '실시간 분석 엔진이 아직 연결되지 않았습니다. 지금은 입력 신호만 확인하며 자막을 만들지 않습니다.',
          recoverable: true,
        },
      })
      this.emit({ type: 'analysis.progress', sessionId, payload: { engine: 'degraded', queueDepth: 0, stage: 'ENGINE_NOT_CONNECTED' } })
    } else {
      void this.runScenario(sessionId, taskId)
    }
    return { ok: true, value: { sessionId } }
  }

  appendAudio(sessionId: string, frame: AudioFrame): void {
    const s = this.sessions.get(sessionId)
    if (!s) return
    if (s.lastFrameSeq >= 0 && frame.seq !== s.lastFrameSeq + 1) {
      const missing = frame.seq - s.lastFrameSeq - 1
      s.gapEvents.push({ atMs: frame.startMs, missingFrames: missing })
      this.emit({ type: 'engine.error', sessionId, payload: { code: 'AUDIO_GAP', message: `입력 프레임 ${missing}개 누락`, recoverable: true } })
    }
    s.lastFrameSeq = frame.seq
    s.frames++
  }

  async closeSession(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId)
    if (!s) return
    if (s.endedAt) return
    s.endedAt = nowIso()
    this.emit({ type: 'analysis.progress', sessionId, payload: { engine: 'ready', queueDepth: 0, stage: 'SESSION_CLOSED' } })
  }

  private async snapshotFor(taskId: string | null): Promise<TaskVersion | null> {
    if (!taskId) return null
    const active = await this.getActiveTask()
    return active && active.taskId === taskId ? active : null
  }

  private async runScenario(sessionId: string, taskId: string | null) {
    const session = this.sessions.get(sessionId)!
    let offset = 400
    let startMs = 1000
    DEMO_SCENARIO.forEach((fx, i) => {
      const uttStart = startMs
      this.later(offset, () => this.processFixture(sessionId, taskId, fx, i, uttStart, session.file))
      offset += fx.durationMs * 0.5 + 1800
      startMs += fx.durationMs + 2500
    })
    this.later(offset + 1500, () => this.closeSession(sessionId))
  }

  private async processFixture(sessionId: string, taskId: string | null, fx: FixtureUtterance, index: number, startMs: number, file?: File) {
    if (this.sessions.get(sessionId)?.endedAt) return
    const snapshot = await this.snapshotFor(taskId) // 발화 시작 시점의 기준 고정
    const db = await getDb()
    const utteranceId = `${sessionId}-u${index + 1}`
    const utterance: Utterance = {
      utteranceId,
      sessionId,
      taskId: snapshot?.taskId ?? null,
      taskVersion: snapshot?.version ?? null,
      startMs,
      endMs: startMs + fx.durationMs,
      capturedAt: nowIso(),
      audioRefs: [
        { variant: 'raw', available: Boolean(file) },
        { variant: 'enhanced', available: false },
      ],
      isFixture: true,
    }
    if (file) await db.put('audioBlobs', { utteranceId, variant: 'raw', blob: file, mime: file.type, deleted: false })

    this.emit({ type: 'analysis.progress', sessionId, payload: { engine: 'processing', queueDepth: 1, stage: 'asr' } })
    this.emit({ type: 'transcript.partial', sessionId, utteranceId, payload: { utterance, text: fx.partialText } })

    const build = (revision: number, withRaw: boolean): AnalysisResult => {
      const { entities, uncertainties } = mergeEntities(fx.enhanced.entities, withRaw ? fx.raw.entities : null)
      const comparison = compareWithTask(entities, uncertainties, snapshot)
      return {
        schemaVersion: SCHEMA_VERSION,
        utteranceId,
        sessionId,
        taskId: utterance.taskId,
        taskVersion: utterance.taskVersion,
        revision,
        status: 'final',
        timing: { startMs: utterance.startMs, endMs: utterance.endMs },
        rawTranscript: withRaw ? { text: fx.raw.text, confidence: null } : null,
        enhancedTranscript: { text: fx.enhanced.text, confidence: null },
        entities,
        comparison: withRaw ? comparison : { ...comparison, reasonCodes: [...comparison.reasonCodes, 'CROSS_CHECK_PENDING'] },
        uncertainties,
        crossCheck: withRaw ? 'complete' : 'pending',
        modelVersions: { asr: 'mock-fixture', denoise: 'mock-fixture' },
        catalogVersion: this.catalog.catalogVersion,
        createdAt: nowIso(),
      }
    }

    const publish = async (result: AnalysisResult) => {
      try {
        const tx = db.transaction(['utterances', 'results'], 'readwrite')
        await tx.objectStore('utterances').put(utterance)
        await tx.objectStore('results').put(result)
        await tx.done
      } catch (err) {
        this.emit({ type: 'engine.error', sessionId, utteranceId, payload: { code: 'STORAGE_FULL', message: (err as Error).message, recoverable: false } })
        return
      }
      this.emit({ type: 'analysis.final', sessionId, utteranceId, revision: result.revision, payload: { utterance, result } })
    }

    if (fx.delayedCrossCheck) {
      // enhanced 먼저 → raw 교차 검사 완료 시 새 revision
      this.later(1200, () => publish(build(1, false)))
      this.later(3200, async () => {
        await publish(build(2, true))
        this.emit({ type: 'analysis.progress', sessionId, payload: { engine: 'ready', queueDepth: 0 } })
      })
    } else {
      this.later(1200, async () => {
        await publish(build(1, true))
        this.emit({ type: 'analysis.progress', sessionId, payload: { engine: 'ready', queueDepth: 0 } })
      })
    }
  }

  /* ───────── 번역 ───────── */
  async requestTranslation(utteranceId: string, revision: number, lang: LangCode): Promise<void> {
    if (lang === 'ko') return
    const base: Omit<Translation, 'status' | 'text'> = { utteranceId, sourceRevision: revision, targetLang: lang, protectedTokens: [], modelVersion: null }
    const emit = (t: Translation) => this.emit({ type: 'translation.updated', utteranceId, revision, payload: t })

    if (!INSTALLED_FIXTURE_LANGS.includes(lang)) {
      emit({ ...base, status: 'not-installed', text: null })
      return
    }
    emit({ ...base, status: 'loading', text: null })
    const index = Number(utteranceId.split('-u').pop()) - 1
    const fx = DEMO_SCENARIO[index]
    // 언어별 지연을 다르게 해 "늦게 도착한 이전 언어 응답" 상황을 재현
    const delay = { my: 1400, id: 700, en: 500 }[lang as 'my' | 'id' | 'en'] ?? 800
    this.later(delay, () => {
      const text = fx?.translations[lang]
      if (!fx || !text) return emit({ ...base, status: 'failed', text: null })
      const tokensOk = fx.protectedTokens.every((tok) => text.includes(tok))
      emit({ ...base, status: tokensOk ? 'ready' : 'needs-check', text, protectedTokens: fx.protectedTokens, modelVersion: 'mock-fixture' })
    })
  }

  /* ───────── 음성 ───────── */
  async getAudioClip(utteranceId: string, variant: 'raw' | 'enhanced'): Promise<AudioClip> {
    const db = await getDb()
    const row = await db.get('audioBlobs', [utteranceId, variant])
    if (row?.deleted) return { available: false, reason: 'DELETED', wholeUtterance: true }
    if (row?.blob) return { available: true, blob: row.blob, wholeUtterance: true }
    const utt = await db.get('utterances', utteranceId)
    if (!utt) return { available: false, reason: 'NOT_FOUND', wholeUtterance: true }
    return { available: false, reason: variant === 'enhanced' || utt.isFixture ? (utt.audioRefs[0].available ? 'ENGINE_NOT_CONNECTED' : 'DEMO_NO_AUDIO') : 'NOT_FOUND', wholeUtterance: true }
  }

  /* ───────── 검토 ───────── */
  async reviewUtterance(cmd: ReviewCommand): Promise<Result<ReviewEvent>> {
    const db = await getDb()
    const results = await db.getAllFromIndex('results', 'byUtterance', cmd.utteranceId)
    const latest = results.sort((a, b) => b.revision - a.revision)[0]
    if (!latest) return { ok: false, code: 'NOT_FOUND', message: '발화를 찾을 수 없습니다.' }
    if (latest.revision !== cmd.expectedResultRevision)
      return { ok: false, code: 'RESULT_STALE', message: `분석 결과가 r${latest.revision}로 갱신되었습니다. 다시 확인하세요.` }

    const active = await this.getActiveTask()
    const makeEvent = (before: number | null, after: number | null): ReviewEvent => ({
      eventId: uid('rev'),
      utteranceId: cmd.utteranceId,
      resultRevision: latest.revision,
      action: cmd.action,
      at: nowIso(),
      confirmedByUser: cmd.confirmedByUser,
      taskVersionBefore: before,
      taskVersionAfter: after,
    })

    if (cmd.action !== 'apply') {
      // review / dismiss 는 작업 기준을 바꾸지 않는다
      const ev = makeEvent(active?.version ?? null, active?.version ?? null)
      try {
        await db.put('reviewEvents', ev)
      } catch (err) {
        return { ok: false, code: 'STORAGE_FULL', message: (err as Error).message }
      }
      this.emit({ type: 'review.updated', utteranceId: ev.utteranceId, revision: ev.resultRevision, payload: ev })
      return { ok: true, value: ev }
    }

    // apply 검증
    if (!cmd.confirmedByUser) return { ok: false, code: 'VALIDATION_FAILED', message: '사용자 확인이 필요합니다.' }
    if (latest.crossCheck === 'pending') return { ok: false, code: 'VALIDATION_FAILED', message: '교차 검사가 끝나지 않아 반영할 수 없습니다.' }
    if (!cmd.patch) return { ok: false, code: 'VALIDATION_FAILED', message: '반영할 장소를 선택하세요.' }
    if (!active) return { ok: false, code: 'VALIDATION_FAILED', message: '등록된 작업이 없습니다.' }
    if (cmd.expectedTaskVersion !== active.version)
      return { ok: false, code: 'VERSION_CONFLICT', message: `작업 기준이 이미 v${active.version}로 바뀌었습니다.` }
    const place = validatePlace(this.catalog, cmd.patch.terminalId, cmd.patch.berthId)
    if (!place.ok) return { ok: false, code: 'VALIDATION_FAILED', message: place.message }

    let created: ReviewEvent | null = null
    const res = await this.createTaskVersion(
      { taskId: active.taskId, ownVessel: active.ownVessel, targetVessel: active.targetVessel, terminalId: cmd.patch.terminalId, berthId: cmd.patch.berthId, note: active.note },
      cmd.expectedTaskVersion,
      'review-apply',
      cmd.utteranceId,
      (before, after) => (created = makeEvent(before, after)),
    )
    if (!res.ok) return res
    return { ok: true, value: created! }
  }

  /* ───────── 일지 ───────── */
  async getTaskLog(taskId: string): Promise<Result<TaskLog>> {
    const db = await getDb()
    const versions = (await db.getAllFromIndex('taskVersions', 'byTask', taskId)).sort((a, b) => a.version - b.version)
    if (versions.length === 0) return { ok: false, code: 'NOT_FOUND', message: '작업 기록이 없습니다.' }
    const meta = (await db.get('meta', 'activeTask'))?.value as { taskId: string; activeVersion: number } | undefined
    const utts = await db.getAllFromIndex('utterances', 'byTask', taskId)
    const reviewEvents: ReviewEvent[] = []
    const utterances: TaskLog['utterances'] = []
    for (const u of utts) {
      const rs = await db.getAllFromIndex('results', 'byUtterance', u.utteranceId)
      const latest = rs.sort((a, b) => b.revision - a.revision)[0]
      if (!latest) continue
      const evs = (await db.getAllFromIndex('reviewEvents', 'byUtterance', u.utteranceId)).sort((a, b) => a.at.localeCompare(b.at))
      reviewEvents.push(...evs)
      utterances.push({ utterance: u, result: latest, review: reviewStatusOf(evs) })
    }
    utterances.sort((a, b) => a.utterance.capturedAt.localeCompare(b.utterance.capturedAt))
    reviewEvents.sort((a, b) => a.at.localeCompare(b.at))
    const notes = await listNotes(taskId)
    return {
      ok: true,
      value: { taskId, activeVersion: meta?.taskId === taskId ? meta.activeVersion : versions[versions.length - 1].version, versions, utterances, reviewEvents, notes },
    }
  }

  async exportTaskLog(taskId: string, format: 'json' | 'txt'): Promise<Result<ExportFile>> {
    const log = await this.getTaskLog(taskId)
    if (!log.ok) return log
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')
    if (format === 'json') {
      return {
        ok: true,
        value: {
          filename: `marinear-${taskId}-${stamp}.json`,
          mime: 'application/json',
          content: JSON.stringify({ schemaVersion: SCHEMA_VERSION, exportedAt: nowIso(), includesAudio: false, catalogVersion: this.catalog.catalogVersion, ...log.value }, null, 2),
        },
      }
    }
    return { ok: true, value: { filename: `marinear-${taskId}-${stamp}.txt`, mime: 'text/plain;charset=utf-8', content: buildTxtReport(log.value) } }
  }
}

export function reviewStatusOf(events: ReviewEvent[]): ReviewStatus {
  const last = [...events].sort((a, b) => a.at.localeCompare(b.at)).pop()
  if (!last) return 'unreviewed'
  return last.action === 'apply' ? 'applied' : last.action === 'dismiss' ? 'dismissed' : 'reviewed'
}
