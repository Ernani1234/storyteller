import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { StorytellerApi } from '../shared/api'
import type { BuildStep } from '../shared/types'

const api: StorytellerApi = {
  capabilities: { platform: 'desktop', pdfExport: true, dataFolder: true },

  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),

  verifyAi: (key, baseUrl) => ipcRenderer.invoke('ai:verify', key, baseUrl),
  listModels: (key, baseUrl) => ipcRenderer.invoke('ai:models', key, baseUrl),

  suggest: (query) => ipcRenderer.invoke('search:suggest', query),

  buildOutline: (q) => ipcRenderer.invoke('story:outline', q),
  onProgress: (cb) => {
    const handler = (_e: IpcRendererEvent, step: BuildStep): void => cb(step)
    ipcRenderer.on('story:progress', handler)
    return () => {
      ipcRenderer.removeListener('story:progress', handler)
    }
  },
  buildNode: (outline, nodeId, opts) => ipcRenderer.invoke('story:node', outline, nodeId, opts),
  ask: (outline, nodeId, corpus, question) => ipcRenderer.invoke('story:ask', outline, nodeId, corpus, question),

  listLibrary: () => ipcRenderer.invoke('library:list'),
  getStory: (id) => ipcRenderer.invoke('library:get', id),
  saveStory: (story, keys) => ipcRenderer.invoke('library:save', story, keys),
  removeStory: (id) => ipcRenderer.invoke('library:remove', id),
  findSaved: (text) => ipcRenderer.invoke('library:find', text),

  exportStory: (story, format, labels) => ipcRenderer.invoke('story:export', story, format, labels),
  importStory: () => ipcRenderer.invoke('story:import'),

  dataInfo: () => ipcRenderer.invoke('data:info'),
  clearCache: () => ipcRenderer.invoke('data:clear-cache'),
  openDataFolder: () => ipcRenderer.invoke('data:open-folder')
}

contextBridge.exposeInMainWorld('storyteller', api)
