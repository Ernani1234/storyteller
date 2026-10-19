import { keySentences } from '../../../shared/text'
import type { NodeDetail, StoryOutline } from '../../../shared/types'

/**
 * "Show original" for machine-translated stories: the outline and chapter
 * details as the source wrote them. Display only; library, search, questions
 * and export keep working on the translated story.
 */

export function originalOutline(o: StoryOutline): StoryOutline {
  const t = o.translation
  if (!t) return o
  return {
    ...o,
    lang: t.from,
    logline: t.logline ?? o.logline,
    nodes: o.nodes.map((n) => {
      const orig = t.nodes[n.id]
      if (!orig) return n
      return {
        ...n,
        title: orig.title,
        summary: orig.summary,
        text: orig.text,
        episodes: n.episodes?.map((e, i) => ({ ...e, summary: orig.episodes?.[i] ?? e.summary }))
      }
    })
  }
}

export function originalDetail(d: NodeDetail, o: StoryOutline): NodeDetail {
  const orig = o.translation?.nodes[d.id]
  // AI retellings are written in the reader's language: nothing to switch back to.
  if (!orig || d.engine === 'ai') return d
  const body = orig.text?.trim() || orig.summary
  return {
    ...d,
    title: orig.title,
    body,
    beats: d.beats.length ? keySentences(body, d.beats.length) : [],
    episodes: d.episodes?.map((e, i) => ({ ...e, summary: orig.episodes?.[i] ?? e.summary }))
  }
}
