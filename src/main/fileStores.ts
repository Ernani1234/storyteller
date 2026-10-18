import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { clearMemoryCache } from '../core/http'
import type { CacheEntry, CacheStore, KeyValueStore } from '../core/config'

/** Desktop storage: one JSON file per key under the app's data folder. */

const cacheDir = (): string => join(app.getPath('userData'), 'cache', 'http')
const libraryDir = (): string => join(app.getPath('userData'), 'library')
const safe = (key: string): string => key.replace(/[^a-z0-9-]/gi, '')

async function atomicWrite(dir: string, file: string, data: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  await fs.writeFile(tmp, data, 'utf8')
  await fs.rename(tmp, file)
}

export const fileCache: CacheStore = {
  async get(key) {
    try {
      return JSON.parse(await fs.readFile(join(cacheDir(), `${safe(key)}.json`), 'utf8')) as CacheEntry
    } catch {
      return null
    }
  },
  async set(key, entry) {
    await fs.mkdir(cacheDir(), { recursive: true })
    await fs.writeFile(join(cacheDir(), `${safe(key)}.json`), JSON.stringify(entry))
  }
}

export const fileLibrary: KeyValueStore = {
  async get<T>(key: string) {
    try {
      return JSON.parse(await fs.readFile(join(libraryDir(), `${safe(key)}.json`), 'utf8')) as T
    } catch {
      return null
    }
  },
  async set(key, value) {
    await atomicWrite(libraryDir(), join(libraryDir(), `${safe(key)}.json`), JSON.stringify(value))
  },
  async del(key) {
    await fs.rm(join(libraryDir(), `${safe(key)}.json`), { force: true })
  }
}

export async function cacheBytes(): Promise<number> {
  try {
    let total = 0
    for (const f of await fs.readdir(cacheDir())) {
      total += (await fs.stat(join(cacheDir(), f)).catch(() => ({ size: 0 }))).size
    }
    return total
  } catch {
    return 0
  }
}

export async function clearCache(): Promise<number> {
  const before = await cacheBytes()
  clearMemoryCache()
  await fs.rm(cacheDir(), { recursive: true, force: true })
  return before
}
