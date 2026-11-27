/**
 * 한 번에 하나만 재생: 원음·완화음·카드·단어 구간 재생이 서로 겹치지 않게 한다.
 * 재생을 시작하는 쪽이 자기 "멈춤 함수"를 등록하면, 그 전에 재생하던 쪽은 멈춘다.
 */
let current: (() => void) | null = null

export function claimPlayback(stop: () => void): void {
  if (current && current !== stop) current()
  current = stop
}

export function releasePlayback(stop: () => void): void {
  if (current === stop) current = null
}
