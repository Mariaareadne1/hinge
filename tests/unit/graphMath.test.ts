import { describe, expect, it } from 'vitest'
import { peakRange, reachablePeak } from '../../src/components/graphMath'
import { SPRING_LIMITS, springCharacter, stepResponse } from '../../src/runtime/spring'

const zetaFor = (os: number) => -Math.log(os) / Math.sqrt(Math.PI ** 2 + Math.log(os) ** 2)

describe('graph handle reachability', () => {
  it('keeps ζ when the requested peak is too fast or too slow for the limits', () => {
    for (const mass of [0.3, 1, 1.2, 4]) {
      for (const os of [0.01, 0.08, 0.3, 0.7]) {
        for (const tp of [0.005, 0.03, 0.4, 2.5, 10]) {
          const { spring } = reachablePeak(tp, os, mass)
          const within = (v: number, l: { min: number; max: number }) => v >= l.min - 1e-9 && v <= l.max + 1e-9
          expect(within(spring.stiffness, SPRING_LIMITS.stiffness)).toBe(true)
          expect(within(spring.damping, SPRING_LIMITS.damping)).toBe(true)
          const range = peakRange(os, mass)
          if (range.min < range.max) expect(springCharacter(spring).zeta).toBeCloseTo(zetaFor(os), 4)
        }
      }
    }
  })

  it('round-trips a reachable peak exactly and reports no clamp', () => {
    const { spring, clamped } = reachablePeak(0.34, 0.078, 1.2)
    expect(clamped).toBe(false)
    const r = stepResponse(spring, { duration: 0.1, samples: 2 })
    expect(r.peakTime).toBeCloseTo(0.34, 4)
    expect(r.overshoot).toBeCloseTo(0.078, 4)
  })

  it('reports a clamp when the pointer asks for the impossible', () => {
    // mass 1: stiffness ≤ 2000 means the peak cannot come sooner than ~70 ms at 10 % overshoot.
    expect(reachablePeak(0.02, 0.1, 1).clamped).toBe(true)
    expect(reachablePeak(0.3, 0.0001, 1).clamped).toBe(true)
  })
})
