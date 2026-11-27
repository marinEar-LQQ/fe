import type { ReviewState, TaskLog } from 'marinear-engine'
import { useEffect, useState } from 'react'
import { needsReview } from '../contracts/labels'
import { useApp } from './AppContext'
import { describeError } from './errors'
import { entryFromLog } from './state'

/**
 * 재확인 대기열: 확인이 필요한(장소 차이·확인 필요) 교신 중 아직 처리하지 않은 것, 오래된 순.
 * 교신 화면의 "확인할 교신 N건" 띠, 재확인의 "다음 건으로 자동 이동"이 같은 목록을 쓴다.
 * 저장된 일지(이전 세션 포함) + 지금 화면의 결과를 합친다 (ReviewListPage 와 같은 규칙).
 */
export function useReviewQueue(): { pendingIds: string[]; total: number; utterances: number } {
  const { state, engine, dispatch } = useApp()
  const task = state.taskState.active
  const [log, setLog] = useState<TaskLog | null>(null)

  useEffect(() => {
    if (!task) return
    engine.getTaskLog(task.taskId).then(setLog, (e) => dispatch({ type: 'error', ...describeError(e) }))
  }, [engine, dispatch, task, state.reviewState, state.messageState.order.length])

  const items = new Map<string, { capturedAt: string; review: ReviewState; needs: boolean }>()
  for (const u of log?.utterances ?? []) {
    const entry = entryFromLog(u, log!.sessions)
    items.set(u.utterance.utteranceId, { capturedAt: u.utterance.capturedAt, review: u.reviewState, needs: needsReview(entry.result?.comparison.kind) })
  }
  for (const id of state.messageState.order) {
    const entry = state.messageState.byId[id]
    if (!entry?.result) continue
    const prev = items.get(id)
    items.set(id, {
      capturedAt: entry.utterance.capturedAt,
      review: state.reviewState[id] ?? prev?.review ?? 'unreviewed',
      needs: needsReview(entry.result.comparison.kind),
    })
  }
  const needing = [...items.entries()].filter(([, v]) => v.needs)
  const pendingIds = needing
    .filter(([, v]) => v.review === 'unreviewed')
    .sort((a, b) => a[1].capturedAt.localeCompare(b[1].capturedAt))
    .map(([id]) => id)
  // utterances: 저장된 기록 + 지금 화면의 교신 수 (새로고침 뒤에도 "교신 기록 정리" 띠를 보이기 위해)
  return { pendingIds, total: needing.length, utterances: items.size }
}
