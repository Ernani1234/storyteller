import { core, type CacheEntry } from './config'
import { AppError } from './errors'
import { hashHex } from './hash'

const UA = 'Storyteller/2.0 (https://github.com/Ernani1234/storyteller; desktop app)'
const DAY = 24 * 60 * 60 * 1000
const MEM_MAX = 400

const mem = new Map<string, CacheEntry>()

function remember(key: string, entry: CacheEntry): void {
  mem.set(key, entry)
  if (mem.size > MEM_MAX) mem.delete(mem.keys().next().value as string)
  core()
    .cache.set(key, entry)
    .catch(() => {
      /* cache is best-effort */
    })
}

export function clearMemoryCache(): void {
  mem.clear()
}

export interface GetJsonOptions {
  /** cache lifetime in ms (0 disables caching). Default 7 days. */
  ttl?: number
  timeout?: number
  method?: 'GET' | 'POST'
  body?: unknown
  headers?: Record<string, string>
  /** resolve null instead of throwing on 404. */
  allow404?: boolean
}

function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(ms) : undefined
}

/**
 * GET/POST JSON with a timeout, one retry on 429/5xx, a memory + persistent
 * cache, and a stale-cache fallback when the network is down (so saved
 * lookups keep working offline).
 */
export async function getJson<T = any>(url: string, opts: GetJsonOptions = {}): Promise<T | null> {
  const browser = core().browser === true
  // MediaWiki only sends CORS headers for anonymous requests that ask with origin=*.
  if (browser && url.includes('/api.php') && !/[?&]origin=/.test(url)) {
    url += `${url.includes('?') ? '&' : '?'}origin=*`
  }
  const ttl = opts.ttl ?? 7 * DAY
  const bodyStr = opts.body === undefined ? '' : JSON.stringify(opts.body)
  const key = hashHex(`${opts.method ?? 'GET'} ${url} ${bodyStr}`)

  let stale: CacheEntry | null = null
  if (ttl > 0) {
    const hit = mem.get(key) ?? (await core().cache.get(key).catch(() => null))
    if (hit) {
      if (Date.now() - hit.t < ttl) return hit.data as T
      stale = hit
    }
  }

  const attempt = async (): Promise<Response> =>
    fetch(url, {
      method: opts.method ?? 'GET',
      headers: {
        // Browsers refuse to set User-Agent (and a custom header would force a
        // CORS preflight); native hosts identify themselves as Wikimedia asks.
        ...(browser ? {} : { 'User-Agent': UA }),
        Accept: 'application/json',
        ...(bodyStr ? { 'Content-Type': 'application/json' } : {}),
        ...opts.headers
      },
      body: bodyStr || undefined,
      signal: timeoutSignal(opts.timeout ?? 15000)
    })

  const started = Date.now()
  try {
    let res = await attempt()
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 700))
      res = await attempt()
    }
    if (res.status === 404 && opts.allow404) {
      if (ttl > 0) remember(key, { t: Date.now(), data: null })
      return null
    }
    if (!res.ok) throw new AppError('NETWORK', `HTTP ${res.status} — ${new URL(url).host}`)
    const data = (await res.json()) as T
    if (typeof process !== 'undefined' && process.env?.['STORYTELLER_DEBUG']) {
      console.log(`[http] ${Date.now() - started}ms ${url.slice(0, 110)}`)
    }
    if (ttl > 0) remember(key, { t: Date.now(), data })
    return data
  } catch (err) {
    if (stale) return stale.data as T
    if (err instanceof AppError) throw err
    throw new AppError('NETWORK', `${new URL(url).host}: ${(err as Error).message}`)
  }
}

export function qs(params: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined) p.set(k, String(v))
  return p.toString()
}
