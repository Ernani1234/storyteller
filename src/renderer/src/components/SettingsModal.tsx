import { useEffect, useRef, useState } from 'react'
import Icon, { type IconName } from './Icon'
import { ENGINE_ICON } from './EngineSwitch'
import { themes, applyAppearance, SYSTEM_THEME } from '../themes'
import { useI18n } from '../i18n'
import { UI_LANGUAGES, UI_LANGUAGE_NAMES, UI_LANGUAGE_TAGS } from '../../../shared/languages'
import type { DataInfo, Engine, MapLayout, PublicSettings, SettingsPatch, SourceToggles, UiLanguage } from '../../../shared/types'

export type SettingsSection = 'appearance' | 'engine' | 'ai' | 'data'

interface Props {
  settings: PublicSettings
  section: SettingsSection
  onClose: () => void
  onSaved: (s: PublicSettings) => void
}

const STORY_LANGS = ['auto', 'English', 'Português', 'Español', 'Français', 'Deutsch', 'Italiano', '日本語']
const SECTIONS: { id: SettingsSection; icon: IconName }[] = [
  { id: 'appearance', icon: 'eye' },
  { id: 'engine', icon: 'layers' },
  { id: 'ai', icon: 'sparkles' },
  { id: 'data', icon: 'folder' }
]
const SOURCES: (keyof SourceToggles)[] = ['wikipedia', 'fandom', 'tvmaze', 'anilist']

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 ** 2).toFixed(1)} MB`
}

export default function SettingsModal({ settings, section: initial, onClose, onSaved }: Props): JSX.Element {
  const { t } = useI18n()
  const [section, setSection] = useState<SettingsSection>(initial)
  const [draft, setDraft] = useState<PublicSettings>(settings)
  const [keyInput, setKeyInput] = useState('')
  const [removeKey, setRemoveKey] = useState(false)
  const [check, setCheck] = useState<{ state: 'idle' | 'busy' | 'ok' | 'bad'; msg?: string }>({ state: 'idle' })
  const [models, setModels] = useState<string[] | null>(null)
  const [loadingModels, setLoadingModels] = useState(false)
  const [info, setInfo] = useState<DataInfo | null>(null)
  const [cleared, setCleared] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const dialog = useRef<HTMLDivElement>(null)
  const caps = window.storyteller.capabilities

  const set = <K extends keyof PublicSettings>(k: K, v: PublicSettings[K]): void => setDraft((d) => ({ ...d, [k]: v }))

  // Live preview of appearance; App re-applies the saved look on cancel.
  useEffect(() => {
    applyAppearance(draft)
  }, [draft.theme, draft.readingFont, draft.textScale])

  useEffect(() => {
    if (section === 'data') window.storyteller.dataInfo().then(setInfo)
  }, [section])

  // Focus once on open; doing it on every render would steal focus while typing.
  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>('.settings__nav button[aria-selected="true"]')?.focus()
  }, [])

  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  async function verify(): Promise<void> {
    setCheck({ state: 'busy' })
    const res = await window.storyteller.verifyAi(keyInput.trim() || undefined, draft.aiBaseUrl)
    setCheck(res.ok ? { state: 'ok' } : { state: 'bad', msg: res.error })
  }

  async function loadModels(): Promise<void> {
    setLoadingModels(true)
    const res = await window.storyteller.listModels(keyInput.trim() || undefined, draft.aiBaseUrl)
    setLoadingModels(false)
    if (res.ok && res.data) setModels(res.data)
    else setCheck({ state: 'bad', msg: res.error })
  }

  async function save(): Promise<void> {
    setSaving(true)
    const patch: SettingsPatch = {
      engine: draft.engine,
      aiBaseUrl: draft.aiBaseUrl.trim(),
      model: draft.model.trim() || 'gpt-4o-mini',
      theme: draft.theme,
      language: draft.language,
      uiLanguage: draft.uiLanguage,
      readingFont: draft.readingFont,
      textScale: draft.textScale,
      spoilerShield: draft.spoilerShield,
      storyDetail: draft.storyDetail,
      mapLayout: draft.mapLayout,
      autoTranslate: draft.autoTranslate,
      sources: draft.sources
    }
    if (keyInput.trim()) patch.apiKey = keyInput.trim()
    else if (removeKey) patch.apiKey = ''
    const saved = await window.storyteller.saveSettings(patch)
    setSaving(false)
    onSaved(saved)
  }

  const willHaveAi = Boolean(keyInput.trim() || (settings.hasApiKey && !removeKey) || draft.aiBaseUrl.trim())

  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal settings" role="dialog" aria-modal="true" aria-labelledby="settings-title" ref={dialog}>
        <header className="modal__head">
          <h2 id="settings-title">{t('settings.title')}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}>
            <Icon name="close" />
          </button>
        </header>

        <div className="settings__body">
          <nav className="settings__nav" role="tablist" aria-orientation="vertical">
            {SECTIONS.map((s) => (
              <button key={s.id} role="tab" aria-selected={section === s.id} className={section === s.id ? 'is-on' : ''} onClick={() => setSection(s.id)}>
                <Icon name={s.icon} size={16} />
                {t(`settings.nav.${s.id}`)}
              </button>
            ))}
          </nav>

          <div className="settings__content" role="tabpanel">
            {section === 'appearance' && (
              <>
                <section className="set-section">
                  <h3>{t('settings.theme')}</h3>
                  <div className="theme-grid">
                    {[{ id: SYSTEM_THEME, name: t('settings.theme.system'), vars: null as null | Record<string, string> }, ...themes].map((th) => (
                      <button key={th.id} className={`theme-chip ${draft.theme === th.id ? 'is-selected' : ''}`} onClick={() => set('theme', th.id)} aria-pressed={draft.theme === th.id}>
                        <span className="theme-chip__swatches">
                          {th.vars ? (
                            <>
                              <i style={{ background: th.vars['--bg'] }} />
                              <i style={{ background: th.vars['--accent'] }} />
                              <i style={{ background: th.vars['--text'] }} />
                            </>
                          ) : (
                            <>
                              <i style={{ background: '#FBF7FF' }} />
                              <i style={{ background: '#211E2B' }} />
                              <i style={{ background: '#B9A3EC' }} />
                            </>
                          )}
                        </span>
                        <span className="theme-chip__name">{th.name}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="set-section set-grid">
                  <label className="field">
                    <span className="field__label">{t('settings.uiLanguage')}</span>
                    <select className="input" value={draft.uiLanguage} onChange={(e) => set('uiLanguage', e.target.value as UiLanguage)}>
                      {UI_LANGUAGES.map((l) => (
                        <option key={l} value={l} lang={UI_LANGUAGE_TAGS[l]}>
                          {UI_LANGUAGE_NAMES[l]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field__label">{t('settings.readingFont')}</span>
                    <select className="input" value={draft.readingFont} onChange={(e) => set('readingFont', e.target.value as PublicSettings['readingFont'])}>
                      <option value="sans">{t('settings.font.sans')}</option>
                      <option value="serif">{t('settings.font.serif')}</option>
                    </select>
                  </label>
                  <label className="field field--wide">
                    <span className="field__label">{t('settings.mapLayout')}</span>
                    <select className="input" value={draft.mapLayout} onChange={(e) => set('mapLayout', e.target.value as MapLayout)}>
                      <option value="vertical">{t('settings.mapLayout.vertical')}</option>
                      <option value="compact">{t('settings.mapLayout.compact')}</option>
                    </select>
                  </label>
                  <label className="field field--wide">
                    <span className="field__label">
                      {t('settings.textSize')} <span className="num muted">{Math.round(draft.textScale * 100)}%</span>
                    </span>
                    <input type="range" min={0.85} max={1.4} step={0.05} value={draft.textScale} onChange={(e) => set('textScale', Number(e.target.value))} />
                  </label>
                </section>

                <section className="set-section">
                  <label className="switch-row">
                    <span>
                      <span className="switch-row__label">{t('settings.spoiler')}</span>
                      <span className="switch-row__desc">{t('settings.spoilerDesc')}</span>
                    </span>
                    <input type="checkbox" className="switch" checked={draft.spoilerShield} onChange={(e) => set('spoilerShield', e.target.checked)} />
                  </label>
                </section>
              </>
            )}

            {section === 'engine' && (
              <>
                <section className="set-section">
                  <h3>{t('engine.label')}</h3>
                  <div className="engine-cards" role="radiogroup" aria-label={t('engine.label')}>
                    {(['sources', 'hybrid', 'ai'] as Engine[]).map((e) => {
                      const locked = e !== 'sources' && !willHaveAi
                      return (
                        <button
                          key={e}
                          role="radio"
                          aria-checked={draft.engine === e}
                          className={`engine-card ${draft.engine === e ? 'is-on' : ''}`}
                          onClick={() => (locked ? setSection('ai') : set('engine', e))}
                        >
                          <Icon name={ENGINE_ICON[e]} size={20} />
                          <span className="engine-card__name">{t(`engine.${e}`)}</span>
                          <span className="engine-card__desc">{t(`engine.${e}.desc`)}</span>
                          {locked && <span className="chip chip--warn">{t('engine.setup')}</span>}
                        </button>
                      )
                    })}
                  </div>
                </section>

                <section className="set-section">
                  <label className="field">
                    <span className="field__label">{t('settings.storyLanguage')}</span>
                    <select className="input" value={draft.language} onChange={(e) => set('language', e.target.value)}>
                      {STORY_LANGS.map((l) => (
                        <option key={l} value={l}>
                          {l === 'auto' ? `${t('settings.lang.auto')} (${UI_LANGUAGE_NAMES[draft.uiLanguage]})` : l}
                        </option>
                      ))}
                    </select>
                    <span className="hint">{t('settings.storyLanguageDesc')}</span>
                  </label>
                  <label className="field">
                    <span className="field__label">{t('settings.storyDetail')}</span>
                    <select className="input" value={draft.storyDetail} onChange={(e) => set('storyDetail', e.target.value as PublicSettings['storyDetail'])}>
                      <option value="complete">{t('settings.detail.complete')}</option>
                      <option value="local">{t('settings.detail.local')}</option>
                    </select>
                    <span className="hint">{t('settings.storyDetailDesc')}</span>
                  </label>
                  <label className="switch-row">
                    <span>
                      <span className="switch-row__label">{t('settings.autoTranslate')}</span>
                      <span className="switch-row__desc">{t('settings.autoTranslateDesc')}</span>
                    </span>
                    <input type="checkbox" className="switch" checked={draft.autoTranslate} onChange={(e) => set('autoTranslate', e.target.checked)} />
                  </label>
                </section>

                <section className="set-section">
                  <h3>{t('settings.sources')}</h3>
                  <p className="hint">{t('settings.sourcesDesc')}</p>
                  {SOURCES.map((src) => (
                    <label key={src} className="switch-row">
                      <span>
                        <span className="switch-row__label">{t(`settings.src.${src}`)}</span>
                        <span className="switch-row__desc">{t(`settings.src.${src}.desc`)}</span>
                      </span>
                      <input
                        type="checkbox"
                        className="switch"
                        checked={draft.sources[src]}
                        onChange={(e) => set('sources', { ...draft.sources, [src]: e.target.checked })}
                      />
                    </label>
                  ))}
                </section>
              </>
            )}

            {section === 'ai' && (
              <section className="set-section">
                <label className="field">
                  <span className="field__label">{t('settings.ai.key')}</span>
                  <input
                    type="password"
                    className="input"
                    placeholder="sk-…"
                    autoComplete="off"
                    value={keyInput}
                    onChange={(e) => {
                      setKeyInput(e.target.value)
                      setRemoveKey(false)
                      setCheck({ state: 'idle' })
                    }}
                  />
                  {settings.hasApiKey && !keyInput && (
                    <span className="hint">
                      {removeKey ? t('settings.ai.keyRemoved') : t('settings.ai.keySaved', { hint: settings.apiKeyHint })}{' '}
                      {!removeKey && (
                        <button className="link link--danger" onClick={() => setRemoveKey(true)}>
                          {t('settings.ai.keyRemove')}
                        </button>
                      )}
                    </span>
                  )}
                </label>

                <label className="field">
                  <span className="field__label">{t('settings.ai.baseUrl')}</span>
                  <input
                    className="input"
                    placeholder="https://api.openai.com/v1"
                    value={draft.aiBaseUrl}
                    onChange={(e) => {
                      set('aiBaseUrl', e.target.value)
                      setCheck({ state: 'idle' })
                    }}
                  />
                  <span className="hint">{t('settings.ai.baseUrlHint')}</span>
                </label>

                <label className="field">
                  <span className="field__label">{t('settings.ai.model')}</span>
                  <div className="input-row">
                    <input className="input" list="model-list" value={draft.model} onChange={(e) => set('model', e.target.value)} />
                    <button className="btn" onClick={loadModels} disabled={loadingModels || !willHaveAi}>
                      {loadingModels ? <span className="spinner spinner--sm" aria-hidden="true" /> : <Icon name="refresh" size={16} />}
                      {t('settings.ai.loadModels')}
                    </button>
                  </div>
                  <datalist id="model-list">
                    {(models ?? ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1', 'o4-mini']).map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </label>

                <div className="ai-check">
                  <button className="btn" onClick={verify} disabled={check.state === 'busy' || !willHaveAi}>
                    {check.state === 'busy' ? <span className="spinner spinner--sm" aria-hidden="true" /> : <Icon name="check" size={16} />}
                    {t('settings.ai.verify')}
                  </button>
                  {check.state === 'ok' && <span className="hint hint--ok">{t('settings.ai.ok')}</span>}
                  {check.state === 'bad' && <span className="hint hint--bad">{t('settings.ai.bad', { msg: check.msg ?? '' })}</span>}
                </div>
                <p className="hint">{caps.platform === 'desktop' ? t('settings.ai.privacy') : t('settings.ai.privacyDevice')}</p>
              </section>
            )}

            {section === 'data' && (
              <>
                <section className="set-section">
                  <div className="data-row">
                    <span>
                      <span className="switch-row__label">{t('settings.data.cache')}</span>
                      <span className="switch-row__desc">{t('settings.data.cacheDesc')}</span>
                    </span>
                    <span className="num muted">{info ? formatBytes(info.cacheBytes) : '…'}</span>
                    <button
                      className="btn"
                      onClick={async () => {
                        const freed = await window.storyteller.clearCache()
                        setCleared(t('settings.data.cleared', { size: formatBytes(freed) }))
                        setInfo(await window.storyteller.dataInfo())
                      }}
                    >
                      <Icon name="trash" size={16} />
                      {t('settings.data.clear')}
                    </button>
                  </div>
                  {cleared && <p className="hint hint--ok">{cleared}</p>}
                  <div className="data-row">
                    <span className="switch-row__label">{t('settings.data.library')}</span>
                    <span className="num muted">{info?.libraryCount ?? '…'}</span>
                    {caps.dataFolder && (
                      <button className="btn" onClick={() => window.storyteller.openDataFolder()}>
                        <Icon name="folder" size={16} />
                        {t('settings.data.open')}
                      </button>
                    )}
                  </div>
                </section>
                {caps.platform === 'desktop' && (
                <section className="set-section">
                  <h3>{t('settings.shortcuts')}</h3>
                  <dl className="shortcuts">
                    <div>
                      <dt>
                        <kbd>Ctrl</kbd> <kbd>K</kbd> · <kbd>/</kbd>
                      </dt>
                      <dd>{t('settings.sc.search')}</dd>
                    </div>
                    <div>
                      <dt>
                        <kbd>←</kbd> <kbd>→</kbd> · <kbd>J</kbd> <kbd>K</kbd>
                      </dt>
                      <dd>{t('settings.sc.nav')}</dd>
                    </div>
                    <div>
                      <dt>
                        <kbd>Esc</kbd>
                      </dt>
                      <dd>{t('settings.sc.close')}</dd>
                    </div>
                  </dl>
                </section>
                )}
              </>
            )}
          </div>
        </div>

        <footer className="modal__foot">
          <button className="btn" onClick={onClose}>
            {t('settings.cancel')}
          </button>
          <button className="btn btn--primary" disabled={saving} onClick={save}>
            {t('settings.save')}
          </button>
        </footer>
      </div>
    </div>
  )
}
