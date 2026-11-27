import { Component, type ReactNode } from 'react'
import { messagesFor } from '../i18n'
import { loadPreferences } from './state'

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      // 앱 상태 밖이라 저장된 언어로 표시
      const t = messagesFor(loadPreferences().targetLang)
      return (
        <div className="shell">
          <main className="page">
            <div className="card">
              <h2>{t.app.errorBoundary}</h2>
              <p className="muted">{t.app.errorBoundaryHint}</p>
              <pre className="small mono" style={{ whiteSpace: 'pre-wrap' }}>{this.state.error.message}</pre>
              <button className="btn primary" onClick={() => location.reload()}>
                {t.app.reload}
              </button>
            </div>
          </main>
        </div>
      )
    }
    return this.props.children
  }
}
