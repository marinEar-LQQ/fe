import { Link } from 'react-router-dom'
import { useApp } from '../../app/AppContext'
import { translationKey, type MessageEntry } from '../../app/state'
import { langLabel } from '../../contracts/lang'
import { COMPARISON_HINT, REASON_LABEL, TRANSLATION_STATUS_LABEL, formatMs, needsReview } from '../../contracts/labels'
import type { AnalysisResult, ReviewStatus } from '../../contracts/types'
import { Badge, ComparisonBadge, DemoBadge, ReviewBadge } from '../../ui/components'

/** 불확실 값은 [A / B] 로 강조해서 보여준다 */
export function TranscriptText({ result }: { result: AnalysisResult }) {
  const text = result.enhancedTranscript?.text ?? result.rawTranscript?.text ?? ''
  const unc = result.uncertainties.find((u) => u.alternatives.length > 1 && u.alternatives.some((a) => text.includes(a)))
  if (!unc) return <>{text}</>
  const hit = unc.alternatives.find((a) => text.includes(a))!
  const [before, ...rest] = text.split(hit)
  return (
    <>
      {before}
      <span className="uncertain" title="원음·완화음 인식이 서로 다릅니다">
        [{unc.alternatives.join(' / ')}]
      </span>
      {rest.join(hit)}
    </>
  )
}

export function UtteranceCard({ entry, showReviewLink = true, review: storedReview }: { entry: MessageEntry; showReviewLink?: boolean; review?: ReviewStatus }) {
  const { state } = useApp()
  const { utterance, result, partialText } = entry
  const lang = state.preferences.targetLang
  const review = state.reviewState[utterance.utteranceId] ?? storedReview ?? 'unreviewed'

  if (!result) {
    return (
      <article className="card utt partial" aria-label="잠정 자막">
        <div className="utt-meta">
          <span className="mono">{formatMs(utterance.startMs)}</span>
          <Badge tone="info">잠정 자막 · 분석 중</Badge>
          {utterance.isFixture && <DemoBadge />}
        </div>
        <div className="utt-text">{partialText}</div>
      </article>
    )
  }

  const kind = result.comparison?.kind ?? 'unknown'
  const translation = lang !== 'ko' ? state.translations[translationKey(utterance.utteranceId, result.revision, lang)] : undefined
  const reasons = result.comparison?.reasonCodes ?? []

  return (
    <article className={`card utt kind-${kind}`}>
      <div className="utt-meta">
        <span className="mono">{formatMs(utterance.startMs)}</span>
        <ComparisonBadge kind={kind} />
        {result.crossCheck === 'pending' && <Badge tone="info">원음 교차 검사 중</Badge>}
        {needsReview(kind) && <ReviewBadge status={review} />}
        {utterance.isFixture && <DemoBadge />}
        <span className="small" style={{ marginLeft: 'auto' }}>
          기준 v{utterance.taskVersion ?? '-'} · r{result.revision}
        </span>
      </div>

      <div className="utt-text" lang="ko">
        <TranscriptText result={result} />
      </div>

      {(kind !== 'match' || reasons.length > 0) && (
        <div className="small muted">
          {COMPARISON_HINT[kind]}
          {reasons.length > 0 && <> · {reasons.map((r) => REASON_LABEL[r]).join(', ')}</>}
        </div>
      )}

      {lang !== 'ko' && (
        <div className="utt-translation" lang={lang} aria-live="polite">
          <span className="lang-tag">
            {langLabel(lang)} · {translation ? TRANSLATION_STATUS_LABEL[translation.status] : TRANSLATION_STATUS_LABEL.loading}
          </span>
          {translation?.text ?? <span className="muted small">한국어 원문을 기준으로 확인하세요.</span>}
        </div>
      )}

      {showReviewLink && kind !== 'unrelated' && (
        <div className="btn-row">
          <Link className={`btn sm ${needsReview(kind) && review === 'unreviewed' ? 'primary' : ''}`} to={`/reviews/${utterance.utteranceId}`}>
            {needsReview(kind) ? '재확인하기' : '상세 보기'}
          </Link>
        </div>
      )}
    </article>
  )
}
