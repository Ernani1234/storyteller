import { useState } from 'react'
import { themes, applyTheme } from '../themes'
import type { Settings } from '../../../shared/types'

interface Props {
  settings: Settings
  onClose: () => void
  onSave: (s: Settings) => void
}

const MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o4-mini']
const LANGS = [
  { id: 'auto', label: 'Match my input' },
  { id: 'English', label: 'English' },
  { id: 'Português', label: 'Português' },
  { id: 'Español', label: 'Español' },
  { id: 'Français', label: 'Français' },
  { id: '日本語', label: '日本語' }
]

export default function SettingsModal({
  settings,
  onClose,
  onSave
}: Props): JSX.Element {
  const [draft, setDraft] = useState<Settings>(settings)
  const [busy, setBusy] = useState(false)
  const [keyState, setKeyState] = useState<'idle' | 'ok' | 'bad'>('idle')

  function set<K extends keyof Settings>(k: K, v: Settings[K]): void {
    setDraft((d) => ({ ...d, [k]: v }))
  }

  function pickTheme(id: string): void {
    set('theme', id)
    applyTheme(id) // live preview
  }

  async function verify(): Promise<void> {
    setBusy(true)
    const res = await window.storyteller.verifyKey(draft.apiKey.trim())
    setKeyState(res.ok ? 'ok' : 'bad')
    setBusy(false)
  }

  async function save(): Promise<void> {
    setBusy(true)
    const saved = await window.storyteller.saveSettings({
      ...draft,
      apiKey: draft.apiKey.trim()
    })
    setBusy(false)
    onSave(saved)
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal__head">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="modal__body">
          <section className="set-section">
            <h3>Appearance</h3>
            <div className="theme-grid">
              {themes.map((t) => (
                <button
                  key={t.id}
                  className={`theme-chip ${draft.theme === t.id ? 'is-selected' : ''}`}
                  onClick={() => pickTheme(t.id)}
                  title={t.name}
                >
                  <span className="theme-chip__swatches">
                    <i style={{ background: t.vars['--bg'] }} />
                    <i style={{ background: t.vars['--accent'] }} />
                    <i style={{ background: t.vars['--edge'] }} />
                  </span>
                  <span className="theme-chip__name">{t.name}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="set-section">
            <h3>OpenAI</h3>
            <label className="field">
              <span className="field__label">API key</span>
              <div className="input-row">
                <input
                  type="password"
                  className="input"
                  placeholder="sk-…"
                  value={draft.apiKey}
                  onChange={(e) => {
                    set('apiKey', e.target.value)
                    setKeyState('idle')
                  }}
                />
                <button className="btn" disabled={busy} onClick={verify}>
                  {busy ? '…' : 'Verify'}
                </button>
              </div>
              {keyState === 'ok' && <span className="hint hint--ok">Key works ✓</span>}
              {keyState === 'bad' && (
                <span className="hint hint--bad">Key rejected ✕</span>
              )}
            </label>

            <label className="field">
              <span className="field__label">Model</span>
              <select
                className="input"
                value={draft.model}
                onChange={(e) => set('model', e.target.value)}
              >
                {MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field__label">Story language</span>
              <select
                className="input"
                value={draft.language}
                onChange={(e) => set('language', e.target.value)}
              >
                {LANGS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
          </section>
        </div>

        <footer className="modal__foot">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" disabled={busy} onClick={save}>
            Save
          </button>
        </footer>
      </div>
    </div>
  )
}
