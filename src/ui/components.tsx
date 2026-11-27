import type { ComparisonKind, ReviewState } from 'marinear-engine'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { EngineStatus, UiInputStatus } from '../app/state'
import { useT } from '../i18n'
import { IconCheck, IconChevronDown, StatusMark, type MarkShape } from './icons'

/** 시안 A 표시 부품. 업무 로직을 넣지 않는다. 상태는 항상 글자 + 색 + (가능하면) 모양으로 구분한다. */

export * from './icons'

type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'muted' | 'demo'

export function Badge({ tone, children, title }: { tone: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={`badge ${tone}`} title={title}>
      {children}
    </span>
  )
}

/** 판정별 모양·색 (시안: ▲ 인식 불일치/확인 필요, ◆ 장소 차이, ○ 그 외) */
export const KIND_MARK: Record<ComparisonKind, { shape: MarkShape; tone: 'alert' | 'ok' | 'plain' }> = {
  ambiguous: { shape: 'triangle', tone: 'alert' },
  difference: { shape: 'diamond', tone: 'alert' },
  match: { shape: 'circle', tone: 'ok' },
  unrelated: { shape: 'circle', tone: 'ok' },
  unknown: { shape: 'circle', tone: 'plain' },
}

/** 카드 머리의 상태 라벨 (색 글자 13/700) */
export function StatusLabel({ tone, children, mark }: { tone: 'alert' | 'ok' | 'plain'; children: ReactNode; mark?: MarkShape }) {
  return (
    <span className={`status-label ${tone}`}>
      {mark && <StatusMark shape={mark} size={14} outline={false} />}
      {children}
    </span>
  )
}

export function ComparisonBadge({ kind }: { kind: ComparisonKind }) {
  const t = useT()
  const m = KIND_MARK[kind]
  return <StatusLabel tone={m.tone}>{t.comparison[kind]}</StatusLabel>
}

const REVIEW_TONE: Record<ReviewState, Tone> = { unreviewed: 'warn', reviewed: 'info', dismissed: 'muted', applied: 'ok' }
export function ReviewBadge({ status }: { status: ReviewState }) {
  const t = useT()
  return <Badge tone={REVIEW_TONE[status]}>{t.review[status]}</Badge>
}

/** 시연 데이터 표시는 화면에서 뺐다 (2026-11-28 팀 결정: 시연 영상은 실제 앱 구동을 녹화). 쓰는 곳은 남겨 두고 아무것도 그리지 않는다 */
export function DemoBadge(_props: { label?: string }) {
  return null
}

const INPUT_TONE: Record<UiInputStatus, Tone> = { idle: 'muted', requesting: 'info', capturing: 'ok', disconnected: 'danger', error: 'danger' }
export function InputBadge({ status }: { status: UiInputStatus }) {
  const t = useT()
  return <Badge tone={INPUT_TONE[status]}>{t.input[status]}</Badge>
}

const ENGINE_TONE: Record<EngineStatus, Tone> = { loading: 'info', ready: 'ok', processing: 'info', degraded: 'warn', error: 'danger' }
export function EngineBadge({ status, queueDepth }: { status: EngineStatus; queueDepth: number }) {
  const t = useT()
  const text = t.engine[status]
  return <Badge tone={ENGINE_TONE[status]}>{queueDepth > 1 ? `${text} · ${t.engine.queue(queueDepth)}` : text}</Badge>
}

export function Card({ children, className = '', label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <section className={`card ${className}`} aria-label={label}>
      {children}
    </section>
  )
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card empty" role="status">
      <strong>{title}</strong>
      {children && <p className="small">{children}</p>}
      {action}
    </div>
  )
}

export function Notice({ tone = 'info', children, action }: { tone?: 'info' | 'warn' | 'danger'; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`notice ${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      {tone !== 'info' && <StatusMark className="notice-mark" shape="triangle" size={14} outline={false} />}
      <div className="grow">{children}</div>
      {action}
    </div>
  )
}

/** 화면 머리: (뒤로) + 상태 라벨 + 제목 */
export function PageHead({ title, eyebrow, back }: { title: ReactNode; eyebrow?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <>
      {back && (
        <Link to={back.to} className="back-link">
          <span aria-hidden="true">←</span>
          {back.label}
        </Link>
      )}
      <div className="page-head">
        {eyebrow}
        <h1>{title}</h1>
      </div>
    </>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** 선택 버튼 (터미널·선석). 선택되면 잉크색 채움 + 체크 */
export function Choice({ selected, onClick, code, desc, tall, disabled, label }: { selected: boolean; onClick: () => void; code: string; desc?: string; tall?: boolean; disabled?: boolean; label?: string }) {
  return (
    <button type="button" className={`choice ${tall ? 'tall' : ''}`} aria-pressed={selected} onClick={onClick} disabled={disabled} aria-label={label}>
      {selected && (
        <span className="check">
          <IconCheck />
        </span>
      )}
      <span className="code">{code}</span>
      {desc && <span className="desc">{desc}</span>}
    </button>
  )
}

/** 토글 스위치 (켜짐/꺼짐 글자 포함) */
export function Switch({ checked, onChange, label, onText, offText }: { checked: boolean; onChange: (v: boolean) => void; label: string; onText: string; offText: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)}>
      {checked ? onText : offText}
      <span className="knob" />
    </button>
  )
}

/** 시안의 사각 select + 아래 화살표 */
export function SelectBox({ id, value, onChange, children, className = '', ariaLabel }: { id?: string; value: string; onChange: (v: string) => void; children: ReactNode; className?: string; ariaLabel?: string }) {
  return (
    <span className={`select-wrap ${className}`}>
      <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel}>
        {children}
      </select>
      <IconChevronDown />
    </span>
  )
}

export function LevelMeter({ level }: { level: number }) {
  const t = useT()
  const pct = Math.min(100, Math.round(Math.sqrt(level) * 140))
  return (
    <div className="level-meter" role="meter" aria-label={t.monitor.inputLevel} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <span style={{ width: `${pct}%` }} />
    </div>
  )
}
