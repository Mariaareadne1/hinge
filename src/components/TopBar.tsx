import { useEffect, useState } from 'react'
import type { Studio } from '../state/useStudio'
import { sanitizeName } from '../domain/schema'

interface TopBarProps {
  studio: Studio
  onExport: () => void
}

export function TopBar({ studio, onExport }: TopBarProps) {
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
    <header className="topbar">
      <div className="topbar__brand">
        <span className="wordmark">Hinge</span>
        <span className="topbar__tagline">an instrument for interface motion</span>
      </div>
      <div className="topbar__project">
        <label htmlFor="project-name" className="visually-hidden">Project name</label>
        <input id="project-name" className="topbar__name" value={name} maxLength={48}
          onChange={(e) => setName(e.target.value)} onBlur={commitName}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
        <span className={`topbar__status topbar__status--${saveStatus.kind}`} role="status" data-testid="save-status">{status}</span>
      </div>
      <div className="topbar__actions">
        <button type="button" className="icon-button" onClick={actions.undo} disabled={!canUndo} aria-label="Undo" title="Undo (⌘Z)">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5 3 9l4 4M3.5 9H12a5 5 0 0 1 0 10h-2" /></svg>
        </button>
        <button type="button" className="icon-button" onClick={actions.redo} disabled={!canRedo} aria-label="Redo" title="Redo (⇧⌘Z)">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m13 5 4 4-4 4M16.5 9H8a5 5 0 0 0 0 10h2" /></svg>
        </button>
        <button type="button" className="primary-button" onClick={onExport}>Export component</button>
      </div>
    </header>
  )
}
