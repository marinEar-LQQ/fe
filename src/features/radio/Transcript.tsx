import type { AnalysisResult } from 'marinear-engine'
import { Fragment, useState, type ReactNode } from 'react'
import { diffCount, formatAlternatives, rawTokens, transcriptTokens } from '../../engine/transcript'
import { useT } from '../../i18n'

const escapeRe = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 글자 안의 강조할 값(기준과 다르게 들린 장소 등)을 시안의 연분홍 배경으로 */
function withHighlights(text: string, terms: string[]): ReactNode {
  const list = terms.filter(Boolean)
  if (!list.length) return text
  const re = new RegExp(`(${list.map(escapeRe).join('|')})`, 'g')
  return text.split(re).map((part, i) =>
    list.includes(part) ? (
      <mark key={i} className="hl-diff">
        {part}
      </mark>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )
}

/**
 * 완화음 자막. 원음과 다르게 들린 단어는 밑줄 + "확인" 표시(색만으로 구분하지 않음).
 * 원음 단어는 마우스를 올리면 툴팁, 터치 기기에서는 탭하면 바로 옆에 보인다.
 * highlight: 기준과 다르게 들린 값(comparison.diffs 의 heardValue) — 시안 02 의 'HPNT T3' 강조
 */
export function TranscriptView({ result, highlight = [] }: { result: AnalysisResult; highlight?: string[] }) {
  const t = useT()
  const [open, setOpen] = useState<number | null>(null)
  const tokens = transcriptTokens(result)
  return (
    <>
      {tokens.map((tok, i) => {
        if (tok.kind === 'text') return <Fragment key={i}>{withHighlights(tok.text, highlight)}</Fragment>
        if (tok.kind === 'uncertain')
          return (
            <span key={i} className="uncertain" title={t.transcript.candidateTitle(t.fields[tok.field])}>
              {tok.text}
            </span>
          )
        const rawText = tok.raw ?? t.transcript.notInRaw
        const shown = tok.uncertain ?? tok.enhanced ?? t.transcript.missingWord
        return (
          <span key={i} className="diff-word-wrap">
            <button
              type="button"
              className={`diff-word ${tok.op}`}
              title={`${t.transcript.raw}: ${rawText}`}
              aria-expanded={open === i}
              aria-label={t.transcript.diffAria(shown, rawText)}
              onClick={() => setOpen(open === i ? null : i)}
            >
              {shown}
              <sup className="diff-tag" aria-hidden="true">
                {t.transcript.checkTag}
              </sup>
            </button>
            {open === i && (
              <span className="diff-pop" role="note">
                {t.transcript.raw}: {rawText}
              </span>
            )}
          </span>
        )
      })}
    </>
  )
}

/** 자막 아래: 인식 차이 개수 + 불확실 후보 전부 */
export function TranscriptNotes({ result }: { result: AnalysisResult }) {
  const t = useT()
  const n = diffCount(result)
  if (n === 0 && result.uncertainties.length === 0) return null
  return (
    <div className="status-strip small" aria-label={t.common.checkNeeded}>
      {n > 0 && <span className="badge warn">{t.transcript.diffCount(n)}</span>}
      {result.uncertainties.length > 0 && (
        <span>
          <b>{t.common.checkNeeded}:</b>{' '}
          {result.uncertainties.map((u, i) => (
            <span key={i}>
              {i > 0 && ' · '}
              {t.fields[u.field]} <span className="uncertain">{formatAlternatives(u)}</span>
            </span>
          ))}
        </span>
      )}
    </div>
  )
}

/** 재확인 상세의 원음 줄. transcriptDiff 가 있을 때만 차이 단어를 표시하고, 없으면 강조 없이 원문 그대로 */
export function RawTranscriptLine({ result }: { result: AnalysisResult }) {
  const t = useT()
  if (!result.transcriptDiff?.length) return <>{result.rawTranscript?.text || '—'}</>
  return (
    <>
      {rawTokens(result.transcriptDiff).map((w, i) => (
        <span key={i}>
          {i > 0 && ' '}
          {w.differs ? (
            <mark className="diff-mark" title={t.transcript.differsFromEnhanced}>
              {w.text}
            </mark>
          ) : (
            w.text
          )}
        </span>
      ))}
    </>
  )
}

/** 재확인 상세의 완화음 줄 (transcriptDiff 없으면 강조 없이) */
export function EnhancedTranscriptLine({ result }: { result: AnalysisResult }) {
  if (!result.transcriptDiff?.length) return <>{result.enhancedTranscript?.text || '—'}</>
  return <TranscriptView result={result} />
}
