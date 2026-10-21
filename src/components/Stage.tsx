import { useCallback, useEffect, useRef } from 'react'
import type { HingeProject } from '../domain/schema'
import type { ChannelValues, InteractionState, Pose } from '../runtime/runtime'
import { HingeCard } from '../specimens/HingeCard'
import { HingeButton } from '../specimens/HingeButton'
import { HingeToken } from '../specimens/HingeToken'
import type { TracePoint } from './SpringGraph'

export type EditableState = 'hover' | 'press' | 'drag'

interface StageProps {
  project: HingeProject
  reducedMotion: boolean
  traceFor: EditableState
  onLiveState: (state: InteractionState) => void
  onTrace: (trace: TracePoint[]) => void
  onPress: () => void
}

const SCALES: Record<keyof Pose, number> = { y: 40, scale: 0.2, rotate: 15, lift: 1 }
const TRACE_SECONDS = 3

interface Recording {
  t0: number
  channel: keyof Pose
  from: number
  to: number
  points: TracePoint[]
}

/** Pick the channel whose change is largest relative to its range, so the trace is legible. */
function dominantChannel(from: ChannelValues, to: Pose): keyof Pose | null {
  let best: keyof Pose | null = null
  let bestSize = 0.02
  for (const c of Object.keys(SCALES) as Array<keyof Pose>) {
    const size = Math.abs(to[c] - from[c]) / SCALES[c]
    if (size > bestSize) {
      best = c
      bestSize = size
    }
  }
  return best
}

export function Stage({ project, reducedMotion, traceFor, onLiveState, onTrace, onPress }: StageProps) {
  const readout = useRef<HTMLOutputElement>(null)
  const lastState = useRef<InteractionState>('rest')
  const recording = useRef<Recording | null>(null)
  const behavior = project.behavior

  useEffect(() => {
    recording.current = null
    onTrace([])
  }, [behavior, traceFor, onTrace])

  const onFrame = useCallback(
    (v: Readonly<ChannelValues>, state: InteractionState) => {
      const t = performance.now() / 1000
      if (state !== lastState.current) {
        const prev = lastState.current
        lastState.current = state
        onLiveState(state)
        // Record the clean transitions whose curve the graph shows.
        const pose = traceFor === 'hover' && prev === 'rest' && state === 'hover' ? behavior.hover.pose
          : traceFor === 'press' && prev === 'hover' && state === 'press' ? behavior.press.pose
          : null
        const channel = pose && dominantChannel(v, pose)
        recording.current = pose && channel ? { t0: t, channel, from: v[channel], to: pose[channel], points: [] } : null
      }
      const rec = recording.current
      if (rec) {
        const dt = t - rec.t0
        if (dt > TRACE_SECONDS) {
          recording.current = null
        } else {
          rec.points.push({ t: dt, value: (v[rec.channel] - rec.from) / (rec.to - rec.from) })
          onTrace(rec.points.slice())
        }
      }
      if (readout.current) {
        readout.current.textContent =
          `x ${fmt(v.x)}  y ${fmt(v.y)}  scale ${v.scale.toFixed(3)}  rot ${fmt(v.rotate)}°  lift ${v.lift.toFixed(2)}`
      }
    },
    [behavior, traceFor, onLiveState, onTrace],
  )

  const common = { behavior, reducedMotion, onFrame, onPress }

  return (
    <section className="stage" aria-label="Stage">
      <div className="stage__rulers" aria-hidden="true">
        <span className="stage__crosshair stage__crosshair--h" />
        <span className="stage__crosshair stage__crosshair--v" />
      </div>
      <div className="stage__specimen" data-testid="stage-specimen">
        {project.specimen === 'card' && <HingeCard key="card" {...common} />}
        {project.specimen === 'button' && <HingeButton key="button" {...common} />}
        {project.specimen === 'token' && <HingeToken key="token" {...common} />}
      </div>
      <output ref={readout} className="stage__readout" aria-live="off" data-testid="readout">
        x 0.0  y 0.0  scale 1.000  rot 0.0°  lift 0.00
      </output>
    </section>
  )
}

function fmt(v: number) {
  return (Math.abs(v) < 0.05 ? 0 : v).toFixed(1)
}
