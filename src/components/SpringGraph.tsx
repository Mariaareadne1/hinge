import { useMemo, useRef, useState } from 'react'
import { useTrace, createTraceStore, type TraceStore } from '../state/traceStore'
import { springCharacter, springFromPeak, stepResponse, type SpringParams } from '../runtime/spring'

export interface TracePoint {
  t: number
  value: number
}

interface SpringGraphProps {
  spring: SpringParams
  /** normalised samples measured from the live specimen (0 → 1); null hides the trace */
  traceStore: TraceStore | null
  title: string
  onPreview: (spring: SpringParams) => void
  onCommit: () => void
}

const W = 300
const H = 168
const PAD = { l: 30, r: 10, t: 14, b: 26 }
const Y_MIN = -0.05
const Y_MAX = 1.75

/**
 * The normalised step response of the selected spring, drawn from the same
 * closed-form solution the runtime uses. The peak handle edits the spring by
 * its two most legible properties: when it peaks and how far it overshoots.
 */
const EMPTY_STORE = createTraceStore()

export function SpringGraph({ spring, traceStore, title, onPreview, onCommit }: SpringGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragging, setDragging] = useState(false)
  const trace = useTrace(traceStore ?? EMPTY_STORE)

  const { response, duration, zeta } = useMemo(() => {
    const quick = stepResponse(spring, { duration: 0.1, samples: 2 })
    const span = Math.min(3, Math.max(0.6, quick.settleTime * 1.25, (quick.peakTime ?? 0) * 2.2))
    return { response: stepResponse(spring, { duration: span, samples: 260 }), duration: span, zeta: springCharacter(spring).zeta }
  }, [spring])

  const x = (t: number) => PAD.l + (t / duration) * (W - PAD.l - PAD.r)
  const y = (v: number) => PAD.t + ((Y_MAX - Math.min(Y_MAX, Math.max(Y_MIN, v))) / (Y_MAX - Y_MIN)) * (H - PAD.t - PAD.b)
  const path = response.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(2)} ${y(p.value).toFixed(2)}`).join(' ')
  const traceVisible = trace.filter((p) => p.t <= duration)

  // Handle: the first peak when underdamped, otherwise the 99 % rise point on the target line.
  const handle = response.peakTime !== null
    ? { t: response.peakTime, v: 1 + response.overshoot }
    : { t: response.points.find((p) => p.value >= 0.99)?.t ?? response.settleTime, v: 1 }

  const fromPointer = (clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return
    const r = svg.getBoundingClientRect()
    const sx = ((clientX - r.left) / r.width) * W
    const sy = ((clientY - r.top) / r.height) * H
    const t = ((sx - PAD.l) / (W - PAD.l - PAD.r)) * duration
    const v = Y_MAX - ((sy - PAD.t) / (H - PAD.t - PAD.b)) * (Y_MAX - Y_MIN)
    onPreview(springFromPeak(Math.max(0.03, t), Math.max(0.001, v - 1), spring.mass))
  }

  const nudge = (dt: number, dOs: number) => {
    onPreview(springFromPeak(Math.max(0.03, handle.t + dt), Math.max(0.001, handle.v - 1 + dOs), spring.mass))
    onCommit()
  }

  const ticks = Array.from({ length: Math.floor(duration / 0.1) + 1 }, (_, i) => i * 0.1)

  return (
    <figure className="graph">
      <figcaption className="graph__caption">
        <span>{title}</span>
        <span className="graph__legend">
          <i className="graph__swatch graph__swatch--model" /> model
          <i className="graph__swatch graph__swatch--trace" /> measured
        </span>
      </figcaption>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className={`graph__svg${dragging ? ' is-dragging' : ''}`}
        role="img"
        aria-label={`Step response: settles in ${response.settleTime.toFixed(2)} seconds, ${(response.overshoot * 100).toFixed(1)} percent overshoot.`}
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
            {traceVisible.map((p, i) => <circle key={i} cx={x(p.t)} cy={y(p.value)} r={1.6} />)}
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
            e.currentTarget.setPointerCapture(e.pointerId)
            setDragging(true)
          }}
          onPointerMove={(e) => dragging && fromPointer(e.clientX, e.clientY)}
          onPointerUp={() => {
            setDragging(false)
            onCommit()
          }}
          onPointerCancel={() => {
            setDragging(false)
            onCommit()
          }}
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
          <circle r={14} className="graph__handle-hit" />
          <circle r={5.5} className="graph__handle-dot" />
        </g>
      </svg>
      <dl className="graph__stats">
        <div><dt>Damping ζ</dt><dd>{zeta.toFixed(2)}</dd></div>
        <div><dt>Overshoot</dt><dd>{(response.overshoot * 100).toFixed(1)}%</dd></div>
        <div><dt>Settles (±1%)</dt><dd>{Math.round(response.settleTime * 1000)} ms</dd></div>
      </dl>
    </figure>
  )
}
