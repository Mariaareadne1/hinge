import { describe, expect, it } from 'vitest'
import { createProject, parseProject, RECIPES, sanitizeName, SchemaError } from '../../src/domain/schema'
import { commit, createHistory, preview, push, redo, undo } from '../../src/domain/history'
import { loadLibrary, saveLibrary, STORAGE_KEY, type KeyValueStore } from '../../src/storage/projects'
import { settleTime, stepResponse } from '../../src/runtime/spring'

const memory = (initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } => {
  const data = { ...initial }
  return {
    data,
    getItem: (k) => (k in data ? data[k]! : null),
    setItem: (k, v) => void (data[k] = v),
    removeItem: (k) => void delete data[k],
  }
}

describe('schema', () => {
  it('round-trips a project through JSON', () => {
    const p = createProject({ specimen: 'token', recipe: 'magnet' })
    expect(parseProject(JSON.parse(JSON.stringify(p)))).toEqual(p)
  })

  it('clamps out-of-range values instead of rejecting', () => {
    const p = createProject()
    const raw = JSON.parse(JSON.stringify(p))
    raw.behavior.hover.pose.y = -9999
    raw.behavior.hover.spring.stiffness = 1e7
    const parsed = parseProject(raw)
    expect(parsed.behavior.hover.pose.y).toBe(-40)
    expect(parsed.behavior.hover.spring.stiffness).toBe(2000)
  })

  it('rejects structurally wrong data with a readable reason', () => {
    const raw = JSON.parse(JSON.stringify(createProject()))
    raw.behavior.press.spring.damping = 'soft'
    expect(() => parseProject(raw)).toThrow(SchemaError)
    expect(() => parseProject(raw)).toThrow(/press\.spring\.damping/)
    expect(() => parseProject({ ...raw, version: 99 })).toThrow(/newer Hinge/)
    expect(() => parseProject('nope')).toThrow(SchemaError)
  })

  it('sanitises names', () => {
    expect(sanitizeName('  <b>Bold</b>\u0000  card ')).toBe('bBold/b card')
    expect(sanitizeName('')).toBe('Untitled')
    expect(sanitizeName('x'.repeat(100))).toHaveLength(48)
  })

  it('recipes are physically distinct', () => {
    const settle = Object.values(RECIPES).map((r) => settleTime(r.behavior.hover.spring))
    expect(new Set(settle.map((s) => s.toFixed(2))).size).toBe(3)
    expect(stepResponse(RECIPES.snap.behavior.hover.spring).overshoot).toBe(0)
    expect(stepResponse(RECIPES.magnet.behavior.drag.spring).overshoot).toBeGreaterThan(0.3)
  })
})

describe('history', () => {
  it('coalesces a gesture into one undo step', () => {
    let h = createHistory(0)
    for (let i = 1; i <= 50; i++) h = preview(h, i)
    h = commit(h)
    expect(h.past).toEqual([0])
    expect(h.present).toBe(50)
    h = undo(h)
    expect(h.present).toBe(0)
    h = redo(h)
    expect(h.present).toBe(50)
  })

  it('a new change clears redo; no-op gestures add nothing', () => {
    let h = push(push(createHistory('a'), 'b'), 'c')
    h = undo(h)
    h = push(h, 'd')
    expect(h.future).toEqual([])
    expect(h.past).toEqual(['a', 'b'])
    h = commit(preview(preview(h, 'x'), 'd'))
    expect(h.past).toEqual(['a', 'b'])
  })

  it('undo during an open gesture first closes it', () => {
    let h = preview(createHistory(1), 2)
    h = undo(h)
    expect(h.present).toBe(1)
    expect(h.future).toEqual([2])
  })
})

describe('storage', () => {
  it('saves and loads the library', () => {
    const store = memory()
    const p = createProject()
    expect(saveLibrary({ projects: [p], currentId: p.id }, store).ok).toBe(true)
    const r = loadLibrary(store)
    expect(r.status).toBe('ok')
    if (r.status === 'ok') expect(r.library.projects[0]).toEqual(p)
  })

  it('reports corrupt JSON without erasing it', () => {
    const store = memory({ [STORAGE_KEY]: '{not json' })
    const r = loadLibrary(store)
    expect(r.status).toBe('corrupt')
    if (r.status === 'corrupt') expect(r.raw).toBe('{not json')
    expect(store.data[STORAGE_KEY]).toBe('{not json')
  })

  it('skips individually damaged projects', () => {
    const good = createProject()
    const store = memory({ [STORAGE_KEY]: JSON.stringify({ projects: [good, { version: 1, specimen: 'blob' }], currentId: 'missing' }) })
    const r = loadLibrary(store)
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.skipped).toBe(1)
      expect(r.library.currentId).toBe(good.id)
    }
  })

  it('reports quota failures as a failed save, not success', () => {
    const store = memory()
    store.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError')
    }
    const p = createProject()
    expect(saveLibrary({ projects: [p], currentId: p.id }, store)).toEqual({ ok: false, reason: 'Browser storage is full.' })
  })
})

describe('storage keeps what it cannot read', () => {
  it('writes unreadable entries back untouched', () => {
    const good = createProject()
    const future = { version: 7, specimen: 'card', fancy: true }
    const store = memory({ [STORAGE_KEY]: JSON.stringify({ projects: [good, future], currentId: good.id }) })
    const r = loadLibrary(store)
    if (r.status !== 'ok') throw new Error('expected ok')
    saveLibrary({ ...r.library, projects: [{ ...good, name: 'Edited' }] }, store)
    const saved = JSON.parse(store.data[STORAGE_KEY]!)
    expect(saved.projects).toHaveLength(2)
    expect(saved.projects[1]).toEqual(future)
  })
})
