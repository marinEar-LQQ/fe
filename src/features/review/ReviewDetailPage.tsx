import type { AnalysisResult, AudioClip, AudioVariant, ReviewAction, ReviewState, TaskPatch } from 'marinear-engine'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../../app/AppContext'
import { useReviewQueue } from '../../app/useReviewQueue'
import { describeError, isStale } from '../../app/errors'
import { CATALOG, findTerminal } from '../../contracts/catalog'
import { formatClock } from '../../contracts/labels'
import { correctionInfo } from '../../engine/report'
import { formatAlternatives, headline } from '../../engine/transcript'
import { useT } from '../../i18n'
import { DemoBadge, EmptyState, IconCheck, IconPlay, KIND_MARK, Notice, PageHead, ReviewBadge, StatusLabel } from '../../ui/components'
import { claimPlayback, releasePlayback } from '../../audio/exclusive'
import { EnhancedTranscriptLine, RawTranscriptLine, TranscriptNotes, TranscriptView } from '../radio/Transcript'
import { EntityChips, ResultFlags } from '../radio/UtteranceCard'
import { useUtterance } from './useUtterance'

/** 원음/완화음 재생 (getAudioClip). 음성이 없으면 사유만 알린다 */
function AudioButton({ utteranceId, variant, label }: { utteranceId: string; variant: AudioVariant; label: string }) {
  const { engine } = useApp()
  const t = useT()
  const [msg, setMsg] = useState<string | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  // 한 번에 하나만 재생: 이 재생기가 시작되면 다른 재생기를 멈추고, 다른 곳이 시작하면 이쪽이 멈춘다
  const pauseSelf = useCallback(() => audioRef.current?.pause(), [])
  useEffect(() => () => releasePlayback(pauseSelf), [pauseSelf])

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
      return setMsg(t.clip[clip.status === 'available' ? 'missing' : clip.status])
    }
    setUrl(URL.createObjectURL(clip.blob))
    setMsg(null)
    setTimeout(() => audioRef.current?.play().catch(() => setMsg(t.reviewDetail.playFailed)), 0)
  }

  return (
    <div className="btn-stack">
      <button type="button" className="btn" onClick={() => void play()} disabled={busy}>
        <IconPlay />
        {label}
      </button>
      {url && <audio ref={audioRef} src={url} controls onPlay={() => claimPlayback(pauseSelf)} style={{ width: '100%' }} />}
      {msg && <span className="small muted">{msg}</span>}
    </div>
  )
}

/** 사용자가 고른 답: 등록한 장소가 맞음(keep) 또는 교신에서 들린 장소로 바꾸기(change) */
type Pick = { kind: 'keep' } | { kind: 'change'; terminalId: string; berthId: string }

/** 교신에서 들린 장소 후보 (불확실하면 후보 조합 전부, 카탈로그에 있는 터미널·선석만, 최대 4개) */
function heardOptions(result: AnalysisResult): { terminalId: string; berthId: string }[] {
  const tu = result.uncertainties.find((u) => u.field === 'terminalId')
  const bu = result.uncertainties.find((u) => u.field === 'berthId')
  const tIds = tu ? tu.alternatives : result.entities.terminalId ? [result.entities.terminalId] : []
  const bIds = bu ? bu.alternatives : result.entities.berthId ? [result.entities.berthId] : []
  const out: { terminalId: string; berthId: string }[] = []
  for (const terminalId of tIds)
    for (const berthId of bIds) if (findTerminal(CATALOG, terminalId)?.berths.some((b) => b.berthId === berthId)) out.push({ terminalId, berthId })
  return out.slice(0, 4)
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
  const { entry, versions, storedReview, loading, loadError, reload } = useUtterance(id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [pick, setPick] = useState<Pick | null>(null)
  const requestIdRef = useRef<{ key: string; id: string } | null>(null)

  // 들어온 곳(교신 / 재확인 목록 / 일지)으로 돌아간다. 모르면 교신
  const from = (useLocation().state as { from?: string } | null)?.from
  const origin = from === '/report' || from === '/reviews' ? from : '/monitor'
  const back = { to: origin, label: origin === '/report' ? t.nav.report : origin === '/reviews' ? t.nav.reviews : t.nav.monitor }
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
  const correction = correctionInfo(result)
  const reviewStatus: ReviewState = state.reviewState[utterance.utteranceId] ?? storedReview
  const diffWords = result.transcriptDiff?.filter((d) => d.op !== 'same').length ?? 0

  // 어떤 칸을 보일지: 장소 비교(03) / 원음·완화음 비교(04)
  const showRecheck = diffWords > 0 || reasons.some((r) => (ASR_REASONS as readonly string[]).includes(r))
  // 장소 후보가 들렸으면(한쪽 인식에만 들려도) 비교 칸을 보여 사용자가 맞는 쪽을 고르게 한다
  // 실측: "신선대부두 3번"이 원음에만 들리고 완화음은 "부도"로 적혀 인식 불일치로만 판정 → 고를 곳이 없었음
  const showCompare = kind !== 'ambiguous' || diffs.length > 0 || reasons.some((r) => (PLACE_REASONS as readonly string[]).includes(r)) || !showRecheck || heardOptions(result).length > 0

  // 반영 규칙: 원음 교차 검사가 끝난 결과만 (엔진: UNCERTAIN_VALUE)
  const pending = result.crossCheck === 'pending'
  const notComplete = result.crossCheck !== 'complete'
  const expectedTaskVersion = active?.version ?? utterance.taskVersion
  // 교신 장소 후보 중 지금 등록한 장소와 다른 것만 "바꾸기" 선택지로
  const options = heardOptions(result).filter((o) => !(o.terminalId === snapshot?.terminalId && o.berthId === snapshot?.berthId))
  const canChange = !notComplete && Boolean(active) && reviewStatus !== 'applied'
  const single = options.length === 1 && !heard.uncertain ? options[0]! : null
  // 비교 칸이 없는 교신(인식 차이만)은 고를 것이 없으니 바로 저장(확인 완료)
  const effectivePick: Pick | null = showCompare ? pick : { kind: 'keep' }
  const picked = (o: { terminalId: string; berthId: string }) => pick?.kind === 'change' && pick.terminalId === o.terminalId && pick.berthId === o.berthId
  const placeLabel = (terminalId: string, berthId: string) => `${terminalName(terminalId) ?? terminalId} ${berthName(terminalId, berthId) ?? berthId}`

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

  /** 저장하기: 고른 답에 따라 확인(review) 또는 기록 변경(apply). 사용자가 직접 고른 것이 확인 절차다 */
  async function save() {
    if (!effectivePick) return
    const action: ReviewAction = effectivePick.kind === 'change' ? 'apply' : 'review'
    const p: TaskPatch | undefined = effectivePick.kind === 'change' ? { terminalId: effectivePick.terminalId, berthId: effectivePick.berthId } : undefined
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      await review({
        requestId: requestIdFor(action, p),
        utteranceId: utterance.utteranceId,
        action,
        expectedTaskVersion,
        expectedResultRevision: result.revision,
        confirmedByUser: true,
        ...(p ? { patch: p } : {}),
      })
      setDone(effectivePick.kind === 'change' ? t.reviewDetail.savedChange(placeLabel(effectivePick.terminalId, effectivePick.berthId)) : t.reviewDetail.savedKeep)
      // 흐름: 처리하면 다음 확인할 교신으로, 다 끝나면 교신 화면으로 (처리 결과 문구를 잠깐 보여 준 뒤)
      const next = queue.pendingIds.find((x) => x !== utterance.utteranceId)
      setAdvance(next ? t.flow.nextIn : t.flow.allDone)
      // 다음 건으로 갈 때도 출처를 넘긴다. 반영(apply)하고 교신으로 돌아가면 기준 칸에 "방금 변경" 표시
      window.setTimeout(
        () => (next ? navigate(`/reviews/${next}`, { state: { from: origin } }) : navigate(origin, action === 'apply' && origin === '/monitor' ? { state: { flash: 'changed' } } : undefined)),
        1400,
      )
    } catch (e) {
      const { code, message } = describeError(e)
      // VERSION_CONFLICT / RESULT_STALE: 자동 재시도하지 않고 최신 기준·결과를 다시 불러와 보여준다
      setError(isStale(code) ? `${message} (${code}) — ${t.reviewDetail.stale}` : `${message} (${code})`)
      if (isStale(code)) reload()
      setPick(null)
    } finally {
      setBusy(false)
    }
  }

  const longName = (s: string | null | undefined) => (s?.length ?? 0) > 4

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
          <span className="section-label">{t.reviewDetail.chooseCorrect}</span>
          <section className="card compare" aria-label={t.reviewDetail.compareLabel}>
            {/* 두 칸이 곧 선택지: 왼쪽 = 등록한 장소가 맞음, 오른쪽 = 교신 장소로 바꾸기 */}
            <div className="compare-grid" role="radiogroup" aria-label={t.reviewDetail.chooseCorrect}>
              <button type="button" role="radio" aria-checked={pick?.kind === 'keep'} className={`compare-cell pickable ${pick?.kind === 'keep' ? 'picked' : ''}`} onClick={() => setPick({ kind: 'keep' })} disabled={busy || Boolean(done)}>
                <span className="label">{t.reviewDetail.registered(utterance.taskVersion)}</span>
                <span className={`value ${longName(terminalName(snapshot?.terminalId)) ? 'long' : ''}`}>{terminalName(snapshot?.terminalId) ?? t.common.none}</span>
                {snapshot?.berthId && <span className="value-sub">{berthName(snapshot.terminalId, snapshot.berthId)}</span>}
                <span className="pick-hint">{pick?.kind === 'keep' ? '✓ ' : ''}{t.reviewDetail.pickKeep}</span>
              </button>
              {single ? (
                <button type="button" role="radio" aria-checked={picked(single)} className={`compare-cell pickable ${kind === 'difference' ? 'diff' : ''} ${picked(single) ? 'picked' : ''}`} onClick={() => setPick({ kind: 'change', ...single })} disabled={busy || Boolean(done) || !canChange}>
                  <span className="label">{t.reviewDetail.heard}</span>
                  <span className={`value ${terminalDiffers ? 'differs' : ''} ${longName(heard.terminal) ? 'long' : ''}`}>{heard.terminal}</span>
                  {heard.berth && <span className={`value-sub ${berthDiffers ? 'differs' : ''}`}>{heard.berth}</span>}
                  <span className="pick-hint">{picked(single) ? '✓ ' : ''}{t.reviewDetail.pickChange}</span>
                </button>
              ) : (
                <div className={`compare-cell ${kind === 'difference' ? 'diff' : heard.uncertain ? 'amb' : ''}`}>
                  <span className="label">{t.reviewDetail.heard}</span>
                  <span className={`value ${terminalDiffers ? 'differs' : ''} ${longName(heard.terminal) ? 'long' : ''}`}>
                    {heard.terminal ? heard.terminal.startsWith('[') ? <span className="uncertain">{heard.terminal}</span> : heard.terminal : t.common.notMentioned}
                  </span>
                  {heard.berth && (
                    <span className={`value-sub ${berthDiffers ? 'differs' : ''}`}>{heard.berth.startsWith('[') ? <span className="uncertain">{heard.berth}</span> : heard.berth}</span>
                  )}
                </div>
              )}
            </div>
            <div className="compare-foot small">
              {snapshot ? (snapshot.ownVessel === snapshot.targetVessel ? snapshot.targetVessel : `${snapshot.ownVessel} → ${snapshot.targetVessel}`) : t.reviewDetail.noTaskAtTime} · {t.reviewDetail.vesselHeard(result.entities.vessel ?? t.common.unconfirmed)}
            </div>
          </section>
          {/* 교신 장소 후보가 여러 개(불확실)면 후보마다 버튼 — 들린 그대로 고르게 */}
          {!single && options.length > 0 && (
            <div className="choice-grid" role="radiogroup" aria-label={t.reviewDetail.pickChange}>
              {options.map((o) => (
                <button key={`${o.terminalId}-${o.berthId}`} type="button" role="radio" aria-checked={picked(o)} className={`choice ${picked(o) ? 'picked' : ''}`} aria-pressed={picked(o)} onClick={() => setPick({ kind: 'change', ...o })} disabled={busy || Boolean(done) || !canChange}>
                  <span className="code">{placeLabel(o.terminalId, o.berthId)}</span>
                  <span className="desc">{t.reviewDetail.pickChange}</span>
                </button>
              ))}
            </div>
          )}
          {options.length > 0 && pending && <p className="small muted">{t.reviewDetail.pendingBlock}</p>}
          {options.length > 0 && !pending && notComplete && <p className="small muted">{t.reviewDetail.unavailableBlock}</p>}
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
            <AudioButton utteranceId={utterance.utteranceId} variant="raw" label={t.reviewDetail.rawClip} />
            <AudioButton utteranceId={utterance.utteranceId} variant="enhanced" label={t.reviewDetail.enhancedClip} />
          </div>
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
            <AudioButton utteranceId={utterance.utteranceId} variant="raw" label={t.clip.listen} />
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
      {/* 확인 행동 */}
      {/* display: contents — 고정 막대가 이 묶음이 아니라 화면 전체(.page)를 기준으로 붙게 한다 */}
      <div className="no-print" style={{ display: 'contents' }}>
        {error && <Notice tone="danger">{error}</Notice>}
        {done && (
          <Notice>
            <span className="done-check" aria-hidden="true">
              ✓
            </span>{' '}
            {done}
            {advance && <div style={{ fontWeight: 600, marginTop: 4 }}>{advance}</div>}
          </Notice>
        )}

        {/* 주 행동은 화면 아래에 고정 (하단 메뉴 바로 위) — 긴 화면에서도 스크롤 없이 누를 수 있게 */}
        {/* 마무리는 "저장하기" 하나. 맞는 쪽을 고르기 전에는 비활성 */}
        <div className={`action-bar ${done ? 'is-done' : ''}`}>
          {!effectivePick && <span className="small muted">{t.reviewDetail.chooseFirst}</span>}
          <button type="button" className="btn primary lg block" disabled={busy || !effectivePick || reviewStatus !== 'unreviewed'} onClick={() => void save()}>
            <IconCheck />
            {reviewStatus !== 'unreviewed' && !done ? t.review[reviewStatus] : t.reviewDetail.save}
          </button>
        </div>
      </div>
    </>
  )
}
