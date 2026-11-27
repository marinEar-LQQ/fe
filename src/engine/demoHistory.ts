import type { EngineClient } from 'marinear-engine'
import script1 from 'marinear-engine/fixtures/audio/team/script1_noisy.wav?url'
import script2 from 'marinear-engine/fixtures/audio/team/script2_noisy.wav?url'
import script3 from 'marinear-engine/fixtures/audio/team/script3_noisy.wav?url'
import monoB from 'marinear-engine/fixtures/audio/team3/mono-b.wav?url'
import monoC from 'marinear-engine/fixtures/audio/team3/mono-c.wav?url'

/** 처리한 작업 미리 쌓기에 쓰는 팀 녹음 (엔진의 DEMO_HISTORY_PLAN 과 같은 파일) */
const FILES: { name: string; url: string }[] = [
  { name: 'script1_noisy.wav', url: script1 },
  { name: 'script2_noisy.wav', url: script2 },
  { name: 'script3_noisy.wav', url: script3 },
  { name: 'mono-b.wav', url: monoB },
  { name: 'mono-c.wav', url: monoC },
]

/**
 * 시연 편의: 지난 작업 1개(처리·메모·저장) + 지금 작업의 교신 2건(처리 완료)을 앱 DB 에 쌓는다.
 * 결과는 "시연 데이터" 배지가 붙는 고정 데이터이고, 음성은 실제 녹음이라 원음 듣기가 된다.
 */
export async function seedDemoHistory(engine: EngineClient): Promise<{ currentTaskId: string; utterances: number }> {
  if (!engine.seedDemoHistory) throw new Error('이 엔진은 시연 데이터 쌓기를 지원하지 않습니다.')
  const files = await Promise.all(FILES.map(async (f) => ({ name: f.name, wav: await fetch(f.url).then((r) => r.arrayBuffer()) })))
  return engine.seedDemoHistory(files)
}
