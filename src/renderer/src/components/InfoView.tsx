import Icon from './Icon'
import { ENGINE_ICON } from './EngineSwitch'
import { useI18n } from '../i18n'
import { capFirst } from '../../../shared/text'
import type { StoryOutline, StoryQuery } from '../../../shared/types'

interface Props {
  outline: StoryOutline
  onOpen: (q: StoryQuery) => void
  onPlotSource: (id: string) => void
}

function Fact({ label, num, children }: { label: string; num?: boolean; children: React.ReactNode }): JSX.Element {
  return (
    <div className="facts__row">
      <dt>{label}</dt>
      <dd className={num ? 'num' : undefined}>{children}</dd>
    </div>
  )
}

export default function InfoView({ outline: o, onOpen, onPlotSource }: Props): JSX.Element {
  const { t } = useI18n()
  const m = o.meta

  return (
    <div className="info">
      <aside className="info__aside">
        {(m.banner || m.poster) && <img className="info__poster" src={m.poster ?? m.banner} alt="" />}
        <h2 className="eyebrow">{t('info.facts')}</h2>
        <dl className="facts">
          {o.mediaType && <Fact label={t('info.type')}>{capFirst(o.mediaType)}</Fact>}
          {m.year && <Fact label={t('info.year')}>{m.year}</Fact>}
          {m.creators.map((c) => (
            <Fact key={c.role} label={t(`info.role.${c.role}`)}>
              {c.names.join(', ')}
            </Fact>
          ))}
          {m.score !== undefined && (
            <Fact label={t('info.score')} num>
              {m.score.toFixed(1)} / 10
            </Fact>
          )}
          {m.episodes !== undefined && (
            <Fact label={t('info.episodes')} num>
              {m.episodes}
            </Fact>
          )}
          <Fact label={t('info.chapters')} num>
            {o.nodes.length}
          </Fact>
          <Fact label={t('info.builtWith')}>
            <span className={`badge badge--engine badge--${o.engine}`}>
              <Icon name={ENGINE_ICON[o.engine]} size={12} />
              {t(`story.engine.${o.engine}`)}
            </span>
          </Fact>
        </dl>
        {m.genres.length > 0 && (
          <>
            <h2 className="eyebrow">{t('info.genres')}</h2>
            <div className="chips">
              {m.genres.map((g) => (
                <span key={g} className="chip">
                  {g}
                </span>
              ))}
            </div>
          </>
        )}
        {m.wikiUrl && (
          <a className="btn btn--ghost" href={m.wikiUrl} target="_blank" rel="noreferrer">
            <Icon name="globe" size={16} />
            {t('info.openWiki')}
          </a>
        )}
      </aside>

      <div className="info__main">
        {o.logline && <p className="info__logline">{o.logline}</p>}

        {o.related.length > 0 && (
          <section>
            <h2 className="section-title">{t('info.related')}</h2>
            <ul className="related">
              {o.related.map((r) => (
                <li key={`${r.relation}:${r.title}`}>
                  <button
                    className="related__card"
                    onClick={() => onOpen({ text: r.title, qid: r.qid, wikiTitle: r.wikiTitle, lang: r.lang })}
                  >
                    {r.image ? <img src={r.image} alt="" loading="lazy" /> : <span className="related__ph"><Icon name="book" size={16} /></span>}
                    <span className="related__text">
                      <span className="eyebrow">{t(`info.rel.${r.relation}`)}</span>
                      <span className="related__title">{r.title}</span>
                      {r.note && <span className="related__note">{r.note}</span>}
                    </span>
                    <Icon name="chevronRight" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {o.plotSources.length > 1 && (
          <section>
            <h2 className="section-title">{t('info.plotSource')}</h2>
            <p className="muted">{t('info.plotSourceHint')}</p>
            <div className="sources-pick" role="radiogroup" aria-label={t('info.plotSource')}>
              {o.plotSources.map((s) => (
                <button
                  key={s.id}
                  role="radio"
                  aria-checked={o.plotSource === s.id}
                  className={`source-opt ${o.plotSource === s.id ? 'is-on' : ''}`}
                  onClick={() => o.plotSource !== s.id && onPlotSource(s.id)}
                >
                  <span className="source-opt__name">{s.label}</span>
                  <span className="source-opt__meta num">
                    {s.lang.toUpperCase()} · {t('info.words', { n: s.words.toLocaleString() })}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {o.alternatives.length > 0 && (
          <section>
            <h2 className="section-title">{t('info.alternatives')}</h2>
            <div className="chips">
              {o.alternatives.map((a) => (
                <button
                  key={`${a.lang}:${a.title}`}
                  className="chip chip--btn"
                  title={a.description}
                  onClick={() => onOpen({ text: a.title, wikiTitle: a.title, lang: a.lang, qid: a.qid })}
                >
                  {a.title}
                </button>
              ))}
            </div>
          </section>
        )}

        {o.sources.length > 0 && (
          <section>
            <h2 className="section-title">{t('info.sources')}</h2>
            <ul className="source-list">
              {o.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noreferrer" className="link">
                    {s.name} <Icon name="external" size={12} />
                  </a>
                  {s.license && <span className="muted">{s.license}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
