import type { StoryImage } from '../../shared/types'

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  eacute: 'é',
  aacute: 'á',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  ccedil: 'ç',
  atilde: 'ã',
  otilde: 'õ'
}

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : m
    }
    return ENTITIES[code.toLowerCase()] ?? m
  })
}

export function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h\d)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/** Remove whole elements (with nesting) by tag name, e.g. tables and infoboxes. */
export function removeElements(html: string, tags: string[]): string {
  let out = html
  for (const tag of tags) {
    const open = new RegExp(`<${tag}\\b`, 'gi')
    let m: RegExpExecArray | null
    let guard = 0
    while ((m = open.exec(out)) && guard++ < 500) {
      const start = m.index
      const re = new RegExp(`<${tag}\\b|</${tag}>`, 'gi')
      re.lastIndex = start + 1
      let depth = 1
      let end = -1
      let t: RegExpExecArray | null
      while ((t = re.exec(out))) {
        depth += t[0][1] === '/' ? -1 : 1
        if (depth === 0) {
          end = t.index + t[0].length
          break
        }
      }
      out = out.slice(0, start) + out.slice(end === -1 ? out.length : end)
      open.lastIndex = start
    }
  }
  return out
}

export type Block =
  | { type: 'h'; level: number; text: string }
  | { type: 'p'; text: string }
  | { type: 'img'; image: StoryImage }

function imageFrom(attrs: string): StoryImage | null {
  const src = /data-src="([^"]+)"/.exec(attrs)?.[1] ?? /\ssrc="([^"]+)"/.exec(attrs)?.[1]
  if (!src || src.startsWith('data:')) return null
  if (!/static\.wikia\.nocookie\.net|upload\.wikimedia\.org/.test(src)) return null
  const width = Number(/width="(\d+)"/.exec(attrs)?.[1] ?? 0)
  if (width && width < 120) return null // icons, flags, bullets
  const alt = decodeEntities(/alt="([^"]*)"/.exec(attrs)?.[1] ?? '')
  const url = decodeEntities(src).replace(/\/scale-to-width-down\/\d+/, '/scale-to-width-down/640')
  return { url, caption: alt.replace(/\.(png|jpe?g|gif|webp)$/i, '') }
}

/**
 * Flatten article HTML into headings, paragraphs and images, in document
 * order. Navigation chrome, tables and references are dropped.
 */
export function htmlToBlocks(html: string): Block[] {
  const clean = removeElements(html, ['script', 'style', 'table', 'sup', 'aside', 'noscript', 'nav'])
    .replace(/<div[^>]+class="[^"]*(?:toc|navbox|reflist|references)[^"]*"[\s\S]*?<\/div>/gi, '')
  const blocks: Block[] = []
  const re = /<h([2-6])\b[^>]*>([\s\S]*?)<\/h\1>|<p\b[^>]*>([\s\S]*?)<\/p>|<li\b[^>]*>([\s\S]*?)<\/li>|<img\b([^>]*)>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(clean))) {
    if (m[1]) {
      const text = stripTags(m[2])
      if (text) blocks.push({ type: 'h', level: Number(m[1]), text })
    } else if (m[3] !== undefined || m[4] !== undefined) {
      const inner = m[3] ?? m[4] ?? ''
      for (const img of inner.matchAll(/<img\b([^>]*)>/gi)) {
        const image = imageFrom(img[1])
        if (image) blocks.push({ type: 'img', image })
      }
      const text = stripTags(inner).replace(/\n+/g, ' ').trim()
      if (text.length > 1) blocks.push({ type: 'p', text })
    } else if (m[5]) {
      const image = imageFrom(m[5])
      if (image) blocks.push({ type: 'img', image })
    }
  }
  return blocks
}
