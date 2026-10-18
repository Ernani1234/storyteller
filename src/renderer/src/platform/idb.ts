/** Minimal promise wrapper over IndexedDB: two object stores, JSON-ish values. */

export type StoreName = 'library' | 'cache'

export interface Idb {
  get<T>(store: StoreName, key: string): Promise<T | null>
  set(store: StoreName, key: string, value: unknown): Promise<void>
  del(store: StoreName, key: string): Promise<void>
  clear(store: StoreName): Promise<void>
  /** approximate bytes used by a store (JSON length). */
  size(store: StoreName): Promise<number>
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function openDb(name = 'storyteller', version = 1): Promise<Idb> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(name, version)
    open.onupgradeneeded = () => {
      for (const s of ['library', 'cache'] as const) {
        if (!open.result.objectStoreNames.contains(s)) open.result.createObjectStore(s)
      }
    }
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result
      const store = (s: StoreName, mode: IDBTransactionMode): IDBObjectStore => db.transaction(s, mode).objectStore(s)
      resolve({
        async get<T>(s: StoreName, key: string) {
          return ((await done(store(s, 'readonly').get(key))) as T | undefined) ?? null
        },
        async set(s, key, value) {
          await done(store(s, 'readwrite').put(value, key))
        },
        async del(s, key) {
          await done(store(s, 'readwrite').delete(key))
        },
        async clear(s) {
          await done(store(s, 'readwrite').clear())
        },
        async size(s) {
          const all = (await done(store(s, 'readonly').getAll())) as unknown[]
          return all.reduce<number>((n, v) => n + JSON.stringify(v ?? null).length, 0)
        }
      })
    }
  })
}
