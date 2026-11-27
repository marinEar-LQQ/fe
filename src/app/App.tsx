import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { needsReview } from '../contracts/labels'
import { MonitorPage } from '../features/radio/MonitorPage'
import { ReportPage } from '../features/report/ReportPage'
import { ReviewDetailPage } from '../features/review/ReviewDetailPage'
import { ReviewListPage } from '../features/review/ReviewListPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { TaskPage } from '../features/task/TaskPage'
import { IconLog, IconRadio, IconReview, IconSettings, IconTask, Notice } from '../ui/components'
import { AppProvider, useApp } from './AppContext'
import { ErrorBoundary } from './ErrorBoundary'

const TITLES: [string, string][] = [
  ['/monitor', '교신'],
  ['/reviews', '재확인'],
  ['/report', '작업 일지'],
  ['/task', '오늘 작업'],
  ['/settings', '설정'],
]

function TopBar() {
  const { pathname } = useLocation()
  const { state } = useApp()
  const title = TITLES.find(([p]) => pathname.startsWith(p))?.[1] ?? 'marinEar'
  const task = state.taskState.active
  return (
    <header className="topbar">
      <div style={{ flex: 1 }}>
        <div className="brand">marinEar</div>
        <h1>{title}</h1>
      </div>
      {task ? (
        <NavLink to="/task" className="badge info" style={{ textDecoration: 'none' }} aria-label="현재 작업 기준">
          {task.targetVessel} · {task.terminalId} {task.berthId} · v{task.version}
        </NavLink>
      ) : (
        <NavLink to="/task" className="badge warn" style={{ textDecoration: 'none' }}>
          작업 미등록
        </NavLink>
      )}
    </header>
  )
}

function BottomNav() {
  const { state } = useApp()
  const pending = state.messageState.order.filter((id) => {
    const r = state.messageState.byId[id]?.result
    return r && needsReview(r.comparison?.kind) && (state.reviewState[id] ?? 'unreviewed') === 'unreviewed'
  }).length
  const items = [
    { to: '/monitor', label: '교신', Icon: IconRadio },
    { to: '/reviews', label: '재확인', Icon: IconReview, badge: pending },
    { to: '/report', label: '작업 일지', Icon: IconLog },
    { to: '/task', label: '오늘 작업', Icon: IconTask },
    { to: '/settings', label: '설정', Icon: IconSettings },
  ]
  return (
    <nav className="bottom-nav" aria-label="주요 메뉴">
      {items.map(({ to, label, Icon, badge }) => (
        <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : '')}>
          <Icon />
          {label}
          {badge ? <span className="nav-badge" aria-label={`재확인 ${badge}건`}>{badge}</span> : null}
        </NavLink>
      ))}
    </nav>
  )
}

function Toasts() {
  const { state, dispatch } = useApp()
  if (state.errors.length === 0) return null
  return (
    <div className="toast-stack" aria-live="assertive">
      {state.errors.slice(-3).map((e) => (
        <Notice
          key={e.id}
          tone={['VERSION_CONFLICT', 'STORAGE_FULL', 'INPUT_DISCONNECTED', 'MODEL_INTEGRITY'].includes(e.code) ? 'danger' : 'warn'}
          action={
            <button className="btn sm ghost" onClick={() => dispatch({ type: 'dismiss-error', id: e.id })} aria-label="알림 닫기">
              닫기
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

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <BrowserRouter>
          <div className="shell">
            <TopBar />
            <main className="page">
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
        </BrowserRouter>
      </AppProvider>
    </ErrorBoundary>
  )
}
