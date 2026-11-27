import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { needsReview } from '../contracts/labels'
import { MonitorPage } from '../features/radio/MonitorPage'
import { ReportPage } from '../features/report/ReportPage'
import { ReviewDetailPage } from '../features/review/ReviewDetailPage'
import { ReviewListPage } from '../features/review/ReviewListPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { StartPage } from '../features/start/StartPage'
import { TaskPage } from '../features/task/TaskPage'
import { useT } from '../i18n'
import { CompassLogo, IconLog, IconRadio, IconReview, IconSettings, IconSettingsSmall, IconTask, Notice } from '../ui/components'
import { AppProvider, useApp } from './AppContext'
import { ErrorBoundary } from './ErrorBoundary'

/** 시안 상단: 나침반 로고 + marinEar + (수신 중 표시) + 설정 */
function TopBar() {
  const { state } = useApp()
  const t = useT()
  const live = state.session.source === 'live'
  const liveGaps = live ? state.gaps.filter((g) => g.sessionId === state.session.sessionId).length : 0
  return (
    <header className="topbar">
      <Link to="/monitor" className="brand" aria-label="marinEar">
        <CompassLogo />
        <span className="brand-name">marinEar</span>
      </Link>
      <div className="topbar-actions">
        {live && (
          <NavLink to="/monitor" className={`badge ${state.inputState.engine === 'disconnected' ? 'danger' : liveGaps > 0 ? 'warn' : 'ok'}`} aria-label={t.app.liveBadge}>
            ● {state.inputState.engine === 'disconnected' ? t.app.disconnected : liveGaps > 0 ? t.app.receivingGaps(liveGaps) : t.app.receiving}
          </NavLink>
        )}
        <Link to="/settings" className="icon-btn" aria-label={t.common.settings}>
          <IconSettingsSmall />
        </Link>
      </div>
    </header>
  )
}

function BottomNav() {
  const { state } = useApp()
  const t = useT()
  const pending = state.messageState.order.filter((id) => {
    const r = state.messageState.byId[id]?.result
    return r && needsReview(r.comparison.kind) && (state.reviewState[id] ?? 'unreviewed') === 'unreviewed'
  }).length
  const items = [
    { to: '/monitor', label: t.nav.monitor, Icon: IconRadio },
    { to: '/reviews', label: t.nav.reviews, Icon: IconReview, badge: pending },
    { to: '/report', label: t.nav.report, Icon: IconLog },
    { to: '/task', label: t.nav.task, Icon: IconTask },
    { to: '/settings', label: t.nav.settings, Icon: IconSettings },
  ]
  return (
    <nav className="bottom-nav" aria-label={t.nav.label}>
      {items.map(({ to, label, Icon, badge }) => (
        <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : '')}>
          <Icon />
          {label}
          {badge ? (
            <span className="nav-badge" aria-label={t.nav.pending(badge)}>
              {badge}
            </span>
          ) : null}
        </NavLink>
      ))}
    </nav>
  )
}

function Toasts() {
  const { state, dispatch } = useApp()
  const t = useT()
  if (state.errors.length === 0) return null
  return (
    <div className="toast-stack" aria-live="assertive" aria-label={t.app.toastsLabel}>
      {state.errors.slice(-3).map((e) => (
        <Notice
          key={e.id}
          tone={['VERSION_CONFLICT', 'STORAGE_FULL', 'INPUT_DISCONNECTED', 'MODEL_INTEGRITY'].includes(e.code) ? 'danger' : 'warn'}
          action={
            <button className="btn sm" onClick={() => dispatch({ type: 'dismiss-error', id: e.id })}>
              {t.common.close}
            </button>
          }
        >
          <span className="mono small muted">{e.code}</span>
          <div>{e.message}</div>
        </Notice>
      ))}
    </div>
  )
}

function Home() {
  const { state } = useApp()
  if (!state.taskState.loaded) return null
  return <Navigate to={state.taskState.active ? '/monitor' : '/task'} replace />
}

function Shell() {
  const { state } = useApp()
  const { pathname } = useLocation()
  // 첫 실행: 언어부터 고른다 (00 시작 언어 선택)
  if (!state.preferences.langChosen && pathname !== '/start') return <Navigate to="/start" replace />
  if (pathname === '/start') return <StartPage />
  const tightTop = pathname.startsWith('/reviews/')
  return (
    <div className="shell">
      <TopBar />
      <main className={`page ${tightTop ? 'tight-top' : ''}`}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/monitor" element={<MonitorPage />} />
          <Route path="/reviews" element={<ReviewListPage />} />
          <Route path="/reviews/:id" element={<ReviewDetailPage />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="/task" element={<TaskPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Toasts />
      <BottomNav />
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <BrowserRouter>
          <Shell />
        </BrowserRouter>
      </AppProvider>
    </ErrorBoundary>
  )
}
