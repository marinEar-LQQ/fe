import type { ExportFormat, TaskLog } from 'marinear-engine'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../app/AppContext'
import { download } from '../../app/download'
import { describeError } from '../../app/errors'
import { entryFromLog } from '../../app/state'
import { formatClock } from '../../contracts/labels'
import { buildTimeline } from '../../engine/report'
import { Badge, Card, EmptyState, Notice } from '../../ui/components'

export function ReportPage() {
  const { state, engine } = useApp()
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
      <EmptyState title="작업이 없습니다" action={<Link className="btn primary" to="/task">작업 등록</Link>}>
        작업을 등록하면 교신·기준 변경·확인 기록이 여기에 쌓입니다.
      </EmptyState>
    )
  if (loadError) return <Notice tone="danger">일지를 불러오지 못했습니다: {loadError}</Notice>
  if (!log) return <EmptyState title="불러오는 중…" />

  const timeline = buildTimeline(log)
  const fixtureCount = log.utterances.filter((u) => entryFromLog(u, log.sessions).fixture).length
  const noteCount = log.notes.filter((n) => !n.deleted).length

  async function addMemo() {
    const text = memo.trim()
    if (!text || !task) return
    try {
      // 메모도 엔진 저장소(notes)에 저장한다 — 일지·내보내기와 같은 원본
      await engine.saveNote(task.taskId, text)
      setMemo('')
      setMsg({ tone: 'info', text: '메모를 저장했습니다.' })
      await reload()
    } catch (err) {
      setMsg({ tone: 'danger', text: `메모 저장 실패: ${describeError(err).message}` })
    }
  }

  async function removeMemo(noteId: string) {
    if (!task) return
    try {
      // 엔진 규칙: 빈 내용으로 저장하면 삭제 표시(deleted)된다 — 기록 자체는 남는다
      await engine.saveNote(task.taskId, '', noteId)
      setMsg({ tone: 'info', text: '메모를 삭제했습니다.' })
      await reload()
    } catch (err) {
      setMsg({ tone: 'danger', text: `메모 삭제 실패: ${describeError(err).message}` })
    }
  }

  async function exportAs(format: ExportFormat) {
    try {
      const file = await engine.exportTaskLog(log!.task.taskId, format)
      download(file.filename, file.mimeType, file.content)
      setMsg({ tone: 'info', text: `${file.filename} 파일을 만들었습니다. (음성 미포함)` })
    } catch (e) {
      setMsg({ tone: 'danger', text: `내보내기 실패: ${describeError(e).message}` })
    }
  }

  return (
    <>
      <Card>
        <div className="card-title-row">
          <h2>
            {task.ownVessel} → {task.targetVessel}
          </h2>
          <Badge tone="info">
            현재 v{log.task.activeVersion} · {task.terminalId} {task.berthId}
          </Badge>
        </div>
        <div className="stat-row">
          <div className="stat">
            <b>{log.counts.utterances}</b>
            <span>교신</span>
          </div>
          <div className="stat">
            <b>{log.counts.taskChanges}</b>
            <span>기준 변경</span>
          </div>
          <div className="stat">
            <b>{log.counts.reviewed + log.counts.dismissed + log.counts.applied}</b>
            <span>사용자 확인</span>
          </div>
          <div className="stat">
            <b>{noteCount}</b>
            <span>메모</span>
          </div>
        </div>
        {fixtureCount > 0 && <p className="small muted" style={{ marginBottom: 0 }}>교신 {log.counts.utterances}건 중 {fixtureCount}건은 시연 데이터입니다.</p>}
      </Card>

      <Card>
        <h2>시간순 기록</h2>
        {timeline.length === 0 ? (
          <p className="muted">아직 기록이 없습니다.</p>
        ) : (
          <ol className="timeline">
            {timeline.map((item, i) => (
              <li key={i}>
                <time dateTime={item.at}>{formatClock(item.at)}</time>
                <div>
                  <div className="t-title">
                    {item.kind === 'utterance' || item.kind === 'review' ? <Link to={`/reviews/${item.utteranceId}`}>{item.title}</Link> : item.title}
                  </div>
                  <div className="t-detail">{item.detail}</div>
                  {item.kind === 'note' && (
                    <button className="btn sm ghost no-print" onClick={() => void removeMemo(item.noteId)}>
                      삭제
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card className="no-print">
        <h2>일지 메모</h2>
        {msg && (
          <div style={{ marginBottom: 12 }}>
            <Notice tone={msg.tone}>{msg.text}</Notice>
          </div>
        )}
        <div className="field" style={{ marginBottom: 12 }}>
          <label htmlFor="memo">직접 메모</label>
          <textarea id="memo" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 14:20 관제에 재확인 요청함" />
        </div>
        <div className="btn-row">
          <button className="btn primary" onClick={() => void addMemo()} disabled={!memo.trim()}>
            메모 저장
          </button>
        </div>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => void exportAs('txt')}>
            TXT 내보내기
          </button>
          <button className="btn" onClick={() => void exportAs('json')}>
            JSON 내보내기
          </button>
          <button className="btn" onClick={() => window.print()}>
            인쇄 / PDF
          </button>
        </div>
      </Card>
    </>
  )
}
