import type { TaskLog } from 'marinear-engine'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../app/AppContext'
import { describeError } from '../../app/errors'
import { formatClock, formatDate } from '../../contracts/labels'
import { buildTimeline, displayTranscript, reportStats, type TimelineItem } from '../../engine/report'
import { headline } from '../../engine/transcript'
import { useT } from '../../i18n'
import { DemoBadge, EmptyState, KIND_MARK, Notice, StatusLabel, StatusMark } from '../../ui/components'
import { placeText } from '../radio/MonitorPage'

/** 06 타임라인 카드 하나 (▲◆○ 표식 · 시각 · 원문 · 상태 라벨). 음성 재생은 교신·재확인 화면에서 한다 */
function TimelineCard({ item, onDeleteNote }: { item: TimelineItem; onDeleteNote: (id: string) => void }) {
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
        <button type="button" className="btn sm text no-print" onClick={() => onDeleteNote(item.note.noteId)}>
          {t.report.deleteNote}
        </button>
      </div>
    </li>
  )
}

/** 06 작업별 교신 일지 + 07 작업 메모와 내보내기 (한 화면) */
export function ReportPage() {
  const { state, engine } = useApp()
  const t = useT()
  const task = state.taskState.active
  const [log, setLog] = useState<TaskLog | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [memo, setMemo] = useState('')
  const [msg, setMsg] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null)

  const reload = useCallback(async () => {
    if (!task) return
    try {
      setLog(await engine.getTaskLog(task.taskId))
      setLoadError(null)
    } catch (e) {
      setLoadError(describeError(e).message)
    }
  }, [engine, task])

  // 새 교신·검토·기준 변경이 저장되면 다시 읽는다 (건수는 실제 저장 기록으로 집계)
  useEffect(() => {
    void reload()
  }, [reload, state.reviewState, state.messageState])

  if (!task)
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
      </>
    )
  if (loadError) return <Notice tone="danger">{t.report.loadFailed(loadError)}</Notice>
  if (!log) return <EmptyState title={t.common.loading} />

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
              <TimelineCard key={i} item={item} onDeleteNote={(id) => void removeMemo(id)} />
            ))}
          </ol>
        </div>
      )}

      {/* 07 작업 메모와 내보내기 */}
      <section className="card no-print" style={{ gap: 8, marginTop: 4 }}>
        <label htmlFor="memo" style={{ fontSize: 'var(--fs-md)', fontWeight: 700 }}>
          {t.report.memoLabel}
        </label>
        <textarea id="memo" className="input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={t.report.memoPlaceholder} style={{ resize: 'none' }} />
      </section>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="btn-grid no-print">
        <button type="button" className="btn primary md" onClick={() => void saveWorkLog()}>
          {t.report.saveLog}
        </button>
        <button type="button" className="btn md" onClick={() => window.print()}>
          {t.report.print}
        </button>
      </div>
    </>
  )
}
