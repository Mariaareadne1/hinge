import { useMemo, useRef, useState } from 'react'
import { useTrace, createTraceStore, type TraceStore } from '../state/traceStore'
import { springAt, springCharacter, stepResponse, type SpringParams } from '../runtime/spring'
import { reachablePeak } from './graphMath'

export interface TracePoint {
  t: number
  value: number
}

interface SpringGraphProps {
  spring: SpringParams
  /** normalised samples measured from the live specimen (0 → 1); null hides the trace */
  traceStore: TraceStore | null
  title: string
  /** shown when there is no measured trace to explain how to get one */
  traceHint?: string
  onPreview: (spring: SpringParams) => void
  onCommit: () => void
}

const W = 440
const H = 200
const PAD = { l: 26, r: 12, t: 16, b: 24 }
const Y_MIN = -0.05
const Y_MAX = 1.75

const EMPTY_STORE = createTraceStore()

function spanFor(spring: SpringParams) {
  const quick = stepResponse(spring, { duration: 0.1, samples: 2 })
  return Math.min(3, Math.max(0.6, quick.settleTime * 1.25, (quick.peakTime ?? 0) * 2.2))
}

/**
 * The normalised step response of the selected spring, drawn from the same
 * closed-form solution the runtime uses, with the specimen's measured motion
 * overlaid. The peak handle edits the spring by its two most legible
 * properties: when it peaks and how far it overshoots. While the handle is
 * held the time axis is frozen so the mapping under the pointer stays continuous.
 */
export function SpringGraph({ spring, traceStore, title, traceHint, onPreview, onCommit }: SpringGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [frozenSpan, setFrozenSpan] = useState<number | null>(null)
  const [probe, setProbe] = useState<number | null>(null)
  const [clamped, setClamped] = useState(false)
  /** pointer-to-handle offset at grab, in model units, so the handle never jumps to the pointer */
  const grab = useRef({ dt: 0, dv: 0 })
  const trace = useTrace(traceStore ?? EMPTY_STORE)
  const dragging = frozenSpan !== null

  const naturalSpan = useMemo(() => spanFor(spring), [spring])
  const duration = frozenSpan ?? naturalSpan
  const { response, zeta } = useMemo(
    () => ({ response: stepResponse(spring, { duration, samples: 320 }), zeta: springCharacter(spring).zeta }),
    [spring, duration],
  )

  const x = (t: number) => PAD.l + (t / duration) * (W - PAD.l - PAD.r)
  const y = (v: number) => PAD.t + ((Y_MAX - Math.min(Y_MAX, Math.max(Y_MIN, v))) / (Y_MAX - Y_MIN)) * (H - PAD.t - PAD.b)
  const path = response.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(2)} ${y(p.value).toFixed(2)}`).join(' ')
  const traceVisible = trace.filter((p) => p.t <= duration)

  // Handle: the first peak when underdamped, otherwise the 99 % rise point on the target line.
  const handle = response.peakTime !== null
    ? { t: response.peakTime, v: 1 + response.overshoot }
    : { t: response.points.find((p) => p.value >= 0.99)?.t ?? response.settleTime, v: 1 }

  const toModel = (clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect()
    const sx = ((clientX - r.left) / r.width) * W
    const sy = ((clientY - r.top) / r.height) * H
    return {
      t: ((sx - PAD.l) / (W - PAD.l - PAD.r)) * duration,
      v: Y_MAX - ((sy - PAD.t) / (H - PAD.t - PAD.b)) * (Y_MAX - Y_MIN),
    }
  }

  const applyPeak = (t: number, overshoot: number) => {
    const next = reachablePeak(t, overshoot, spring.mass)
    setClamped(next.clamped)
    onPreview(next.spring)
  }

  const hasPeak = response.peakTime !== null
  const nudge = (dt: number, dOs: number) => {
    // Without a peak (ζ ≥ 1) there is nothing to nudge; a keypress must not rewrite the spring.
    if (!hasPeak) {
      setClamped(true)
      return
    }
    applyPeak(handle.t + dt, handle.v - 1 + dOs)
    onCommit()
  }

  const release = () => {
    setFrozenSpan(null)
    onCommit()
  }

  const ticks = Array.from({ length: Math.floor(duration / 0.1) + 1 }, (_, i) => i * 0.1)
  const probeValue = probe !== null ? 1 + springAt(spring, -1, 0, probe).x : null

  return (
    <figure className="graph">
      <figcaption className="graph__caption">
        <span className="graph__title">{title}</span>
        <span className="graph__legend">
          <i className="graph__swatch graph__swatch--model" />model
          <i className="graph__swatch graph__swatch--trace" />measured
        </span>
      </figcaption>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className={`graph__svg${dragging ? ' is-dragging' : ''}`}
        role="group"
        aria-label={`Step response: settles in ${response.settleTime.toFixed(2)} seconds, ${(response.overshoot * 100).toFixed(1)} percent overshoot.`}
        onPointerMove={(e) => {
          if (dragging || e.pointerType === 'touch') return
          const { t } = toModel(e.clientX, e.clientY)
          setProbe(t >= 0 && t <= duration ? t : null)
        }}
        onPointerLeave={() => setProbe(null)}
      >
        <rect x={x(0)} y={y(1.01)} width={x(duration) - x(0)} height={y(0.99) - y(1.01)} className="graph__band" />
        {ticks.map((t, i) => (
          <line key={t} x1={x(t)} x2={x(t)} y1={y(Y_MIN)} y2={y(Y_MIN) + (i % 5 === 0 ? 6 : 3)} className="graph__tick" />
        ))}
        {ticks.filter((_, i) => i % 5 === 0).map((t) => (
          <text key={t} x={x(t)} y={H - 6} className="graph__label" textAnchor="middle">{t.toFixed(1)}s</text>
        ))}
        <line x1={x(0)} x2={x(duration)} y1={y(1)} y2={y(1)} className="graph__target" />
        <line x1={x(0)} x2={x(duration)} y1={y(0)} y2={y(0)} className="graph__axis" />
        <text x={PAD.l - 6} y={y(1) + 3} className="graph__label" textAnchor="end">1</text>
        <text x={PAD.l - 6} y={y(0) + 3} className="graph__label" textAnchor="end">0</text>
        {response.settleTime <= duration && (
          <g>
            <line x1={x(response.settleTime)} x2={x(response.settleTime)} y1={y(Y_MAX) + 4} y2={y(Y_MIN)} className="graph__settle" />
            <text x={x(response.settleTime) + 4} y={y(Y_MAX) + 12} className="graph__label graph__label--settle">
              settled {Math.round(response.settleTime * 1000)} ms
            </text>
          </g>
        )}
        <path d={path} className="graph__curve" />
        {traceVisible.length > 1 && (
          <g className="graph__trace">
            {traceVisible.map((p, i) => <circle key={i} cx={x(p.t)} cy={y(p.value)} r={2} />)}
          </g>
        )}
        {probe !== null && probeValue !== null && (
          <g className="graph__probe" aria-hidden="true">
            <line x1={x(probe)} x2={x(probe)} y1={y(Y_MAX)} y2={y(Y_MIN)} />
            <circle cx={x(probe)} cy={y(probeValue)} r={2.5} />
            <text x={x(probe) + (x(probe) > W - 110 ? -6 : 6)} y={y(Y_MAX) + 26} textAnchor={x(probe) > W - 110 ? 'end' : 'start'} className="graph__label graph__label--probe">
              {Math.round(probe * 1000)} ms · {probeValue.toFixed(3)}
            </text>
          </g>
        )}
        <g
          className="graph__handle"
          transform={`translate(${x(handle.t)} ${y(handle.v)})`}
          tabIndex={0}
          role="slider"
          aria-label="Peak handle: arrow left and right change timing, up and down change overshoot"
          aria-valuetext={`peak at ${Math.round(handle.t * 1000)} ms, ${(response.overshoot * 100).toFixed(1)}% overshoot`}
          aria-valuenow={Math.round(response.overshoot * 1000) / 10}
          aria-valuemin={0}
          aria-valuemax={90}
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.currentTarget.setPointerCapture(e.pointerId)
            setProbe(null)
            const p = toModel(e.clientX, e.clientY)
            grab.current = { dt: handle.t - p.t, dv: handle.v - p.v }
            setFrozenSpan(duration)
          }}
          onPointerMove={(e) => {
            if (!dragging) return
            const p = toModel(e.clientX, e.clientY)
            applyPeak(p.t + grab.current.dt, p.v + grab.current.dv - 1)
          }}
          onPointerUp={release}
          onPointerCancel={release}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 5 : 1
            if (e.key === 'ArrowLeft') nudge(-0.01 * step, 0)
            else if (e.key === 'ArrowRight') nudge(0.01 * step, 0)
            else if (e.key === 'ArrowUp') nudge(0, 0.01 * step)
            else if (e.key === 'ArrowDown') nudge(0, -0.01 * step)
            else return
            e.preventDefault()
          }}
        >
          <circle r={16} className="graph__handle-hit" />
          <circle r={6} className="graph__handle-dot" />
        </g>
      </svg>
      <dl className="graph__stats">
        <div><dt>Damping <span className="graph__greek">ζ</span></dt><dd>{zeta.toFixed(2)}</dd></div>
        <div><dt>Peak</dt><dd>{response.peakTime !== null ? `${Math.round(response.peakTime * 1000)} ms` : '—'}</dd></div>
        <div><dt>Overshoot</dt><dd>{(response.overshoot * 100).toFixed(1)}%</dd></div>
        <div><dt>Settles ±1%</dt><dd>{Math.round(response.settleTime * 1000)} ms</dd></div>
      </dl>
      <p className="graph__note">
        {clamped && (dragging || !hasPeak)
          ? hasPeak
            ? 'At the limit — stiffness and damping can’t reach that peak. Use the fields for more.'
            : 'No peak to move: this spring does not overshoot (ζ ≥ 1). Lower Damping to get one.'
          : traceVisible.length > 1 ? `${traceVisible.length} frames measured from the specimen.`
          : traceHint ?? ''}
      </p>
    </figure>
  )
}
