import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { createProject, parseProject, behaviorForSpecimen, newId, sanitizeName, type HingeProject, type RecipeId, type SpecimenKind } from '../domain/schema'
import { commit, createHistory, preview, push, redo, reset, undo, type History } from '../domain/history'
import { clearLibrary, loadLibrary, saveLibrary, type LoadResult } from '../storage/projects'

interface StudioState {
  /** every project except the one being edited, which lives in `history` */
  others: HingeProject[]
  history: History<HingeProject>
}

type Action =
  | { type: 'preview'; project: HingeProject }
  | { type: 'push'; project: HingeProject }
  | { type: 'commit' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'open'; id: string }
  | { type: 'add'; project: HingeProject }
  | { type: 'remove'; id: string }
  | { type: 'replaceAll'; projects: HingeProject[]; currentId: string }

const touch = (p: HingeProject): HingeProject => ({ ...p, updatedAt: Date.now() })
const sameProject = (a: HingeProject, b: HingeProject) => JSON.stringify(a.behavior) === JSON.stringify(b.behavior) && a.name === b.name && a.specimen === b.specimen

function reducer(state: StudioState, action: Action): StudioState {
  const current = state.history.present
  switch (action.type) {
    case 'preview':
      return { ...state, history: preview(state.history, touch(action.project)) }
    case 'push':
      return { ...state, history: push(commit(state.history, sameProject), touch(action.project)) }
    case 'commit':
      return { ...state, history: commit(state.history, sameProject) }
    case 'undo':
      return { ...state, history: undo(state.history) }
    case 'redo':
      return { ...state, history: redo(state.history) }
    case 'open': {
      const next = state.others.find((p) => p.id === action.id)
      if (!next) return state
      return { others: [...state.others.filter((p) => p.id !== action.id), current], history: reset(next) }
    }
    case 'add':
      return { others: [...state.others, current], history: reset(action.project) }
    case 'remove': {
      if (action.id !== current.id) return { ...state, others: state.others.filter((p) => p.id !== action.id) }
      const [next, ...rest] = [...state.others].sort((a, b) => b.updatedAt - a.updatedAt)
      return next ? { others: rest, history: reset(next) } : { others: [], history: reset(createProject()) }
    }
    case 'replaceAll': {
      const cur = action.projects.find((p) => p.id === action.currentId) ?? action.projects[0] ?? createProject()
      return { others: action.projects.filter((p) => p.id !== cur.id), history: reset(cur) }
    }
  }
}

function initialState(load: LoadResult): StudioState {
  if (load.status === 'ok') {
    const cur = load.library.projects.find((p) => p.id === load.library.currentId)!
    return { others: load.library.projects.filter((p) => p.id !== cur.id), history: createHistory(cur) }
  }
  return { others: [], history: createHistory(createProject()) }
}

export type SaveStatus =
  | { kind: 'saved'; at: number }
  | { kind: 'pending' }
  | { kind: 'error'; reason: string }
  | { kind: 'paused'; reason: string }

const AUTOSAVE_DELAY_MS = 350

export function useStudio() {
  const [boot] = useState(() => loadLibrary())
  const [state, dispatch] = useReducer(reducer, boot, initialState)
  // Corrupt storage is never overwritten until the user decides what to do with it.
  const [recovery, setRecovery] = useState<Extract<LoadResult, { status: 'corrupt' }> | null>(
    boot.status === 'corrupt' ? boot : null,
  )
  const [notice, setNotice] = useState<string | null>(
    boot.status === 'ok' && boot.skipped > 0 ? `${boot.skipped} saved project(s) were damaged and skipped.` : null,
  )
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(
    boot.status === 'unavailable' ? { kind: 'error', reason: boot.reason } : boot.status === 'ok' ? { kind: 'saved', at: Date.now() } : { kind: 'pending' },
  )

  const project = state.history.present
  const projects = useMemo(
    () => [...state.others, project].sort((a, b) => b.updatedAt - a.updatedAt),
    [state.others, project],
  )
  const gestureOpen = state.history.gestureStart !== null

  useEffect(() => {
    if (recovery) {
      setSaveStatus({ kind: 'paused', reason: 'Autosave paused until you resolve the saved-data problem.' })
      return
    }
    if (gestureOpen) return
    setSaveStatus((s) => (s.kind === 'error' ? s : { kind: 'pending' }))
    const timer = window.setTimeout(() => {
      const result = saveLibrary({ projects, currentId: project.id })
      setSaveStatus(result.ok ? { kind: 'saved', at: result.savedAt } : { kind: 'error', reason: result.reason })
    }, AUTOSAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [projects, project.id, recovery, gestureOpen])

  // Flush immediately when the page is hidden or closed, so an edit made
  // inside the autosave delay (or mid-gesture) is not lost.
  const latest = useMemo(() => ({ projects, currentId: project.id }), [projects, project.id])
  useEffect(() => {
    if (recovery) return
    const flush = () => {
      saveLibrary(latest)
    }
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [latest, recovery])

  const previewProject = useCallback((p: HingeProject) => dispatch({ type: 'preview', project: p }), [])
  const pushProject = useCallback((p: HingeProject) => dispatch({ type: 'push', project: p }), [])
  const commitGesture = useCallback(() => dispatch({ type: 'commit' }), [])

  const actions = useMemo(
    () => ({
      preview: previewProject,
      push: pushProject,
      commit: commitGesture,
      undo: () => dispatch({ type: 'undo' }),
      redo: () => dispatch({ type: 'redo' }),
      open: (id: string) => dispatch({ type: 'open', id }),
      remove: (id: string) => dispatch({ type: 'remove', id }),
      create: (specimen: SpecimenKind, recipe: RecipeId = 'lift') => dispatch({ type: 'add', project: createProject({ specimen, recipe }) }),
      duplicate: (p: HingeProject) =>
        dispatch({ type: 'add', project: { ...p, id: newId(), name: sanitizeName(`${p.name} copy`), updatedAt: Date.now() } }),
      importProject: (raw: unknown) => {
        const parsed = parseProject(raw)
        dispatch({ type: 'add', project: { ...parsed, id: newId(), updatedAt: Date.now() } })
        return parsed
      },
      applyRecipe: (p: HingeProject, recipe: RecipeId) => pushProject({ ...p, behavior: behaviorForSpecimen(recipe, p.specimen) }),
      setSpecimen: (p: HingeProject, specimen: SpecimenKind) =>
        pushProject({ ...p, specimen, behavior: { ...p.behavior, drag: { ...p.behavior.drag, enabled: specimen !== 'button' } } }),
      resolveRecovery: (choice: 'fresh') => {
        if (choice === 'fresh') {
          clearLibrary()
          dispatch({ type: 'replaceAll', projects: [createProject()], currentId: '' })
        }
        setRecovery(null)
      },
      dismissNotice: () => setNotice(null),
    }),
    [previewProject, pushProject, commitGesture],
  )

  return {
    project,
    projects,
    canUndo: state.history.past.length > 0 || gestureOpen,
    canRedo: state.history.future.length > 0,
    saveStatus,
    recovery,
    notice,
    isFirstRun: boot.status === 'empty',
    actions,
  }
}

export type Studio = ReturnType<typeof useStudio>
