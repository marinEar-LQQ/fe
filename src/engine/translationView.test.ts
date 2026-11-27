import type { Translation } from 'marinear-engine'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadPreferences } from '../app/state'
import { LANGS, normalizeLang } from '../contracts/lang'
import { translationView } from './translationView'

const t = (over: Partial<Translation>): Translation => ({
  utteranceId: 'u1',
  sourceRevision: 2,
  targetLang: 'en',
  status: 'ready',
  text: null,
  protectedTokens: [],
  modelVersion: null,
  issues: [],
  createdAt: '',
  summary: null,
  reference: false,
  ...over,
})
const summary = {
  lang: 'en' as const,
  lines: [
    { field: 'vessel' as const, label: 'Vessel', value: 'HYUNDAI BUSAN', uncertain: false },
    { field: 'time' as const, label: 'Time', value: '[03:00 / 13:00] (check)', uncertain: true },
  ],
  oneLine: '',
}

describe('translation view (summary card first, reference translation small)', () => {
  it('shows the summary card even when status is unavailable', () => {
    const v = translationView(t({ status: 'unavailable', summary, text: null }))
    expect(v.summary?.map((l) => l.field)).toEqual(['vessel', 'time'])
    expect(v.summary?.find((l) => l.field === 'time')?.uncertain).toBe(true)
    expect(v.referenceText).toBeNull()
  })

  it('separates reference machine translation from regular text', () => {
    expect(translationView(t({ summary, text: 'Reduce speed', reference: true }))).toMatchObject({ referenceText: 'Reduce speed', text: null })
    expect(translationView(t({ text: 'Hello', reference: false }))).toMatchObject({ referenceText: null, text: 'Hello', summary: null })
    expect(translationView(undefined)).toEqual({ summary: null, referenceText: null, text: null })
  })
})

describe('language list migration', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('offers only ko / en / id / vi', () => {
    expect(LANGS.map((l) => l.code)).toEqual(['ko', 'en', 'id', 'vi'])
  })

  it('moves removed languages (my, fil, legacy tl) to ko and keeps supported ones', () => {
    expect(normalizeLang('my')).toBe('ko')
    expect(normalizeLang('fil')).toBe('ko')
    expect(normalizeLang('tl')).toBe('ko')
    expect(normalizeLang('vi')).toBe('vi')
    expect(normalizeLang(undefined)).toBe('ko')
  })

  it('migrates a saved preference of my → ko when loading', () => {
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ targetLang: 'my', largeText: true }) })
    expect(loadPreferences()).toMatchObject({ targetLang: 'ko', largeText: true })
  })
})
