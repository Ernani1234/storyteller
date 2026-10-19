import Icon, { type IconName } from './Icon'
import Menu from './Menu'
import { ENGINE_ICON } from './EngineSwitch'
import { useI18n } from '../i18n'
import { capFirst } from '../../../shared/text'
import type { ExportFormat, SavedStory } from '../../../shared/types'

export type View = 'tree' | 'reader' | 'characters' | 'info'

interface Props {
  story: SavedStory
  /** machine-translated story shown as originally written. */
  showOriginal: boolean
  onToggleOriginal: () => void
  view: View
  spoilerShield: boolean
  storyDetail: 'complete' | 'local'
  continueTitle: string | null
  filter: string
  matchCount: number | null
  onView: (v: View) => void
  onContinue: () => void
  onToggleFavorite: () => void
  onToggleSpoiler: () => void
  onExport: (format: ExportFormat) => void
  onRebuild: () => void
  onFilter: (text: string) => void
}

const TABS: { id: View; icon: IconName }[] = [
  { id: 'tree', icon: 'map' },
  { id: 'reader', icon: 'read' },
  { id: 'characters', icon: 'users' },
  { id: 'info', icon: 'info' }
]

export default function StoryHeader(p: Props): JSX.Element {
  const { t, langName } = useI18n()
  const o = p.story.outline
  const total = o.nodes.length
  const read = p.story.read.length
  const pct = total ? Math.round((read / total) * 100) : 0

  return (
    <header className="story-head">
      <div className="story-head__main">
        {o.meta.poster && <img className="story-head__poster" src={o.meta.poster} alt="" />}
        <div className="story-head__text">
          <div className="story-head__title-row">
            <h1 className="story-head__title">{o.title}</h1>
            {o.mediaType && <span className="badge">{capFirst(o.mediaType)}</span>}
            {o.meta.year && <span className="badge badge--plain">{o.meta.year}</span>}
            <span className={`badge badge--engine badge--${o.engine}`}>
              <Icon name={ENGINE_ICON[o.engine]} size={12} />
              {t(`story.engine.${o.engine}`)}
            </span>
          </div>
          {o.logline && (
            <p className="story-head__logline" title={o.logline}>
              {o.logline}
            </p>
          )}
        </div>
        <div className="story-head__side">
          <div className="progress" aria-label={t('story.progress', { read, total })}>
            <span className="progress__label">{t('story.progress', { read, total })}</span>
            <span className="bar">
              <span style={{ width: `${pct}%` }} />
            </span>
          </div>
          <div className="story-head__actions">
            <button className="btn btn--primary" onClick={p.onContinue} title={p.continueTitle ?? undefined}>
              <Icon name="read" size={16} />
              {read > 0 && p.continueTitle ? t('story.continue') : t('story.start')}
            </button>
            <button
              className={`icon-btn ${p.story.favorite ? 'is-fav' : ''}`}
              aria-pressed={p.story.favorite}
              aria-label={p.story.favorite ? t('story.unfavorite') : t('story.favorite')}
              title={p.story.favorite ? t('story.unfavorite') : t('story.favorite')}
              onClick={p.onToggleFavorite}
            >
              <Icon name="star" fill={p.story.favorite ? 'currentColor' : 'none'} />
            </button>
            <button
              className={`icon-btn ${p.spoilerShield ? 'is-on' : ''}`}
              aria-pressed={p.spoilerShield}
              aria-label={p.spoilerShield ? t('story.spoilerOn') : t('story.spoilerOff')}
              title={p.spoilerShield ? t('story.spoilerOn') : t('story.spoilerOff')}
              onClick={p.onToggleSpoiler}
            >
              <Icon name={p.spoilerShield ? 'eyeOff' : 'eye'} />
            </button>
            <Menu
              label={t('story.export')}
              items={(['md', 'pdf', 'json'] as ExportFormat[])
                .filter((f) => f !== 'pdf' || window.storyteller.capabilities.pdfExport)
                .map((f) => ({
                key: f,
                label: t(`story.export.${f}`),
                icon: <Icon name="download" size={16} />,
                onSelect: () => p.onExport(f)
              }))}
              trigger={({ open, toggle, id }) => (
                <button
                  className="icon-btn"
                  onClick={toggle}
                  aria-haspopup="menu"
                  aria-expanded={open}
                  aria-controls={open ? id : undefined}
                  aria-label={t('story.export')}
                  title={t('story.export')}
                >
                  <Icon name="download" />
                </button>
              )}
            />
            {o.engine !== 'sources' && (
              <button className="icon-btn" onClick={p.onRebuild} aria-label={t('story.rebuild')} title={t('story.rebuild')}>
                <Icon name="refresh" />
              </button>
            )}
          </div>
        </div>
      </div>

      {o.translation && (
        <p className="notice notice--info" role="note">
          <Icon name="globe" size={16} />
          <span>
            {t(p.showOriginal ? 'story.notice.original' : 'story.notice.translated', { lang: langName(o.translation.from) })}
          </span>
          <button className="notice__action" onClick={p.onToggleOriginal}>
            {t(p.showOriginal ? 'story.showTranslation' : 'story.showOriginal')}
          </button>
        </p>
      )}

      {o.notice && (
        <p className="notice" role="note">
          <Icon name="info" size={16} />
          {o.notice.kind === 'thin'
            ? t('story.notice.thin')
            : t(p.storyDetail === 'complete' ? 'story.notice.langComplete' : 'story.notice.lang', { lang: langName(o.notice.lang) })}
        </p>
      )}

      <div className="story-head__bar">
        <nav className="tabs" role="tablist" aria-label={o.title}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={p.view === tab.id}
              className={`tab ${p.view === tab.id ? 'is-on' : ''}`}
              onClick={() => p.onView(tab.id)}
            >
              <Icon name={tab.icon} size={16} />
              {t(`tab.${tab.id}`)}
              {tab.id === 'characters' && o.characters.length > 0 && <span className="count">{o.characters.length}</span>}
            </button>
          ))}
        </nav>
        {(p.view === 'tree' || p.view === 'reader') && (
          <div className="find">
            <Icon name="search" size={15} />
            <input
              className="find__input"
              placeholder={t('story.find')}
              aria-label={t('story.find')}
              value={p.filter}
              onChange={(e) => p.onFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && p.filter) {
                  e.stopPropagation()
                  p.onFilter('')
                }
              }}
            />
            {p.matchCount !== null && (
              <span className="find__count">{t('story.findCount', { n: p.matchCount, total })}</span>
            )}
            {p.filter && (
              <button className="find__clear" onClick={() => p.onFilter('')} aria-label={t('story.clear')}>
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
