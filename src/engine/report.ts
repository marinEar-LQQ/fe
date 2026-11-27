import { COMPARISON_LABEL, REASON_LABEL, REVIEW_LABEL, formatClock } from '../contracts/labels'
import type { AnalysisResult, TaskLog } from '../contracts/types'

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

export function buildTimeline(log: TaskLog): TimelineItem[] {
  const items: TimelineItem[] = []
  for (const v of log.versions) {
    items.push({
      kind: 'task',
      at: v.createdAt,
      title: `작업 기준 v${v.version} ${v.origin === 'review-apply' ? '(교신 확인 후 반영)' : '(직접 등록)'}`,
      detail: `${v.ownVessel} → ${v.targetVessel} · ${v.terminalId ?? '터미널 미정'} ${v.berthId ?? ''}`.trim(),
    })
  }
  for (const { utterance, result } of log.utterances) {
    const kind = result.comparison ? COMPARISON_LABEL[result.comparison.kind] : '비교 불가'
    const reasons = result.comparison?.reasonCodes.map((r) => REASON_LABEL[r]).join(', ')
    items.push({
      kind: 'utterance',
      at: utterance.capturedAt,
      title: `교신 · ${kind}${utterance.isFixture ? ' · 시연 데이터' : ''}`,
      detail: `"${displayTranscript(result)}"${reasons ? ` — ${reasons}` : ''} (기준 v${utterance.taskVersion ?? '-'}, r${result.revision})`,
      utteranceId: utterance.utteranceId,
    })
  }
  for (const ev of log.reviewEvents) {
    const label = ev.action === 'apply' ? REVIEW_LABEL.applied : ev.action === 'dismiss' ? REVIEW_LABEL.dismissed : REVIEW_LABEL.reviewed
    items.push({
      kind: 'review',
      at: ev.at,
      title: `사용자 확인 · ${label}`,
      detail: ev.action === 'apply' ? `작업 기준 v${ev.taskVersionBefore} → v${ev.taskVersionAfter}` : `작업 기준 변경 없음 (r${ev.resultRevision})`,
      utteranceId: ev.utteranceId,
    })
  }
  for (const n of log.notes) items.push({ kind: 'note', at: n.at, title: '직접 메모', detail: n.text, noteId: n.noteId })
  return items.sort((a, b) => a.at.localeCompare(b.at))
}

export function buildTxtReport(log: TaskLog): string {
  const active = log.versions.find((v) => v.version === log.activeVersion)
  const lines = [
    'marinEar 작업 일지',
    `작업 ID: ${log.taskId}`,
    `현재 기준: v${log.activeVersion} · ${active?.ownVessel ?? '-'} → ${active?.targetVessel ?? '-'} · ${active?.terminalId ?? '-'} ${active?.berthId ?? ''}`,
    `교신 ${log.utterances.length}건 · 기준 변경 ${log.versions.length - 1}건 · 사용자 확인 ${log.reviewEvents.length}건 · 메모 ${log.notes.length}건`,
    '※ 음성 파일은 포함되지 않았습니다. "시연 데이터" 표시는 실제 분석 결과가 아닙니다.',
    '',
  ]
  for (const item of buildTimeline(log)) lines.push(`[${formatClock(item.at)}] ${item.title}`, `    ${item.detail}`)
  return lines.join('\n')
}
