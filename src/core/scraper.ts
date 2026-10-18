import { getSettings, contentLang } from './config'
import { AppError } from './errors'
import { storyId } from './ids'
import { labelsFor, type Labels } from './labels'
import { resolveImages } from './images'
import * as wiki from './sources/wikipedia'
import { getWork, classify, type WdWork, type WdRef, type MediaKind } from './sources/wikidata'
import { getShow, type TvShow } from './sources/tvmaze'
import { getMedia, type AniMedia } from './sources/anilist'
import { getFandomPlot, guessFandom, pickFandom, type FandomPlot } from './sources/fandom'
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

  // English fallback when the local article has little or no plot.
  let enPage: wiki.WikiPage | null = null
  const localPlot = page ? wiki.findPlot(page) : null
  if (src.wikipedia && page && page.lang !== 'en' && (!localPlot || localPlot.words < 250)) {
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

  const [tv, ani, fandomById] = await Promise.all([
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
    fandomRef ? getFandomPlot(fandomRef).catch(() => null) : Promise.resolve(null)
  ])

  let fandom = fandomById
  const bestWikiWords = Math.max(localPlot?.words ?? 0, enPage ? (wiki.findPlot(enPage)?.words ?? 0) : 0)
  if (!fandom && src.fandom && (!kind.series || kind.anime) && (page || wd) && bestWikiWords < 300) {
    fandom = await guessFandom(enTitle).catch(() => null)
  }

  if (!page && !wd && !tv && !ani && !fandom) throw new AppError('NOT_FOUND', q.text)

  // The article title beats the Wikidata label, which is sometimes an acronym ("FMAB").
  const title = page
    ? stripParens(page.title)
    : wd?.label && wd.label !== wd.qid
      ? wd.label
      : (tv?.name ?? ani?.title ?? q.text)

  return { pref, page, enPage, wd, kind, tv, ani, fandom, alternatives, title }
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

function chunksFromParts(intro: string, parts: { title: string; text: string; images?: StoryImage[] }[], L: Labels, introImages: StoryImage[] = []): Chunk[] {
  const chunks: Chunk[] = []
  const usable = parts.filter((p) => wordCount(p.text) >= 15)

  if (usable.length >= 2) {
    if (wordCount(intro) >= 40) chunks.push({ title: L.prologue, text: splitParagraphs(intro).join('\n\n'), images: introImages })
    for (const p of usable) {
      const words = wordCount(p.text)
      const paras = splitParagraphs(p.text)
      if (words > 650) {
        // Long section: split it, naming each piece by who/where it is about.
        const sub = segmentParagraphs(paras, Math.ceil(words / 350), 350)
        sub.forEach((t, i) =>
          chunks.push({
            title: `${p.title} · ${deriveTitle(t, sub, `${i + 1}/${sub.length}`)}`,
            text: t,
            images: i === 0 ? p.images : [],
            continues: i > 0
          })
        )
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
  const segs = segmentParagraphs(splitParagraphs(all))
  const images = [...introImages, ...parts.flatMap((p) => p.images ?? [])]
  segs.forEach((t, i) =>
    chunks.push({
      title: deriveTitle(t, segs, `${L.part} ${i + 1}`),
      text: t,
      images: images[i] ? [images[i]] : []
    })
  )
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
    const seasonTitle = named ? `${L.season} ${season.number}: ${season.name}` : `${L.season} ${season.number}`
    const image = season.image
      ? [{ url: season.image, caption: `${tv.name} — ${L.season} ${season.number}`, source: season.url }]
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
        title: blocks > 1 ? `${seasonTitle} · ${L.episodesCap} ${range}` : seasonTitle,
        summary:
          blocks > 1 && lead
            ? truncate(`${lead.title}: ${lead.summary}`, 200)
            : season.summary
              ? truncate(season.summary, 200)
              : `${part.length} ${L.episodes}${years.length ? ` · ${years.join('–')}` : ''}`,
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
  if (c.tv?.episodes.length) {
    const tv = c.tv
    const premisePlot = c.page ? wiki.findPlot(c.page) : null
    const premise = premisePlot && premisePlot.words < 700 ? [premisePlot.intro, ...premisePlot.parts.map((p) => p.text)].join('\n') : tv.summary
    const premiseLang = premisePlot && premisePlot.words < 700 ? c.page!.lang : 'en'
    cands.push({
      id: 'tvmaze',
      label: 'TVMaze',
      lang: premiseLang,
      words: tv.episodes.reduce((n, e) => n + wordCount(e.summary), 0),
      build: () => nodesFromTv(tv, premise, labelsFor(c.pref))
    })
  }

  let chosen = cands.find((x) => x.id === q.plotSource)
  if (!chosen) {
    const tvCand = cands.find((x) => x.id === 'tvmaze')
    const narrative = cands.filter((x) => x.id !== 'tvmaze').sort((a, b) => b.words - a.words)
    const local = narrative.find((x) => x.lang === c.pref)
    const biggest = narrative[0]
    // Series: a substantial plot in the reader's language beats English
    // episode blurbs (episodes still get attached to its seasons below).
    if (c.kind.series && tvCand) chosen = local && local.words >= 600 ? local : tvCand
    else if (local && (local.words >= 250 || local.words >= (biggest?.words ?? 0) * 0.6)) chosen = local
    else chosen = biggest ?? tvCand
  }

  let nodes: StoryNode[]
  let notice: OutlineNotice | undefined
  let lang = c.pref
  if (chosen) {
    nodes = chosen.build()
    if (chosen.id !== 'tvmaze' && c.tv) nodes = attachEpisodes(nodes, c.tv)
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
  return outlineFromCollected(c, q)
}

/** Chapter detail for a sources-built node: the scraped text plus images and key moments. */
export async function detailFromSources(outline: StoryOutline, node: StoryNode): Promise<NodeDetail> {
  const body = node.text?.trim() || node.summary
  const episodeStills: StoryImage[] = (node.episodes ?? [])
    .filter((e) => e.image)
    .slice(0, 3)
    .map((e) => ({ url: e.image!, caption: e.title, source: e.url }))
  const seed = [...(node.images ?? []), ...episodeStills]
  const images =
    seed.length >= 3
      ? seed.slice(0, 4)
      : await resolveImages(properNouns(body, 3), outline.title, {
          langs: [outline.lang, 'en'],
          seed,
          max: 4,
          exclude: [outline.meta.poster]
        })
  return {
    id: node.id,
    title: node.title,
    body,
    beats: keySentences(body, 4),
    images,
    episodes: node.episodes,
    engine: 'sources'
  }
}
