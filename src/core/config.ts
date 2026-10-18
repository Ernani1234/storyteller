import type { Settings } from '../shared/types'

/**
 * The core (scraping, AI, Q&A, library) runs in two hosts: Electron's main
 * process on desktop, and the WebView on Android/web. Each host plugs in how
 * settings are read and where data lives; everything else is shared.
 */

export interface CacheEntry {
  t: number
  data: unknown
}

/** HTTP response cache (disk on desktop, IndexedDB on mobile). */
export interface CacheStore {
  get(key: string): Promise<CacheEntry | null>
  set(key: string, entry: CacheEntry): Promise<void>
}

/** JSON key-value storage for the library. */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | null>
  set(key: string, value: unknown): Promise<void>
  del(key: string): Promise<void>
}

export interface CoreHost {
  getSettings(): Settings
  /** BCP-47 locale of the device, e.g. "pt-BR". */
  locale(): string
  cache: CacheStore
  library: KeyValueStore
  /** Running inside a browser engine (needs CORS-friendly requests, no UA header). */
  browser?: boolean
}

let host: CoreHost | null = null

export function configureCore(h: CoreHost): void {
  host = h
}

export function core(): CoreHost {
  if (!host) throw new Error('Storyteller core used before configureCore()')
  return host
}

export function getSettings(): Settings {
  return core().getSettings()
}

export function getApiKey(): string {
  return getSettings().apiKey
}

export function aiReady(s: Settings = getSettings()): boolean {
  return Boolean(s.apiKey || s.aiBaseUrl.trim())
}

const LANG_CODES: Record<string, string> = {
  English: 'en',
  Português: 'pt',
  Español: 'es',
  Français: 'fr',
  日本語: 'ja',
  Deutsch: 'de',
  Italiano: 'it'
}

/** Language code to read/write stories in (wiki edition for scraping). */
export function contentLang(s: Settings = getSettings()): string {
  if (s.language && s.language !== 'auto') return LANG_CODES[s.language] ?? 'en'
  const locale = core().locale().slice(0, 2).toLowerCase()
  return Object.values(LANG_CODES).includes(locale) ? locale : 'en'
}
