import { SPRING_LIMITS, springFromPeak, type SpringParams } from '../runtime/spring'

export const MIN_OVERSHOOT = 0.001
export const MAX_OVERSHOOT = 0.9

const zetaFor = (overshoot: number) => {
  const ln = Math.log(overshoot)
  return -ln / Math.sqrt(Math.PI * Math.PI + ln * ln)
}

/**
 * Peak times the handle can actually reach for a given overshoot and mass.
 * Stiffness and damping are clamped separately by the runtime, so a peak
 * outside this range would silently come back with a different ζ — the
 * handle would leave the pointer. ω₀ must satisfy k = mω₀² and c = 2ζmω₀
 * within SPRING_LIMITS; t_p = π / (ω₀√(1 − ζ²)).
 */
export function peakRange(overshoot: number, mass: number): { min: number; max: number } {
  const z = zetaFor(overshoot)
  const m = mass
  const S = SPRING_LIMITS
  const wMin = Math.max(Math.sqrt(S.stiffness.min / m), S.damping.min / (2 * z * m))
  const wMax = Math.min(Math.sqrt(S.stiffness.max / m), S.damping.max / (2 * z * m))
  const wd = Math.sqrt(1 - z * z)
  // An empty intersection (extreme mass) degenerates to the closest feasible point.
  const hi = Math.max(wMin, wMax)
  return { min: Math.PI / (hi * wd), max: Math.PI / (wMin * wd) }
}

/**
 * Spring whose step response peaks at `peakTime` with `overshoot`, clamped to
 * what the limits allow without changing ζ. `clamped` reports whether the
 * request had to move.
 */
export function reachablePeak(peakTime: number, overshoot: number, mass: number): { spring: SpringParams; clamped: boolean } {
  const os = Math.min(MAX_OVERSHOOT, Math.max(MIN_OVERSHOOT, overshoot))
  const range = peakRange(os, mass)
  // Tiny inset so floating-point round trips never land a hair outside the limits.
  const t = Math.min(range.max * 0.9999, Math.max(range.min * 1.0001, peakTime))
  return { spring: springFromPeak(t, os, mass), clamped: os !== overshoot || Math.abs(t - peakTime) > 1e-9 }
}
