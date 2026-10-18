import { useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  type NodeMouseHandler,
  type NodeTypes
} from 'reactflow'
import 'reactflow/dist/style.css'
import StoryNodeCard from './StoryNodeCard'
import { layoutOutline, NODE_W, type StoryNodeData } from '../lib/layout'
import type { StoryOutline } from '../../../shared/types'

const nodeTypes: NodeTypes = { story: StoryNodeCard }

interface Props {
  outline: StoryOutline
  activeId?: string
  blinkId?: string
  readIds: Set<string>
  matchIds: Set<string> | null
  spoilerShield: boolean
  onSelect: (id: string) => void
}

const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const NARROW = '(max-width: 600px)'
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches)
  useEffect(() => {
    const mq = window.matchMedia(NARROW)
    const on = (): void => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return narrow
}

function Flow({ outline, activeId, blinkId, readIds, matchIds, spoilerShield, onSelect }: Props): JSX.Element {
  const rf = useReactFlow<StoryNodeData>()
  const first = useRef(true)
  const wrapper = useRef<HTMLDivElement>(null)
  const narrow = useNarrow()

  const { nodes, edges } = useMemo(
    () => layoutOutline(outline, { activeId, blinkId, readIds, matchIds, spoilerShield, maxColumns: narrow ? 1 : undefined }),
    [outline, activeId, blinkId, readIds, matchIds, spoilerShield, narrow]
  )

  // Phones and long stories (a 40-chapter book): start at the first chapter
  // with cards at a readable size, and let the reader scroll on, instead of
  // shrinking the whole map until nothing can be read.
  const big = nodes.length > 20
  useEffect(() => {
    if (!narrow && !big) return
    const w = wrapper.current?.clientWidth ?? window.innerWidth
    if (narrow) {
      const zoom = Math.min(1, (w - 40) / NODE_W)
      rf.setViewport({ x: (w - NODE_W * zoom) / 2, y: 20, zoom })
      return
    }
    const graphW = Math.max(...nodes.map((n) => n.position.x)) + NODE_W
    const zoom = Math.max(0.6, Math.min(1, (w - 80) / graphW))
    rf.setViewport({ x: (w - graphW * zoom) / 2, y: 28, zoom })
  }, [narrow, big, outline.id, rf])

  // Keep the open chapter in view. Waits for the side panel's slide-in so the
  // center is computed on the final canvas width.
  useEffect(() => {
    if (!activeId) return
    const delay = first.current ? 450 : 320
    first.current = false
    const timer = window.setTimeout(() => {
      const n = rf.getNode(activeId)
      if (!n) return
      rf.setCenter(n.position.x + NODE_W / 2, n.position.y + 70, {
        zoom: Math.max(rf.getZoom(), 0.85),
        duration: reducedMotion() ? 0 : 450
      })
    }, delay)
    return () => window.clearTimeout(timer)
  }, [activeId, rf])

  const handleClick: NodeMouseHandler = (_e, node) => onSelect(node.id)

  return (
    <div ref={wrapper} style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={handleClick}
        fitView={!narrow && !big}
        fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
        minZoom={0.15}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
      >
        <Background gap={26} size={1.4} color="var(--edge)" />
        <Controls showInteractive={false} position="bottom-left" />
        {nodes.length > 6 && (
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            nodeClassName={(n) => {
              const d = n.data as StoryNodeData
              return [d.isActive && 'mm-active', d.isRead && 'mm-read', d.isDimmed && 'mm-dim'].filter(Boolean).join(' ')
            }}
            nodeBorderRadius={8}
          />
        )}
      </ReactFlow>
    </div>
  )
}

export default function StoryTree(props: Props): JSX.Element {
  return (
    <ReactFlowProvider key={props.outline.id}>
      <Flow {...props} />
    </ReactFlowProvider>
  )
}
