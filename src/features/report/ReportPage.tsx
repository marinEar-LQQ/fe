import type { TaskLog, TaskVersion } from 'marinear-engine'
import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useApp } from '../../app/AppContext'
import { describeError } from '../../app/errors'
import { formatClock, formatDate } from '../../contracts/labels'
import { buildTimeline, displayTranscript, reportStats, type TimelineItem } from '../../engine/report'
import { headline } from '../../engine/transcript'
import { useT } from '../../i18n'
import { DemoBadge, EmptyState, KIND_MARK, Notice, StatusLabel, StatusMark } from '../../ui/components'
import { placeText } from '../radio/MonitorPage'

/** 06 타임라인 카드 하나 (▲◆○ 표식 · 시각 · 원문 · 상태 라벨). 음성 재생은 교신·재확인 화면에서 한다 */
function TimelineCard({ item, onDeleteNote }: { item: TimelineItem; onDeleteNote?: (id: string) => void }) {
  const t = useT()
  const time = <span className="time">{formatClock(item.at)}</span>

  if (item.kind === 'utterance') {
    const { entry } = item
    const result = entry.result
    const mark = result ? KIND_MARK[result.comparison.kind] : { shape: 'circle' as const, tone: 'plain' as const }
    const id = entry.utterance.utteranceId
    return (
      <li className="card soft">
        <StatusMark className="mark" shape={mark.shape} />
        {time}
        <p className="t-title" lang="ko">
          {result ? displayTranscript(result, t) : t.report.notAnalyzed}
        </p>
        <div className="t-foot">
          <span className="status-strip">
            {result ? (
              <Link to={`/reviews/${id}`}>
                <StatusLabel tone={mark.tone}>{headline(result, t)}</StatusLabel>
              </Link>
            ) : (
              <StatusLabel tone="plain">{t.stage.failed}</StatusLabel>
            )}
            {result && (result.comparison.kind === 'difference' || result.comparison.kind === 'ambiguous') && <span className="small muted">{t.review[item.reviewState]}</span>}
            {entry.fixture && <DemoBadge />}
          </span>
        </div>
      </li>
    )
  }

  if (item.kind === 'task') {
    const v = item.version
    return (
      <li className="card soft">
        <StatusMark className="mark" shape="circle" />
        {time}
        <p className="t-title">
          {t.report.taskVersion(v.version)} · <span className="mono">{placeText(v.terminalId, v.berthId)}</span>
        </p>
        <div className="t-foot">
          <StatusLabel tone="plain">{v.sourceReviewEventId ? t.task.fromReview : t.task.manual}</StatusLabel>
          <span className="small muted">
            {v.ownVessel} → {v.targetVessel}
          </span>
        </div>
      </li>
    )
  }

  if (item.kind === 'review') {
    const e = item.event
    const label = t.review[e.action === 'apply' ? 'applied' : e.action === 'dismiss' ? 'dismissed' : 'reviewed']
    return (
      <li className="card soft">
        <StatusMark className="mark" shape="circle" />
        {time}
        <p className="t-title">
          {t.report.userCheck} · {label}
        </p>
        <div className="t-foot">
          <Link to={`/reviews/${e.utteranceId}`}>
            <StatusLabel tone={e.action === 'apply' ? 'ok' : 'plain'}>{e.action === 'apply' ? t.report.versionChange(e.taskVersionBefore, e.taskVersionAfter) : t.reviewDetail.noChange}</StatusLabel>
          </Link>
        </div>
      </li>
    )
  }

  return (
    <li className="card soft">
      <StatusMark className="mark" shape="circle" />
      {time}
      <p className="t-title">{item.note.text}</p>
      <div className="t-foot">
        <StatusLabel tone="plain">{t.report.note}</StatusLabel>
        {onDeleteNote && (
          <button type="button" className="btn sm text no-print" onClick={() => onDeleteNote(item.note.noteId)}>
            {t.report.deleteNote}
          </button>
        )}
      </div>
    </li>
  )
}

/** "작업 로그 저장"으로 남긴 요약 기록인지 (4개 언어 문구의 앞부분) */
const SNAPSHOT_PREFIX = /^(작업 로그 저장|Work log saved|Log kerja disimpan|Đã lưu nhật ký) ·/

/** 지난 작업 일지 목록: 앱 DB 의 모든 작업(listTasks) 중 지금 보고 있는 것을 뺀 나머지, 최근 순 */
function PastLogs({ shownId, activeId }: { shownId: string | null; activeId: string | null }) {
  const { engine } = useApp()
  const t = useT()
  const [rows, setRows] = useState<{ log: TaskLog; current: TaskVersion | undefined; saved: boolean }[] | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      const tasks = [...(await engine.listTasks())].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      const logs = await Promise.all(tasks.map((x) => engine.getTaskLog(x.taskId).catch(() => null)))
      if (!alive) return
      setRows(
        logs
          .filter((l): l is TaskLog => l !== null)
          .map((log) => ({
            log,
            current: log.versions.find((v) => v.version === log.task.activeVersion),
            saved: log.notes.some((n) => !n.deleted && SNAPSHOT_PREFIX.test(n.text)),
          })),
      )
    })()
    return () => {
      alive = false
    }
  }, [engine, shownId])

  const others = (rows ?? []).filter((r) => r.log.task.taskId !== shownId)
  return (
    <section className="no-print" aria-label={t.report.pastTitle} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
      <h2>{t.report.pastTitle}</h2>
      {rows === null ? (
        <p className="small muted">{t.common.loading}</p>
      ) : others.length === 0 ? (
        <p className="small muted">{t.report.pastEmpty}</p>
      ) : (
        others.map(({ log, current, saved }) => {
          const isActive = log.task.taskId === activeId
          return (
            <Link key={log.task.taskId} to={isActive ? '/report' : `/report?task=${log.task.taskId}`} className="card soft past-log">
              <div className="card-title-row">
                <strong>{current?.targetVessel ?? '-'}</strong>
                <span className="chip">{formatDate(log.versions[0]?.createdAt ?? log.task.createdAt)}</span>
              </div>
              <span className="small" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <b className="mono">{current ? placeText(current.terminalId, current.berthId) : '-'}</b>
                <span className="muted">{t.report.pastCalls(log.counts.utterances)}</span>
                {isActive && <span className="badge info">{t.report.pastCurrent}</span>}
                {saved && <span className="badge ok">{t.report.pastSaved}</span>}
              </span>
            </Link>
          )
        })
      )}
    </section>
  )
}

/** 06 작업별 교신 일지 + 07 작업 메모와 내보내기 (한 화면). ?task=<id> 면 지난 작업 일지를 보기 전용으로 */
export function ReportPage() {
  const { state, engine } = useApp()
  const t = useT()
  const [params] = useSearchParams()
  const active = state.taskState.active
  const viewId = params.get('task')
  const viewingPast = viewId !== null && viewId !== active?.taskId
  const shownId = viewingPast ? viewId : (active?.taskId ?? null)
  const [log, setLog] = useState<TaskLog | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [memo, setMemo] = useState('')
  const [msg, setMsg] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null)

  const reload = useCallback(async () => {
    if (!shownId) return
    try {
      setLog(await engine.getTaskLog(shownId))
      setLoadError(null)
    } catch (e) {
      setLoadError(describeError(e).message)
    }
  }, [engine, shownId])

  // 새 교신·검토·기준 변경이 저장되면 다시 읽는다 (건수는 실제 저장 기록으로 집계)
  useEffect(() => {
    void reload()
  }, [reload, state.reviewState, state.messageState])

  if (!shownId)
    return (
      <>
        <h1>{t.report.title}</h1>
        <EmptyState
          title={t.report.noTask}
          action={
            <Link className="btn primary" to="/task">
              {t.monitor.registerTask}
            </Link>
          }
        >
          {t.report.noTaskHint}
        </EmptyState>
        <PastLogs shownId={null} activeId={null} />
      </>
    )
  if (loadError) return <Notice tone="danger">{t.report.loadFailed(loadError)}</Notice>
  if (!log || log.task.taskId !== shownId) return <EmptyState title={t.common.loading} />

  // 보고 있는 작업의 현재 기준 (지난 일지면 그 작업의 마지막 기준)
  const task = log.versions.find((v) => v.version === log.task.activeVersion) ?? log.versions[log.versions.length - 1]!
  const timeline = buildTimeline(log)
  const stats = reportStats(log)
  const fixtureCount = timeline.filter((i) => i.kind === 'utterance' && i.entry.fixture).length
  const firstVersion = log.versions[0]

  async function saveMemo(): Promise<boolean> {
    const text = memo.trim()
    if (!text || !task) return true
    try {
      // 메모도 엔진 저장소(notes)에 저장한다 — 일지·내보내기와 같은 원본
      await engine.saveNote(task.taskId, text)
      setMemo('')
      setMsg({ tone: 'info', text: t.report.memoSaved })
      await reload()
      return true
    } catch (err) {
      setMsg({ tone: 'danger', text: t.report.memoFailed(describeError(err).message) })
      return false
    }
  }

  async function removeMemo(noteId: string) {
    if (!task) return
    try {
      // 엔진 규칙: 빈 내용으로 저장하면 삭제 표시(deleted)된다 — 기록 자체는 남는다
      await engine.saveNote(task.taskId, '', noteId)
      setMsg({ tone: 'info', text: t.report.memoDeleted })
      await reload()
    } catch (err) {
      setMsg({ tone: 'danger', text: t.report.memoDeleteFailed(describeError(err).message) })
    }
  }

  /**
   * 작업 로그 저장: 파일로 내려받지 않고 앱 DB(엔진 저장소, IndexedDB)에 남긴다.
   * 교신·확인·기준 변경은 이미 DB에 있으므로, 쓰던 메모 + "저장 시점 요약" 기록을 더해 일지에 고정한다.
   * (파일 내보내기는 설정 → 시연 준비에서 계속 가능)
   */
  async function saveWorkLog() {
    if (!task || !(await saveMemo())) return
    try {
      await engine.saveNote(task.taskId, t.report.snapshot(stats.utterances, stats.userChecks, stats.unchecked))
      setMsg({ tone: 'info', text: t.report.savedToApp })
      await reload()
    } catch (e) {
      setMsg({ tone: 'danger', text: t.report.saveFailed(describeError(e).message) })
    }
  }

  return (
    <>
      <h1>{t.report.title}</h1>
      {viewingPast && (
        <Notice
          tone="info"
          action={
            <Link className="btn sm primary no-print" to="/report">
              {t.report.backToCurrent}
            </Link>
          }
        >
          {t.report.viewingPast}
        </Notice>
      )}

      <section className="card">
        <div className="card-title-row">
          <strong style={{ fontSize: 'var(--fs-md)' }}>{t.report.recordTitle(task.targetVessel)}</strong>
          <span className="chip">{formatDate(firstVersion?.createdAt ?? log.task.createdAt)}</span>
        </div>
        <span className="mono small" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span>{task.ownVessel}</span>
          <b>{placeText(task.terminalId, task.berthId)}</b>
          <span className="muted">v{log.task.activeVersion}</span>
        </span>
      </section>

      <div className="stat-row" role="group" aria-label={t.report.statsLabel}>
        <div className="stat">
          <span>{t.report.statUtterances}</span>
          <b>{stats.utterances}</b>
        </div>
        <div className="stat">
          <span>{t.report.statChecks}</span>
          <b>{stats.userChecks}</b>
        </div>
        <div className={`stat ${stats.unchecked > 0 ? 'alert' : ''}`}>
          <span>{t.report.statUnchecked}</span>
          <b>{stats.unchecked}</b>
        </div>
      </div>
      {fixtureCount > 0 && <p className="small muted">{t.report.fixtureNote(stats.utterances, fixtureCount)}</p>}

      <h2>{t.report.timeline}</h2>
      {timeline.length === 0 ? (
        <p className="small muted">{t.report.empty}</p>
      ) : (
        <div className="timeline-rail">
          <ol className="timeline">
            {timeline.map((item, i) => (
              <TimelineCard key={i} item={item} onDeleteNote={viewingPast ? undefined : (id) => void removeMemo(id)} />
            ))}
          </ol>
        </div>
      )}

      {/* 07 작업 메모와 내보내기 — 지난 일지는 보기 전용이라 인쇄만 */}
      {!viewingPast && (
        <section className="card no-print" style={{ gap: 8, marginTop: 4 }}>
          <label htmlFor="memo" style={{ fontSize: 'var(--fs-md)', fontWeight: 700 }}>
            {t.report.memoLabel}
          </label>
          <textarea id="memo" className="input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={t.report.memoPlaceholder} style={{ resize: 'none' }} />
        </section>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="btn-grid no-print">
        {!viewingPast && (
          <button type="button" className="btn primary md" onClick={() => void saveWorkLog()}>
            {t.report.saveLog}
          </button>
        )}
        <button type="button" className="btn md" onClick={() => window.print()}>
          {t.report.print}
        </button>
      </div>

      <PastLogs shownId={shownId} activeId={active?.taskId ?? null} />
    </>
  )
}
