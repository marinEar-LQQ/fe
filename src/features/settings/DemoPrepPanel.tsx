import { useRef, useState } from 'react'
import { useApp } from '../../app/AppContext'
import { download } from '../../app/download'
import { describeError } from '../../app/errors'
import { Card, Notice } from '../../ui/components'

/**
 * 시연 준비: 실제 모델로 미리 분석해 둔 작업 일지를 JSON 으로 저장했다가 다른 기기·브라우저에서 불러온다.
 * importTaskLog 는 결과의 origin 을 그대로 유지하고 음성은 포함하지 않는다(재생 불가).
 */
export function DemoPrepPanel() {
  const { state, engine, dispatch } = useApp()
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
      setMsg({ tone: 'info', text: `${file.filename} 을(를) 저장했습니다. 음성은 포함되지 않습니다.` })
    } catch (e) {
      const { code, message } = describeError(e)
      setMsg({ tone: 'danger', text: `저장 실패: ${message} (${code})` })
    } finally {
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
        text: `${file.name} 을(를) 불러왔습니다 — ${active ? `${active.ownVessel} → ${active.targetVessel} · ${active.terminalId ?? ''} ${active.berthId ?? ''}` : imported.taskId}, 교신 ${log.counts.utterances}건. 작업 일지·재확인에서 확인하세요. (음성 미포함)`,
      })
    } catch (e) {
      const { code, message } = describeError(e)
      setMsg({ tone: 'danger', text: `불러오기 실패: ${message} (${code}). 현재 작업은 바뀌지 않았습니다.` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <h2>시연 준비</h2>
      <p className="small muted">실제 모델로 미리 분석한 작업 일지를 JSON 으로 저장해 두었다가, 시연 기기에서 불러와 그대로 보여 줄 수 있습니다. 음성 파일은 포함되지 않아 재생은 되지 않습니다.</p>
      {msg && (
        <div style={{ marginBottom: 12 }}>
          <Notice tone={msg.tone}>{msg.text}</Notice>
        </div>
      )}
      <div className="btn-row">
        <button className="btn" onClick={() => void exportJson()} disabled={busy || !task}>
          현재 작업 일지 JSON 저장
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>
          JSON 불러오기
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
      {!task && <p className="small muted" style={{ marginBottom: 0 }}>저장하려면 먼저 작업을 등록하거나 불러오세요.</p>}
    </Card>
  )
}
