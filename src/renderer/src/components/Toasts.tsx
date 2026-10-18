import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import Icon from './Icon'
import { useI18n } from '../i18n'

export interface ToastInput {
  message: string
  tone?: 'info' | 'success' | 'error'
  action?: { label: string; run: () => void }
}

interface Toast extends ToastInput {
  id: number
}

const Ctx = createContext<(t: ToastInput) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const { t } = useI18n()
  const [toasts, setToasts] = useState<Toast[]>([])
  const next = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((x) => x.id !== id)), [])

  const push = useCallback(
    (input: ToastInput) => {
      const id = next.current++
      setToasts((all) => [...all.slice(-2), { ...input, id }])
      window.setTimeout(() => dismiss(id), input.action ? 7000 : 4500)
    },
    [dismiss]
  )

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.tone ?? 'info'}`}>
            <Icon name={toast.tone === 'error' ? 'alert' : toast.tone === 'success' ? 'check' : 'info'} size={16} />
            <span className="toast__msg">{toast.message}</span>
            {toast.action && (
              <button
                className="toast__action"
                onClick={() => {
                  toast.action!.run()
                  dismiss(toast.id)
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button className="toast__close" onClick={() => dismiss(toast.id)} aria-label={t('common.close')}>
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast(): (t: ToastInput) => void {
  return useContext(Ctx)
}
