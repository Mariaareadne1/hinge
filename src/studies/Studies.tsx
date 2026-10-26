// H1 composition studies — dev only (?study=a | ?study=b). Temporary: removed once a direction is chosen.
// Both use the real Stage, SpringGraph and ScrubField so occlusion and scale can be judged honestly.
import { useState } from 'react'
import { useStudio } from '../state/useStudio'
import { createTraceStore } from '../state/traceStore'
import type { InteractionState } from '../runtime/runtime'
import { Stage, type EditableState } from '../components/Stage'
import { SpringGraph } from '../components/SpringGraph'
import { ScrubField } from '../components/ScrubField'
import { SPECIMENS } from '../domain/schema'
import './studies.css'

const STATES: InteractionState[] = ['rest', 'hover', 'press', 'drag']

export function Studies({ variant }: { variant: 'a' | 'b' }) {
  const studio = useStudio()
  const { project, actions } = studio
  const [traceStore] = useState(createTraceStore)
  const [live, setLive] = useState<InteractionState>('rest')
  const [selected, setSelected] = useState<EditableState>('hover')
  const spring = selected === 'drag' ? project.behavior.drag.spring : project.behavior[selected].spring
  const setSpring = (s: typeof spring) => ({
    ...project,
    behavior: selected === 'drag' ? { ...project.behavior, drag: { ...project.behavior.drag, spring: s } } : { ...project.behavior, [selected]: { ...project.behavior[selected], spring: s } },
  })

  const masthead = (
    <header className="s-mast">
      <span className="s-mast__mark">HINGE<i className="s-mast__notch" /></span>
      <span className="s-mast__sub">Motion workshop / 001</span>
      <span className="s-mast__status">{project.name} · saved</span>
      <button className="s-mast__export">Export</button>
    </header>
  )
  const rail = (
    <nav className="s-rail">
      {STATES.map((s, i) => (
        <button key={s} className={`s-rail__cell${s === selected ? ' is-sel' : ''}${s === live ? ' is-live' : ''}`}
          onClick={() => s !== 'rest' && setSelected(s as EditableState)}>
          <span className="s-rail__n">0{i + 1}</span>{s.toUpperCase()}
        </button>
      ))}
    </nav>
  )
  const specimens = (
    <div className="s-spec">
      {SPECIMENS.map((s) => (
        <button key={s.kind} className={project.specimen === s.kind ? 'is-on' : ''} onClick={() => actions.setSpecimen(project, s.kind)}>{s.label}</button>
      ))}
    </div>
  )
  const fields = (['stiffness', 'damping', 'mass'] as const).map((k) => (
    <ScrubField key={k} label={k[0]!.toUpperCase() + k.slice(1)} value={spring[k]} min={k === 'mass' ? 0.1 : 1} max={k === 'stiffness' ? 2000 : k === 'damping' ? 200 : 10}
      step={k === 'mass' ? 0.05 : 1} precision={k === 'mass' ? 2 : 0} onPreview={(v) => actions.preview(setSpring({ ...spring, [k]: v }))} onCommit={actions.commit} />
  ))
  const stage = (
    <Stage project={project} reducedMotion={false} traceFor={selected} onLiveState={setLive} onTrace={traceStore.set} onPress={() => {}} />
  )
  const graph = <SpringGraph title={`${selected} response`} spring={spring} traceStore={traceStore} onPreview={(s) => actions.preview(setSpring(s))} onCommit={actions.commit} />

  if (variant === 'a') {
    return (
      <div className="study study--a">
        {masthead}
        <div className="study__stage">{specimens}{stage}</div>
        <section className="study__console">
          {rail}
          <div className="study__fields">{fields}</div>
          <div className="study__graph">{graph}</div>
        </section>
      </div>
    )
  }
  return (
    <div className="study study--b">
      {masthead}
      <div className="study__stage">
        {stage}
        {specimens}
        {rail}
        <aside className="study__instrument">{graph}<div className="study__fields">{fields}</div></aside>
      </div>
    </div>
  )
}
