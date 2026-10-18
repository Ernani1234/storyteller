import { getJson } from '../http'
import { stripTags } from './html'
import { tokenize } from '../../shared/text'
import type { Character, Episode } from '../../shared/types'

const BASE = 'https://api.tvmaze.com'

export interface TvSeason {
  number: number
  name: string
  summary: string
  image?: string
  premiereDate?: string
  endDate?: string
  url: string
}

export interface TvShow {
  id: number
  name: string
  url: string
  premiered?: string
  genres: string[]
  image?: string
  summary: string
  network?: string
  rating?: number
  seasons: TvSeason[]
  episodes: Episode[]
  cast: Character[]
}

interface RawImage {
  medium?: string
  original?: string
}
interface RawEpisode {
  id: number
  url: string
  name: string
  season: number
  number: number | null
  type?: string
  airdate?: string
  summary?: string | null
  image?: RawImage | null
}
interface RawShow {
  id: number
  url: string
  name: string
  premiered?: string
  genres?: string[]
  image?: RawImage | null
  summary?: string | null
  network?: { name: string } | null
  webChannel?: { name: string } | null
  rating?: { average?: number | null }
  _embedded?: {
    episodes?: RawEpisode[]
    seasons?: {
      number: number
      name?: string
      summary?: string | null
      image?: RawImage | null
      premiereDate?: string
      endDate?: string
      url: string
    }[]
    cast?: {
      person: { name: string; image?: RawImage | null }
      character: { name: string; url?: string; image?: RawImage | null }
    }[]
  }
}

function similar(a: string, b: string): boolean {
  const ta = new Set(tokenize(a))
  const tb = new Set(tokenize(b))
  if (!ta.size || !tb.size) return a.trim().toLowerCase() === b.trim().toLowerCase()
  let shared = 0
  for (const t of ta) if (tb.has(t)) shared++
  return shared / Math.min(ta.size, tb.size) >= 0.6
}

type RawSeason = NonNullable<NonNullable<RawShow['_embedded']>['seasons']>[number]
type RawCast = NonNullable<NonNullable<RawShow['_embedded']>['cast']>[number]

/**
 * A show with every season, episode summary and the main cast. Resolved by
 * TVMaze id, then IMDb id (both exact, from Wikidata), then by name.
 * Parts are fetched in parallel rather than via `embed`: TVMaze's seasons
 * endpoint can take 10s+ for some shows, and an embed waits for all of it.
 */
export async function getShow(opts: { id?: string; imdb?: string; query?: string }): Promise<TvShow | null> {
  let d: RawShow | null = null
  if (opts.id) {
    d = await getJson<RawShow>(`${BASE}/shows/${encodeURIComponent(opts.id)}`, { allow404: true, timeout: 8000 })
  }
  if (!d && opts.imdb) {
    d = await getJson<RawShow>(`${BASE}/lookup/shows?imdb=${encodeURIComponent(opts.imdb)}`, { allow404: true, timeout: 8000 })
  }
  if (!d && opts.query) {
    d = await getJson<RawShow>(`${BASE}/singlesearch/shows?q=${encodeURIComponent(opts.query)}`, {
      allow404: true,
      timeout: 8000
    })
    if (d && !similar(opts.query, d.name)) return null
  }
  if (!d) return null

  const [rawEpisodes, rawCast, rawSeasons] = await Promise.all([
    getJson<RawEpisode[]>(`${BASE}/shows/${d.id}/episodes?specials=1`, { timeout: 10000 }),
    getJson<RawCast[]>(`${BASE}/shows/${d.id}/cast`, { timeout: 6000 }).catch(() => null),
    getJson<RawSeason[]>(`${BASE}/shows/${d.id}/seasons`, { timeout: 5000 }).catch(() => null)
  ])
  d._embedded = { episodes: rawEpisodes ?? [], cast: rawCast ?? [], seasons: rawSeasons ?? undefined }
  if (!d._embedded.seasons) {
    // Seasons endpoint was slow: derive seasons from the episode list.
    const numbers = [...new Set(d._embedded.episodes!.map((e) => e.season))].sort((a, b) => a - b)
    d._embedded.seasons = numbers.map((n) => {
      const eps = d!._embedded!.episodes!.filter((e) => e.season === n)
      return { number: n, url: d!.url, premiereDate: eps[0]?.airdate, endDate: eps[eps.length - 1]?.airdate }
    })
  }

  const episodes: Episode[] = (d._embedded?.episodes ?? [])
    .filter((e) => e.type !== 'insignificant_special')
    .map((e) => ({
      id: `tvm-${e.id}`,
      season: e.season,
      number: e.number,
      title: e.name,
      airdate: e.airdate || undefined,
      summary: stripTags(e.summary ?? ''),
      image: e.image?.medium,
      url: e.url
    }))

  return {
    id: d.id,
    name: d.name,
    url: d.url,
    premiered: d.premiered,
    genres: d.genres ?? [],
    image: d.image?.original ?? d.image?.medium,
    summary: stripTags(d.summary ?? ''),
    network: d.network?.name ?? d.webChannel?.name,
    rating: d.rating?.average ?? undefined,
    seasons: (d._embedded?.seasons ?? [])
      .filter((s) => episodes.some((e) => e.season === s.number))
      .map((s) => ({
        number: s.number,
        name: s.name ?? '',
        summary: stripTags(s.summary ?? ''),
        image: s.image?.medium,
        premiereDate: s.premiereDate,
        endDate: s.endDate,
        url: s.url
      })),
    episodes,
    cast: (d._embedded?.cast ?? []).slice(0, 24).map((c) => ({
      name: c.character.name,
      actor: c.person.name,
      image: c.character.image?.medium ?? c.person.image?.medium,
      url: c.character.url
    }))
  }
}
