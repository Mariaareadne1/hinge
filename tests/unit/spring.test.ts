import { describe, expect, it } from 'vitest'
import { settleTime, springAt, springCharacter, springFromPeak, stepResponse, sanitizeSpring, SPRING_LIMITS } from '../../src/runtime/spring'

/** Reference: semi-implicit Euler at a tiny step, independent of the closed form. */
function integrate(p: { stiffness: number; damping: number; mass: number }, x0: number, v0: number, t: number) {
  let x = x0
  let v = v0
  const dt = 1e-5
  for (let s = 0; s < t; s += dt) {
    const a = (-p.stiffness * x - p.damping * v) / p.mass
    v += a * dt
    x += v * dt
  }
  return { x, v }
}

const cases = {
  underdamped: { stiffness: 300, damping: 10, mass: 1 },
  critical: { stiffness: 400, damping: 40, mass: 1 },
  overdamped: { stiffness: 200, damping: 80, mass: 1 },
  heavySoft: { stiffness: 10, damping: 1, mass: 10 },
}

describe('springAt (closed form)', () => {
  for (const [name, p] of Object.entries(cases)) {
    it(`matches numerical integration — ${name}`, () => {
      for (const t of [0.05, 0.2, 0.7]) {
        const exact = springAt(p, -1, 3, t)
        const ref = integrate(p, -1, 3, t)
        expect(exact.x).toBeCloseTo(ref.x, 3)
        expect(exact.v).toBeCloseTo(ref.v, 2)
      }
    })
  }

  it('returns the initial state at t = 0', () => {
    expect(springAt(cases.underdamped, 5, -2, 0)).toEqual({ x: 5, v: -2 })
  })

  it('classifies damping ratio', () => {
    expect(springCharacter(cases.underdamped).zeta).toBeLessThan(1)
    expect(springCharacter(cases.critical).zeta).toBeCloseTo(1, 6)
    expect(springCharacter(cases.overdamped).zeta).toBeGreaterThan(1)
  })

  it('stays finite and converges at every corner of the parameter space', () => {
    const { stiffness: k, damping: c, mass: m } = SPRING_LIMITS
    for (const stiffness of [k.min, k.max])
      for (const damping of [c.min, c.max])
        for (const mass of [m.min, m.max]) {
          const p = { stiffness, damping, mass }
          for (const t of [0, 0.001, 0.1, 1, 10]) {
            const s = springAt(p, -1, 0, t)
            expect(Number.isFinite(s.x) && Number.isFinite(s.v)).toBe(true)
            expect(Math.abs(s.x)).toBeLessThanOrEqual(1.0001)
          }
          expect(Math.abs(springAt(p, -1, 0, settleTime(p) + 0.01).x)).toBeLessThan(0.0101)
        }
  })
})

describe('stepResponse', () => {
  it('overshoot matches the analytic relation and the sampled curve', () => {
    const r = stepResponse(cases.underdamped, { duration: 1, samples: 4000 })
    const sampledPeak = Math.max(...r.points.map((p) => p.value)) - 1
    expect(sampledPeak).toBeCloseTo(r.overshoot, 3)
    expect(r.peakTime).not.toBeNull()
  })

  it('critically and over-damped springs never overshoot', () => {
    for (const p of [cases.critical, cases.overdamped]) {
      const r = stepResponse(p, { duration: 2, samples: 2000 })
      expect(r.overshoot).toBe(0)
      expect(r.peakTime).toBeNull()
      for (const pt of r.points) expect(pt.value).toBeLessThanOrEqual(1 + 1e-9)
    }
  })

  it('more damping settles an underdamped spring sooner', () => {
    expect(settleTime({ stiffness: 300, damping: 20, mass: 1 })).toBeLessThan(settleTime({ stiffness: 300, damping: 8, mass: 1 }))
  })

  it('more mass slows the response', () => {
    const light = stepResponse({ stiffness: 300, damping: 20, mass: 0.5 })
    const heavy = stepResponse({ stiffness: 300, damping: 20, mass: 3 })
    expect(heavy.points[20]!.value).toBeLessThan(light.points[20]!.value)
  })
})

describe('springFromPeak (graph handle inverse)', () => {
  it('round-trips peak time and overshoot', () => {
    for (const [tp, os] of [[0.2, 0.1], [0.35, 0.3], [0.12, 0.02]] as const) {
      const p = springFromPeak(tp, os, 1)
      const r = stepResponse(p)
      expect(r.peakTime!).toBeCloseTo(tp, 3)
      expect(r.overshoot).toBeCloseTo(os, 3)
    }
  })
})

describe('sanitizeSpring', () => {
  it('clamps out-of-range and non-finite values', () => {
    expect(sanitizeSpring({ stiffness: -5, damping: NaN, mass: 1e9 })).toEqual({ stiffness: 10, damping: 20, mass: 10 })
  })
})
