import { useEffect, useState } from 'react'
import { useApp } from '../../app/AppContext'
import { listAudioInputs } from '../../audio/capture'
import { LANGS } from '../../contracts/lang'
import { ASSET_STATUS_LABEL } from '../../contracts/labels'
import { Badge, Card, Notice } from '../../ui/components'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

const fmtBytes = (n?: number) => (n === undefined ? '-' : n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.round(n / 1e6)} MB`)

const ASSET_TONE = { ready: 'ok', missing: 'warn', downloading: 'info', verifying: 'info', integrity_failed: 'danger', error: 'danger' } as const

export function SettingsPage() {
  const { state, dispatch, setLang } = useApp()
  const { preferences, engineState } = state
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [storage, setStorage] = useState<{ usage?: number; quota?: number; persisted?: boolean } | null>(null)
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null)
  const [persistMsg, setPersistMsg] = useState<string | null>(null)
  const installed = window.matchMedia?.('(display-mode: standalone)').matches

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

  const readiness = engineState.readiness
  const labelsHidden = devices.length > 0 && devices.every((d) => !d.label)

  return (
    <>
      <Card>
        <h2>음성 입력</h2>
        <div className="field">
          <label htmlFor="dev">입력 장치</label>
          <select id="dev" value={preferences.inputDeviceId ?? ''} onChange={(e) => dispatch({ type: 'set-pref', prefs: { inputDeviceId: e.target.value || null } })}>
            <option value="">기본 입력 장치</option>
            {devices.map((d, i) => (
              <option key={d.deviceId || i} value={d.deviceId}>
                {d.label || `입력 장치 ${i + 1}`}
              </option>
            ))}
          </select>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          {devices.length === 0 ? '감지된 입력 장치가 없습니다. ' : labelsHidden ? '장치 이름은 첫 수신 시작(권한 허용) 후 표시됩니다. ' : ''}
          무전기 변환 장치가 OS·브라우저에 음성 입력으로 인식되어야 합니다. 입력 레벨은 교신 화면에서 수신 시작 후 확인할 수 있습니다.
        </p>
      </Card>

      <Card>
        <div className="card-title-row">
          <h2>분석 엔진 · 오프라인 준비</h2>
          {readiness && (readiness.offlineReady ? <Badge tone="ok">오프라인 준비 완료</Badge> : <Badge tone="warn">오프라인 준비 미완료</Badge>)}
        </div>
        {readiness?.fixtureMode && (
          <div style={{ marginBottom: 12 }}>
            <Notice tone="warn">현재 시연(Mock) 엔진입니다. 자막·비교·번역은 시연용 고정 데이터이며 실제 음성 분석이 아닙니다.</Notice>
          </div>
        )}
        <ul className="timeline">
          {readiness?.models.map((m) => (
            <li key={m.modelId} style={{ gridTemplateColumns: '1fr auto' }}>
              <div>
                <div className="t-title" style={{ fontWeight: 600 }}>
                  {m.modelId}
                </div>
                <div className="t-detail">{m.role}</div>
              </div>
              <Badge tone={ASSET_TONE[m.status]}>{ASSET_STATUS_LABEL[m.status]}</Badge>
            </li>
          ))}
        </ul>
        <p className="small muted" style={{ marginBottom: 0 }}>
          앱 화면·Worker·WASM·모델·장소 데이터·선택 언어 번역 자원이 모두 로컬에 있고 자체 검사를 통과해야 오프라인 준비 완료로 표시됩니다. 앱 설치 여부와는 별개입니다.
        </p>
      </Card>

      <Card>
        <h2>번역 언어</h2>
        <div className="field">
          <label htmlFor="lang">선원 언어</label>
          <select id="lang" value={preferences.targetLang} onChange={(e) => setLang(e.target.value as typeof preferences.targetLang)}>
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label} {l.code !== 'ko' ? `· ${l.native}` : ''} {l.tier === 'extension' ? '(확장 예정)' : ''}
              </option>
            ))}
          </select>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          한국어 원문은 항상 함께 표시됩니다. 설치되지 않은 언어는 클라우드로 몰래 번역하지 않고 ‘다운로드 필요’로 표시합니다.
        </p>
      </Card>

      <Card>
        <h2>화면</h2>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44 }}>
          <input type="checkbox" checked={preferences.largeText} onChange={(e) => dispatch({ type: 'set-pref', prefs: { largeText: e.target.checked } })} style={{ width: 22, height: 22 }} />
          큰 글씨 (자막 확대)
        </label>
      </Card>

      <Card>
        <h2>저장 공간</h2>
        <dl className="kv">
          <dt>사용 중</dt>
          <dd>{fmtBytes(storage?.usage)}</dd>
          <dt>사용 가능</dt>
          <dd>{fmtBytes(storage?.quota)}</dd>
          <dt>영구 보존 요청</dt>
          <dd>{storage?.persisted === undefined ? '지원 안 됨' : storage.persisted ? '승인됨' : '미승인'}</dd>
        </dl>
        {storage?.persisted === false && (
          <button
            className="btn sm"
            style={{ marginTop: 12 }}
            onClick={async () => {
              const ok = await navigator.storage.persist()
              setStorage((s) => ({ ...s, persisted: ok }))
              setPersistMsg(ok ? '영구 보존이 승인되었습니다. (브라우저가 영구 보존을 보장하지는 않습니다)' : '브라우저가 영구 보존을 승인하지 않았습니다.')
            }}
          >
            영구 보존 요청
          </button>
        )}
        {persistMsg && <p className="small muted">{persistMsg}</p>}
      </Card>

      <Card>
        <h2>앱 설치</h2>
        {installed ? (
          <p className="muted" style={{ margin: 0 }}>홈 화면 앱으로 실행 중입니다.</p>
        ) : installEvt ? (
          <button className="btn primary" onClick={() => void installEvt.prompt()}>
            홈 화면에 설치
          </button>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>
            Android Chrome: 메뉴 ⋮ → ‘홈 화면에 추가’. iPhone Safari: 공유 → ‘홈 화면에 추가’. 조타실에서는 화면을 켜둔 상태로 사용하세요. 화면 잠금·백그라운드에서는 연속 수신을 보장하지 않습니다.
          </p>
        )}
      </Card>
    </>
  )
}
