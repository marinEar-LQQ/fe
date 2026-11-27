import type { AudioFrame } from '../contracts/types'

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

export const CAPTURE_ERROR_TEXT: Record<CaptureErrorKind, string> = {
  insecure: 'HTTPS 또는 localhost 에서만 음성 입력을 사용할 수 있습니다.',
  unsupported: '이 브라우저는 음성 입력(getUserMedia/AudioWorklet)을 지원하지 않습니다.',
  'permission-denied': '마이크(음성 입력) 권한이 거절되었습니다. 브라우저 사이트 설정에서 허용해 주세요.',
  'no-device': '사용 가능한 음성 입력 장치가 없습니다. 무전기 변환 장치가 OS 음성 입력으로 인식되는지 확인하세요.',
  'device-busy': '입력 장치를 다른 앱이 사용 중이거나 열 수 없습니다.',
  unknown: '음성 입력을 시작하지 못했습니다.',
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
    cb.onFrame({ seq: seq++, startMs: Math.round((samples / ctx.sampleRate) * 1000), sampleRate: ctx.sampleRate, channels: 1, pcm }, { rms, peak })
    samples += pcm.length
  }

  let stopped = false
  track.onended = () => {
    if (!stopped) cb.onDisconnected('입력 장치 연결이 끊겼습니다.')
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
