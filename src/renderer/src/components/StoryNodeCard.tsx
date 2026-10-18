import { Handle, Position, type NodeProps } from 'reactflow'
import Icon from './Icon'
import { useI18n } from '../i18n'
import type { StoryNodeData } from '../lib/layout'

export default function StoryNodeCard({ data }: NodeProps<StoryNodeData>): JSX.Element {
  const { t } = useI18n()
  const cls = [
    'story-node',
    data.isActive && 'is-active',
    data.isBlinking && 'is-blinking',
    data.isRead && 'is-read',
    data.isDimmed && 'is-dimmed',
    data.isMatch && 'is-match',
    data.veiled && 'is-veiled',
    data.kind && `story-node--${data.kind}`
  ]
    .filter(Boolean)
    .join(' ')

  return (
    // A real button: focusable, Enter/Space open the chapter, and the click
    // bubbles up to React Flow's onNodeClick.
    <button className={cls} aria-current={data.isActive ? 'step' : undefined}>
      <Handle type="target" position={Position.Top} id="t" className="st-handle" />
      <Handle type="source" position={Position.Bottom} id="b" className="st-handle" />
      <Handle type="target" position={Position.Left} id="lt" className="st-handle" />
      <Handle type="source" position={Position.Right} id="rs" className="st-handle" />
      <Handle type="source" position={Position.Left} id="ls" className="st-handle" />
      <Handle type="target" position={Position.Right} id="rt" className="st-handle" />

      <span className="story-node__top">
        <span className="story-node__index">{data.index}</span>
        {data.episodes ? (
          <span className="story-node__kind">
            <Icon name="tv" size={12} />
            {t('common.eps', { n: data.episodes })}
          </span>
        ) : null}
        {data.isRead && (
          <span className="story-node__read">
            <Icon name="check" size={13} />
          </span>
        )}
      </span>
      <span className="story-node__title">{data.title}</span>
      <span className="story-node__summary">{data.summary}</span>
    </button>
  )
}
