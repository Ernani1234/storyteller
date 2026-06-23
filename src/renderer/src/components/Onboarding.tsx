import { useState } from 'react'

interface Props {
  onSaved: (key: string) => void
}

export default function Onboarding({ onSaved }: Props): JSX.Element {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(): Promise<void> {
    const trimmed = key.trim()
    if (!trimmed) {
      setError('Paste your OpenAI API key to continue.')
      return
    }
    setBusy(true)
    setError('')
    const res = await window.storyteller.verifyKey(trimmed)
    if (!res.ok) {
      setBusy(false)
      setError(res.error ?? 'Could not verify the key.')
      return
    }
    await window.storyteller.saveSettings({ apiKey: trimmed })
    setBusy(false)
    onSaved(trimmed)
  }

  return (
    <div className="onboard">
      <div className="onboard__card">
        <div className="brand brand--lg">
          <span className="brand__mark">✦</span>
          <span className="brand__name">Storyteller</span>
        </div>
        <p className="onboard__lede">
          Type any work — a game, film, anime, book — and watch its whole story
          unfold as a tree of chapters you can explore.
        </p>

        <label className="field">
          <span className="field__label">OpenAI API key</span>
          <input
            type="password"
            className="input"
            placeholder="sk-…"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            autoFocus
          />
        </label>

        {error && <p className="form-error">{error}</p>}

        <button className="btn btn--primary btn--full" disabled={busy} onClick={submit}>
          {busy ? 'Verifying…' : 'Start storytelling'}
        </button>

        <p className="onboard__note">
          Your key is stored only on this device and used to talk to OpenAI
          directly. You can change it anytime in Settings.
        </p>
      </div>
    </div>
  )
}
