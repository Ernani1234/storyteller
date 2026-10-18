import OpenAI from 'openai'
import { getSettings, getApiKey } from './config'
import { AppError } from './errors'
import { normalizeTree, pathTo } from '../shared/tree'
import type { AskResult, StoryNode, StoryOutline } from '../shared/types'

function client(apiKey = getApiKey(), baseURL = getSettings().aiBaseUrl.trim()): OpenAI {
  if (!apiKey && !baseURL) throw new AppError('NO_KEY')
  return new OpenAI({
    apiKey: apiKey || 'not-needed', // local servers (Ollama, LM Studio) ignore the key
    baseURL: baseURL || undefined,
    timeout: 120_000,
    maxRetries: 1,
    // On Android/web the core runs inside a WebView; the key is the user's own
    // and only goes to the endpoint they chose.
    dangerouslyAllowBrowser: typeof window !== 'undefined'
  })
}

function model(): string {
  return getSettings().model || 'gpt-4o-mini'
}

/** Reasoning models (o-series, gpt-5) reject any temperature but the default. */
function supportsTemperature(m: string): boolean {
  return !/^(o\d|gpt-5)/i.test(m)
}

function langDirective(): string {
  const lang = getSettings().language
  if (!lang || lang === 'auto') {
    return 'Write in the same language the user used for the title; default to English if ambiguous.'
  }
  return `Write all prose in ${lang}.`
}

/** Pull the JSON object out of a reply, tolerating ```json fences and chatter (local models). */
function parseJson<T>(raw: string): T {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)?.[1] ?? raw
  const start = fenced.indexOf('{')
  const end = fenced.lastIndexOf('}')
  if (start === -1 || end <= start) throw new AppError('AI_FORMAT', 'The model did not return JSON.')
  try {
    return JSON.parse(fenced.slice(start, end + 1)) as T
  } catch {
    throw new AppError('AI_FORMAT', 'The model returned malformed JSON.')
  }
}

async function chatJson<T>(system: string, user: string, temperature: number): Promise<T> {
  const m = model()
  const base = {
    model: m,
    messages: [
      { role: 'system' as const, content: system },
      { role: 'user' as const, content: user }
    ],
    ...(supportsTemperature(m) ? { temperature } : {})
  }
  let res: OpenAI.Chat.Completions.ChatCompletion
  try {
    res = await client().chat.completions.create({ ...base, response_format: { type: 'json_object' } })
  } catch (err) {
    // Some OpenAI-compatible servers don't implement JSON mode; ask plainly.
    const e = err as { status?: number; message?: string }
    if (e.status === 400 && /response_format|json/i.test(e.message ?? '')) {
      res = await client().chat.completions.create(base)
    } else {
      throw err
    }
  }
  return parseJson<T>(res.choices[0]?.message?.content ?? '')
}

export interface Grounding {
  /** numbered source passages, e.g. one per scraped chapter */
  passages: { title: string; text: string }[]
  sourceNames: string[]
}

interface RawOutline {
  title?: string
  mediaType?: string
  logline?: string
  nodes?: (Partial<StoryNode> & { sources?: number[] })[]
}

const MAX_GROUNDING_CHARS = 16000

/**
 * Step 1 — resolve the work and build a chapter outline (the tree skeleton).
 * With grounding, the model restructures real plot text instead of recalling it.
 */
export async function aiOutline(
  query: string,
  grounding?: Grounding
): Promise<{ title: string; mediaType: string; logline: string; nodes: StoryNode[] }> {
  const sys = [
    'You are Storyteller, an expert narrative archivist.',
    'Given the name of any media work (game, film, anime, series, book, comic, etc.),',
    'reconstruct the COMPLETE in-universe story it tells, start to finish, including the ending.',
    'Lay it out as an ORDERED, CHRONOLOGICAL CHAIN of chapters: chapter 1 → 2 → 3 → … → finale.',
    'This is the most important rule: each chapter MUST flow from the one before it.',
    'Only create a branch (two children of the same chapter) when the story GENUINELY splits',
    'into parallel threads or alternate routes — and that is rare. When in doubt, keep it linear.',
    'Aim for 8-16 nodes. Keep each summary to a single sentence.',
    grounding
      ? 'You are given SOURCE PASSAGES scraped from reference sites. Treat them as ground truth: every chapter must be supported by them, never contradict them, and do not invent events they do not mention.'
      : '',
    langDirective()
  ].join(' ')

  let sourceBlock = ''
  if (grounding) {
    // Split the budget evenly so long works (many seasons) keep their ending.
    const per = Math.max(400, Math.floor(MAX_GROUNDING_CHARS / Math.max(1, grounding.passages.length)))
    const lines = grounding.passages.map((p, i) => `[${i + 1}] ${p.title}\n${p.text.slice(0, per)}`)
    sourceBlock = ['', `SOURCE PASSAGES (from ${grounding.sourceNames.join(', ')}):`, '"""', ...lines, '"""', ''].join('\n')
  }

  const user = [
    `Work: "${query}"`,
    sourceBlock,
    'Return STRICT JSON with this shape:',
    '{',
    '  "title": string,            // canonical title',
    '  "mediaType": string,        // e.g. "video game", "anime", "film"',
    '  "logline": string,          // 1-2 sentence framing of the whole work',
    '  "nodes": [',
    `    { "id": string, "parentId": string|null, "title": string, "summary": string, "order": number${grounding ? ', "sources": number[]' : ''} }`,
    '  ]',
    '}',
    'CRITICAL parentId rules:',
    '- Exactly ONE node has parentId = null (the opening chapter / root).',
    "- EVERY other node's parentId is the id of the chapter that immediately precedes it",
    "  in the story — NOT the root. So normally node 2's parent is node 1, node 3's parent",
    '  is node 2, and so on, forming a single chain.',
    '- Do NOT attach many chapters directly to the root. That is wrong.',
    '- ids are short slugs like "ch1", "ch2", "ch2-a". order = chronological position (1,2,3,…).',
    grounding ? '- "sources" lists the numbers of the SOURCE PASSAGES each chapter is based on.' : '',
    'Cover the whole story including the finale.'
  ].join('\n')

  const parsed = await chatJson<RawOutline>(sys, user, 0.6)
  if (!Array.isArray(parsed.nodes) || !parsed.nodes.length) {
    throw new AppError('AI_FORMAT', 'The model returned no story nodes.')
  }

  const nodes = normalizeTree(parsed.nodes)
  if (grounding) {
    // Attach the source passages each chapter used, so chapter narration stays grounded.
    const byId = new Map(parsed.nodes.map((n) => [String(n.id), n.sources]))
    const P = grounding.passages
    nodes.forEach((n, i) => {
      let refs = (byId.get(n.id) ?? []).filter((x) => Number.isInteger(x) && x >= 1 && x <= P.length)
      if (!refs.length) {
        // Model skipped "sources": spread passages proportionally.
        const from = Math.floor((i * P.length) / nodes.length)
        const to = Math.max(from + 1, Math.floor(((i + 1) * P.length) / nodes.length))
        refs = Array.from({ length: to - from }, (_, k) => from + k + 1)
      }
      n.text = refs.map((r) => P[r - 1].text).join('\n\n')
    })
  }

  return {
    title: String(parsed.title ?? query),
    mediaType: String(parsed.mediaType ?? ''),
    logline: String(parsed.logline ?? ''),
    nodes
  }
}

/**
 * Step 2 — narrate a single chapter on demand. Returns body + key beats +
 * image search queries (resolved to real images by the images service).
 */
export async function aiNodeDetail(
  outline: StoryOutline,
  node: StoryNode
): Promise<{ body: string; beats: string[]; imageQueries: string[] }> {
  const path = pathTo(outline.nodes, node.id)
    .map((n) => n.title)
    .join(' › ')
  const source =
    node.text || node.episodes?.length
      ? [
          node.text ?? '',
          ...(node.episodes ?? []).map((e) => `${e.number ?? ''} ${e.title}: ${e.summary}`)
        ]
          .join('\n')
          .slice(0, 9000)
      : ''

  const sys = [
    'You are Storyteller, narrating one chapter of a larger story in vivid but spoiler-complete prose.',
    'Explain exactly what happens in this chapter so a reader fully understands it.',
    source ? 'Base the narration on the SOURCE TEXT; do not contradict it or add events it does not support.' : '',
    langDirective()
  ].join(' ')

  const user = [
    `Work: "${outline.title}" (${outline.mediaType}).`,
    `Logline: ${outline.logline}`,
    `Chapter path: ${path}`,
    `This chapter: "${node.title}" — ${node.summary}`,
    source ? `\nSOURCE TEXT:\n"""\n${source}\n"""\n` : '',
    'Return STRICT JSON:',
    '{',
    '  "body": string,         // 2-4 paragraphs separated by blank lines',
    '  "beats": string[],      // 3-6 concise key moments / takeaways',
    '  "imageQueries": string[]// 2-3 image search phrases using PROPER NOUNS from this work',
    '}',
    'For imageQueries use specific named entities (characters, locations, key scenes) so',
    'an encyclopedia image search can find them — e.g. "Cloud Strife", "Midgar", not "the hero".'
  ].join('\n')

  const parsed = await chatJson<{ body?: unknown; beats?: unknown; imageQueries?: unknown }>(sys, user, 0.7)
  const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : [])
  return {
    body: typeof parsed.body === 'string' ? parsed.body : '',
    beats: strings(parsed.beats),
    imageQueries: strings(parsed.imageQueries)
  }
}

/**
 * Answer a question asked from inside a chapter. Local search results are
 * passed in as evidence; the model may point at the most relevant chapter and
 * quote the exact passage that already answers it.
 */
export async function aiAnswer(
  outline: StoryOutline,
  currentNode: StoryNode,
  currentBody: string,
  question: string,
  evidence: { nodeId: string; text: string }[]
): Promise<AskResult> {
  const roster = outline.nodes.map((n) => `- ${n.id}: "${n.title}" — ${n.summary}`).join('\n')

  const sys = [
    "You are Storyteller, answering a reader's question about a story they are exploring.",
    'Answer clearly and concretely using canonical knowledge of the work and the passages provided.',
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
    currentBody.slice(0, 8000),
    '"""',
    '',
    evidence.length ? 'Relevant passages found elsewhere in the story:' : '',
    ...evidence.map((e) => `- (${e.nodeId}) ${e.text}`),
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

  const parsed = await chatJson<{ answer?: unknown; relatedNodeId?: unknown; highlight?: unknown }>(sys, user, 0.4)
  const related = typeof parsed.relatedNodeId === 'string' ? parsed.relatedNodeId : null
  const validId = related && outline.nodes.some((n) => n.id === related) ? related : null
  return {
    answer: typeof parsed.answer === 'string' ? parsed.answer : '',
    relatedNodeId: validId,
    highlight: typeof parsed.highlight === 'string' && parsed.highlight.trim() ? parsed.highlight : null,
    matches: [],
    engine: 'ai'
  }
}

/** Lightweight key / endpoint check used by onboarding and settings. */
export async function verifyAi(apiKey?: string, baseUrl?: string): Promise<boolean> {
  const key = apiKey?.trim() || getApiKey()
  const url = baseUrl === undefined ? getSettings().aiBaseUrl.trim() : baseUrl.trim()
  await client(key, url).models.list()
  return true
}

/** Chat models the key/endpoint can use, for the model picker. */
export async function listModels(apiKey?: string, baseUrl?: string): Promise<string[]> {
  const key = apiKey?.trim() || getApiKey()
  const url = baseUrl === undefined ? getSettings().aiBaseUrl.trim() : baseUrl.trim()
  const custom = Boolean(url)
  const ids: string[] = []
  for await (const m of client(key, url).models.list()) ids.push(m.id)
  const chat = custom
    ? ids
    : ids.filter((id) => /^(gpt-|o\d|chatgpt)/.test(id) && !/(audio|realtime|transcribe|tts|image|search|embedding|instruct|moderation)/.test(id))
  return chat.sort()
}
