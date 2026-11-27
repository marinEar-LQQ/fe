import type { ReviewEvent, ReviewState, TaskVersion } from 'marinear-engine'
import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../../app/AppContext'
import { describeError } from '../../app/errors'
import { entryFromLog, type MessageEntry } from '../../app/state'

/** 화면 상태(현재 세션)에 없으면 저장된 일지에서 불러온다 */
export function useUtterance(id: string | undefined) {
  const { state, engine } = useApp()
  const live = id ? state.messageState.byId[id] : undefined
  const [stored, setStored] = useState<MessageEntry | null>(null)
  const [storedReview, setStoredReview] = useState<ReviewState>('unreviewed')
  const [versions, setVersions] = useState<TaskVersion[]>([])
  const [events, setEvents] = useState<ReviewEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const taskId = live?.utterance.taskId || state.taskState.active?.taskId
  const reviewStatus = id ? state.reviewState[id] : undefined
  const activeVersion = state.taskState.active?.version

  useEffect(() => {
    let cancelled = false
    if (!id || !taskId) {
      setLoading(false)
      return
    }
    engine.getTaskLog(taskId).then(
      (log) => {
        if (cancelled) return
        setVersions(log.versions)
        const found = log.utterances.find((u) => u.utterance.utteranceId === id)
        setEvents(found?.reviewEvents ?? [])
        setStoredReview(found?.reviewState ?? 'unreviewed')
        setStored(found ? entryFromLog(found, log.sessions) : null)
        setLoadError(null)
        setLoading(false)
      },
      (e) => {
        if (cancelled) return
        setLoadError(describeError(e).message)
        setLoading(false)
      },
    )
    return () => {
      cancelled = true
    }
  }, [engine, id, taskId, reviewStatus, activeVersion, live?.result?.revision, reloadKey])

  /** VERSION_CONFLICT / RESULT_STALE 후 최신 기준·결과를 다시 읽는다 (자동 재시도 아님) */
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  // 저장된 결과가 더 최신 revision 이면(또는 화면에 결과가 아직 없으면) 저장본을 쓴다
  const useStored = Boolean(stored?.result && (!live?.result || stored.result.revision > live.result.revision))
  const entry = useStored && stored ? { ...stored, fixture: stored.fixture || Boolean(live?.fixture) } : (live ?? stored)
  return { entry, versions, events, storedReview, loading, loadError, reload }
}
