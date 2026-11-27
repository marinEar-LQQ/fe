import type { TaskDraft, TaskVersion } from 'marinear-engine'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../app/AppContext'
import { describeError, isStale } from '../../app/errors'
import { CATALOG, findTerminal, validateDraft } from '../../contracts/catalog'
import { formatClock } from '../../contracts/labels'
import { Badge, Card, DemoBadge, Notice } from '../../ui/components'

const EMPTY: TaskDraft = { ownVessel: '', targetVessel: '', terminalId: null, berthId: null, note: '' }

export function TaskPage() {
  const { state, saveTask, engine, dispatch } = useApp()
  const active = state.taskState.active
  const navigate = useNavigate()
  const [draft, setDraft] = useState<TaskDraft>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof TaskDraft, string>>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [history, setHistory] = useState<TaskVersion[]>([])

  // 현재 기준을 폼 초기값으로
  useEffect(() => {
    if (active) setDraft({ taskId: active.taskId, ownVessel: active.ownVessel, targetVessel: active.targetVessel, terminalId: active.terminalId, berthId: active.berthId, note: active.note })
  }, [active])

  useEffect(() => {
    if (!active) return setHistory([])
    engine.getTaskLog(active.taskId).then(
      (log) => setHistory([...log.versions].reverse()),
      (e) => dispatch({ type: 'error', ...describeError(e) }),
    )
  }, [engine, dispatch, active])

  const terminal = findTerminal(CATALOG, draft.terminalId)
  const dirty =
    !active ||
    draft.ownVessel !== active.ownVessel ||
    draft.targetVessel !== active.targetVessel ||
    draft.terminalId !== active.terminalId ||
    draft.berthId !== active.berthId ||
    draft.note !== active.note

  const set = <K extends keyof TaskDraft>(k: K, v: TaskDraft[K]) => {
    setSaved(false)
    setDraft((d) => ({ ...d, [k]: v, ...(k === 'terminalId' ? { berthId: null } : {}) }))
    setErrors((e) => ({ ...e, [k]: undefined }))
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    const next = validateDraft(draft)
    setErrors(next)
    if (Object.keys(next).length) return

    setSaving(true)
    setSaveError(null)
    try {
      // 저장 성공 후에만 기준이 바뀐다 (task.updated 이벤트로 반영)
      await saveTask(draft)
      setSaved(true)
    } catch (e) {
      const { code, message } = describeError(e)
      // VERSION_CONFLICT: 자동 재시도하지 않는다. 최신 기준이 위 '현재 기준'에 표시된다.
      setSaveError(isStale(code) ? `${message} (${code}) — 다른 곳에서 기준이 바뀌었습니다. 현재 기준을 확인한 뒤 다시 저장하세요.` : `${message} (${code})`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {!active && state.taskState.loaded && (
        <Notice>
          <b>오늘 작업을 먼저 등록하세요.</b>
          <div className="small muted">교신을 등록한 기준과 비교하려면 내 배·대상 선박·터미널·선석이 필요합니다.</div>
        </Notice>
      )}

      {active && (
        <Card>
          <div className="card-title-row">
            <h2>현재 기준</h2>
            <Badge tone="info">v{active.version}</Badge>
          </div>
          <dl className="kv">
            <dt>내 배</dt>
            <dd>{active.ownVessel}</dd>
            <dt>대상 선박</dt>
            <dd>{active.targetVessel}</dd>
            <dt>장소</dt>
            <dd>
              {active.terminalId} {active.berthId}
            </dd>
            {active.note && (
              <>
                <dt>메모</dt>
                <dd style={{ fontWeight: 400 }}>{active.note}</dd>
              </>
            )}
            <dt>등록</dt>
            <dd className="small">
              {formatClock(active.createdAt)} · {active.sourceReviewEventId ? '교신 확인 후 반영' : '직접 등록'}
            </dd>
          </dl>
        </Card>
      )}

      <Card>
        <div className="card-title-row">
          <h2>{active ? '기준 수정' : '작업 등록'}</h2>
          {CATALOG.kind === 'demo' && <DemoBadge label="시연용 장소 목록" />}
        </div>
        <form onSubmit={onSubmit} noValidate className="form-grid">
          <div className={`field ${errors.ownVessel ? 'invalid' : ''}`}>
            <label htmlFor="own">내 배</label>
            <input id="own" value={draft.ownVessel} onChange={(e) => set('ownVessel', e.target.value)} placeholder="예: 해동호" autoComplete="off" aria-invalid={!!errors.ownVessel} />
            {errors.ownVessel && <span className="error-text">{errors.ownVessel}</span>}
          </div>
          <div className={`field ${errors.targetVessel ? 'invalid' : ''}`}>
            <label htmlFor="target">대상 선박</label>
            <input id="target" value={draft.targetVessel} onChange={(e) => set('targetVessel', e.target.value)} placeholder="예: A선박" autoComplete="off" aria-invalid={!!errors.targetVessel} />
            {errors.targetVessel && <span className="error-text">{errors.targetVessel}</span>}
          </div>
          <div className={`field ${errors.terminalId ? 'invalid' : ''}`}>
            <label htmlFor="terminal">터미널</label>
            <select id="terminal" value={draft.terminalId ?? ''} onChange={(e) => set('terminalId', e.target.value || null)} aria-invalid={!!errors.terminalId}>
              <option value="">선택</option>
              {CATALOG.terminals.map((t) => (
                <option key={t.terminalId} value={t.terminalId}>
                  {t.displayName}
                </option>
              ))}
            </select>
            {errors.terminalId && <span className="error-text">{errors.terminalId}</span>}
          </div>
          <div className={`field ${errors.berthId ? 'invalid' : ''}`}>
            <label htmlFor="berth">선석</label>
            <select id="berth" value={draft.berthId ?? ''} onChange={(e) => set('berthId', e.target.value || null)} disabled={!terminal} aria-invalid={!!errors.berthId}>
              <option value="">{terminal ? '선택' : '터미널 먼저 선택'}</option>
              {terminal?.berths.map((b) => (
                <option key={b.berthId} value={b.berthId}>
                  {b.label}
                </option>
              ))}
            </select>
            {errors.berthId && <span className="error-text">{errors.berthId}</span>}
          </div>
          <div className="field full">
            <label htmlFor="note">메모</label>
            <textarea id="note" value={draft.note} onChange={(e) => set('note', e.target.value)} placeholder="작업 관련 메모 (선택)" />
          </div>
          {saveError && (
            <div className="full">
              <Notice tone="danger">저장하지 못했습니다. 기준은 바뀌지 않았습니다. — {saveError}</Notice>
            </div>
          )}
          {saved && !saveError && (
            <div className="full">
              <Notice action={<button type="button" className="btn sm primary" onClick={() => navigate('/monitor')}>교신으로</button>}>
                저장했습니다. 현재 기준은 v{active?.version}입니다.
              </Notice>
            </div>
          )}
          <div className="full">
            <button type="submit" className="btn primary block" disabled={saving || !dirty}>
              {saving ? '저장 중…' : active ? `새 버전(v${active.version + 1})으로 저장` : '작업 등록'}
            </button>
          </div>
        </form>
      </Card>

      {history.length > 1 && (
        <Card>
          <h2>기준 변경 이력</h2>
          <ul className="timeline">
            {history.map((v) => (
              <li key={v.version}>
                <time>{formatClock(v.createdAt)}</time>
                <div>
                  <div className="t-title">
                    v{v.version} · {v.terminalId} {v.berthId}
                  </div>
                  <div className="t-detail">{v.sourceReviewEventId ? '교신 확인 후 반영' : '직접 등록'}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}
