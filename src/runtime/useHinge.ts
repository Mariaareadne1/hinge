/**
 * React binding for the Hinge runtime. Attach the returned ref to the element
 * that should respond; behavior changes are applied live without remounting.
 *
 * Copied verbatim into exported components.
 */
import { useEffect, useRef, useState } from 'react'
import { HingeRuntime, type ChannelValues, type HingeBehavior, type InteractionState } from './runtime'

export interface UseHingeOptions {
  onPress?: () => void
  onFrame?: (values: Readonly<ChannelValues>, state: InteractionState) => void
  /** Force reduced motion on or off. Defaults to the user's OS preference. */
  reducedMotion?: boolean
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.(REDUCED_MOTION_QUERY).matches === true,
  )
  useEffect(() => {
    const query = window.matchMedia?.(REDUCED_MOTION_QUERY)
    if (!query) return
    const update = () => setReduced(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return reduced
}

export function useHinge<T extends HTMLElement>(behavior: HingeBehavior, options: UseHingeOptions = {}) {
  const ref = useRef<T>(null)
  const runtime = useRef<HingeRuntime | null>(null)
  const prefersReduced = usePrefersReducedMotion()
  const reducedMotion = options.reducedMotion ?? prefersReduced

  // Latest callbacks without re-creating the runtime on every render.
  const callbacks = useRef(options)
  useEffect(() => {
    callbacks.current = options
  })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const instance = new HingeRuntime(el, behavior, {
      reducedMotion,
      onPress: () => callbacks.current.onPress?.(),
      onFrame: (values, state) => callbacks.current.onFrame?.(values, state),
    })
    runtime.current = instance
    return () => {
      instance.destroy()
      runtime.current = null
    }
    // The runtime is created once per element; later changes go through setters below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    runtime.current?.setBehavior(behavior)
  }, [behavior])

  useEffect(() => {
    runtime.current?.setOptions({
      reducedMotion,
      onPress: () => callbacks.current.onPress?.(),
      onFrame: (values, state) => callbacks.current.onFrame?.(values, state),
    })
  }, [reducedMotion])

  return ref
}
