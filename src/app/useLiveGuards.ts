import { useEffect, useRef, type Dispatch } from 'react'
import type { Action } from './state'

/**
 * 실시간 수신 중 보호 장치
 * - Screen Wake Lock 지원 시 화면 꺼짐 방지. 해제되면 알린다.
 * - 화면이 꺼지거나 다른 탭·앱으로 가면 브라우저가 오디오 처리를 멈출 수 있다 → 돌아왔을 때 누락 가능성을 알린다.
 *   (연속 수신을 보장하지 않는다. 엔진 seq 는 이어지므로 이 공백은 AUDIO_GAP 으로 잡히지 않을 수 있다)
 */
export function useLiveGuards(live: boolean, dispatch: Dispatch<Action>) {
  const sentinel = useRef<WakeLockSentinel | null>(null)
  const hiddenAt = useRef<number | null>(null)

  useEffect(() => {
    if (!live) return
    let cancelled = false
    let refused = false // 브라우저가 거절하면 이 수신 세션 동안 다시 요청하지 않는다 (알림 반복 방지)

    const acquire = async () => {
      if (!('wakeLock' in navigator)) {
        dispatch({ type: 'wake-lock', state: 'unsupported' })
        return
      }
      try {
        const s = await navigator.wakeLock.request('screen')
        if (cancelled) {
          void s.release()
          return
        }
        sentinel.current = s
        dispatch({ type: 'wake-lock', state: 'active' })
        s.addEventListener('release', () => {
          if (cancelled || sentinel.current !== s) return
          sentinel.current = null
          dispatch({ type: 'wake-lock', state: 'released' })
          // 화면을 떠나서 해제된 경우는 돌아왔을 때 BACKGROUND_PAUSE 로 한 번만 알린다
          if (document.visibilityState === 'visible')
            dispatch({ type: 'error', code: 'WAKE_LOCK_RELEASED', message: '화면 꺼짐 방지가 해제되었습니다. 화면이 꺼지면 수신이 끊길 수 있으니 화면을 켜 두세요.' })
        })
      } catch (e) {
        if (cancelled) return
        refused = true
        dispatch({ type: 'wake-lock', state: 'failed' })
        dispatch({ type: 'error', code: 'WAKE_LOCK_RELEASED', message: `화면 꺼짐 방지를 켜지 못했습니다 (${(e as Error).message}). 수신 중에는 화면을 직접 켜 두세요.` })
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now()
        return
      }
      if (hiddenAt.current !== null) {
        const secs = Math.max(1, Math.round((Date.now() - hiddenAt.current) / 1000))
        hiddenAt.current = null
        dispatch({
          type: 'error',
          code: 'BACKGROUND_PAUSE',
          message: `약 ${secs}초 동안 화면이 꺼졌거나 다른 탭·앱에 있었습니다. 그동안의 교신은 누락됐을 수 있습니다. 중요한 내용은 기존 무전기로 다시 확인하세요.`,
        })
      }
      if (!sentinel.current && !refused) void acquire() // 화면을 떠나면 브라우저가 wake lock 을 자동 해제하므로 다시 요청
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      hiddenAt.current = null
      const s = sentinel.current
      sentinel.current = null
      void s?.release()
      dispatch({ type: 'wake-lock', state: 'off' })
    }
  }, [live, dispatch])
}
