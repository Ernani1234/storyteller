/**
 * Language-light text utilities used by the no-AI pipeline (main) and by the
 * in-story search (renderer). Everything here is deterministic and offline.
 */

const STOPWORDS = new Set(
  (
    // en
    'a an and are as at be been but by did do does for from had has have he her hers him his how i in into is it its me my no not of on or our she so than that the their them then there these they this those to too up us was we were what when where which while who whom why will with you your after before about over again also only very can could would should just more most other some such own same both each few any all being because between during through under until off out down here once' +
    // pt
    ' o a os as um uma uns umas de do da dos das em no na nos nas por pelo pela pelos pelas para com sem sob sobre e ou mas que se como quando onde quem qual quais porque pois ao aos à às é são foi foram ser estar está estão era eram seu sua seus suas ele ela eles elas eu tu nós vós lhe lhes me te nos isso isto aquilo esse essa este esta aquele aquela não sim já mais menos muito pouco também depois antes até entre durante após contra desde então ainda' +
    // es
    ' el la los las un una unos unas del al y o pero que se como cuando donde quien cual cuales porque es son fue fueron ser estar está están era eran su sus él ella ellos ellas yo tú nosotros lo le les no sí ya más menos muy también después antes hasta entre durante tras contra desde entonces aún' +
    // fr
    ' le la les un une des du de et ou mais que qui se comme quand où quel quelle quels quelles parce est sont fut furent être était étaient son sa ses il elle ils elles je tu nous vous lui leur ne pas oui plus moins très aussi après avant jusqu entre pendant contre depuis alors encore dans sur avec sans pour par au aux'
  ).split(/\s+/)
)

/** lowercase + strip diacritics, for accent-insensitive matching. */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

const CJK = /[぀-ヿ㐀-鿿가-힯]/

// Longest first. Crude on purpose: it only has to make "matou"/"mata"/"matar"
// or "killed"/"kills" meet, symmetrically on both query and text.
const SUFFIXES = [
  'amentos', 'imentos', 'amento', 'imento', 'acoes', 'mente', 'ation', 'aram', 'eram', 'iram',
  'ando', 'endo', 'indo', 'acao', 'ing', 'ava', 'ado', 'ido', 'ada', 'ida', 'ou', 'eu', 'iu',
  'ar', 'er', 'ir', 'es', 'os', 'as', 'ed', 'ly', 's', 'a', 'o', 'e'
]

export function stem(word: string): string {
  if (word.length < 4) return word
  for (const suf of SUFFIXES) {
    if (word.endsWith(suf) && word.length - suf.length >= 3) return word.slice(0, -suf.length)
  }
  return word
}

export function tokenize(text: string): string[] {
  const out: string[] = []
  for (const raw of fold(text).split(/[^\p{L}\p{N}]+/u)) {
    if (!raw) continue
    if (CJK.test(raw)) {
      // No word boundaries in CJK: index character bigrams instead.
      for (let i = 0; i < raw.length - 1; i++) out.push(raw.slice(i, i + 2))
      if (raw.length === 1) out.push(raw)
      continue
    }
    if (raw.length < 2 || STOPWORDS.has(raw)) continue
    out.push(stem(raw))
  }
  return out
}

export function wordCount(text: string): number {
  if (CJK.test(text)) return Math.round(text.replace(/\s+/g, '').length / 2)
  return text.split(/\s+/).filter(Boolean).length
}

export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
}

// Word boundaries are spelled out as (^|space|bracket): JS `\b` treats accented
// letters as non-word characters, so "cabeça." would look like the initial "a.".
const ABBREV_WORD = /(?:^|[\s(])(?:mr|mrs|ms|dr|st|sr|sra|jr|prof|vs|etc|vol|ch|ep|gen|col|lt|sgt|capt|mt|ft|inc|ltd|e\.g|i\.e)\.$/i
const INITIAL = /(?:^|[\s(])\p{Lu}\.$/u
const isAbbrev = (s: string): boolean => ABBREV_WORD.test(s) || INITIAL.test(s)

/**
 * Split into sentences. Every returned sentence is a verbatim substring of
 * the input (trimmed), so it can be located again for highlighting.
 */
export function splitSentences(text: string): string[] {
  const re = /[^.!?。！？]+(?:[.!?。！？]+["'”’»)\]]*|$)/g
  const out: string[] = []
  let bufStart = -1
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (bufStart < 0) bufStart = m.index
    const end = m.index + m[0].length
    const candidate = text.slice(bufStart, end).trim()
    const next = text.slice(end).trimStart()
    // Keep going when the "sentence" ends in an abbreviation or the next
    // fragment clearly continues it (lowercase / digit, e.g. "3.5").
    if (next && (isAbbrev(candidate) || (/^[a-z0-9]/.test(next) && /\.$/.test(candidate)))) {
      continue
    }
    if (candidate) out.push(candidate)
    bufStart = -1
  }
  if (bufStart >= 0) {
    const rest = text.slice(bufStart).trim()
    if (rest) out.push(rest)
  }
  return out
}

/** Uppercase the first letter only (CSS `capitalize` would give "Série De Televisão"). */
export function capFirst(s: string): string {
  return s ? s[0].toLocaleUpperCase() + s.slice(1) : s
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const sp = cut.lastIndexOf(' ')
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:–—-]+$/, '')}…`
}

/** Okapi BM25 over arbitrary documents. Returns indices sorted by score. */
export function bm25(
  query: string,
  docs: string[],
  k1 = 1.4,
  b = 0.75
): { index: number; score: number }[] {
  const q = [...new Set(tokenize(query))]
  if (!q.length || !docs.length) return []
  const toks = docs.map((d) => tokenize(d))
  const avg = toks.reduce((s, t) => s + t.length, 0) / toks.length || 1
  const df = new Map<string, number>()
  for (const t of toks) for (const w of new Set(t)) df.set(w, (df.get(w) ?? 0) + 1)
  const N = docs.length
  const scored = toks.map((t, index) => {
    const tf = new Map<string, number>()
    for (const w of t) tf.set(w, (tf.get(w) ?? 0) + 1)
    let score = 0
    for (const w of q) {
      const f = tf.get(w)
      if (!f) continue
      const n = df.get(w) ?? 0
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * t.length) / avg)))
    }
    return { index, score }
  })
  return scored.filter((s) => s.score > 0).sort((a, b2) => b2.score - a.score)
}

/** Extractive "key moments": the most information-dense sentences, in story order. */
export function keySentences(text: string, n: number): string[] {
  const sentences = splitParagraphs(text).flatMap(splitSentences)
  if (sentences.length <= 2) return []
  const freq = new Map<string, number>()
  for (const s of sentences) for (const w of tokenize(s)) freq.set(w, (freq.get(w) ?? 0) + 1)
  const max = Math.max(1, ...freq.values())
  const scored = sentences.map((s, i) => {
    const t = tokenize(s)
    const score = t.reduce((acc, w) => acc + (freq.get(w) ?? 0) / max, 0) / Math.sqrt(t.length + 1)
    return { s, i, score }
  })
  return scored
    // the opening sentence was just read; don't repeat it as a "moment"
    .filter((x) => x.s.length >= 30 && !(x.i === 0 && sentences.length >= 4))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(n, Math.ceil(sentences.length / 2)))
    .sort((a, b) => a.i - b.i)
    .map((x) => truncate(x.s, 220))
}

const CONNECTORS = new Set(['of', 'the', 'de', 'da', 'do', 'dos', 'das', 'del', 'la', 'le', 'von', 'van', 'du'])
const CAP_STOP = new Set(
  'The A An In On At After Before When While During Meanwhile However Later Then Although Despite As Once Upon Eventually Finally Following Back Elsewhere Years Months Days Some Many This That These Those It He She They We His Her Their Its One Two Three Four Five Six Seven Eight Nine Ten Several Both With Without From Into Among Through Soon Now Having Realizing Unable Still Instead Together O A Os As Um Uma Em No Na Nos Nas Depois Antes Quando Enquanto Durante Entretanto Porém Mais Então Embora Apesar Como Após Finalmente Ele Ela Eles Elas Seu Sua Dois Três Anos Dias Meses Logo Assim Janeiro Fevereiro Março Abril Maio Junho Julho Agosto Setembro Outubro Novembro Dezembro January February March April May June July August September October November December Enero Febrero Marzo Mayo Junio Julio Septiembre Octubre Noviembre Diciembre Janvier Février Mars Avril Mai Juin Juillet Août Septembre Octobre Novembre Décembre El La Los Las Un Una En Después Antes Cuando Mientras Durante Sin Pero Le Les Une Des Dans Après Avant Quand Pendant Mais Il Elle Ils Elles'.split(
    ' '
  )
)

/**
 * Capitalized multi-word names ("Salt Lake City", "Joel", "Fireflies") ranked
 * by frequency. Used for image queries, chapter titles and character lookups.
 */
export function properNouns(text: string, max = 8): string[] {
  const counts = new Map<string, { n: number; first: number }>()
  // Words that also appear lowercase are common words, not names ("Four",
  // "Later") — only trust them when they're capitalized mid-sentence.
  const lowercase = new Set(
    (text.match(/(?:^|\s)\p{Ll}[\p{L}'’-]*/gu) ?? []).map((w) => w.trim())
  )
  const sentences = splitSentences(text.replace(/\n+/g, ' '))
  // A sentence-initial word ("Quase", "Vamos") only counts as a name if it is
  // also capitalized somewhere mid-sentence.
  const midCaps = new Set<string>()
  for (const s of sentences) {
    s.split(/\s+/)
      .slice(1)
      .map((w) => w.replace(/^[("'“‘«]+|[)"'”’».,;:!?]+$/g, '').replace(/['’]s$/, ''))
      .forEach((w) => {
        if (/^\p{Lu}/u.test(w)) midCaps.add(w)
      })
  }
  let pos = 0
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/)
    let run: string[] = []
    const flush = (): void => {
      while (run.length && CONNECTORS.has(run[run.length - 1].toLowerCase())) run.pop()
      if (run.length) {
        const name = run.join(' ')
        const isStart = sentence.replace(/^[("'“‘«—–-]+/, '').startsWith(run[0])
        const single = run.length === 1
        const ok = !(
          single &&
          (CAP_STOP.has(name) ||
            STOPWORDS.has(fold(name)) ||
            (isStart && (name.length < 4 || lowercase.has(name.toLowerCase()) || !midCaps.has(name))))
        )
        if (ok) {
          const c = counts.get(name) ?? { n: 0, first: pos }
          c.n++
          counts.set(name, c)
        }
      }
      run = []
    }
    for (const rawWord of words) {
      // "(WLF)" after "Washington Liberation Front" is a separate name.
      if (/^[("“‘«[]/.test(rawWord)) flush()
      const w = rawWord.replace(/^[("'“‘«]+|[)"'”’».,;:!?]+$/g, '').replace(/['’]s$/, '')
      pos++
      if (/^\p{Lu}[\p{L}\p{N}'’-]*$/u.test(w) && !(run.length === 0 && CAP_STOP.has(w))) {
        run.push(w)
      } else if (run.length && CONNECTORS.has(w.toLowerCase())) {
        run.push(w)
      } else {
        flush()
      }
      if (/[,;:)]$/.test(rawWord)) flush()
    }
    flush()
  }
  return [...counts.entries()]
    .sort((a, b) => b[1].n - a[1].n || a[1].first - b[1].first)
    .slice(0, max)
    .map(([name]) => name)
}

/**
 * Title a chunk of plot by the names that are distinctive to it (TF-IDF over
 * all chunks), e.g. "Abby & Seattle". Falls back to the provided label.
 */
export function deriveTitle(chunk: string, all: string[], fallback: string): string {
  const names = properNouns(chunk, 10)
  if (!names.length) return fallback
  const docs = all.map((d) => d.toLowerCase())
  const scored = names
    .map((name, rank) => {
      const df = docs.filter((d) => d.includes(name.toLowerCase())).length
      return { name, score: (10 - rank) * Math.log(1 + all.length / Math.max(1, df)), df }
    })
    .filter((x) => x.df < Math.max(2, all.length * 0.75) || all.length <= 2)
    .sort((a, b) => b.score - a.score)
  if (!scored.length) return fallback
  const picked = [scored[0].name]
  const second = scored.find((x) => !picked[0].includes(x.name) && !x.name.includes(picked[0]))
  if (second && second.score > scored[0].score * 0.45) picked.push(second.name)
  return picked.join(' & ')
}

/**
 * Turn a list of plot paragraphs into story-sized chunks: long plots are
 * merged down to `max` chunks, short ones are split by sentences so the tree
 * has enough nodes to be useful.
 */
export function segmentParagraphs(paragraphs: string[], max = 14, wordsPerChunk = 140): string[] {
  let chunks = paragraphs.filter((p) => p.trim())
  if (!chunks.length) return []
  const total = chunks.reduce((s, p) => s + wordCount(p), 0)
  const desired = Math.max(1, Math.min(max, Math.round(total / wordsPerChunk)))

  // Split the longest chunk in two (by sentences) until we reach `desired`.
  let guard = 0
  while (chunks.length < desired && guard++ < 40) {
    let li = 0
    chunks.forEach((c, i) => {
      if (wordCount(c) > wordCount(chunks[li])) li = i
    })
    const sentences = splitSentences(chunks[li])
    if (sentences.length < 3) break
    const half = wordCount(chunks[li]) / 2
    let acc = 0
    let cut = 1
    for (let i = 0; i < sentences.length - 1; i++) {
      acc += wordCount(sentences[i])
      if (acc >= half) {
        cut = i + 1
        break
      }
    }
    chunks.splice(li, 1, sentences.slice(0, cut).join(' '), sentences.slice(cut).join(' '))
  }

  // Merge the smallest adjacent pair until we fit in `max`.
  guard = 0
  while (chunks.length > max && guard++ < 400) {
    let best = 0
    let bestSize = Infinity
    for (let i = 0; i < chunks.length - 1; i++) {
      const size = wordCount(chunks[i]) + wordCount(chunks[i + 1])
      if (size < bestSize) {
        bestSize = size
        best = i
      }
    }
    chunks.splice(best, 2, `${chunks[best]}\n\n${chunks[best + 1]}`)
  }
  return chunks
}

/** Find `needle` inside `hay` ignoring case/whitespace differences. Returns [start, end) or null. */
export function findLoose(hay: string, needle: string): [number, number] | null {
  if (!needle) return null
  const idx = hay.toLowerCase().indexOf(needle.toLowerCase())
  if (idx !== -1) return [idx, idx + needle.length]
  // Whitespace-insensitive pass (models often reflow quotes).
  const pattern = needle
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+')
  if (!pattern) return null
  const m = new RegExp(pattern, 'i').exec(hay)
  return m ? [m.index, m.index + m[0].length] : null
}
