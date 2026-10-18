import { getSettings, aiReady, contentLang } from './config'
import { AppError, describeError } from './errors'
import { storyId } from './ids'
import { resolveImages } from './images'
import { aiAnswer, aiNodeDetail, aiOutline, type Grounding } from './ai'
import { localAnswer, searchStory } from './qa'
import {
  collect,
  detailFromSources,
  outlineFromCollected,
  outlineFromSources,
  type Collected,
  type Progress
} from './scraper'
import { suggest as wikiSuggest } from './sources/wikipedia'
import { fold, tokenize } from '../shared/text'
import type {
  AskResult,
  Engine,
  NodeDetail,
  SearchSuggestion,
  StoryNode,
  StoryOutline,
  StoryQuery
} from '../shared/types'

export async function suggest(query: string): Promise<SearchSuggestion[]> {
  const s = getSettings()
  if (!s.sources.wikipedia) return []
  return wikiSuggest(query, contentLang(s), 7)
}

function safeOutline(c: Collected | null, q: StoryQuery, engine: Engine): StoryOutline | null {
  if (!c) return null
  try {
    return outlineFromCollected(c, q, engine)
  } catch {
    return null
  }
}

/** Do two titles plausibly name the same work? Guards AI-mode enrichment. */
function sameWork(a: string, b: string): boolean {
  const ta = new Set(tokenize(a))
  const tb = tokenize(b)
  if (!ta.size || !tb.length) return fold(a) === fold(b)
  return tb.some((t) => ta.has(t))
}

function mergeAi(
  ai: Awaited<ReturnType<typeof aiOutline>>,
  base: StoryOutline | null,
  q: StoryQuery,
  engine: Engine
): StoryOutline {
  // Grounded mode: the sources know the work's real title and type better
  // than the model does (it may shorten, translate or invent them).
  const title = engine === 'hybrid' ? (base?.title ?? (ai.title || q.text)) : ai.title || base?.title || q.text
  return {
    id: storyId(title, base?.meta.qid ?? fold(title), engine),
    query: { ...q, qid: base?.meta.qid ?? q.qid },
    title,
    mediaType: engine === 'hybrid' ? base?.mediaType || ai.mediaType : ai.mediaType || base?.mediaType || '',
    logline: ai.logline || base?.logline || '',
    nodes: ai.nodes,
    engine,
    lang: contentLang(),
    meta: base?.meta ?? { creators: [], genres: [] },
    characters: base?.characters ?? [],
    related: base?.related ?? [],
    sources: base?.sources ?? [],
    alternatives: base?.alternatives ?? [],
    plotSources: [],
    createdAt: Date.now()
  }
}

function groundingFrom(base: StoryOutline): Grounding {
  return {
    passages: base.nodes.map((n) => ({
      title: n.title,
      text: [n.text ?? '', ...(n.episodes ?? []).map((e) => `${e.number ?? ''}. ${e.title}: ${e.summary}`)]
        .filter(Boolean)
        .join('\n')
    })),
    sourceNames: base.sources.map((s) => s.name).filter((n) => n !== 'Wikidata')
  }
}

export async function buildOutline(q: StoryQuery, progress: Progress): Promise<StoryOutline> {
  const s = getSettings()
  if (s.engine === 'sources') return outlineFromSources(q, progress)
  if (!aiReady(s)) throw new AppError('NO_KEY')

  if (s.engine === 'hybrid') {
    // Scrape first, then let the AI restructure (and translate) real plot text.
    const c = await collect(q, progress).catch(() => null)
    const base = safeOutline(c, q, 'hybrid')
    progress('ai')
    const grounding = base && base.notice?.kind !== 'thin' ? groundingFrom(base) : undefined
    const ai = await aiOutline(c?.title ?? q.text, grounding)
    return mergeAi(ai, base, q, 'hybrid')
  }

  // Pure AI: the model tells the story; sources only add poster, cast, links.
  progress('ai')
  const [ai, c] = await Promise.all([aiOutline(q.text), collect(q).catch(() => null)])
  progress('enrich')
  const base = safeOutline(c, q, 'ai')
  return mergeAi(ai, base && sameWork(ai.title, base.title) ? base : null, q, 'ai')
}

export async function buildNode(
  outline: StoryOutline,
  nodeId: string,
  opts: { forceAi?: boolean } = {}
): Promise<NodeDetail> {
  const node = outline.nodes.find((n) => n.id === nodeId)
  if (!node) throw new AppError('NOT_FOUND', nodeId)
  const useAi = opts.forceAi || outline.engine !== 'sources'
  if (!useAi) return detailFromSources(outline, node)
  if (!aiReady()) throw new AppError('NO_KEY')

  const d = await aiNodeDetail(outline, node)
  const images = await resolveImages(d.imageQueries, outline.title, {
    langs: [outline.lang, 'en'],
    seed: node.images,
    exclude: [outline.meta.poster]
  })
  return {
    id: node.id,
    title: node.title,
    body: d.body,
    beats: d.beats,
    images,
    episodes: node.episodes,
    engine: 'ai'
  }
}

/** Errors where answering from the text beats showing an error. */
const FALLBACK_CODES = new Set(['QUOTA', 'CONNECT', 'NETWORK', 'BAD_KEY', 'NO_KEY', 'MODEL'])

export async function ask(
  outline: StoryOutline,
  nodeId: string,
  corpus: Record<string, string>,
  question: string
): Promise<AskResult> {
  const node: StoryNode | undefined = outline.nodes.find((n) => n.id === nodeId)
  if (!node) throw new AppError('NOT_FOUND', nodeId)
  const local = localAnswer(outline, nodeId, corpus, question)
  const s = getSettings()
  if (s.engine === 'sources' || !aiReady(s)) return local

  try {
    const evidence = searchStory(outline, corpus, question, nodeId)
      .slice(0, 6)
      .map((h) => ({ nodeId: h.nodeId, text: h.text }))
    const body = corpus[nodeId] || node.text || node.summary
    const ai = await aiAnswer(outline, node, body, question, evidence)
    const others = [
      ...(local.relatedNodeId && local.relatedNodeId !== ai.relatedNodeId && local.highlight
        ? [{ nodeId: local.relatedNodeId, snippet: local.highlight }]
        : []),
      ...local.matches.filter((m) => m.nodeId !== ai.relatedNodeId)
    ].slice(0, 4)
    return { ...ai, matches: others }
  } catch (err) {
    const { code } = describeError(err)
    if (FALLBACK_CODES.has(code)) return { ...local, fallbackReason: code }
    throw err
  }
}
