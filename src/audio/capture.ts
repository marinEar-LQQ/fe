import type { AudioFrame } from 'marinear-engine'

/**
 * 현장 입력 흐름: 권한 요청 → audioinput 선택 → 레벨/샘플레이트 확인 → 캡처
 * - 브라우저 자동 잡음 억제·자동 이득·에코 제거를 끄도록 요청하고 실제 적용값(getSettings)을 기록한다.
 * - HTTPS 또는 localhost 같은 보안 컨텍스트가 필요하다.
 */
export interface CaptureInfo {
  deviceId: string | null
  label: string
  sampleRate: number
  appliedSettings: MediaTrackSettings
}

export interface CaptureHandle {
  info: CaptureInfo
  stop: () => Promise<void>
}

export interface CaptureCallbacks {
  onFrame: (frame: Omit<AudioFrame, 'sessionId'>, level: { rms: number; peak: number }) => void
  onDisconnected: (reason: string) => void
}

export type CaptureErrorKind = 'insecure' | 'unsupported' | 'permission-denied' | 'no-device' | 'device-busy' | 'unknown'

export class CaptureError extends Error {
  readonly kind: CaptureErrorKind
  constructor(kind: CaptureErrorKind, message: string) {
    super(message)
    this.kind = kind
  }
}

/** 개발용 오류 메시지(Error.message). 화면 문구는 i18n 의 t.capture[kind] */
export const CAPTURE_ERROR_TEXT: Record<CaptureErrorKind, string> = {
  insecure: 'getUserMedia needs HTTPS or localhost',
  unsupported: 'getUserMedia/AudioWorklet not supported',
  'permission-denied': 'microphone permission denied',
  'no-device': 'no audio input device',
  'device-busy': 'audio input device busy or unreadable',
  unknown: 'could not start audio input',
}

export async function listAudioInputs(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return []
  const all = await navigator.mediaDevices.enumerateDevices()
  return all.filter((d) => d.kind === 'audioinput')
}

export async function startCapture(deviceId: string | null, cb: CaptureCallbacks): Promise<CaptureHandle> {
  if (!window.isSecureContext) throw new CaptureError('insecure', CAPTURE_ERROR_TEXT.insecure)
  if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === 'undefined')
    throw new CaptureError('unsupported', CAPTURE_ERROR_TEXT.unsupported)

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        channelCount: 1,
        noiseSuppression: false,
        autoGainControl: false,
        echoCancellation: false,
      },
    })
  } catch (err) {
    const name = (err as DOMException).name
    if (name === 'NotAllowedError' || name === 'SecurityError') throw new CaptureError('permission-denied', CAPTURE_ERROR_TEXT['permission-denied'])
    if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new CaptureError('no-device', CAPTURE_ERROR_TEXT['no-device'])
    if (name === 'NotReadableError') throw new CaptureError('device-busy', CAPTURE_ERROR_TEXT['device-busy'])
    throw new CaptureError('unknown', `${CAPTURE_ERROR_TEXT.unknown} (${name})`)
  }

  const track = stream.getAudioTracks()[0]
  const ctx = new AudioContext()
  await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}worklets/capture-processor.js`)
  const source = ctx.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(ctx, 'capture-processor')
  const mute = ctx.createGain()
  mute.gain.value = 0 // 스피커로 다시 내보내지 않음 (기존 무전기 스피커 동작 유지)
  source.connect(node).connect(mute).connect(ctx.destination)

  let seq = 0
  let samples = 0
  node.port.onmessage = (ev: MessageEvent<{ pcm: Float32Array; rms: number; peak: number }>) => {
    const { pcm, rms, peak } = ev.data
    const length = pcm.length // onFrame 이 pcm 버퍼를 Worker 로 transfer 하면 length 가 0 이 되므로 먼저 읽는다
    cb.onFrame({ seq: seq++, startMs: Math.round((samples / ctx.sampleRate) * 1000), sampleRate: ctx.sampleRate, channels: 1, pcm }, { rms, peak })
    samples += length
  }

  let stopped = false
  track.onended = () => {
    if (!stopped) cb.onDisconnected('track ended')
  }

  return {
    info: { deviceId: track.getSettings().deviceId ?? deviceId, label: track.label, sampleRate: ctx.sampleRate, appliedSettings: track.getSettings() },
    stop: async () => {
      stopped = true
      node.port.onmessage = null
      stream.getTracks().forEach((t) => t.stop())
      await ctx.close()
    },
  }
}
