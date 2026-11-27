// dist 정리. Node 24 의 재귀 fs.rmSync 가 Windows 비ASCII 경로(예: "바탕 화면")에서 프로세스를 죽이는 문제가 있어
// (Vite emptyOutDir 도 같은 호출) 파일 단위 unlink + 비재귀 rmdir 로 직접 지운다.
import { existsSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

function remove(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) remove(p)
    else unlinkSync(p)
  }
  rmdirSync(dir)
}

const target = process.argv[2] ?? 'dist'
if (existsSync(target)) remove(target)
