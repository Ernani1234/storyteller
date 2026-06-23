export interface Settings {
  apiKey: string
  model: string
  theme: string
  language: string
}

export type SpoilerLevel = 'full' | 'partial'

/** A single node in the story outline (one "chapter" of the tale). */
export interface StoryNode {
  id: string
  /** id of the parent node, null for the root act. */
  parentId: string | null
  title: string
  /** one-line teaser shown on the tree node. */
  summary: string
  /** chronological order hint within siblings. */
  order: number
}

export interface StoryOutline {
  /** canonical title resolved by the model. */
  title: string
  /** media kind: game, film, anime, book, series, etc. */
  mediaType: string
  /** short framing of the whole work. */
  logline: string
  nodes: StoryNode[]
}

export interface StoryImage {
  url: string
  caption: string
  source?: string
}

/** Detailed content for one node, fetched lazily when opened. */
export interface NodeDetail {
  id: string
  title: string
  /** full markdown-ish narrative for this chapter. */
  body: string
  /** bullet beats the reader should remember. */
  beats: string[]
  images: StoryImage[]
}

/** Answer to a user question asked from inside a node. */
export interface AskResult {
  answer: string
  /** id of the chapter most related to the answer, if any (for blinking). */
  relatedNodeId: string | null
  /**
   * Verbatim passage from the related chapter's narrative that answers the
   * question, if it was already told there (for highlighting). Null otherwise.
   */
  highlight: string | null
}

export interface ApiResult<T> {
  ok: boolean
  data?: T
  error?: string
}
