import { useEffect, useState } from 'react'
import type {
  AskResult,
  NodeDetail,
  StoryNode,
  StoryOutline
} from '../../../shared/types'

interface Props {
  outline: StoryOutline
  node?: StoryNode
  title: string
  loading: boolean
  error?: string
  detail?: NodeDetail
  onClose: () => void
  onRetry: () => void
  /** Ask the tree to blink/focus a related node. */
  onBlink: (nodeId: string) => void
  /** Navigate to a related node when the user follows the answer. */
  onGoToNode: (nodeId: string) => void
}

/** Render a paragraph, wrapping a highlight substring (case-insensitive) in <mark>. */
function withHighlight(text: string, highlight: string | null): JSX.Element {
  if (!highlight) return <>{text}</>
  const idx = text.toLowerCase().indexOf(highlight.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="hl">{text.slice(idx, idx + highlight.length)}</mark>
      {text.slice(idx + highlight.length)}
    </>
  )
}

export default function NodePanel({
  outline,
  node,
  title,
  loading,
  error,
  detail,
  onClose,
  onRetry,
  onBlink,
  onGoToNode
}: Props): JSX.Element {
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [answer, setAnswer] = useState<AskResult | null>(null)
  const [askError, setAskError] = useState('')

  // Reset the Q&A whenever we switch chapters.
  useEffect(() => {
    setQuestion('')
    setAnswer(null)
    setAskError('')
  }, [detail?.id])

  const highlight =
    answer && answer.relatedNodeId === detail?.id ? answer.highlight : null

  async function ask(): Promise<void> {
    const q = question.trim()
    if (!q || !node || !detail || asking) return
    setAsking(true)
    setAskError('')
    setAnswer(null)
    const res = await window.storyteller.ask(outline, node, detail.body, q)
    setAsking(false)
    if (!res.ok || !res.data) {
      setAskError(res.error ?? 'Could not answer that.')
      return
    }
    setAnswer(res.data)
    if (res.data.relatedNodeId) onBlink(res.data.relatedNodeId)
  }

  const relatedNode =
    answer?.relatedNodeId && answer.relatedNodeId !== detail?.id
      ? outline.nodes.find((n) => n.id === answer.relatedNodeId)
      : undefined

  return (
    <aside className="panel">
      <header className="panel__head">
        <h2 className="panel__title">{detail?.title ?? title}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>

      <div className="panel__body">
        {loading && (
          <div className="panel__loading">
            <div className="spinner" />
            <p>Reading this chapter…</p>
          </div>
        )}

        {!loading && error && (
          <div className="panel__error">
            <p>{error}</p>
            <button className="btn" onClick={onRetry}>
              Try again
            </button>
          </div>
        )}

        {!loading && !error && detail && (
          <>
            {detail.images.length > 0 && (
              <div className="panel__gallery">
                {detail.images.map((img) => (
                  <figure key={img.url} className="shot">
                    <img src={img.url} alt={img.caption} loading="lazy" />
                    <figcaption>{img.caption}</figcaption>
                  </figure>
                ))}
              </div>
            )}

            <div className="prose">
              {detail.body
                .split(/\n{2,}/)
                .filter(Boolean)
                .map((p, i) => (
                  <p key={i}>{withHighlight(p, highlight)}</p>
                ))}
            </div>

            {detail.beats.length > 0 && (
              <div className="beats">
                <h3>Key moments</h3>
                <ul>
                  {detail.beats.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Ask about this chapter */}
            <div className="ask">
              <h3>Ask about this part</h3>
              <div className="ask__row">
                <input
                  className="input"
                  placeholder="e.g. Why did they betray him?"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && ask()}
                />
                <button
                  className="btn btn--primary"
                  disabled={asking || !question.trim()}
                  onClick={ask}
                >
                  {asking ? '…' : 'Ask'}
                </button>
              </div>

              {askError && <p className="form-error">{askError}</p>}

              {answer && (
                <div className="answer">
                  <p>{answer.answer}</p>
                  {relatedNode && (
                    <button
                      className="answer__link"
                      onClick={() => onGoToNode(relatedNode.id)}
                      onMouseEnter={() => onBlink(relatedNode.id)}
                    >
                      ↪ Related chapter: {relatedNode.title}
                    </button>
                  )}
                  {highlight && (
                    <p className="answer__hint">
                      Highlighted above in this chapter.
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
