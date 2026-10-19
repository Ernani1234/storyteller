import { getSettings, contentLang } from './config'
import { AppError } from './errors'
import { storyId } from './ids'
import { fill, labelsFor, type Labels } from './labels'
import { resolveImages } from './images'
import { translateOutline } from './translate'
import * as wiki from './sources/wikipedia'
import { getWork, classify, type WdWork, type WdRef, type MediaKind } from './sources/wikidata'
import { getShow, type TvShow } from './sources/tvmaze'
import { getMedia, type AniMedia } from './sources/anilist'
import { getFandomPlot, guessFandom, pickFandom, type FandomPlot } from './sources/fandom'
import { getEpisodeListSynopses, getSeasonSynopses, type SeasonSynopses } from './sources/seasons'
import { chain } from '../shared/tree'
import {
  deriveTitle,
  fold,
  keySentences,
  properNouns,
  segmentParagraphs,
  splitParagraphs,
  splitSentences,
  tokenize,
  truncate,
  wordCount
} from '../shared/text'
import type {
  BuildStep,
  Character,
  Engine,
  NodeDetail,
  OutlineNotice,
  PlotSourceOption,
  RelatedWork,
  SearchSuggestion,
  SourceRef,
  StoryImage,
  StoryNode,
  StoryOutline,
  StoryQuery,
  WorkMeta
} from '../shared/types'

export type Progress = (step: BuildStep) => void

/** Everything the sources know about one work, before it is turned into a story. */
export interface Collected {
  pref: string
  page: wiki.WikiPage | null
  enPage: wiki.WikiPage | null
  wd: WdWork | null
  kind: MediaKind
  tv: TvShow | null
  ani: AniMedia | null
  fandom: FandomPlot | null
  /** episode synopses from Wikipedia season articles (series) */
  seasons: SeasonSynopses[]
  alternatives: SearchSuggestion[]
  title: string
}

const stripParens = (s: string): string => s.replace(/\s*\([^)]*\)\s*/g, ' ').trim()

/**
 * Resolve a query to one work and pull every enabled source about it. The
 * Wikidata id is the pivot: it gives the exact article in each language and
 * exact TVMaze / AniList / Fandom ids, so later lookups don't guess.
 */
export async function collect(q: StoryQuery, progress: Progress = () => {}): Promise<Collected> {
  const s = getSettings()
  const src = s.sources
  const pref = contentLang(s)

  progress('resolve')
  let alternatives: SearchSuggestion[] = []
  let qid = q.qid
  let first: { lang: string; title: string } | null = q.wikiTitle
    ? { lang: q.lang ?? pref, title: q.wikiTitle }
    : null

  if (!first && !qid && src.wikipedia) {
    alternatives = await wiki.suggest(q.text, pref, 8)
    if (alternatives[0]) {
      first = { lang: alternatives[0].lang, title: alternatives[0].title }
      qid = alternatives[0].qid
    }
  }

  progress('sources')
  // When we already know the article, fetch it alongside Wikidata.
  const early = src.wikipedia && first ? wiki.getPage(first.lang, first.title).catch(() => null) : Promise.resolve(null)
  let [wd, page] = await Promise.all([qid ? getWork(qid, pref).catch(() => null) : Promise.resolve(null), early])
  if (src.wikipedia) {
    const prefTitle = wd?.sitelinks[pref]
    if (prefTitle && (page?.lang !== pref || page.title !== prefTitle)) {
      page = (await wiki.getPage(pref, prefTitle).catch(() => null)) ?? page
    } else if (!page && wd?.sitelinks.en) {
      page = await wiki.getPage('en', wd.sitelinks.en).catch(() => null)
    }
  }
  if (!wd && page?.qid) wd = await getWork(page.qid, pref).catch(() => null)
  if (wd && page && page.lang !== pref && wd.sitelinks[pref]) {
    page = (await wiki.getPage(pref, wd.sitelinks[pref]).catch(() => null)) ?? page
  }

  // The English article too: it's the fallback when the local one has little
  // plot, and in "most complete" mode it often tells the story at more length.
  let enPage: wiki.WikiPage | null = null
  const localPlot = page ? wiki.findPlot(page) : null
  const complete = s.storyDetail !== 'local'
  if (src.wikipedia && page && page.lang !== 'en' && (complete || !localPlot || localPlot.words < 250)) {
    const enTitle = wd?.sitelinks.en
    if (enTitle) enPage = await wiki.getPage('en', enTitle).catch(() => null)
  }

  const kind = classify(wd?.typesEn ?? [], page?.description ?? alternatives[0]?.description)
  const enTitle = stripParens(wd?.labelEn ?? enPage?.title ?? page?.title ?? q.text)

  // No Wikipedia hit at all: let TVMaze / AniList try the raw query.
  const unknown = !page && !wd
  const wantTv = src.tvmaze && (kind.series || unknown)
  const wantAni = src.anilist && (kind.anime || kind.manga || unknown)
  const aniType = kind.kind === 'manga' || (kind.manga && !kind.anime) ? 'MANGA' : 'ANIME'
  const fandomRef = src.fandom && wd ? pickFandom(wd.fandom, pref) : null
  // Fan wikis usually tell the story at several times Wikipedia's length; the
  // franchise's wiki is a good place to look too (Harry Potter → harrypotter.fandom.com).
  const franchises = (wd?.series ?? []).map((r) => r.labelEn ?? r.label)
  const tryFandom = async (): Promise<FandomPlot | null> => {
    const byId = fandomRef ? await getFandomPlot(fandomRef).catch(() => null) : null
    if (byId || !src.fandom || (kind.series && !kind.anime) || (!page && !wd)) return byId
    return guessFandom(enTitle, franchises).catch(() => null)
  }

  const [tv, ani, fandom, seasons] = await Promise.all([
    wantTv
      ? getShow({ id: wd?.tvmazeId, imdb: wd?.imdb, query: unknown ? q.text : enTitle }).catch(() => null)
      : Promise.resolve(null),
    wantAni
      ? getMedia({
          id: aniType === 'MANGA' ? wd?.anilistManga : wd?.anilistAnime,
          search: unknown ? q.text : enTitle,
          type: aniType
        }).catch(() => null)
      : Promise.resolve(null),
    tryFandom(),
    kind.series && src.wikipedia && wd ? seriesSynopses(wd, pref, complete) : Promise.resolve([])
  ])

  if (!page && !wd && !tv && !ani && !fandom) throw new AppError('NOT_FOUND', q.text)

  // The article title beats the Wikidata label, which is sometimes an acronym ("FMAB").
  const title = page
    ? stripParens(page.title)
    : wd?.label && wd.label !== wd.qid
      ? wd.label
      : (tv?.name ?? ani?.title ?? q.text)

  return { pref, page, enPage, wd, kind, tv, ani, fandom, seasons, alternatives, title }
}

/** Season articles first (richest); otherwise the series' "List of … episodes" page. */
async function seriesSynopses(wd: WdWork, pref: string, complete: boolean): Promise<SeasonSynopses[]> {
  const bySeason = wd.seasons.length ? await getSeasonSynopses(wd.seasons, pref, complete).catch(() => []) : []
  if (bySeason.length || !wd.episodeList) return bySeason
  return getEpisodeListSynopses(wd.episodeList, pref, complete).catch(() => [])
}

// ---------------------------------------------------------------------------
// Turning plot text into chapters

interface Chunk {
  title: string
  text: string
  images?: StoryImage[]
  /** later piece of a section that was split in several. */
  continues?: boolean
}

function summaryOf(text: string): string {
  const firstPara = splitParagraphs(text)[0] ?? ''
  return truncate(splitSentences(firstPara)[0] ?? firstPara, 170)
}

/** Section names that say nothing about the chapter ("Main Story · …" on every node). */
const GENERIC_PART = /^(main story|story|plot|synopsis|summary|storyline|walkthrough|main quest|enredo|sinopse|história)$/i

/**
 * Fandom often marks acts with a short line ("Part I", "Chapter 3") instead
 * of a heading. Pull it out so it titles the chunk rather than being read as
 * its first sentence (and glued to the next name: "Part I Just").
 */
function leadLabel(text: string): { label: string | null; text: string } {
  const paras = splitParagraphs(text)
  const first = paras[0] ?? ''
  if (paras.length > 1 && wordCount(first) <= 5 && /^\p{Lu}/u.test(first) && !/[.!?:;]$/.test(first)) {
    return { label: first, text: paras.slice(1).join('\n\n') }
  }
  return { label: null, text }
}

function chunksFromParts(intro: string, parts: { title: string; text: string; images?: StoryImage[] }[], L: Labels, introImages: StoryImage[] = []): Chunk[] {
  const chunks: Chunk[] = []
  const usable = parts.filter((p) => wordCount(p.text) >= 15)

  if (usable.length >= 2) {
    // Chapter size follows the story's length: ~180 words for a 1,000-word
    // plot, up to ~350 for long ones. A flat 350 left short stories (Fallout 4:
    // "Setting" + "Plot") with two or three long chapters.
    const total = usable.reduce((n, p) => n + wordCount(p.text), 0)
    const target = Math.min(350, Math.max(180, Math.round(total / 9)))
    if (wordCount(intro) >= 40) chunks.push({ title: L.prologue, text: splitParagraphs(intro).join('\n\n'), images: introImages })
    for (const p of usable) {
      const words = wordCount(p.text)
      const paras = splitParagraphs(p.text)
      if (words > target * 1.85) {
        // Long section: split it, naming each piece by who/where it is about.
        const sub = segmentParagraphs(paras, Math.ceil(words / target), target).map(leadLabel)
        const texts = sub.map((s) => s.text)
        const prefix = GENERIC_PART.test(p.title.trim()) ? '' : `${p.title} · `
        sub.forEach(({ label, text }, i) => {
          const names = deriveTitle(text, texts, `${i + 1}/${sub.length}`)
          chunks.push({
            title: `${prefix}${label ? `${label}: ${names}` : names}`,
            text,
            images: i === 0 ? p.images : [],
            continues: i > 0
          })
        })
      } else {
        chunks.push({ title: p.title, text: paras.join('\n\n'), images: p.images })
      }
    }
    if (!chunks[0]?.images?.length && introImages.length) chunks[0].images = introImages
    return chunks
  }

  // No usable sub-headings: segment the running text and title each piece by
  // the names that are distinctive to it.
  const all = [intro, ...parts.map((p) => p.text)].join('\n')
  const segs = segmentParagraphs(splitParagraphs(all)).map(leadLabel)
  const texts = segs.map((s) => s.text)
  const images = [...introImages, ...parts.flatMap((p) => p.images ?? [])]
  segs.forEach(({ label, text }, i) => {
    const names = deriveTitle(text, texts, fill(L.part, i + 1))
    chunks.push({
      title: label ? `${label}: ${names}` : names,
      text,
      images: images[i] ? [images[i]] : []
    })
  })
  return chunks
}

function nodesFromChunks(chunks: Chunk[], kind: StoryNode['kind'] = 'chapter'): StoryNode[] {
  const seen = new Map<string, number>()
  return chain(
    chunks.map((c, i) => {
      let title = truncate(c.title, 70)
      const n = (seen.get(title) ?? 0) + 1
      seen.set(title, n)
      if (n > 1) title = `${title} (${n})`
      return {
        id: `ch${i + 1}`,
        title,
        summary: summaryOf(c.text),
        kind,
        text: c.text,
        images: c.images?.length ? c.images : undefined
      }
    })
  )
}

function nodesFromTv(tv: TvShow, premise: string, L: Labels): StoryNode[] {
  const out: Omit<StoryNode, 'parentId' | 'order'>[] = []
  if (wordCount(premise) >= 20) {
    out.push({ id: 'premise', title: L.premise, summary: summaryOf(premise), kind: 'section', text: splitParagraphs(premise).join('\n\n') })
  }
  for (const season of tv.seasons) {
    const eps = tv.episodes.filter((e) => e.season === season.number)
    if (!eps.length) continue
    const years = [...new Set([season.premiereDate, season.endDate].map((d) => d?.slice(0, 4)).filter(Boolean))]
    const named = season.name && !/^(season|temporada)\s*\d+$/i.test(season.name.trim())
    const seasonLabel = fill(L.season, season.number)
    const seasonTitle = named ? `${seasonLabel}: ${season.name}` : seasonLabel
    const image = season.image
      ? [{ url: season.image, caption: `${tv.name} — ${seasonLabel}`, source: season.url }]
      : undefined

    // Long-running anime often sit in one 60+ episode "season": split it into
    // blocks of ~13 episodes so the tree stays readable.
    const blocks = eps.length > 26 ? Math.ceil(eps.length / 13) : 1
    const size = Math.ceil(eps.length / blocks)
    for (let b = 0; b < blocks; b++) {
      const part = eps.slice(b * size, (b + 1) * size)
      if (!part.length) continue
      const range = `${part[0].number ?? b * size + 1}–${part[part.length - 1].number ?? (b + 1) * size}`
      const lead = part.find((e) => e.summary)
      out.push({
        id: blocks > 1 ? `s${season.number}-${b + 1}` : `s${season.number}`,
        title: blocks > 1 ? `${seasonTitle} · ${fill(L.episodeRange, range)}` : seasonTitle,
        summary:
          blocks > 1 && lead
            ? truncate(`${lead.title}: ${lead.summary}`, 200)
            : season.summary
              ? truncate(season.summary, 200)
              : `${fill(L.episodeCount, part.length)}${years.length ? ` · ${years.join('–')}` : ''}`,
        kind: 'season',
        text: b === 0 ? season.summary : '',
        episodes: part,
        images: b === 0 ? image : undefined
      })
    }
  }
  return chain(out)
}

const ORDINALS: [string, number][] = [
  ['primeira', 1], ['primera', 1], ['first', 1], ['premiere', 1], ['erste', 1], ['prima', 1],
  ['segunda', 2], ['second', 2], ['deuxieme', 2], ['zweite', 2], ['seconda', 2],
  ['terceira', 3], ['tercera', 3], ['third', 3], ['troisieme', 3], ['dritte', 3], ['terza', 3],
  ['quarta', 4], ['cuarta', 4], ['fourth', 4], ['quatrieme', 4], ['vierte', 4],
  ['quinta', 5], ['fifth', 5], ['cinquieme', 5], ['funfte', 5],
  ['sexta', 6], ['sixth', 6], ['sixieme', 6], ['sesta', 6],
  ['setima', 7], ['septima', 7], ['seventh', 7], ['septieme', 7], ['settima', 7],
  ['oitava', 8], ['octava', 8], ['eighth', 8], ['huitieme', 8], ['ottava', 8],
  ['nona', 9], ['novena', 9], ['ninth', 9], ['neuvieme', 9],
  ['decima', 10], ['tenth', 10], ['dixieme', 10]
]

/** "Quinta temporada (2012-13)" → 5, "Season 2" → 2. Ordinals are read first so years don't win. */
function seasonNumber(title: string): number | null {
  const t = fold(title)
  if (!/(temporada|season|saison|staffel|stagione|シーズン)/.test(t)) return null
  for (const [word, n] of ORDINALS) if (new RegExp(`(^|[^a-z])${word}([^a-z]|$)`).test(t)) return n
  const d = /(?<!\d)(\d{1,2})(?!\d)/.exec(t)
  return d ? Number(d[1]) : null
}

/**
 * Fandom pages are full of in-game / in-show screenshots. When the plot text
 * came from elsewhere, lend each chapter the screenshot whose caption names
 * someone in it, else one from the same point in the story.
 */
function lendImages(nodes: StoryNode[], pool: StoryImage[]): StoryNode[] {
  if (!pool.length) return nodes
  const used = new Set<string>()
  return nodes.map((n, i) => {
    if (n.images?.length) return n
    const names = properNouns(n.text ?? n.summary, 5).map(fold)
    const at = (i + 0.5) / nodes.length
    // Among screenshots naming someone here, take the one nearest this point in the story.
    const match = pool
      .map((img, k) => ({ img, dist: Math.abs((k + 0.5) / pool.length - at) }))
      .filter(({ img }) => !used.has(img.url) && names.some((name) => fold(img.caption).includes(name)))
      .sort((a, b) => a.dist - b.dist)[0]?.img
    const pick = match ?? pool[Math.floor(at * pool.length)]
    if (!pick || used.has(pick.url)) return n
    used.add(pick.url)
    return { ...n, images: [pick] }
  })
}

/**
 * TVMaze's episode list with the much longer Wikipedia synopses in place of
 * its one-line blurbs — or, without TVMaze, a show built from the synopses.
 */
function withSynopses(tv: TvShow | null, seasons: SeasonSynopses[]): TvShow | null {
  if (!seasons.length) return tv
  if (!tv) {
    return {
      id: 0,
      name: '',
      url: seasons[0].url,
      genres: [],
      summary: '',
      seasons: seasons.map((s) => ({ number: s.number, name: '', summary: '', url: s.url })),
      episodes: seasons.flatMap((s) =>
        s.episodes.map((e, i) => ({ id: `wp-${s.number}-${i + 1}`, season: s.number, number: i + 1, title: e.title, summary: e.summary, url: s.url }))
      ),
      cast: []
    }
  }
  const bySeason = new Map(seasons.map((s) => [s.number, s]))
  const replaced = new Map<string, { title: string; summary: string }>()
  for (const season of tv.seasons) {
    const syn = bySeason.get(season.number)
    if (!syn) continue
    const regular = tv.episodes.filter((e) => e.season === season.number && e.number !== null).sort((a, b) => a.number! - b.number!)
    // Pair by title first; if that finds too few (translated titles), by
    // position when the lists are nearly the same length (lists often add OVAs).
    const key = (t: string): string => tokenize(t).join(' ')
    let pairs = regular.map((e) => syn.episodes.find((s) => key(s.title) === key(e.title)))
    const byTitle = pairs.filter(Boolean).length
    const close = Math.abs(regular.length - syn.episodes.length) <= Math.max(1, Math.round(regular.length * 0.1))
    if (byTitle < regular.length / 2 && close) pairs = regular.map((_, i) => syn.episodes[i])
    regular.forEach((e, i) => {
      const match = pairs[i]
      if (match && wordCount(match.summary) > wordCount(e.summary)) {
        replaced.set(e.id, { title: syn.lang === 'en' ? e.title : match.title || e.title, summary: match.summary })
      }
    })
  }
  return { ...tv, episodes: tv.episodes.map((e) => (replaced.has(e.id) ? { ...e, ...replaced.get(e.id)! } : e)) }
}

/** The language most of the synopses are in. */
function synopsesLang(seasons: SeasonSynopses[]): string | undefined {
  const count = new Map<string, number>()
  for (const s of seasons) count.set(s.lang, (count.get(s.lang) ?? 0) + s.episodes.length)
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
}

/** Give season chapters of a wiki plot their TVMaze episode lists. */
function attachEpisodes(nodes: StoryNode[], tv: TvShow): StoryNode[] {
  const done = new Set<number>()
  return nodes.map((n) => {
    const season = seasonNumber(n.title)
    // A season split in several chapters lists its episodes once, on the first.
    if (!season || done.has(season)) return n
    const eps = tv.episodes.filter((e) => e.season === season)
    if (!eps.length) return n
    done.add(season)
    return { ...n, kind: 'season' as const, episodes: eps }
  })
}

// ---------------------------------------------------------------------------
// Metadata

function relatedFrom(c: Collected): RelatedWork[] {
  const out: RelatedWork[] = []
  const seen = new Set<string>([fold(c.title)])
  const push = (r: RelatedWork): void => {
    const k = fold(r.title)
    if (!r.title || seen.has(k)) return
    seen.add(k)
    out.push(r)
  }
  const fromWd = (refs: WdRef[] | undefined, relation: RelatedWork['relation']): void =>
    refs?.forEach((r) =>
      push({ title: r.label, relation, qid: r.qid, wikiTitle: r.wikiTitle, lang: r.wikiLang, note: r.description })
    )
  fromWd(c.wd?.follows, 'prequel')
  fromWd(c.wd?.followedBy, 'sequel')
  fromWd(c.wd?.series, 'series')
  fromWd(c.wd?.basedOn, 'source')
  fromWd(c.wd?.derivatives, 'adaptation')
  c.ani?.relations.forEach((r) => push({ title: r.title, relation: r.relation, image: r.cover, note: r.format }))
  return out.slice(0, 16)
}

function charactersFrom(c: Collected): Character[] {
  if (c.ani && c.ani.characters.length >= 3) return c.ani.characters
  if (c.tv && c.tv.cast.length >= 3) return c.tv.cast
  if (c.wd?.characters.length) return c.wd.characters
  return c.wd?.cast ?? c.tv?.cast ?? c.ani?.characters ?? []
}

function metaFrom(c: Collected): WorkMeta {
  const creators = [...(c.wd?.creators ?? [])]
  if (c.ani?.studios.length && !creators.some((x) => x.role === 'studio')) creators.push({ role: 'studio', names: c.ani.studios })
  if (c.tv?.network && !creators.some((x) => x.role === 'network')) creators.push({ role: 'network', names: [c.tv.network] })
  return {
    qid: c.wd?.qid,
    year: c.wd?.year ?? (c.ani?.year ? String(c.ani.year) : undefined) ?? c.tv?.premiered?.slice(0, 4),
    creators,
    genres: c.wd?.genres.length ? c.wd.genres : (c.ani?.genres ?? c.tv?.genres ?? []),
    poster: c.page?.thumbnail ?? c.enPage?.thumbnail ?? c.ani?.cover ?? c.tv?.image ?? c.wd?.image,
    banner: c.ani?.banner,
    score: c.ani?.score ?? c.tv?.rating,
    episodes: c.ani?.episodes ?? (c.tv?.episodes.length || undefined),
    wikiUrl: c.page?.url ?? c.enPage?.url
  }
}

function sourcesFrom(c: Collected, used: string): SourceRef[] {
  const out: SourceRef[] = []
  if (c.page) out.push({ name: `Wikipedia (${c.page.lang})`, url: c.page.url, license: 'CC BY-SA 4.0' })
  if (c.enPage && used === 'wikipedia:en') out.push({ name: 'Wikipedia (en)', url: c.enPage.url, license: 'CC BY-SA 4.0' })
  if (c.fandom) out.push({ name: 'Fandom', url: c.fandom.url, license: 'CC BY-SA 3.0' })
  if (c.seasons.length) {
    const langs = [...new Set(c.seasons.map((s) => s.lang))].join(', ')
    out.push({ name: `Wikipedia (${langs}) — seasons`, url: c.seasons[0].url, license: 'CC BY-SA 4.0' })
  }
  if (c.tv) out.push({ name: 'TVMaze', url: c.tv.url, license: 'CC BY-SA 4.0' })
  if (c.ani) out.push({ name: 'AniList', url: c.ani.url })
  if (c.wd) out.push({ name: 'Wikidata', url: `https://www.wikidata.org/wiki/${c.wd.qid}`, license: 'CC0' })
  return out
}

function loglineFrom(c: Collected): string {
  const lead = c.page?.lead || c.enPage?.lead || c.ani?.description || c.tv?.summary || ''
  const sentences = splitSentences(splitParagraphs(lead)[0] ?? '')
  return truncate(sentences.slice(0, 2).join(' '), 360)
}

// ---------------------------------------------------------------------------

interface Candidate extends PlotSourceOption {
  build: () => StoryNode[]
  /** the plot is split by season ("Season 2", "Segunda temporada") */
  seasonParts?: boolean
}

/** Build a complete story from collected sources — no AI involved. */
export function outlineFromCollected(c: Collected, q: StoryQuery, engine: Engine = 'sources'): StoryOutline {
  const cands: Candidate[] = []
  for (const page of [c.page, c.enPage]) {
    if (!page) continue
    const plot = wiki.findPlot(page)
    if (!plot) continue
    const L = labelsFor(page.lang)
    cands.push({
      id: `wikipedia:${page.lang}`,
      label: `Wikipedia (${page.lang.toUpperCase()})`,
      lang: page.lang,
      words: plot.words,
      seasonParts: plot.parts.filter((p) => seasonNumber(p.title)).length >= 2,
      build: () => nodesFromChunks(chunksFromParts(plot.intro, plot.parts, L))
    })
  }
  if (c.fandom) {
    const f = c.fandom
    cands.push({
      id: 'fandom',
      label: 'Fandom',
      lang: f.lang,
      words: f.words,
      build: () => nodesFromChunks(chunksFromParts(f.intro, f.parts, labelsFor(f.lang), f.introImages))
    })
  }
  const show = withSynopses(c.tv, c.seasons)
  if (show?.episodes.length) {
    const premisePlot = c.page ? wiki.findPlot(c.page) : null
    const premise = premisePlot && premisePlot.words < 700 ? [premisePlot.intro, ...premisePlot.parts.map((p) => p.text)].join('\n') : show.summary
    cands.push({
      id: 'tvmaze',
      label: c.seasons.length ? (c.tv ? 'TVMaze + Wikipedia' : 'Wikipedia') : 'TVMaze',
      // The words counted are the episodes': TVMaze's are English unless season
      // synopses replaced them. (A local premise doesn't make the plot local.)
      lang: synopsesLang(c.seasons) ?? 'en',
      words: show.episodes.reduce((n, e) => n + wordCount(e.summary), 0),
      build: () => nodesFromTv(show, premise, labelsFor(c.pref))
    })
  }

  // The fullest telling wins. Text in the reader's language gets a head start
  // (a big one in "prefer my language" mode), and for series the season →
  // episode structure is worth a little extra.
  const complete = getSettings().storyDetail !== 'local'
  // A series plot split by season also carries each season's episode list.
  const showWords = show ? show.episodes.reduce((n, e) => n + wordCount(e.summary), 0) : 0
  const effective = (x: Candidate): number =>
    x.words + (c.kind.series && x.id !== 'tvmaze' && x.seasonParts ? showWords : 0)
  const weight = (x: Candidate): number =>
    effective(x) * (x.lang === c.pref ? 1.3 : 1) * (x.id === 'tvmaze' && c.kind.series ? 1.5 : 1)
  const byWeight = [...cands].sort((a, b) => weight(b) - weight(a))
  // "Prefer my language": any real plot in it wins; the fullest otherwise.
  const localFirst = complete ? undefined : byWeight.find((x) => x.lang === c.pref && x.words >= 250)
  const chosen = cands.find((x) => x.id === q.plotSource) ?? localFirst ?? byWeight[0]

  let nodes: StoryNode[]
  let notice: OutlineNotice | undefined
  let lang = c.pref
  if (chosen) {
    nodes = chosen.build()
    if (chosen.id !== 'tvmaze' && show) nodes = attachEpisodes(nodes, show)
    if (chosen.id !== 'fandom' && c.fandom) {
      nodes = lendImages(nodes, [...c.fandom.introImages, ...c.fandom.parts.flatMap((p) => p.images)])
    }
    lang = chosen.lang
    if (chosen.lang !== c.pref) notice = { kind: 'lang', lang: chosen.lang }
    if (chosen.words < 120) notice = { kind: 'thin' }
  } else {
    // No plot anywhere: still give the reader the overview we have.
    const lead = c.page?.lead || c.enPage?.lead || c.ani?.description || c.tv?.summary || ''
    if (wordCount(lead) < 20) throw new AppError('NO_PLOT', c.title)
    const L = labelsFor(c.pref)
    nodes = nodesFromChunks([{ title: L.overview, text: splitParagraphs(lead).join('\n\n') }], 'section')
    lang = c.page?.lang ?? 'en'
    notice = { kind: 'thin' }
  }

  const identity = c.wd?.qid ?? fold(c.title)
  return {
    id: storyId(c.title, identity, engine),
    query: { ...q, qid: c.wd?.qid ?? q.qid, plotSource: undefined },
    title: c.title,
    mediaType: c.wd?.types[0] ?? c.page?.description ?? c.kind.kind,
    logline: loglineFrom(c),
    nodes,
    engine,
    lang,
    meta: metaFrom(c),
    characters: charactersFrom(c),
    related: relatedFrom(c),
    sources: sourcesFrom(c, chosen?.id ?? ''),
    alternatives: c.alternatives
      .filter(
        (a) =>
          a.qid !== c.wd?.qid &&
          a.title !== c.page?.title &&
          wiki.isWorkish(a.description) &&
          // must share a word with what was searched, or it's just noise
          tokenize(a.title).some((t) => tokenize(`${q.text} ${c.title}`).includes(t))
      )
      .slice(0, 6),
    plotSources: cands.map(({ build: _b, ...opt }) => opt),
    plotSource: chosen?.id,
    notice,
    createdAt: Date.now()
  }
}

export async function outlineFromSources(q: StoryQuery, progress: Progress): Promise<StoryOutline> {
  const c = await collect(q, progress)
  progress('chapters')
  const outline = outlineFromCollected(c, q)
  if (!getSettings().autoTranslate || outline.lang === c.pref) return outline

  // The fullest telling is in another language: machine-translate it. If the
  // service is unreachable, keep the original and its "found in English" notice.
  progress('translate')
  const loglineLang = c.page?.lead ? c.page.lang : 'en'
  return translateOutline(outline, c.pref, loglineLang).catch(() => outline)
}

/** Chapter detail for a sources-built node: the scraped text plus images and key moments. */
export async function detailFromSources(outline: StoryOutline, node: StoryNode): Promise<NodeDetail> {
  const body = node.text?.trim() || node.summary
  const episodeStills: StoryImage[] = (node.episodes ?? [])
    .filter((e) => e.image)
    .slice(0, 3)
    .map((e) => ({ url: e.image!, caption: e.title, source: e.url }))
  const seed = [...(node.images ?? []), ...episodeStills]
  // Look names up as the source wrote them: a translated "Império do Homem"
  // finds the Roman Empire, the original "Imperium of Man" finds the faction.
  const original = outline.translation?.nodes[node.id]
  const nameText = original ? original.text?.trim() || original.summary : body
  const nameLang = outline.translation?.from ?? outline.lang
  const images =
    seed.length >= 3
      ? seed.slice(0, 4)
      : await resolveImages(properNouns(nameText, 5), outline.title, {
          langs: [nameLang, 'en'],
          qid: outline.meta.qid,
          slot: outline.nodes.indexOf(node),
          seed,
          max: 4,
          exclude: [outline.meta.poster]
        })
  return {
    id: node.id,
    title: node.title,
    body,
    // A season chapter's story is in its episodes: recap those.
    beats:
      wordCount(body) < 80 && node.episodes?.length
        ? keySentences(node.episodes.map((e) => e.summary).join('\n'), 5)
        : keySentences(body, 4),
    images,
    episodes: node.episodes,
    engine: 'sources'
  }
}
