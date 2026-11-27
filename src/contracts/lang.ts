import { migrateLangCode, type LangCode } from 'marinear-engine'

/**
 * 화면에서 고를 수 있는 언어 (팀 결정 2026-11-27): 원문(ko) / 영어 / 인도네시아어 / 베트남어.
 * 미얀마어(my)·필리핀어(fil)는 번역·정형 요약을 제공하지 않아 목록에서 뺐다.
 */
export const LANGS: { code: LangCode; label: string; native: string }[] = [
  { code: 'ko', label: '한국어 (원문만)', native: '한국어' },
  { code: 'en', label: '영어', native: 'English' },
  { code: 'id', label: '인도네시아어', native: 'Bahasa Indonesia' },
  { code: 'vi', label: '베트남어', native: 'Tiếng Việt' },
]

export function isUiLang(code: LangCode): boolean {
  return LANGS.some((l) => l.code === code)
}

/** 저장된 언어 설정 정리: tl→fil(엔진 규칙) 후, 목록에 없는 언어(my·fil 등)는 원문(ko)으로 */
export function normalizeLang(code: string | null | undefined): LangCode {
  const migrated = code ? migrateLangCode(code) : null
  return migrated && isUiLang(migrated) ? migrated : 'ko'
}

export function langLabel(code: LangCode): string {
  return LANGS.find((l) => l.code === code)?.label ?? code
}
