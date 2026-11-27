import { DEFAULT_ASSET_MANIFEST, type AssetStatus, type LoadProgress, type ModelRole, type Readiness } from 'marinear-engine'
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useApp } from '../../app/AppContext'
import { getBlockRemotePref, getEngineModePref, setBlockRemotePref, setEngineModePref, type EngineModePref } from '../../engine'
import { LANGS } from '../../contracts/lang'
import { useT } from '../../i18n'
import { Badge, Card, Notice, Segmented, Switch } from '../../ui/components'
import { OnlineUnavailableNotice, PrivacyText, useEngineModeLabel } from './online'

const ASSET_TONE = { ready: 'ok', missing: 'warn', downloading: 'info', verifying: 'info', integrity_failed: 'danger', error: 'danger' } as const
const LANG_TONE = { source: 'muted', ready: 'ok', not_installed: 'warn', unsupported: 'muted' } as const
const SELF_TEST_TONE = { pass: 'ok', fail: 'danger', not_run: 'muted' } as const

const fmtMB = (n: number | null | undefined) => (n == null ? '-' : n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${(n / 1e6).toFixed(1)} MB`)

function percent(p: LoadProgress | undefined): number | null {
  if (!p?.totalBytes) return null
  return Math.min(100, Math.round((p.loadedBytes / p.totalBytes) * 100))
}

interface Row {
  modelId: string
  role: ModelRole
  license: string | null
  status: AssetStatus
  selfTest: Readiness['models'][number]['selfTest']
  progress: LoadProgress | undefined
}

/** manifest 의 모델 목록 + readiness 상태 + 진행률을 한 줄씩 합친다 */
function rows(readiness: Readiness | null, progress: Record<string, LoadProgress>, loading: boolean): Row[] {
  const ids = new Set([...DEFAULT_ASSET_MANIFEST.models.map((m) => m.modelId), ...(readiness?.models.map((m) => m.modelId) ?? [])])
  return [...ids].map((modelId) => {
    const manifest = DEFAULT_ASSET_MANIFEST.models.find((m) => m.modelId === modelId)
    const r = readiness?.models.find((m) => m.modelId === modelId)
    const p = progress[modelId]
    const status: AssetStatus = loading && p ? p.status : (r?.status ?? p?.status ?? 'missing')
    return { modelId, role: r?.role ?? manifest?.role ?? 'asr', license: manifest?.license ?? null, status, selfTest: r?.selfTest ?? 'not_run', progress: p }
  })
}

/** 온라인 모드: 중계 서버 연결 상태 (전사·번역 가능 여부) */
function OnlineStatusRows() {
  const { state, proxyUrl, checkOnline } = useApp()
  const t = useT()
  const { status, translate } = state.online
  const asrText = status === 'ok' ? t.online.ok : status === 'unavailable' ? t.online.no : status === 'checking' ? t.online.checking : t.online.unknown
  const trText = status !== 'ok' ? (status === 'unavailable' ? t.online.no : asrText) : translate ? t.online.ok : t.online.noKey
  const tone = (ok: boolean | null) => (ok === null ? '' : ok ? 'ok' : 'alert')
  return (
    <>
      <div className="status-row">
        <span>{t.online.server}</span>
        <strong className="mono small">{proxyUrl}</strong>
      </div>
      <div className="status-row">
        <span>{t.online.asr}</span>
        <strong className={tone(status === 'ok' ? true : status === 'unavailable' ? false : null)}>{asrText}</strong>
      </div>
      <div className="status-row">
        <span>{t.online.translate}</span>
        <strong className={tone(status === 'ok' ? Boolean(translate) : status === 'unavailable' ? false : null)}>{trText}</strong>
      </div>
      <OnlineUnavailableNotice />
      {status !== 'unavailable' && (
        <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => void checkOnline()} disabled={status === 'checking'}>
          {status === 'checking' ? t.online.checking : t.online.check}
        </button>
      )}
    </>
  )
}

/** 오프라인 모드: 모델 다운로드·진행률·자체 검사 (첫 설치 약 565MB) */
function OfflineModels() {
  const { state, blockRemote, loadModels, refreshReadiness } = useApp()
  const t = useT()
  const { readiness } = state.engineState
  const { loading, progress, error } = state.assets
  const list = rows(readiness, progress, loading)
  const anyReady = list.some((r) => r.status === 'ready')
  const [blockPref, setBlockPref] = useState(getBlockRemotePref)

  return (
    <>
      {error && <Notice tone="danger">{t.engineSettings.modelFailed(error)}</Notice>}
      <div className="btn-row">
        <button className="btn primary" onClick={() => void loadModels()} disabled={loading}>
          {loading ? t.engineSettings.modelPreparing : anyReady ? t.engineSettings.modelRecheck : t.engineSettings.modelDownload}
        </button>
        <button className="btn" onClick={() => void refreshReadiness()} disabled={loading}>
          {t.engineSettings.refresh}
        </button>
      </div>
      {!anyReady && !loading && (
        <p className="small muted">
          {t.engineSettings.sizeNote}
          {blockRemote ? ` ${t.engineSettings.blockedNote}` : ''}
        </p>
      )}

      <ul className="timeline">
        {list.map((m) => {
          const pct = percent(m.progress)
          const showBar = m.status === 'downloading' || m.status === 'verifying'
          return (
            <li key={m.modelId} className="card soft">
              <div className="utt-head">
                <b>
                  {t.engineSettings.roles[m.role]} · <span className="mono small">{m.modelId}</span>
                </b>
              </div>
              <div className="status-strip">
                <Badge tone={ASSET_TONE[m.status]}>
                  {t.assetStatus[m.status]}
                  {m.status === 'downloading' && pct !== null ? ` ${pct}%` : ''}
                </Badge>
                <Badge tone={SELF_TEST_TONE[m.selfTest]}>{t.engineSettings.selfTest[m.selfTest]}</Badge>
              </div>
              <p className="small muted">
                {m.progress && m.progress.loadedBytes > 0 && `${fmtMB(m.progress.loadedBytes)}${m.progress.totalBytes ? ` / ${fmtMB(m.progress.totalBytes)}` : ''} · `}
                {m.license}
              </p>
              {showBar && <progress max={100} value={m.status === 'downloading' && pct !== null ? pct : undefined} aria-label={`${m.modelId} ${t.assetStatus[m.status]}`} style={{ width: '100%' }} />}
            </li>
          )
        })}
      </ul>

      <div className="setting-row">
        <span>
          {t.engineSettings.blockRemote}
          <br />
          <span className="small muted">{t.engineSettings.blockRemoteHint}</span>
        </span>
        <Switch
          checked={blockPref}
          label={t.engineSettings.blockRemote}
          onText={t.settings.on}
          offText={t.settings.off}
          onChange={(v) => {
            setBlockRemotePref(v)
            setBlockPref(v)
          }}
        />
      </div>
      {blockPref !== blockRemote && <ReloadNotice />}
    </>
  )
}

function ReloadNotice() {
  const { state } = useApp()
  const t = useT()
  return (
    <Notice
      tone="warn"
      action={
        <button className="btn sm primary" onClick={() => window.location.reload()}>
          {t.engineSettings.reloadNow}
        </button>
      }
    >
      {t.engineSettings.reloadNeeded}
      {state.session.source !== null && ` ${t.engineSettings.runningWarn}`}
    </Notice>
  )
}

/** 설정 › 엔진 모드·연결 상태 */
export function EnginePanel() {
  const { state, engineKind, proxyUrl } = useApp()
  const t = useT()
  const { readiness } = state.engineState
  const modeLabel = useEngineModeLabel()
  const [modePref, setModePref] = useState<EngineModePref>(getEngineModePref)
  const { hash } = useLocation()
  const needsReload = engineKind !== 'mock' && modePref !== engineKind
  const analyzable = Boolean(readiness?.canAnalyze) && (engineKind !== 'online' || state.online.status === 'ok')

  // 교신 화면의 "설정으로"·"오프라인 모드로 전환"(/settings#engine)으로 오면 이 카드로 스크롤
  useEffect(() => {
    if (hash === '#engine') document.getElementById('engine')?.scrollIntoView({ block: 'start' })
  }, [hash])

  return (
    <Card>
      <div id="engine" className="card-title-row">
        <h2>{t.engineSettings.title}</h2>
        {modeLabel && <span className="chip">{modeLabel}</span>}
      </div>

      {engineKind === 'mock' ? (
        <Notice tone="warn">{t.engineSettings.mockNote}</Notice>
      ) : (
        <>
          <Segmented<EngineModePref>
            label={t.engineSettings.modeLabel}
            value={modePref}
            onChange={(m) => {
              setEngineModePref(m)
              setModePref(m)
            }}
            options={[
              { value: 'online', label: t.engineMode.online },
              { value: 'offline', label: t.engineMode.offline },
            ]}
          />
          <p className="small muted">{modePref === 'online' ? t.engineSettings.modeHintOnline : t.engineSettings.modeHintOffline}</p>
          {needsReload && <ReloadNotice />}
        </>
      )}

      {engineKind === 'online' && (
        <>
          <OnlineStatusRows />
          <div className="card soft" style={{ marginTop: 6 }}>
            <PrivacyText />
            <p className="small">
              <b>{state.preferences.onlineConsent ? t.online.consentGiven : t.online.consentNotGiven}</b>
            </p>
          </div>
        </>
      )}
      {engineKind === 'offline' && <OfflineModels />}

      {readiness && (
        <>
          <div className="status-row">
            <span>{t.engineSettings.canAnalyze}</span>
            <strong className={analyzable ? 'ok' : 'alert'}>{analyzable ? t.engineSettings.yes : t.engineSettings.no}</strong>
          </div>
          {engineKind === 'offline' && (
            <div className="status-row">
              <span>{t.engineSettings.offlineReady}</span>
              <strong className={readiness.offlineReady ? 'ok' : 'alert'}>{readiness.offlineReady ? t.engineSettings.yes : t.engineSettings.no}</strong>
            </div>
          )}
          {readiness.catalog && (
            <div className="status-row">
              <span>{t.engineSettings.catalog}</span>
              <strong className="mono small">
                {readiness.catalog.catalogVersion}
                
              </strong>
            </div>
          )}
          <h3 style={{ marginTop: 6 }}>{t.engineSettings.langResources}</h3>
          {LANGS.map((l) => {
            const a = readiness.languages[l.code]
            return (
              <div key={l.code} className="status-row">
                <span>{l.native}</span>
                <Badge tone={LANG_TONE[a]}>{l.code === 'ko' ? t.langAvailability.source : t.langAvailability[a]}</Badge>
              </div>
            )
          })}
          <p className="small muted">{engineKind === 'online' ? t.engineSettings.onlineFootnote(proxyUrl ?? '') : t.engineSettings.offlineFootnote}</p>
        </>
      )}
    </Card>
  )
}
