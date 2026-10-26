import { useMemo, useState } from 'react'
import { DRAG_LIMITS, POSE_LIMITS, type HingeProject } from '../domain/schema'
import type { DragAxis, HingeBehavior, Pose } from '../runtime/runtime'
import { SPRING_LIMITS, springCharacter, stepResponse, type SpringParams } from '../runtime/spring'
import { ScrubField } from './ScrubField'
import { SpringGraph } from './SpringGraph'
import type { TraceStore } from '../state/traceStore'
import type { EditableState } from './Stage'

interface InstrumentProps {
  project: HingeProject
  selected: EditableState
  traceStore: TraceStore
  open: boolean
  onToggle: () => void
  onPreview: (p: HingeProject) => void
  onPush: (p: HingeProject) => void
  onCommit: () => void
}

type Section = 'spring' | 'shape'

const POSE_FIELDS: Array<{ key: keyof Pose; label: string; step: number; unit?: string; precision: number }> = [
  { key: 'y', label: 'Rise', step: 0.5, unit: 'px', precision: 1 },
  { key: 'scale', label: 'Scale', step: 0.005, precision: 3 },
  { key: 'rotate', label: 'Rotate', step: 0.25, unit: '°', precision: 2 },
  { key: 'lift', label: 'Elevation', step: 0.01, precision: 2 },
]

const SPRING_FIELDS: Array<{ key: keyof SpringParams; label: string; step: number; precision: number; hint: string }> = [
  { key: 'stiffness', label: 'Stiffness', step: 1, precision: 0, hint: 'Pull toward the pose' },
  { key: 'damping', label: 'Damping', step: 0.5, precision: 1, hint: 'How fast motion bleeds away' },
  { key: 'mass', label: 'Mass', step: 0.05, precision: 2, hint: 'How heavy it feels' },
]

const META: Record<EditableState, { graph: string; shape: string; trace: string }> = {
  hover: { graph: 'Rest → hover', shape: 'Pose', trace: 'Move onto the object to measure its rise.' },
  press: { graph: 'Hover → press', shape: 'Pose', trace: 'Press the object to measure it seating.' },
  drag: { graph: 'Release (from rest, no fling)', shape: 'Drag', trace: 'The release depends on the throw; the curve shows it from a standstill.' },
}

/**
 * The spring instrument: the response curve with its peak handle, then the
 * selected state's spring or its shape (pose / drag). Collapses to a one-line
 * summary so the stage can have the room.
 */
export function Instrument({ project, selected, traceStore, open, onToggle, onPreview, onPush, onCommit }: InstrumentProps) {
  const [section, setSection] = useState<Section>('spring')
  const b = project.behavior
  const withBehavior = (behavior: HingeBehavior): HingeProject => ({ ...project, behavior })

  const springOf = selected === 'drag' ? b.drag.spring : b[selected].spring
  const setSpring = (spring: SpringParams) =>
    withBehavior(selected === 'drag' ? { ...b, drag: { ...b.drag, spring } } : { ...b, [selected]: { ...b[selected], spring } })

  const meta = META[selected]
  const summary = useMemo(() => summarise(springOf), [springOf])

  return (
    <section
      className={`instrument${open ? ' is-open' : ''}`}
      id="instrument-panel"
      role="tabpanel"
      tabIndex={-1}
      aria-labelledby={`tab-${selected}`}
    >
      <header className="instrument__head">
        <h2 className="instrument__title">
          <span className="instrument__state">{selected}</span>
          <span className="instrument__summary" data-testid="instrument-summary">{summary}</span>
        </h2>
        <button type="button" className="instrument__toggle" aria-expanded={open} aria-controls="instrument-body" onClick={onToggle}>
          {open ? 'Hide' : 'Tune'}<span aria-hidden="true">{open ? '↘' : '↖'}</span>
        </button>
      </header>
      <div className="instrument__body" id="instrument-body" hidden={!open}>
        {open && <SpringGraph
          title={meta.graph}
          spring={springOf}
          traceStore={selected === 'drag' ? null : traceStore}
          traceHint={meta.trace}
          onPreview={(spring) => onPreview(setSpring(spring))}
          onCommit={onCommit}
        />}
        <div className="instrument__sections" role="group" aria-label="Show">
          {(['spring', 'shape'] as Section[]).map((s) => (
            <button key={s} type="button" aria-pressed={section === s} className="instrument__section-btn" onClick={() => setSection(s)}>
              {s === 'spring' ? 'Spring' : meta.shape}
            </button>
          ))}
        </div>
        {section === 'spring' ? (
          <fieldset className="instrument__fields">
            <legend className="visually-hidden">Spring</legend>
            {SPRING_FIELDS.map((f) => (
              <ScrubField
                key={f.key}
                label={f.label}
                hint={f.hint}
                value={springOf[f.key]}
                min={SPRING_LIMITS[f.key].min}
                max={SPRING_LIMITS[f.key].max}
                step={f.step}
                precision={f.precision}
                onPreview={(v) => onPreview(setSpring({ ...springOf, [f.key]: v }))}
                onCommit={onCommit}
              />
            ))}
          </fieldset>
        ) : selected !== 'drag' ? (
          <fieldset className="instrument__fields instrument__fields--two">
            <legend className="visually-hidden">Pose</legend>
            {POSE_FIELDS.map((f) => {
              const pose = b[selected].pose
              const display = f.key === 'y' ? -pose.y : pose[f.key]
              return (
                <ScrubField
                  key={f.key}
                  label={f.label}
                  value={display}
                  min={f.key === 'y' ? -POSE_LIMITS.y.max : POSE_LIMITS[f.key].min}
                  max={f.key === 'y' ? -POSE_LIMITS.y.min : POSE_LIMITS[f.key].max}
                  step={f.step}
                  unit={f.unit}
                  precision={f.precision}
                  onPreview={(v) =>
                    onPreview(withBehavior({ ...b, [selected]: { ...b[selected], pose: { ...pose, [f.key]: f.key === 'y' ? -v : v } } }))
                  }
                  onCommit={onCommit}
                />
              )
            })}
          </fieldset>
        ) : (
          <DragFields project={project} onPreview={onPreview} onPush={onPush} onCommit={onCommit} />
        )}
      </div>
    </section>
  )
}

function summarise(spring: SpringParams) {
  const r = stepResponse(spring, { duration: 0.1, samples: 2 })
  return `ζ ${springCharacter(spring).zeta.toFixed(2)} · ${(r.overshoot * 100).toFixed(0)}% · ${Math.round(r.settleTime * 1000)} ms`
}

function DragFields({ project, onPreview, onPush, onCommit }: Pick<InstrumentProps, 'project' | 'onPreview' | 'onPush' | 'onCommit'>) {
  const d = project.behavior.drag
  const set = (patch: Partial<HingeBehavior['drag']>) => ({ ...project, behavior: { ...project.behavior, drag: { ...d, ...patch } } })
  const L = DRAG_LIMITS
  return (
    <fieldset className="instrument__fields instrument__fields--two">
      <legend className="visually-hidden">Drag</legend>
      <div className="instrument__drag-head">
        <label className="check">
          <input type="checkbox" checked={d.enabled} onChange={(e) => onPush(set({ enabled: e.target.checked }))} />
          <span>Draggable</span>
        </label>
        <div className="segmented" role="radiogroup" aria-label="Drag axis">
          {(['both', 'x', 'y'] as DragAxis[]).map((axis) => (
            <label key={axis} className={`segmented__option${d.axis === axis ? ' is-on' : ''}`}>
              <input type="radio" name="axis" value={axis} checked={d.axis === axis} disabled={!d.enabled} onChange={() => onPush(set({ axis }))} />
              {axis === 'both' ? 'Free' : axis === 'x' ? '↔' : '↕'}
              {axis !== 'both' && <span className="visually-hidden">{axis === 'x' ? 'Horizontal' : 'Vertical'}</span>}
            </label>
          ))}
        </div>
      </div>
      <ScrubField label="Free travel" unit="px" value={d.radius} min={L.radius.min} max={L.radius.max} step={1} hint="Before the rubber band" onPreview={(v) => onPreview(set({ radius: v }))} onCommit={onCommit} />
      <ScrubField label="Elasticity" value={d.elasticity} min={0} max={1} step={0.01} precision={2} hint="0 holds · 1 is free" onPreview={(v) => onPreview(set({ elasticity: v }))} onCommit={onCommit} />
      <ScrubField label="Tilt" unit="°" value={d.tilt} min={L.tilt.min} max={L.tilt.max} step={0.5} precision={1} hint="Per 1000 px/s sideways" onPreview={(v) => onPreview(set({ tilt: v }))} onCommit={onCommit} />
      <ScrubField label="Held scale" value={d.scale} min={L.scale.min} max={L.scale.max} step={0.005} precision={3} onPreview={(v) => onPreview(set({ scale: v }))} onCommit={onCommit} />
      <ScrubField label="Held elevation" value={d.lift} min={0} max={1} step={0.01} precision={2} onPreview={(v) => onPreview(set({ lift: v }))} onCommit={onCommit} />
    </fieldset>
  )
}
