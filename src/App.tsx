import { useCallback, useEffect, useState } from 'react'
import { useStudio } from './state/useStudio'
import { usePrefersReducedMotion } from './runtime/useHinge'
import type { InteractionState } from './runtime/runtime'
import { Masthead } from './components/Masthead'
import { Stage, type EditableState } from './components/Stage'
import { BehaviorRail } from './components/BehaviorRail'
import { Instrument } from './components/Instrument'
import { StageControls } from './components/StageControls'
import { Library } from './components/Library'
import { ExportDialog } from './components/ExportDialog'
import { RecoveryBanner } from './components/RecoveryBanner'
import { createTraceStore } from './state/traceStore'

const INSTRUMENT_KEY = 'hinge.ui.instrument'
const NARROW_QUERY = '(max-width: 899px)'
const STATE_KEYS: Record<string, EditableState> = { '2': 'hover', '3': 'press', '4': 'drag' }

/** Per-viewer convenience only: the instrument's open/closed state. Never required to work. */
function initialInstrumentOpen(): boolean {
  try {
    const saved = localStorage.getItem(INSTRUMENT_KEY)
    if (saved === 'open' || saved === 'closed') return saved === 'open'
  } catch {
    // storage blocked: fall through to the layout default
  }
  return !window.matchMedia?.(NARROW_QUERY).matches
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && !!target.closest('input, textarea, select, [contenteditable="true"], dialog')

export default function App() {
  const studio = useStudio()
  const { project, actions } = studio
  const [selected, setSelected] = useState<EditableState>('hover')
  const [live, setLive] = useState<InteractionState>('rest')
  const [traceStore] = useState(createTraceStore)
  const [exporting, setExporting] = useState(false)
  const [library, setLibrary] = useState(false)
  const [instrumentOpen, setInstrumentOpen] = useState(initialInstrumentOpen)
  const [pressCount, setPressCount] = useState(0)
  const osReduced = usePrefersReducedMotion()
  const [reducedOverride, setReducedOverride] = useState<boolean | null>(null)
  const reducedMotion = reducedOverride ?? osReduced

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && !isTyping(e.target) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) actions.redo()
        else actions.undo()
      } else if (mod && !isTyping(e.target) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        actions.redo()
      } else if (!mod && !e.altKey && !isTyping(e.target) && STATE_KEYS[e.key]) {
        setSelected(STATE_KEYS[e.key]!)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [actions])

  const toggleInstrument = () => {
    setInstrumentOpen((open) => {
      try {
        localStorage.setItem(INSTRUMENT_KEY, open ? 'closed' : 'open')
      } catch {
        // per-viewer preference only
      }
      return !open
    })
  }

  const onPress = useCallback(() => setPressCount((n) => n + 1), [])

  return (
    <div className="workshop" data-instrument={instrumentOpen ? 'open' : 'closed'}>
      <a className="skip-link" href="#instrument-panel">Skip to the spring instrument</a>
      <Masthead studio={studio} live={live} onLibrary={() => setLibrary(true)} onExport={() => setExporting(true)} />
      <RecoveryBanner studio={studio} />
      <main className="floor">
        <Stage
          project={project}
          reducedMotion={reducedMotion}
          traceFor={selected}
          onLiveState={setLive}
          onTrace={traceStore.set}
          onPress={onPress}
        />
        <p className="floor__tip">Touch the object — hover, press, drag, throw. The curve records what it did.</p>
        <StageControls studio={studio} />
        <BehaviorRail selected={selected} live={live} dragEnabled={project.behavior.drag.enabled} onSelect={setSelected} />
        <Instrument
          project={project}
          selected={selected}
          traceStore={traceStore}
          open={instrumentOpen}
          onToggle={toggleInstrument}
          onPreview={actions.preview}
          onPush={actions.push}
          onCommit={actions.commit}
        />
        <div className="floor__foot">
          <span className="floor__presses" data-testid="press-count">Presses: {pressCount}</span>
          <label className="check check--quiet">
            <input type="checkbox" checked={reducedMotion} onChange={(e) => setReducedOverride(e.target.checked)} />
            <span>Reduced motion{reducedOverride === null && osReduced ? ' (system)' : ''}</span>
          </label>
        </div>
      </main>
      {library && <Library studio={studio} returnFocusId="open-library" onClose={() => setLibrary(false)} />}
      {exporting && <ExportDialog project={project} returnFocusId="open-export" onClose={() => setExporting(false)} />}
    </div>
  )
}
