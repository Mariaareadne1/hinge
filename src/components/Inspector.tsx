import { DRAG_LIMITS, POSE_LIMITS, type HingeProject } from '../domain/schema'
import type { DragAxis, HingeBehavior, Pose } from '../runtime/runtime'
import { SPRING_LIMITS, type SpringParams } from '../runtime/spring'
import { ScrubField } from './ScrubField'
import { SpringGraph } from './SpringGraph'
import type { TraceStore } from '../state/traceStore'
import type { EditableState } from './Stage'

interface InspectorProps {
  project: HingeProject
  selected: EditableState
  traceStore: TraceStore
  onPreview: (p: HingeProject) => void
  onPush: (p: HingeProject) => void
  onCommit: () => void
}

const POSE_FIELDS: Array<{ key: keyof Pose; label: string; step: number; unit?: string; precision: number }> = [
  { key: 'y', label: 'Rise', step: 0.5, unit: 'px', precision: 1 },
  { key: 'scale', label: 'Scale', step: 0.005, precision: 3 },
  { key: 'rotate', label: 'Rotate', step: 0.25, unit: '°', precision: 2 },
  { key: 'lift', label: 'Elevation', step: 0.01, precision: 2 },
]

const SPRING_FIELDS: Array<{ key: keyof SpringParams; label: string; step: number; precision: number; hint: string }> = [
  { key: 'stiffness', label: 'Stiffness', step: 1, precision: 0, hint: 'How hard it pulls toward the pose' },
  { key: 'damping', label: 'Damping', step: 0.5, precision: 1, hint: 'How quickly motion bleeds away' },
  { key: 'mass', label: 'Mass', step: 0.05, precision: 2, hint: 'How heavy it feels to move' },
]

const TITLES: Record<EditableState, { title: string; graph: string; intro: string }> = {
  hover: { title: 'Hover', graph: 'Rest → hover response', intro: 'Pointer over or keyboard focus. Rise is upward travel.' },
  press: { title: 'Press', graph: 'Hover → press response', intro: 'Pointer down, or Space / Enter. Make it read as seated, not lifted.' },
  drag: { title: 'Drag & release', graph: 'Release response (from rest, no fling)', intro: 'Follows the pointer, then springs home with the throw’s velocity.' },
}

export function Inspector({ project, selected, traceStore, onPreview, onPush, onCommit }: InspectorProps) {
  const b = project.behavior
  const withBehavior = (behavior: HingeBehavior): HingeProject => ({ ...project, behavior })

  const springOf = selected === 'drag' ? b.drag.spring : b[selected].spring
  const setSpring = (spring: SpringParams) =>
    withBehavior(selected === 'drag' ? { ...b, drag: { ...b.drag, spring } } : { ...b, [selected]: { ...b[selected], spring } })

  const meta = TITLES[selected]
  const s = SPRING_LIMITS

  return (
    <aside className="inspector" id="inspector-panel" role="tabpanel" aria-labelledby={`tab-${selected}`}>
      <header className="inspector__head">
        <h2 className="inspector__title">{meta.title}</h2>
        <p className="inspector__intro">{meta.intro}</p>
      </header>

      <SpringGraph
        title={meta.graph}
        spring={springOf}
        traceStore={selected === 'drag' ? null : traceStore}
        onPreview={(spring) => onPreview(setSpring(spring))}
        onCommit={onCommit}
      />

      <fieldset className="inspector__group">
        <legend>Spring</legend>
        {SPRING_FIELDS.map((f) => (
          <ScrubField
            key={f.key}
            label={f.label}
            hint={f.hint}
            value={springOf[f.key]}
            min={s[f.key].min}
            max={s[f.key].max}
            step={f.step}
            precision={f.precision}
            onPreview={(v) => onPreview(setSpring({ ...springOf, [f.key]: v }))}
            onCommit={onCommit}
          />
        ))}
      </fieldset>

      {selected !== 'drag' ? (
        <fieldset className="inspector__group">
          <legend>Pose</legend>
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
    </aside>
  )
}

function DragFields({ project, onPreview, onPush, onCommit }: Omit<InspectorProps, 'selected' | 'traceStore'>) {
  const d = project.behavior.drag
  const set = (patch: Partial<HingeBehavior['drag']>) => ({ ...project, behavior: { ...project.behavior, drag: { ...d, ...patch } } })
  const L = DRAG_LIMITS
  return (
    <fieldset className="inspector__group">
      <legend>Drag</legend>
      <label className="toggle">
        <input type="checkbox" checked={d.enabled} onChange={(e) => onPush(set({ enabled: e.target.checked }))} />
        <span>Draggable</span>
      </label>
      <div className="segmented" role="radiogroup" aria-label="Drag axis">
        {(['both', 'x', 'y'] as DragAxis[]).map((axis) => (
          <label key={axis} className={`segmented__option${d.axis === axis ? ' is-on' : ''}`}>
            <input type="radio" name="axis" value={axis} checked={d.axis === axis} disabled={!d.enabled} onChange={() => onPush(set({ axis }))} />
            {axis === 'both' ? 'Free' : axis === 'x' ? 'Horizontal' : 'Vertical'}
          </label>
        ))}
      </div>
      <ScrubField label="Free travel" unit="px" value={d.radius} min={L.radius.min} max={L.radius.max} step={1} hint="Distance before the rubber band engages" onPreview={(v) => onPreview(set({ radius: v }))} onCommit={onCommit} />
      <ScrubField label="Elasticity" value={d.elasticity} min={0} max={1} step={0.01} precision={2} hint="0 holds at the edge · 1 is no resistance" onPreview={(v) => onPreview(set({ elasticity: v }))} onCommit={onCommit} />
      <ScrubField label="Tilt" unit="°" value={d.tilt} min={L.tilt.min} max={L.tilt.max} step={0.5} precision={1} hint="Degrees per 1000 px/s of sideways speed" onPreview={(v) => onPreview(set({ tilt: v }))} onCommit={onCommit} />
      <ScrubField label="Held scale" value={d.scale} min={L.scale.min} max={L.scale.max} step={0.005} precision={3} onPreview={(v) => onPreview(set({ scale: v }))} onCommit={onCommit} />
      <ScrubField label="Held elevation" value={d.lift} min={0} max={1} step={0.01} precision={2} onPreview={(v) => onPreview(set({ lift: v }))} onCommit={onCommit} />
    </fieldset>
  )
}
