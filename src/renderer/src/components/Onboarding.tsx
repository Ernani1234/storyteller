import { useState } from 'react'
import Icon from './Icon'
import { useI18n } from '../i18n'
import type { PublicSettings } from '../../../shared/types'

interface Props {
  onDone: (s: PublicSettings) => void
}

/** First run: pick no-AI (default) or connect an AI provider. Never blocks the app. */
export default function Onboarding({ onDone }: Props): JSX.Element {
  const { t } = useI18n()
  const [step, setStep] = useState<'choose' | 'ai'>('choose')
  const [key, setKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function startWithoutAi(): Promise<void> {
    onDone(await window.storyteller.saveSettings({ engine: 'sources', onboarded: true }))
  }

  async function connect(): Promise<void> {
    if (!key.trim() && !baseUrl.trim()) {
      setError(t('onboard.needKey'))
      return
    }
    setBusy(true)
    setError('')
    const res = await window.storyteller.verifyAi(key.trim(), baseUrl.trim())
    if (!res.ok) {
      setBusy(false)
      setError(res.code ? t(`err.${res.code}`, { msg: res.error ?? '', q: '' }) : (res.error ?? ''))
      return
    }
    const saved = await window.storyteller.saveSettings({
      apiKey: key.trim(),
      aiBaseUrl: baseUrl.trim(),
      engine: 'hybrid',
      onboarded: true
    })
    setBusy(false)
    onDone(saved)
  }

  return (
    <div className="onboard">
      <div className="onboard__card">
        <div className="brand brand--lg">
          <span className="brand__mark">✦</span>
          <span className="brand__name">Storyteller</span>
        </div>
        <p className="onboard__lede">{t('onboard.lede')}</p>

        {step === 'choose' ? (
          <>
            <h2 className="onboard__q">{t('onboard.choose')}</h2>
            <div className="onboard__choices">
              <button className="choice choice--primary" onClick={startWithoutAi}>
                <Icon name="book" size={22} />
                <span className="choice__title">{t('onboard.sources.title')}</span>
                <span className="choice__desc">{t('onboard.sources.desc')}</span>
              </button>
              <button className="choice" onClick={() => setStep('ai')}>
                <Icon name="sparkles" size={22} />
                <span className="choice__title">{t('onboard.ai.title')}</span>
                <span className="choice__desc">{t('onboard.ai.desc')}</span>
              </button>
            </div>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              connect()
            }}
          >
            <label className="field">
              <span className="field__label">{t('settings.ai.key')}</span>
              <input type="password" className="input" placeholder="sk-…" value={key} onChange={(e) => setKey(e.target.value)} autoFocus autoComplete="off" />
            </label>
            <label className="field">
              <span className="field__label">{t('settings.ai.baseUrl')}</span>
              <input className="input" placeholder="https://api.openai.com/v1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
              <span className="hint">{t('settings.ai.baseUrlHint')}</span>
            </label>
            {error && <p className="form-error">{error}</p>}
            <div className="onboard__actions">
              <button type="button" className="btn" onClick={() => setStep('choose')}>
                <Icon name="chevronLeft" size={16} />
                {t('onboard.back')}
              </button>
              <button type="submit" className="btn btn--primary" disabled={busy}>
                {busy ? <span className="spinner spinner--sm" aria-hidden="true" /> : <Icon name="sparkles" size={16} />}
                {t('onboard.connect')}
              </button>
            </div>
          </form>
        )}
        <p className="onboard__note">{t('onboard.note')}</p>
      </div>
    </div>
  )
}
