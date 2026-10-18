import { useEffect, useRef } from 'react'
import Icon from './Icon'
import { useI18n } from '../i18n'
import { scrollWithin } from '../lib/scroll'
import { splitParagraphs } from '../../../shared/text'
import type { NodeDetail, StoryNode } from '../../../shared/types'

interface Props {
  order: StoryNode[]
  details: Record<string, NodeDetail>
  readIds: Set<string>
  matchIds: Set<string> | null
  loadingIds: Set<string>
  needsLoad: boolean
  scrollTo: string | null
  onLoad: (id: string) => void
  onSeen: (id: string) => void
  onOpen: (id: string) => void
}

/** The whole story as one continuous text, with a table of contents. */
export default function ReaderView(p: Props): JSX.Element {
  const { t } = useI18n()
  const flow = useRef<HTMLDivElement>(null)
  const seen = useRef(p.onSeen)
  seen.current = p.onSeen

  // A chapter counts as read once it crosses the middle of the viewport.
  useEffect(() => {
    const root = flow.current
    if (!root) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) seen.current((e.target as HTMLElement).dataset.id!)
      },
      { root, rootMargin: '-45% 0px -45% 0px' }
    )
    root.querySelectorAll('article[data-id]').forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [p.order, p.details])

  const go = (id: string, smooth = true): void => {
    const el = document.getElementById(`r-${id}`)
    if (el && flow.current) scrollWithin(flow.current, el, 'start', smooth)
  }

  useEffect(() => {
    if (p.scrollTo) go(p.scrollTo, false)
  }, [p.scrollTo])

  return (
    <div className="reader">
      <nav className="reader__toc" aria-label={t('reader.toc')}>
        <h2 className="eyebrow">{t('reader.toc')}</h2>
        <ol>
          {p.order.map((n, i) => (
            <li key={n.id} className={[p.readIds.has(n.id) && 'is-read', p.matchIds && !p.matchIds.has(n.id) && 'is-dimmed'].filter(Boolean).join(' ')}>
              <button onClick={() => go(n.id)}>
                <span className="toc__num">{p.readIds.has(n.id) ? <Icon name="check" size={12} /> : i + 1}</span>
                <span className="toc__title">{n.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="reader__flow" ref={flow}>
        {p.order.map((n, i) => {
          const d = p.details[n.id]
          const body = d?.body ?? n.text ?? ''
          const dim = p.matchIds && !p.matchIds.has(n.id)
          return (
            <article key={n.id} id={`r-${n.id}`} data-id={n.id} className={`chapter ${dim ? 'is-dimmed' : ''}`}>
              <header>
                <span className="chapter__num">{t('common.chapter')} {i + 1}</span>
                <h2>
                  <button className="chapter__title" onClick={() => p.onOpen(n.id)}>
                    {n.title}
                  </button>
                </h2>
              </header>
              {body ? (
                <div className="prose">
                  {splitParagraphs(body).map((para, k) => (
                    <p key={k}>{para}</p>
                  ))}
                </div>
              ) : (
                <>
                  <p className="chapter__summary">{n.summary}</p>
                  {p.needsLoad && (
                    <button className="btn" onClick={() => p.onLoad(n.id)} disabled={p.loadingIds.has(n.id)}>
                      {p.loadingIds.has(n.id) ? <span className="spinner spinner--sm" aria-hidden="true" /> : <Icon name="sparkles" size={16} />}
                      {p.loadingIds.has(n.id) ? t('reader.loading') : t('reader.load')}
                    </button>
                  )}
                </>
              )}
              {(d?.episodes ?? n.episodes)?.length ? (
                <ul className="chapter__eps">
                  {(d?.episodes ?? n.episodes)!.map((e) => (
                    <li key={e.id}>
                      <strong>
                        {e.number ?? '•'}. {e.title}
                      </strong>
                      {e.summary && <span> — {e.summary}</span>}
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          )
        })}
      </div>
    </div>
  )
}
