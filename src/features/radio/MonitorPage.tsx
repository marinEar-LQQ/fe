import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../app/AppContext'
import { engineStatus, type Filter } from '../../app/state'
import { LANGS } from '../../contracts/lang'
import { needsReview } from '../../contracts/labels'
import { Card, DemoBadge, EmptyState, EngineBadge, InputBadge, LevelMeter, Notice, Segmented } from '../../ui/components'
import { UtteranceCard } from './UtteranceCard'

export function MonitorPage() {
  const { state, dispatch, demoAvailable, startDemo, startFile, startLive, stop, setLang } = useApp()
  const fileRef = useRef<HTMLInputElement>(null)
  const { session, inputState, engineState, messageState, uiState, taskState, preferences } = state
  const running = session.source !== null
  const task = taskState.active
  const readiness = engineState.readiness
  // 작업이 없으면 세션을 열 수 없고(openSession 은 taskId 필수), 모델이 없으면 MODEL_NOT_READY
  const blockedReason = !task ? 'no-task' : !readiness ? 'loading' : !readiness.canAnalyze ? 'model' : null

  const entries = messageState.order
    .map((id) => messageState.byId[id])
    .filter((m) => {
      if (uiState.filter === 'all') return true
      const kind = m.result?.comparison.kind
      if (uiState.filter === 'mine') return kind !== 'unrelated'
      return needsReview(kind)
    })
    .reverse() // 최신 교신이 위

  return (
    <>
      {!task && taskState.loaded && (
        <Notice tone="warn" action={<Link className="btn sm primary" to="/task">작업 등록</Link>}>
          등록된 작업이 없어 수신·파일 분석을 시작할 수 없습니다. 오늘 작업을 먼저 등록하세요.
        </Notice>
      )}

      {task && blockedReason === 'model' && (
        <Notice tone="warn" action={<Link className="btn sm primary" to="/settings#engine">설정으로</Link>}>
          <b>모델 준비 필요</b>
          <div className="small">
            {state.assets.loading ? '음성인식 모델을 준비하고 있습니다. 끝나면 수신·파일 분석을 시작할 수 있습니다.' : '음성인식 모델이 준비되지 않아 분석을 시작할 수 없습니다. 설정 › 분석 엔진에서 모델을 내려받으세요.'}
          </div>
        </Notice>
      )}

      {/* 입력·엔진 상태 */}
      <Card>
        <div className="status-strip" style={{ marginBottom: 12 }}>
          <InputBadge status={inputState.status} />
          <EngineBadge status={engineStatus(state)} queueDepth={engineState.queueDepth} />
          {session.source === 'demo' && <DemoBadge label="시연 모드" />}
          {readiness?.fixtureMode && <DemoBadge label="시연 엔진 · 실제 분석 아님" />}
        </div>

        {session.source === 'live' && inputState.status === 'capturing' && (
          <div style={{ marginBottom: 12 }}>
            <LevelMeter level={inputState.level} />
            <div className="small muted" style={{ marginTop: 4 }}>
              {inputState.detail}
            </div>
          </div>
        )}
        {session.source === 'file' && <div className="small muted" style={{ marginBottom: 12 }}>파일을 엔진으로 보내는 중입니다. 결과는 발화마다 아래에 표시됩니다.</div>}
        {(inputState.status === 'error' || inputState.status === 'disconnected') && inputState.detail && (
          <div style={{ marginBottom: 12 }}>
            <Notice tone="danger">{inputState.detail}</Notice>
          </div>
        )}

        <div className="btn-row">
          {session.source === 'live' ? (
            <button className="btn danger" onClick={() => void stop()}>
              ■ 수신 중지
            </button>
          ) : (
            <button className="btn primary" onClick={() => void startLive()} disabled={running || blockedReason !== null || inputState.status === 'requesting'}>
              ● 수신 시작
            </button>
          )}
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={running || blockedReason !== null}>
            {session.source === 'file' ? '파일 전송 중…' : '파일 분석'}
          </button>
          {demoAvailable && (
            <button className="btn ghost" onClick={() => void startDemo()} disabled={running}>
              {session.source === 'demo' ? '시연 재생 중…' : '시연 시나리오'}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void startFile(f)
              e.target.value = ''
            }}
          />
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
        <Segmented<Filter>
          label="교신 필터"
          value={uiState.filter}
          onChange={(filter) => dispatch({ type: 'set-filter', filter })}
          options={[
            { value: 'all', label: '전체' },
            { value: 'mine', label: '내 작업' },
            { value: 'review', label: '재확인' },
          ]}
        />
        <select aria-label="번역 언어" className="btn sm" value={preferences.targetLang} onChange={(e) => setLang(e.target.value as typeof preferences.targetLang)}>
          {LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.code === 'ko' ? '원문만' : l.native}
            </option>
          ))}
        </select>
      </div>

      {entries.length === 0 ? (
        messageState.order.length === 0 ? (
          <EmptyState title={running ? '교신을 기다리는 중' : '아직 교신이 없습니다'}>
            {running ? '발화가 감지되면 분석 진행 상태와 자막이 여기에 표시됩니다.' : demoAvailable ? '수신 시작, 파일 분석 또는 시연 시나리오를 눌러 시작하세요.' : '수신 시작 또는 파일 분석을 눌러 시작하세요.'}
          </EmptyState>
        ) : (
          <EmptyState title="조건에 맞는 교신이 없습니다">필터를 ‘전체’로 바꿔 보세요.</EmptyState>
        )
      ) : (
        entries.map((m) => <UtteranceCard key={m.utterance.utteranceId} entry={m} />)
      )}
    </>
  )
}
