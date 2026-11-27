import type { LangCode } from 'marinear-engine'
import { useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import { demoSeedStatus } from '../../engine/demoHistory'
import { useApp } from '../../app/AppContext'
import { LANGS } from '../../contracts/lang'
import { useT } from '../../i18n'
import { CompassLogo, IconChevronDown } from '../../ui/components'

/**
 * 00 시작 언어 선택 — 첫 실행, 그리고 왼쪽 위 로고를 누르면 언제든 돌아온다.
 * 작업이 이미 있으면 "이어서 하기"와 "새 작업 시작"(이전 작업은 지난 작업 일지에 남음)을 고른다.
 * 고르는 즉시 화면 언어가 바뀌고,
 * 시작을 누르면 작업 등록(작업 없음) 또는 교신(작업 있음)으로 간다. 설정에서 언제든 바꿀 수 있다.
 */
export function StartPage() {
  const { state, dispatch } = useApp()
  const t = useT()
  const navigate = useNavigate()
  const lang = state.preferences.targetLang
  const active = state.taskState.active
  // 첫 실행 때 시연 데이터를 쌓는 동안에는 시작 버튼을 잠근다 (쌓인 뒤 '이어서 하기'가 된다)
  const preparing = useSyncExternalStore(demoSeedStatus.subscribe, demoSeedStatus.get)
  const go = (to: string, fresh = false) => {
    dispatch({ type: 'set-pref', prefs: { langChosen: true } })
    navigate(to, { replace: true, state: fresh ? { fresh: true } : undefined })
  }

  return (
    <div className="start-screen">
      <div className="start-hero">
        <CompassLogo size={120} />
        <span className="start-name">marinEar</span>
      </div>
      <div className="start-pick">
        <label htmlFor="start-lang" className="start-label">
          {t.start.choose}
        </label>
        <span className="select-wrap">
          <select id="start-lang" className="select start-select" value={lang} onChange={(e) => dispatch({ type: 'set-pref', prefs: { targetLang: e.target.value as LangCode } })}>
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.native}
              </option>
            ))}
          </select>
          <IconChevronDown />
        </span>
      </div>
      <div className="start-foot">
        {active && <p className="small muted start-current">{t.start.current(active.ownVessel)}</p>}
        <button type="button" className="btn primary lg block" onClick={() => go(active ? '/monitor' : '/task')} disabled={preparing}>
          {preparing ? t.start.preparing : active ? t.start.resume : t.start.start}
        </button>
        {active && (
          <button type="button" className="btn lg block" onClick={() => go('/task', true)}>
            {t.start.fresh}
          </button>
        )}
      </div>
    </div>
  )
}
