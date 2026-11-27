import type { LangCode } from 'marinear-engine'
import { createContext, useContext } from 'react'
import { en } from './en'
import { id } from './id'
import { ko, type Messages } from './ko'
import { vi } from './vi'

/** 화면 문구 사전. 키는 ko.ts 가 원본이고 나머지는 Messages 타입으로 누락이 컴파일 오류가 된다. */
export const MESSAGES: Record<'ko' | 'en' | 'id' | 'vi', Messages> = { ko, en, id, vi }

export function messagesFor(lang: LangCode): Messages {
  return (MESSAGES as Partial<Record<LangCode, Messages>>)[lang] ?? ko
}

/** 현재 화면 언어 (AppProvider 가 preferences.targetLang 으로 채운다) */
export const LangContext = createContext<LangCode>('ko')

export function useLang(): LangCode {
  return useContext(LangContext)
}

/** 화면 문구 훅. 교신 원문(한국어)과 엔진이 보낸 문구는 번역하지 않는다. */
export function useT(): Messages {
  return messagesFor(useContext(LangContext))
}

export type { Messages }
