import type { TaskDraft, TaskVersion } from 'marinear-engine'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../app/AppContext'
import { describeError, isStale } from '../../app/errors'
import { CATALOG, findTerminal, validateDraft } from '../../contracts/catalog'
import { formatClock } from '../../contracts/labels'
import { useT } from '../../i18n'
import { Card, Choice, DemoBadge, Notice, StatusMark } from '../../ui/components'
import { placeText } from '../radio/MonitorPage'

const EMPTY: TaskDraft = { ownVessel: '', targetVessel: '', terminalId: null, berthId: null, note: '' }

/** 01 오늘 작업 등록 — 장소는 카탈로그 값만 선택 버튼으로. 부두 설명은 카탈로그에 없어 표시하지 않는다 */
export function TaskPage() {
  const { state, saveTask, engine, dispatch } = useApp()
  const t = useT()
  const active = state.taskState.active
  const navigate = useNavigate()
  const [draft, setDraft] = useState<TaskDraft>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof TaskDraft, true>>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
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
  // 항만: 고른 터미널의 port, 아니면 카탈로그 전체가 한 항만일 때만 표시
  const ports = [...new Set(CATALOG.terminals.map((x) => x.port).filter(Boolean))]
  const port = terminal?.port ?? (ports.length === 1 ? ports[0] : null)
  const dirty =
    !active ||
    draft.ownVessel !== active.ownVessel ||
    draft.targetVessel !== active.targetVessel ||
    draft.terminalId !== active.terminalId ||
    draft.berthId !== active.berthId ||
    draft.note !== active.note

  const set = <K extends keyof TaskDraft>(k: K, v: TaskDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v, ...(k === 'terminalId' ? { berthId: null } : {}) }))
    setErrors((e) => ({ ...e, [k]: undefined }))
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!dirty) return navigate('/monitor')
    // 엔진과 같은 검증 규칙 (메시지는 화면 언어로)
    const found = validateDraft(draft)
    const next = Object.fromEntries(Object.keys(found).map((k) => [k, true])) as Partial<Record<keyof TaskDraft, true>>
    setErrors(next)
    if (Object.keys(next).length) return

    setSaving(true)
    setSaveError(null)
    try {
      // 저장 성공 후에만 기준이 바뀐다 (task.updated 이벤트로 반영)
      await saveTask(draft)
      navigate('/monitor')
    } catch (e) {
      const { code, message } = describeError(e)
      // VERSION_CONFLICT: 자동 재시도하지 않는다. 최신 기준이 폼에 다시 채워진다.
      setSaveError(isStale(code) ? `${t.task.conflict} (${code})` : `${message} (${code})`)
    } finally {
      setSaving(false)
    }
  }

  const err = (k: keyof TaskDraft) => (errors[k] ? <span className="error-text">{t.task.errors[k as keyof typeof t.task.errors]}</span> : null)

  return (
    <>
      <h1>{active ? t.task.titleEdit : t.task.titleNew}</h1>

      <form onSubmit={onSubmit} noValidate className="form-grid">
        {/* 선박명 하나로 입력 → 엔진의 내 선박·작업 대상 선박 둘 다에 같은 이름을 넣는다 (교신 판정은 둘 중 하나만 맞아도 내 작업) */}
        <div className={`field ${errors.ownVessel || errors.targetVessel ? 'invalid' : ''}`}>
          <label htmlFor="own">{t.task.ownVessel}</label>
          <input
            id="own"
            value={draft.ownVessel}
            onChange={(e) => setDraft((d) => ({ ...d, ownVessel: e.target.value, targetVessel: e.target.value }))}
            autoComplete="off"
            aria-invalid={!!(errors.ownVessel || errors.targetVessel)}
          />
          {err('ownVessel')}
        </div>

        {(port || CATALOG.kind === 'demo') && (
          <div className="row-divider">
            <span>{t.task.port}</span>
            <span className="status-strip">
              {CATALOG.kind === 'demo' && <DemoBadge label={t.task.demoCatalog} />}
              {port && <span className="chip" style={{ fontSize: 14, fontWeight: 600, padding: '4px 10px' }}>{port}</span>}
            </span>
          </div>
        )}

        <div className="field">
          <span className="field-label" id="terminal-label">
            {t.task.terminal}
          </span>
          <div className="choice-grid" role="group" aria-labelledby="terminal-label">
            {CATALOG.terminals.map((x) => (
              <Choice key={x.terminalId} tall selected={draft.terminalId === x.terminalId} onClick={() => set('terminalId', x.terminalId)} code={x.displayName} />
            ))}
          </div>
          {err('terminalId')}
        </div>

        <div className="field">
          <span className="field-label" id="berth-label">
            {terminal ? (
              <>
                <span className="mono">{terminal.displayName}</span> {t.task.berth}
              </>
            ) : (
              t.task.berth
            )}
          </span>
          {terminal ? (
            <div className="choice-grid cols-4" role="group" aria-labelledby="berth-label">
              {terminal.berths.map((b) => (
                <Choice key={b.berthId} selected={draft.berthId === b.berthId} onClick={() => set('berthId', b.berthId)} code={b.label} />
              ))}
            </div>
          ) : (
            <p className="small muted">{t.task.selectTerminalFirst}</p>
          )}
          {err('berthId')}
        </div>

        <div className="field">
          <label htmlFor="note">{t.task.note}</label>
          <input id="note" value={draft.note} onChange={(e) => set('note', e.target.value)} placeholder={t.task.notePlaceholder} autoComplete="off" />
        </div>

        {saveError && <Notice tone="danger">{t.task.saveFailed(saveError)}</Notice>}

        <button type="submit" className="btn primary lg block" disabled={saving}>
          {saving ? t.task.saving : !dirty ? t.task.goMonitor : active ? t.task.saveVersion(active.version + 1) : t.task.saveAndGo}
        </button>
      </form>

      {history.length > 1 && (
        <>
          <h2>{t.task.history}</h2>
          <div className="timeline-rail">
            {history.map((v) => (
              <Card key={v.version} className={v.version === active?.version ? '' : 'soft'}>
                <StatusMark className="mark" shape="circle" />
                <div className="utt-head">
                  <span className="mono" style={{ fontWeight: 700 }}>
                    v{v.version} · {placeText(v.terminalId, v.berthId)}
                  </span>
                  <span className="time">{formatClock(v.createdAt)}</span>
                </div>
                <p className="small muted">
                  {v.targetVessel} · {v.sourceReviewEventId ? t.task.fromReview : t.task.manual}
                  {v.version === active?.version ? ` · ${t.task.current}` : ''}
                </p>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  )
}
