import type { Page } from '@playwright/test'

export interface Sample {
  t: number
  x: number
  y: number
  scale: number
  rotate: number
}

/**
 * Start recording the computed transform of `selector` every animation frame.
 * Times are relative to the timeStamp of the first `startEvent` dispatched on
 * the element (captured before the runtime's own listener sees it).
 */
export async function startRecording(page: Page, selector: string, startEvent: string) {
  await page.evaluate(
    ({ selector, startEvent }) => {
      const el = document.querySelector(selector) as HTMLElement
      const w = window as unknown as { __rec: number[][]; __t0: number | null; __stop: boolean }
      w.__rec = []
      w.__t0 = null
      w.__stop = false
      el.addEventListener(startEvent, (e) => { if (w.__t0 === null) w.__t0 = e.timeStamp }, { capture: true, once: true })
      const tick = () => {
        if (w.__stop) return
        const m = new DOMMatrix(getComputedStyle(el).transform)
        w.__rec.push([performance.now(), m.m41, m.m42, Math.hypot(m.a, m.b), (Math.atan2(m.b, m.a) * 180) / Math.PI])
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    },
    { selector, startEvent },
  )
}

export async function stopRecording(page: Page): Promise<Sample[]> {
  const { rec, t0 } = await page.evaluate(() => {
    const w = window as unknown as { __rec: number[][]; __t0: number | null; __stop: boolean }
    w.__stop = true
    return { rec: w.__rec, t0: w.__t0 }
  })
  if (t0 === null) throw new Error('start event never fired')
  return rec
    .map(([t, x, y, scale, rotate]) => ({ t: (t! - t0) / 1000, x: x!, y: y!, scale: scale!, rotate: rotate! }))
    .filter((s) => s.t >= 0)
}

/** Linear interpolation of a channel at time t. */
export function at(samples: Sample[], key: keyof Sample, t: number): number {
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!
    const b = samples[i]!
    if (b.t >= t) {
      const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t)
      return a[key] + (b[key] - a[key]) * Math.max(0, Math.min(1, f))
    }
  }
  return samples[samples.length - 1]![key]
}

/** Max |a - b| for a channel over [from, to], sampled every 5 ms. */
export function maxDiff(a: Sample[], b: Sample[], key: keyof Sample, from: number, to: number): number {
  let worst = 0
  for (let t = from; t <= to; t += 0.005) worst = Math.max(worst, Math.abs(at(a, key, t) - at(b, key, t)))
  return worst
}

/**
 * Max deviation of measured samples from a model function over [from, to].
 * A frame-sampling recorder sees each value up to a frame or two after it was
 * written, so the best latency in [0, maxLag] is fitted and must stay small.
 */
export function modelError(
  samples: Sample[], key: keyof Sample, model: (t: number) => number, from: number, to: number, maxLag = 0.034,
): number {
  let best = Infinity
  for (let lag = 0; lag <= maxLag + 1e-9; lag += 0.001) {
    let worst = 0
    for (const s of samples) {
      if (s.t >= from && s.t <= to) worst = Math.max(worst, Math.abs(s[key] - model(Math.max(0, s.t - lag))))
    }
    best = Math.min(best, worst)
  }
  return best
}

export const peak = (samples: Sample[], key: keyof Sample, sign: 1 | -1) =>
  samples.reduce((m, s) => (sign * s[key] > sign * m ? s[key] : m), samples[0]![key])

/** First time after which the channel stays within tol of its final value. */
export function settledAt(samples: Sample[], key: keyof Sample, target: number, tol: number): number {
  let last = 0
  for (const s of samples) if (Math.abs(s[key] - target) > tol) last = s.t
  return last
}
