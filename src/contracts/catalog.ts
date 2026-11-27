/**
 * 시연용 장소 카탈로그 (demo-catalog-v1)
 * ⚠️ PNIT/HPNT, T1~T3 는 기획 시안의 시연 예시다. 실제 부두·터미널·선석 목록과 별칭은
 *    백엔드가 검증한 CatalogManifest 로 교체한다. 화면에서 임의로 실재 장소 대응을 추가하지 않는다.
 */
export interface TerminalEntry {
  terminalId: string
  displayName: string
  aliases: string[]
  berths: string[]
}

export interface Catalog {
  catalogVersion: string
  isDemo: boolean
  terminals: TerminalEntry[]
}

export const DEMO_CATALOG: Catalog = {
  catalogVersion: 'demo-catalog-v1',
  isDemo: true,
  terminals: [
    { terminalId: 'PNIT', displayName: 'PNIT', aliases: ['피엔아이티'], berths: ['T1', 'T2', 'T3'] },
    { terminalId: 'HPNT', displayName: 'HPNT', aliases: ['에이치피엔티'], berths: ['T1', 'T2', 'T3'] },
  ],
}

export function findTerminal(catalog: Catalog, terminalId: string | null): TerminalEntry | undefined {
  if (!terminalId) return undefined
  return catalog.terminals.find((t) => t.terminalId === terminalId)
}

/** 장소 유효성 검사: 터미널이 카탈로그에 있고, 선석이 해당 터미널에 허용되는지 */
export function validatePlace(
  catalog: Catalog,
  terminalId: string | null,
  berthId: string | null,
): { ok: true } | { ok: false; field: 'terminalId' | 'berthId'; message: string } {
  if (!terminalId) return { ok: false, field: 'terminalId', message: '터미널을 선택하세요.' }
  const t = findTerminal(catalog, terminalId)
  if (!t) return { ok: false, field: 'terminalId', message: '카탈로그에 없는 터미널입니다.' }
  if (berthId && !t.berths.includes(berthId))
    return { ok: false, field: 'berthId', message: `${t.displayName}에 없는 선석입니다.` }
  return { ok: true }
}
