import type { LangAvailability, LangCode, Translation } from 'marinear-engine'
import { langLabel } from '../../contracts/lang'
import { LANG_AVAILABILITY_LABEL, TRANSLATION_STATUS_LABEL } from '../../contracts/labels'
import { SUMMARY_FIELD_KO, translationView } from '../../engine/translationView'
import { Badge } from '../../ui/components'

/**
 * 번역 영역 (한국어 원문은 카드 맨 위에 따로 있다)
 * 1) 정형 요약 카드 — 추출값 + 해사 표준 문구, 크게. 불확실한 줄은 '확인 필요'
 * 2) 참고 번역 — 기계번역, 작게, "부정확할 수 있음"
 */
export function TranslationBlock({ lang, translation, crossCheckPending, availability }: { lang: LangCode; translation: Translation | undefined; crossCheckPending: boolean; availability: LangAvailability | undefined }) {
  const view = translationView(translation)
  const status = translation
    ? translation.status === 'unavailable' && view.summary
      ? '정형 요약 · 문장 번역 없음'
      : TRANSLATION_STATUS_LABEL[translation.status]
    : crossCheckPending
      ? '원음 교차 검사 후 번역'
      : TRANSLATION_STATUS_LABEL.pending
  return (
    <div className="utt-translation" lang={lang} aria-live="polite">
      <span className="lang-tag">
        {langLabel(lang)} · {status}
        {availability && availability !== 'ready' && availability !== 'source' ? ` · 문장 번역: ${LANG_AVAILABILITY_LABEL[availability]}` : ''}
      </span>

      {view.summary && (
        <dl className="summary-card" aria-label="정형 요약">
          {view.summary.map((line, i) => (
            <div key={i} className={`summary-line ${line.uncertain ? 'uncertain-line' : ''}`}>
              <dt>
                {line.label}
                <span className="summary-ko" lang="ko">
                  {SUMMARY_FIELD_KO[line.field]}
                </span>
              </dt>
              <dd>
                {line.uncertain ? <span className="uncertain">{line.value}</span> : line.value}
                {line.uncertain && (
                  <Badge tone="warn" title="확정값이 아닙니다">
                    확인 필요
                  </Badge>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {view.text && <div className="translation-text">{view.text}</div>}

      {view.referenceText && (
        <div className="reference-translation">
          <span className="lang-tag" lang="ko">
            참고 번역 (부정확할 수 있음)
          </span>
          {view.referenceText}
        </div>
      )}

      {!view.summary && !view.text && !view.referenceText && <span className="muted small" lang="ko">한국어 원문을 기준으로 확인하세요.</span>}
    </div>
  )
}
