import { getJson, qs } from '../http'
import { fold, wordCount } from '../../shared/text'
import { plotScore, SKIP_PART, cleanPlotText } from './plot'
import type { SearchSuggestion } from '../../shared/types'

const DAY = 24 * 60 * 60 * 1000

export interface WikiSection {
  level: number
  title: string
  text: string
}

export interface WikiPage {
  lang: string
  title: string
  url: string
  qid?: string
  thumbnail?: string
  description?: string
  lead: string
  sections: WikiSection[]
}

export interface PlotPart {
  title: string
  text: string
}

export interface WikiPlot {
  heading: string
  intro: string
  parts: PlotPart[]
  words: number
}

interface RawPage {
  title: string
  index?: number
  missing?: boolean
  description?: string
  thumbnail?: { source: string }
  pageprops?: { wikibase_item?: string; disambiguation?: string }
}

const api = (lang: string): string => `https://${lang}.wikipedia.org/w/api.php`

export function pageUrl(lang: string, title: string): string {
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
}

const NOT_A_WORK =
  /(disambiguation|desambigua|homonymie|begriffskl|wikimedia list|list article|artigo de lista|lista de|list of|liste d)/i
const WORKISH =
  /(film|filme|película|série|series|serie|seriado|telessérie|game|jogo|videojuego|jeu|novel|romance|novela|roman|livro|book|libro|livre|anime|mang|comic|quadrinhos|cómic|bande dessinée|manhwa|webtoon|telenovela|television|televisão|televisión|télévis|sitcom|miniseries|minissérie|musical|play|peça|saga|franchise|franquia)/i

const PERSONISH =
  /(personagem|character|demogr|\bator\b|actor|actress|atriz|dublador|voice|singer|cantor|escritor|writer|diretor|director|mangaká|mangaka|empresa|company)/i

export function isWorkish(description?: string): boolean {
  return WORKISH.test(description ?? '') && !PERSONISH.test(description ?? '')
}

/** 2 = same title, 1 = title contains every query word, 0 = loose match. */
function exactness(title: string, query: string): number {
  const t = fold(title.replace(/\s*\([^)]*\)\s*/g, ' ')).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  const q = fold(query).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  if (t === q) return 2
  return q.split(' ').every((w) => t.split(' ').includes(w)) ? 1 : 0
}

function usable(p: RawPage): boolean {
  if (p.pageprops && 'disambiguation' in p.pageprops) return false
  if (NOT_A_WORK.test(p.description ?? '')) return false
  return !/^(List of|Lista de|Liste)/i.test(p.title)
}

async function queryPages(lang: string, params: Record<string, string | number>): Promise<RawPage[]> {
  const d = await getJson<{ query?: { pages?: RawPage[] } }>(
    `${api(lang)}?${qs({
      action: 'query',
      format: 'json',
      formatversion: 2,
      prop: 'pageimages|description|pageprops',
      piprop: 'thumbnail',
      pithumbsize: 120,
      ppprop: 'wikibase_item|disambiguation',
      redirects: 1,
      ...params
    })}`,
    { ttl: DAY, timeout: 8000 }
  )
  const pages = d?.query?.pages ?? []
  return [...pages].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
}

async function didYouMean(lang: string, query: string): Promise<string | null> {
  const d = await getJson<{ query?: { searchinfo?: { suggestion?: string } } }>(
    `${api(lang)}?${qs({ action: 'query', format: 'json', list: 'search', srsearch: query, srinfo: 'suggestion', srlimit: 1 })}`,
    { ttl: DAY, timeout: 8000 }
  ).catch(() => null)
  return d?.query?.searchinfo?.suggestion ?? null
}

/**
 * Search-as-you-type: prefix + full-text matches, disambiguation pages and
 * lists removed, creative works ranked first, typo correction, and an English
 * top-up when the local wiki has little.
 */
export async function suggest(query: string, lang: string, limit = 7): Promise<SearchSuggestion[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const run = async (l: string, text: string): Promise<SearchSuggestion[]> => {
    const [prefix, full] = await Promise.all([
      queryPages(l, { generator: 'prefixsearch', gpssearch: text, gpslimit: limit }).catch(() => []),
      queryPages(l, { generator: 'search', gsrsearch: text, gsrlimit: limit, gsrnamespace: 0 }).catch(() => [])
    ])
    const seen = new Set<string>()
    const out: SearchSuggestion[] = []
    for (const p of [...prefix, ...full]) {
      if (p.missing || !usable(p) || seen.has(p.title)) continue
      seen.add(p.title)
      out.push({
        title: p.title,
        description: p.description,
        thumbnail: p.thumbnail?.source,
        lang: l,
        qid: p.pageprops?.wikibase_item
      })
    }
    // Stable sort: an exact title wins, then creative works beat pages that
    // merely contain the words ("Interestelar": the film over "Meio interestelar").
    const rank = (s: SearchSuggestion): number => {
      const e = exactness(s.title, text)
      return (e === 2 ? 4 : 0) + (isWorkish(s.description) ? 2 : 0) + (e === 1 ? 1 : 0)
    }
    return out
      .map((s, i) => ({ s, i, r: rank(s) }))
      .sort((a, b) => b.r - a.r || a.i - b.i)
      .map((x) => x.s)
  }

  let out = await run(lang, q)
  if (!out.some((s) => exactness(s.title, q) >= 1)) {
    // Likely a typo ("Hollow Knigt"): ask the wiki and put corrected hits first.
    const fixed = await didYouMean(lang, q)
    if (fixed && fixed.toLowerCase() !== q.toLowerCase()) {
      const corrected = await run(lang, fixed)
      const seen = new Set(corrected.map((s) => s.title))
      out = [...corrected, ...out.filter((s) => !seen.has(s.title))]
    }
  }
  // Top up from English when the local wiki is thin, or when it lacks the
  // exact title the user typed (e.g. pt redirects "…: Brotherhood" to the manga).
  const bestLocal = Math.max(0, ...out.map((s) => exactness(s.title, q)))
  if (lang !== 'en' && (out.length < 3 || bestLocal < 1)) {
    const known = new Set(out.map((s) => s.qid).filter(Boolean))
    const en = (await run('en', q).catch(() => [])).filter((s) => !s.qid || !known.has(s.qid))
    const bestEn = Math.max(0, ...en.map((s) => exactness(s.title, q)))
    out = bestEn > bestLocal ? [...en.filter((s) => exactness(s.title, q) === bestEn), ...out, ...en.filter((s) => exactness(s.title, q) !== bestEn)] : [...out, ...en]
  }
  return out.slice(0, limit)
}

export function parseSections(extract: string): { lead: string; sections: WikiSection[] } {
  const lead: string[] = []
  const sections: WikiSection[] = []
  let cur: WikiSection | null = null
  for (const line of extract.split('\n')) {
    const m = /^(={2,6})\s*(.+?)\s*\1\s*$/.exec(line)
    if (m) {
      cur = { level: m[1].length, title: m[2], text: '' }
      sections.push(cur)
    } else if (cur) {
      cur.text += `${line}\n`
    } else {
      lead.push(line)
    }
  }
  for (const s of sections) s.text = s.text.trim()
  return { lead: lead.join('\n').trim(), sections }
}

export async function getPage(lang: string, title: string): Promise<WikiPage | null> {
  const d = await getJson<{ query?: { pages?: (RawPage & { extract?: string; fullurl?: string })[] } }>(
    `${api(lang)}?${qs({
      action: 'query',
      format: 'json',
      formatversion: 2,
      prop: 'extracts|pageprops|pageimages|description|info',
      explaintext: 1,
      exsectionformat: 'wiki',
      titles: title,
      redirects: 1,
      ppprop: 'wikibase_item',
      piprop: 'thumbnail',
      pithumbsize: 600,
      inprop: 'url'
    })}`
  )
  const p = d?.query?.pages?.[0]
  if (!p || p.missing || !p.extract) return null
  const { lead, sections } = parseSections(p.extract)
  return {
    lang,
    title: p.title,
    url: p.fullurl ?? pageUrl(lang, p.title),
    qid: p.pageprops?.wikibase_item,
    thumbnail: p.thumbnail?.source,
    description: p.description,
    lead,
    sections
  }
}

/** Locate the plot section and its sub-sections (acts, parts, seasons…). */
export function findPlot(page: WikiPage): WikiPlot | null {
  let best = -1
  let bestScore = 0
  page.sections.forEach((s, i) => {
    const score = plotScore(s.title) - (s.level - 2) * 0.5
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  })
  if (best < 0) return null
  const head = page.sections[best]
  const parts: PlotPart[] = []
  for (let i = best + 1; i < page.sections.length && page.sections[i].level > head.level; i++) {
    const s = page.sections[i]
    if (!s.text || SKIP_PART.test(s.title)) continue
    parts.push({ title: s.title, text: cleanPlotText(s.text) })
  }
  const intro = cleanPlotText(head.text)
  const words = wordCount(intro) + parts.reduce((n, p) => n + wordCount(p.text), 0)
  if (words < 25) return null
  return { heading: head.title, intro, parts, words }
}
