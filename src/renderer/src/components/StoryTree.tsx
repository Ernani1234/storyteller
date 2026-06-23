import { useMemo } from 'react'
import ReactFlow, {
  Background,
  Controls,
  type NodeMouseHandler,
  type NodeTypes
} from 'reactflow'
import 'reactflow/dist/style.css'
import StoryNodeCard from './StoryNodeCard'
import { layoutOutline } from '../lib/layout'
import type { StoryOutline } from '../../../shared/types'

const nodeTypes: NodeTypes = { story: StoryNodeCard }

interface Props {
  outline: StoryOutline
  activeId?: string
  blinkId?: string
  detailIds: Set<string>
  onSelect: (id: string) => void
}

export default function StoryTree({
  outline,
  activeId,
  blinkId,
  detailIds,
  onSelect
}: Props): JSX.Element {
  const { nodes, edges } = useMemo(
    () => layoutOutline(outline, { activeId, blinkId, detailIds }),
    [outline, activeId, blinkId, detailIds]
  )

  const handleClick: NodeMouseHandler = (_e, node) => onSelect(node.id)

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={handleClick}
      fitView
      fitViewOptions={{ padding: 0.25 }}
      minZoom={0.2}
      maxZoom={1.6}
      proOptions={{ hideAttribution: true }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
    >
      <Background gap={26} size={1.4} color="var(--edge)" />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}
