import { useEffect, useState } from 'react'
import { useApp } from '../../app/AppContext'
import type { MessageEntry } from '../../app/state'
import type { ReviewEvent, TaskVersion } from '../../contracts/types'

/** 화면 상태(현재 세션)에 없으면 저장된 일지에서 불러온다 */
export function useUtterance(id: string | undefined) {
  const { state, engine } = useApp()
  const live = id ? state.messageState.byId[id] : undefined
  const [stored, setStored] = useState<MessageEntry | null>(null)
  const [versions, setVersions] = useState<TaskVersion[]>([])
  const [events, setEvents] = useState<ReviewEvent[]>([])
  const [loading, setLoading] = useState(true)
  const taskId = live?.utterance.taskId ?? state.taskState.active?.taskId
  const reviewStatus = id ? state.reviewState[id] : undefined
  const activeVersion = state.taskState.active?.version

  useEffect(() => {
    let cancelled = false
    if (!id || !taskId) {
      setLoading(false)
      return
    }
    engine.getTaskLog(taskId).then((r) => {
      if (cancelled) return
      if (r.ok) {
        setVersions(r.value.versions)
        setEvents(r.value.reviewEvents.filter((e) => e.utteranceId === id))
        const found = r.value.utterances.find((u) => u.utterance.utteranceId === id)
        if (found) setStored({ utterance: found.utterance, result: found.result, partialText: null })
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [engine, id, taskId, reviewStatus, activeVersion, live?.result?.revision])

  return { entry: live ?? stored, versions, events, loading }
}
