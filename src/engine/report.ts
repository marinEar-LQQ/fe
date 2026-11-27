import type { AnalysisResult, TaskLog } from 'marinear-engine'
import { entryFromLog } from '../app/state'
import { COMPARISON_LABEL, REASON_LABEL, REVIEW_LABEL } from '../contracts/labels'

/** 불확실 값은 [A / B] 형태로 유지해 확정값처럼 보이지 않게 한다 */
export function displayTranscript(result: AnalysisResult): string {
  let text = result.enhancedTranscript?.text ?? result.rawTranscript?.text ?? ''
  for (const u of result.uncertainties) {
    if (u.alternatives.length < 2) continue
    const marked = `[${u.alternatives.join(' / ')}]`
    for (const alt of u.alternatives) {
      if (text.includes(alt)) {
        text = text.replace(alt, marked)
        break
      }
    }
  }
  return text
}

export type TimelineItem =
  | { kind: 'task'; at: string; title: string; detail: string }
  | { kind: 'utterance'; at: string; title: string; detail: string; utteranceId: string }
  | { kind: 'review'; at: string; title: string; detail: string; utteranceId: string }
  | { kind: 'note'; at: string; title: string; detail: string; noteId: string }

/** 엔진이 저장한 기록(TaskLog)만으로 시간순 일지를 만든다 */
export function buildTimeline(log: TaskLog): TimelineItem[] {
  const items: TimelineItem[] = []
  for (const v of log.versions) {
    items.push({
      kind: 'task',
      at: v.createdAt,
      title: `작업 기준 v${v.version} ${v.sourceReviewEventId ? '(교신 확인 후 반영)' : '(직접 등록)'}`,
      detail: `${v.ownVessel} → ${v.targetVessel} · ${v.terminalId ?? '터미널 미정'} ${v.berthId ?? ''}`.trim(),
    })
  }
  for (const u of log.utterances) {
    const entry = entryFromLog(u, log.sessions)
    const result = entry.result
    const kind = result ? COMPARISON_LABEL[result.comparison.kind] : '분석 결과 없음'
    const reasons = result?.comparison.reasonCodes.map((r) => REASON_LABEL[r]).join(', ')
    items.push({
      kind: 'utterance',
      at: u.utterance.capturedAt,
      title: `교신 · ${kind}${entry.fixture ? ' · 시연 데이터' : ''}`,
      detail: result
        ? `"${displayTranscript(result)}"${reasons ? ` — ${reasons}` : ''} (기준 v${u.utterance.taskVersion}, r${result.revision})`
        : `원음 보존 · 분석 미완료 (기준 v${u.utterance.taskVersion})`,
      utteranceId: u.utterance.utteranceId,
    })
    for (const ev of u.reviewEvents) {
      const label = ev.action === 'apply' ? REVIEW_LABEL.applied : ev.action === 'dismiss' ? REVIEW_LABEL.dismissed : REVIEW_LABEL.reviewed
      items.push({
        kind: 'review',
        at: ev.at,
        title: `사용자 확인 · ${label}`,
        detail: ev.action === 'apply' ? `작업 기준 v${ev.taskVersionBefore} → v${ev.taskVersionAfter}` : `작업 기준 변경 없음 (r${ev.resultRevision})`,
        utteranceId: ev.utteranceId,
      })
    }
  }
  for (const n of log.notes) if (!n.deleted) items.push({ kind: 'note', at: n.at, title: '직접 메모', detail: n.text, noteId: n.noteId })
  return items.sort((a, b) => a.at.localeCompare(b.at))
}
