/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

/**
 * COOP/COEP: crossOriginIsolated 가 켜져야 ONNX Runtime WASM 이 멀티스레드(SharedArrayBuffer)로 돈다.
 * 백엔드(marinear-engine) 하네스와 같은 값이며, 배포 서버에도 같은 헤더가 필요하다.
 */
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

function listFiles(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)]))
  } catch {
    return []
  }
}

/**
 * 빌드 산출물로 Service Worker 를 만든다 (src/pwa/sw.template.js → dist/sw.js).
 * precache = 해시된 JS/CSS·엔진 Worker 청크·index.html + public 파일(manifest·아이콘·worklet).
 * .wasm 은 미리 받지 않는다: ONNX Runtime 은 transformers.js 가 CDN 에서 받아 자체 캐시에 둔다(엔진 관리).
 * 같은 출처 .wasm 을 쓰게 되면 SW 가 처음 사용할 때 캐시한다.
 */
function serviceWorker(): Plugin {
  let base = '/'
  let publicDir = ''
  return {
    name: 'marinear-sw',
    apply: 'build',
    configResolved(config) {
      base = config.base
      publicDir = config.publicDir
    },
    generateBundle: {
      // index.html 은 Vite HTML 플러그인이 같은 단계에서 내보내므로 맨 뒤에서 실행한다
      order: 'post',
      handler(_options, bundle) {
        const hash = createHash('sha256')
        const files: string[] = []
        for (const [fileName, out] of Object.entries(bundle)) {
          // .woff 는 .woff2 를 못 쓰는 옛 브라우저용 중복이라 뺀다 (글꼴 woff2 는 오프라인 표시를 위해 미리 받음)
          if (fileName.endsWith('.map') || fileName.endsWith('.wasm') || fileName.endsWith('.woff') || fileName === 'sw.js') continue
          files.push(fileName)
          hash.update(fileName).update(out.type === 'chunk' ? out.code : typeof out.source === 'string' ? out.source : Buffer.from(out.source))
        }
        for (const abs of listFiles(publicDir)) {
          const fileName = relative(publicDir, abs).split(sep).join('/')
          files.push(fileName)
          hash.update(fileName).update(readFileSync(abs))
        }
        files.sort()
        const precache = [base, ...files.map((f) => `${base}${f}`)]
        const template = readFileSync(new URL('./src/pwa/sw.template.js', import.meta.url), 'utf8')
        const source = template
          .replace('__SW_VERSION__', JSON.stringify(hash.digest('hex').slice(0, 12)))
          .replace('__SW_PRECACHE__', JSON.stringify(precache, null, 2))
          .replace('__SW_BASE__', JSON.stringify(base))
        this.emitFile({ type: 'asset', fileName: 'sw.js', source })
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serviceWorker()],
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  // marinear-engine Worker 는 ES module 로 번들한다
  worker: { format: 'es' },
  // transformers.js·rnnoise-wasm 은 사전 번들하면 WASM 경로가 깨진다 (marinear-engine README)
  optimizeDeps: { exclude: ['@huggingface/transformers', '@shiguredo/rnnoise-wasm'] },
  test: {
    // marinear-engine dist 는 확장자 없는 import(번들러 전용)라 Node ESM 으로 직접 못 읽는다 → Vite 로 변환
    server: { deps: { inline: ['marinear-engine'] } },
  },
})
