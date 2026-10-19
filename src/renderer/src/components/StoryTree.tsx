import { useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, {
  Background,
  ControlButton,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  type NodeMouseHandler,
  type NodeTypes
} from 'reactflow'
import 'reactflow/dist/style.css'
import StoryNodeCard from './StoryNodeCard'
import Icon from './Icon'
import { useI18n } from '../i18n'
import { layoutOutline, NODE_H, NODE_W, type StoryNodeData } from '../lib/layout'
import type { MapLayout, StoryOutline } from '../../../shared/types'

const nodeTypes: NodeTypes = { story: StoryNodeCard }

interface Props {
  outline: StoryOutline
  activeId?: string
  blinkId?: string
  readIds: Set<string>
  matchIds: Set<string> | null
  spoilerShield: boolean
  /** for stories without branches; phones always get one column. */
  layout: MapLayout
  onLayoutChange: (layout: MapLayout) => void
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

function Flow({ outline, activeId, blinkId, readIds, matchIds, spoilerShield, layout, onLayoutChange, onSelect }: Props): JSX.Element {
  const { t } = useI18n()
  const rf = useReactFlow<StoryNodeData>()
  const first = useRef(true)
  const placed = useRef(false)
  const activeRef = useRef(activeId)
  activeRef.current = activeId
  const wrapper = useRef<HTMLDivElement>(null)
  const narrow = useNarrow()
  const oneColumn = narrow || layout === 'vertical'

  const { nodes, edges, chain, column } = useMemo(
    () => layoutOutline(outline, { activeId, blinkId, readIds, matchIds, spoilerShield, maxColumns: oneColumn ? 1 : undefined }),
    [outline, activeId, blinkId, readIds, matchIds, spoilerShield, oneColumn]
  )

  // Columns, phones and long stories (a 40-chapter book): start at the first
  // chapter with cards at a readable size, and let the reader scroll on,
  // instead of shrinking the whole map until nothing can be read.
  const big = nodes.length > 20
  const fitAll = !column && !narrow && !big
  useEffect(() => {
    const w = wrapper.current?.clientWidth ?? window.innerWidth
    const h = wrapper.current?.clientHeight ?? window.innerHeight
    if (narrow) {
      const zoom = Math.min(1, (w - 40) / NODE_W)
      rf.setViewport({ x: (w - NODE_W * zoom) / 2, y: 20, zoom })
    } else if (column) {
      // Show the whole column when it fits at a readable size; otherwise start at the top.
      const graphH = Math.max(...nodes.map((n) => n.position.y)) + NODE_H
      const zoom = Math.min(1, Math.max(0.8, (h - 56) / graphH))
      rf.setViewport({ x: (w - NODE_W * zoom) / 2, y: 28, zoom })
    } else if (big) {
      const graphW = Math.max(...nodes.map((n) => n.position.x)) + NODE_W
      const zoom = Math.max(0.6, Math.min(1, (w - 80) / graphW))
      rf.setViewport({ x: (w - graphW * zoom) / 2, y: 28, zoom })
    } else if (placed.current) {
      // Switched back to the grid: the fitView prop only applies on mount.
      window.requestAnimationFrame(() => rf.fitView({ padding: 0.18, maxZoom: 1 }))
    }
    // After a layout switch, keep the open chapter on screen.
    const open = placed.current && activeRef.current ? nodes.find((n) => n.id === activeRef.current) : undefined
    if (open) {
      window.requestAnimationFrame(() =>
        rf.setCenter(open.position.x + NODE_W / 2, open.position.y + 70, { zoom: Math.max(rf.getZoom(), 0.85) })
      )
    }
    placed.current = true
  }, [narrow, big, column, outline.id, rf])

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
        fitView={fitAll}
        fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
        // A column is read by scrolling: the wheel pans, Ctrl+wheel or a pinch zooms.
        panOnScroll={column}
        panOnScrollSpeed={1}
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
        <Controls showInteractive={false} position="bottom-left">
          {chain && !narrow && nodes.length > 4 && (
            <ControlButton
              className="layout-toggle"
              onClick={() => onLayoutChange(layout === 'vertical' ? 'compact' : 'vertical')}
              title={layout === 'vertical' ? t('map.toCompact') : t('map.toVertical')}
              aria-label={layout === 'vertical' ? t('map.toCompact') : t('map.toVertical')}
            >
              <Icon name={layout === 'vertical' ? 'zigzag' : 'column'} size={16} />
            </ControlButton>
          )}
        </Controls>
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
