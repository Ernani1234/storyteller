import OpenAI from 'openai'
import { getApiKey, getSettings } from './store'
import type {
  AskResult,
  NodeDetail,
  StoryNode,
  StoryOutline
} from '../shared/types'

function client(): OpenAI {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('No OpenAI API key set. Add it in Settings.')
  return new OpenAI({ apiKey })
}

function model(): string {
  return getSettings().model || 'gpt-4o'
}

function langDirective(): string {
  const lang = getSettings().language
  if (!lang || lang === 'auto') {
    return 'Write in the same language the user used for the title; default to English if ambiguous.'
  }
  return `Write all prose in ${lang}.`
}

/**
 * Step 1 — resolve the work and build a chapter outline (the tree skeleton).
 * Cheap-ish: titles + one-line summaries only. Detail is fetched per node later.
 */
export async function buildOutline(query: string): Promise<StoryOutline> {
  const sys = [
    'You are Storyteller, an expert narrative archivist.',
    'Given the name of any media work (game, film, anime, series, book, comic, etc.),',
    'reconstruct the COMPLETE in-universe story it tells, start to finish, including the ending.',
    'Lay it out as an ORDERED, CHRONOLOGICAL CHAIN of chapters: chapter 1 → 2 → 3 → … → finale.',
    'This is the most important rule: each chapter MUST flow from the one before it.',
    'Only create a branch (two children of the same chapter) when the story GENUINELY splits',
    'into parallel threads or alternate routes — and that is rare. When in doubt, keep it linear.',
    'Aim for 8-16 nodes. Keep each summary to a single sentence.',
    langDirective()
  ].join(' ')

  const user = [
    `Work: "${query}"`,
    '',
    'Return STRICT JSON with this shape:',
    '{',
    '  "title": string,            // canonical title',
    '  "mediaType": string,        // e.g. "video game", "anime", "film"',
    '  "logline": string,          // 1-2 sentence framing of the whole work',
    '  "nodes": [',
    '    { "id": string, "parentId": string|null, "title": string, "summary": string, "order": number }',
    '  ]',
    '}',
    'CRITICAL parentId rules:',
    '- Exactly ONE node has parentId = null (the opening chapter / root).',
    '- EVERY other node\'s parentId is the id of the chapter that immediately precedes it',
    '  in the story — NOT the root. So normally node 2\'s parent is node 1, node 3\'s parent',
    '  is node 2, and so on, forming a single chain.',
    '- Do NOT attach many chapters directly to the root. That is wrong.',
    '- ids are short slugs like "ch1", "ch2", "ch2-a". order = chronological position (1,2,3,…).',
    'Cover the whole story including the finale.'
  ].join('\n')

  const res = await client().chat.completions.create({
    model: model(),
    temperature: 0.6,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: user }
    ]
  })

  const raw = res.choices[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(raw) as StoryOutline
  if (!parsed.nodes?.length) throw new Error('Model returned no story nodes.')

  parsed.nodes = normalizeTree(parsed.nodes)
  return parsed
}

/**
 * Repair the chapter tree so it reads as a chronological chain:
 * - exactly one root,
 * - drop dangling parent references,
 * - if the model produced a flat "star" (most chapters hung off the root) or
 *   any node with no valid parent, relink it to the previous chapter by order.
 */
function normalizeTree(input: StoryNode[]): StoryNode[] {
  const nodes = [...input].map((n) => ({ ...n }))
  // Stable chronological order: by `order`, falling back to original index.
  nodes.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const ids = new Set(nodes.map((n) => n.id))
  const rootId = nodes[0].id

  // Count how many non-root nodes point straight at the root.
  const directToRoot = nodes.filter(
    (n) => n.id !== rootId && n.parentId === rootId
  ).length
  const others = nodes.length - 1
  const flat = others > 2 && directToRoot / others >= 0.6

  let prevId: string | null = null
  nodes.forEach((n, i) => {
    if (prevId === null) {
      n.parentId = null // root
    } else if (flat) {
      n.parentId = prevId // force a clean chain
    } else if (!n.parentId || !ids.has(n.parentId) || n.parentId === n.id) {
      n.parentId = prevId // repair invalid/missing parent
    }
    n.order = i + 1
    prevId = n.id
  })
  return nodes
}

/**
 * Step 2 — fetch the full narrative for a single chapter on demand.
 * Returns body + key beats + image search queries (resolved to real images
 * by the images service).
 */
export async function buildNodeDetail(
  outline: StoryOutline,
  node: StoryNode
): Promise<{ detail: Omit<NodeDetail, 'images'>; imageQueries: string[] }> {
  const path = buildPath(outline, node)

  const sys = [
    'You are Storyteller, narrating one chapter of a larger story in vivid but spoiler-complete prose.',
    'Explain exactly what happens in this chapter so a reader fully understands it.',
    langDirective()
  ].join(' ')

  const user = [
    `Work: "${outline.title}" (${outline.mediaType}).`,
    `Logline: ${outline.logline}`,
    `Chapter path: ${path}`,
    `This chapter: "${node.title}" — ${node.summary}`,
    '',
    'Return STRICT JSON:',
    '{',
    '  "body": string,         // 2-4 paragraphs telling what happens in this chapter',
    '  "beats": string[],      // 3-6 concise key moments / takeaways',
    '  "imageQueries": string[]// 2-3 image search phrases using PROPER NOUNS from this work',
    '}',
    'For imageQueries use specific named entities (characters, locations, key scenes) so',
    'an encyclopedia image search can find them — e.g. "Cloud Strife", "Midgar", not "the hero".'
  ].join('\n')

  const res = await client().chat.completions.create({
    model: model(),
    temperature: 0.7,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: user }
    ]
  })

  const raw = res.choices[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(raw) as {
    body: string
    beats: string[]
    imageQueries: string[]
  }

  return {
    detail: {
      id: node.id,
      title: node.title,
      body: parsed.body ?? '',
      beats: parsed.beats ?? []
    },
    imageQueries: parsed.imageQueries ?? []
  }
}

/**
 * Answer a user question asked from inside a chapter. The model may point at
 * the most relevant chapter (relatedNodeId) and quote the exact passage that
 * already answers it (highlight) so the UI can blink + highlight that node.
 */
export async function answerQuestion(
  outline: StoryOutline,
  currentNode: StoryNode,
  currentBody: string,
  question: string
): Promise<AskResult> {
  const roster = outline.nodes
    .map((n) => `- ${n.id}: "${n.title}" — ${n.summary}`)
    .join('\n')

  const sys = [
    'You are Storyteller, answering a reader\'s question about a story they are exploring.',
    'Answer clearly and concretely using canonical knowledge of the work.',
    'If the answer is already contained in the CURRENT chapter text, quote the exact',
    'sentence(s) from it in "highlight" (verbatim substring, copied character-for-character).',
    'Set "relatedNodeId" to the chapter id most relevant to your answer (often the current one).',
    'If no chapter is specifically relevant, set relatedNodeId and highlight to null.',
    langDirective()
  ].join(' ')

  const user = [
    `Work: "${outline.title}" (${outline.mediaType}).`,
    `Current chapter: ${currentNode.id} "${currentNode.title}".`,
    '',
    'Current chapter text:',
    '"""',
    currentBody,
    '"""',
    '',
    'All chapters:',
    roster,
    '',
    `Reader question: ${question}`,
    '',
    'Return STRICT JSON:',
    '{',
    '  "answer": string,           // the answer, a short paragraph',
    '  "relatedNodeId": string|null,// id from the chapter list, or null',
    '  "highlight": string|null     // verbatim quote from the CURRENT chapter text, or null',
    '}'
  ].join('\n')

  const res = await client().chat.completions.create({
    model: model(),
    temperature: 0.4,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: user }
    ]
  })

  const raw = res.choices[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(raw) as Partial<AskResult>
  const validId =
    parsed.relatedNodeId &&
    outline.nodes.some((n) => n.id === parsed.relatedNodeId)
      ? parsed.relatedNodeId!
      : null
  return {
    answer: parsed.answer ?? 'No answer available.',
    relatedNodeId: validId,
    highlight: parsed.highlight ?? null
  }
}

/** Breadcrumb path root -> ... -> node, for context. */
function buildPath(outline: StoryOutline, node: StoryNode): string {
  const byId = new Map(outline.nodes.map((n) => [n.id, n]))
  const parts: string[] = []
  let cur: StoryNode | undefined = node
  let guard = 0
  while (cur && guard++ < 50) {
    parts.unshift(cur.title)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return parts.join(' › ')
}

/** Lightweight key check used by the onboarding screen. */
export async function verifyKey(apiKey: string): Promise<boolean> {
  const probe = new OpenAI({ apiKey })
  await probe.models.list()
  return true
}
