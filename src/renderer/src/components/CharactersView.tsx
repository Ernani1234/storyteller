import { useMemo } from 'react'
import Icon from './Icon'
import { useI18n } from '../i18n'
import { fold } from '../../../shared/text'
import type { Character, NodeDetail, StoryOutline } from '../../../shared/types'

interface Props {
  outline: StoryOutline
  details: Record<string, NodeDetail>
  onFind: (name: string) => void
}

/** The most specific form of a name likely to appear in the text ("Walter White" → "Walter"). */
export function searchName(name: string): string {
  const clean = name.replace(/\s*\(.*?\)\s*/g, ' ').trim()
  const first = clean.split(/\s+/)[0]
  return first.length >= 3 ? first : clean
}

export default function CharactersView({ outline, details, onFind }: Props): JSX.Element {
  const { t, has } = useI18n()

  const texts = useMemo(
    () =>
      outline.nodes.map((n) =>
        fold([n.title, n.summary, details[n.id]?.body ?? n.text ?? '', ...(n.episodes ?? []).map((e) => e.summary)].join(' '))
      ),
    [outline, details]
  )

  const mentions = (c: Character): number => {
    const needle = fold(searchName(c.name))
    return texts.filter((tx) => tx.includes(needle)).length
  }
  // Whoever the story text talks about most comes first.
  const ranked = useMemo(
    () =>
      outline.characters
        .map((c, i) => ({ c, i, n: mentions(c) }))
        .sort((a, b) => b.n - a.n || a.i - b.i),
    [outline.characters, texts]
  )

  if (!outline.characters.length) {
    return (
      <div className="empty-view">
        <Icon name="users" size={28} />
        <p>{t('chars.empty')}</p>
      </div>
    )
  }

  return (
    <div className="cast">
      <ul className="cast__grid">
        {ranked.map(({ c, n }) => {
          const roleKey = `chars.role.${c.role}`
          return (
            <li key={`${c.name}-${c.actor ?? ''}`} className="person">
              <span className="person__avatar">
                {c.image ? <img src={c.image} alt="" loading="lazy" /> : <span aria-hidden="true">{c.name.slice(0, 1)}</span>}
              </span>
              <div className="person__text">
                <div className="person__name-row">
                  <h3 className="person__name">{c.name.replace(/\s*\(.*?\)\s*/g, ' ').trim()}</h3>
                  {c.role && has(roleKey) && <span className={`chip ${c.role === 'MAIN' ? 'chip--accent' : ''}`}>{t(roleKey)}</span>}
                </div>
                {c.actor && <p className="person__actor">{t('chars.performer', { actor: c.actor })}</p>}
                {c.description && <p className="person__desc">{c.description}</p>}
                <div className="person__foot">
                  <span className="person__count">
                    {n === 0 ? t('chars.mentionsNone') : n === 1 ? t('chars.mentionsOne') : t('chars.mentions', { n })}
                  </span>
                  {n > 0 && (
                    <button className="link" onClick={() => onFind(searchName(c.name))}>
                      {t('chars.find')}
                      <Icon name="arrowRight" size={13} />
                    </button>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
