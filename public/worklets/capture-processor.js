// AudioWorklet: 캡처와 가벼운 처리(모노 변환·RMS)만 한다. 무거운 추론은 Worker 담당.
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.frameSize = 4096 // 전송 단위 샘플 수
    this.buffer = new Float32Array(this.frameSize)
    this.offset = 0
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || input.length === 0) return true
    const ch = input[0]
    for (let i = 0; i < ch.length; i++) {
      // 다채널이면 평균해서 모노로
      let v = ch[i]
      if (input.length > 1) {
        for (let c = 1; c < input.length; c++) v += input[c][i]
        v /= input.length
      }
      this.buffer[this.offset++] = v
      if (this.offset === this.frameSize) {
        let sum = 0
        let peak = 0
        for (let j = 0; j < this.frameSize; j++) {
          const s = this.buffer[j]
          sum += s * s
          const a = Math.abs(s)
          if (a > peak) peak = a
        }
        const pcm = this.buffer
        this.port.postMessage({ pcm, rms: Math.sqrt(sum / this.frameSize), peak }, [pcm.buffer])
        this.buffer = new Float32Array(this.frameSize)
        this.offset = 0
      }
    }
    return true
  }
}

registerProcessor('capture-processor', CaptureProcessor)
