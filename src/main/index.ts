import { app, shell, BrowserWindow, ipcMain, nativeImage, nativeTheme, screen } from 'electron'
import { join } from 'path'
import { getSettings, saveSettings, getWindowBounds, setWindowBounds } from './store'
import { fileCache, fileLibrary, cacheBytes, clearCache } from './fileStores'
import { exportStory, importStory } from './export'
import { configureCore } from '../core/config'
import { toPublic, isWebUrl } from '../core/settings'
import { describeError } from '../core/errors'
import { verifyAi, listModels } from '../core/ai'
import { buildOutline, buildNode, ask, suggest } from '../core/engine'
import { listLibrary, loadStory, saveStory, removeStory, findSaved, libraryCount } from '../core/library'
import type {
  ApiResult,
  DataInfo,
  ExportFormat,
  ExportLabels,
  SavedStory,
  SettingsPatch,
  StoryOutline,
  StoryQuery
} from '../shared/types'

let mainWindow: BrowserWindow | null = null

const DARK_BG: Record<string, string> = { dusk: '#211E2B', night: '#161A23' }

function initialBackground(): string {
  const theme = getSettings().theme
  if (DARK_BG[theme]) return DARK_BG[theme]
  if (theme === 'system' && nativeTheme.shouldUseDarkColors) return DARK_BG.dusk
  return '#FBF7FF'
}

/** Restore the last window size/position, unless that spot is off-screen now. */
function restoredBounds(): { x?: number; y?: number; width: number; height: number; maximized?: boolean } {
  const b = getWindowBounds()
  if (!b) return { width: 1320, height: 860 }
  if (b.x !== undefined && b.y !== undefined) {
    const visible = screen.getAllDisplays().some(({ workArea: w }) => b.x! < w.x + w.width - 100 && b.x! + b.width > w.x + 100 && b.y! >= w.y - 10 && b.y! < w.y + w.height - 100)
    if (!visible) return { width: b.width, height: b.height, maximized: b.maximized }
  }
  return b
}

function createWindow(): void {
  const bounds = restoredBounds()
  const win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: initialBackground(),
    title: 'Storyteller',
    // Packaged builds take the icon from the .exe; build/ isn't shipped.
    icon: app.isPackaged ? undefined : nativeImage.createFromPath(join(__dirname, '../../build/icon.png')),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  mainWindow = win
  if (bounds.maximized) win.maximize()

  win.on('ready-to-show', () => win.show())
  win.on('close', () => {
    const maximized = win.isMaximized()
    setWindowBounds({ ...(maximized ? win.getNormalBounds() : win.getBounds()), maximized })
  })
  win.on('closed', () => {
    mainWindow = null
  })

  // Links open in the user's browser; the app window itself never navigates away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isWebUrl(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    const dev = process.env['ELECTRON_RENDERER_URL']
    if (dev && url.startsWith(dev)) return
    e.preventDefault()
    if (isWebUrl(url)) shell.openExternal(url)
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function wrap<T>(fn: () => Promise<T> | T): Promise<ApiResult<T>> {
  return Promise.resolve()
    .then(fn)
    .then((data) => ({ ok: true, data }))
    .catch((err: unknown) => ({ ok: false, ...describeError(err) }))
}

function registerIpc(): void {
  ipcMain.handle('settings:get', () => toPublic(getSettings()))
  ipcMain.handle('settings:save', (_e, patch: SettingsPatch) => saveSettings(patch ?? {}))

  ipcMain.handle('ai:verify', (_e, key?: string, baseUrl?: string) => wrap(() => verifyAi(key, baseUrl)))
  ipcMain.handle('ai:models', (_e, key?: string, baseUrl?: string) => wrap(() => listModels(key, baseUrl)))

  ipcMain.handle('search:suggest', (_e, query: string) => wrap(() => suggest(String(query ?? ''))))

  ipcMain.handle('story:outline', (e, q: StoryQuery) =>
    wrap(() =>
      buildOutline(q, (step) => {
        if (!e.sender.isDestroyed()) e.sender.send('story:progress', step)
      })
    )
  )
  ipcMain.handle('story:node', (_e, outline: StoryOutline, nodeId: string, opts?: { forceAi?: boolean }) =>
    wrap(() => buildNode(outline, nodeId, opts))
  )
  ipcMain.handle(
    'story:ask',
    (_e, outline: StoryOutline, nodeId: string, corpus: Record<string, string>, question: string) =>
      wrap(() => ask(outline, nodeId, corpus ?? {}, String(question ?? '')))
  )

  ipcMain.handle('library:list', () => listLibrary())
  ipcMain.handle('library:get', (_e, id: string) => loadStory(String(id)))
  ipcMain.handle('library:save', (_e, story: SavedStory, keys?: string[]) => wrap(() => saveStory(story, keys ?? [])))
  ipcMain.handle('library:remove', (_e, id: string) => removeStory(String(id)))
  ipcMain.handle('library:find', (_e, text: string) => findSaved(String(text ?? ''), getSettings().engine))

  ipcMain.handle('story:export', (e, story: SavedStory, format: ExportFormat, labels: ExportLabels) =>
    wrap(() => exportStory(BrowserWindow.fromWebContents(e.sender), story, format, labels))
  )
  ipcMain.handle('story:import', (e) => wrap(() => importStory(BrowserWindow.fromWebContents(e.sender))))

  ipcMain.handle(
    'data:info',
    async (): Promise<DataInfo> => ({
      cacheBytes: await cacheBytes(),
      libraryCount: await libraryCount(),
      dataPath: app.getPath('userData')
    })
  )
  ipcMain.handle('data:clear-cache', () => clearCache())
  ipcMain.handle('data:open-folder', () => shell.openPath(app.getPath('userData')))
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    configureCore({
      getSettings,
      locale: () => app.getLocale(),
      cache: fileCache,
      library: fileLibrary
    })
    registerIpc()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
