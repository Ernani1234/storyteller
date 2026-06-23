import Store from 'electron-store'
import type { Settings } from '../shared/types'

const defaults: Settings = {
  apiKey: '',
  model: 'gpt-4o',
  theme: 'lavender',
  language: 'auto'
}

const store = new Store<Settings>({
  name: 'storyteller-settings',
  defaults,
  // Keeps the key out of plain prying eyes on disk. Not a vault, but better
  // than cleartext. Electron derives a per-app key via safeStorage upstream;
  // here we use a static obfuscation key from electron-store.
  encryptionKey: 'storyteller-local-v1'
})

export function getSettings(): Settings {
  return {
    apiKey: store.get('apiKey'),
    model: store.get('model'),
    theme: store.get('theme'),
    language: store.get('language')
  }
}

export function saveSettings(patch: Partial<Settings>): Settings {
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) store.set(k, v as never)
  }
  return getSettings()
}

export function getApiKey(): string {
  return store.get('apiKey')
}
