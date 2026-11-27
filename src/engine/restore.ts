import type { EngineClient, TaskVersion } from 'marinear-engine'

/** 앱 시작 시: 저장된 작업 중 가장 최근에 바뀐 작업의 현재 기준을 복원한다 (listTasks + getTaskLog) */
export async function restoreActiveTask(engine: EngineClient): Promise<TaskVersion | null> {
  const tasks = await engine.listTasks()
  const latest = [...tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  if (!latest) return null
  const log = await engine.getTaskLog(latest.taskId)
  return log.versions.find((v) => v.version === log.task.activeVersion) ?? null
}
