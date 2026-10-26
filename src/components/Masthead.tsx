import { useEffect, useState, type CSSProperties } from 'react'
import type { Studio } from '../state/useStudio'
import type { InteractionState } from '../runtime/runtime'
import { sanitizeName } from '../domain/schema'

interface MastheadProps {
  studio: Studio
  live: InteractionState
  onLibrary: () => void
  onExport: () => void
}

const DATUM: Record<InteractionState, number> = { rest: 0, hover: 1, press: 2, drag: 3 }

export function Masthead({ studio, live, onLibrary, onExport }: MastheadProps) {
  const { project, actions, canUndo, canRedo, saveStatus } = studio
  const [name, setName] = useState(project.name)
  useEffect(() => setName(project.name), [project.name, project.id])

  const status =
    saveStatus.kind === 'saved' ? `Saved ${new Date(saveStatus.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : saveStatus.kind === 'pending' ? 'Saving…'
    : saveStatus.kind === 'paused' ? 'Autosave paused'
    : `Not saved — ${saveStatus.reason}`

  const commitName = () => {
    const clean = sanitizeName(name)
    if (name.trim() && clean !== project.name) actions.push({ ...project, name: clean })
    else setName(project.name)
  }

  return (
    <header className="mast">
      <div className="mast__id">
        <h1 className="mast__word">
          <span aria-hidden="true">HINGE</span>
          <span className="visually-hidden">Hinge</span>
          {/* The datum notch mirrors the object's live state: rest · hover · press · drag. */}
          <i className="mast__datum" style={{ '--datum': DATUM[live] } as CSSProperties} aria-hidden="true" />
        </h1>
        <span className="mast__issue">Motion workshop <span aria-hidden="true">/</span> 001</span>
      </div>
      <div className="mast__project">
        <label htmlFor="project-name" className="visually-hidden">Project name</label>
        <input id="project-name" className="mast__name" value={name} maxLength={48} spellCheck={false}
          onChange={(e) => setName(e.target.value)} onBlur={commitName}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
        <span className={`mast__status mast__status--${saveStatus.kind}`} title={status} data-testid="save-status">{status}</span>
        {/* Routine saves stay quiet; only problems are announced. */}
        <span className="visually-hidden" role="status">{saveStatus.kind === 'error' || saveStatus.kind === 'paused' ? status : ''}</span>
      </div>
      <div className="mast__actions">
        <button type="button" className="mast__icon" onClick={actions.undo} disabled={!canUndo} aria-label="Undo" title="Undo (⌘Z)">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5 3 9l4 4M3.5 9H12a5 5 0 0 1 0 10h-2" /></svg>
        </button>
        <button type="button" className="mast__icon" onClick={actions.redo} disabled={!canRedo} aria-label="Redo" title="Redo (⇧⌘Z)">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m13 5 4 4-4 4M16.5 9H8a5 5 0 0 0 0 10h2" /></svg>
        </button>
        <button type="button" id="open-library" className="mast__text" onClick={onLibrary} aria-haspopup="dialog">
          Library <span className="mast__count">{studio.projects.length}</span>
        </button>
        <button type="button" id="open-export" className="mast__export" onClick={onExport} aria-haspopup="dialog" aria-label="Export component">
          Export<span aria-hidden="true"> →</span>
        </button>
      </div>
    </header>
  )
}
