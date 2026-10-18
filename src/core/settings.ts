import { aiReady } from './config'
import type { Engine, PublicSettings, Settings, SettingsPatch } from '../shared/types'

export const DEFAULT_SETTINGS: Settings = {
  engine: 'sources',
  apiKey: '',
  aiBaseUrl: '',
  model: 'gpt-4o-mini',
  theme: 'lavender',
  language: 'auto',
  uiLanguage: 'auto',
  readingFont: 'sans',
  textScale: 1,
  spoilerShield: false,
  sources: { wikipedia: true, fandom: true, tvmaze: true, anilist: true },
  onboarded: false
}

/** What the UI may see: never the key itself. */
export function toPublic(s: Settings): PublicSettings {
  const { apiKey, ...rest } = s
  return {
    ...rest,
    hasApiKey: Boolean(apiKey),
    apiKeyHint: apiKey ? `${apiKey.slice(0, 3)}…${apiKey.slice(-4)}` : '',
    aiReady: aiReady(s)
  }
}

export function isWebUrl(url: string): boolean {
  try {
    const p = new URL(url)
    return p.protocol === 'https:' || p.protocol === 'http:'
  } catch {
    return false
  }
}

const ENGINES: Engine[] = ['sources', 'hybrid', 'ai']

/** Settings come from the UI: keep only known keys with sane values. */
export function sanitizePatch(patch: SettingsPatch): SettingsPatch {
  const out: SettingsPatch = {}
  if (typeof patch.apiKey === 'string') out.apiKey = patch.apiKey.trim()
  if (ENGINES.includes(patch.engine as Engine)) out.engine = patch.engine
  if (typeof patch.aiBaseUrl === 'string') {
    // "localhost:11434/v1" is what people type for Ollama: assume http.
    const raw = patch.aiBaseUrl.trim()
    const url = raw && !/^[a-z]+:\/\//i.test(raw) ? `http://${raw}` : raw
    out.aiBaseUrl = isWebUrl(url) ? url : ''
  }
  for (const k of ['model', 'theme', 'language'] as const) if (typeof patch[k] === 'string') out[k] = patch[k]
  if (patch.uiLanguage === 'auto' || patch.uiLanguage === 'en' || patch.uiLanguage === 'pt') out.uiLanguage = patch.uiLanguage
  if (patch.readingFont === 'sans' || patch.readingFont === 'serif') out.readingFont = patch.readingFont
  if (typeof patch.textScale === 'number') out.textScale = Math.min(1.4, Math.max(0.85, patch.textScale))
  if (typeof patch.spoilerShield === 'boolean') out.spoilerShield = patch.spoilerShield
  if (typeof patch.onboarded === 'boolean') out.onboarded = patch.onboarded
  if (patch.sources && typeof patch.sources === 'object') {
    const s = patch.sources
    out.sources = {
      wikipedia: s.wikipedia !== false,
      fandom: s.fandom !== false,
      tvmaze: s.tvmaze !== false,
      anilist: s.anilist !== false
    }
  }
  return out
}
