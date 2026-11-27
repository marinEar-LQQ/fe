import type { ReactNode } from 'react'
import { COMPARISON_LABEL, REVIEW_LABEL } from '../contracts/labels'
import type { ComparisonKind, EngineStatus, InputStatus, ReviewStatus } from '../contracts/types'

/** 재디자인 가능한 표시 부품. 업무 로직을 넣지 않는다. */

type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'muted' | 'demo'

export function Badge({ tone, children, title }: { tone: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={`badge ${tone}`} title={title}>
      {children}
    </span>
  )
}

const KIND_TONE: Record<ComparisonKind, Tone> = { match: 'ok', difference: 'danger', ambiguous: 'warn', unrelated: 'muted', unknown: 'muted' }
export function ComparisonBadge({ kind }: { kind: ComparisonKind }) {
  return <Badge tone={KIND_TONE[kind]}>{COMPARISON_LABEL[kind]}</Badge>
}

const REVIEW_TONE: Record<ReviewStatus, Tone> = { unreviewed: 'warn', reviewed: 'info', dismissed: 'muted', applied: 'ok' }
export function ReviewBadge({ status }: { status: ReviewStatus }) {
  return <Badge tone={REVIEW_TONE[status]}>{REVIEW_LABEL[status]}</Badge>
}

export function DemoBadge({ label = '시연 데이터' }: { label?: string }) {
  return (
    <Badge tone="demo" title="실제 음성 분석 결과가 아닌 고정 예시입니다">
      {label}
    </Badge>
  )
}

const INPUT_TEXT: Record<InputStatus, [Tone, string]> = {
  idle: ['muted', '입력 대기'],
  requesting: ['info', '권한 요청 중'],
  ready: ['info', '입력 준비됨'],
  capturing: ['ok', '입력 수신 중'],
  paused: ['warn', '일시 정지'],
  disconnected: ['danger', '입력 끊김'],
  error: ['danger', '입력 오류'],
}
export function InputBadge({ status }: { status: InputStatus }) {
  const [tone, text] = INPUT_TEXT[status]
  return <Badge tone={tone}>{text}</Badge>
}

const ENGINE_TEXT: Record<EngineStatus, [Tone, string]> = {
  loading: ['info', '엔진 준비 중'],
  ready: ['ok', '엔진 대기'],
  processing: ['info', '분석 중'],
  degraded: ['warn', '분석 제한'],
  error: ['danger', '엔진 오류'],
}
export function EngineBadge({ status, queueDepth }: { status: EngineStatus; queueDepth: number }) {
  const [tone, text] = ENGINE_TEXT[status]
  return <Badge tone={tone}>{queueDepth > 1 ? `${text} · 대기 ${queueDepth}` : text}</Badge>
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card empty" role="status">
      <strong>{title}</strong>
      {children && <p style={{ margin: '0 0 16px' }}>{children}</p>}
      {action}
    </div>
  )
}

export function Notice({ tone = 'info', children, action }: { tone?: 'info' | 'warn' | 'danger'; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`notice ${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <div className="grow">{children}</div>
      {action}
    </div>
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

export function LevelMeter({ level }: { level: number }) {
  const pct = Math.min(100, Math.round(Math.sqrt(level) * 140))
  return (
    <div className="level-meter" role="meter" aria-label="입력 레벨" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <span style={{ width: `${pct}%` }} />
    </div>
  )
}

/* 아이콘 (라이선스 걱정 없는 단순 SVG) */
const icon = (d: string) => () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
)
export const IconRadio = icon('M4 10h16v10H4zM8 10l8-6M8 15h.01M12 15h4')
export const IconReview = icon('M12 3l9 16H3zM12 10v4M12 17h.01')
export const IconLog = icon('M6 3h9l3 3v15H6zM9 9h6M9 13h6M9 17h4')
export const IconTask = icon('M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9')
export const IconSettings = icon('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z')
