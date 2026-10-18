import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core'
import { openDb } from './idb'
import { configureCore } from '../../../core/config'
import { DEFAULT_SETTINGS, sanitizePatch, toPublic } from '../../../core/settings'
import { describeError } from '../../../core/errors'
import { clearMemoryCache } from '../../../core/http'
import { verifyAi, listModels } from '../../../core/ai'
import { buildOutline, buildNode, ask, suggest } from '../../../core/engine'
import * as library from '../../../core/library'
import { fileName, parseImported, toHtml, toJson, toMarkdown } from '../../../core/exporting'
import { normalizeUiLanguage } from '../../../shared/languages'
import type { StorytellerApi } from '../../../shared/api'
import type { ApiResult, BuildStep, ExportFormat, ExportLabels, SavedStory, Settings } from '../../../shared/types'

/**
 * The Storyteller API for Android (Capacitor) and plain browsers. Same core
 * as the desktop, running in-page: settings in localStorage, library and HTTP
 * cache in IndexedDB. On Android, Capacitor's native HTTP replaces fetch (no
 * CORS limits) and the share sheet replaces save dialogs.
 */

const SETTINGS_KEY = 'storyteller-settings'

function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<Settings>
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      uiLanguage: normalizeUiLanguage(saved.uiLanguage),
      sources: { ...DEFAULT_SETTINGS.sources, ...saved.sources }
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

function wrap<T>(fn: () => Promise<T> | T): Promise<ApiResult<T>> {
  return Promise.resolve()
    .then(fn)
    .then((data) => ({ ok: true, data }))
    .catch((err: unknown) => ({ ok: false, ...describeError(err) }))
}

async function openExternal(url: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url })
  } else {
    window.open(url, '_blank', 'noopener')
  }
}

/** Links in story text, sources and credits open in the system browser, not the app's WebView. */
function routeLinksExternally(): void {
  document.addEventListener(
    'click',
    (e) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || !/^https?:/i.test(a.href)) return
      e.preventDefault()
      openExternal(a.href)
    },
    true
  )
}

/** Keep status bar icons readable: dark icons on light themes, light on dark ones. */
function followThemeInSystemBars(): void {
  const apply = (): void => {
    const dark = document.documentElement.style.colorScheme === 'dark'
    SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => undefined)
  }
  new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-theme'] })
  apply()
}

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}

async function exportFile(story: SavedStory, format: ExportFormat, labels: ExportLabels, native: boolean): Promise<string | null> {
  const base = fileName(story.outline.title)
  if (format === 'pdf') {
    // Browsers: open the printable page and let the user "Save as PDF".
    const w = window.open('', '_blank')
    if (!w) return null
    w.document.write(toHtml(story, labels))
    w.document.close()
    w.onload = () => w.print()
    return `${base}.pdf`
  }
  const name = `${base}.${format}`
  const text = format === 'md' ? toMarkdown(story, labels) : toJson(story)
  if (native) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    const { Share } = await import('@capacitor/share')
    const file = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 })
    try {
      await Share.share({ title: story.outline.title, files: [file.uri] })
    } catch (err) {
      if (/cancel/i.test(String((err as Error).message))) return null
      throw err
    }
    return name
  }
  const url = URL.createObjectURL(new Blob([text], { type: format === 'md' ? 'text/markdown' : 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return name
}

export async function createWebApi(): Promise<StorytellerApi> {
  const native = Capacitor.isNativePlatform()
  const db = await openDb()
  let settings = loadSettings()

  configureCore({
    getSettings: () => settings,
    locale: () => navigator.language,
    cache: { get: (k) => db.get('cache', k), set: (k, v) => db.set('cache', k, v) },
    library: { get: (k) => db.get('library', k), set: (k, v) => db.set('library', k, v), del: (k) => db.del('library', k) },
    // Native HTTP on Android has no CORS limits; a plain browser does.
    browser: !native
  })

  if (native) {
    routeLinksExternally()
    followThemeInSystemBars()
  }

  const progress = new Set<(s: BuildStep) => void>()

  return {
    capabilities: { platform: native ? 'android' : 'web', pdfExport: !native, dataFolder: false },

    getSettings: async () => toPublic(settings),
    saveSettings: async (patch) => {
      const { apiKey, ...rest } = sanitizePatch(patch)
      settings = { ...settings, ...rest, ...(apiKey !== undefined ? { apiKey } : {}) }
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
      return toPublic(settings)
    },

    verifyAi: (key, baseUrl) => wrap(() => verifyAi(key, baseUrl)),
    listModels: (key, baseUrl) => wrap(() => listModels(key, baseUrl)),

    suggest: (query) => wrap(() => suggest(query)),

    buildOutline: (q) => wrap(() => buildOutline(q, (step) => progress.forEach((cb) => cb(step)))),
    onProgress: (cb) => {
      progress.add(cb)
      return () => {
        progress.delete(cb)
      }
    },
    buildNode: (outline, nodeId, opts) => wrap(() => buildNode(outline, nodeId, opts)),
    ask: (outline, nodeId, corpus, question) => wrap(() => ask(outline, nodeId, corpus, question)),

    listLibrary: () => library.listLibrary(),
    getStory: (id) => library.loadStory(id),
    saveStory: (story, keys) => wrap(() => library.saveStory(story, keys ?? [])),
    removeStory: (id) => library.removeStory(id),
    findSaved: (text) => library.findSaved(text, settings.engine),

    exportStory: (story, format, labels) => wrap(() => exportFile(story, format, labels, native)),
    importStory: () =>
      wrap(async () => {
        const file = await pickFile('.json,application/json')
        return file ? parseImported(await file.text()) : null
      }),

    dataInfo: async () => ({
      cacheBytes: await db.size('cache'),
      libraryCount: await library.libraryCount(),
      dataPath: ''
    }),
    clearCache: async () => {
      const before = await db.size('cache')
      await db.clear('cache')
      clearMemoryCache()
      return before
    },
    openDataFolder: async () => '',

    onBack: native
      ? (handler) => {
          let remove: (() => void) | null = null
          let gone = false
          import('@capacitor/app').then(async ({ App }) => {
            const sub = await App.addListener('backButton', () => {
              if (!handler()) App.exitApp()
            })
            if (gone) sub.remove()
            else remove = () => sub.remove()
          })
          return () => {
            gone = true
            remove?.()
          }
        }
      : undefined
  }
}
