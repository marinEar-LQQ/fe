import { DEFAULT_ASSET_MANIFEST, type AssetStatus, type LoadProgress, type ModelRole, type Readiness } from 'marinear-engine'
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useApp } from '../../app/AppContext'
import { engineStatus } from '../../app/state'
import { getOfflineModePref, setOfflineModePref } from '../../engine'
import { LANGS } from '../../contracts/lang'
import { ASSET_STATUS_LABEL, LANG_AVAILABILITY_LABEL } from '../../contracts/labels'
import { Badge, Card, EngineBadge, Notice } from '../../ui/components'

const ASSET_TONE = { ready: 'ok', missing: 'warn', downloading: 'info', verifying: 'info', integrity_failed: 'danger', error: 'danger' } as const
const LANG_TONE = { source: 'muted', ready: 'ok', not_installed: 'warn', unsupported: 'muted' } as const
const ROLE_LABEL: Record<ModelRole, string> = { asr: '음성인식', translation: '번역', enhancer: '잡음 완화', vad: '발화 감지', tokenizer: '토크나이저' }
const SELF_TEST_LABEL = { pass: ['ok', '자체 검사 통과'], fail: ['danger', '자체 검사 실패'], not_run: ['muted', '자체 검사 전'] } as const

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
    // 다운로드 중에는 진행률의 상태가 최신이다 (readiness.models 는 load 가 끝나야 갱신됨)
    const status: AssetStatus = loading && p ? p.status : (r?.status ?? p?.status ?? 'missing')
    return { modelId, role: r?.role ?? manifest?.role ?? 'asr', license: manifest?.license ?? null, status, selfTest: r?.selfTest ?? 'not_run', progress: p }
  })
}

export function EnginePanel() {
  const { state, engineKind, engineOffline, loadModels, refreshReadiness } = useApp()
  const [offlinePref, setOfflinePref] = useState(getOfflineModePref)
  const needsReload = engineKind === 'worker' && offlinePref !== engineOffline
  const liveRunning = state.session.source !== null
  const { readiness } = state.engineState
  const { loading, progress, error } = state.assets
  const list = rows(readiness, progress, loading)
  const anyReady = list.some((r) => r.status === 'ready')
  const { hash } = useLocation()

  // 교신 화면의 "설정으로" 링크(/settings#engine)로 오면 이 카드로 스크롤
  useEffect(() => {
    if (hash === '#engine') document.getElementById('engine')?.scrollIntoView({ block: 'start' })
  }, [hash])

  return (
    <Card>
      <div id="engine" className="card-title-row">
        <h2>분석 엔진 · 오프라인 준비</h2>
        {readiness && (readiness.offlineReady ? <Badge tone="ok">오프라인 준비 완료</Badge> : <Badge tone="warn">오프라인 준비 미완료</Badge>)}
      </div>

      <div className="status-strip" style={{ marginBottom: 12 }}>
        <EngineBadge status={engineStatus(state)} queueDepth={state.engineState.queueDepth} />
        {readiness && (readiness.canAnalyze ? <Badge tone="ok">분석 가능</Badge> : <Badge tone="warn">모델 준비 필요</Badge>)}
        {readiness?.catalog && (
          <Badge tone={readiness.catalog.kind === 'demo' ? 'demo' : 'muted'} title="장소 카탈로그">
            {readiness.catalog.catalogVersion}
            {readiness.catalog.kind === 'demo' ? ' · 시연용' : ''}
          </Badge>
        )}
      </div>

      {readiness?.fixtureMode && (
        <div style={{ marginBottom: 12 }}>
          <Notice tone="warn">현재 시연(Mock) 엔진입니다. 자막·비교·번역은 시연용 고정 데이터이며 실제 음성 분석이 아닙니다. 모델 다운로드가 필요 없습니다.</Notice>
        </div>
      )}
      {error && (
        <div style={{ marginBottom: 12 }}>
          <Notice tone="danger">모델 준비에 실패했습니다: {error}</Notice>
        </div>
      )}

      {engineKind === 'worker' && (
        <div className="btn-row" style={{ marginBottom: 12 }}>
          <button className="btn primary" onClick={() => void loadModels()} disabled={loading}>
            {loading ? '모델 준비 중…' : anyReady ? '모델 다시 확인' : '모델 다운로드'}
          </button>
          <button className="btn ghost" onClick={() => void refreshReadiness()} disabled={loading}>
            상태 새로고침
          </button>
        </div>
      )}
      {engineKind === 'worker' && !anyReady && !loading && (
        <p className="small muted">
          처음 한 번은 모델 <b>약 565MB</b>(음성인식 whisper-small 약 250MB + 번역 Opus-MT 3개 약 315MB)를 내려받습니다. Wi-Fi 에서 받으세요. 받은 뒤에는 기기 안에서만 분석합니다.
          {engineOffline && ' 지금은 오프라인 모드라 내려받을 수 없습니다 — 아래에서 끄고 새로고침하세요.'}
        </p>
      )}

      {engineKind === 'worker' && (
        <div style={{ margin: '0 0 12px' }}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44 }}>
            <input
              type="checkbox"
              checked={offlinePref}
              onChange={(e) => {
                setOfflineModePref(e.target.checked)
                setOfflinePref(e.target.checked)
              }}
              style={{ width: 22, height: 22 }}
            />
            오프라인 모드 (현장용)
            <span className={`badge ${engineOffline ? 'ok' : 'muted'}`}>{engineOffline ? '적용 중' : '꺼짐'}</span>
          </label>
          <p className="small muted" style={{ margin: '0 0 0 32px' }}>
            켜면 이미 받아 둔 모델만 쓰고 인터넷 요청을 막습니다(allowRemote:false). 모델을 처음 받거나 업데이트할 때는 끄세요.
          </p>
          {needsReload && (
            <div style={{ marginTop: 8 }}>
              <Notice
                tone="warn"
                action={
                  <button className="btn sm primary" onClick={() => window.location.reload()}>
                    지금 새로고침
                  </button>
                }
              >
                오프라인 모드 {offlinePref ? '켜기' : '끄기'}는 새로고침하면 적용됩니다.{liveRunning && ' 지금 진행 중인 수신·분석은 중단됩니다.'}
              </Notice>
            </div>
          )}
        </div>
      )}

      <ul className="timeline">
        {list.map((m) => {
          const pct = percent(m.progress)
          const [stTone, stText] = SELF_TEST_LABEL[m.selfTest]
          const showBar = m.status === 'downloading' || m.status === 'verifying'
          return (
            <li key={m.modelId} style={{ gridTemplateColumns: '1fr auto' }}>
              <div>
                <div className="t-title" style={{ fontWeight: 600 }}>
                  {ROLE_LABEL[m.role]} · <span className="mono small">{m.modelId}</span>
                </div>
                <div className="t-detail">
                  {m.progress && m.progress.loadedBytes > 0 && (
                    <>
                      {fmtMB(m.progress.loadedBytes)}
                      {m.progress.totalBytes ? ` / ${fmtMB(m.progress.totalBytes)}` : ''}
                      {pct !== null && m.status === 'downloading' ? ` · ${pct}%` : ''}
                      {' · '}
                    </>
                  )}
                  {m.license}
                </div>
                {showBar && (
                  <progress
                    max={100}
                    value={m.status === 'downloading' && pct !== null ? pct : undefined}
                    aria-label={`${m.modelId} ${ASSET_STATUS_LABEL[m.status]}`}
                    style={{ width: '100%', marginTop: 6 }}
                  />
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                <Badge tone={ASSET_TONE[m.status]}>
                  {ASSET_STATUS_LABEL[m.status]}
                  {m.status === 'downloading' && pct !== null ? ` ${pct}%` : ''}
                </Badge>
                <Badge tone={stTone}>{stText}</Badge>
              </div>
            </li>
          )
        })}
      </ul>

      <h3 style={{ margin: '16px 0 8px', fontSize: '1rem' }}>번역 언어 자원</h3>
      <dl className="kv">
        {LANGS.map((l) => {
          const a = readiness?.languages[l.code]
          return (
            <div key={l.code} style={{ display: 'contents' }}>
              <dt>{l.label}</dt>
              <dd>{a ? <Badge tone={LANG_TONE[a]}>{l.code === 'ko' ? '원문' : a === 'ready' ? '사용 가능' : LANG_AVAILABILITY_LABEL[a]}</Badge> : '-'}</dd>
            </div>
          )
        })}
      </dl>

      {readiness && (
        <p className="small muted">
          엔진 저장 공간: {fmtMB(readiness.storage.usageBytes)} / {fmtMB(readiness.storage.quotaBytes)}
        </p>
      )}
      <p className="small muted" style={{ marginBottom: 0 }}>
        모델·장소 데이터·선택 언어 번역 자원이 모두 기기에 있고 자체 검사를 통과해야 오프라인 준비 완료로 표시됩니다. 앱 설치(홈 화면 추가) 여부와는 별개입니다.
      </p>
    </Card>
  )
}
