import type { AudioVariant } from 'marinear-engine'
import { useEffect, useRef, useState } from 'react'
import { useApp } from '../../app/AppContext'
import { describeError } from '../../app/errors'
import { useT } from '../../i18n'

/** 카드·일지의 "음성 듣기": 엔진에 저장된 발화 음성(getAudioClip)을 바로 재생한다 */
export function useClipPlayer() {
  const { engine } = useApp()
  const t = useT()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)
  const [msg, setMsg] = useState<{ id: string; text: string } | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)

  useEffect(
    () => () => {
      audioRef.current?.pause()
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    },
    [],
  )

  async function play(utteranceId: string, variant: AudioVariant = 'raw') {
    try {
      const clip = await engine.getAudioClip(utteranceId, variant)
      if (clip.status !== 'available' || !clip.blob) {
        setMsg({ id: utteranceId, text: t.clip[clip.status === 'available' ? 'missing' : clip.status] })
        return
      }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      const url = URL.createObjectURL(clip.blob)
      urlRef.current = url
      const audio = audioRef.current ?? new Audio()
      audioRef.current = audio
      audio.src = url
      audio.onended = () => setPlaying(null)
      await audio.play()
      setPlaying(utteranceId)
      setMsg(null)
    } catch (e) {
      setMsg({ id: utteranceId, text: t.clip.failed(describeError(e).message) })
    }
  }

  function stop() {
    audioRef.current?.pause()
    setPlaying(null)
  }

  return { play, stop, playing, msgFor: (id: string) => (msg?.id === id ? msg.text : null) }
}
