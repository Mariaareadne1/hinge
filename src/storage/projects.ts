import { parseProject, SchemaError, type HingeProject } from '../domain/schema'

export const STORAGE_KEY = 'hinge.library.v1'

export interface Library {
  projects: HingeProject[]
  currentId: string
  /**
   * Entries that could not be read (damaged, or from a newer Hinge). They are
   * written back untouched on every save so nothing is silently destroyed.
   */
  unreadable?: unknown[]
}

export type LoadResult =
  | { status: 'empty' }
  | { status: 'ok'; library: Library; skipped: number }
  | { status: 'corrupt'; reason: string; raw: string }
  | { status: 'unavailable'; reason: string }

/** Minimal storage surface so tests can supply an in-memory implementation. */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function defaultStore(): KeyValueStore | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

/**
 * Read the library. Individual damaged projects are skipped and counted; a
 * library that cannot be parsed at all is reported as corrupt (with the raw
 * text so the UI can offer it as a backup download) instead of being erased.
 */
export function loadLibrary(store: KeyValueStore | null = defaultStore()): LoadResult {
  if (!store) return { status: 'unavailable', reason: 'Browser storage is disabled.' }
  let raw: string | null
  try {
    raw = store.getItem(STORAGE_KEY)
  } catch (err) {
    return { status: 'unavailable', reason: err instanceof Error ? err.message : 'Storage read failed.' }
  }
  if (raw === null) return { status: 'empty' }

  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { status: 'corrupt', reason: 'Saved data is not valid JSON.', raw }
  }
  if (typeof data !== 'object' || data === null || !Array.isArray((data as Library).projects)) {
    return { status: 'corrupt', reason: 'Saved data has no project list.', raw }
  }

  const projects: HingeProject[] = []
  const unreadable: unknown[] = []
  for (const item of (data as { projects: unknown[] }).projects) {
    try {
      projects.push(parseProject(item))
    } catch (err) {
      if (!(err instanceof SchemaError)) throw err
      unreadable.push(item)
    }
  }
  const skipped = unreadable.length
  if (projects.length === 0) {
    return { status: 'corrupt', reason: 'None of the saved projects could be read.', raw }
  }
  const wanted = (data as { currentId?: unknown }).currentId
  const currentId = projects.some((p) => p.id === wanted) ? (wanted as string) : projects[0]!.id
  return { status: 'ok', library: { projects, currentId, unreadable }, skipped }
}

export type SaveResult = { ok: true; savedAt: number } | { ok: false; reason: string }

export function saveLibrary(library: Library, store: KeyValueStore | null = defaultStore()): SaveResult {
  if (!store) return { ok: false, reason: 'Browser storage is disabled.' }
  try {
    const { projects, currentId, unreadable = [] } = library
    store.setItem(STORAGE_KEY, JSON.stringify({ projects: [...projects, ...unreadable], currentId }))
    return { ok: true, savedAt: Date.now() }
  } catch (err) {
    const quota = err instanceof DOMException && err.name === 'QuotaExceededError'
    return { ok: false, reason: quota ? 'Browser storage is full.' : 'Could not write to browser storage.' }
  }
}

export function clearLibrary(store: KeyValueStore | null = defaultStore()): void {
  try {
    store?.removeItem(STORAGE_KEY)
  } catch {
    // Nothing else to do: the next save will overwrite it.
  }
}
