import { bm25, splitParagraphs, splitSentences, truncate } from '../shared/text'
import { readingOrder } from '../shared/tree'
import type { AskResult, StoryOutline } from '../shared/types'

interface Hit {
  nodeId: string
  text: string
  para: string
  score: number
}

/** Below this BM25 score a "match" is just a common word in common. */
const MIN_SCORE = 0.9

/**
 * Offline search over every sentence of the story (chapter bodies, scraped
 * text and episode summaries). Sentences in the current chapter get a small
 * boost, since that's usually what the reader is asking about.
 */
export function searchStory(
  outline: StoryOutline,
  corpus: Record<string, string>,
  question: string,
  currentId: string
): Hit[] {
  const docs: Omit<Hit, 'score'>[] = []
  for (const n of readingOrder(outline.nodes)) {
    const texts = [corpus[n.id] || n.text || n.summary, ...(n.episodes ?? []).map((e) => e.summary)]
    for (const t of texts) {
      for (const para of splitParagraphs(t ?? '')) {
        for (const s of splitSentences(para)) docs.push({ nodeId: n.id, text: s, para })
      }
    }
  }
  return bm25(
    question,
    docs.map((d) => d.text)
  )
    .map((r) => ({ ...docs[r.index], score: r.score * (docs[r.index].nodeId === currentId ? 1.15 : 1) }))
    .filter((h) => h.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, 40)
}

/** Answer from the text itself: best passage, highlighted in place, plus other chapters that mention it. */
export function localAnswer(
  outline: StoryOutline,
  currentId: string,
  corpus: Record<string, string>,
  question: string
): AskResult {
  const hits = searchStory(outline, corpus, question, currentId)
  if (!hits.length) return { answer: '', relatedNodeId: null, highlight: null, matches: [], engine: 'local' }
  const best = hits[0]
  const sentences = splitSentences(best.para)
  const i = sentences.indexOf(best.text)
  const answer = [best.text, i >= 0 ? sentences[i + 1] : undefined].filter(Boolean).join(' ')
  const seen = new Set([best.nodeId])
  const matches = []
  for (const h of hits.slice(1)) {
    if (seen.has(h.nodeId)) continue
    seen.add(h.nodeId)
    matches.push({ nodeId: h.nodeId, snippet: truncate(h.text, 170) })
    if (matches.length >= 4) break
  }
  return { answer, relatedNodeId: best.nodeId, highlight: best.text, matches, engine: 'local' }
}
