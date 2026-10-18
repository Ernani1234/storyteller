import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { normalizeUiLanguage, UI_LANGUAGE_TAGS } from '../../../shared/languages'
import type { UiLanguage } from '../../../shared/types'
import { en, type MessageKey } from './en'
import { pt } from './pt'
import { es } from './es'
import { fr } from './fr'
import { de } from './de'
import { it } from './it'
import { ja } from './ja'

export type { MessageKey }

const DICTS: Record<UiLanguage, Record<MessageKey, string>> = { en, pt, es, fr, de, it, ja }

/** Names of story languages, in each interface language ("The plot was only found in {lang}"). */
const LANG_NAMES: Record<UiLanguage, Record<string, string>> = {
  en: { en: 'English', pt: 'Portuguese', es: 'Spanish', fr: 'French', ja: 'Japanese', de: 'German', it: 'Italian' },
  pt: { en: 'inglês', pt: 'português', es: 'espanhol', fr: 'francês', ja: 'japonês', de: 'alemão', it: 'italiano' },
  es: { en: 'inglés', pt: 'portugués', es: 'español', fr: 'francés', ja: 'japonés', de: 'alemán', it: 'italiano' },
  fr: { en: 'anglais', pt: 'portugais', es: 'espagnol', fr: 'français', ja: 'japonais', de: 'allemand', it: 'italien' },
  de: { en: 'Englisch', pt: 'Portugiesisch', es: 'Spanisch', fr: 'Französisch', ja: 'Japanisch', de: 'Deutsch', it: 'Italienisch' },
  it: { en: 'inglese', pt: 'portoghese', es: 'spagnolo', fr: 'francese', ja: 'giapponese', de: 'tedesco', it: 'italiano' },
  ja: { en: '英語', pt: 'ポルトガル語', es: 'スペイン語', fr: 'フランス語', ja: '日本語', de: 'ドイツ語', it: 'イタリア語' }
}

export type Lang = UiLanguage
export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string

function makeT(lang: Lang): Translate {
  const dict = DICTS[lang]
  return (key, vars) => {
    let s = dict[key] ?? en[key] ?? key
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v))
    return s
  }
}

interface I18n {
  lang: Lang
  /** BCP-47 tag of the interface language ("pt-BR"), for Intl and <html lang>. */
  tag: string
  t: Translate
  langName: (code: string) => string
  /** has a translation for this dynamic key (e.g. "chars.role.MAIN")? */
  has: (key: string) => key is MessageKey
}

const isKey = (k: string): k is MessageKey => k in en

function makeI18n(lang: Lang): I18n {
  return {
    lang,
    tag: UI_LANGUAGE_TAGS[lang],
    t: makeT(lang),
    langName: (code) => LANG_NAMES[lang][code] ?? code.toUpperCase(),
    has: isKey
  }
}

const Ctx = createContext<I18n>(makeI18n('en'))

export function I18nProvider({ pref, children }: { pref: UiLanguage; children: ReactNode }): JSX.Element {
  const lang = normalizeUiLanguage(pref)
  useEffect(() => {
    document.documentElement.lang = UI_LANGUAGE_TAGS[lang]
  }, [lang])
  const value = useMemo(() => makeI18n(lang), [lang])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n(): I18n {
  return useContext(Ctx)
}
