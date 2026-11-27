import type { LangCode } from 'marinear-engine'
import { useEffect, useState } from 'react'
import { useApp } from '../../app/AppContext'
import { listAudioInputs } from '../../audio/capture'
import { LANGS } from '../../contracts/lang'
import { useT } from '../../i18n'
import { Card, Switch } from '../../ui/components'
import { DemoPrepPanel } from './DemoPrepPanel'
import { EnginePanel } from './EnginePanel'
import { useEngineModeLabel } from './online'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

const fmtBytes = (n?: number) => (n === undefined ? '-' : n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.round(n / 1e6)} MB`)

/** 08 설정 — 시안 순서: 제목 → 언어 → 준비 상태 → 잡음 완화와 재확인 → (엔진·장치·시연·저장 공간·설치) */
export function SettingsPage() {
  const { state, dispatch, setLang, engineKind } = useApp()
  const t = useT()
  const { preferences, inputState } = state
  const modeLabel = useEngineModeLabel()
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [storage, setStorage] = useState<{ usage?: number; quota?: number; persisted?: boolean } | null>(null)
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null)
  const [persistMsg, setPersistMsg] = useState<string | null>(null)
  const [shell, setShell] = useState<{ version: string; files: number } | 'none' | null>(null)
  const installed = window.matchMedia?.('(display-mode: standalone)').matches

  // 앱 화면(shell) 캐시 상태: 활성 Service Worker 에 버전을 묻는다. 개발 서버에서는 SW 를 등록하지 않는다.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return void setShell('none')
    void navigator.serviceWorker.getRegistration().then((reg) => {
      const sw = reg?.active
      if (!sw) return setShell('none')
      const ch = new MessageChannel()
      ch.port1.onmessage = (e: MessageEvent<{ version: string; files: number }>) => setShell(e.data)
      sw.postMessage('version', [ch.port2])
    })
  }, [])

  useEffect(() => {
    void listAudioInputs().then(setDevices)
    void (async () => {
      const est = await navigator.storage?.estimate?.()
      const persisted = await navigator.storage?.persisted?.()
      setStorage({ usage: est?.usage, quota: est?.quota, persisted })
    })()
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setInstallEvt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const labelsHidden = devices.length > 0 && devices.every((d) => !d.label)
  const readiness = state.engineState.readiness
  const engineReady = Boolean(readiness?.canAnalyze) && (engineKind !== 'online' || state.online.status === 'ok')
  // 준비 상태 — 음성 입력
  const input =
    inputState.status === 'capturing'
      ? { ok: true, text: `${t.settings.inputConnected} · ${inputState.device?.label || t.monitor.defaultInput}` }
      : inputState.status === 'requesting'
        ? { ok: null, text: t.input.requesting }
        : inputState.issue
          ? { ok: false, text: t.capture[inputState.issue.kind] }
          : { ok: false, text: devices.length ? t.settings.inputBefore : t.settings.inputNone }

  return (
    <>
      <h1>{t.settings.title}</h1>

      {/* 언어 */}
      <Card>
        <div className="inline-field">
          <label htmlFor="lang" style={{ fontSize: 'var(--fs-md)', fontWeight: 700 }}>
            {t.settings.language}
          </label>
          <select id="lang" className="select sm" value={preferences.targetLang} onChange={(e) => setLang(e.target.value as LangCode)} style={{ minWidth: 190 }}>
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.native}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {/* 준비 상태 */}
      <Card>
        <h2>{t.settings.readiness}</h2>
        <div className="status-row">
          <span>{t.settings.voiceInput}</span>
          <strong className={input.ok === null ? '' : input.ok ? 'ok' : 'alert'}>{input.text}</strong>
        </div>
        <div className="status-row">
          <span>{t.settings.engineRow}</span>
          <strong className={engineReady ? 'ok' : 'alert'}>
            {engineReady ? t.settings.engineReady : t.settings.engineNotReady}
            {modeLabel ? ` · ${modeLabel}` : ''}
          </strong>
        </div>
      </Card>

      {/* 잡음 완화와 재확인 — 엔진에 끄는 옵션이 없어 스위치 대신 상태로 표시 */}
      <Card>
        <h2>{t.settings.noiseTitle}</h2>
        <div className="setting-row">
          <span>{t.settings.noise}</span>
          <strong className="ok">{t.settings.alwaysOn}</strong>
        </div>
        <div className="setting-row">
          <span>{t.settings.crossCheck}</span>
          <strong className="ok">{t.settings.alwaysOn}</strong>
        </div>
        <p className="small muted">{t.settings.alwaysOnHint}</p>
      </Card>

      <EnginePanel />

      {/* 음성 입력 장치 */}
      <Card>
        <h2>{t.settings.device}</h2>
        <div className="field">
          <label htmlFor="dev">{t.settings.deviceLabel}</label>
          <select id="dev" value={preferences.inputDeviceId ?? ''} onChange={(e) => dispatch({ type: 'set-pref', prefs: { inputDeviceId: e.target.value || null } })}>
            <option value="">{t.settings.defaultDevice}</option>
            {devices.map((d, i) => (
              <option key={d.deviceId || i} value={d.deviceId}>
                {d.label || t.settings.deviceN(i + 1)}
              </option>
            ))}
          </select>
        </div>
        <p className="small muted">
          {devices.length === 0 ? `${t.settings.noDevices} ` : labelsHidden ? `${t.settings.labelsHidden} ` : ''}
          {t.settings.deviceHint}
        </p>
      </Card>

      {/* 화면 */}
      <Card>
        <h2>{t.settings.display}</h2>
        <div className="setting-row">
          <span>{t.settings.largeText}</span>
          <Switch checked={preferences.largeText} label={t.settings.largeText} onText={t.settings.on} offText={t.settings.off} onChange={(v) => dispatch({ type: 'set-pref', prefs: { largeText: v } })} />
        </div>
      </Card>

      <DemoPrepPanel />

      {/* 저장 공간 */}
      <Card>
        <h2>{t.settings.storage}</h2>
        <div className="status-row">
          <span>{t.settings.used}</span>
          <strong>{fmtBytes(storage?.usage)}</strong>
        </div>
        <div className="status-row">
          <span>{t.settings.available}</span>
          <strong>{fmtBytes(storage?.quota)}</strong>
        </div>
        <div className="status-row">
          <span>{t.settings.persist}</span>
          <strong className={storage?.persisted ? 'ok' : ''}>{storage?.persisted === undefined ? t.settings.unsupported : storage.persisted ? t.settings.granted : t.settings.notGranted}</strong>
        </div>
        {storage?.persisted === false && (
          <button
            className="btn sm"
            style={{ alignSelf: 'flex-start' }}
            onClick={async () => {
              const ok = await navigator.storage.persist()
              setStorage((s) => ({ ...s, persisted: ok }))
              setPersistMsg(ok ? t.settings.persistOk : t.settings.persistNo)
            }}
          >
            {t.settings.persistRequest}
          </button>
        )}
        {persistMsg && <p className="small muted">{persistMsg}</p>}
      </Card>

      {/* 앱 설치 */}
      <Card>
        <h2>{t.settings.install}</h2>
        {installed ? (
          <p className="muted">{t.settings.installed}</p>
        ) : installEvt ? (
          <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => void installEvt.prompt()}>
            {t.settings.installButton}
          </button>
        ) : (
          <p className="small muted">{t.settings.installHint}</p>
        )}
        <p className="small muted">
          {shell === null ? t.settings.shellChecking : shell === 'none' ? t.settings.shellNone : t.settings.shellCached(shell.version, shell.files)}
          <br />
          {t.settings.shellHint}
        </p>
      </Card>
    </>
  )
}
