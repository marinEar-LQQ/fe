import type { AnalysisResult } from 'marinear-engine'
import { useState } from 'react'
import { diffCount, formatAlternatives, rawTokens, transcriptTokens, UNCERTAIN_FIELD_LABEL } from '../../engine/transcript'

/**
 * 완화음 자막. 원음과 다르게 들린 단어는 밑줄 + "확인" 표시(색만으로 구분하지 않음).
 * 원음 단어는 마우스를 올리면 툴팁, 터치 기기에서는 탭하면 바로 옆에 보인다.
 */
export function TranscriptView({ result }: { result: AnalysisResult }) {
  const [open, setOpen] = useState<number | null>(null)
  const tokens = transcriptTokens(result)
  return (
    <>
      {tokens.map((t, i) => {
        if (t.kind === 'text') return <span key={i}>{t.text}</span>
        if (t.kind === 'uncertain')
          return (
            <span key={i} className="uncertain" title={`${UNCERTAIN_FIELD_LABEL[t.field]} 후보 — 확정값이 아닙니다`}>
              {t.text}
            </span>
          )
        const rawText = t.raw ?? '(원음에는 없음)'
        const shown = t.uncertain ?? t.enhanced ?? '[빠진 단어]'
        return (
          <span key={i} className="diff-word-wrap">
            <button
              type="button"
              className={`diff-word ${t.op}`}
              title={`원음: ${rawText}`}
              aria-expanded={open === i}
              aria-label={`${shown} — 원음과 다르게 들림, 확인 필요. 원음: ${rawText}`}
              onClick={() => setOpen(open === i ? null : i)}
            >
              {shown}
              <sup className="diff-tag" aria-hidden="true">
                확인
              </sup>
            </button>
            {open === i && (
              <span className="diff-pop" role="note">
                원음: {rawText}
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
  const n = diffCount(result)
  if (n === 0 && result.uncertainties.length === 0) return null
  return (
    <div className="small" aria-label="확인 필요">
      {n > 0 && (
        <span className="badge warn" style={{ marginRight: 6 }}>
          원음과 다르게 들린 단어 {n}곳 · 확인 필요
        </span>
      )}
      {result.uncertainties.length > 0 && (
        <span>
          <b>확인 필요:</b>{' '}
          {result.uncertainties.map((u, i) => (
            <span key={i}>
              {i > 0 && ' · '}
              {UNCERTAIN_FIELD_LABEL[u.field]} <span className="uncertain">{formatAlternatives(u)}</span>
            </span>
          ))}
        </span>
      )}
    </div>
  )
}

/** 재확인 상세의 원음 줄. transcriptDiff 가 있을 때만 차이 단어를 표시하고, 없으면 강조 없이 원문 그대로 */
export function RawTranscriptLine({ result }: { result: AnalysisResult }) {
  if (!result.transcriptDiff?.length) return <>{result.rawTranscript?.text || '—'}</>
  return (
    <>
      {rawTokens(result.transcriptDiff).map((w, i) => (
        <span key={i}>
          {i > 0 && ' '}
          {w.differs ? (
            <mark className="diff-mark" title="완화음과 다르게 들린 단어">
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
