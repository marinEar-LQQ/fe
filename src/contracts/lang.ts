import { migrateLangCode, type LangCode } from 'marinear-engine'

export const LANGS: { code: LangCode; label: string; native: string; tier: 'source' | 'primary' | 'support' | 'extension' }[] = [
  { code: 'ko', label: '한국어 (원문만)', native: '한국어', tier: 'source' },
  { code: 'my', label: '미얀마어', native: 'မြန်မာ', tier: 'primary' },
  { code: 'id', label: '인도네시아어', native: 'Bahasa Indonesia', tier: 'primary' },
  { code: 'en', label: '영어', native: 'English', tier: 'support' },
  { code: 'fil', label: '필리핀어', native: 'Filipino', tier: 'extension' },
  { code: 'vi', label: '베트남어', native: 'Tiếng Việt', tier: 'extension' },
]

/** 기존 시안의 tl 코드는 fil 로 마이그레이션 (엔진 migrateLangCode 와 같은 규칙) */
export function normalizeLang(code: string | null | undefined): LangCode {
  return (code && migrateLangCode(code)) || 'ko'
}

export function langLabel(code: LangCode): string {
  return LANGS.find((l) => l.code === code)?.label ?? code
}
