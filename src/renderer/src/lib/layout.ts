import type { Edge, Node } from 'reactflow'
import type { StoryNode, StoryOutline } from '../../../shared/types'

export interface StoryNodeData {
  title: string
  summary: string
  index: number
  hasDetail: boolean
  isActive: boolean
  isBlinking: boolean
}

const NODE_W = 230
const X_GAP = 60
const Y_GAP = 150

interface Tree {
  node: StoryNode
  children: Tree[]
}

function buildTree(outline: StoryOutline): Tree | null {
  const byId = new Map(outline.nodes.map((n) => [n.id, n]))
  const childrenOf = new Map<string | null, StoryNode[]>()
  for (const n of outline.nodes) {
    const key = n.parentId && byId.has(n.parentId) ? n.parentId : null
    const arr = childrenOf.get(key) ?? []
    arr.push(n)
    childrenOf.set(key, arr)
  }
  for (const arr of childrenOf.values()) arr.sort((a, b) => a.order - b.order)

  const roots = childrenOf.get(null) ?? []
  if (!roots.length) return null

  const make = (n: StoryNode): Tree => ({
    node: n,
    children: (childrenOf.get(n.id) ?? []).map(make)
  })

  // If multiple roots slipped through, attach the rest under the first.
  const tree = make(roots[0])
  for (let i = 1; i < roots.length; i++) tree.children.push(make(roots[i]))
  return tree
}

/**
 * Tidy top-down layout: leaves take sequential horizontal slots, parents
 * center over their children. Returns reactflow nodes + edges.
 */
export function layoutOutline(
  outline: StoryOutline,
  opts: { activeId?: string; blinkId?: string; detailIds: Set<string> }
): { nodes: Node<StoryNodeData>[]; edges: Edge[] } {
  const tree = buildTree(outline)
  if (!tree) return { nodes: [], edges: [] }

  const positions = new Map<string, { x: number; depth: number }>()
  let cursor = 0
  let counter = 0
  const indexOf = new Map<string, number>()

  const place = (t: Tree, depth: number): number => {
    indexOf.set(t.node.id, counter++)
    let x: number
    if (t.children.length === 0) {
      x = cursor
      cursor += NODE_W + X_GAP
    } else {
      const childXs = t.children.map((c) => place(c, depth + 1))
      x = (childXs[0] + childXs[childXs.length - 1]) / 2
    }
    positions.set(t.node.id, { x, depth })
    return x
  }
  place(tree, 0)

  const nodes: Node<StoryNodeData>[] = outline.nodes.map((n) => {
    const pos = positions.get(n.id) ?? { x: 0, depth: 0 }
    return {
      id: n.id,
      type: 'story',
      position: { x: pos.x, y: pos.depth * Y_GAP },
      data: {
        title: n.title,
        summary: n.summary,
        index: (indexOf.get(n.id) ?? 0) + 1,
        hasDetail: opts.detailIds.has(n.id),
        isActive: opts.activeId === n.id,
        isBlinking: opts.blinkId === n.id
      }
    }
  })

  const edges: Edge[] = outline.nodes
    .filter((n) => n.parentId && positions.has(n.parentId))
    .map((n) => ({
      id: `${n.parentId}->${n.id}`,
      source: n.parentId!,
      target: n.id,
      type: 'smoothstep',
      animated: false
    }))

  return { nodes, edges }
}
