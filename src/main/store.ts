import { safeStorage } from 'electron'
import Store from 'electron-store'
import { DEFAULT_SETTINGS, sanitizePatch, toPublic } from '../core/settings'
import type { Engine, PublicSettings, Settings, SettingsPatch, SourceToggles } from '../shared/types'

interface Persisted {
  /** legacy plaintext key (v1); migrated into apiKeyEnc on first read. */
  apiKey: string
  /** OS-encrypted key (DPAPI on Windows, Keychain on macOS). */
  apiKeyEnc: string
  aiBaseUrl: string
  model: string
  theme: string
  language: string
  uiLanguage: Settings['uiLanguage']
  readingFont: Settings['readingFont']
  textScale: number
  spoilerShield: boolean
  sources: SourceToggles
  // engine / onboarded are intentionally NOT in defaults, so we can tell a
  // v1 user (who had a key and expects AI) apart from a fresh install.
  engine?: Engine
  onboarded?: boolean
  windowBounds?: { x?: number; y?: number; width: number; height: number; maximized?: boolean }
}

const { engine: _e, onboarded: _o, apiKey: _k, ...persistedDefaults } = DEFAULT_SETTINGS

const store = new Store<Persisted>({
  name: 'storyteller-settings',
  defaults: { ...persistedDefaults, apiKey: '', apiKeyEnc: '' },
  // Obfuscates the settings file. The API key gets real OS-level encryption
  // through safeStorage on top of this (see getApiKey/setApiKey).
  encryptionKey: 'storyteller-local-v1'
})

function getApiKey(): string {
  const enc = store.get('apiKeyEnc')
  if (enc && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(enc, 'base64'))
    } catch {
      return ''
    }
  }
  const legacy = store.get('apiKey')
  if (legacy && safeStorage.isEncryptionAvailable()) setApiKey(legacy)
  return legacy
}

function setApiKey(key: string): void {
  if (!key) {
    store.set('apiKeyEnc', '')
    store.set('apiKey', '')
    return
  }
  if (safeStorage.isEncryptionAvailable()) {
    store.set('apiKeyEnc', safeStorage.encryptString(key).toString('base64'))
    store.set('apiKey', '')
  } else {
    store.set('apiKey', key)
  }
}

export function getSettings(): Settings {
  const apiKey = getApiKey()
  return {
    apiKey,
    engine: store.get('engine') ?? (apiKey ? 'hybrid' : 'sources'),
    onboarded: store.get('onboarded') ?? Boolean(apiKey),
    aiBaseUrl: store.get('aiBaseUrl'),
    model: store.get('model'),
    theme: store.get('theme'),
    language: store.get('language'),
    uiLanguage: store.get('uiLanguage'),
    readingFont: store.get('readingFont'),
    textScale: store.get('textScale'),
    spoilerShield: store.get('spoilerShield'),
    sources: { ...DEFAULT_SETTINGS.sources, ...store.get('sources') }
  }
}

export function saveSettings(patch: SettingsPatch): PublicSettings {
  const { apiKey, ...rest } = sanitizePatch(patch)
  if (apiKey !== undefined) setApiKey(apiKey)
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined) store.set(k as keyof Persisted, v as never)
  }
  return toPublic(getSettings())
}

export function getWindowBounds(): Persisted['windowBounds'] {
  return store.get('windowBounds')
}

export function setWindowBounds(b: NonNullable<Persisted['windowBounds']>): void {
  store.set('windowBounds', b)
}
