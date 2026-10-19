import type { Edge, Node } from 'reactflow'
import { childrenMap, readingOrder } from '../../../shared/tree'
import type { NodeKind, StoryNode, StoryOutline } from '../../../shared/types'

export interface StoryNodeData {
  title: string
  summary: string
  index: number
  kind?: NodeKind
  episodes?: number
  isRead: boolean
  isActive: boolean
  isBlinking: boolean
  isDimmed: boolean
  isMatch: boolean
  veiled: boolean
}

export const NODE_W = 240
export const NODE_H = 150
const X_GAP = 64
const TREE_Y_GAP = 180
const ROW_GAP = 70

export interface LayoutOptions {
  activeId?: string
  blinkId?: string
  readIds: Set<string>
  matchIds: Set<string> | null
  spoilerShield: boolean
  /** phones: 1 = a single column read top to bottom. */
  maxColumns?: number
}

interface Placed {
  x: number
  y: number
}

/**
 * Tidy top-down layout for branching stories: leaves take sequential
 * horizontal slots, parents center over their children.
 */
function treePositions(outline: StoryOutline): Map<string, Placed> {
  const kids = childrenMap(outline.nodes)
  const pos = new Map<string, Placed>()
  let cursor = 0
  const place = (n: StoryNode, depth: number): number => {
    const children = kids.get(n.id) ?? []
    let x: number
    if (!children.length) {
      x = cursor
      cursor += NODE_W + X_GAP
    } else {
      const xs = children.map((c) => place(c, depth + 1))
      x = (xs[0] + xs[xs.length - 1]) / 2
    }
    pos.set(n.id, { x, y: depth * TREE_Y_GAP })
    return x
  }
  for (const root of kids.get(null) ?? []) place(root, 0)
  return pos
}

/**
 * Layout for stories without branches. One column (maxColumns 1) is the
 * default: it reads top to bottom like a table of contents. The compact
 * option snakes left→right, then right→left on the next row, like a board
 * game path, which fits a 15-chapter story on one screen.
 */
function snakePositions(order: StoryNode[], maxColumns = 5): { pos: Map<string, Placed>; cols: number } {
  const n = order.length
  const cols = Math.min(maxColumns, Math.max(Math.min(3, maxColumns), Math.round(Math.sqrt(n * 1.8))))
  const pos = new Map<string, Placed>()
  order.forEach((node, i) => {
    const row = Math.floor(i / cols)
    const inRow = i % cols
    const col = row % 2 === 0 ? inRow : cols - 1 - inRow
    pos.set(node.id, { x: col * (NODE_W + X_GAP), y: row * (NODE_H + ROW_GAP) })
  })
  return { pos, cols }
}

export interface Layout {
  nodes: Node<StoryNodeData>[]
  edges: Edge[]
  /** no branches: the map can be drawn as one column or as a zig-zag grid. */
  chain: boolean
  /** drawn as a single column, read top to bottom. */
  column: boolean
}

export function layoutOutline(outline: StoryOutline, opts: LayoutOptions): Layout {
  const order = readingOrder(outline.nodes)
  if (!order.length) return { nodes: [], edges: [], chain: false, column: false }
  const indexOf = new Map(order.map((n, i) => [n.id, i]))
  const kids = childrenMap(outline.nodes)
  const isChain = outline.nodes.every((n) => (kids.get(n.id)?.length ?? 0) <= 1)
  const snake = isChain && (order.length > 4 || opts.maxColumns === 1)
  const { pos, cols } = snake ? snakePositions(order, opts.maxColumns) : { pos: treePositions(outline), cols: 0 }
  // A short chain laid out as a tree is a column too.
  const column = isChain && (cols === 1 || !snake)

  const nodes: Node<StoryNodeData>[] = order.map((n) => {
    const p = pos.get(n.id) ?? { x: 0, y: 0 }
    const isRead = opts.readIds.has(n.id)
    const isActive = opts.activeId === n.id
    return {
      id: n.id,
      type: 'story',
      position: p,
      data: {
        title: n.title,
        summary: n.summary,
        index: (indexOf.get(n.id) ?? 0) + 1,
        kind: n.kind,
        episodes: n.episodes?.length,
        isRead,
        isActive,
        isBlinking: opts.blinkId === n.id,
        isDimmed: !!opts.matchIds && !opts.matchIds.has(n.id),
        isMatch: !!opts.matchIds && opts.matchIds.has(n.id),
        veiled: opts.spoilerShield && !isRead && !isActive
      }
    }
  })

  const edgeClass = (a: string, b: string): string =>
    opts.readIds.has(a) && opts.readIds.has(b) ? 'is-read' : ''

  let edges: Edge[]
  if (snake) {
    edges = order.slice(1).map((n, k) => {
      const prev = order[k]
      const rowA = Math.floor(k / cols)
      const rowB = Math.floor((k + 1) / cols)
      const handles =
        rowA !== rowB
          ? { sourceHandle: 'b', targetHandle: 't' }
          : rowA % 2 === 0
            ? { sourceHandle: 'rs', targetHandle: 'lt' }
            : { sourceHandle: 'ls', targetHandle: 'rt' }
      return {
        id: `${prev.id}->${n.id}`,
        source: prev.id,
        target: n.id,
        type: 'smoothstep',
        className: edgeClass(prev.id, n.id),
        ...handles
      }
    })
  } else {
    edges = outline.nodes
      .filter((n) => n.parentId && pos.has(n.parentId))
      .map((n) => ({
        id: `${n.parentId}->${n.id}`,
        source: n.parentId!,
        target: n.id,
        sourceHandle: 'b',
        targetHandle: 't',
        type: 'smoothstep',
        className: edgeClass(n.parentId!, n.id)
      }))
  }
  return { nodes, edges, chain: isChain, column }
}
