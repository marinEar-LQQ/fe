import { Component, type ReactNode } from 'react'

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="shell">
          <main className="page">
            <div className="card">
              <h2>화면 오류가 발생했습니다</h2>
              <p className="muted">저장된 작업·교신 기록은 그대로 남아 있습니다. 새로고침해 주세요.</p>
              <pre className="small mono" style={{ whiteSpace: 'pre-wrap' }}>{this.state.error.message}</pre>
              <button className="btn primary" onClick={() => location.reload()}>
                새로고침
              </button>
            </div>
          </main>
        </div>
      )
    }
    return this.props.children
  }
}
