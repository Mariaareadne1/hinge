import { useEffect, useMemo, useRef, useState } from 'react'
import type { HingeProject } from '../domain/schema'
import { componentName, EXPORT_DEPENDENCIES, generateReact, type ExportFile } from '../export/generateReact'
import { BUNDLED_SOURCES } from '../export/sources'
import { createZip } from '../export/createBundle'

interface ExportDialogProps {
  project: HingeProject
  onClose: () => void
  /** id of the control that opened the bench */
  returnFocusId: string
}

type Message = { kind: 'ok' | 'error'; text: string }

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Give the browser a moment to start the download before revoking.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const describe = (f: ExportFile) => `${f.contents.split('\n').length} lines · ${(new Blob([f.contents]).size / 1024).toFixed(1)} kB`

/**
 * The export bench: a separate, dark mode of the workshop. Shows the exact
 * files an export contains (generated from the project, not a mock-up) and
 * lets you copy one or download them all.
 */
export function ExportDialog({ project, onClose, returnFocusId }: ExportDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const code = useRef<HTMLTextAreaElement>(null)
  const result = useMemo(() => {
    try {
      return { files: generateReact(project, BUNDLED_SOURCES), error: null }
    } catch (err) {
      return { files: [] as ExportFile[], error: err instanceof Error ? err.message : 'Export failed.' }
    }
  }, [project])
  const [active, setActive] = useState(0)
  const [message, setMessage] = useState<Message | null>(null)
  const name = componentName(project.specimen)
  const file = result.files[active]

  useEffect(() => {
    const d = dialog.current
    if (d && !d.open) d.showModal()
    // The dialog unmounts on close, before the browser can restore focus (and WebKit
    // never focuses a clicked button), so return focus to the opener by id.
    return () => document.getElementById(returnFocusId)?.focus()
  }, [returnFocusId])

  const copy = async () => {
    if (!file) return
    try {
      if (!navigator.clipboard) throw new Error('no clipboard')
      await navigator.clipboard.writeText(file.contents)
      setMessage({ kind: 'ok', text: `Copied ${file.path} to the clipboard.` })
    } catch {
      code.current?.focus()
      code.current?.select()
      setMessage({ kind: 'error', text: 'The clipboard is blocked here — the code is selected; press ⌘C / Ctrl+C.' })
    }
  }

  const save = (what: 'zip' | 'config') => {
    try {
      if (what === 'zip') {
        download(`${name}.zip`, createZip(name, result.files) as BlobPart, 'application/zip')
        setMessage({ kind: 'ok', text: `Download of ${name}.zip started (${result.files.length} files).` })
      } else {
        const config = result.files.find((f) => f.path === 'hinge.config.json')
        if (!config) throw new Error('the export has no config file')
        download(`${name}.hinge.json`, config.contents, 'application/json')
        setMessage({ kind: 'ok', text: `Download of ${name}.hinge.json started.` })
      }
    } catch (err) {
      setMessage({ kind: 'error', text: `Could not prepare the download: ${err instanceof Error ? err.message : 'unknown error'}.` })
    }
  }

  return (
    <dialog ref={dialog} className="bench" aria-labelledby="export-title" onClose={onClose} onCancel={onClose}>
      <div className="bench__side">
        <header className="bench__head">
          <p className="bench__eyebrow">Export bench</p>
          <h2 id="export-title" className="bench__title">{name}</h2>
          <p className="bench__deps">
            React + TypeScript · depends on {Object.entries(EXPORT_DEPENDENCIES).map(([k, v]) => `${k} ${v}`).join(', ')} · runtime included, no service
          </p>
        </header>
        {!result.error && (
          <div className="bench__files" role="group" aria-label="Exported files">
            {result.files.map((f, i) => (
              <button key={f.path} type="button" aria-pressed={i === active} className="bench__file" onClick={() => setActive(i)}>
                <span className="bench__file-path">{f.path}</span>
                <span className="bench__file-meta">{describe(f)}</span>
              </button>
            ))}
          </div>
        )}
        {!result.error && (
          <footer className="bench__actions">
            <button type="button" className="bench__primary" onClick={() => save('zip')}>Download component (.zip)</button>
            <button type="button" className="bench__secondary" onClick={copy}>Copy file</button>
            <button type="button" className="bench__secondary" onClick={() => save('config')}>Download config</button>
            <p className={`bench__message${message?.kind === 'error' ? ' is-error' : ''}`} role="status">{message?.text}</p>
          </footer>
        )}
      </div>
      <div className="bench__main">
        <button type="button" className="bench__close" onClick={() => dialog.current?.close()}>
          Back to the stage <span aria-hidden="true">×</span>
        </button>
        {result.error ? (
          <p className="bench__error" role="alert">Export failed: {result.error}. Nothing was downloaded.</p>
        ) : (
          <>
            <label htmlFor="export-code" className="visually-hidden">{file?.path}</label>
            <textarea id="export-code" ref={code} className="bench__code" readOnly spellCheck={false} wrap="off" value={file?.contents ?? ''} />
          </>
        )}
      </div>
    </dialog>
  )
}
