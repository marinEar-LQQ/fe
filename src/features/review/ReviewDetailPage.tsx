import type { AnalysisResult, AudioClip, AudioVariant, ReviewAction, ReviewState, TaskPatch } from 'marinear-engine'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useApp } from '../../app/AppContext'
import { describeError, isStale } from '../../app/errors'
import { CATALOG, findTerminal } from '../../contracts/catalog'
import { COMPARISON_HINT, REASON_LABEL, formatClock, formatMs } from '../../contracts/labels'
import { Badge, Card, ComparisonBadge, DemoBadge, EmptyState, Notice, ReviewBadge } from '../../ui/components'
import { TranscriptText } from '../radio/UtteranceCard'
import { useUtterance } from './useUtterance'

const CLIP_REASON: Record<Exclude<AudioClip['status'], 'available'>, string> = {
  deleted: '삭제된 음성이라 재생할 수 없습니다.',
  missing: '저장된 음성을 찾을 수 없습니다.',
}

/** raw/enhanced 문장을 단어 단위로 비교해 다른 부분을 표시 */
function DiffText({ text, other }: { text: string; other: string }) {
  const otherWords = new Set(other.split(/\s+/))
  return (
    <>
      {text.split(/(\s+)/).map((w, i) =>
        /\s+/.test(w) || otherWords.has(w) ? (
          <span key={i}>{w}</span>
        ) : (
          <mark key={i} className="diff-mark">
            {w}
          </mark>
        ),
      )}
    </>
  )
}

function AudioButton({ utteranceId, variant, label, wordAligned }: { utteranceId: string; variant: AudioVariant; label: string; wordAligned: boolean }) {
  const { engine } = useApp()
  const [msg, setMsg] = useState<string | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url])

  async function play() {
    let clip: AudioClip
    try {
      clip = await engine.getAudioClip(utteranceId, variant)
    } catch (e) {
      return setMsg(`음성을 불러오지 못했습니다: ${describeError(e).message}`)
    }
    if (clip.status !== 'available' || !clip.blob) return setMsg(CLIP_REASON[clip.status === 'available' ? 'missing' : clip.status])
    const u = URL.createObjectURL(clip.blob)
    setUrl(u)
    setMsg(wordAligned ? null : '단어 구간이 검증되지 않아 전체 발화를 재생합니다.')
    setTimeout(() => audioRef.current?.play().catch(() => setMsg('재생을 시작하지 못했습니다.')), 0)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button className="btn" onClick={() => void play()}>
        ▶ {label}
      </button>
      {url && <audio ref={audioRef} src={url} controls style={{ width: '100%' }} />}
      {msg && <span className="small muted">{msg}</span>}
    </div>
  )
}

const UNC_FIELD: Record<AnalysisResult['uncertainties'][number]['field'], string> = { vessel: '선박', terminalId: '터미널', berthId: '선석', number: '숫자' }

function placeOf(result: AnalysisResult): { terminal: string; berth: string; uncertain: boolean } {
  const tu = result.uncertainties.find((u) => u.field === 'terminalId')
  const bu = result.uncertainties.find((u) => u.field === 'berthId')
  return {
    terminal: tu ? `[${tu.alternatives.join(' / ')}]` : (result.entities.terminalId ?? '언급 없음'),
    berth: bu ? `[${bu.alternatives.join(' / ')}]` : (result.entities.berthId ?? '언급 없음'),
    uncertain: Boolean(tu || bu || !result.entities.terminalId),
  }
}

export function ReviewDetailPage() {
  const { id } = useParams()
  const { state, review } = useApp()
  const { entry, versions, events, storedReview, loading, loadError, reload } = useUtterance(id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [manual, setManual] = useState(false)
  const [patch, setPatch] = useState<{ terminalId: string; berthId: string | null }>({ terminalId: '', berthId: null })
  const requestIdRef = useRef<{ key: string; id: string } | null>(null)
  const [confirmed, setConfirmed] = useState(false)

  if (loading && !entry) return <EmptyState title="불러오는 중…" />
  if (loadError && !entry) return <Notice tone="danger">기록을 불러오지 못했습니다: {loadError}</Notice>
  if (!entry || !entry.result)
    return (
      <EmptyState title="교신을 찾을 수 없습니다" action={<Link className="btn" to="/reviews">재확인 목록</Link>}>
        분석이 끝나지 않았거나 다른 작업의 기록입니다.
      </EmptyState>
    )

  const { utterance, result } = entry
  const kind = result.comparison.kind
  const active = state.taskState.active
  const snapshot = versions.find((v) => v.version === utterance.taskVersion) ?? (active?.version === utterance.taskVersion ? active : undefined)
  const place = placeOf(result)
  const reviewStatus: ReviewState = state.reviewState[utterance.utteranceId] ?? storedReview
  // 원음 교차 검사가 끝나지 않은(pending/unavailable) 결과로는 반영할 수 없다 (엔진: UNCERTAIN_VALUE)
  const pending = result.crossCheck === 'pending'
  const notComplete = result.crossCheck !== 'complete'
  const clearDifference = kind === 'difference' && !place.uncertain
  const effectivePatch: TaskPatch | null = manual ? patch : clearDifference ? { terminalId: result.entities.terminalId!, berthId: result.entities.berthId } : null
  const patchValid = Boolean(effectivePatch?.terminalId && effectivePatch.berthId)
  const canApply = !notComplete && confirmed && patchValid && Boolean(active) && reviewStatus !== 'applied'
  const rawText = result.rawTranscript?.text ?? ''
  const enhText = result.enhancedTranscript?.text ?? ''
  const manualTerminal = findTerminal(CATALOG, patch.terminalId)
  const expectedTaskVersion = active?.version ?? utterance.taskVersion

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
      setDone(action === 'apply' ? `작업 기준을 v${ev.taskVersionAfter}로 반영했습니다. 무전 송신이나 실제 작업 승인과는 별개입니다.` : action === 'dismiss' ? '관련 없음으로 표시했습니다. 원문과 분석 결과는 보존됩니다.' : '확인 표시를 남겼습니다. 작업 기준은 바뀌지 않았습니다.')
      setManual(false)
      setConfirmed(false)
    } catch (e) {
      const { code, message } = describeError(e)
      // VERSION_CONFLICT / RESULT_STALE: 자동 재시도하지 않고 최신 기준·결과를 다시 불러와 보여준다
      setError(isStale(code) ? `${message} (${code}) — 최신 기준과 분석 결과를 다시 불러왔습니다. 내용을 확인한 뒤 다시 선택하세요.` : `${message} (${code})`)
      if (isStale(code)) reload()
      setConfirmed(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Link to="/reviews" className="small">
        ← 재확인 목록
      </Link>

      <Card className={`utt kind-${kind}`}>
        <div className="utt-meta">
          <span className="mono">{formatMs(utterance.startMs)}</span>
          <ComparisonBadge kind={kind} />
          <ReviewBadge status={reviewStatus} />
          {entry.fixture && <DemoBadge />}
          <span className="small" style={{ marginLeft: 'auto' }}>
            r{result.revision}
          </span>
        </div>
        <div className="utt-text" lang="ko">
          <TranscriptText result={result} />
        </div>
        <div className="small muted">
          {COMPARISON_HINT[kind]}
          {result.comparison.reasonCodes.length ? ` · ${result.comparison.reasonCodes.map((r) => REASON_LABEL[r]).join(', ')}` : ''}
        </div>
      </Card>

      {/* 장소 비교 */}
      <Card>
        <h2>장소 비교</h2>
        <div className="compare-grid">
          <div className="compare-cell">
            <div className="label">등록 기준 (발화 당시 v{utterance.taskVersion ?? '-'})</div>
            <div className="value">{snapshot ? `${snapshot.terminalId} ${snapshot.berthId}` : '등록 없음'}</div>
            <div className="small muted">{snapshot ? `${snapshot.ownVessel} → ${snapshot.targetVessel}` : ''}</div>
          </div>
          <div className={`compare-cell ${kind === 'difference' ? 'diff' : place.uncertain ? 'amb' : ''}`}>
            <div className="label">교신 언급</div>
            <div className="value">
              {place.terminal} {place.berth !== '언급 없음' ? place.berth : ''}
            </div>
            <div className="small muted">선박: {result.entities.vessel ?? '미확정'}</div>
          </div>
        </div>
        {active && snapshot && active.version !== snapshot.version && (
          <p className="small muted" style={{ marginBottom: 0 }}>
            현재 기준은 v{active.version} ({active.terminalId} {active.berthId})입니다. 이 교신은 발화 당시 기준과 비교했습니다.
          </p>
        )}
      </Card>

      {/* 핵심 구간 · 이중 인식 */}
      <Card>
        <div className="card-title-row">
          <h2>원음 / 완화음 인식</h2>
          {pending ? <Badge tone="info">교차 검사 중</Badge> : result.uncertainties.length ? <Badge tone="warn">인식 차이 있음</Badge> : <Badge tone="muted">차이 없음</Badge>}
        </div>
        <dl className="kv" style={{ gridTemplateColumns: '64px 1fr' }}>
          <dt>완화음</dt>
          <dd lang="ko">{enhText ? <DiffText text={enhText} other={rawText || enhText} /> : '—'}</dd>
          <dt>원음</dt>
          <dd lang="ko">{pending ? <span className="muted">원음 인식 대기 중…</span> : rawText ? <DiffText text={rawText} other={enhText} /> : '—'}</dd>
        </dl>
        {result.uncertainties.length > 0 && (
          <p className="small" style={{ marginBottom: 0 }}>
            후보: {result.uncertainties.map((u) => `${UNC_FIELD[u.field]} ${u.alternatives.join(' / ')}`).join(' · ')}
            <br />
            <span className="muted">두 결과가 같아도 정답을 보장하지 않습니다. 필요하면 기존 무전기로 다시 물어보세요.</span>
          </p>
        )}
        <div className="compare-grid" style={{ marginTop: 12 }}>
          <AudioButton utteranceId={utterance.utteranceId} variant="raw" label="원음 듣기" wordAligned={Boolean(result.rawTranscript?.wordAligned)} />
          <AudioButton utteranceId={utterance.utteranceId} variant="enhanced" label="완화음 듣기" wordAligned={Boolean(result.enhancedTranscript?.wordAligned)} />
        </div>
      </Card>

      {/* 확인 행동 */}
      <Card className="no-print">
        <h2>확인</h2>
        {error && (
          <div style={{ marginBottom: 12 }}>
            <Notice tone="danger">{error}</Notice>
          </div>
        )}
        {done && (
          <div style={{ marginBottom: 12 }}>
            <Notice>{done}</Notice>
          </div>
        )}
        <div className="btn-row" style={{ marginBottom: 16 }}>
          <button className="btn" disabled={busy} onClick={() => void act('review')}>
            확인 표시만 하기
          </button>
          <button className="btn ghost" disabled={busy} onClick={() => void act('dismiss')}>
            관련 없음
          </button>
        </div>

        {kind !== 'unrelated' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="small muted">기록 반영: 확인한 장소로 작업 기준의 새 버전을 만듭니다.</div>
            {pending && <Notice tone="warn">원음 교차 검사가 끝나야 반영할 수 있습니다.</Notice>}
            {!pending && notComplete && <Notice tone="warn">원음 교차 검사를 하지 못한 결과라 반영할 수 없습니다. 기존 무전기로 다시 확인하세요.</Notice>}
            {!active && <Notice tone="warn">등록된 작업이 없어 반영할 수 없습니다.</Notice>}

            {clearDifference && !manual && (
              <div>
                반영할 장소: <b>{result.entities.terminalId} {result.entities.berthId}</b>
              </div>
            )}
            {!clearDifference && !manual && <div className="small">장소가 불확실해 기본 반영이 꺼져 있습니다. 직접 확인한 뒤 수동으로 선택하세요.</div>}

            {manual ? (
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="m-term">터미널</label>
                  <select id="m-term" value={patch.terminalId} onChange={(e) => setPatch({ terminalId: e.target.value, berthId: null })}>
                    <option value="">선택</option>
                    {CATALOG.terminals.map((t) => (
                      <option key={t.terminalId}>{t.terminalId}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="m-berth">선석</label>
                  <select id="m-berth" value={patch.berthId ?? ''} disabled={!manualTerminal} onChange={(e) => setPatch((p) => ({ ...p, berthId: e.target.value || null }))}>
                    <option value="">선택</option>
                    {manualTerminal?.berths.map((b) => (
                      <option key={b.berthId} value={b.berthId}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setManual(true)} disabled={notComplete}>
                장소 직접 선택
              </button>
            )}

            <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44 }}>
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ width: 22, height: 22 }} disabled={notComplete || !patchValid} />
              교신 내용을 직접 확인했고 이 장소로 기록을 바꿉니다
            </label>
            <button className="btn primary" disabled={busy || !canApply} onClick={() => void act('apply')}>
              {active ? `확인 후 기록 반영 (v${active.version} → v${active.version + 1})` : '확인 후 기록 반영'}
            </button>
          </div>
        )}
      </Card>

      {events.length > 0 && (
        <Card>
          <h2>확인 기록</h2>
          <ul className="timeline">
            {events.map((e) => (
              <li key={e.eventId}>
                <time>{formatClock(e.at)}</time>
                <div>
                  <div className="t-title">{e.action === 'apply' ? '기록 반영' : e.action === 'dismiss' ? '관련 없음' : '확인 표시'}</div>
                  <div className="t-detail">{e.action === 'apply' ? `v${e.taskVersionBefore} → v${e.taskVersionAfter}` : '기준 변경 없음'} · r{e.resultRevision}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}
