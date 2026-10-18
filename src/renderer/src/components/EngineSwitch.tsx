import Icon, { type IconName } from './Icon'
import Menu from './Menu'
import { useI18n } from '../i18n'
import type { Engine } from '../../../shared/types'

export const ENGINE_ICON: Record<Engine, IconName> = { sources: 'book', hybrid: 'layers', ai: 'sparkles' }

interface Props {
  engine: Engine
  aiReady: boolean
  onChange: (engine: Engine) => void
  onSetup: () => void
}

/** Top-bar toggle between scraping-only, grounded AI and pure AI. */
export default function EngineSwitch({ engine, aiReady, onChange, onSetup }: Props): JSX.Element {
  const { t } = useI18n()
  const engines: Engine[] = ['sources', 'hybrid', 'ai']
  return (
    <Menu
      label={t('engine.label')}
      items={engines.map((e) => ({
        key: e,
        selected: e === engine,
        icon: <Icon name={ENGINE_ICON[e]} />,
        label: (
          <>
            {t(`engine.${e}`)}
            {e !== 'sources' && !aiReady && <span className="chip chip--warn">{t('engine.setup')}</span>}
          </>
        ),
        description: t(`engine.${e}.desc`),
        onSelect: () => (e !== 'sources' && !aiReady ? onSetup() : onChange(e))
      }))}
      trigger={({ open, toggle, id }) => (
        <button
          className={`engine-pill engine-pill--${engine}`}
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          title={t('engine.label')}
        >
          <Icon name={ENGINE_ICON[engine]} size={16} />
          <span>{t(`engine.${engine}`)}</span>
          <Icon name="chevronDown" size={14} />
        </button>
      )}
    />
  )
}
