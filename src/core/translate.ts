import { getJson } from './http'
import type { OriginalText, StoryOutline } from '../shared/types'

/**
 * Machine translation for stories whose fullest telling is in another
 * language. Uses Google Translate's public web endpoint (the one browser page
 * translation uses): no key, many texts per request, CORS-enabled, so it
 * works from the desktop main process and from the Android/web WebView.
 * Responses go through the HTTP cache like any other lookup.
 */

export const TRANSLATION_PROVIDER = 'Google Translate'

const ENDPOINT = 'https://translate.googleapis.com/translate_a/t'
/** characters per request (the endpoint takes ~10k). */
const MAX_CHARS = 7000
const MAX_ITEMS = 100
const MONTH = 30 * 24 * 60 * 60 * 1000

/** Split one text into paragraph pieces of at most MAX_CHARS (very long paragraphs at sentence ends). */
function pieces(text: string): string[] {
  const out: string[] = []
  for (const para of text.split(/\n{2,}/)) {
    let rest = para
    while (rest.length > MAX_CHARS) {
      const cut = rest.lastIndexOf('. ', MAX_CHARS)
      const at = cut > MAX_CHARS / 2 ? cut + 2 : MAX_CHARS
      out.push(rest.slice(0, at))
      rest = rest.slice(at)
    }
    out.push(rest)
  }
  return out
}

async function translateBatch(items: string[], from: string, to: string): Promise<string[]> {
  const data = await getJson<unknown>(`${ENDPOINT}?client=gtx&format=text&sl=${from}&tl=${to}`, {
    method: 'POST',
    form: { q: items },
    ttl: MONTH,
    timeout: 20000
  })
  // One string per input; with sl=auto each entry is [text, detectedLang].
  const list = Array.isArray(data) ? data : [data]
  const out = list.map((x) => (Array.isArray(x) ? String(x[0] ?? '') : String(x ?? '')))
  if (out.length !== items.length) throw new Error(`translation returned ${out.length} of ${items.length} texts`)
  return out
}

/**
 * Below this length a piece is a title or label: translate it from the
 * story's language, since detection guesses wrong on names ("Huntress & Týr"
 * read as Icelandic). Longer pieces are detected one by one, so a passage
 * already in the reader's language (a local premise next to English
 * episodes) comes back untouched instead of being reworded.
 */
const DETECT_FROM = 60

function batches(items: string[]): string[][] {
  const out: string[][] = []
  let cur: string[] = []
  let size = 0
  for (const p of items) {
    if (cur.length && (size + p.length > MAX_CHARS || cur.length >= MAX_ITEMS)) {
      out.push(cur)
      cur = []
      size = 0
    }
    cur.push(p)
    size += p.length
  }
  if (cur.length) out.push(cur)
  return out
}

/** Translate plain texts, keeping their paragraph breaks. Throws if the service fails. */
export async function translateTexts(texts: string[], from: string, to: string): Promise<string[]> {
  const split = texts.map((t) => (t.trim() ? pieces(t) : []))
  const flat = split.flat()

  const translated = new Array<string>(flat.length)
  const groups = [
    { sl: from, idx: flat.map((p, i) => (p.length < DETECT_FROM ? i : -1)).filter((i) => i >= 0) },
    { sl: 'auto', idx: flat.map((p, i) => (p.length >= DETECT_FROM ? i : -1)).filter((i) => i >= 0) }
  ]
  const jobs: Promise<void>[] = []
  for (const { sl, idx } of groups) {
    let start = 0
    for (const batch of batches(idx.map((i) => flat[i]))) {
      const at = idx.slice(start, start + batch.length)
      start += batch.length
      jobs.push(translateBatch(batch, sl, to).then((out) => out.forEach((s, k) => (translated[at[k]] = s))))
    }
  }
  await Promise.all(jobs)

  let i = 0
  return split.map((ps, k) => {
    if (!ps.length) return texts[k]
    const joined = translated.slice(i, i + ps.length).join('\n\n')
    i += ps.length
    return joined
  })
}

/**
 * The outline in the reader's language. Titles, summaries, chapter text and
 * episode summaries are translated (episode titles stay as aired); the
 * originals are kept in `translation` so the reader can switch back.
 */
export async function translateOutline(o: StoryOutline, to: string, loglineLang: string): Promise<StoryOutline> {
  const from = o.lang
  const texts: string[] = []
  const slot = (s?: string): number => {
    if (!s?.trim()) return -1
    texts.push(s)
    return texts.length - 1
  }
  const plan = o.nodes.map((n) => ({
    title: slot(n.title),
    summary: slot(n.summary),
    text: slot(n.text),
    episodes: (n.episodes ?? []).map((e) => slot(e.summary))
  }))
  const logline = loglineLang === from ? slot(o.logline) : -1

  const out = await translateTexts(texts, from, to)
  const pick = (i: number, original: string): string => (i >= 0 ? out[i] : original)

  const originals: Record<string, OriginalText> = {}
  const nodes = o.nodes.map((n, k) => {
    const p = plan[k]
    originals[n.id] = { title: n.title, summary: n.summary, text: n.text, episodes: n.episodes?.map((e) => e.summary) }
    return {
      ...n,
      title: pick(p.title, n.title),
      summary: pick(p.summary, n.summary),
      text: n.text === undefined ? undefined : pick(p.text, n.text),
      episodes: n.episodes?.map((e, j) => ({ ...e, summary: pick(p.episodes[j], e.summary) }))
    }
  })

  return {
    ...o,
    lang: to,
    nodes,
    logline: pick(logline, o.logline),
    // "Only found in English" gives way to the translation notice.
    notice: o.notice?.kind === 'lang' ? undefined : o.notice,
    translation: {
      from,
      to,
      provider: TRANSLATION_PROVIDER,
      logline: logline >= 0 ? o.logline : undefined,
      nodes: originals
    }
  }
}
