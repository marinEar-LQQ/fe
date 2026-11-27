import type { AnalysisResult, ReviewEvent, ReviewState, TaskLog, TaskNote, TaskVersion } from 'marinear-engine'
import { entryFromLog, type MessageEntry } from '../app/state'
import { needsReview } from '../contracts/labels'
import { transcriptPlainText } from './transcript'

/** 일지·내보내기용 자막: 불확실 후보 전부를 [A / B] 로 붙인다 (transcript.ts 규칙) */
export const displayTranscript = transcriptPlainText

/**
 * 정정 발화 정보. "HPNT 말고 PNIT" 처럼 부정(negated)된 후보가 있거나 CORRECTION_UNCLEAR 이면 반환.
 * negated: 정정 전(취소된) 표현, unclear: 정정 내용이 불명확해 엔진이 판단하지 않음
 */
export function correctionInfo(result: AnalysisResult): { negated: string[]; unclear: boolean } | null {
  const negated = [...new Set(result.candidates.filter((c) => c.negated && (c.field === 'terminal' || c.field === 'berth' || c.field === 'vessel')).map((c) => c.surface))]
  const unclear = result.comparison.reasonCodes.includes('CORRECTION_UNCLEAR')
  return negated.length || unclear ? { negated, unclear } : null
}

/** 06 타임라인 항목 — 문구는 화면 언어로 그린다 (여기서는 데이터만) */
export type TimelineItem =
  | { kind: 'task'; at: string; version: TaskVersion }
  | { kind: 'utterance'; at: string; entry: MessageEntry; reviewState: ReviewState }
  | { kind: 'review'; at: string; event: ReviewEvent }
  | { kind: 'note'; at: string; note: TaskNote }

/** 엔진이 저장한 기록(TaskLog)만으로 시간순 일지를 만든다 (삭제 표시된 메모 제외) */
export function buildTimeline(log: TaskLog): TimelineItem[] {
  const items: TimelineItem[] = []
  for (const v of log.versions) items.push({ kind: 'task', at: v.createdAt, version: v })
  for (const u of log.utterances) {
    items.push({ kind: 'utterance', at: u.utterance.capturedAt, entry: entryFromLog(u, log.sessions), reviewState: u.reviewState })
    for (const event of u.reviewEvents) items.push({ kind: 'review', at: event.at, event })
  }
  for (const note of log.notes) if (!note.deleted) items.push({ kind: 'note', at: note.at, note })
  return items.sort((a, b) => a.at.localeCompare(b.at))
}

/** 06 통계: 건수는 엔진 TaskLog.counts 기준. 미확인 = 확인이 필요한 판정(장소 차이·재확인 필요) 중 아직 처리하지 않은 것 */
export function reportStats(log: TaskLog): { utterances: number; userChecks: number; unchecked: number } {
  const unchecked = log.utterances.filter((u) => needsReview(u.results[u.results.length - 1]?.comparison.kind) && u.reviewState === 'unreviewed').length
  return { utterances: log.counts.utterances, userChecks: log.counts.reviewed + log.counts.dismissed + log.counts.applied, unchecked }
}
