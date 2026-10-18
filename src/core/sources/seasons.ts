import { getJson, qs } from '../http'
import { decodeEntities, stripTags } from './html'
import { wordCount } from '../../shared/text'

/**
 * Episode synopses from Wikipedia season articles ("Breaking Bad season 1",
 * "Game of Thrones (1.ª temporada)"). They run 100–200 words per episode,
 * against one or two sentences on TVMaze, and exist in many languages.
 * Season articles are found through Wikidata ("has part" on the series).
 */

export interface SeasonEpisode {
  title: string
  summary: string
}

export interface SeasonSynopses {
  number: number
  lang: string
  url: string
  episodes: SeasonEpisode[]
}

interface Entity {
  sitelinks?: Record<string, { title: string }>
}

/** "\"Winter Is Coming\"\"O Inverno Está Chegando\" (BR)" → the localized title. */
function episodeTitle(cellHtml: string): string {
  const text = stripTags(cellHtml).replace(/\[\d+\]/g, '')
  const quoted = [...text.matchAll(/["“]([^"”]+)["”]/g)].map((m) => m[1].trim())
  if (quoted.length >= 2) return quoted[1]
  return (quoted[0] ?? text).trim()
}

/**
 * Episode rows in document order: a title cell, then (usually) a description
 * row. Headings like "Season 2 (2009)" between tables set the season, which
 * is how "List of … episodes" pages are laid out.
 */
function parseEpisodeTables(html: string, defaultSeason = 1): Map<number, SeasonEpisode[]> {
  const out = new Map<number, SeasonEpisode[]>()
  let season = defaultSeason
  let last: SeasonEpisode | null = null
  const re = /<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>|<td class="summary"[^>]*>([\s\S]*?)<\/td>|<td class="description"[^>]*>([\s\S]*?)<\/td>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    if (m[1] !== undefined) {
      const n = seasonNumberFromTitle(stripTags(m[1]))
      if (n) season = n
    } else if (m[2] !== undefined) {
      last = { title: episodeTitle(m[2]), summary: '' }
      out.set(season, [...(out.get(season) ?? []), last])
    } else if (last) {
      last.summary = decodeEntities(stripTags(m[3].replace(/<sup[\s\S]*?<\/sup>/g, '').replace(/<style[\s\S]*?<\/style>/g, '')))
        .replace(/\s+/g, ' ')
        .trim()
    }
  }
  return out
}

async function seasonPage(lang: string, title: string): Promise<SeasonEpisode[]> {
  // A season article is one season, whatever its headings say.
  return [...(await episodePage(lang, title)).values()].flat()
}

async function episodePage(lang: string, title: string): Promise<Map<number, SeasonEpisode[]>> {
  const d = await getJson<{ parse?: { text?: string } }>(
    `https://${lang}.wikipedia.org/w/api.php?${qs({
      action: 'parse',
      format: 'json',
      formatversion: 2,
      prop: 'text',
      redirects: 1,
      disablelimitreport: 1,
      disableeditsection: 1,
      page: title
    })}`,
    { timeout: 20000 }
  ).catch(() => null)
  return d?.parse?.text ? parseEpisodeTables(d.parse.text) : new Map()
}

const total = (m: Map<number, SeasonEpisode[]>): number => words([...m.values()].flat())

/**
 * Synopses from a "List of … episodes" article (Wikidata "list of episodes").
 * Shows without per-season articles — most anime — keep their synopses there.
 */
export async function getEpisodeListSynopses(listQid: string, pref: string, complete: boolean): Promise<SeasonSynopses[]> {
  const ents = await getJson<{ entities?: Record<string, Entity> }>(
    `https://www.wikidata.org/w/api.php?${qs({
      action: 'wbgetentities',
      format: 'json',
      ids: listQid,
      props: 'sitelinks',
      sitefilter: [...new Set([`${pref}wiki`, 'enwiki'])].join('|')
    })}`
  ).catch(() => null)
  const links = ents?.entities?.[listQid]?.sitelinks
  const local = links?.[`${pref}wiki`]?.title
  const en = links?.enwiki?.title

  let lang = pref
  let title = local
  let seasons = local ? await episodePage(pref, local) : new Map<number, SeasonEpisode[]>()
  if (en && pref !== 'en') {
    const localWords = total(seasons)
    const enSeasons = await episodePage('en', en)
    if (total(enSeasons) > (complete ? localWords * 1.5 : localWords === 0 ? 0 : Infinity)) {
      seasons = enSeasons
      lang = 'en'
      title = en
    }
  } else if (!local && en) {
    seasons = await episodePage('en', en)
    lang = 'en'
    title = en
  }
  if (!title) return []
  return [...seasons.entries()]
    .filter(([, eps]) => eps.some((e) => e.summary))
    .map(([number, episodes]) => ({ number, lang, url: wikiUrl(lang, title!), episodes }))
    .sort((a, b) => a.number - b.number)
}

const words = (eps: SeasonEpisode[]): number => eps.reduce((n, e) => n + wordCount(e.summary), 0)

/**
 * Synopses for each season, in the reader's language when that article has
 * them; otherwise (or when `complete` and English is clearly richer) in English.
 */
export async function getSeasonSynopses(
  seasons: { qid: string; number?: number }[],
  pref: string,
  complete: boolean
): Promise<SeasonSynopses[]> {
  if (!seasons.length) return []
  const sites = [...new Set([`${pref}wiki`, 'enwiki'])].join('|')
  const ents = await getJson<{ entities?: Record<string, Entity> }>(
    `https://www.wikidata.org/w/api.php?${qs({
      action: 'wbgetentities',
      format: 'json',
      ids: seasons.slice(0, 40).map((s) => s.qid).join('|'),
      props: 'sitelinks',
      sitefilter: sites
    })}`
  ).catch(() => null)

  const results = await Promise.all(
    seasons.slice(0, 40).map(async (s, i): Promise<SeasonSynopses | null> => {
      const links = ents?.entities?.[s.qid]?.sitelinks
      const local = links?.[`${pref}wiki`]?.title
      const en = links?.enwiki?.title
      const number = s.number ?? seasonNumberFromTitle(local ?? en ?? '') ?? i + 1

      let best: SeasonSynopses | null = null
      if (local) {
        const eps = await seasonPage(pref, local)
        if (eps.some((e) => e.summary)) best = { number, lang: pref, url: wikiUrl(pref, local), episodes: eps }
      }
      const localCoverage = best ? best.episodes.filter((e) => e.summary).length / best.episodes.length : 0
      const thin = !best || localCoverage < 0.5 || (complete && words(best.episodes) / best.episodes.length < 60)
      if (en && pref !== 'en' && thin) {
        const eps = await seasonPage('en', en)
        const enWords = words(eps)
        if (enWords && (!best || (complete ? enWords > words(best.episodes) * 1.5 : localCoverage < 0.5))) {
          best = { number, lang: 'en', url: wikiUrl('en', en), episodes: eps }
        }
      } else if (en && !local) {
        const eps = await seasonPage('en', en)
        if (eps.some((e) => e.summary)) best = { number, lang: 'en', url: wikiUrl('en', en), episodes: eps }
      }
      return best
    })
  )
  return results.filter((r): r is SeasonSynopses => !!r).sort((a, b) => a.number - b.number)
}

function wikiUrl(lang: string, title: string): string {
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
}

function seasonNumberFromTitle(title: string): number | null {
  const m = /(?:season|temporada|saison|staffel|stagione)\s*(\d{1,2})|(\d{1,2})\.?ª?\s*(?:temporada|saison|staffel|stagione)/i.exec(title)
  return m ? Number(m[1] ?? m[2]) : null
}
