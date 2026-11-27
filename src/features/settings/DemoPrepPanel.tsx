import { useRef, useState } from 'react'
import { useApp } from '../../app/AppContext'
import { download } from '../../app/download'
import { describeError } from '../../app/errors'
import { seedDemoHistory } from '../../engine/demoHistory'
import { useT } from '../../i18n'
import { Card, Notice } from '../../ui/components'

/**
 * 시연 준비: 실제 모델로 미리 분석해 둔 작업 일지를 JSON 으로 저장했다가 다른 기기·브라우저에서 불러온다.
 * importTaskLog 는 결과의 origin 을 그대로 유지하고 음성은 포함하지 않는다(재생 불가).
 */
export function DemoPrepPanel() {
  const { state, engine, dispatch } = useApp()
  const t = useT()
  const task = state.taskState.active
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null)

  async function exportJson() {
    if (!task) return
    setBusy(true)
    try {
      const file = await engine.exportTaskLog(task.taskId, 'json')
      download(file.filename, file.mimeType, file.content)
      setMsg({ tone: 'info', text: t.prep.saved(file.filename) })
    } catch (e) {
      const { code, message } = describeError(e)
      setMsg({ tone: 'danger', text: t.prep.saveFailed(`${message} (${code})`) })
    } finally {
      setBusy(false)
    }
  }

  /** 처리한 작업 미리 쌓기 → 끝나면 교신 화면을 새로 열어 쌓인 교신을 보여 준다 */
  async function seedHistory() {
    setBusy(true)
    setMsg({ tone: 'info', text: t.prep.seeding })
    try {
      const res = await seedDemoHistory(engine)
      setMsg({ tone: 'info', text: t.prep.seeded(res.utterances) })
      window.setTimeout(() => window.location.assign('/monitor'), 900)
    } catch (e) {
      const { code, message } = describeError(e)
      setMsg({ tone: 'danger', text: t.prep.seedFailed(`${message} (${code})`) })
      setBusy(false)
    }
  }

  async function importJson(file: File) {
    setBusy(true)
    setMsg(null)
    try {
      const imported = await engine.importTaskLog(await file.text())
      // 불러온 작업을 현재 작업으로 (엔진도 task.updated 를 보낸다)
      const log = await engine.getTaskLog(imported.taskId)
      const active = log.versions.find((v) => v.version === log.task.activeVersion) ?? null
      dispatch({ type: 'clear-messages' })
      dispatch({ type: 'task-loaded', task: active })
      setMsg({
        tone: 'info',
        text: t.prep.loaded(file.name, active ? `${active.ownVessel} → ${active.targetVessel} · ${active.terminalId ?? ''} ${active.berthId ?? ''}`.trim() : imported.taskId, log.counts.utterances),
      })
    } catch (e) {
      const { code, message } = describeError(e)
      setMsg({ tone: 'danger', text: t.prep.loadFailed(`${message} (${code})`) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <h2>{t.prep.title}</h2>
      <p className="small muted">{t.prep.hint}</p>
      {msg && (
        <div style={{ marginBottom: 12 }}>
          <Notice tone={msg.tone}>{msg.text}</Notice>
        </div>
      )}
      <button className="btn primary block" onClick={() => void seedHistory()} disabled={busy}>
        {t.prep.seed}
      </button>
      <p className="small muted" style={{ margin: '0 0 12px' }}>
        {t.prep.seedHint}
      </p>
      <div className="btn-row">
        <button className="btn" onClick={() => void exportJson()} disabled={busy || !task}>
          {t.prep.saveJson}
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>
          {t.prep.loadJson}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void importJson(f)
            e.target.value = ''
          }}
        />
      </div>
      {!task && <p className="small muted">{t.prep.needTask}</p>}
    </Card>
  )
}
