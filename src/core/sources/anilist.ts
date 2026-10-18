import { getJson } from '../http'
import { stripTags } from './html'
import { truncate } from '../../shared/text'
import type { Character, RelationKind } from '../../shared/types'

const ENDPOINT = 'https://graphql.anilist.co'

export interface AniRelation {
  relation: RelationKind
  title: string
  format?: string
  cover?: string
  url: string
}

export interface AniMedia {
  id: number
  type: 'ANIME' | 'MANGA'
  title: string
  description: string
  format?: string
  episodes?: number
  chapters?: number
  genres: string[]
  score?: number
  year?: number
  cover?: string
  banner?: string
  url: string
  studios: string[]
  characters: Character[]
  relations: AniRelation[]
}

const QUERY = `query ($id: Int, $s: String, $t: MediaType) {
  Media(id: $id, search: $s, type: $t) {
    id type format episodes chapters genres averageScore siteUrl bannerImage
    title { romaji english }
    description(asHtml: false)
    startDate { year }
    coverImage { large }
    studios(isMain: true) { nodes { name } }
    characters(sort: [ROLE, RELEVANCE], perPage: 18) {
      edges {
        role
        voiceActors(language: JAPANESE) { name { full } }
        node { name { full } image { medium } description siteUrl }
      }
    }
    relations {
      edges {
        relationType
        node { type format siteUrl title { romaji english } coverImage { medium } }
      }
    }
  }
}`

const REL: Record<string, RelationKind> = {
  PREQUEL: 'prequel',
  SEQUEL: 'sequel',
  SOURCE: 'source',
  ADAPTATION: 'adaptation',
  SIDE_STORY: 'spinoff',
  SPIN_OFF: 'spinoff',
  PARENT: 'series'
}

/** AniList markdown → plain text, minus spoiler blocks and "__Height:__ …" stat lines. */
function cleanDescription(md: string | null | undefined, max = 240): string {
  if (!md) return ''
  const text = stripTags(
    md
      .replace(/~!([\s\S]*?)!~/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^\s*__[^_\n]+:__.*$/gm, '')
      .replace(/__|\*\*/g, '')
      .replace(/\(Source:[^)]*\)/gi, '')
  )
  return truncate(text.replace(/\n+/g, ' ').trim(), max)
}

interface Raw {
  data?: {
    Media?: {
      id: number
      type: 'ANIME' | 'MANGA'
      format?: string
      episodes?: number
      chapters?: number
      genres?: string[]
      averageScore?: number
      siteUrl: string
      bannerImage?: string
      title: { romaji?: string; english?: string }
      description?: string
      startDate?: { year?: number }
      coverImage?: { large?: string }
      studios?: { nodes: { name: string }[] }
      characters?: {
        edges: {
          role: string
          voiceActors?: { name: { full: string } }[]
          node: { name: { full: string }; image?: { medium?: string }; description?: string; siteUrl?: string }
        }[]
      }
      relations?: {
        edges: {
          relationType: string
          node: { type: string; format?: string; siteUrl: string; title: { romaji?: string; english?: string }; coverImage?: { medium?: string } }
        }[]
      }
    } | null
  }
}

export async function getMedia(opts: { id?: number; search?: string; type: 'ANIME' | 'MANGA' }): Promise<AniMedia | null> {
  const d = await getJson<Raw>(ENDPOINT, {
    method: 'POST',
    body: { query: QUERY, variables: { id: opts.id, s: opts.id ? undefined : opts.search, t: opts.type } },
    allow404: true
  })
  const m = d?.data?.Media
  if (!m) return null
  return {
    id: m.id,
    type: m.type,
    title: m.title.english ?? m.title.romaji ?? '',
    description: cleanDescription(m.description, 1200),
    format: m.format,
    episodes: m.episodes,
    chapters: m.chapters,
    genres: m.genres ?? [],
    score: m.averageScore ? m.averageScore / 10 : undefined,
    year: m.startDate?.year,
    cover: m.coverImage?.large,
    banner: m.bannerImage,
    url: m.siteUrl,
    studios: m.studios?.nodes.map((s) => s.name) ?? [],
    characters: (m.characters?.edges ?? []).map((e) => ({
      name: e.node.name.full,
      description: cleanDescription(e.node.description) || undefined,
      image: e.node.image?.medium,
      role: e.role,
      actor: e.voiceActors?.[0]?.name.full,
      url: e.node.siteUrl
    })),
    relations: (m.relations?.edges ?? [])
      .filter((e) => REL[e.relationType])
      .map((e) => ({
        relation: REL[e.relationType],
        title: e.node.title.english ?? e.node.title.romaji ?? '',
        format: e.node.format,
        cover: e.node.coverImage?.medium,
        url: e.node.siteUrl
      }))
  }
}
