import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react'
import Icon from './Icon'
import { useI18n } from '../i18n'
import type { SearchSuggestion, StoryQuery } from '../../../shared/types'

export interface SearchBarHandle {
  focus: () => void
  setText: (text: string) => void
}

interface Props {
  busy: boolean
  onSearch: (q: StoryQuery) => void
}

/** Search-as-you-type over Wikipedia titles, with covers and descriptions to disambiguate. */
const SearchBar = forwardRef<SearchBarHandle, Props>(function SearchBar({ busy, onSearch }, ref) {
  const { t } = useI18n()
  const listId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [items, setItems] = useState<SearchSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(-1)
  const [loading, setLoading] = useState(false)
  const seq = useRef(0)
  const blurTimer = useRef<number>()

  useImperativeHandle(ref, () => ({
    focus: () => {
      input.current?.focus()
      input.current?.select()
    },
    setText
  }))

  useEffect(() => {
    const q = text.trim()
    const my = ++seq.current
    if (q.length < 2) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    const timer = window.setTimeout(async () => {
      const res = await window.storyteller.suggest(q)
      if (my !== seq.current) return
      setLoading(false)
      setItems(res.ok ? (res.data ?? []) : [])
      setHi(-1)
    }, 260)
    return () => window.clearTimeout(timer)
  }, [text])

  function pick(s: SearchSuggestion): void {
    setText(s.title)
    setOpen(false)
    seq.current++ // drop any in-flight suggestion request
    onSearch({ text: s.title, wikiTitle: s.title, lang: s.lang, qid: s.qid })
  }

  function submit(): void {
    if (busy) return
    if (open && hi >= 0 && items[hi]) return pick(items[hi])
    const q = text.trim()
    if (!q) return input.current?.focus()
    setOpen(false)
    onSearch({ text: q })
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!items.length) return
      e.preventDefault()
      setOpen(true)
      setHi((h) => {
        const n = items.length
        return e.key === 'ArrowDown' ? (h + 1) % n : (h - 1 + n) % n
      })
    } else if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation()
      setOpen(false)
    }
  }

  const showList = open && text.trim().length >= 2
  const mainLang = items[0]?.lang

  return (
    <div className="searchbar">
      <div className={`searchbar__field ${showList ? 'is-open' : ''}`}>
        <Icon name="search" className="searchbar__icon" />
        <input
          ref={input}
          className="searchbar__input"
          placeholder={t('search.placeholder')}
          aria-label={t('search.label')}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={hi >= 0 ? `${listId}-${hi}` : undefined}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setOpen(true)
          }}
          onFocus={() => {
            // a blur-close still pending from a quick focus-out/in must not shut the list
            window.clearTimeout(blurTimer.current)
            setOpen(true)
          }}
          onBlur={() => {
            blurTimer.current = window.setTimeout(() => setOpen(false), 120)
          }}
          onKeyDown={onKeyDown}
          spellCheck={false}
        />
        <kbd className="searchbar__kbd" aria-hidden="true">
          Ctrl K
        </kbd>
        {showList && (
          <div className="suggest" id={listId} role="listbox">
            {loading && !items.length && <div className="suggest__status">{t('search.searching')}</div>}
            {!loading && !items.length && <div className="suggest__status">{t('search.none')}</div>}
            {items.map((s, i) => (
              <div
                key={`${s.lang}:${s.title}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === hi}
                className={`suggest__item ${i === hi ? 'is-hi' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHi(i)}
                onClick={() => pick(s)}
              >
                <span className="suggest__thumb">
                  {s.thumbnail ? <img src={s.thumbnail} alt="" loading="lazy" /> : <Icon name="book" size={16} />}
                </span>
                <span className="suggest__text">
                  <span className="suggest__title">{s.title}</span>
                  {s.description && <span className="suggest__desc">{s.description}</span>}
                </span>
                {s.lang !== mainLang && <span className="suggest__lang">{s.lang.toUpperCase()}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
      <button className="btn btn--primary searchbar__go" onClick={submit} disabled={busy}>
        {busy ? <span className="spinner spinner--sm" aria-hidden="true" /> : <Icon name="arrowRight" size={16} />}
        <span>{t('search.submit')}</span>
      </button>
    </div>
  )
})

export default SearchBar
