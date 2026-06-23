import { contextBridge, ipcRenderer } from 'electron'
import type {
  ApiResult,
  AskResult,
  NodeDetail,
  Settings,
  StoryNode,
  StoryOutline
} from '../shared/types'

const api = {
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke('settings:save', patch),
  verifyKey: (key: string): Promise<ApiResult<boolean>> =>
    ipcRenderer.invoke('key:verify', key),
  buildOutline: (query: string): Promise<ApiResult<StoryOutline>> =>
    ipcRenderer.invoke('story:outline', query),
  buildNode: (
    outline: StoryOutline,
    node: StoryNode
  ): Promise<ApiResult<NodeDetail>> =>
    ipcRenderer.invoke('story:node', outline, node),
  ask: (
    outline: StoryOutline,
    node: StoryNode,
    body: string,
    question: string
  ): Promise<ApiResult<AskResult>> =>
    ipcRenderer.invoke('story:ask', outline, node, body, question)
}

contextBridge.exposeInMainWorld('storyteller', api)

export type StorytellerApi = typeof api
