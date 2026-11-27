import type { LangCode } from 'marinear-engine'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import { demoSeedStatus } from '../../engine/demoHistory'
import { useApp } from '../../app/AppContext'
import { LANGS } from '../../contracts/lang'
import { useT } from '../../i18n'
import { CompassLogo, IconChevronDown } from '../../ui/components'

/**
 * 00 시작 언어 선택 — 첫 실행, 그리고 왼쪽 위 로고를 누르면 언제든 돌아온다.
 * 고르는 즉시 화면 언어가 바뀌고, 시작을 누르면 교신(작업 있음) 또는 작업 등록(작업 없음)으로 간다.
 * 첫 실행 때는 뒤에서 기본 기록(시연 데이터)을 조용히 채운다 — 화면에는 알리지 않고, 그 사이 시작을 누르면 다 채워진 뒤에 넘어간다.
 */
export function StartPage() {
  const { state, dispatch } = useApp()
  const t = useT()
  const navigate = useNavigate()
  const lang = state.preferences.targetLang
  const active = state.taskState.active
  const preparing = useSyncExternalStore(demoSeedStatus.subscribe, demoSeedStatus.get)
  const [wanted, setWanted] = useState(false)
  // 시작을 눌렀고 기본 기록 채우기가 끝났으면 넘어간다
  useEffect(() => {
    if (!wanted || preparing || !state.taskState.loaded) return
    dispatch({ type: 'set-pref', prefs: { langChosen: true } })
    navigate(active ? '/monitor' : '/task', { replace: true })
  }, [wanted, preparing, state.taskState.loaded, active, dispatch, navigate])

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
        <button type="button" className="btn primary lg block" onClick={() => setWanted(true)} disabled={wanted}>
          {t.start.start}
        </button>
      </div>
    </div>
  )
}
