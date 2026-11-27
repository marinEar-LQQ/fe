/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * COOP/COEP: crossOriginIsolated 가 켜져야 ONNX Runtime WASM 이 멀티스레드(SharedArrayBuffer)로 돈다.
 * 백엔드(marinear-engine) 하네스와 같은 값이며, 배포 서버에도 같은 헤더가 필요하다.
 */
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  // marinear-engine Worker 는 ES module 로 번들한다
  worker: { format: 'es' },
  // transformers.js 는 사전 번들하면 ONNX WASM 경로가 깨진다
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
  test: {
    // marinear-engine dist 는 확장자 없는 import(번들러 전용)라 Node ESM 으로 직접 못 읽는다 → Vite 로 변환
    server: { deps: { inline: ['marinear-engine'] } },
  },
})
