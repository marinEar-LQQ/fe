import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../app/AppContext'
import type { Filter } from '../../app/state'
import { LANGS } from '../../contracts/lang'
import { needsReview } from '../../contracts/labels'
import { Card, DemoBadge, EmptyState, EngineBadge, InputBadge, LevelMeter, Notice, Segmented } from '../../ui/components'
import { UtteranceCard } from './UtteranceCard'

export function MonitorPage() {
  const { state, dispatch, startDemo, startFile, startLive, stop, setLang } = useApp()
  const fileRef = useRef<HTMLInputElement>(null)
  const { session, inputState, engineState, messageState, uiState, taskState, preferences } = state
  const running = Boolean(session.sessionId)
  const task = taskState.active

  const entries = messageState.order
    .map((id) => messageState.byId[id])
    .filter((m) => {
      if (uiState.filter === 'all') return true
      const kind = m.result?.comparison?.kind
      if (uiState.filter === 'mine') return kind !== 'unrelated'
      return needsReview(kind)
    })
    .reverse() // 최신 교신이 위

  return (
    <>
      {!task && (
        <Notice tone="warn" action={<Link className="btn sm primary" to="/task">작업 등록</Link>}>
          등록된 작업이 없어 교신을 비교할 수 없습니다. 자막만 표시됩니다.
        </Notice>
      )}

      {/* 입력·엔진 상태 */}
      <Card>
        <div className="status-strip" style={{ marginBottom: 12 }}>
          <InputBadge status={inputState.status} />
          <EngineBadge status={engineState.status} queueDepth={engineState.queueDepth} />
          {session.source === 'demo' && <DemoBadge label="시연 모드" />}
          {session.source === 'file' && <DemoBadge label="파일 · 시연 결과" />}
          {engineState.readiness?.engineKind === 'mock' && <span className="small muted">Mock 엔진 (실제 분석 아님)</span>}
        </div>

        {session.source === 'live' && inputState.status === 'capturing' && (
          <div style={{ marginBottom: 12 }}>
            <LevelMeter level={inputState.level} />
            <div className="small muted" style={{ marginTop: 4 }}>
              {inputState.detail} · 입력 신호만 확인 중 (분석 엔진 미연결)
            </div>
          </div>
        )}
        {(inputState.status === 'error' || inputState.status === 'disconnected') && inputState.detail && (
          <div style={{ marginBottom: 12 }}>
            <Notice tone="danger">{inputState.detail}</Notice>
          </div>
        )}

        <div className="btn-row">
          {running ? (
            <button className="btn danger" onClick={() => void stop()}>
              ■ {session.source === 'live' ? '수신 중지' : '분석 중지'}
            </button>
          ) : (
            <button className="btn primary" onClick={() => void startLive()} disabled={inputState.status === 'requesting'}>
              ● 수신 시작
            </button>
          )}
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={running}>
            파일 분석
          </button>
          <button className="btn ghost" onClick={() => void startDemo()} disabled={running}>
            시연 시나리오
          </button>
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
            {running
              ? session.source === 'live'
                ? '입력 신호를 확인하고 있습니다. 분석 엔진이 연결되면 자막이 여기에 표시됩니다.'
                : '분석 결과가 곧 표시됩니다.'
              : '수신 시작, 파일 분석 또는 시연 시나리오를 눌러 시작하세요.'}
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
