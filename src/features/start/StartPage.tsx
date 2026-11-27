import type { LangCode } from 'marinear-engine'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../app/AppContext'
import { LANGS } from '../../contracts/lang'
import { useT } from '../../i18n'
import { CompassLogo, IconChevronDown } from '../../ui/components'

/**
 * 00 시작 언어 선택 — 첫 실행에만. 고르는 즉시 화면 언어가 바뀌고,
 * 시작을 누르면 작업 등록(작업 없음) 또는 교신(작업 있음)으로 간다. 설정에서 언제든 바꿀 수 있다.
 */
export function StartPage() {
  const { state, dispatch } = useApp()
  const t = useT()
  const navigate = useNavigate()
  const lang = state.preferences.targetLang

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
        <button
          type="button"
          className="btn primary lg block"
          onClick={() => {
            dispatch({ type: 'set-pref', prefs: { langChosen: true } })
            navigate(state.taskState.active ? '/monitor' : '/task', { replace: true })
          }}
        >
          {t.start.start}
        </button>
      </div>
    </div>
  )
}
