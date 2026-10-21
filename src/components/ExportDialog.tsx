import { useEffect, useMemo, useRef, useState } from 'react'
import type { HingeProject } from '../domain/schema'
import { componentName, EXPORT_DEPENDENCIES, generateReact } from '../export/generateReact'
import { BUNDLED_SOURCES } from '../export/sources'
import { createZip } from '../export/createBundle'

interface ExportDialogProps {
  project: HingeProject
  onClose: () => void
}

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

export function ExportDialog({ project, onClose }: ExportDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const code = useRef<HTMLTextAreaElement>(null)
  const result = useMemo(() => {
    try {
      return { files: generateReact(project, BUNDLED_SOURCES), error: null }
    } catch (err) {
      return { files: [], error: err instanceof Error ? err.message : 'Export failed.' }
    }
  }, [project])
  const [active, setActive] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const name = componentName(project.specimen)
  const file = result.files[active]

  useEffect(() => {
    const d = dialog.current
    if (d && !d.open) d.showModal()
  }, [])

  const copy = async () => {
    if (!file) return
    try {
      await navigator.clipboard.writeText(file.contents)
      setMessage(`Copied ${file.path}.`)
    } catch {
      code.current?.focus()
      code.current?.select()
      setMessage('Clipboard is blocked here — the code is selected; press ⌘C / Ctrl+C.')
    }
  }

  return (
    <dialog ref={dialog} className="export" aria-labelledby="export-title" onClose={onClose} onCancel={onClose}>
      <header className="export__head">
        <div>
          <p className="export__eyebrow">Export</p>
          <h2 id="export-title" className="export__title">{name}</h2>
          <p className="export__deps">
            React + TypeScript · depends on {Object.entries(EXPORT_DEPENDENCIES).map(([k, v]) => `${k} ${v}`).join(', ')} · no Hinge runtime service
          </p>
        </div>
        <button type="button" className="icon-button" aria-label="Close export" onClick={() => dialog.current?.close()}>×</button>
      </header>
      {result.error ? (
        <p className="export__error" role="alert">Export failed: {result.error}</p>
      ) : (
        <>
          <div className="export__tabs" role="tablist" aria-label="Exported files">
            {result.files.map((f, i) => (
              <button key={f.path} type="button" role="tab" aria-selected={i === active} className={`export__tab${i === active ? ' is-on' : ''}`} onClick={() => setActive(i)}>
                {f.path}
              </button>
            ))}
          </div>
          <label htmlFor="export-code" className="visually-hidden">{file?.path}</label>
          <textarea id="export-code" ref={code} className="export__code" readOnly spellCheck={false} value={file?.contents ?? ''} />
          <footer className="export__actions">
            <p className="export__message" role="status">{message}</p>
            <button type="button" className="secondary-button" onClick={copy}>Copy file</button>
            <button type="button" className="secondary-button"
              onClick={() => download(`${name}.hinge.json`, result.files.find((f) => f.path === 'hinge.config.json')!.contents, 'application/json')}>
              Download config
            </button>
            <button type="button" className="primary-button" onClick={() => {
              download(`${name}.zip`, createZip(name, result.files) as BlobPart, 'application/zip')
              setMessage(`Downloaded ${name}.zip (${result.files.length} files).`)
            }}>
              Download component (.zip)
            </button>
          </footer>
        </>
      )}
    </dialog>
  )
}
