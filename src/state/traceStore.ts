import { useSyncExternalStore } from 'react'
import type { TracePoint } from '../components/SpringGraph'

/**
 * The measured trace changes every animation frame. Keeping it outside React
 * state means only the graph re-renders, not the whole studio.
 */
export function createTraceStore() {
  let points: TracePoint[] = []
  const listeners = new Set<() => void>()
  return {
    set(next: TracePoint[]) {
      points = next
      for (const l of listeners) l()
    },
    get: () => points,
    subscribe(l: () => void) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
}

export type TraceStore = ReturnType<typeof createTraceStore>

export function useTrace(store: TraceStore): TracePoint[] {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}
