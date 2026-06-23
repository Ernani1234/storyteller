import type { StoryImage } from '../shared/types'

const WIKI = 'https://en.wikipedia.org/w/api.php'
const COMMONS = 'https://commons.wikimedia.org/w/api.php'
const UA = { 'User-Agent': 'Storyteller/1.0 (desktop app)' }

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: UA })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/**
 * Primary source: Wikipedia full-text search → page lead images (pageimages).
 * Works well for named characters, places and works themselves.
 */
async function searchWikipedia(query: string, limit: number): Promise<StoryImage[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: query,
    gsrlimit: String(limit),
    gsrnamespace: '0',
    prop: 'pageimages|info',
    piprop: 'thumbnail',
    pithumbsize: '600',
    inprop: 'url',
    origin: '*'
  })
  const json = await getJson(`${WIKI}?${params.toString()}`)
  const pages: Record<string, any> = json?.query?.pages ?? {}
  const out: StoryImage[] = []
  for (const page of Object.values<any>(pages)) {
    const thumb = page.thumbnail?.source
    if (!thumb) continue
    out.push({ url: thumb, caption: page.title, source: page.fullurl })
  }
  return out
}

/** Fallback: Wikimedia Commons file search (broader, lower relevance). */
async function searchCommons(query: string, limit: number): Promise<StoryImage[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: `filetype:bitmap ${query}`,
    gsrnamespace: '6',
    gsrlimit: String(limit),
    prop: 'imageinfo',
    iiprop: 'url',
    iiurlwidth: '600',
    origin: '*'
  })
  const json = await getJson(`${COMMONS}?${params.toString()}`)
  const pages: Record<string, any> = json?.query?.pages ?? {}
  const out: StoryImage[] = []
  for (const page of Object.values<any>(pages)) {
    const info = page.imageinfo?.[0]
    if (!info) continue
    out.push({
      url: info.thumburl || info.url,
      caption: String(page.title).replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, ''),
      source: info.descriptionshorturl
    })
  }
  return out
}

/**
 * Resolve image queries into a de-duplicated list. Each query is tried first
 * scoped to the work (better relevance), then on its own, across Wikipedia then
 * Commons. Best-effort: failures are swallowed so a node still renders.
 */
export async function resolveImages(
  queries: string[],
  workTitle: string,
  max = 4
): Promise<StoryImage[]> {
  const collected: StoryImage[] = []
  const seen = new Set<string>()

  const add = (imgs: StoryImage[]): void => {
    for (const img of imgs) {
      if (collected.length >= max) break
      if (seen.has(img.url)) continue
      seen.add(img.url)
      collected.push(img)
    }
  }

  // Build an attempt list: work-scoped queries first, then bare, plus the work
  // itself as a guaranteed-relevant fallback.
  const attempts: string[] = []
  for (const q of queries) {
    const t = q.trim()
    if (!t) continue
    attempts.push(workTitle ? `${q} ${workTitle}` : q)
    attempts.push(q)
  }
  if (workTitle) attempts.push(workTitle)

  for (const a of attempts) {
    if (collected.length >= max) break
    try {
      add(await searchWikipedia(a, 3))
    } catch {
      /* ignore */
    }
  }
  // Top up from Commons if Wikipedia was thin.
  for (const q of queries) {
    if (collected.length >= max) break
    try {
      add(await searchCommons(workTitle ? `${q} ${workTitle}` : q, 2))
    } catch {
      /* ignore */
    }
  }
  return collected
}
