import { useState } from 'react'
import Icon from './Icon'
import { ENGINE_ICON } from './EngineSwitch'
import { useI18n } from '../i18n'
import { capFirst } from '../../../shared/text'
import type { Engine, LibraryEntry, StoryQuery, UiLanguage } from '../../../shared/types'

interface Props {
  library: LibraryEntry[]
  engine: Engine
  onSearch: (q: StoryQuery) => void
  onOpen: (id: string) => void
  onRemove: (id: string) => void
  onToggleFavorite: (id: string) => void
  onImport: () => void
}

const EXAMPLES: Record<UiLanguage, string[]> = {
  en: ['The Last of Us Part II', 'Breaking Bad', 'Fullmetal Alchemist: Brotherhood', 'Interstellar', 'Pride and Prejudice', 'Hollow Knight'],
  pt: ['The Last of Us Part II', 'Breaking Bad', 'Fullmetal Alchemist: Brotherhood', 'Interestelar', 'Dom Casmurro', 'Hollow Knight'],
  es: ['The Last of Us Part II', 'Breaking Bad', 'Fullmetal Alchemist: Brotherhood', 'Interstellar', 'Don Quijote de la Mancha', 'Hollow Knight'],
  fr: ['The Last of Us Part II', 'Breaking Bad', 'Fullmetal Alchemist: Brotherhood', 'Interstellar', 'Les Misérables', 'Hollow Knight'],
  de: ['The Last of Us Part II', 'Breaking Bad', 'Fullmetal Alchemist: Brotherhood', 'Interstellar', 'Die Verwandlung', 'Hollow Knight'],
  it: ['The Last of Us Part II', 'Breaking Bad', 'Fullmetal Alchemist: Brotherhood', 'Interstellar', 'I promessi sposi', 'Hollow Knight'],
  ja: ['The Last of Us Part II', 'ブレイキング・バッド', '鋼の錬金術師 FULLMETAL ALCHEMIST', '千と千尋の神隠し', '進撃の巨人', 'Hollow Knight']
}

export default function Home({ library, engine, onSearch, onOpen, onRemove, onToggleFavorite, onImport }: Props): JSX.Element {
  const { t, lang } = useI18n()
  const [filter, setFilter] = useState<'all' | 'fav'>('all')
  const [confirming, setConfirming] = useState<string | null>(null)
  const shown = filter === 'fav' ? library.filter((e) => e.favorite) : library

  return (
    <div className="home">
      <section className="hero">
        <div className="hero__mark" aria-hidden="true">
          ✦
        </div>
        <h1>{t('home.title')}</h1>
        <p>{engine === 'sources' ? t('home.lede.sources') : t('home.lede.ai')}</p>
        <div className="hero__try">
          <span className="hero__try-label">{t('home.try')}</span>
          {EXAMPLES[lang].map((ex) => (
            <button key={ex} className="chip chip--btn" onClick={() => onSearch({ text: ex })}>
              {ex}
            </button>
          ))}
        </div>
      </section>

      <section className="library" aria-labelledby="library-title">
        <header className="library__head">
          <h2 id="library-title">{t('home.library')}</h2>
          {library.length > 0 && (
            <div className="segmented" role="tablist">
              <button role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'is-on' : ''} onClick={() => setFilter('all')}>
                {t('home.all')} <span className="count">{library.length}</span>
              </button>
              <button role="tab" aria-selected={filter === 'fav'} className={filter === 'fav' ? 'is-on' : ''} onClick={() => setFilter('fav')}>
                {t('home.favorites')} <span className="count">{library.filter((e) => e.favorite).length}</span>
              </button>
            </div>
          )}
          <button className="btn btn--ghost" onClick={onImport}>
            <Icon name="upload" size={16} />
            {t('home.import')}
          </button>
        </header>

        {shown.length === 0 ? (
          <p className="library__empty">{filter === 'fav' ? t('home.emptyFav') : t('home.empty')}</p>
        ) : (
          <ul className="shelf">
            {shown.map((e) => {
              const pct = e.total ? Math.round((e.read / e.total) * 100) : 0
              return (
                <li key={e.id} className="book">
                  <button className="book__open" onClick={() => onOpen(e.id)}>
                    <span className="book__cover">
                      {e.poster ? (
                        <img src={e.poster} alt="" loading="lazy" />
                      ) : (
                        <span className="book__initial" aria-hidden="true">
                          {e.title.slice(0, 1)}
                        </span>
                      )}
                      <span className="book__engine" title={t(`engine.${e.engine}`)}>
                        <Icon name={ENGINE_ICON[e.engine]} size={13} />
                      </span>
                    </span>
                    <span className="book__title">{e.title}</span>
                    <span className="book__meta">{[capFirst(e.mediaType), e.year].filter(Boolean).join(' · ')}</span>
                    <span className="book__progress" aria-label={t('home.progress', { read: e.read, total: e.total })}>
                      <span className="bar">
                        <span style={{ width: `${pct}%` }} />
                      </span>
                      <span className="book__pct">{pct === 100 ? t('home.done') : t('home.progress', { read: e.read, total: e.total })}</span>
                    </span>
                  </button>
                  <div className="book__actions">
                    <button
                      className={`icon-btn icon-btn--sm ${e.favorite ? 'is-fav' : ''}`}
                      aria-pressed={e.favorite}
                      aria-label={e.favorite ? t('story.unfavorite') : t('story.favorite')}
                      title={e.favorite ? t('story.unfavorite') : t('story.favorite')}
                      onClick={() => onToggleFavorite(e.id)}
                    >
                      <Icon name="star" size={15} fill={e.favorite ? 'currentColor' : 'none'} />
                    </button>
                    {confirming === e.id ? (
                      <button className="btn btn--danger btn--xs" onClick={() => onRemove(e.id)} onBlur={() => setConfirming(null)} autoFocus>
                        {t('home.confirmRemove')}
                      </button>
                    ) : (
                      <button className="icon-btn icon-btn--sm" aria-label={t('home.remove')} title={t('home.remove')} onClick={() => setConfirming(e.id)}>
                        <Icon name="trash" size={15} />
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
