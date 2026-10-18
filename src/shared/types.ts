/**
 * How a story is built:
 * - `sources`: no AI at all — plots are scraped from Wikipedia, Fandom,
 *   TVMaze, AniList and Wikidata, then segmented into chapters locally.
 * - `hybrid`: sources are scraped first and handed to the AI as ground truth,
 *   so it restructures/translates real plot text instead of inventing it.
 * - `ai`: the model reconstructs the story from its own knowledge (works for
 *   obscure titles that have no wiki plot).
 */
export type Engine = 'sources' | 'hybrid' | 'ai'
export type UiLanguage = 'auto' | 'en' | 'pt'
export type ReadingFont = 'sans' | 'serif'

export interface SourceToggles {
  wikipedia: boolean
  fandom: boolean
  tvmaze: boolean
  anilist: boolean
}

export interface Settings {
  engine: Engine
  apiKey: string
  /** OpenAI-compatible endpoint (Ollama, LM Studio, OpenRouter…). Empty = OpenAI. */
  aiBaseUrl: string
  model: string
  theme: string
  /** Story language: 'auto' or a language name ("Português", "English"…). */
  language: string
  uiLanguage: UiLanguage
  readingFont: ReadingFont
  textScale: number
  spoilerShield: boolean
  sources: SourceToggles
  onboarded: boolean
}

/** What the renderer sees: the API key itself never leaves the main process. */
export type PublicSettings = Omit<Settings, 'apiKey'> & {
  hasApiKey: boolean
  apiKeyHint: string
  /** true when AI calls can be made (key set, or a custom local endpoint). */
  aiReady: boolean
}

export type SettingsPatch = Partial<Omit<Settings, 'apiKey'>> & {
  /** undefined = keep, '' = remove, anything else = replace. */
  apiKey?: string
}

export interface SearchSuggestion {
  title: string
  description?: string
  thumbnail?: string
  /** Wikipedia language edition the title belongs to. */
  lang: string
  qid?: string
}

export interface StoryQuery {
  text: string
  lang?: string
  wikiTitle?: string
  qid?: string
  /** Force a specific plot source id (see PlotSourceOption). */
  plotSource?: string
}

export interface SourceRef {
  name: string
  url: string
  license?: string
}

export interface StoryImage {
  url: string
  caption: string
  source?: string
}

export type NodeKind = 'chapter' | 'season' | 'section'

export interface Episode {
  id: string
  season: number
  number: number | null
  title: string
  airdate?: string
  summary: string
  image?: string
  url?: string
}

/** A single node in the story outline (one "chapter" of the tale). */
export interface StoryNode {
  id: string
  /** id of the parent node, null for the root. */
  parentId: string | null
  title: string
  /** teaser shown on the tree node. */
  summary: string
  /** chronological order hint within siblings. */
  order: number
  kind?: NodeKind
  /** Source text for this chapter (scraped). Used for offline reading, search and AI grounding. */
  text?: string
  episodes?: Episode[]
  /** Images that came with the source text (e.g. Fandom screenshots). */
  images?: StoryImage[]
}

export interface Character {
  name: string
  description?: string
  image?: string
  /** story role, e.g. "MAIN" / "SUPPORTING" (AniList). */
  role?: string
  /** performer (actor / voice actor). */
  actor?: string
  url?: string
}

export type RelationKind =
  | 'prequel'
  | 'sequel'
  | 'series'
  | 'source'
  | 'adaptation'
  | 'spinoff'
  | 'other'

export interface RelatedWork {
  title: string
  relation: RelationKind
  qid?: string
  lang?: string
  wikiTitle?: string
  image?: string
  note?: string
}

export type CreatorRole =
  | 'director'
  | 'author'
  | 'creator'
  | 'developer'
  | 'publisher'
  | 'studio'
  | 'network'
  | 'composer'

export interface WorkMeta {
  qid?: string
  year?: string
  creators: { role: CreatorRole; names: string[] }[]
  genres: string[]
  poster?: string
  banner?: string
  /** 0-10 */
  score?: number
  episodes?: number
  wikiUrl?: string
}

export interface PlotSourceOption {
  id: string
  label: string
  lang: string
  words: number
}

/**
 * Banners shown above the story:
 * - thin: sources had little or no plot text,
 * - lang: plot only found in another language than requested.
 */
export type OutlineNotice = { kind: 'thin' } | { kind: 'lang'; lang: string }

export interface StoryOutline {
  /** stable library id. */
  id: string
  query: StoryQuery
  /** canonical title. */
  title: string
  /** media kind label: game, film, anime, book, series, etc. */
  mediaType: string
  /** short framing of the whole work. */
  logline: string
  nodes: StoryNode[]
  engine: Engine
  /** language code of the story text (for read-aloud). */
  lang: string
  meta: WorkMeta
  characters: Character[]
  related: RelatedWork[]
  sources: SourceRef[]
  /** Other matches for the same query, for disambiguation. */
  alternatives: SearchSuggestion[]
  plotSources: PlotSourceOption[]
  plotSource?: string
  notice?: OutlineNotice
  createdAt: number
}

/** Detailed content for one node, fetched lazily when opened. */
export interface NodeDetail {
  id: string
  title: string
  /** full narrative for this chapter (paragraphs separated by newlines). */
  body: string
  /** key moments the reader should remember. */
  beats: string[]
  images: StoryImage[]
  episodes?: Episode[]
  /** which engine produced this text. */
  engine: 'sources' | 'ai'
}

export interface AskMatch {
  nodeId: string
  snippet: string
}

/** Answer to a user question asked from inside a node. */
export interface AskResult {
  /** Empty when nothing relevant was found. */
  answer: string
  /** id of the chapter most related to the answer, if any (for blinking). */
  relatedNodeId: string | null
  /** Verbatim passage that answers the question, if it was already told (for highlighting). */
  highlight: string | null
  /** Other chapters where the topic shows up. */
  matches: AskMatch[]
  engine: 'local' | 'ai'
  /** Set when AI was requested but failed and the local search answered instead. */
  fallbackReason?: string
}

export interface SavedStory {
  outline: StoryOutline
  details: Record<string, NodeDetail>
  read: string[]
  favorite: boolean
  lastNodeId?: string
  updatedAt: number
}

export interface LibraryEntry {
  id: string
  title: string
  mediaType: string
  poster?: string
  year?: string
  engine: Engine
  total: number
  read: number
  favorite: boolean
  updatedAt: number
  /** folded query texts + title, used to reopen without rebuilding. */
  keys: string[]
}

export type BuildStep = 'resolve' | 'sources' | 'chapters' | 'ai' | 'enrich'

export type ExportFormat = 'md' | 'pdf' | 'json'

export interface ExportLabels {
  keyMoments: string
  episodes: string
  sources: string
  chapter: string
  generatedBy: string
}

export interface DataInfo {
  cacheBytes: number
  libraryCount: number
  dataPath: string
}

export type ErrorCode =
  | 'NO_KEY'
  | 'BAD_KEY'
  | 'QUOTA'
  | 'MODEL'
  | 'CONNECT'
  | 'NETWORK'
  | 'NOT_FOUND'
  | 'NO_PLOT'
  | 'AI_FORMAT'
  | 'UNKNOWN'

export interface ApiResult<T> {
  ok: boolean
  data?: T
  error?: string
  code?: ErrorCode
}
