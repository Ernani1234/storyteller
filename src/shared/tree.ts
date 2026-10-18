import type { StoryNode } from './types'

/**
 * Repair a chapter tree so it is always a valid, acyclic tree that reads as a
 * chronological chain:
 * - ids are unique and non-empty,
 * - exactly one root (the first chapter by order),
 * - a parent always comes *before* its child in story order (this rules out
 *   cycles and dangling references in one rule),
 * - a flat "star" (most chapters hung off the root) is relinked into a chain.
 */
export function normalizeTree(input: unknown[]): StoryNode[] {
  const seen = new Set<string>()
  const nodes = input
    .filter((n): n is Record<string, unknown> => !!n && typeof n === 'object')
    .map((n, i) => {
      let id = String(n.id ?? '').trim() || `ch${i + 1}`
      if (seen.has(id)) id = `${id}-${i + 1}`
      seen.add(id)
      const order = Number(n.order)
      return {
        ...(n as Partial<StoryNode>),
        id,
        parentId: n.parentId == null || n.parentId === '' ? null : String(n.parentId),
        title: String(n.title ?? '').trim() || `#${i + 1}`,
        summary: String(n.summary ?? '').trim(),
        order: Number.isFinite(order) ? order : i + 1,
        _i: i
      }
    })
  if (!nodes.length) return []

  nodes.sort((a, b) => a.order - b.order || a._i - b._i)

  const rootId = nodes[0].id
  const directToRoot = nodes.filter((n) => n.id !== rootId && n.parentId === rootId).length
  const others = nodes.length - 1
  const flat = others > 2 && directToRoot / others >= 0.6

  const placed = new Set<string>()
  let prevId: string | null = null
  const out: StoryNode[] = nodes.map((n, i) => {
    let parentId: string | null
    if (prevId === null) parentId = null
    else if (flat || !n.parentId || !placed.has(n.parentId)) parentId = prevId
    else parentId = n.parentId
    placed.add(n.id)
    prevId = n.id
    const { _i, ...rest } = n
    return { ...rest, parentId, order: i + 1 }
  })
  return out
}

/** Children lists keyed by parent id (null = roots), sorted by order. */
export function childrenMap(nodes: StoryNode[]): Map<string | null, StoryNode[]> {
  const ids = new Set(nodes.map((n) => n.id))
  const map = new Map<string | null, StoryNode[]>()
  for (const n of nodes) {
    const key = n.parentId && ids.has(n.parentId) ? n.parentId : null
    const arr = map.get(key) ?? []
    arr.push(n)
    map.set(key, arr)
  }
  for (const arr of map.values()) arr.sort((a, b) => a.order - b.order)
  return map
}

/** Depth-first reading order: the sequence a reader walks the story in. */
export function readingOrder(nodes: StoryNode[]): StoryNode[] {
  const kids = childrenMap(nodes)
  const out: StoryNode[] = []
  const seen = new Set<string>()
  const walk = (n: StoryNode): void => {
    if (seen.has(n.id)) return
    seen.add(n.id)
    out.push(n)
    for (const c of kids.get(n.id) ?? []) walk(c)
  }
  for (const r of kids.get(null) ?? []) walk(r)
  // Anything unreachable (shouldn't happen after normalizeTree) goes last.
  for (const n of nodes) if (!seen.has(n.id)) out.push(n)
  return out
}

/** Breadcrumb path root -> ... -> node. */
export function pathTo(nodes: StoryNode[], id: string): StoryNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const parts: StoryNode[] = []
  let cur = byId.get(id)
  let guard = 0
  while (cur && guard++ < 500) {
    parts.unshift(cur)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return parts
}

/** Build a linear chain of nodes (each child of the previous one). */
export function chain(nodes: Omit<StoryNode, 'parentId' | 'order'>[]): StoryNode[] {
  return nodes.map((n, i) => ({
    ...n,
    parentId: i === 0 ? null : nodes[i - 1].id,
    order: i + 1
  }))
}
