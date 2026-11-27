import type { Entities, LangCode } from '../../contracts/types'

/**
 * 시연 고정 데이터 (Mock fixtures)
 * ⚠️ 실제 음성 분석 결과가 아니다. 화면에는 항상 "시연 데이터" 배지를 붙인다.
 * 통합 기술설명서 03의 사례 A~D 와 정상 일치 사례를 포함한다.
 */
export interface FixtureUtterance {
  key: string
  label: string
  durationMs: number
  partialText: string
  raw: { text: string; entities: Entities }
  enhanced: { text: string; entities: Entities }
  /** raw 교차 검사 결과가 늦게 도착하는 사례 (crossCheck=pending → complete) */
  delayedCrossCheck?: boolean
  translations: Partial<Record<LangCode, string>>
  protectedTokens: string[]
}

const e = (vessel: string | null, terminalId: string | null, berthId: string | null, extra: Partial<Entities> = {}): Entities => ({
  vessel,
  terminalId,
  berthId,
  ...extra,
})

export const DEMO_SCENARIO: FixtureUtterance[] = [
  {
    key: 'match',
    label: '정상 일치',
    durationMs: 4200,
    partialText: '해동호, 여기 A선박. PNIT…',
    raw: { text: '해동호, 여기 A선박. PNIT T3 접안 예정 맞습니다.', entities: e('A선박', 'PNIT', 'T3') },
    enhanced: { text: '해동호, 여기 A선박. PNIT T3 접안 예정 맞습니다.', entities: e('A선박', 'PNIT', 'T3') },
    translations: {
      en: 'Haedong-ho, this is Vessel A. Confirmed, berthing at PNIT T3 as planned.',
      id: 'Haedong-ho, di sini Kapal A. Benar, rencana sandar di PNIT T3.',
      my: 'Haedong-ho၊ ဒါက A သင်္ဘောပါ။ PNIT T3 မှာ ဆိုက်ကပ်ဖို့ စီစဉ်ထားတာ မှန်ပါတယ်။',
    },
    protectedTokens: ['PNIT', 'T3'],
  },
  {
    key: 'case-a',
    label: '사례 A · 명확한 장소 차이',
    durationMs: 3600,
    partialText: 'A선박 작업, HPNT…',
    raw: { text: 'A선박 작업, HPNT T3로 변경.', entities: e('A선박', 'HPNT', 'T3', { changeIntent: true }) },
    enhanced: { text: 'A선박 작업, HPNT T3로 변경.', entities: e('A선박', 'HPNT', 'T3', { changeIntent: true }) },
    translations: {
      en: 'Vessel A operation changed to HPNT T3.',
      id: 'Pekerjaan Kapal A diubah ke HPNT T3.',
      my: 'A သင်္ဘော လုပ်ငန်းကို HPNT T3 သို့ ပြောင်းပါသည်။',
    },
    protectedTokens: ['HPNT', 'T3'],
  },
  {
    key: 'case-b',
    label: '사례 B · 원음/완화음 인식 차이',
    durationMs: 3600,
    partialText: 'A선박 작업, …PNIT…',
    raw: { text: 'A선박 작업, PNIT T3로 변경.', entities: e('A선박', 'PNIT', 'T3', { changeIntent: true }) },
    enhanced: { text: 'A선박 작업, HPNT T3로 변경.', entities: e('A선박', 'HPNT', 'T3', { changeIntent: true }) },
    delayedCrossCheck: true,
    translations: {
      en: 'Vessel A operation changed to [PNIT / HPNT] T3.',
      id: 'Pekerjaan Kapal A diubah ke [PNIT / HPNT] T3.',
      my: 'A သင်္ဘော လုပ်ငန်းကို [PNIT / HPNT] T3 သို့ ပြောင်းပါသည်။',
    },
    protectedTokens: ['PNIT', 'HPNT', 'T3'],
  },
  {
    key: 'case-c',
    label: '사례 C · 터미널 없이 선석만',
    durationMs: 2400,
    partialText: 'A선박 작업…',
    raw: { text: 'A선박 작업, T3로.', entities: e('A선박', null, 'T3') },
    enhanced: { text: 'A선박 작업, T3로.', entities: e('A선박', null, 'T3') },
    translations: {
      en: 'Vessel A operation, to T3.',
      id: 'Pekerjaan Kapal A, ke T3.',
      my: 'A သင်္ဘော လုပ်ငန်း၊ T3 သို့။',
    },
    protectedTokens: ['T3'],
  },
  {
    key: 'case-d',
    label: '사례 D · 다른 선박',
    durationMs: 3000,
    partialText: 'B선박, 10분…',
    raw: { text: 'B선박, 10분 후 출항합니다.', entities: e('B선박', null, null, { time: '10분' }) },
    enhanced: { text: 'B선박, 10분 후 출항합니다.', entities: e('B선박', null, null, { time: '10분' }) },
    translations: {
      en: 'Vessel B departing in 10 minutes.',
      id: 'Kapal B berangkat 10 menit lagi.',
      my: 'B သင်္ဘော 10 မိနစ်အကြာတွင် ထွက်ခွာပါမည်။',
    },
    protectedTokens: ['10'],
  },
]

/** 1차 품질 검증 대상 외 언어는 Mock 에서 "미설치"로 응답 */
export const INSTALLED_FIXTURE_LANGS: LangCode[] = ['my', 'id', 'en']
