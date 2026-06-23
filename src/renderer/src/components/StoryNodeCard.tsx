import { Handle, Position, type NodeProps } from 'reactflow'
import type { StoryNodeData } from '../lib/layout'

export default function StoryNodeCard({
  data
}: NodeProps<StoryNodeData>): JSX.Element {
  return (
    <div
      className={`story-node ${data.isActive ? 'is-active' : ''} ${
        data.isBlinking ? 'is-blinking' : ''
      }`}
    >
      <Handle type="target" position={Position.Top} className="st-handle" />
      <div className="story-node__index">{data.index}</div>
      <div className="story-node__title">{data.title}</div>
      <div className="story-node__summary">{data.summary}</div>
      {data.hasDetail && <div className="story-node__dot" title="Read" />}
      <Handle type="source" position={Position.Bottom} className="st-handle" />
    </div>
  )
}
