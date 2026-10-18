/**
 * cyrb53: small, fast, well-distributed 53-bit string hash. Pure JS so the
 * same ids come out on desktop (Node) and mobile (WebView) — no crypto module.
 */
function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

/** 28 hex chars (two seeds): collision-safe enough for cache keys and ids. */
export function hashHex(str: string): string {
  return cyrb53(str, 1).toString(16).padStart(14, '0') + cyrb53(str, 2).toString(16).padStart(14, '0')
}
