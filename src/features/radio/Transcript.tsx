import type { AnalysisResult } from 'marinear-engine'
import { Fragment, useState, type ReactNode } from 'react'
import { diffCount, formatAlternatives, rawTokens, transcriptTokens } from '../../engine/transcript'
import { useT } from '../../i18n'
import { IconPlay } from '../../ui/components'
import { useClipPlayer, type ClipRange } from './useClipPlayer'

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
  const player = useClipPlayer()
  const [open, setOpen] = useState<number | null>(null)
  const tokens = transcriptTokens(result)
  // 단어 시각 정보가 없으므로 글자 위치 비율로 구간을 어림한다 (재생 때 앞뒤 여유를 둔다)
  const lens = tokens.map((tok) => (tok.kind === 'text' ? tok.text : tok.kind === 'diff' ? (tok.enhanced ?? tok.raw ?? '') : tok.text.replace(/[[\]?]/g, '').split(' / ')[0]!).length)
  const total = Math.max(1, lens.reduce((a, b) => a + b, 0))
  const rangeOf = (i: number): ClipRange => {
    const before = lens.slice(0, i).reduce((a, b) => a + b, 0)
    return { from: before / total, to: (before + lens[i]!) / total }
  }
  /** 그 단어 구간의 원음만 듣기 */
  const partButton = (i: number) => {
    const key = `${result.utteranceId}#${i}`
    return (
      <>
        <button type="button" className="btn sm part-play" onClick={() => void (player.playing === key ? player.stop() : player.play(result.utteranceId, 'raw', { key, range: rangeOf(i) }))}>
          <IconPlay />
          {player.playing === key ? '■' : t.transcript.playPart}
        </button>
        {player.msgFor(key) && <span className="small muted"> {player.msgFor(key)}</span>}
      </>
    )
  }
  return (
    <>
      {tokens.map((tok, i) => {
        if (tok.kind === 'text') return <Fragment key={i}>{withHighlights(tok.text, highlight)}</Fragment>
        if (tok.kind === 'uncertain')
          return (
            <span key={i} className="diff-word-wrap">
              <button type="button" className="uncertain uncertain-btn" title={t.transcript.candidateTitle(t.fields[tok.field])} aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                {tok.text}
              </button>
              {open === i && (
                <span className="diff-pop" role="note">
                  {partButton(i)}
                </span>
              )}
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
                {t.transcript.raw}: {rawText} {partButton(i)}
              </span>
            )}
          </span>
        )
      })}
    </>
  )
}

/** 자막 아래: 인식 차이 개수 + 불확실 후보 전부 */
/** soft: 재확인 목록에 들어가지 않는 교신(내 작업과 무관) — "확인 필요" 대신 "불확실"로 낮춰 적는다 */
export function TranscriptNotes({ result, soft = false }: { result: AnalysisResult; soft?: boolean }) {
  const t = useT()
  const n = diffCount(result)
  if (n === 0 && result.uncertainties.length === 0) return null
  return (
    <div className="status-strip small" aria-label={t.common.checkNeeded}>
      {n > 0 && <span className="badge warn">{t.transcript.diffCount(n)}</span>}
      {result.uncertainties.length > 0 && (
        <span>
          <b>{soft ? t.common.unsure : t.common.checkNeeded}:</b>{' '}
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
