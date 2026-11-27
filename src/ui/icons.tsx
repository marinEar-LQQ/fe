/* 시안 A 아이콘 (design/00~08 의 SVG 를 그대로 옮김). 장식용은 aria-hidden. */

/** 나침반 로고 */
export function CompassLogo({ size = 30 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="15" cy="15" r="11" />
      <path d="M15 2v26M2 15h26" strokeWidth="1" />
      <path d="M15 5l3 10-3 10-3-10z" fill="currentColor" />
    </svg>
  )
}

const navIcon = (children: React.ReactNode) =>
  function NavIcon() {
    return (
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    )
  }

export const IconRadio = navIcon(<path d="M4 6h14M4 11h14M4 16h8" />)
export const IconReview = navIcon(<path d="M11 3.5l8 14.5H3l8-14.5zM11 9v4M11 15.4v.1" />)
export const IconLog = navIcon(<path d="M6 3h10v16H6zM9 8h4M9 12h4" />)
export const IconTask = navIcon(
  <>
    <circle cx="11" cy="5" r="2" />
    <path d="M11 7v12M5 12c0 4 3 7 6 7s6-3 6-7M8 10h6" />
  </>,
)
export const IconSettings = navIcon(
  <>
    <circle cx="11" cy="11" r="3" />
    <circle cx="11" cy="11" r="7.5" />
  </>,
)

/** 상단 설정 버튼 (20px) */
export function IconSettingsSmall() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="3" />
      <circle cx="11" cy="11" r="7.5" />
    </svg>
  )
}

export function IconPlay({ size = 14 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 2.5v11l9-5.5z" />
    </svg>
  )
}

export function IconCheck({ size = 16 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8.5l3.2 3.2L13 5" />
    </svg>
  )
}

export function IconChevronDown() {
  return (
    <svg aria-hidden="true" className="chevron" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 7.5l5 5 5-5" />
    </svg>
  )
}

/**
 * 상태 표식 — 색과 함께 모양으로도 구분한다 (design/README "경고는 색과 함께 모양으로")
 * triangle: 인식 불일치·확인 필요 / diamond: 장소 차이 / circle: 일반 / dot-ok: 일치
 */
export type MarkShape = 'triangle' | 'diamond' | 'circle'
export function StatusMark({ shape, size = 18, outline = true, className }: { shape: MarkShape; size?: number; outline?: boolean; className?: string }) {
  const stroke = outline ? { stroke: '#FFFFFF', strokeWidth: 1.5 } : {}
  return (
    <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 18 18">
      {shape === 'triangle' && <path d="M9 2l8 14H1z" fill="var(--alert)" {...stroke} />}
      {shape === 'diamond' && <path d="M9 1l8 8-8 8-8-8z" fill="var(--alert)" {...stroke} />}
      {shape === 'circle' && <circle cx="9" cy="9" r="6" fill="#FFFFFF" stroke="var(--ink)" strokeWidth="2" />}
    </svg>
  )
}

/** 현재 작업 기준 칸의 등고선 장식 */
export function Contour() {
  return (
    <svg aria-hidden="true" className="contour" width="190" height="120" viewBox="0 0 190 120" fill="none" stroke="var(--contour)" strokeWidth="1.2">
      <path d="M95 12c40-6 78 14 82 46s-30 54-74 56-84-18-86-48 38-48 78-54z" />
      <path d="M98 30c26-4 52 8 56 28s-20 36-50 38-56-12-58-32 26-30 52-34z" />
      <path d="M100 48c14-2 28 4 30 14s-10 18-26 20-30-6-30-16 12-16 26-18z" />
    </svg>
  )
}
