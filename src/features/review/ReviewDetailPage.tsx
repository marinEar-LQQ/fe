import type { AnalysisResult, AudioClip, AudioVariant, ReviewAction, ReviewState, TaskPatch } from 'marinear-engine'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../../app/AppContext'
import { useReviewQueue } from '../../app/useReviewQueue'
import { describeError, isStale } from '../../app/errors'
import { CATALOG, findTerminal } from '../../contracts/catalog'
import { formatClock, formatMs } from '../../contracts/labels'
import { extraEntities } from '../../engine/entities'
import { correctionInfo } from '../../engine/report'
import { formatAlternatives, formatReason, headline } from '../../engine/transcript'
import { useT } from '../../i18n'
import { Card, Choice, DemoBadge, EmptyState, IconCheck, IconPlay, KIND_MARK, Notice, PageHead, ReviewBadge, StatusLabel, StatusMark } from '../../ui/components'
import { EnhancedTranscriptLine, RawTranscriptLine, TranscriptNotes, TranscriptView } from '../radio/Transcript'
import { EntityChips, ResultFlags } from '../radio/UtteranceCard'
import { useUtterance } from './useUtterance'

/** 원음/완화음 구간 재생 (getAudioClip). 단어 위치가 검증되지 않았으면 발화 전체를 재생한다고 알린다 */
function AudioButton({ utteranceId, variant, label, wordAligned }: { utteranceId: string; variant: AudioVariant; label: string; wordAligned: boolean }) {
  const { engine } = useApp()
  const t = useT()
  const [msg, setMsg] = useState<string | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [range, setRange] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url])

  async function play() {
    let clip: AudioClip
    setBusy(true)
    try {
      clip = await engine.getAudioClip(utteranceId, variant)
    } catch (e) {
      return setMsg(t.clip.failed(describeError(e).message))
    } finally {
      setBusy(false)
    }
    if (clip.status !== 'available' || !clip.blob) {
      setUrl(null)
      setRange(null)
      return setMsg(t.clip[clip.status === 'available' ? 'missing' : clip.status])
    }
    setUrl(URL.createObjectURL(clip.blob))
    setRange(`${formatMs(clip.startMs)}–${formatMs(clip.endMs)}`)
    setMsg(wordAligned ? null : t.reviewDetail.wholeUtterance)
    setTimeout(() => audioRef.current?.play().catch(() => setMsg(t.reviewDetail.playFailed)), 0)
  }

  return (
    <div className="btn-stack">
      <button type="button" className="btn" onClick={() => void play()} disabled={busy}>
        <IconPlay />
        {label}
      </button>
      {url && <audio ref={audioRef} src={url} controls style={{ width: '100%' }} />}
      {url && range && <span className="time">{t.reviewDetail.range(range)}</span>}
      {msg && <span className="small muted">{msg}</span>}
    </div>
  )
}

const PLACE_REASONS = ['MULTIPLE_CANDIDATES', 'TERMINAL_MISSING', 'BERTH_MISSING', 'CATALOG_UNKNOWN', 'BERTH_NOT_IN_TERMINAL'] as const
const ASR_REASONS = ['ASR_DISAGREEMENT', 'ASR_CONFUSABLE'] as const

function terminalName(id: string | null | undefined): string | null {
  if (!id) return null
  return findTerminal(CATALOG, id)?.displayName ?? id
}

function berthName(terminalId: string | null | undefined, berthId: string | null | undefined): string | null {
  if (!berthId) return null
  return findTerminal(CATALOG, terminalId)?.berths.find((b) => b.berthId === berthId)?.label ?? berthId
}

/** 교신에서 들린 장소. 불확실하면 [A / B] (확정값처럼 보이지 않게) */
function heardPlace(result: AnalysisResult): { terminal: string | null; berth: string | null; uncertain: boolean } {
  const tu = result.uncertainties.find((u) => u.field === 'terminalId')
  const bu = result.uncertainties.find((u) => u.field === 'berthId')
  return {
    terminal: tu ? formatAlternatives(tu) : terminalName(result.entities.terminalId),
    berth: bu ? formatAlternatives(bu) : berthName(result.entities.terminalId, result.entities.berthId),
    uncertain: Boolean(tu || bu || !result.entities.terminalId),
  }
}

/** 03/04 재확인 상세 — 같은 화면에서 판정에 따라 장소 비교(03)·원음/완화음 비교(04) 칸을 보인다 (둘 다 해당하면 둘 다) */
export function ReviewDetailPage() {
  const { id } = useParams()
  // 다음 건으로 자동 이동하면 주소만 바뀐다 — 건마다 새 화면 상태(체크·완료 문구)로 시작하도록 key 를 준다
  return <ReviewDetail key={id} />
}

function ReviewDetail() {
  const { id } = useParams()
  const { state, review } = useApp()
  const t = useT()
  const navigate = useNavigate()
  const queue = useReviewQueue()
  const [advance, setAdvance] = useState<string | null>(null)
  const { entry, versions, events, storedReview, loading, loadError, reload } = useUtterance(id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [manual, setManual] = useState(false)
  const [patch, setPatch] = useState<{ terminalId: string; berthId: string | null }>({ terminalId: '', berthId: null })
  const requestIdRef = useRef<{ key: string; id: string } | null>(null)
  const [confirmed, setConfirmed] = useState(false)

  const back = { to: '/monitor', label: t.nav.monitor }
  if (loading && !entry) return <EmptyState title={t.common.loading} />
  if (loadError && !entry) return <Notice tone="danger">{t.reviewDetail.loadFailed(loadError)}</Notice>
  if (!entry || !entry.result)
    return (
      <>
        <PageHead back={back} title={t.reviewDetail.notFound} />
        <EmptyState
          title={t.reviewDetail.notFound}
          action={
            <Link className="btn" to="/reviews">
              {t.reviewList.title}
            </Link>
          }
        >
          {t.reviewDetail.notFoundHint}
        </EmptyState>
      </>
    )

  const { utterance, result } = entry
  const kind = result.comparison.kind
  const mark = KIND_MARK[kind]
  const reasons = result.comparison.reasonCodes
  const active = state.taskState.active
  const snapshot = versions.find((v) => v.version === utterance.taskVersion) ?? (active?.version === utterance.taskVersion ? active : undefined)
  const heard = heardPlace(result)
  const diffs = result.comparison.diffs
  const terminalDiffers = diffs.some((d) => d.field === 'terminalId')
  const berthDiffers = diffs.some((d) => d.field === 'berthId')
  const extras = extraEntities(result.entities, t)
  const correction = correctionInfo(result)
  const reviewStatus: ReviewState = state.reviewState[utterance.utteranceId] ?? storedReview
  const diffWords = result.transcriptDiff?.filter((d) => d.op !== 'same').length ?? 0

  // 어떤 칸을 보일지: 장소 비교(03) / 원음·완화음 비교(04)
  const showRecheck = diffWords > 0 || reasons.some((r) => (ASR_REASONS as readonly string[]).includes(r))
  const showCompare = kind !== 'ambiguous' || diffs.length > 0 || reasons.some((r) => (PLACE_REASONS as readonly string[]).includes(r)) || !showRecheck

  // 반영 규칙: 원음 교차 검사가 끝난 결과만 (엔진: UNCERTAIN_VALUE). 불확실 후보가 있으면 기본 반영값 없음
  const pending = result.crossCheck === 'pending'
  const notComplete = result.crossCheck !== 'complete'
  const hasUncertainty = result.uncertainties.length > 0
  const clearDifference = kind === 'difference' && !heard.uncertain && !hasUncertainty
  const effectivePatch: TaskPatch | null = manual ? patch : clearDifference ? { terminalId: result.entities.terminalId!, berthId: result.entities.berthId } : null
  const patchValid = Boolean(effectivePatch?.terminalId && effectivePatch.berthId)
  const canApply = !notComplete && confirmed && patchValid && Boolean(active) && reviewStatus !== 'applied'
  const manualTerminal = findTerminal(CATALOG, patch.terminalId)
  const expectedTaskVersion = active?.version ?? utterance.taskVersion

  // 제목: 장소 차이 / "A인가요, B인가요?" / 일반
  const terminalAlts = result.uncertainties.find((u) => u.field === 'terminalId')?.alternatives ?? []
  const title =
    kind === 'difference'
      ? t.reviewDetail.titleDifference
      : kind === 'ambiguous' && terminalAlts.length >= 2
        ? t.reviewDetail.titleChoice(terminalAlts[0]!, terminalAlts[1]!)
        : kind === 'ambiguous' && terminalAlts.length === 1
          ? t.reviewDetail.titleConfirm(terminalAlts[0]!)
          : kind === 'ambiguous'
            ? t.reviewDetail.titleAmbiguous
            : t.reviewDetail.titleOther

  /** 멱등 키: 같은 명령(행동·revision·기준·값)을 다시 보내면 같은 requestId 를 쓴다 */
  function requestIdFor(action: ReviewAction, p: TaskPatch | undefined): string {
    const key = JSON.stringify([utterance.utteranceId, action, result.revision, expectedTaskVersion, p ?? null])
    if (requestIdRef.current?.key !== key) requestIdRef.current = { key, id: crypto.randomUUID() }
    return requestIdRef.current.id
  }

  async function act(action: ReviewAction) {
    setBusy(true)
    setError(null)
    setDone(null)
    const p = action === 'apply' ? (effectivePatch ?? undefined) : undefined
    try {
      const ev = await review({
        requestId: requestIdFor(action, p),
        utteranceId: utterance.utteranceId,
        action,
        expectedTaskVersion,
        expectedResultRevision: result.revision,
        confirmedByUser: action === 'apply' ? confirmed : true,
        ...(p ? { patch: p } : {}),
      })
      setDone(action === 'apply' ? t.reviewDetail.doneApply(ev.taskVersionAfter) : action === 'dismiss' ? t.reviewDetail.doneDismiss : t.reviewDetail.doneReview)
      setManual(false)
      setConfirmed(false)
      // 흐름: 처리하면 다음 확인할 교신으로, 다 끝나면 교신 화면으로 (처리 결과 문구를 잠깐 보여 준 뒤)
      const next = queue.pendingIds.find((x) => x !== utterance.utteranceId)
      setAdvance(next ? t.flow.nextIn : t.flow.allDone)
      window.setTimeout(() => navigate(next ? `/reviews/${next}` : '/monitor'), 1400)
    } catch (e) {
      const { code, message } = describeError(e)
      // VERSION_CONFLICT / RESULT_STALE: 자동 재시도하지 않고 최신 기준·결과를 다시 불러와 보여준다
      setError(isStale(code) ? `${message} (${code}) — ${t.reviewDetail.stale}` : `${message} (${code})`)
      if (isStale(code)) reload()
      setConfirmed(false)
    } finally {
      setBusy(false)
    }
  }

  const confirmBox = (
    <label className="check-row">
      <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={notComplete || !patchValid} />
      {t.reviewDetail.confirmCheck}
    </label>
  )
  const applyButton = (variant: 'primary' | 'secondary') => (
    <button type="button" className={`btn block ${variant === 'primary' ? 'primary lg' : 'md'}`} disabled={busy || !canApply} onClick={() => void act('apply')}>
      {active ? t.reviewDetail.applyVersion(active.version, active.version + 1) : t.reviewDetail.apply}
    </button>
  )
  const applyBlockers = (
    <>
      {pending && <Notice tone="warn">{t.reviewDetail.pendingBlock}</Notice>}
      {!pending && notComplete && <Notice tone="warn">{t.reviewDetail.unavailableBlock}</Notice>}
      {!active && <Notice tone="warn">{t.reviewDetail.noTaskBlock}</Notice>}
    </>
  )
  const manualPicker = (
    <div className="form-grid">
      <div className="field">
        <span className="field-label">{t.task.terminal}</span>
        <div className="choice-grid">
          {CATALOG.terminals.map((x) => (
            <Choice key={x.terminalId} selected={patch.terminalId === x.terminalId} onClick={() => setPatch({ terminalId: x.terminalId, berthId: null })} code={x.displayName} />
          ))}
        </div>
      </div>
      {manualTerminal && (
        <div className="field">
          <span className="field-label">
            <span className="mono">{manualTerminal.displayName}</span> {t.task.berth}
          </span>
          <div className="choice-grid cols-4">
            {manualTerminal.berths.map((b) => (
              <Choice key={b.berthId} selected={patch.berthId === b.berthId} onClick={() => setPatch((p) => ({ ...p, berthId: b.berthId }))} code={b.label} />
            ))}
          </div>
        </div>
      )}
    </div>
  )

  return (
    <>
      <PageHead
        back={back}
        eyebrow={
          <StatusLabel tone={mark.tone} mark={mark.shape === 'circle' ? undefined : mark.shape}>
            {kind === 'ambiguous' ? t.reviewDetail.eyebrowRecheck : headline(result, t)}
          </StatusLabel>
        }
        title={title}
      />

      <div className="status-strip">
        <ReviewBadge status={reviewStatus} />
        {queue.pendingIds.length > 0 && <span className="badge warn">{t.flow.remaining(queue.pendingIds.length)}</span>}
        {pending && <span className="badge info">{t.card.provisional}</span>}
        {entry.fixture && <DemoBadge />}
        <span className="chip">r{result.revision}</span>
      </div>

      {/* 03 장소 비교 */}
      {showCompare && (
        <>
          <section className="card compare" aria-label={t.reviewDetail.compareLabel}>
            <div className="compare-grid">
              <div className="compare-cell">
                <span className="label">{t.reviewDetail.registered(utterance.taskVersion)}</span>
                <span className="value">{terminalName(snapshot?.terminalId) ?? t.common.none}</span>
                {snapshot?.berthId && <span className="value-sub">{berthName(snapshot.terminalId, snapshot.berthId)}</span>}
              </div>
              <div className={`compare-cell ${kind === 'difference' ? 'diff' : heard.uncertain ? 'amb' : ''}`}>
                <span className="label">{t.reviewDetail.heard}</span>
                <span className={`value ${terminalDiffers ? 'differs' : ''}`}>
                  {heard.terminal ? heard.terminal.startsWith('[') ? <span className="uncertain">{heard.terminal}</span> : heard.terminal : t.common.notMentioned}
                </span>
                {heard.berth && (
                  <span className={`value-sub ${berthDiffers ? 'differs' : ''}`}>{heard.berth.startsWith('[') ? <span className="uncertain">{heard.berth}</span> : heard.berth}</span>
                )}
              </div>
            </div>
            <div className="compare-foot small">
              {snapshot ? `${snapshot.ownVessel} → ${snapshot.targetVessel}` : t.reviewDetail.noTaskAtTime} · {t.reviewDetail.vesselHeard(result.entities.vessel ?? t.common.unconfirmed)}
            </div>
          </section>
          {terminalDiffers && !berthDiffers && heard.berth && <p style={{ fontSize: 'var(--fs-btn)', fontWeight: 600 }}>{t.reviewDetail.sameBerthOtherTerminal}</p>}
          {berthDiffers && !terminalDiffers && <p style={{ fontSize: 'var(--fs-btn)', fontWeight: 600 }}>{t.reviewDetail.otherBerthSameTerminal}</p>}
          {active && snapshot && active.version !== snapshot.version && <p className="small muted">{t.reviewDetail.currentDiffers(active.version, `${terminalName(active.terminalId) ?? ''} ${berthName(active.terminalId, active.berthId) ?? ''}`.trim())}</p>}
        </>
      )}

      {/* 04 원음 / 완화음 인식 결과 */}
      {showRecheck ? (
        <>
          <section className="card recheck-box">
            <span className="section-label">{t.reviewDetail.rawResult}</span>
            <p className="text" lang="ko">
              {pending ? <span className="muted">{t.reviewDetail.rawPending}</span> : <RawTranscriptLine result={result} />}
            </p>
          </section>
          <section className="card recheck-box">
            <span className="section-label">{t.reviewDetail.enhancedResult}</span>
            <p className="text" lang="ko">
              <EnhancedTranscriptLine result={result} />
            </p>
            <TranscriptNotes result={result} />
          </section>
          <div className="btn-grid">
            <AudioButton utteranceId={utterance.utteranceId} variant="raw" label={t.reviewDetail.rawClip} wordAligned={Boolean(result.rawTranscript?.wordAligned)} />
            <AudioButton utteranceId={utterance.utteranceId} variant="enhanced" label={t.reviewDetail.enhancedClip} wordAligned={Boolean(result.enhancedTranscript?.wordAligned)} />
          </div>
          <p className="small muted">{t.reviewDetail.sameNotGuaranteed}</p>
        </>
      ) : (
        /* 03 근거 교신 */
        <section className="card soft" aria-label={t.reviewDetail.evidence}>
          <span className="utt-meta">
            <b style={{ color: 'var(--ink)' }}>{result.entities.vessel ?? t.common.unconfirmed}</b>
            <span className="time">{formatClock(utterance.capturedAt)}</span>
          </span>
          <p lang="ko" style={{ fontSize: 'var(--fs-lg)', fontWeight: 500, lineHeight: 1.45 }}>
            “<TranscriptView result={result} highlight={kind === 'difference' ? diffs.map((d) => d.heardValue ?? '').filter(Boolean) : []} />”
          </p>
          <TranscriptNotes result={result} />
          <div>
            <AudioButton utteranceId={utterance.utteranceId} variant="raw" label={t.clip.listen} wordAligned={Boolean(result.rawTranscript?.wordAligned)} />
          </div>
        </section>
      )}

      <EntityChips result={result} />
      <ResultFlags result={result} />
      {correction && <p className="small">{correction.unclear ? t.reviewDetail.correctionUnclear : t.reviewDetail.correction(correction.negated.join(', '))}</p>}
      {result.audioFlags.length > 0 && (
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }} aria-label={t.card.flagsLabel}>
          {result.audioFlags.map((f) => (
            <li key={f}>
              {t.audioFlag[f]} — {t.audioFlagHint[f]}
            </li>
          ))}
        </ul>
      )}
      {reasons.length > 0 && <p className="small muted">{t.comparisonHint[kind]} · {reasons.map((r) => formatReason(r, result, t)).join(' · ')}</p>}

      {/* 확인 행동 */}
      <div className="no-print btn-stack">
        {error && <Notice tone="danger">{error}</Notice>}
        {done && (
          <Notice>
            {done}
            {advance && <div style={{ fontWeight: 600, marginTop: 4 }}>{advance}</div>}
          </Notice>
        )}

        {clearDifference && !manual ? (
          <>
            <button type="button" className="btn md block" disabled={busy} onClick={() => void act('review')}>
              {t.reviewDetail.reviewOnly}
            </button>
            {applyBlockers}
            <p className="small">
              {t.reviewDetail.applyTarget}{' '}
              <b className="mono">
                {terminalName(result.entities.terminalId)} {berthName(result.entities.terminalId, result.entities.berthId)}
              </b>
            </p>
            {confirmBox}
            {applyButton('primary')}
          </>
        ) : (
          <button type="button" className="btn primary lg block" disabled={busy} onClick={() => void act('review')}>
            <IconCheck />
            {t.reviewDetail.reviewOnly}
          </button>
        )}
        <button type="button" className="btn text" disabled={busy} onClick={() => void act('dismiss')}>
          {t.reviewDetail.dismiss}
        </button>

        {kind !== 'unrelated' && !(clearDifference && !manual) && (
          <section className="card soft" aria-label={t.reviewDetail.manualTitle}>
            <h2>{t.reviewDetail.manualTitle}</h2>
            <p className="small muted">{hasUncertainty ? t.reviewDetail.manualHintUncertain : t.reviewDetail.manualHint}</p>
            {applyBlockers}
            {manual ? (
              <>
                {manualPicker}
                {confirmBox}
                {applyButton('secondary')}
                <button type="button" className="btn text" onClick={() => setManual(false)}>
                  {t.common.cancel}
                </button>
              </>
            ) : (
              <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setManual(true)} disabled={notComplete}>
                {t.reviewDetail.manualOpen}
              </button>
            )}
          </section>
        )}
      </div>

      {extras.length > 0 && (
        <Card className="soft" label={t.card.entitiesLabel}>
          <h2>{t.card.entitiesLabel}</h2>
          <dl className="kv">
            {extras.map((it) => (
              <div key={it.key} style={{ display: 'contents' }}>
                <dt>{it.label}</dt>
                <dd>{it.value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {events.length > 0 && (
        <>
          <h2>{t.reviewDetail.history}</h2>
          <div className="timeline-rail">
            {events.map((e) => (
              <Card key={e.eventId} className="soft">
                <StatusMark className="mark" shape="circle" />
                <div className="utt-head">
                  <b>{t.review[e.action === 'apply' ? 'applied' : e.action === 'dismiss' ? 'dismissed' : 'reviewed']}</b>
                  <span className="time">{formatClock(e.at)}</span>
                </div>
                <p className="small muted">{e.action === 'apply' ? `v${e.taskVersionBefore} → v${e.taskVersionAfter}` : t.reviewDetail.noChange} · r{e.resultRevision}</p>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  )
}
