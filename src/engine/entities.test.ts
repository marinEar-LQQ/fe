import type { ResolvedEntities } from 'marinear-engine'
import { describe, expect, it } from 'vitest'
import { extraEntities, formatIdentifier } from './entities'

const e = (over: Partial<ResolvedEntities>): ResolvedEntities => ({ vessel: null, terminalId: null, berthId: null, time: null, distance: null, identifier: null, changeIntent: null, speed: null, course: null, instructions: [], ...over })

describe('extra entities', () => {
  it('lists speed, course, instructions (Korean) and identifier; hides nulls', () => {
    expect(extraEntities(e({ speed: '8kn', course: '320°', instructions: ['REDUCE_SPEED', 'PASS_PORT_TO_PORT'], identifier: 'CALLSIGN 6KLM' }))).toEqual([
      { key: 'speed', label: '속력', value: '8kn' },
      { key: 'course', label: '침로', value: '320°' },
      { key: 'instructions', label: '지시', value: '감속 · 좌현 대 좌현 통과' },
      { key: 'identifier', label: '호출부호', value: '6KLM' },
    ])
    expect(extraEntities(e({}))).toEqual([])
  })

  it('formats IMO / MMSI identifiers', () => {
    expect(formatIdentifier('IMO1234567')).toEqual({ label: 'IMO', value: '1234567' })
    expect(formatIdentifier('MMSI440123456')).toEqual({ label: 'MMSI', value: '440123456' })
  })
})
