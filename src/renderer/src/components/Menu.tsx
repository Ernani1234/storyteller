import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

export interface MenuItem {
  key: string
  label: ReactNode
  description?: ReactNode
  icon?: ReactNode
  selected?: boolean
  onSelect: () => void
}

interface Props {
  trigger: (props: { open: boolean; toggle: () => void; id: string }) => ReactNode
  items: MenuItem[]
  align?: 'left' | 'right'
  label: string
}

/** A small popover menu: click outside or Esc closes it, arrow keys move focus. */
export default function Menu({ trigger, items, align = 'right', label }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    list.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  const onListKey = (e: React.KeyboardEvent): void => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const els = [...(list.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])]
    const i = els.indexOf(document.activeElement as HTMLButtonElement)
    els[(i + (e.key === 'ArrowDown' ? 1 : els.length - 1)) % els.length]?.focus()
  }

  return (
    <div className="menu" ref={root}>
      {trigger({ open, toggle: () => setOpen((o) => !o), id })}
      {open && (
        <div
          ref={list}
          id={id}
          role="menu"
          aria-label={label}
          className={`menu__list menu__list--${align}`}
          onKeyDown={onListKey}
        >
          {items.map((item) => (
            <button
              key={item.key}
              role="menuitem"
              className={`menu__item ${item.selected ? 'is-selected' : ''}`}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
            >
              {item.icon && <span className="menu__icon">{item.icon}</span>}
              <span className="menu__text">
                <span className="menu__label">{item.label}</span>
                {item.description && <span className="menu__desc">{item.description}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
