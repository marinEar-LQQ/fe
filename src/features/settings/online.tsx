import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../app/AppContext'
import { useT } from '../../i18n'
import { Notice, StatusMark } from '../../ui/components'

/** 상단·설정에 보이는 엔진 모드 (readiness.mode, 없으면 주입된 엔진 종류) */
export function useEngineModeLabel(): string | null {
  const { state, engineKind } = useApp()
  const t = useT()
  const mode = state.engineState.readiness?.mode ?? (engineKind === 'mock' ? 'fixture' : engineKind)
  return t.engineMode[mode]
}

/**
 * ONLINE_UNAVAILABLE 안내: 인터넷 / 중계 서버 / 외부 API 문제. 원음은 보존된다.
 * 자동 재시도하지 않는다 — "다시 시도"는 사용자가 눌러 중계 서버 연결을 다시 확인한다.
 */
export function OnlineUnavailableNotice() {
  const { state, engineKind, checkOnline } = useApp()
  const t = useT()
  if (engineKind !== 'online' || state.online.status !== 'unavailable') return null
  return (
    <Notice
      tone="danger"
      action={
        <button type="button" className="btn sm primary" onClick={() => void checkOnline()}>
          {t.online.retry}
        </button>
      }
    >
      <b>{t.online.unavailableTitle}</b>
      <div>{t.online.unavailableBody}</div>
      {state.online.error && <div className="small muted">{t.online.engineMessage}: {state.online.error}</div>}
      <Link to="/settings#engine" className="small" style={{ textDecoration: 'underline', fontWeight: 600 }}>
        {t.online.toOffline}
      </Link>
    </Notice>
  )
}

/** 온라인 분석 개인정보 고지 문단 (설정 화면·동의 창 공통) */
export function PrivacyText() {
  const t = useT()
  return (
    <>
      <p style={{ fontWeight: 700 }}>{t.online.privacyTitle}</p>
      <p className="small">{t.online.privacyBody}</p>
    </>
  )
}

/**
 * 첫 온라인 분석 전 동의 창. 동의하면 preferences.onlineConsent 에 기억하고 원래 하려던 분석을 이어간다.
 * 동의하지 않으면 분석하지 않는다 (오프라인 모드로 전환 링크 제공).
 */
export function ConsentDialog({ open, onAgree, onCancel }: { open: boolean; onAgree: () => void; onCancel: () => void }) {
  const t = useT()
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal?.()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} className="dialog" aria-labelledby="consent-title" onCancel={(e) => (e.preventDefault(), onCancel())}>
      <div className="dialog-head">
        <StatusMark shape="triangle" size={16} outline={false} />
        <h2 id="consent-title">{t.online.consentTitle}</h2>
      </div>
      <PrivacyText />
      <div className="btn-stack">
        <button type="button" className="btn primary lg block" onClick={onAgree}>
          {t.online.consentAgree}
        </button>
        <button type="button" className="btn md block" onClick={onCancel}>
          {t.common.cancel}
        </button>
        <Link to="/settings#engine" className="btn text" onClick={onCancel}>
          {t.online.toOffline}
        </Link>
      </div>
    </dialog>
  )
}
