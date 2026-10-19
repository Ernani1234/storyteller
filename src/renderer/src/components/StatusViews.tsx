import Icon from './Icon'
import { useI18n } from '../i18n'
import type { BuildStep, Engine, ErrorCode } from '../../../shared/types'

const STEPS: Record<Engine, BuildStep[]> = {
  sources: ['resolve', 'sources', 'chapters'],
  hybrid: ['resolve', 'sources', 'ai'],
  ai: ['ai', 'enrich']
}

export function BuildState({ query, step, engine }: { query: string; step: BuildStep | null; engine: Engine }): JSX.Element {
  const { t } = useI18n()
  // Translation only happens when the fullest telling is in another language.
  const steps = step === 'translate' ? [...STEPS[engine], step] : STEPS[engine]
  const current = step ? steps.indexOf(step) : 0
  return (
    <div className="status" aria-busy="true">
      <div className="ghost-tree" aria-hidden="true">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} className="ghost-node" style={{ animationDelay: `${i * 120}ms` }} />
        ))}
      </div>
      <div className="status__card">
        <h1>{t('build.title', { q: query })}</h1>
        <ol className="steps">
          {steps.map((s, i) => {
            const state = i < current ? 'done' : i === current ? 'now' : 'todo'
            return (
              <li key={s} className={`step step--${state}`}>
                <span className="step__dot">{state === 'done' ? <Icon name="check" size={12} /> : state === 'now' ? <span className="spinner spinner--xs" /> : null}</span>
                {t(`build.step.${s}`)}
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}

interface ErrorProps {
  code?: ErrorCode
  message: string
  query: string
  engine: Engine
  aiReady: boolean
  onRetry: () => void
  onSettings: () => void
  onSwitchEngine: (engine: Engine) => void
}

export function ErrorState({ code = 'UNKNOWN', message, query, engine, aiReady, onRetry, onSettings, onSwitchEngine }: ErrorProps): JSX.Element {
  const { t } = useI18n()
  const keyProblem = code === 'NO_KEY' || code === 'BAD_KEY' || code === 'MODEL' || code === 'CONNECT'
  return (
    <div className="status">
      <div className="status__card status__card--error" role="alert">
        <span className="status__icon">
          <Icon name="alert" size={22} />
        </span>
        <h1>{t('error.title')}</h1>
        <p>{t(`err.${code}`, { q: query, msg: message })}</p>
        <div className="status__actions">
          {keyProblem ? (
            <button className="btn btn--primary" onClick={onSettings}>
              <Icon name="settings" size={16} />
              {t('error.settings')}
            </button>
          ) : (
            <button className="btn btn--primary" onClick={onRetry}>
              <Icon name="refresh" size={16} />
              {t('error.retry')}
            </button>
          )}
          {(code === 'NO_PLOT' || code === 'NOT_FOUND') && engine === 'sources' && aiReady && (
            <button className="btn" onClick={() => onSwitchEngine('ai')}>
              <Icon name="sparkles" size={16} />
              {t('error.useAi')}
            </button>
          )}
          {engine !== 'sources' && (keyProblem || code === 'QUOTA') && (
            <button className="btn" onClick={() => onSwitchEngine('sources')}>
              <Icon name="book" size={16} />
              {t('error.useSources')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
