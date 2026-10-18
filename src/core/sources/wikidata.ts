import { getJson, qs } from '../http'
import type { Character, CreatorRole } from '../../shared/types'

const WD = 'https://www.wikidata.org/w/api.php'

interface Snak {
  datavalue?: { value: unknown }
}
interface Claim {
  rank?: string
  mainsnak: Snak
  qualifiers?: Record<string, Snak[]>
}
interface Entity {
  id: string
  missing?: string
  labels?: Record<string, { value: string }>
  descriptions?: Record<string, { value: string }>
  claims?: Record<string, Claim[]>
  sitelinks?: Record<string, { title: string }>
}

export interface WdRef {
  qid: string
  label: string
  description?: string
  wikiTitle?: string
  wikiLang?: string
}

export interface WdWork {
  qid: string
  label?: string
  labelEn?: string
  description?: string
  /** wiki language code → article title */
  sitelinks: Record<string, string>
  typesEn: string[]
  types: string[]
  year?: string
  genres: string[]
  creators: { role: CreatorRole; names: string[] }[]
  follows: WdRef[]
  followedBy: WdRef[]
  series: WdRef[]
  basedOn: WdRef[]
  derivatives: WdRef[]
  characters: Character[]
  cast: Character[]
  fandom: string[]
  tvmazeId?: string
  imdb?: string
  anilistAnime?: number
  anilistManga?: number
  image?: string
}

function pick(map: Record<string, { value: string }> | undefined, lang: string): string | undefined {
  if (!map) return undefined
  return map[lang]?.value ?? map.mul?.value ?? map.en?.value ?? Object.values(map)[0]?.value
}

function claims(e: Entity, prop: string): Claim[] {
  return (e.claims?.[prop] ?? []).filter((c) => c.rank !== 'deprecated' && c.mainsnak.datavalue)
}

function itemIds(e: Entity, prop: string, max = 12): string[] {
  return claims(e, prop)
    .map((c) => (c.mainsnak.datavalue!.value as { id?: string }).id)
    .filter((x): x is string => !!x)
    .slice(0, max)
}

function strings(e: Entity, prop: string): string[] {
  return claims(e, prop)
    .map((c) => c.mainsnak.datavalue!.value)
    .filter((v): v is string => typeof v === 'string')
}

function earliestYear(e: Entity, props: string[]): string | undefined {
  const years = props
    .flatMap((p) => claims(e, p))
    .map((c) => (c.mainsnak.datavalue!.value as { time?: string }).time)
    .map((t) => (t ? /^[+-]?(\d{1,4})/.exec(t)?.[1] : undefined))
    .filter((y): y is string => !!y)
    .map(Number)
  return years.length ? String(Math.min(...years)) : undefined
}

export function commonsFile(file: string, width = 480): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, '_'))}?width=${width}`
}

const pageLink = (lang: string, title: string): string =>
  `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`

async function pageThumbs(lang: string, titles: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (let i = 0; i < titles.length; i += 50) {
    const d = await getJson<{
      query?: {
        pages?: { title: string; thumbnail?: { source: string } }[]
        normalized?: { from: string; to: string }[]
        redirects?: { from: string; to: string }[]
      }
    }>(
      `https://${lang}.wikipedia.org/w/api.php?${qs({
        action: 'query',
        format: 'json',
        formatversion: 2,
        titles: titles.slice(i, i + 50).join('|'),
        prop: 'pageimages',
        piprop: 'thumbnail',
        pithumbsize: 240,
        redirects: 1
      })}`
    ).catch(() => null)
    const alias = new Map<string, string>()
    for (const r of [...(d?.query?.normalized ?? []), ...(d?.query?.redirects ?? [])]) alias.set(r.to, r.from)
    for (const p of d?.query?.pages ?? []) {
      if (!p.thumbnail?.source || /\.svg/i.test(p.thumbnail.source)) continue
      out.set(p.title, p.thumbnail.source)
      let from = alias.get(p.title)
      while (from) {
        out.set(from, p.thumbnail.source)
        from = alias.get(from)
      }
    }
  }
  return out
}

async function fillFromArticles(chars: Character[], titles: { local?: string; en?: string }[], lang: string): Promise<void> {
  const missing = chars.map((c, i) => ({ c, t: titles[i] })).filter(({ c, t }) => !c.image && (t.local || t.en))
  if (!missing.length) return
  const localTitles = missing.map((m) => m.t.local).filter((x): x is string => !!x)
  // English too for characters whose local article has no picture.
  const enTitles = missing.map((m) => m.t.en).filter((x): x is string => !!x)
  const [local, en] = await Promise.all([
    localTitles.length && lang !== 'en' ? pageThumbs(lang, localTitles) : Promise.resolve(new Map<string, string>()),
    pageThumbs('en', [...new Set([...enTitles, ...(lang === 'en' ? localTitles : [])])])
  ])
  for (const { c, t } of missing) c.image = (t.local && (local.get(t.local) ?? en.get(t.local))) || (t.en && en.get(t.en)) || undefined
}

async function entities(
  ids: string[],
  props: string,
  languages: string,
  sitefilter?: string
): Promise<Record<string, Entity>> {
  const unique = [...new Set(ids)]
  const out: Record<string, Entity> = {}
  const chunks: string[][] = []
  for (let i = 0; i < unique.length; i += 50) chunks.push(unique.slice(i, i + 50))
  const results = await Promise.all(
    chunks.map((chunk) =>
      getJson<{ entities?: Record<string, Entity> }>(
        `${WD}?${qs({
          action: 'wbgetentities',
          format: 'json',
          ids: chunk.join('|'),
          props,
          languages,
          languagefallback: 1,
          sitefilter
        })}`
      ).catch(() => null)
    )
  )
  for (const r of results) Object.assign(out, r?.entities ?? {})
  return out
}

const CREATOR_PROPS: [CreatorRole, string][] = [
  ['director', 'P57'],
  ['author', 'P50'],
  ['creator', 'P170'],
  ['developer', 'P178'],
  ['studio', 'P272'],
  ['publisher', 'P123'],
  ['network', 'P449'],
  ['composer', 'P86']
]

/**
 * One work, fully resolved: type, year, creators, genres, franchise links,
 * characters/cast, and external ids that pin down TVMaze/AniList/Fandom
 * matches exactly (no fuzzy search needed when these exist).
 */
export async function getWork(qid: string, lang: string): Promise<WdWork | null> {
  const languages = [...new Set([lang, 'en', 'mul'])].join('|')
  const sites = [...new Set([`${lang}wiki`, 'enwiki'])].join('|')
  const main = (await entities([qid], 'labels|descriptions|claims|sitelinks', languages, sites))[qid]
  if (!main || main.missing !== undefined) return null

  const sitelinks: Record<string, string> = {}
  for (const [site, v] of Object.entries(main.sitelinks ?? {})) {
    const m = /^([a-z_]+)wiki$/.exec(site)
    if (m) sitelinks[m[1].replace(/_/g, '-')] = v.title
  }

  const typeIds = itemIds(main, 'P31', 4)
  const genreIds = itemIds(main, 'P136', 5)
  const creatorIds = CREATOR_PROPS.map(([role, p]) => ({ role, ids: itemIds(main, p, 4) }))
  const follows = itemIds(main, 'P155', 3)
  const followedBy = itemIds(main, 'P156', 3)
  const series = itemIds(main, 'P179', 2)
  const basedOn = itemIds(main, 'P144', 2)
  const derivatives = itemIds(main, 'P4969', 4)
  const charIds = itemIds(main, 'P674', 24)
  const castClaims = claims(main, 'P161').slice(0, 16)
  const cast = castClaims.map((c) => ({
    actor: (c.mainsnak.datavalue!.value as { id?: string }).id,
    role: (c.qualifiers?.P453?.[0]?.datavalue?.value as { id?: string } | undefined)?.id
  }))

  const refIds = [
    ...typeIds,
    ...genreIds,
    ...creatorIds.flatMap((c) => c.ids),
    ...follows,
    ...followedBy,
    ...series,
    ...basedOn,
    ...derivatives,
    ...cast.flatMap((c) => [c.actor, c.role]).filter((x): x is string => !!x)
  ]

  const [refs, chars] = await Promise.all([
    entities(refIds, 'labels|descriptions|sitelinks', languages, sites),
    charIds.length
      ? entities(charIds, 'labels|descriptions|claims|sitelinks', languages, sites)
      : Promise.resolve({} as Record<string, Entity>)
  ])

  const lbl = (id: string): string | undefined => pick(refs[id]?.labels, lang)
  const ref = (id: string): WdRef | null => {
    const e = refs[id]
    const label = pick(e?.labels, lang)
    if (!e || !label) return null
    const local = e.sitelinks?.[`${lang}wiki`]?.title
    const en = e.sitelinks?.enwiki?.title
    return {
      qid: id,
      label,
      description: pick(e.descriptions, lang),
      wikiTitle: local ?? en,
      wikiLang: local ? lang : en ? 'en' : undefined
    }
  }
  const refs2 = (ids: string[]): WdRef[] => ids.map(ref).filter((r): r is WdRef => !!r)

  const charEntities = charIds.map((id) => chars[id]).filter((e): e is Entity => !!e && !!pick(e.labels, lang))
  const characters: Character[] = charEntities.map((e) => {
    const file = strings(e, 'P18')[0]
    const local = e.sitelinks?.[`${lang}wiki`]?.title
    const en = e.sitelinks?.enwiki?.title
    return {
      name: pick(e.labels, lang)!,
      description: pick(e.descriptions, lang),
      image: file ? commonsFile(file, 240) : undefined,
      url: local ? pageLink(lang, local) : en ? pageLink('en', en) : undefined
    }
  })
  // Fictional characters rarely have a free image on Wikidata, but their
  // Wikipedia articles usually show one: fetch those in one batch per wiki.
  await fillFromArticles(
    characters,
    charEntities.map((e) => ({
      local: e.sitelinks?.[`${lang}wiki`]?.title,
      en: e.sitelinks?.enwiki?.title
    })),
    lang
  )

  const castOut: Character[] = cast
    .map((c) => ({ actor: c.actor ? lbl(c.actor) : undefined, role: c.role ? lbl(c.role) : undefined }))
    .filter((c) => c.actor || c.role)
    .map((c) => ({ name: c.role ?? c.actor!, actor: c.role ? c.actor : undefined }))

  const image = strings(main, 'P18')[0]
  const num = (p: string): number | undefined => {
    const v = strings(main, p)[0]
    return v && /^\d+$/.test(v) ? Number(v) : undefined
  }

  return {
    qid,
    label: pick(main.labels, lang),
    labelEn: main.labels?.en?.value ?? main.labels?.mul?.value,
    description: pick(main.descriptions, lang),
    sitelinks,
    typesEn: typeIds.map((id) => refs[id]?.labels?.en?.value ?? refs[id]?.labels?.mul?.value ?? '').filter(Boolean),
    types: typeIds.map(lbl).filter((x): x is string => !!x),
    year: earliestYear(main, ['P577', 'P580']),
    genres: genreIds.map(lbl).filter((x): x is string => !!x),
    creators: creatorIds
      .map(({ role, ids }) => ({ role, names: ids.map(lbl).filter((x): x is string => !!x) }))
      .filter((c) => c.names.length),
    follows: refs2(follows),
    followedBy: refs2(followedBy),
    series: refs2(series),
    basedOn: refs2(basedOn),
    derivatives: refs2(derivatives),
    characters,
    cast: castOut,
    fandom: strings(main, 'P6262'),
    tvmazeId: strings(main, 'P8600')[0],
    imdb: strings(main, 'P345')[0],
    anilistAnime: num('P8729'),
    anilistManga: num('P8731'),
    image: image ? commonsFile(image, 600) : undefined
  }
}

export interface MediaKind {
  kind: 'film' | 'series' | 'game' | 'book' | 'manga' | 'comic' | 'anime' | 'other'
  anime: boolean
  manga: boolean
  series: boolean
}

/** Classify a work from its Wikidata types (English) or wiki description. */
export function classify(typesEn: string[], description = ''): MediaKind {
  const s = `${typesEn.join(' | ')} | ${description}`.toLowerCase()
  const anime = /anime/.test(s)
  const manga = /manga|mangá|manhwa|manhua/.test(s)
  const series =
    /(television series|tv series|web series|television program|television show|miniseries|original net animation|animated series|sitcom|soap opera|série de televisão|série televisiva|telessérie|seriado|série animada|serie de televisión|série télévisée)/.test(
      s
    )
  const game = /video game|videogame|jogo eletrônico|videojogo|videojuego|jeu vidéo|\bgame\b/.test(s)
  const film = /\bfilm\b|filme|película|movie/.test(s)
  const comic = /comic|graphic novel|webtoon|quadrinhos|banda desenhada|historieta|bande dessinée/.test(s)
  const book = /novel|book|literary work|novella|short story|written work|romance|livro|obra literária|novela|libro|roman|\bplay\b|peça/.test(s)
  const kind: MediaKind['kind'] = series
    ? 'series'
    : game
      ? 'game'
      : film
        ? 'film'
        : manga
          ? 'manga'
          : comic
            ? 'comic'
            : book
              ? 'book'
              : anime
                ? 'anime'
                : 'other'
  return { kind, anime, manga, series }
}
