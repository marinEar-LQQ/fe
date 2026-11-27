import type { AnalysisResult, ReviewState } from 'marinear-engine'
import { Link, useLocation } from 'react-router-dom'
import { useApp } from '../../app/AppContext'
import { translationKey, type MessageEntry } from '../../app/state'
import { formatClock, needsReview } from '../../contracts/labels'
import { extraEntities } from '../../engine/entities'
import { correctionInfo } from '../../engine/report'
import { headline } from '../../engine/transcript'
import { useT } from '../../i18n'
import { Badge, DemoBadge, IconPlay, KIND_MARK, ReviewBadge, StatusLabel, StatusMark } from '../../ui/components'
import { TranscriptView } from './Transcript'
import { TranslationBlock } from './TranslationBlock'
import { useClipPlayer } from './useClipPlayer'

/** 정정 발화·입력 품질(audioFlags)을 색상이 아닌 텍스트 라벨로 표시 */
export function ResultFlags({ result }: { result: AnalysisResult }) {
  const t = useT()
  const correction = correctionInfo(result)
  if (!correction && result.audioFlags.length === 0) return null
  return (
    <div className="status-strip" aria-label={t.card.flagsLabel}>
      {correction &&
        (correction.unclear ? (
          <Badge tone="warn" title={t.card.correctionUnclearHint}>
            {t.card.correctionUnclear}
          </Badge>
        ) : (
          <Badge tone="info" title={t.card.correctionHint}>
            {t.card.correction(correction.negated.join(', '))}
          </Badge>
        ))}
      {result.audioFlags.map((f) => (
        <Badge key={f} tone="warn">
          {t.audioFlag[f]}
        </Badge>
      ))}
    </div>
  )
}

/** 속력·침로·지시어·호출부호 칩 (null 이면 숨김) */
export function EntityChips({ result }: { result: AnalysisResult }) {
  const t = useT()
  const items = extraEntities(result.entities, t)
  if (items.length === 0) return null
  return (
    <div className="status-strip" aria-label={t.card.entitiesLabel}>
      {items.map((it) => (
        <Badge key={it.key} tone="muted">
          {it.label} {it.value}
        </Badge>
      ))}
    </div>
  )
}

/** 기준과 다르게 들린 값 (02 시안의 강조 'HPNT T3') */
export function heardDiffValues(result: AnalysisResult): string[] {
  return result.comparison.diffs.map((d) => d.heardValue).filter((v): v is string => Boolean(v))
}

/** 02 교신 카드: 왼쪽 타임라인 표식 + 상태 라벨·시각 + 한국어 원문 + (번역) + 행동 */
export function UtteranceCard({ entry, review: storedReview }: { entry: MessageEntry; review?: ReviewState }) {
  const { state } = useApp()
  const t = useT()
  const player = useClipPlayer()
  const { pathname } = useLocation()
  const { utterance, result, partialText, stage } = entry
  const lang = state.preferences.targetLang
  const review = state.reviewState[utterance.utteranceId] ?? storedReview ?? 'unreviewed'
  const time = formatClock(utterance.capturedAt)

  if (!result) {
    // 잠정 자막 / 분석 중 / 실패
    return (
      <article className="card soft utt partial" aria-label={t.card.partialLabel}>
        <StatusMark className="mark" shape={stage === 'failed' ? 'triangle' : 'circle'} />
        <div className="utt-head">
          <StatusLabel tone={stage === 'failed' ? 'alert' : 'plain'}>{stage ? t.stage[stage] : t.stage.queued}</StatusLabel>
          <span className="time">{time}</span>
        </div>
        {partialText ? (
          <>
            <p className="utt-text" lang="ko">
              {partialText}
            </p>
            <p className="small muted">{t.card.partialHint}</p>
          </>
        ) : (
          <p className="small muted">{stage === 'failed' ? t.card.failedHint : t.card.analyzing}</p>
        )}
        {entry.fixture && (
          <div className="status-strip">
            <DemoBadge />
          </div>
        )}
      </article>
    )
  }

  const kind = result.comparison.kind
  const mark = KIND_MARK[kind]
  const attention = needsReview(kind)
  const translation = lang !== 'ko' ? state.translations[translationKey(utterance.utteranceId, result.revision, lang)] : undefined
  const availability = state.engineState.readiness?.languages[lang]
  const playMsg = player.msgFor(utterance.utteranceId)

  return (
    <article className={`card utt ${attention ? '' : 'soft'}`}>
      <StatusMark className="mark" shape={mark.shape} />
      <div className="utt-head">
        <StatusLabel tone={mark.tone}>{headline(result, t)}</StatusLabel>
        <span className="time">{time}</span>
      </div>

      <p className="utt-text" lang="ko">
        <TranscriptView result={result} highlight={kind === 'difference' ? heardDiffValues(result) : []} />
      </p>
      <EntityChips result={result} />
      <ResultFlags result={result} />

      <div className="status-strip">
        {result.crossCheck === 'pending' && <Badge tone="info">{stage && stage !== 'done' ? t.stage[stage] : t.card.crossChecking}</Badge>}
        {result.crossCheck === 'pending' && <Badge tone="muted">{t.card.provisional}</Badge>}
        {result.crossCheck === 'unavailable' && <Badge tone="warn">{t.card.crossCheckUnavailable}</Badge>}
        {attention && <ReviewBadge status={review} />}
        {entry.fixture && <DemoBadge />}
      </div>

      {lang !== 'ko' && <TranslationBlock lang={lang} translation={translation} crossCheckPending={result.crossCheck === 'pending'} availability={availability} />}

      {kind === 'ambiguous' && (
        <div className="btn-grid" style={{ marginTop: 2 }}>
          <button type="button" className="btn sm" onClick={() => void (player.playing === utterance.utteranceId ? player.stop() : player.play(utterance.utteranceId, 'raw'))}>
            <IconPlay />
            {player.playing === utterance.utteranceId ? '■' : t.report.listenRaw}
          </button>
          <Link className={`btn sm ${review === 'unreviewed' ? 'alert' : ''}`} to={`/reviews/${utterance.utteranceId}`} state={{ from: pathname }}>
            {review === 'unreviewed' ? t.card.recheck : t.card.details}
          </Link>
        </div>
      )}
      {kind === 'difference' && (
        // 확인이 필요한 교신(장소 차이)도 카드에서 바로 원음을 들어 볼 수 있게
        <div className="btn-grid" style={{ marginTop: 2 }}>
          <button type="button" className="btn sm" onClick={() => void (player.playing === utterance.utteranceId ? player.stop() : player.play(utterance.utteranceId, 'raw'))}>
            <IconPlay />
            {player.playing === utterance.utteranceId ? '■' : t.report.listenRaw}
          </button>
          <Link className={`btn sm ${review === 'unreviewed' ? 'alert' : ''}`} to={`/reviews/${utterance.utteranceId}`} state={{ from: pathname }}>
            {review === 'unreviewed' ? t.card.compare : t.card.details}
          </Link>
        </div>
      )}
      {kind === 'unknown' && (
        <Link className="link-row" to={`/reviews/${utterance.utteranceId}`} state={{ from: pathname }}>
          {t.card.details}
          <span aria-hidden="true">→</span>
        </Link>
      )}
      {playMsg && <p className="small muted">{playMsg}</p>}
    </article>
  )
}
