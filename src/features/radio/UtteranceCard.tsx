import type { AnalysisResult, ReviewState } from 'marinear-engine'
import { Link } from 'react-router-dom'
import { useApp } from '../../app/AppContext'
import { translationKey, type MessageEntry } from '../../app/state'
import { langLabel } from '../../contracts/lang'
import { AUDIO_FLAG_LABEL, COMPARISON_HINT, LANG_AVAILABILITY_LABEL, REASON_LABEL, STAGE_LABEL, TRANSLATION_STATUS_LABEL, formatMs, needsReview } from '../../contracts/labels'
import { correctionInfo } from '../../engine/report'
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

/** 정정 발화·입력 품질(audioFlags)을 색상이 아닌 텍스트 라벨로 표시 */
export function ResultFlags({ result }: { result: AnalysisResult }) {
  const correction = correctionInfo(result)
  if (!correction && result.audioFlags.length === 0) return null
  return (
    <div className="status-strip" aria-label="정정·음질 표시">
      {correction &&
        (correction.unclear ? (
          <Badge tone="warn" title="정정 내용이 불명확해 자동으로 판단하지 않았습니다">정정 불명확</Badge>
        ) : (
          <Badge tone="info" title="정정 전 표현은 판정에 쓰지 않았습니다">정정 발화 · {correction.negated.join(', ')} 취소</Badge>
        ))}
      {result.audioFlags.map((f) => (
        <Badge key={f} tone="warn">
          {AUDIO_FLAG_LABEL[f]}
        </Badge>
      ))}
    </div>
  )
}

export function UtteranceCard({ entry, showReviewLink = true, review: storedReview }: { entry: MessageEntry; showReviewLink?: boolean; review?: ReviewState }) {
  const { state } = useApp()
  const { utterance, result, partialText, stage } = entry
  const lang = state.preferences.targetLang
  const review = state.reviewState[utterance.utteranceId] ?? storedReview ?? 'unreviewed'

  if (!result) {
    return (
      <article className="card utt partial" aria-label="잠정 자막">
        <div className="utt-meta">
          <span className="mono">{formatMs(utterance.startMs)}</span>
          <Badge tone={stage === 'failed' ? 'danger' : 'info'}>{stage ? STAGE_LABEL[stage] : '분석 대기'}</Badge>
          {entry.fixture && <DemoBadge />}
        </div>
        {partialText ? (
          <div className="utt-text">
            {partialText}
            <div className="small muted">잠정 자막 — 검토·반영에 쓰지 않습니다.</div>
          </div>
        ) : (
          <div className="small muted">{stage === 'failed' ? '이 발화는 분석하지 못했습니다. 원음은 보존되어 있습니다.' : '발화를 분석하고 있습니다…'}</div>
        )}
      </article>
    )
  }

  const kind = result.comparison.kind
  const translation = lang !== 'ko' ? state.translations[translationKey(utterance.utteranceId, result.revision, lang)] : undefined
  const availability = state.engineState.readiness?.languages[lang]
  const reasons = result.comparison.reasonCodes

  return (
    <article className={`card utt kind-${kind}`}>
      <div className="utt-meta">
        <span className="mono">{formatMs(utterance.startMs)}</span>
        <ComparisonBadge kind={kind} />
        {result.crossCheck === 'pending' && <Badge tone="info">{stage && stage !== 'done' ? STAGE_LABEL[stage] : '원음 교차 검사 중'}</Badge>}
        {result.crossCheck === 'unavailable' && <Badge tone="warn">원음 교차 검사 못 함</Badge>}
        {needsReview(kind) && <ReviewBadge status={review} />}
        {entry.fixture && <DemoBadge />}
        <span className="small" style={{ marginLeft: 'auto' }}>
          기준 v{utterance.taskVersion} · r{result.revision}
          {result.crossCheck === 'pending' ? ' · 잠정 판정' : ''}
        </span>
      </div>

      <div className="utt-text" lang="ko">
        <TranscriptText result={result} />
      </div>
      <ResultFlags result={result} />

      {(kind !== 'match' || reasons.length > 0) && (
        <div className="small muted">
          {COMPARISON_HINT[kind]}
          {reasons.length > 0 && <> · {reasons.map((r) => REASON_LABEL[r]).join(', ')}</>}
        </div>
      )}

      {lang !== 'ko' && (
        <div className="utt-translation" lang={lang} aria-live="polite">
          <span className="lang-tag">
            {langLabel(lang)} ·{' '}
            {translation
              ? TRANSLATION_STATUS_LABEL[translation.status]
              : availability && availability !== 'ready'
                ? LANG_AVAILABILITY_LABEL[availability]
                : result.crossCheck === 'pending'
                  ? '원음 교차 검사 후 번역'
                  : TRANSLATION_STATUS_LABEL.pending}
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
