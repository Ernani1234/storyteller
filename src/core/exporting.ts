import { normalizeTree, readingOrder } from '../shared/tree'
import { splitParagraphs } from '../shared/text'
import type { Engine, ExportLabels, OriginalText, SavedStory, StoryOutline, StoryTranslation } from '../shared/types'

/**
 * Export formats shared by every host. The desktop wraps them in save dialogs
 * (and prints the HTML to PDF); mobile hands the file to the share sheet.
 */

export function fileName(title: string): string {
  return title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'story'
}

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function chapters(story: SavedStory): { index: number; title: string; body: string; beats: string[]; episodes: string[] }[] {
  return readingOrder(story.outline.nodes).map((n, i) => {
    const d = story.details[n.id]
    return {
      index: i + 1,
      title: n.title,
      body: d?.body || n.text || n.summary,
      beats: d?.beats ?? [],
      episodes: (d?.episodes ?? n.episodes ?? []).map((e) => `${e.number ?? '•'}. ${e.title}${e.summary ? ` — ${e.summary}` : ''}`)
    }
  })
}

function subtitle(o: StoryOutline): string {
  return [o.mediaType, o.meta.year].filter(Boolean).join(' · ')
}

export function toMarkdown(story: SavedStory, L: ExportLabels): string {
  const o = story.outline
  const out = [`# ${o.title}`, '', `_${subtitle(o)}_`, '']
  if (o.logline) out.push(`> ${o.logline}`, '')
  if (L.translated) out.push(`_${L.translated}_`, '')
  for (const c of chapters(story)) {
    out.push(`## ${c.index}. ${c.title}`, '', ...splitParagraphs(c.body).flatMap((p) => [p, '']))
    if (c.beats.length) out.push(`**${L.keyMoments}**`, '', ...c.beats.map((b) => `- ${b}`), '')
    if (c.episodes.length) out.push(`**${L.episodes}**`, '', ...c.episodes.map((e) => `- ${e}`), '')
  }
  if (o.sources.length) {
    out.push('---', '', `**${L.sources}**`, '', ...o.sources.map((s) => `- [${s.name}](${s.url})${s.license ? ` — ${s.license}` : ''}`), '')
  }
  out.push(`_${L.generatedBy}_`, '')
  return out.join('\n')
}

export function toHtml(story: SavedStory, L: ExportLabels): string {
  const o = story.outline
  const body = chapters(story)
    .map(
      (c) => `<section>
  <h2><span>${c.index}</span>${esc(c.title)}</h2>
  ${splitParagraphs(c.body).map((p) => `<p>${esc(p)}</p>`).join('\n')}
  ${c.beats.length ? `<h3>${esc(L.keyMoments)}</h3><ul>${c.beats.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
  ${c.episodes.length ? `<h3>${esc(L.episodes)}</h3><ul class="eps">${c.episodes.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
</section>`
    )
    .join('\n')
  return `<!doctype html><html lang="${esc(o.lang)}"><head><meta charset="utf-8"><title>${esc(o.title)}</title>
<style>
  @page { margin: 18mm 16mm; }
  body { font-family: Georgia, 'Palatino Linotype', serif; color: #2b2533; line-height: 1.6; font-size: 11.5pt; }
  header { display: flex; gap: 18px; align-items: flex-start; margin-bottom: 18px; border-bottom: 1px solid #e4dcef; padding-bottom: 14px; }
  header img { width: 96px; border-radius: 8px; }
  h1 { font-size: 24pt; margin: 0 0 4px; }
  .sub { color: #7c748f; font-family: 'Segoe UI', sans-serif; font-size: 10pt; text-transform: capitalize; }
  blockquote { margin: 10px 0 0; color: #554d66; font-style: italic; }
  section { break-inside: avoid-page; margin-top: 20px; }
  h2 { font-family: 'Segoe UI', sans-serif; font-size: 14pt; display: flex; gap: 10px; align-items: center; }
  h2 span { display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: #ebe2fb; color: #7b5fc0; font-size: 10pt; }
  h3 { font-family: 'Segoe UI', sans-serif; font-size: 10.5pt; color: #7b5fc0; margin: 12px 0 4px; }
  ul { margin: 0; padding-left: 18px; }
  .eps li { font-size: 10pt; }
  footer { margin-top: 28px; border-top: 1px solid #e4dcef; padding-top: 10px; font-family: 'Segoe UI', sans-serif; font-size: 9pt; color: #7c748f; }
  footer a { color: #7b5fc0; }
</style></head><body>
<header>${o.meta.poster ? `<img src="${esc(o.meta.poster)}" alt="">` : ''}<div>
  <h1>${esc(o.title)}</h1><div class="sub">${esc(subtitle(o))}</div>
  ${o.logline ? `<blockquote>${esc(o.logline)}</blockquote>` : ''}
  ${L.translated ? `<div class="sub">${esc(L.translated)}</div>` : ''}
</div></header>
${body}
<footer>${o.sources.length ? `${esc(L.sources)}: ${o.sources.map((s) => `<a href="${esc(s.url)}">${esc(s.name)}</a>${s.license ? ` (${esc(s.license)})` : ''}`).join(' · ')}<br>` : ''}${esc(L.generatedBy)}</footer>
</body></html>`
}

export function toJson(story: SavedStory): string {
  return JSON.stringify({ format: 'storyteller/2', ...story }, null, 2)
}

const ENGINES: Engine[] = ['sources', 'hybrid', 'ai']

/** The original text of a machine-translated story, keeping only well-formed strings. */
function parseTranslation(raw: unknown, ids: Set<string>): StoryTranslation | undefined {
  const t = raw as Partial<StoryTranslation> | undefined
  if (!t || typeof t.from !== 'string' || typeof t.to !== 'string' || !t.nodes || typeof t.nodes !== 'object') return undefined
  const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
  const nodes: Record<string, OriginalText> = {}
  for (const [id, n] of Object.entries(t.nodes)) {
    if (!ids.has(id) || !n || typeof n.title !== 'string') continue
    nodes[id] = {
      title: n.title,
      summary: str(n.summary) ?? '',
      text: str(n.text),
      episodes: Array.isArray(n.episodes) ? n.episodes.map((e) => String(e ?? '')) : undefined
    }
  }
  return { from: t.from, to: t.to, provider: str(t.provider) ?? '', logline: str(t.logline), nodes }
}

/** Read a story exported as JSON, defensively: it is untrusted input. */
export function parseImported(text: string): SavedStory {
  let raw: Partial<SavedStory>
  try {
    raw = JSON.parse(text) as Partial<SavedStory>
  } catch {
    throw new Error('This file is not a Storyteller story.')
  }
  const o = raw.outline as Partial<StoryOutline> | undefined
  if (!o || typeof o.title !== 'string' || !Array.isArray(o.nodes) || !o.nodes.length) {
    throw new Error('This file is not a Storyteller story.')
  }
  const nodes = normalizeTree(o.nodes)
  const outline: StoryOutline = {
    id: typeof o.id === 'string' && o.id ? o.id : `imported-${Date.now()}`,
    query: { text: o.query?.text ?? o.title },
    title: o.title,
    mediaType: String(o.mediaType ?? ''),
    logline: String(o.logline ?? ''),
    nodes,
    engine: ENGINES.includes(o.engine as Engine) ? (o.engine as Engine) : 'sources',
    lang: typeof o.lang === 'string' ? o.lang : 'en',
    meta: { creators: [], genres: [], ...(o.meta ?? {}) },
    characters: Array.isArray(o.characters) ? o.characters : [],
    related: Array.isArray(o.related) ? o.related : [],
    sources: Array.isArray(o.sources) ? o.sources : [],
    alternatives: [],
    plotSources: [],
    translation: parseTranslation(o.translation, new Set(nodes.map((n) => n.id))),
    createdAt: Number(o.createdAt) || Date.now()
  }
  const ids = new Set(nodes.map((n) => n.id))
  const details = Object.fromEntries(
    Object.entries(raw.details ?? {})
      .filter(([id, d]) => ids.has(id) && d && typeof d.body === 'string')
      .map(([id, d]) => [
        id,
        {
          id,
          title: String(d.title ?? ''),
          body: d.body,
          beats: Array.isArray(d.beats) ? d.beats.map(String) : [],
          images: Array.isArray(d.images)
            ? d.images.filter((i) => i && typeof i.url === 'string' && i.url.startsWith('https://'))
            : [],
          episodes: Array.isArray(d.episodes) ? d.episodes : undefined,
          engine: d.engine === 'ai' ? ('ai' as const) : ('sources' as const)
        }
      ])
  )
  return {
    outline,
    details,
    read: Array.isArray(raw.read) ? raw.read.filter((id) => ids.has(id)) : [],
    favorite: Boolean(raw.favorite),
    updatedAt: Date.now()
  }
}
