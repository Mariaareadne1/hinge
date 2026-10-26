import { useEffect, useRef, useState } from 'react'
import type { HingeProject } from '../domain/schema'
import type { Studio } from '../state/useStudio'

const MAX_IMPORT_BYTES = 256 * 1024

interface LibraryProps {
  studio: Studio
  onClose: () => void
  /** id of the control that opened the library */
  returnFocusId: string
}

/** Projects: open, start new, duplicate, import a config, delete. A modal sheet from the left. */
export function Library({ studio, onClose, returnFocusId }: LibraryProps) {
  const { project, projects, actions } = studio
  const dialog = useRef<HTMLDialogElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)

  useEffect(() => {
    const d = dialog.current
    if (d && !d.open) d.showModal()
    // The dialog unmounts on close, before the browser can restore focus (and WebKit
    // never focuses a clicked button), so return focus to the opener by id.
    return () => document.getElementById(returnFocusId)?.focus()
  }, [returnFocusId])

  const importFile = async (file: File) => {
    setMessage(null)
    if (file.size > MAX_IMPORT_BYTES) {
      setMessage({ kind: 'error', text: 'That file is too large to be a Hinge config.' })
      return
    }
    try {
      const parsed = actions.importProject(JSON.parse(await file.text()))
      setMessage({ kind: 'ok', text: `Imported “${parsed.name}”.` })
    } catch (err) {
      setMessage({ kind: 'error', text: `Could not import: ${err instanceof Error ? err.message : 'unreadable file'}.` })
    }
  }

  return (
    <dialog ref={dialog} className="library" aria-labelledby="library-title" onClose={onClose} onCancel={onClose}>
      <header className="library__head">
        <h2 id="library-title" className="library__title" tabIndex={-1}>Library</h2>
        <button type="button" className="library__close" aria-label="Close library" onClick={() => dialog.current?.close()}>×</button>
      </header>
      <ul className="library__list">
        {projects.map((p) => (
          <ProjectRow key={p.id} p={p} current={p.id === project.id} studio={studio} onOpen={() => dialog.current?.close()} />
        ))}
      </ul>
      <div className="library__actions">
        <button type="button" className="line-button" onClick={() => { actions.create(project.specimen); dialog.current?.close() }}>New</button>
        <button type="button" className="line-button" onClick={() => actions.duplicate(project)}>Duplicate</button>
        <button type="button" className="line-button" onClick={() => fileInput.current?.click()}>Import config…</button>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden aria-label="Import config file"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void importFile(f)
            e.target.value = ''
          }} />
      </div>
      {message && (
        <p className={`library__message library__message--${message.kind}`} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p>
      )}
      <p className="library__note">Projects live in this browser’s storage. Export a config to move one elsewhere.</p>
    </dialog>
  )
}

function ProjectRow({ p, current, studio, onOpen }: { p: HingeProject; current: boolean; studio: Studio; onOpen: () => void }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <li className={`project${current ? ' is-current' : ''}`}>
      <button type="button" className="project__open" aria-current={current || undefined}
        onClick={() => { studio.actions.open(p.id); onOpen() }}>
        <span className="project__name">{p.name}</span>
        <span className="project__meta">{p.specimen}</span>
      </button>
      {confirming ? (
        <span className="project__confirm">
          <button type="button" className="line-button line-button--danger" onClick={() => {
            studio.actions.remove(p.id)
            // The focused row is about to disappear; keep focus inside the dialog.
            document.getElementById('library-title')?.focus()
          }}>Delete</button>
          <button type="button" className="line-button" onClick={() => setConfirming(false)}>Keep</button>
        </span>
      ) : (
        <button type="button" className="project__delete" aria-label={`Delete ${p.name}`} onClick={() => setConfirming(true)}>×</button>
      )}
    </li>
  )
}
