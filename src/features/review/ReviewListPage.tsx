import type { ReviewState } from 'marinear-engine'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../app/AppContext'
import { describeError } from '../../app/errors'
import { entryFromLog, type MessageEntry } from '../../app/state'
import { needsReview } from '../../contracts/labels'
import { useT } from '../../i18n'
import { EmptyState, Segmented } from '../../ui/components'
import { UtteranceCard } from '../radio/UtteranceCard'

type Tab = 'pending' | 'done'

export function ReviewListPage() {
  const { state, engine, dispatch } = useApp()
  const t = useT()
  const [tab, setTab] = useState<Tab>('pending')
  const [stored, setStored] = useState<{ entry: MessageEntry; review: ReviewState }[]>([])
  const task = state.taskState.active

  // 이전 세션의 재확인 대상도 저장된 기록에서 불러온다
  useEffect(() => {
    if (!task) return
    engine.getTaskLog(task.taskId).then(
      (log) => setStored(log.utterances.map((u) => ({ entry: entryFromLog(u, log.sessions), review: u.reviewState }))),
      (e) => dispatch({ type: 'error', ...describeError(e) }),
    )
  }, [engine, dispatch, task, state.reviewState, state.messageState.order.length])

  const merged = new Map<string, { entry: MessageEntry; review: ReviewState }>()
  for (const s of stored) merged.set(s.entry.utterance.utteranceId, s)
  for (const id of state.messageState.order) {
    const entry = state.messageState.byId[id]
    const prev = merged.get(id)
    // 저장본이 더 최신 revision 이면 저장본 유지
    if (entry.result && !(prev?.entry.result && prev.entry.result.revision > entry.result.revision))
      merged.set(id, { entry, review: state.reviewState[id] ?? prev?.review ?? 'unreviewed' })
    else if (prev && state.reviewState[id]) merged.set(id, { ...prev, review: state.reviewState[id] })
  }
  const all = [...merged.values()].filter((m) => needsReview(m.entry.result?.comparison.kind))
  const pending = all.filter((m) => m.review === 'unreviewed')
  const done = all.filter((m) => m.review !== 'unreviewed')
  const list = (tab === 'pending' ? pending : done).sort((a, b) => b.entry.utterance.capturedAt.localeCompare(a.entry.utterance.capturedAt))

  return (
    <>
      <h1>{t.reviewList.title}</h1>
      <Segmented<Tab>
        label={t.reviewList.title}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'pending', label: t.reviewList.pending(pending.length) },
          { value: 'done', label: t.reviewList.done(done.length) },
        ]}
      />
      {list.length === 0 ? (
        <EmptyState
          title={tab === 'pending' ? t.reviewList.emptyPending : t.reviewList.emptyDone}
          action={
            <Link className="btn" to="/monitor">
              {t.reviewList.toMonitor}
            </Link>
          }
        >
          {t.reviewList.emptyHint}
        </EmptyState>
      ) : (
        <div className="timeline-rail">
          {list.map((m) => (
            <UtteranceCard key={m.entry.utterance.utteranceId} entry={m.entry} review={m.review} />
          ))}
        </div>
      )}
    </>
  )
}
