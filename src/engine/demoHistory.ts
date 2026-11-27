import type { EngineClient } from 'marinear-engine'
import script1 from 'marinear-engine/fixtures/audio/team/script1_noisy.wav?url'
import script2 from 'marinear-engine/fixtures/audio/team/script2_noisy.wav?url'
import script3 from 'marinear-engine/fixtures/audio/team/script3_noisy.wav?url'
import monoA from 'marinear-engine/fixtures/audio/team3/mono-a.wav?url'
import monoB from 'marinear-engine/fixtures/audio/team3/mono-b.wav?url'
import monoC from 'marinear-engine/fixtures/audio/team3/mono-c.wav?url'

/** 처리한 작업 미리 쌓기에 쓰는 팀 녹음 (엔진의 DEMO_HISTORY_PLAN 과 같은 파일) */
const FILES: { name: string; url: string }[] = [
  { name: 'script1_noisy.wav', url: script1 },
  { name: 'script2_noisy.wav', url: script2 },
  { name: 'script3_noisy.wav', url: script3 },
  { name: 'mono-b.wav', url: monoB },
  { name: 'mono-c.wav', url: monoC },
  { name: 'mono-a.wav', url: monoA },
]

/**
 * 첫 실행 자동 쌓기 진행 상태 (시작 화면이 "준비 중"을 보여 주는 데 쓴다).
 * 앱 전체 상태에 넣을 만큼 오래 가는 값이 아니라 작은 구독 저장소로 둔다.
 */
let seeding = false
const listeners = new Set<() => void>()
export const demoSeedStatus = {
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => void listeners.delete(fn)
  },
  get: () => seeding,
  set(v: boolean) {
    seeding = v
    for (const fn of listeners) fn()
  },
}

/** 저장된 작업이 하나도 없을 때 시연 데이터를 자동으로 쌓을지 (VITE_AUTO_DEMO=off 로 끔, 테스트에서는 안 함) */
export const AUTO_DEMO = import.meta.env.MODE !== 'test' && import.meta.env.VITE_AUTO_DEMO !== 'off'

/**
 * 시연 편의: 지난 작업 1개(처리·메모·저장) + 지금 작업의 교신(처리 완료 + 확인 전 장소 차이 1건)을 앱 DB 에 쌓는다.
 * 결과는 "시연 데이터" 배지가 붙는 고정 데이터이고, 음성은 실제 녹음이라 원음 듣기가 된다.
 */
export async function seedDemoHistory(engine: EngineClient): Promise<{ currentTaskId: string; utterances: number }> {
  if (!engine.seedDemoHistory) throw new Error('이 엔진은 시연 데이터 쌓기를 지원하지 않습니다.')
  const files = await Promise.all(FILES.map(async (f) => ({ name: f.name, wav: await fetch(f.url).then((r) => r.arrayBuffer()) })))
  return engine.seedDemoHistory(files)
}
