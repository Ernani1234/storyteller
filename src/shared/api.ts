import type {
  ApiResult,
  AskResult,
  BuildStep,
  DataInfo,
  ExportFormat,
  ExportLabels,
  LibraryEntry,
  NodeDetail,
  PublicSettings,
  SavedStory,
  SearchSuggestion,
  SettingsPatch,
  StoryOutline,
  StoryQuery
} from './types'

/** What the host can do, so the UI hides options that don't apply. */
export interface Capabilities {
  platform: 'desktop' | 'android' | 'web'
  pdfExport: boolean
  dataFolder: boolean
}

/**
 * The bridge the UI talks to. On desktop it is the preload script (IPC to
 * the main process); on Android/web it is implemented in-page over the same
 * core (src/renderer/src/platform/web.ts).
 */
export interface StorytellerApi {
  capabilities: Capabilities

  getSettings(): Promise<PublicSettings>
  saveSettings(patch: SettingsPatch): Promise<PublicSettings>

  verifyAi(key?: string, baseUrl?: string): Promise<ApiResult<boolean>>
  listModels(key?: string, baseUrl?: string): Promise<ApiResult<string[]>>

  suggest(query: string): Promise<ApiResult<SearchSuggestion[]>>

  buildOutline(q: StoryQuery): Promise<ApiResult<StoryOutline>>
  /** Subscribe to build progress; returns an unsubscribe function. */
  onProgress(cb: (step: BuildStep) => void): () => void
  buildNode(outline: StoryOutline, nodeId: string, opts?: { forceAi?: boolean }): Promise<ApiResult<NodeDetail>>
  ask(outline: StoryOutline, nodeId: string, corpus: Record<string, string>, question: string): Promise<ApiResult<AskResult>>

  listLibrary(): Promise<LibraryEntry[]>
  getStory(id: string): Promise<SavedStory | null>
  saveStory(story: SavedStory, keys?: string[]): Promise<ApiResult<LibraryEntry>>
  removeStory(id: string): Promise<void>
  findSaved(text: string): Promise<LibraryEntry | null>

  exportStory(story: SavedStory, format: ExportFormat, labels: ExportLabels): Promise<ApiResult<string | null>>
  importStory(): Promise<ApiResult<SavedStory | null>>

  dataInfo(): Promise<DataInfo>
  clearCache(): Promise<number>
  openDataFolder(): Promise<string>

  /**
   * Hardware back button (Android). The handler returns true when it closed
   * something; otherwise the app exits. Returns an unsubscribe function.
   */
  onBack?(handler: () => boolean): () => void
}
