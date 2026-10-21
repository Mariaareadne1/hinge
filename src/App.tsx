import { useCallback, useEffect, useState } from 'react'
import { useStudio } from './state/useStudio'
import { usePrefersReducedMotion } from './runtime/useHinge'
import type { InteractionState } from './runtime/runtime'
import { TopBar } from './components/TopBar'
import { Shelf } from './components/Shelf'
import { Stage, type EditableState } from './components/Stage'
import { BehaviorStrip } from './components/BehaviorStrip'
import { Inspector } from './components/Inspector'
import { ExportDialog } from './components/ExportDialog'
import { RecoveryBanner } from './components/RecoveryBanner'
import type { TracePoint } from './components/SpringGraph'

export default function App() {
  const studio = useStudio()
  const { project, actions } = studio
  const [selected, setSelected] = useState<EditableState>('hover')
  const [live, setLive] = useState<InteractionState>('rest')
  const [trace, setTrace] = useState<TracePoint[]>([])
  const [exporting, setExporting] = useState(false)
  const [pressCount, setPressCount] = useState(0)
  const osReduced = usePrefersReducedMotion()
  const [reducedOverride, setReducedOverride] = useState<boolean | null>(null)
  const reducedMotion = reducedOverride ?? osReduced

  const effectiveSelected = selected

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input[type="text"], textarea, dialog')) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) actions.redo()
        else actions.undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        actions.redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [actions])

  const onPress = useCallback(() => setPressCount((n) => n + 1), [])

  return (
    <div className="app">
      <a className="skip-link" href="#inspector-panel">Skip to inspector</a>
      <TopBar studio={studio} onExport={() => setExporting(true)} />
      <RecoveryBanner studio={studio} />
      <main className="lab">
        <Shelf studio={studio} />
        <div className="lab__center">
          <div className="lab__stage-head">
            <h1 className="lab__title">
              <span className="lab__title-kind">{project.specimen}</span> <em>study</em>
            </h1>
            <p className="lab__hint">
              Hover, press and drag the specimen — or Tab to it and use Space and the arrow keys.
              <span className="lab__presses" data-testid="press-count"> Presses: {pressCount}</span>
            </p>
            <label className="toggle toggle--small">
              <input type="checkbox" checked={reducedMotion} onChange={(e) => setReducedOverride(e.target.checked)} />
              <span>Reduced motion{reducedOverride === null && osReduced ? ' (system)' : ''}</span>
            </label>
          </div>
          <Stage
            project={project}
            reducedMotion={reducedMotion}
            traceFor={effectiveSelected}
            onLiveState={setLive}
            onTrace={setTrace}
            onPress={onPress}
          />
          <BehaviorStrip selected={effectiveSelected} live={live} dragEnabled={project.behavior.drag.enabled} onSelect={setSelected} />
        </div>
        <Inspector
          project={project}
          selected={effectiveSelected}
          trace={trace}
          onPreview={actions.preview}
          onPush={actions.push}
          onCommit={actions.commit}
        />
      </main>
      {exporting && <ExportDialog project={project} onClose={() => setExporting(false)} />}
    </div>
  )
}
