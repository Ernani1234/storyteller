import { core } from './config'
import { queryKey, safeId } from './ids'
import type { Engine, LibraryEntry, SavedStory } from '../shared/types'

/**
 * Saved stories with reading progress. Stored as one JSON value per story
 * plus a small index, in whatever key-value store the host provides (files on
 * desktop, IndexedDB on mobile).
 */

const INDEX = 'index'

async function readIndex(): Promise<LibraryEntry[]> {
  return (await core().library.get<LibraryEntry[]>(INDEX)) ?? []
}

// Serialize writes: the UI saves often (reading progress) and two overlapping
// read-modify-write cycles would drop entries from the index.
let queue: Promise<unknown> = Promise.resolve()
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn)
  queue = next.catch(() => undefined)
  return next
}

export async function listLibrary(): Promise<LibraryEntry[]> {
  return (await readIndex()).sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function loadStory(id: string): Promise<SavedStory | null> {
  return core().library.get<SavedStory>(safeId(id))
}

export function saveStory(story: SavedStory, extraKeys: string[] = []): Promise<LibraryEntry> {
  return serial(async () => {
    const o = story.outline
    const id = safeId(o.id)
    const idx = await readIndex()
    const prev = idx.find((e) => e.id === id)
    const keys = new Set([...(prev?.keys ?? []), queryKey(o.query.text), queryKey(o.title), ...extraKeys.map(queryKey)])
    const entry: LibraryEntry = {
      id,
      title: o.title,
      mediaType: o.mediaType,
      poster: o.meta.poster,
      year: o.meta.year,
      engine: o.engine,
      total: o.nodes.length,
      read: story.read.filter((r) => o.nodes.some((n) => n.id === r)).length,
      favorite: story.favorite,
      updatedAt: Date.now(),
      keys: [...keys].filter(Boolean)
    }
    await core().library.set(id, { ...story, updatedAt: entry.updatedAt })
    await core().library.set(INDEX, [entry, ...idx.filter((e) => e.id !== id)])
    return entry
  })
}

export function removeStory(id: string): Promise<void> {
  return serial(async () => {
    const idx = await readIndex()
    await core().library.set(INDEX, idx.filter((e) => e.id !== safeId(id)))
    await core().library.del(safeId(id))
  })
}

/** A saved story for this query + engine, so AI stories reopen without spending tokens. */
export async function findSaved(text: string, engine: Engine): Promise<LibraryEntry | null> {
  const key = queryKey(text)
  if (!key) return null
  const idx = await readIndex()
  return idx.find((e) => e.engine === engine && e.keys.includes(key)) ?? null
}

export async function libraryCount(): Promise<number> {
  return (await readIndex()).length
}
