import type { LangCode, TaskVersion } from 'marinear-engine'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../app/AppContext'
import { buildFeed, engineStatus, type Filter, type GapEntry } from '../../app/state'
import { CATALOG, findTerminal } from '../../contracts/catalog'
import { LANGS } from '../../contracts/lang'
import { formatMs, needsReview } from '../../contracts/labels'
import { useT } from '../../i18n'
import { Badge, Contour, DemoBadge, EmptyState, EngineBadge, InputBadge, LevelMeter, Notice, Segmented, StatusLabel, StatusMark } from '../../ui/components'
import { UtteranceCard } from './UtteranceCard'

/** 장소 표기: 카탈로그 표시명 + 선석 라벨 (카탈로그에 없으면 코드 그대로) */
export function placeText(terminalId: string | null, berthId: string | null): string {
  const terminal = findTerminal(CATALOG, terminalId)
  const berth = terminal?.berths.find((b) => b.berthId === berthId)
  return [terminal?.displayName ?? terminalId, berth?.label ?? berthId].filter(Boolean).join(' ')
}

/** 02 "현재 작업 기준" 칸 (등고선 장식). 부두 설명은 카탈로그에 없어 표시하지 않는다 */
export function TaskRef({ task }: { task: TaskVersion }) {
  const t = useT()
  return (
    <Link to="/task" className="card task-ref" aria-label={t.monitor.taskRef}>
      <Contour />
      <span className="place">{placeText(task.terminalId, task.berthId) || t.common.unconfirmed}</span>
      <span className="sub">
        <span style={{ fontWeight: 600 }}>{task.targetVessel}</span>
        <span className="chip">v{task.version}</span>
      </span>
    </Link>
  )
}

/** 교신 목록 안의 수신 누락 구간 */
function GapCard({ gap }: { gap: GapEntry }) {
  const t = useT()
  const { startMs, endMs, reason, missingSeq } = gap.gap
  return (
    <article className="card soft utt" aria-label={t.monitor.gap} style={{ borderStyle: 'dashed' }}>
      <StatusMark className="mark" shape="triangle" />
      <div className="utt-head">
        <StatusLabel tone="alert">{t.monitor.gap}</StatusLabel>
        <span className="time">
          {formatMs(startMs)}
          {endMs !== null ? `–${formatMs(endMs)}` : ''}
        </span>
      </div>
      <p className="small">{t.gapReason[reason]}</p>
      <p className="small muted">{t.monitor.gapHint(missingSeq ? `${missingSeq.from}–${missingSeq.to}` : null)}</p>
    </article>
  )
}

/** 02 교신 모니터링 */
export function MonitorPage() {
  const { state, dispatch, demoAvailable, startDemo, startFile, startLive, stop, setLang } = useApp()
  const t = useT()
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const { session, inputState, engineState, messageState, uiState, taskState, preferences, wakeLock } = state
  const running = session.source !== null
  const task = taskState.active
  const readiness = engineState.readiness
  // 작업이 없으면 세션을 열 수 없고(openSession 은 taskId 필수), 모델이 없으면 MODEL_NOT_READY
  const blockedReason = !task ? 'no-task' : !readiness ? 'loading' : !readiness.canAnalyze ? 'model' : null

  // 발화와 누락 구간을 세션 시간순으로 (최신이 위)
  const feed = buildFeed(state, uiState.filter)
  const live = session.source === 'live'
  const liveGaps = live ? state.gaps.filter((g) => g.sessionId === session.sessionId).length : 0
  const livePending = messageState.order.filter((id) => {
    const r = messageState.byId[id]?.result
    return r && needsReview(r.comparison.kind) && (state.reviewState[id] ?? 'unreviewed') === 'unreviewed'
  }).length
  const pending = Math.max(livePending, state.pendingReviews)
  const wakeText = { active: t.monitor.wake.active, unsupported: t.monitor.wake.unsupported, released: t.monitor.wake.released, failed: t.monitor.wake.failed, off: '' }[wakeLock]

  return (
    <>
      <h1>{t.monitor.title}</h1>

      {!task && taskState.loaded && (
        <Notice
          tone="warn"
          action={
            <Link className="btn sm primary" to="/task">
              {t.monitor.registerTask}
            </Link>
          }
        >
          {t.monitor.noTask}
        </Notice>
      )}

      {task && blockedReason === 'model' && (
        <Notice
          tone="warn"
          action={
            <Link className="btn sm primary" to="/settings#engine">
              {t.monitor.toSettings}
            </Link>
          }
        >
          <b>{t.engine.degraded}</b>
          <div>{state.assets.loading ? t.monitor.modelLoading : t.monitor.modelNeeded}</div>
        </Notice>
      )}

      {task && <TaskRef task={task} />}

      <div className="inline-field">
        <label htmlFor="monitor-lang">{t.monitor.translationLang}</label>
        <select id="monitor-lang" className="select sm" value={preferences.targetLang} onChange={(e) => setLang(e.target.value as LangCode)}>
          {LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.native}
            </option>
          ))}
        </select>
      </div>

      <div className="btn-grid">
        {live ? (
          <button className="btn alert" onClick={() => void stop()}>
            ■ {t.monitor.stopLive}
          </button>
        ) : (
          <button className="btn primary" onClick={() => void startLive()} disabled={running || blockedReason !== null || inputState.status === 'requesting'}>
            ● {t.monitor.startLive}
          </button>
        )}
        <button className="btn" onClick={() => fileRef.current?.click()} disabled={running || blockedReason !== null}>
          {session.source === 'file' ? t.monitor.sendingFile : t.monitor.analyzeFile}
        </button>
        {demoAvailable && (
          <button className="btn" style={{ gridColumn: '1 / -1' }} onClick={() => void startDemo()} disabled={running}>
            {session.source === 'demo' ? t.monitor.demoPlaying : t.monitor.demo}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) {
              setFileName(f.name)
              void startFile(f)
            }
            e.target.value = ''
          }}
        />
      </div>

      {/* 입력·엔진 상태 (시안에 없는 상태 — 같은 배지 언어로) */}
      <div className="status-strip" aria-label={t.monitor.statusLabel}>
        <InputBadge status={inputState.status} />
        <EngineBadge status={engineStatus(state)} queueDepth={engineState.queueDepth} />
        {live && inputState.engine && (
          <Badge tone={inputState.engine === 'receiving' && liveGaps === 0 ? 'ok' : inputState.engine === 'disconnected' ? 'danger' : 'warn'}>
            {inputState.engine === 'receiving' || inputState.engine === 'gap' ? (liveGaps > 0 ? t.monitor.receivingGaps(liveGaps) : t.liveInput.receiving) : t.liveInput[inputState.engine]}
          </Badge>
        )}
        {session.source === 'demo' && <DemoBadge label={t.monitor.demoMode} />}
        {readiness?.fixtureMode && <DemoBadge label={t.monitor.fixtureEngine} />}
      </div>

      {live && inputState.status === 'capturing' && (
        <div className="card soft">
          <LevelMeter level={inputState.level} />
          <p className="small muted">
            {inputState.detail}
            {wakeText ? ` · ${wakeText}` : ''}
          </p>
          <p className="small">{t.monitor.keepScreenOn}</p>
        </div>
      )}
      {session.source === 'file' && <p className="small muted">{t.monitor.fileSending(fileName)}</p>}
      {(inputState.status === 'error' || inputState.status === 'disconnected') && inputState.detail && <Notice tone="danger">{inputState.detail}</Notice>}

      <Segmented<Filter>
        label={t.monitor.filterLabel}
        value={uiState.filter}
        onChange={(filter) => dispatch({ type: 'set-filter', filter })}
        options={[
          { value: 'all', label: t.monitor.filterAll },
          { value: 'mine', label: t.monitor.filterMine },
          { value: 'review', label: pending ? `${t.monitor.filterReview} ${pending}` : t.monitor.filterReview },
        ]}
      />

      {feed.length === 0 ? (
        messageState.order.length === 0 && state.gaps.length === 0 ? (
          <EmptyState title={running ? t.monitor.emptyWaiting : t.monitor.emptyTitle}>{running ? t.monitor.emptyWaitingHint : demoAvailable ? t.monitor.emptyHintDemo : t.monitor.emptyHint}</EmptyState>
        ) : (
          <EmptyState title={t.monitor.emptyFiltered}>{t.monitor.emptyFilteredHint}</EmptyState>
        )
      ) : (
        <div className="timeline-rail">
          {feed.map((item) => (item.kind === 'gap' ? <GapCard key={item.gap.id} gap={item.gap} /> : <UtteranceCard key={item.entry.utterance.utteranceId} entry={item.entry} />))}
        </div>
      )}
    </>
  )
}
