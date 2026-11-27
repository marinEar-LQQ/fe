import type { AnalysisResult, ReasonCode, Uncertainty, WordDiff } from 'marinear-engine'
import { ko, type Messages } from '../i18n/ko'

/**
 * 자막 표시 규칙 (화면 공통, React 없이 테스트 가능)
 * - 불확실 값은 확정값처럼 보이지 않게 [A / B] (후보 1개면 [A?]) 로 표시한다.
 * - 한 발화의 불확실 후보는 전부 표시한다 (본문에서 찾으면 그 자리에, 아니면 '확인 필요' 줄에만).
 * - 원음/완화음 단어 차이는 엔진이 준 result.transcriptDiff 만 쓴다 (없으면 강조하지 않음).
 */

/** 한국어 필드명 (호환용). 화면에서는 t.fields 를 쓴다 */
export const UNCERTAIN_FIELD_LABEL: Record<Uncertainty['field'], string> = ko.fields

/** [A / B] 또는 후보가 하나면 [A?] */
export function formatAlternatives(u: Pick<Uncertainty, 'alternatives'>): string {
  if (u.alternatives.length === 0) return '[?]'
  if (u.alternatives.length === 1) return `[${u.alternatives[0]}?]`
  return `[${u.alternatives.join(' / ')}]`
}

/** 판정 사유 문구. ASR_CONFUSABLE 은 해당 값에 ? 를 붙여 "인식이 불확실합니다. [HPNT?] 확인 필요" */
export function formatReason(code: ReasonCode, result: Pick<AnalysisResult, 'uncertainties'>, t: Messages = ko): string {
  if (code === 'ASR_CONFUSABLE') {
    const values = result.uncertainties.filter((u) => u.reason === 'ASR_CONFUSABLE').flatMap((u) => u.alternatives)
    return values.length ? t.confusable(values.map((v) => `[${v}?]`).join(' ')) : t.reasons[code]
  }
  return t.reasons[code]
}

/** 카드 머리 문구: 불명확은 사유에 따라 시안 표현(인식 결과 불일치 / 터미널 미확인 / 장소 후보 여러 개) */
export function headline(result: Pick<AnalysisResult, 'comparison'>, t: Messages = ko): string {
  const { kind, reasonCodes } = result.comparison
  if (kind !== 'ambiguous') return t.comparison[kind]
  if (reasonCodes.includes('ASR_DISAGREEMENT') || reasonCodes.includes('ASR_CONFUSABLE')) return t.headline.asrMismatch
  if (reasonCodes.includes('TERMINAL_MISSING')) return t.headline.terminalMissing
  if (reasonCodes.includes('MULTIPLE_CANDIDATES')) return t.headline.multiplePlaces
  return t.comparison.ambiguous
}

export type TranscriptToken =
  | { kind: 'text'; text: string }
  /** 원음/완화음이 다르게 들린 단어. enhanced 가 null 이면 원음에만 있는 단어 */
  | { kind: 'diff'; op: Exclude<WordDiff['op'], 'same'>; enhanced: string | null; raw: string | null; uncertain?: string }
  | { kind: 'uncertain'; text: string; field: Uncertainty['field'] }

/** 본문에 끼워 넣을 수 있는 불확실 값 (같은 문장에 장소가 실제로 여러 번 나오는 MULTIPLE_CANDIDATES 는 합치지 않는다) */
function inlineCandidates(result: AnalysisResult): Uncertainty[] {
  return result.uncertainties.filter((u) => u.reason !== 'MULTIPLE_CANDIDATES' && u.alternatives.length > 0)
}

/**
 * 표시할 자막 토큰. transcriptDiff 가 있으면 완화음 기준 단어열 + 차이 단어, 없으면 완화음(없으면 원음) 텍스트 그대로.
 * 불확실 값은 본문에서 처음 나오는 자리에 [A / B] 로 바꿔 넣는다.
 */
export function transcriptTokens(result: AnalysisResult): TranscriptToken[] {
  let tokens: TranscriptToken[]
  if (result.transcriptDiff?.length) {
    tokens = []
    result.transcriptDiff.forEach((d, i) => {
      if (i > 0) tokens.push({ kind: 'text', text: ' ' })
      if (d.op === 'same') tokens.push({ kind: 'text', text: d.enhanced ?? d.raw ?? '' })
      else tokens.push({ kind: 'diff', op: d.op, enhanced: d.enhanced, raw: d.raw })
    })
  } else {
    tokens = [{ kind: 'text', text: result.enhancedTranscript?.text ?? result.rawTranscript?.text ?? '' }]
  }

  for (const u of inlineCandidates(result)) {
    const marked = formatAlternatives(u)
    let placed = false
    tokens = tokens.flatMap((t): TranscriptToken[] => {
      if (placed) return [t]
      if (t.kind === 'diff' && t.enhanced && u.alternatives.some((a) => t.enhanced!.includes(a))) {
        placed = true
        return [{ ...t, uncertain: marked }]
      }
      if (t.kind !== 'text') return [t]
      const hit = u.alternatives.find((a) => t.text.includes(a))
      if (!hit) return [t]
      placed = true
      const at = t.text.indexOf(hit)
      return [
        { kind: 'text', text: t.text.slice(0, at) },
        { kind: 'uncertain', text: marked, field: u.field },
        { kind: 'text', text: t.text.slice(at + hit.length) },
      ].filter((x) => x.kind !== 'text' || x.text !== '') as TranscriptToken[]
    })
  }
  return tokens
}

/** 원음 줄: transcriptDiff 의 raw 쪽 단어, 다르게 들린 단어 표시 */
export function rawTokens(diff: WordDiff[]): { text: string; differs: boolean }[] {
  return diff.filter((d) => d.raw !== null).map((d) => ({ text: d.raw!, differs: d.op !== 'same' }))
}

export function diffCount(result: Pick<AnalysisResult, 'transcriptDiff'>): number {
  return result.transcriptDiff?.filter((d) => d.op !== 'same').length ?? 0
}

/** 일지·내보내기용 한 줄: 자막 + 불확실 후보 전부 "(확인 필요: 시각 [03:00 / 13:00] · 터미널 [HPNT?])" */
export function transcriptPlainText(result: AnalysisResult, t: Messages = ko): string {
  const body = transcriptTokens(result)
    .map((t) => (t.kind === 'text' ? t.text : t.kind === 'uncertain' ? t.text : (t.uncertain ?? t.enhanced ?? '')))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  const list = result.uncertainties.map((u) => `${t.fields[u.field]} ${formatAlternatives(u)}`)
  return list.length ? `${body} (${t.common.checkNeeded}: ${list.join(' · ')})` : body
}
