import { getJson, qs } from '../http'
import { htmlToBlocks } from './html'
import { plotScore, SKIP_PART, cleanPlotText } from './plot'
import { tokenize, wordCount } from '../../shared/text'
import type { StoryImage } from '../../shared/types'

export interface FandomRef {
  base: string
  page: string
  lang: string
}

export interface FandomPart {
  title: string
  text: string
  images: StoryImage[]
}

export interface FandomPlot {
  url: string
  lang: string
  intro: string
  introImages: StoryImage[]
  parts: FandomPart[]
  words: number
}

/** Wikidata P6262 values look like "thelastofus:The_Last_of_Us" or "pt-br.thelastofus:…". */
export function parseFandomRef(value: string): FandomRef | null {
  const m = /^(?:([a-z]{2,3}(?:-[a-z]{2,4})?)\.)?([a-z0-9-]+):(.+)$/i.exec(value)
  if (!m) return null
  return {
    base: `https://${m[2]}.fandom.com${m[1] ? `/${m[1]}` : ''}`,
    page: m[3],
    lang: (m[1] ?? 'en').slice(0, 2)
  }
}

/** Wikis that are about the production, not the story (dubbing casts, lyrics…). */
const NOT_STORY = /^(doblaje|dubbing|dublagem|voiceacting|lyrics|lyricwiki|tvtropes|logos|closinglogos|soundeffects)$/i

export function pickFandom(values: string[], lang: string): FandomRef | null {
  const refs = values
    .map((v) => ({ v, ref: parseFandomRef(v) }))
    .filter((x): x is { v: string; ref: FandomRef } => !!x.ref && !NOT_STORY.test(x.v.split(':')[0].split('.').pop() ?? ''))
    .map((x) => x.ref)
  return refs.find((r) => r.lang === lang) ?? refs.find((r) => r.lang === 'en') ?? null
}

interface RawSections {
  parse?: { title: string; sections: { level: string; line: string; index: string }[] }
  error?: unknown
}

type Section = NonNullable<RawSections['parse']>['sections'][number]

/**
 * Fetch the plot of a Fandom article, split by its sub-headings, with its
 * screenshots. Wikis often have both a short "Synopsis" and a long "Plot":
 * the two best candidates are read and the longer one wins.
 */
export async function getFandomPlot(ref: FandomRef): Promise<FandomPlot | null> {
  const secs = await getJson<RawSections>(
    `${ref.base}/api.php?${qs({ action: 'parse', format: 'json', page: ref.page, prop: 'sections', redirects: 1 })}`,
    { allow404: true, timeout: 10000 }
  )
  const sections = secs?.parse?.sections ?? []
  const scored = sections
    .map((s, i) => ({ s, i, score: plotScore(s.line.replace(/<[^>]+>/g, '')) - (Number(s.level) - 2) * 0.5 }))
    .filter((x) => x.score >= 5)
    .sort((a, b) => b.score - a.score || a.i - b.i)
  if (!scored.length) return null

  // A second candidate only if it isn't nested inside the first (that text is already included).
  const first = scored[0]
  const end = sections.findIndex((s, i) => i > first.i && Number(s.level) <= Number(first.s.level))
  const second = scored.slice(1).find((x) => x.i < first.i || (end !== -1 && x.i >= end))

  const plots = await Promise.all([first, second].filter(Boolean).map((x) => readSection(ref, x!.s)))
  return plots.filter((p): p is FandomPlot => !!p).sort((a, b) => b.words - a.words)[0] ?? null
}

async function readSection(ref: FandomRef, section: Section): Promise<FandomPlot | null> {
  const html = await getJson<{ parse?: { text?: { '*': string } } }>(
    `${ref.base}/api.php?${qs({
      action: 'parse',
      format: 'json',
      page: ref.page,
      section: section.index,
      prop: 'text',
      disableeditsection: 1,
      disablelimitreport: 1,
      redirects: 1
    })}`,
    { timeout: 15000 }
  )
  const raw = html?.parse?.text?.['*']
  if (!raw) return null

  const blocks = htmlToBlocks(raw)
  const headLevel = Number(section.level)
  let intro = ''
  const introImages: StoryImage[] = []
  const parts: FandomPart[] = []
  let cur: FandomPart | null = null
  let skipping = false
  for (const b of blocks) {
    if (b.type === 'h') {
      if (b.level <= headLevel) continue // the plot heading itself
      skipping = SKIP_PART.test(b.text)
      cur = skipping ? null : { title: b.text, text: '', images: [] }
      if (cur) parts.push(cur)
    } else if (b.type === 'p') {
      if (skipping) continue
      const text = cleanPlotText(b.text)
      if (cur) cur.text += `${text}\n`
      else intro += `${text}\n`
    } else if (!skipping) {
      ;(cur ? cur.images : introImages).push(b.image)
    }
  }
  const kept = parts.filter((p) => wordCount(p.text) >= 15).map((p) => ({ ...p, text: p.text.trim() }))
  const words = wordCount(intro) + kept.reduce((n, p) => n + wordCount(p.text), 0)
  if (words < 40) return null
  return {
    url: `${ref.base}/wiki/${encodeURIComponent(ref.page.replace(/ /g, '_'))}`,
    lang: ref.lang,
    intro: intro.trim(),
    introImages,
    parts: kept,
    words
  }
}

const stripParens = (s: string): string => s.replace(/\s*\(.*?\)\s*/g, ' ').trim()

function slugOf(name: string): string {
  return stripParens(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]/g, '')
}

/** The wiki's own search, for when the article isn't named exactly like the work. */
async function searchWiki(base: string, title: string): Promise<string[]> {
  const d = await getJson<{ query?: { search?: { title: string }[] } }>(
    `${base}/api.php?${qs({ action: 'query', format: 'json', list: 'search', srsearch: title, srlimit: 3, srnamespace: 0 })}`,
    { allow404: true, timeout: 8000 }
  )
  const want = tokenize(title)
  return (d?.query?.search ?? [])
    .map((r) => r.title)
    .filter((t) => {
      const have = new Set(tokenize(t))
      return want.filter((w) => have.has(w)).length >= Math.ceil(want.length * 0.7)
    })
}

/**
 * No Fandom id on Wikidata? Try the wikis it would plausibly live on — the
 * work's own ("Hollow Knight" → hollowknight.fandom.com) and its franchise's
 * ("Harry Potter and the Deathly Hallows" → harrypotter.fandom.com) — and
 * accept one only if it has a plot for this work.
 */
export async function guessFandom(title: string, franchises: string[] = []): Promise<FandomPlot | null> {
  const page = stripParens(title)
  const subs = [...new Set([title, ...franchises].map(slugOf).filter((s) => s.length >= 3).flatMap((s) => [s, `the${s}`]))].slice(0, 6)
  for (const sub of subs) {
    const base = `https://${sub}.fandom.com`
    try {
      const direct = await getFandomPlot({ base, page: page.replace(/ /g, '_'), lang: 'en' })
      if (direct) return direct
      for (const found of await searchWiki(base, page)) {
        const plot = await getFandomPlot({ base, page: found.replace(/ /g, '_'), lang: 'en' })
        if (plot) return plot
      }
    } catch {
      /* no such wiki */
    }
  }
  return null
}
