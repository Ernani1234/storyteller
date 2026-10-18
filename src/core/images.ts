import { getJson, qs } from './http'
import { tokenize } from '../shared/text'
import type { StoryImage } from '../shared/types'

const COMMONS = 'https://commons.wikimedia.org/w/api.php'

interface RawPage {
  title: string
  index?: number
  fullurl?: string
  thumbnail?: { source: string }
  imageinfo?: { url: string; thumburl?: string; descriptionshorturl?: string }[]
}

/** Photos of cast and crew at events say nothing about the story. */
const BEHIND_THE_SCENES =
  /\b(cropped|SDCC|comic[- ]con|festival|premiere|awards?|GDC|panel|interview|signing|convention|red carpet|Outbreak Day|motion capture|logo)\b/i

/** Same file at a different thumbnail size should count as a duplicate. */
function imageKey(url: string): string {
  return url
    .replace(/\?.*$/, '')
    .replace(/\/\d+px-[^/]+$/, '')
    .replace(/\/thumb\//, '/')
    .replace(/\/revision\/.*$/, '')
}

/** Wikipedia full-text search → page lead images. Good for named characters and places. */
async function searchWikipedia(lang: string, query: string, limit: number): Promise<StoryImage[]> {
  const json = await getJson<{ query?: { pages?: RawPage[] } }>(
    `https://${lang}.wikipedia.org/w/api.php?${qs({
      action: 'query',
      format: 'json',
      formatversion: 2,
      generator: 'search',
      gsrsearch: query,
      gsrlimit: limit,
      gsrnamespace: 0,
      prop: 'pageimages|info',
      piprop: 'thumbnail',
      // covers of films, games and books are non-free (fair use); the default only returns free images
      pilicense: 'any',
      pithumbsize: 640,
      inprop: 'url'
    })}`,
    { timeout: 8000 }
  )
  return (json?.query?.pages ?? [])
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .filter((p) => p.thumbnail?.source && !/\.svg/i.test(p.thumbnail.source))
    .map((p) => ({ url: p.thumbnail!.source, caption: p.title, source: p.fullurl }))
}

/** Fallback: Wikimedia Commons file search (broader, lower relevance). */
async function searchCommons(query: string, limit: number): Promise<StoryImage[]> {
  const json = await getJson<{ query?: { pages?: RawPage[] } }>(
    `${COMMONS}?${qs({
      action: 'query',
      format: 'json',
      formatversion: 2,
      generator: 'search',
      gsrsearch: `filetype:bitmap ${query}`,
      gsrnamespace: 6,
      gsrlimit: limit,
      prop: 'imageinfo',
      iiprop: 'url',
      iiurlwidth: 640
    })}`,
    { timeout: 8000 }
  )
  return (json?.query?.pages ?? [])
    .filter((p) => p.imageinfo?.[0])
    .map((p) => {
      const info = p.imageinfo![0]
      return {
        url: info.thumburl || info.url,
        caption: p.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, ''),
        source: info.descriptionshorturl
      }
    })
}

/**
 * Resolve image queries into a de-duplicated list. Seed images (e.g. Fandom
 * screenshots of this exact chapter) come first; then each query is tried
 * scoped to the work and bare, across the wiki languages given, in parallel;
 * Commons tops up. Best-effort: failures are swallowed so a node still renders.
 */
export async function resolveImages(
  queries: string[],
  workTitle: string,
  opts: { langs: string[]; max?: number; seed?: StoryImage[]; exclude?: (string | undefined)[] }
): Promise<StoryImage[]> {
  const max = opts.max ?? 4
  const work = workTitle.replace(/\s*\(.*?\)\s*/g, ' ').trim()
  const collected: StoryImage[] = []
  // The cover is already in the story header; don't repeat it in every chapter.
  const seen = new Set<string>(opts.exclude?.filter((u): u is string => !!u).map(imageKey))
  const workWords = new Set(tokenize(work))
  /** Words of a query that identify it ("Abby" in "Abby The Last of Us"). */
  const keyWords = (q: string): string[] => tokenize(q).filter((w) => w.length >= 3 && !workWords.has(w))

  // A search hit only counts if its title names what we searched for: a
  // scoped search for "Abby" otherwise returns the composer's page or a NASA
  // astronaut called Abby.
  const add = (imgs: StoryImage[], mustName?: { words: string[]; all?: boolean }): void => {
    for (const img of imgs) {
      if (collected.length >= max) break
      const key = imageKey(img.url)
      if (seen.has(key)) continue
      if (mustName?.words.length) {
        const cap = new Set(tokenize(img.caption))
        const hit = mustName.all ? mustName.words.every((w) => cap.has(w)) : mustName.words.some((w) => cap.has(w))
        if (!hit) continue
      }
      seen.add(key)
      if (work && img.caption.replace(/\s*\(.*?\)\s*/g, ' ').trim().toLowerCase() === work.toLowerCase()) continue
      if (BEHIND_THE_SCENES.test(img.caption) && !(opts.seed ?? []).includes(img)) continue
      collected.push(img)
    }
  }

  add(opts.seed ?? [])
  if (collected.length >= max) return collected

  const attempts: { lang: string; q: string; words: string[] }[] = []
  for (const lang of [...new Set(opts.langs)]) {
    for (const q of queries) {
      const t = q.trim()
      const words = keyWords(t)
      if (!t || !words.length) continue
      if (work && !t.toLowerCase().includes(work.toLowerCase())) attempts.push({ lang, q: `${t} ${work}`, words })
      // A bare first name ("Joel") finds footballers; only multi-word names stand alone.
      if (t.includes(' ') || !work) attempts.push({ lang, q: t, words })
    }
  }

  const results = await Promise.all(
    attempts.slice(0, 10).map((a) => searchWikipedia(a.lang, a.q, 3).catch(() => [] as StoryImage[]))
  )
  results.forEach((r, i) => add(r, { words: attempts[i].words }))

  // Commons is fuzzy: only for full names (real places, people), matching every word.
  const multi = queries.filter((q) => q.trim().includes(' ') && keyWords(q).length >= 2).slice(0, 2)
  if (collected.length < max && multi.length) {
    const commons = await Promise.all(multi.map((q) => searchCommons(q, 3).catch(() => [] as StoryImage[])))
    commons.forEach((r, i) => add(r, { words: keyWords(multi[i]), all: true }))
  }
  return collected
}
