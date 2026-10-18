import { getJson, qs } from '../http'
import { htmlToBlocks } from './html'
import { plotScore, SKIP_PART, cleanPlotText } from './plot'
import { wordCount } from '../../shared/text'
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

/** Fetch the plot section of a Fandom article, split by its sub-headings, with its screenshots. */
export async function getFandomPlot(ref: FandomRef): Promise<FandomPlot | null> {
  const api = `${ref.base}/api.php`
  const secs = await getJson<RawSections>(
    `${api}?${qs({ action: 'parse', format: 'json', page: ref.page, prop: 'sections', redirects: 1 })}`,
    { allow404: true, timeout: 10000 }
  )
  const sections = secs?.parse?.sections ?? []
  let best: (typeof sections)[number] | null = null
  let bestScore = 0
  for (const s of sections) {
    const score = plotScore(s.line.replace(/<[^>]+>/g, '')) - (Number(s.level) - 2) * 0.5
    if (score > bestScore) {
      bestScore = score
      best = s
    }
  }
  if (!best) return null

  const html = await getJson<{ parse?: { text?: { '*': string } } }>(
    `${api}?${qs({
      action: 'parse',
      format: 'json',
      page: ref.page,
      section: best.index,
      prop: 'text',
      disableeditsection: 1,
      disablelimitreport: 1,
      redirects: 1
    })}`,
    { timeout: 12000 }
  )
  const raw = html?.parse?.text?.['*']
  if (!raw) return null

  const blocks = htmlToBlocks(raw)
  const headLevel = Number(best.level)
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

/**
 * No Fandom id on Wikidata? Try the obvious wiki ("Hollow Knight" →
 * hollowknight.fandom.com) and only accept it if the article has a plot.
 */
export async function guessFandom(title: string): Promise<FandomPlot | null> {
  const clean = title.replace(/\s*\(.*?\)\s*/g, ' ').trim()
  const slug = clean
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]/g, '')
  if (slug.length < 3) return null
  for (const sub of [slug, `the${slug}`]) {
    try {
      const plot = await getFandomPlot({ base: `https://${sub}.fandom.com`, page: clean.replace(/ /g, '_'), lang: 'en' })
      if (plot) return plot
    } catch {
      /* wiki doesn't exist */
    }
  }
  return null
}
