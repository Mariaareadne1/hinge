/**
 * Hinge spring model — a damped harmonic oscillator solved in closed form.
 *
 *   m·x'' + c·x' + k·x = 0      x = displacement from the target, t in seconds
 *
 * stiffness (k), damping (c) and mass (m) are dimensionless "UI physics" units in
 * the same range as Framer Motion / React Spring (k ≈ 100–1000, c ≈ 10–40, m ≈ 1).
 * Because the solution is analytic, the curve Hinge draws, the motion on its
 * stage and the motion in an exported component are the same function of time;
 * nothing is integrated frame by frame, so frame rate cannot change the result.
 *
 * This file is copied verbatim into exported components. Keep it dependency-free.
 */

export interface SpringParams {
  stiffness: number
  damping: number
  mass: number
}

export const SPRING_LIMITS = {
  stiffness: { min: 10, max: 2000 },
  damping: { min: 1, max: 200 },
  mass: { min: 0.1, max: 10 },
} as const

const clampNumber = (value: number, min: number, max: number, fallback: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback

/** Clamp parameters into the stable, finite range the solver supports. */
export function sanitizeSpring(p: SpringParams): SpringParams {
  return {
    stiffness: clampNumber(p.stiffness, SPRING_LIMITS.stiffness.min, SPRING_LIMITS.stiffness.max, 300),
    damping: clampNumber(p.damping, SPRING_LIMITS.damping.min, SPRING_LIMITS.damping.max, 20),
    mass: clampNumber(p.mass, SPRING_LIMITS.mass.min, SPRING_LIMITS.mass.max, 1),
  }
}

/** Natural frequency ω₀ (rad/s) and damping ratio ζ. */
export function springCharacter(p: SpringParams): { omega0: number; zeta: number } {
  const { stiffness: k, damping: c, mass: m } = sanitizeSpring(p)
  return { omega0: Math.sqrt(k / m), zeta: c / (2 * Math.sqrt(k * m)) }
}

export interface SpringState {
  /** displacement from the target */
  x: number
  /** velocity in units per second */
  v: number
}

const CRITICAL_BAND = 1e-6

/**
 * Exact state at time t of a spring released with displacement x0 and velocity v0.
 */
export function springAt(p: SpringParams, x0: number, v0: number, t: number): SpringState {
  if (t <= 0) return { x: x0, v: v0 }
  const { omega0: w, zeta: z } = springCharacter(p)

  if (z < 1 - CRITICAL_BAND) {
    const wd = w * Math.sqrt(1 - z * z)
    const decay = Math.exp(-z * w * t)
    const cos = Math.cos(wd * t)
    const sin = Math.sin(wd * t)
    return {
      x: decay * (x0 * cos + ((v0 + z * w * x0) / wd) * sin),
      v: decay * (v0 * cos - ((w * w * x0 + z * w * v0) / wd) * sin),
    }
  }

  if (z > 1 + CRITICAL_BAND) {
    const root = Math.sqrt(z * z - 1)
    const r1 = -w * (z - root)
    const r2 = -w * (z + root)
    const a = (v0 - r2 * x0) / (r1 - r2)
    const b = x0 - a
    const e1 = Math.exp(r1 * t)
    const e2 = Math.exp(r2 * t)
    return { x: a * e1 + b * e2, v: a * r1 * e1 + b * r2 * e2 }
  }

  const decay = Math.exp(-w * t)
  const slope = v0 + w * x0
  return { x: (x0 + slope * t) * decay, v: (v0 - w * slope * t) * decay }
}

export interface StepResponse {
  /** samples of the normalised step response, 0 → 1 */
  points: Array<{ t: number; value: number }>
  /** time after which the response stays within `tolerance` of the target */
  settleTime: number
  /** peak overshoot past the target as a fraction (0.12 = 12 %) */
  overshoot: number
  /** time of the first peak, or null when the spring does not overshoot */
  peakTime: number | null
}

/**
 * Step response from rest at 0 to a target of 1 — the curve Hinge draws.
 * `duration` limits the sampled window; settle time is still computed exactly
 * by scanning past the window when necessary.
 */
export function stepResponse(
  p: SpringParams,
  { duration = 1.6, samples = 240, tolerance = 0.01 } = {},
): StepResponse {
  const points: StepResponse['points'] = []
  for (let i = 0; i <= samples; i++) {
    const t = (duration * i) / samples
    points.push({ t, value: 1 + springAt(p, -1, 0, t).x })
  }

  const { omega0: w, zeta: z } = springCharacter(p)
  let overshoot = 0
  let peakTime: number | null = null
  if (z < 1 - CRITICAL_BAND) {
    const wd = w * Math.sqrt(1 - z * z)
    peakTime = Math.PI / wd
    overshoot = Math.exp((-z * Math.PI) / Math.sqrt(1 - z * z))
  }

  return { points, settleTime: settleTime(p, tolerance), overshoot, peakTime }
}

/** Last time the unit step response is outside ±tolerance of its target. */
export function settleTime(p: SpringParams, tolerance = 0.01): number {
  const { omega0: w, zeta: z } = springCharacter(p)
  // Slowest decay rate bounds how long we need to scan.
  const slowest = z < 1 ? z * w : w * (z - Math.sqrt(Math.max(0, z * z - 1)))
  const horizon = Math.min(600, Math.max(0.05, (Math.log(1 / tolerance) + 3) / Math.max(slowest, 1e-6)))
  // At most ~4000 evaluations; resolution is never coarser than horizon / 4000.
  const dt = Math.max(1 / 960, horizon / 4000)
  let last = 0
  for (let t = 0; t <= horizon; t += dt) {
    if (Math.abs(springAt(p, -1, 0, t).x) > tolerance) last = t
  }
  return last
}

/**
 * Inverse mapping used by the graph's peak handle: choose the spring whose step
 * response peaks at `peakTime` seconds with the given `overshoot` fraction,
 * keeping mass fixed. Standard second-order relations:
 *   ζ = −ln(OS) / √(π² + ln²(OS)),   ω₀ = π / (t_p · √(1 − ζ²))
 */
export function springFromPeak(peakTime: number, overshoot: number, mass: number): SpringParams {
  const os = Math.min(0.9, Math.max(0.001, overshoot))
  const tp = Math.max(0.02, peakTime)
  const lnOs = Math.log(os)
  const zeta = -lnOs / Math.sqrt(Math.PI * Math.PI + lnOs * lnOs)
  const omega0 = Math.PI / (tp * Math.sqrt(1 - zeta * zeta))
  const m = sanitizeSpring({ stiffness: 300, damping: 20, mass }).mass
  const stiffness = m * omega0 * omega0
  const damping = 2 * zeta * Math.sqrt(stiffness * m)
  return sanitizeSpring({ stiffness, damping, mass: m })
}
