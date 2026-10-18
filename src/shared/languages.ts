import type { UiLanguage } from './types'

/** Interface languages, in the order the pickers list them. English is the default. */
export const UI_LANGUAGES: readonly UiLanguage[] = ['en', 'pt', 'es', 'fr', 'de', 'it', 'ja']

/** How each language names itself, for the pickers. */
export const UI_LANGUAGE_NAMES: Record<UiLanguage, string> = {
  en: 'English',
  pt: 'Português (Brasil)',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  ja: '日本語'
}

/** BCP-47 tag for <html lang>, read-aloud voices and number formatting. */
export const UI_LANGUAGE_TAGS: Record<UiLanguage, string> = {
  en: 'en',
  pt: 'pt-BR',
  es: 'es',
  fr: 'fr',
  de: 'de',
  it: 'it',
  ja: 'ja'
}

/**
 * Anything that isn't a supported language falls back to English, including
 * the old 'auto' value (which followed the OS) from v2.0.0 settings.
 */
export function normalizeUiLanguage(value: unknown): UiLanguage {
  return UI_LANGUAGES.includes(value as UiLanguage) ? (value as UiLanguage) : 'en'
}
