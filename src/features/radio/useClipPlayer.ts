import type { AudioVariant } from 'marinear-engine'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../../app/AppContext'
import { describeError } from '../../app/errors'
import { claimPlayback, releasePlayback } from '../../audio/exclusive'
import { useT } from '../../i18n'

/** 발화 안의 일부 구간 (0~1 비율). 단어 시각 정보가 없어 글자 위치로 어림한다 */
export interface ClipRange {
  from: number
  to: number
}

/** 구간 재생 때 앞뒤로 더 들려주는 여유 (어림 위치라 넉넉하게) */
const PAD_BEFORE_S = 1.2
const PAD_AFTER_S = 1.5

/** 카드·일지의 "음성 듣기": 엔진에 저장된 발화 음성(getAudioClip)을 바로 재생한다 */
export function useClipPlayer() {
  const { engine } = useApp()
  const t = useT()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)
  /** 가장 최근 재생 요청 번호 — 음성을 불러오는 사이 다른 요청이 오면 앞의 것은 버린다 (연타 방어) */
  const seqRef = useRef(0)
  const [msg, setMsg] = useState<{ id: string; text: string } | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)

  const stop = useCallback(() => {
    seqRef.current++
    audioRef.current?.pause()
    setPlaying(null)
  }, [])

  useEffect(
    () => () => {
      audioRef.current?.pause()
      releasePlayback(stop)
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    },
    [stop],
  )

  /** key: 재생 중 표시를 구분할 이름 (기본은 발화 id). range: 그 구간만 재생 */
  async function play(utteranceId: string, variant: AudioVariant = 'raw', opts: { key?: string; range?: ClipRange } = {}) {
    const key = opts.key ?? utteranceId
    const seq = ++seqRef.current
    // 다른 곳(다른 카드, 재확인 화면의 원음/완화음)에서 나던 소리를 먼저 멈춘다
    claimPlayback(stop)
    audioRef.current?.pause()
    try {
      const clip = await engine.getAudioClip(utteranceId, variant)
      if (seq !== seqRef.current) return
      if (clip.status !== 'available' || !clip.blob) {
        setMsg({ id: key, text: t.clip[clip.status === 'available' ? 'missing' : clip.status] })
        return
      }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      const url = URL.createObjectURL(clip.blob)
      urlRef.current = url
      const audio = audioRef.current ?? new Audio()
      audioRef.current = audio
      audio.ontimeupdate = null
      audio.src = url
      audio.onended = () => setPlaying(null)
      if (opts.range) {
        if (audio.readyState < 1) await new Promise<void>((res) => audio.addEventListener('loadedmetadata', () => res(), { once: true }))
        if (seq !== seqRef.current) return
        const dur = audio.duration
        if (Number.isFinite(dur) && dur > 0) {
          const end = Math.min(dur, opts.range.to * dur + PAD_AFTER_S)
          audio.currentTime = Math.max(0, opts.range.from * dur - PAD_BEFORE_S)
          audio.ontimeupdate = () => {
            if (audio.currentTime >= end) {
              audio.pause()
              setPlaying(null)
            }
          }
        }
      }
      await audio.play()
      if (seq !== seqRef.current) return void audio.pause()
      setPlaying(key)
      setMsg(null)
    } catch (e) {
      if (seq === seqRef.current) setMsg({ id: key, text: t.clip.failed(describeError(e).message) })
    }
  }

  return { play, stop, playing, msgFor: (id: string) => (msg?.id === id ? msg.text : null) }
}
