import { app, shell, BrowserWindow, ipcMain, nativeImage } from 'electron'
import { join } from 'path'
import { getSettings, saveSettings } from './store'
import {
  buildOutline,
  buildNodeDetail,
  answerQuestion,
  verifyKey
} from './openai'
import { resolveImages } from './images'
import type {
  ApiResult,
  AskResult,
  NodeDetail,
  Settings,
  StoryNode,
  StoryOutline
} from '../shared/types'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#FBF7FF',
    title: 'Storyteller',
    icon: nativeImage.createFromPath(join(__dirname, '../../build/icon.png')),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function wrap<T>(fn: () => Promise<T>): Promise<ApiResult<T>> {
  return fn()
    .then((data) => ({ ok: true, data }))
    .catch((err: unknown) => ({
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    }))
}

function registerIpc(): void {
  ipcMain.handle('settings:get', (): Settings => getSettings())

  ipcMain.handle('settings:save', (_e, patch: Partial<Settings>): Settings =>
    saveSettings(patch)
  )

  ipcMain.handle('key:verify', (_e, key: string): Promise<ApiResult<boolean>> =>
    wrap(() => verifyKey(key))
  )

  ipcMain.handle(
    'story:outline',
    (_e, query: string): Promise<ApiResult<StoryOutline>> =>
      wrap(() => buildOutline(query))
  )

  ipcMain.handle(
    'story:node',
    (
      _e,
      outline: StoryOutline,
      node: StoryNode
    ): Promise<ApiResult<NodeDetail>> =>
      wrap(async () => {
        const { detail, imageQueries } = await buildNodeDetail(outline, node)
        const images = await resolveImages(imageQueries, outline.title)
        return { ...detail, images }
      })
  )

  ipcMain.handle(
    'story:ask',
    (
      _e,
      outline: StoryOutline,
      node: StoryNode,
      body: string,
      question: string
    ): Promise<ApiResult<AskResult>> =>
      wrap(() => answerQuestion(outline, node, body, question))
  )
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
