import { DEMO_TASK, type EngineClient, type MockEngineClient, type Session, type TaskVersion } from 'marinear-engine'

/** 시연 모드 조작. MockEngineClient 일 때만 존재한다. */
export interface DemoControls {
  /** 해동호 / A선박 / PNIT T3 작업이 있으면 재사용, 없으면 seedDemoTask() */
  ensureDemoTask(): Promise<TaskVersion>
  playScenario(taskId: string): Promise<Session>
}

function isDemoVersion(v: TaskVersion): boolean {
  return v.ownVessel === DEMO_TASK.ownVessel && v.targetVessel === DEMO_TASK.targetVessel && v.terminalId === DEMO_TASK.terminalId && v.berthId === DEMO_TASK.berthId
}

/** 작업 목록에서 현재(activeVersion) 기준이 시연 작업과 같은 것을 찾는다. 최근 수정 순. */
export async function findDemoTask(engine: EngineClient): Promise<TaskVersion | null> {
  const tasks = [...(await engine.listTasks())].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  for (const task of tasks) {
    const log = await engine.getTaskLog(task.taskId)
    const active = log.versions.find((v) => v.version === task.activeVersion)
    if (active && isDemoVersion(active)) return active
  }
  return null
}

export function demoControls(mock: MockEngineClient): DemoControls {
  return {
    async ensureDemoTask() {
      const found = await findDemoTask(mock)
      if (found) return found
      const taskId = await mock.seedDemoTask()
      const log = await mock.getTaskLog(taskId)
      return log.versions.find((v) => v.version === log.task.activeVersion)!
    },
    playScenario: (taskId) => mock.playScenario(taskId),
  }
}
