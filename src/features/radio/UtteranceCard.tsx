import type { AnalysisResult, ReviewState } from 'marinear-engine'
import { Link } from 'react-router-dom'
import { useApp } from '../../app/AppContext'
import { translationKey, type MessageEntry } from '../../app/state'
import { AUDIO_FLAG_LABEL, COMPARISON_HINT, STAGE_LABEL, formatMs, needsReview } from '../../contracts/labels'
import { extraEntities } from '../../engine/entities'
import { correctionInfo } from '../../engine/report'
import { formatReason } from '../../engine/transcript'
import { TranscriptNotes, TranscriptView } from './Transcript'
import { TranslationBlock } from './TranslationBlock'
import { Badge, ComparisonBadge, DemoBadge, ReviewBadge } from '../../ui/components'

/** 하위 호환: 자막 + 확인 필요 표시 */
export function TranscriptText({ result }: { result: AnalysisResult }) {
  return <TranscriptView result={result} />
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

/** 속력·침로·지시어·호출부호 칩 (null 이면 숨김) */
export function EntityChips({ result }: { result: AnalysisResult }) {
  const items = extraEntities(result.entities)
  if (items.length === 0) return null
  return (
    <div className="status-strip" aria-label="추출값">
      {items.map((it) => (
        <Badge key={it.key} tone="muted">
          {it.label} {it.value}
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
        <TranscriptView result={result} />
      </div>
      <TranscriptNotes result={result} />
      <EntityChips result={result} />
      <ResultFlags result={result} />

      {(kind !== 'match' || reasons.length > 0) && (
        <div className="small muted">
          {COMPARISON_HINT[kind]}
          {reasons.length > 0 && <> · {reasons.map((r) => formatReason(r, result)).join(', ')}</>}
        </div>
      )}

      {lang !== 'ko' && <TranslationBlock lang={lang} translation={translation} crossCheckPending={result.crossCheck === 'pending'} availability={availability} />}

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
