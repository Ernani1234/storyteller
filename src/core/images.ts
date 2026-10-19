import { getJson, qs } from './http'
import { fold } from '../shared/text'
import type { StoryImage } from '../shared/types'

const COMMONS = 'https://commons.wikimedia.org/w/api.php'

interface RawPage {
  title: string
  index?: number
  fullurl?: string
  thumbnail?: { source: string }
  /** short description ("Fictional character from Attack on Titan") */
  description?: string
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

/** The work's Wikipedia article in each language, from its Wikidata item. */
async function workArticles(qid: string, langs: string[]): Promise<{ lang: string; title: string }[]> {
  const json = await getJson<{ entities?: Record<string, { sitelinks?: Record<string, { title: string }> }> }>(
    `https://www.wikidata.org/w/api.php?${qs({
      action: 'wbgetentities',
      format: 'json',
      ids: qid,
      props: 'sitelinks',
      sitefilter: langs.map((l) => `${l}wiki`).join('|')
    })}`,
    { timeout: 8000 }
  )
  const links = json?.entities?.[qid]?.sitelinks ?? {}
  return langs.flatMap((lang) => (links[`${lang}wiki`] ? [{ lang, title: links[`${lang}wiki`].title }] : []))
}

/** Articles a page links to: for a work, its characters, factions, places and franchise. */
async function linkedTitles(lang: string, title: string): Promise<string[]> {
  const out: string[] = []
  let cont: string | undefined
  for (let page = 0; page < 3; page++) {
    const json = await getJson<{ query?: { pages?: { links?: { title: string }[] }[] }; continue?: { plcontinue?: string } }>(
      `https://${lang}.wikipedia.org/w/api.php?${qs({
        action: 'query',
        format: 'json',
        formatversion: 2,
        prop: 'links',
        titles: title,
        plnamespace: 0,
        pllimit: 'max',
        redirects: 1,
        plcontinue: cont
      })}`,
      { timeout: 8000 }
    )
    for (const p of json?.query?.pages ?? []) for (const l of p.links ?? []) out.push(l.title)
    cont = json?.continue?.plcontinue
    if (!cont) break
  }
  return out
}

/** Lead images of specific pages (up to 50 per request). `describes` can require a page's short description to fit. */
async function pageImages(
  lang: string,
  titles: string[],
  describes?: (title: string, description: string) => boolean
): Promise<StoryImage[]> {
  if (!titles.length) return []
  const json = await getJson<{
    query?: {
      pages?: RawPage[]
      normalized?: { from: string; to: string }[]
      redirects?: { from: string; to: string; tofragment?: string }[]
    }
  }>(
    `https://${lang}.wikipedia.org/w/api.php?${qs({
      action: 'query',
      format: 'json',
      formatversion: 2,
      titles: titles.slice(0, 50).join('|'),
      prop: 'pageimages|info|description',
      piprop: 'thumbnail',
      pilicense: 'any',
      pithumbsize: 640,
      inprop: 'url',
      redirects: 1
    })}`,
    { timeout: 8000 }
  )
  const byTitle = new Map((json?.query?.pages ?? []).map((p) => [p.title, p]))
  const normalized = new Map((json?.query?.normalized ?? []).map((n) => [n.from, n.to]))
  const redirects = new Map((json?.query?.redirects ?? []).map((r) => [r.from, r]))
  return titles.flatMap((t) => {
    const name = normalized.get(t) ?? t
    const redirect = redirects.get(name)
    // "Ork (Warhammer 40,000)" → a section of the franchise article: its picture is the franchise's, not the Orks'.
    if (redirect?.tofragment) return []
    const p = byTitle.get(redirect?.to ?? name)
    if (p && describes && !describes(t, p.description ?? '')) return []
    return p?.thumbnail?.source && !/\.svg/i.test(p.thumbnail.source)
      ? [{ url: p.thumbnail.source, caption: p.title, source: p.fullurl }]
      : []
  })
}

/** Not pictures of the story: logos, icons, flags, maps of wiki chrome, and people at events. */
const NOT_A_SCENE = /\.svg$|logo|icon|symbol|flag of|userbox|pencil|wiki|commons|\b(cover|poster)\b|\(\d{6,}\)|\b(19|20)\d{2}\b/i

/**
 * The pictures in the work's own articles (a screenshot, a scene, a set or
 * location), the ones naming the work first. Used when a chapter's names
 * found nothing: on-topic, and each chapter gets a different one.
 */
async function articlePool(articles: { lang: string; title: string }[], work: string): Promise<StoryImage[]> {
  const workWords = nameWords(work)
  const lists = await Promise.all(
    articles.map(async ({ lang, title }) => {
      const files = await getJson<{ query?: { pages?: { images?: { title: string }[] }[] } }>(
        `https://${lang}.wikipedia.org/w/api.php?${qs({ action: 'query', format: 'json', formatversion: 2, prop: 'images', imlimit: 60, titles: title })}`,
        { timeout: 8000 }
      ).catch(() => null)
      const names = (files?.query?.pages?.[0]?.images ?? [])
        .map((i) => i.title)
        .filter((t) => !NOT_A_SCENE.test(t) && /\p{L}{3,}/u.test(t.replace(/^[^:]+:/, '').replace(/\.\w+$/, '')))
        .slice(0, 20)
      if (!names.length) return []
      const info = await getJson<{
        query?: { pages?: (RawPage & { imageinfo?: { url: string; thumburl?: string; width?: number; descriptionshorturl?: string }[] })[] }
      }>(
        `https://${lang}.wikipedia.org/w/api.php?${qs({
          action: 'query',
          format: 'json',
          formatversion: 2,
          titles: names.join('|'),
          prop: 'imageinfo',
          iiprop: 'url|size',
          iiurlwidth: 640
        })}`,
        { timeout: 8000 }
      ).catch(() => null)
      return (info?.query?.pages ?? []).flatMap((p) => {
        const ii = p.imageinfo?.[0]
        if (!ii || (ii.width ?? 0) < 300) return []
        const caption = p.title
          .replace(/^[^:]+:/, '')
          .replace(/\.\w+$/, '')
          .replace(/_/g, ' ')
        return [{ url: ii.thumburl || ii.url, caption, source: ii.descriptionshorturl }]
      })
    })
  )
  // Cast and crew group photos: "Aaron Paul, Vince Gilligan and Bryan Cranston". (Single
  // portraits carry a year or "(cropped)" and are already out; a bare two-word name could be a place.)
  const NAME = String.raw`\p{Lu}[\p{L}'’.-]+ \p{Lu}[\p{L}'’.-]+`
  const people = new RegExp(`^${NAME}(, ${NAME})*,? (and|&|e|y|et|und) ${NAME}$`, 'u')
  // Filtered here, before chapters pick by position, so no chapter draws a picture that would be dropped.
  const pool = lists.flat().filter((img) => !people.test(img.caption) && !BEHIND_THE_SCENES.test(img.caption))
  const namesWork = (img: StoryImage): boolean => nameWords(img.caption).some((w) => workWords.includes(w))
  return [...pool.filter(namesWork), ...pool.filter((i) => !namesWork(i))]
}

/** Short descriptions of fictional characters, in the wiki languages the app reads. */
const CHARACTER = /fictional|character|personagem|personaje|personnage|figur|personaggio|キャラクター|登場人物/i

const stripQualifier = (title: string): string => title.replace(/\s*\(.*?\)\s*/g, ' ').trim()

const FILLER = new Set(['the', 'and', 'for', 'das', 'dos', 'del', 'des', 'les', 'von', 'der', 'die', 'und', 'with'])

/**
 * Words of a name, unstemmed: matching names needs whole words ("Cooper" is
 * not "Coop", "Murph" is not "Murphy"), unlike full-text search.
 */
function nameWords(s: string): string[] {
  return fold(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !FILLER.has(w))
}

/** Same word, allowing a plural ("Orks" / "Ork"). */
const sameWord = (a: string, b: string): boolean => a === b || a === `${b}s` || b === `${a}s` || a === `${b}es` || b === `${a}es`

/**
 * What belongs to the work: the pages its own articles link to, and the
 * words that mark its universe: its title and the qualifiers its linked
 * pages share ("Ork (Warhammer 40,000)", "Joel (The Last of Us)").
 */
interface WorkContext {
  /** the work's own articles */
  articles: { lang: string; title: string }[]
  /** linked page titles per wiki language */
  linked: Map<string, string[]>
  words: Set<string>
}

async function workContext(qid: string | undefined, work: string, langs: string[]): Promise<WorkContext> {
  const words = new Set(nameWords(work))
  const linked = new Map<string, string[]>()
  if (!qid) return { articles: [], linked, words }
  const articles = await workArticles(qid, langs).catch(() => [])
  await Promise.all(
    articles.map(async (a) => {
      const titles = await linkedTitles(a.lang, a.title).catch(() => [] as string[])
      linked.set(a.lang, titles)
      const qualifiers = new Map<string, number>()
      for (const t of titles) {
        const q = /\(([^)]+)\)\s*$/.exec(t)?.[1]
        if (q) qualifiers.set(q, (qualifiers.get(q) ?? 0) + 1)
      }
      // A named qualifier on several linked pages is the franchise ("Warhammer
      // 40,000", "The Last of Us"); generic ones ("film", "TV series", "2014 film") are not.
      for (const [q, n] of qualifiers) {
        if (n < 2 || !/^\p{Lu}/u.test(q) || /^(TV|\d)/.test(q)) continue
        for (const w of nameWords(q)) words.add(w)
      }
    })
  )
  return { articles, linked, words }
}

/**
 * Does a page title name what was asked for? A one-word name needs a page of
 * exactly that name ("Ellie (The Last of Us)" for "Ellie"; not "Tom Woodruff
 * Jr." for "Tom"). A longer one needs all its words, with at most one more
 * ("Imperium of Man", "Captain Titus" for "Titus" is too loose).
 */
function namesIt(title: string, query: string[]): boolean {
  if (!query.length) return false
  const name = stripQualifier(title)
  // "Thor: Ragnarok", "Paul of Dune", "Codex: Imperial Guard": another work of the franchise, not the thing named.
  if (name.includes(':')) return false
  const base = nameWords(name)
  if (!query.every((q) => base.some((b) => sameWord(q, b)))) return false
  const extra = base.filter((b) => !query.some((q) => sameWord(q, b))).length
  return query.length === 1 ? extra === 0 : extra <= 1
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
 * Resolve image queries (names from a chapter) into a de-duplicated list.
 * Seed images (Fandom screenshots of this exact chapter) come first. Then,
 * so pictures stay inside the work's world:
 * 1. names matching a page the work's own article links to get that page's
 *    image ("Orks" → "Ork (Warhammer 40,000)", "Saturno" → "Saturno (planeta)");
 * 2. a search scoped to the work, keeping hits that name the query and
 *    belong to the work: a linked page, or titled with the work or its
 *    franchise. A bare "Império" otherwise found the Roman Empire;
 * 3. Commons, under the same rule;
 * 4. still nothing: a picture from the work's own article, one per chapter.
 * Fewer pictures beat wrong ones. Best-effort: failures are swallowed.
 */
export async function resolveImages(
  queries: string[],
  workTitle: string,
  opts: {
    langs: string[]
    qid?: string
    max?: number
    seed?: StoryImage[]
    exclude?: (string | undefined)[]
    /** chapter position: picks which of the work's own pictures a chapter with no match gets. */
    slot?: number
  }
): Promise<StoryImage[]> {
  const max = opts.max ?? 4
  const work = stripQualifier(workTitle)
  const langs = [...new Set(opts.langs)]
  const collected: StoryImage[] = []
  // The cover is already in the story header; don't repeat it in every chapter.
  const seen = new Set<string>(opts.exclude?.filter((u): u is string => !!u).map(imageKey))

  const add = (imgs: StoryImage[], accept: (img: StoryImage) => boolean = () => true): void => {
    for (const img of imgs) {
      if (collected.length >= max) break
      const key = imageKey(img.url)
      if (seen.has(key) || !accept(img)) continue
      seen.add(key)
      if (work && fold(stripQualifier(img.caption)) === fold(work)) continue
      if (BEHIND_THE_SCENES.test(img.caption) && !(opts.seed ?? []).includes(img)) continue
      collected.push(img)
    }
  }

  add(opts.seed ?? [])
  if (collected.length >= max) return collected

  const ctx = await workContext(opts.qid, work, langs)
  const wanted = queries
    .map((q) => ({ q: q.trim(), words: nameWords(q).filter((w) => !ctx.words.has(w)) }))
    .filter((x) => x.q && x.words.length)
  if (wanted.length) {
    const linkedAll = new Set([...ctx.linked.values()].flat().map(fold))
    const belongs = (caption: string): boolean => linkedAll.has(fold(caption)) || nameWords(caption).some((w) => ctx.words.has(w))

    // 1. Pages the work's article links to, by name.
    const perLang = await Promise.all(
      langs.map(async (lang) => {
        const titles = ctx.linked.get(lang) ?? []
        const picks: string[] = []
        // A first name alone ("Eren") may match "Firstname Surname", but only a character: not "Tom Woodruff Jr.", the actor.
        const maybe = new Set<string>()
        for (const { words } of wanted) {
          let pick = titles.find((t) => namesIt(t, words))
          if (!pick && words.length === 1) {
            pick = titles.find((t) => {
              const base = nameWords(stripQualifier(t))
              return !t.includes(':') && base.length === 2 && base.some((b) => sameWord(b, words[0]))
            })
            if (pick) maybe.add(pick)
          }
          if (pick && fold(stripQualifier(pick)) !== fold(work) && !picks.includes(pick)) picks.push(pick)
        }
        const character = (t: string, d: string): boolean => !maybe.has(t) || CHARACTER.test(d)
        return picks.length ? pageImages(lang, picks, character).catch(() => [] as StoryImage[]) : []
      })
    )
    perLang.forEach((imgs) => add(imgs))

    // 2. Scoped search: the hit must name the query and belong to the work.
    if (collected.length < max) {
      const attempts: { lang: string; q: string; words: string[] }[] = []
      for (const lang of langs) {
        for (const { q, words } of wanted) {
          if (work && !fold(q).includes(fold(work))) attempts.push({ lang, q: `${q} ${work}`, words })
        }
      }
      const results = await Promise.all(attempts.slice(0, 8).map((a) => searchWikipedia(a.lang, a.q, 4).catch(() => [] as StoryImage[])))
      results.forEach((r, i) => add(r, (img) => namesIt(img.caption, attempts[i].words) && belongs(img.caption)))
    }

    // 3. Commons is fuzzy: full names only, and from the work's world.
    const multi = wanted.filter((x) => x.words.length >= 2).slice(0, 2)
    if (collected.length < max && multi.length) {
      const commons = await Promise.all(multi.map((x) => searchCommons(x.q, 4).catch(() => [] as StoryImage[])))
      commons.forEach((r, i) =>
        add(r, (img) => {
          // File names describe the picture, so only require every word of the name in it.
          const cap = nameWords(img.caption)
          return multi[i].words.every((w) => cap.some((c) => sameWord(w, c))) && belongs(img.caption)
        })
      )
    }
  }

  // 4. Nothing named matched: one of the work's own article pictures, a different one per chapter.
  if (!collected.length && opts.slot !== undefined && ctx.articles.length) {
    const pool = (await articlePool(ctx.articles, work)).filter((img) => !seen.has(imageKey(img.url)))
    const pick = pool[opts.slot]
    if (pick) add([pick])
  }
  return collected
}
