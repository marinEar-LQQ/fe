import type {
  AssetManifest,
  AudioClip,
  AudioFrame,
  EngineEvent,
  ExportFile,
  LangCode,
  Readiness,
  Result,
  ReviewCommand,
  ReviewEvent,
  SessionSource,
  TaskDraft,
  TaskLog,
  TaskVersion,
} from '../contracts/types'

/**
 * 공통 EngineClient 인터페이스 (세 문서 공통 계약)
 * - 기본 구현: Worker adapter / 화면 검증: Mock adapter / 선택: PC adapter
 * - UI 는 모델 라이브러리를 직접 호출하지 않고 반드시 이 인터페이스만 사용한다.
 */
export interface EngineClient {
  loadAssets(manifest: AssetManifest): Promise<Result<Readiness>>
  checkReadiness(): Promise<Readiness>

  saveTask(draft: TaskDraft, expectedVersion?: number): Promise<Result<TaskVersion>>
  /** 앱 시작 시 현재 작업 기준 복원 (계약 보조 — getTaskLog 로 대체 가능) */
  getActiveTask(): Promise<TaskVersion | null>

  openSession(taskId: string | null, source: SessionSource, file?: File): Promise<Result<{ sessionId: string }>>
  appendAudio(sessionId: string, frame: AudioFrame): void
  closeSession(sessionId: string): Promise<void>

  requestTranslation(utteranceId: string, revision: number, lang: LangCode): Promise<void>
  getAudioClip(utteranceId: string, variant: 'raw' | 'enhanced', startMs?: number, endMs?: number): Promise<AudioClip>

  reviewUtterance(command: ReviewCommand): Promise<Result<ReviewEvent>>

  getTaskLog(taskId: string): Promise<Result<TaskLog>>
  exportTaskLog(taskId: string, format: 'json' | 'txt'): Promise<Result<ExportFile>>

  subscribe(listener: (event: EngineEvent) => void): () => void
}
