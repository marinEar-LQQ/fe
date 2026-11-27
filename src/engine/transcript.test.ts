import type { AnalysisResult } from 'marinear-engine'
import { describe, expect, it } from 'vitest'
import { REASON_LABEL } from '../contracts/labels'
import { diffCount, formatAlternatives, formatReason, rawTokens, transcriptPlainText, transcriptTokens } from './transcript'

const base = (over: Partial<AnalysisResult> = {}): AnalysisResult => ({
  schemaVersion: 1,
  utteranceId: 'u1',
  sessionId: 's1',
  taskId: 't1',
  taskVersion: 1,
  revision: 2,
  status: 'final',
  timing: { startMs: 0, endMs: 1000 },
  rawTranscript: null,
  enhancedTranscript: { text: '', segments: [], modelVersion: null, wordAligned: false },
  candidates: [],
  entities: { vessel: null, terminalId: null, berthId: null, time: null, distance: null, identifier: null, changeIntent: null, speed: null, course: null, instructions: [] },
  comparison: { kind: 'ambiguous', reasonCodes: [], taskId: 't1', taskVersion: 1, diffs: [] },
  uncertainties: [],
  crossCheck: 'complete',
  transcriptDiff: null,
  audioFlags: [],
  modelVersions: { asr: null, enhancer: null },
  catalogVersion: 'demo',
  origin: 'model',
  createdAt: '',
  ...over,
})
const text = (t: string) => ({ text: t, segments: [], modelVersion: null, wordAligned: false })

describe('transcriptDiff highlighting', () => {
  const r = base({
    enhancedTranscript: text('속력 팔 노트 PNIT 통과'),
    rawTranscript: text('속력 발 노트 TNIC 통과 하겠습니다'),
    transcriptDiff: [
      { op: 'same', raw: '속력', enhanced: '속력' },
      { op: 'changed', raw: '발', enhanced: '팔' },
      { op: 'same', raw: '노트', enhanced: '노트' },
      { op: 'changed', raw: 'TNIC', enhanced: 'PNIT' },
      { op: 'same', raw: '통과', enhanced: '통과' },
      { op: 'removed', raw: '하겠습니다', enhanced: null },
    ],
  })

  it('marks every op !== same word with the raw-audio word, keeping same words as plain text', () => {
    const diffs = transcriptTokens(r).filter((t) => t.kind === 'diff')
    expect(diffs).toEqual([
      { kind: 'diff', op: 'changed', enhanced: '팔', raw: '발' },
      { kind: 'diff', op: 'changed', enhanced: 'PNIT', raw: 'TNIC' },
      { kind: 'diff', op: 'removed', enhanced: null, raw: '하겠습니다' },
    ])
    expect(diffCount(r)).toBe(3)
    expect(rawTokens(r.transcriptDiff!).filter((w) => w.differs).map((w) => w.text)).toEqual(['발', 'TNIC', '하겠습니다'])
  })

  it('shows the enhanced text without emphasis when transcriptDiff is missing (e.g. rev1 pending)', () => {
    const pending = base({ crossCheck: 'pending', revision: 1, enhancedTranscript: text('속력 팔 노트'), transcriptDiff: null })
    expect(transcriptTokens(pending)).toEqual([{ kind: 'text', text: '속력 팔 노트' }])
    expect(diffCount(pending)).toBe(0)
  })

  it('puts a confusable candidate on the differing word as [A?]', () => {
    const c = base({ ...r, uncertainties: [{ field: 'terminalId', alternatives: ['PNIT'], reason: 'ASR_CONFUSABLE' }] })
    expect(transcriptTokens(c).find((t) => t.kind === 'diff' && t.raw === 'TNIC')).toMatchObject({ uncertain: '[PNIT?]' })
  })
})

describe('uncertain candidates', () => {
  it('formats [A / B] and single candidates as [A?]', () => {
    expect(formatAlternatives({ alternatives: ['03:00', '13:00'] })).toBe('[03:00 / 13:00]')
    expect(formatAlternatives({ alternatives: ['HPNT'] })).toBe('[HPNT?]')
  })

  it('shows a time candidate even when the value does not appear verbatim in the transcript', () => {
    const r = base({ enhancedTranscript: text('세 시에 접안 예정'), uncertainties: [{ field: 'time', alternatives: ['03:00', '15:00'], reason: 'NUMBER_TYPE_UNCLEAR' }] })
    expect(transcriptPlainText(r)).toBe('세 시에 접안 예정 (확인 필요: 시각 [03:00 / 15:00])')
  })

  it('handles several uncertainties in one utterance (all listed, in-text where found)', () => {
    const r = base({
      enhancedTranscript: text('A선박 HPNT T3 13:00 접안'),
      uncertainties: [
        { field: 'terminalId', alternatives: ['HPNT', 'PNIT'], reason: 'ASR_DISAGREEMENT' },
        { field: 'berthId', alternatives: ['T3', 'T2'], reason: 'ASR_DISAGREEMENT' },
        { field: 'time', alternatives: ['13:00', '03:00'], reason: 'NUMBER_TYPE_UNCLEAR' },
      ],
    })
    const inline = transcriptTokens(r).filter((t) => t.kind === 'uncertain').map((t) => (t.kind === 'uncertain' ? t.text : ''))
    expect(inline).toEqual(['[HPNT / PNIT]', '[T3 / T2]', '[13:00 / 03:00]'])
    expect(transcriptPlainText(r)).toBe('A선박 [HPNT / PNIT] [T3 / T2] [13:00 / 03:00] 접안 (확인 필요: 터미널 [HPNT / PNIT] · 선석 [T3 / T2] · 시각 [13:00 / 03:00])')
  })

  it('does not merge MULTIPLE_CANDIDATES into the text (both places were said) but still lists them', () => {
    const r = base({ enhancedTranscript: text('PNIT 출항선, HPNT 접안'), uncertainties: [{ field: 'terminalId', alternatives: ['PNIT', 'HPNT'], reason: 'MULTIPLE_CANDIDATES' }] })
    expect(transcriptTokens(r)).toEqual([{ kind: 'text', text: 'PNIT 출항선, HPNT 접안' }])
    expect(transcriptPlainText(r)).toContain('(확인 필요: 터미널 [PNIT / HPNT])')
  })
})

describe('reason wording', () => {
  it('ASR_CONFUSABLE names the value with a question mark', () => {
    const r = base({ uncertainties: [{ field: 'terminalId', alternatives: ['HPNT'], reason: 'ASR_CONFUSABLE' }] })
    expect(formatReason('ASR_CONFUSABLE', r)).toBe('인식이 불확실합니다. [HPNT?] 확인 필요')
    expect(formatReason('LOCATION_DIFFERS', r)).toBe(REASON_LABEL.LOCATION_DIFFERS)
  })
})
