import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { useI18n } from '../i18n'
import { speak, stopSpeaking, ttsSupported } from '../lib/tts'
import { scrollWithin } from '../lib/scroll'
import { findLoose, splitParagraphs } from '../../../shared/text'
import type {
  ApiResult,
  AskResult,
  Episode,
  ErrorCode,
  NodeDetail,
  StoryImage,
  StoryNode,
  StoryOutline
} from '../../../shared/types'

interface Props {
  outline: StoryOutline
  node: StoryNode
  index: number
  total: number
  detail?: NodeDetail
  loading: boolean
  error?: { message: string; code?: ErrorCode }
  highlight: string | null
  canRetellAi: boolean
  aiAnswers: boolean
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
  onRetry: () => void
  onRetellAi: () => void
  onAsk: (question: string) => Promise<ApiResult<AskResult>>
  onAnswer: (answer: AskResult) => void
  onGoTo: (nodeId: string) => void
  onBlink: (nodeId: string) => void
  onImage: (images: StoryImage[], index: number) => void
  /** machine-translated story shown as originally written. */
  showOriginal: boolean
  onToggleOriginal: () => void
}

/** Paragraph with an optional highlighted passage (case/whitespace-insensitive). */
function Highlighted({ text, highlight }: { text: string; highlight: string | null }): JSX.Element {
  if (!highlight) return <>{text}</>
  const range = findLoose(text, highlight) ?? (highlight.length > 90 ? findLoose(text, highlight.slice(0, 80)) : null)
  if (!range) return <>{text}</>
  return (
    <>
      {text.slice(0, range[0])}
      <mark className="hl">{text.slice(range[0], range[1])}</mark>
      {text.slice(range[1])}
    </>
  )
}

function EpisodeList({ episodes, highlight }: { episodes: Episode[]; highlight: string | null }): JSX.Element {
  const { t } = useI18n()
  // Real synopses (not one-line blurbs) are the season's story: show them open.
  const avgWords = episodes.reduce((n, e) => n + e.summary.split(/s+/).length, 0) / Math.max(1, episodes.length)
  const openAll = episodes.length <= 30 && avgWords >= 50
  return (
    <section className="episodes">
      <h3>
        {t('panel.episodes')} <span className="count">{episodes.length}</span>
      </h3>
      <ol>
        {episodes.map((e) => {
          const hit = !!highlight && !!findLoose(e.summary, highlight)
          return (
            <li key={e.id}>
              <details open={hit || openAll || undefined}>
                <summary>
                  <span className="ep__num">{e.number ?? '•'}</span>
                  <span className="ep__title">{e.title}</span>
                  {e.airdate && <span className="ep__date">{e.airdate.slice(0, 4)}</span>}
                </summary>
                <div className="ep__body">
                  {e.image && <img src={e.image} alt="" loading="lazy" />}
                  <p>{e.summary ? <Highlighted text={e.summary} highlight={highlight} /> : '—'}</p>
                  {e.url && (
                    <a href={e.url} target="_blank" rel="noreferrer" className="link">
                      TVMaze <Icon name="external" size={12} />
                    </a>
                  )}
                </div>
              </details>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

export default function NodePanel(p: Props): JSX.Element {
  const { t, langName } = useI18n()
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [answer, setAnswer] = useState<AskResult | null>(null)
  const [askError, setAskError] = useState('')
  const [speaking, setSpeaking] = useState(false)
  const [copied, setCopied] = useState(false)
  const nodeRef = useRef(p.node.id)
  const bodyRef = useRef<HTMLDivElement>(null)

  // New chapter: reset the Q&A and the reader, scroll to top.
  useEffect(() => {
    nodeRef.current = p.node.id
    setQuestion('')
    setAnswer(null)
    setAskError('')
    stopSpeaking()
    setSpeaking(false)
    bodyRef.current?.scrollTo({ top: 0 })
  }, [p.node.id])

  useEffect(() => () => stopSpeaking(), [])

  // Scroll the highlighted passage into view when it appears. Only the panel
  // body scrolls: scrollIntoView would also shift every ancestor, app shell included.
  useEffect(() => {
    if (!p.highlight) return
    const timer = window.setTimeout(() => {
      const body = bodyRef.current
      const mark = body?.querySelector('mark.hl')
      if (body && mark) scrollWithin(body, mark, 'center')
    }, 60)
    return () => window.clearTimeout(timer)
  }, [p.highlight, p.detail?.id])

  // Sources mode has the text up front: show it while images load.
  const body = p.detail?.body ?? p.node.text ?? ''
  const images = p.detail?.images ?? p.node.images ?? []
  const episodes = p.detail?.episodes ?? p.node.episodes ?? []
  const paragraphs = splitParagraphs(body)

  async function ask(): Promise<void> {
    const q = question.trim()
    if (!q || asking) return
    const asked = p.node.id
    setAsking(true)
    setAskError('')
    setAnswer(null)
    const res = await p.onAsk(q)
    if (nodeRef.current !== asked) return // user moved on; drop the stale answer
    setAsking(false)
    if (!res.ok || !res.data) {
      setAskError(res.code ? t(`err.${res.code}`, { msg: res.error ?? '', q }) : (res.error ?? ''))
      return
    }
    setAnswer(res.data)
    p.onAnswer(res.data)
  }

  function toggleSpeak(): void {
    if (speaking) {
      stopSpeaking()
      setSpeaking(false)
      return
    }
    setSpeaking(true)
    speak(`${p.node.title}.\n${body}`, p.outline.lang, () => setSpeaking(false))
  }

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(`${p.node.title}\n\n${body}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard refused */
    }
  }

  const related =
    answer?.relatedNodeId && answer.relatedNodeId !== p.node.id
      ? p.outline.nodes.find((n) => n.id === answer.relatedNodeId)
      : undefined
  const titleOf = (id: string): string => p.outline.nodes.find((n) => n.id === id)?.title ?? id
  const showSkeleton = p.loading && !body

  return (
    <aside className="panel" aria-label={p.node.title}>
      <header className="panel__head">
        <div className="panel__heading">
          <span className="eyebrow">{t('panel.chapterOf', { n: p.index + 1, total: p.total })}</span>
          <h2 className="panel__title">{p.detail?.title ?? p.node.title}</h2>
        </div>
        <button className="icon-btn" onClick={p.onClose} aria-label={t('panel.close')} title={`${t('panel.close')} (Esc)`}>
          <Icon name="close" />
        </button>
      </header>

      <div className="panel__tools">
        <div className="btn-group">
          <button className="icon-btn icon-btn--sm" onClick={p.onPrev} disabled={!p.onPrev} aria-label={t('panel.prev')} title={`${t('panel.prev')} (←)`}>
            <Icon name="chevronLeft" />
          </button>
          <button className="icon-btn icon-btn--sm" onClick={p.onNext} disabled={!p.onNext} aria-label={t('panel.next')} title={`${t('panel.next')} (→)`}>
            <Icon name="chevronRight" />
          </button>
        </div>
        <span className="panel__tools-sep" />
        {ttsSupported() && (
          <button className={`tool ${speaking ? 'is-on' : ''}`} onClick={toggleSpeak} disabled={!body}>
            <Icon name={speaking ? 'stop' : 'volume'} size={16} />
            {speaking ? t('panel.stop') : t('panel.listen')}
          </button>
        )}
        <button className="tool" onClick={copy} disabled={!body}>
          <Icon name={copied ? 'check' : 'copy'} size={16} />
          {copied ? t('panel.copied') : t('panel.copy')}
        </button>
        {p.canRetellAi && (
          <button className="tool tool--ai" onClick={p.onRetellAi} disabled={p.loading}>
            <Icon name="sparkles" size={16} />
            {t('panel.retellAi')}
          </button>
        )}
      </div>

      <div className="panel__body" ref={bodyRef}>
        {showSkeleton && (
          <div className="skeleton" aria-busy="true" aria-label={t('panel.loading')}>
            <div className="skeleton__gallery">
              <span />
              <span />
            </div>
            {Array.from({ length: 7 }, (_, i) => (
              <span key={i} className="skeleton__line" style={{ width: `${92 - ((i * 13) % 30)}%` }} />
            ))}
          </div>
        )}

        {!p.loading && p.error && !p.detail && (
          <div className="panel__error" role="alert">
            <Icon name="alert" size={20} />
            <p>{p.error.code ? t(`err.${p.error.code}`, { msg: p.error.message, q: p.node.title }) : p.error.message}</p>
            <button className="btn" onClick={p.onRetry}>
              <Icon name="refresh" size={16} />
              {t('panel.retry')}
            </button>
          </div>
        )}

        {!showSkeleton && body && (
          <>
            {(images.length > 0 || p.loading) && (
              <div className="gallery">
                {images.map((img, i) => (
                  <button key={img.url} className="shot" onClick={() => p.onImage(images, i)} aria-label={`${t('panel.openImage')}: ${img.caption}`}>
                    <img src={img.url} alt="" loading="lazy" />
                    <span className="shot__cap">{img.caption}</span>
                  </button>
                ))}
                {p.loading && images.length < 2 && <span className="shot shot--ghost" aria-label={t('panel.imagesLoading')} />}
              </div>
            )}

            <div className="prose">
              {paragraphs.map((para, i) => (
                <p key={i}>
                  <Highlighted text={para} highlight={p.highlight} />
                </p>
              ))}
            </div>

            {p.detail && p.detail.beats.length > 0 && (
              <section className="beats">
                <h3>{t('panel.keyMoments')}</h3>
                <ul>
                  {p.detail.beats.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {!showSkeleton && episodes.length > 0 && <EpisodeList episodes={episodes} highlight={p.highlight} />}

        {!showSkeleton && (body || episodes.length > 0) && (
          <footer className="provenance">
            <span className={`chip ${p.detail?.engine === 'ai' ? 'chip--ai' : ''}`}>
              <Icon name={p.detail?.engine === 'ai' ? 'sparkles' : 'book'} size={13} />
              {p.detail?.engine === 'ai' ? t('panel.fromAi') : t('panel.fromSources')}
            </span>
            {p.outline.translation && p.detail?.engine !== 'ai' && (
              <button type="button" className="chip chip--btn chip--accent" onClick={p.onToggleOriginal}>
                <Icon name="globe" size={13} />
                {p.showOriginal
                  ? t('story.showTranslation')
                  : `${t('panel.translated', { lang: langName(p.outline.translation.from) })} · ${t('story.showOriginal')}`}
              </button>
            )}
            {p.outline.sources
              .filter((s) => s.name !== 'Wikidata')
              .map((s) => (
                <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="link link--small" title={s.license}>
                  {s.name}
                </a>
              ))}
          </footer>
        )}

        {!showSkeleton && (
          <section className="ask">
            <div className="ask__head">
              <h3>
                <Icon name="message" size={16} />
                {t('ask.title')}
              </h3>
              <span className="chip">{p.aiAnswers ? t('ask.ai') : t('ask.local')}</span>
            </div>
            <form
              className="ask__row"
              onSubmit={(e) => {
                e.preventDefault()
                ask()
              }}
            >
              <input
                className="input"
                placeholder={t('ask.placeholder')}
                aria-label={t('ask.title')}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
              <button className="btn btn--primary" type="submit" disabled={asking || !question.trim()}>
                {asking ? <span className="spinner spinner--sm" aria-hidden="true" /> : t('ask.button')}
              </button>
            </form>

            {askError && <p className="form-error">{askError}</p>}

            {answer && (
              <div className="answer">
                {answer.engine === 'local' && answer.answer && <span className="eyebrow">{t('ask.passage')}</span>}
                <p>{answer.answer || t('ask.noMatch')}</p>
                {related && (
                  <button className="answer__link" onClick={() => p.onGoTo(related.id)} onMouseEnter={() => p.onBlink(related.id)}>
                    <Icon name="arrowRight" size={14} />
                    {t('ask.related', { title: related.title })}
                  </button>
                )}
                {answer.highlight && p.highlight && <p className="answer__hint">{t('ask.highlighted')}</p>}
                {answer.matches.length > 0 && (
                  <div className="answer__more">
                    <span className="eyebrow">{t('ask.alsoIn')}</span>
                    <ul>
                      {answer.matches.map((m) => (
                        <li key={m.nodeId}>
                          <button className="link" onClick={() => p.onGoTo(m.nodeId)} onMouseEnter={() => p.onBlink(m.nodeId)}>
                            {titleOf(m.nodeId)}
                          </button>
                          <span className="answer__snippet">{m.snippet}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {answer.fallbackReason && <p className="answer__hint">{t('ask.fallback')}</p>}
              </div>
            )}
          </section>
        )}
      </div>
    </aside>
  )
}
