import type { LangAvailability, LangCode, Translation } from 'marinear-engine'
import { translationView } from '../../engine/translationView'
import { useT } from '../../i18n'

/**
 * 05 카드 안 번역 (한국어 원문은 카드 위에 따로 있다). 점선 아래:
 * 1) 정형 요약 — 엔진이 선택 언어로 만든 라벨·값(추출값 + 해사 표준 문구), 크게. 불확실한 줄은 '확인 필요'
 * 2) 참고 번역 — 기계번역, 작게, "부정확할 수 있음"
 */
export function TranslationBlock({ lang, translation, crossCheckPending, availability }: { lang: LangCode; translation: Translation | undefined; crossCheckPending: boolean; availability: LangAvailability | undefined }) {
  const t = useT()
  const view = translationView(translation)
  const status = translation
    ? translation.status === 'unavailable' && view.summary
      ? t.translation.summaryOnly
      : translation.status === 'ready'
        ? null
        : t.translationStatus[translation.status]
    : crossCheckPending
      ? t.translation.afterCrossCheck
      : t.translationStatus.pending
  return (
    <div className="utt-translation" lang={lang} aria-live="polite">
      <span className="lang-tag">
        {t.translation.label}
        {status ? ` · ${status}` : ''}
        {availability === 'not_installed' && !view.summary ? ` · ${t.langAvailability.not_installed}` : ''}
      </span>

      {view.summary && (
        <dl className="summary-card" aria-label={t.translation.summary}>
          {view.summary.map((line, i) => (
            <div key={i} className={`summary-line ${line.uncertain ? 'uncertain-line' : ''}`}>
              {/* 엔진이 선택 언어로 보낸 라벨. 다른 언어 요약이 오면 화면 언어 필드명으로 */}
              <dt>{translation?.summary?.lang === lang ? line.label : t.summaryField[line.field]}</dt>
              <dd>
                {line.uncertain ? <span className="uncertain">{line.value}</span> : line.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {view.text && <p className="translation-text">{view.text}</p>}

      {view.referenceText && (
        <div className="reference-translation">
          <span className="lang-tag">{t.translation.reference}</span>
          <p>{view.referenceText}</p>
        </div>
      )}

      {!view.summary && !view.text && !view.referenceText && <span className="small muted">{t.translation.checkOriginal}</span>}
    </div>
  )
}
