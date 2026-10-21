import { useRef, useState } from 'react'
import { RECIPES, SPECIMENS, type HingeProject, type RecipeId, type SpecimenKind } from '../domain/schema'
import type { Studio } from '../state/useStudio'

interface ShelfProps {
  studio: Studio
}

export function Shelf({ studio }: ShelfProps) {
  const { project, projects, actions } = studio
  const fileInput = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const importFile = async (file: File) => {
    setImportError(null)
    if (file.size > 256 * 1024) {
      setImportError('That file is too large to be a Hinge config.')
      return
    }
    try {
      actions.importProject(JSON.parse(await file.text()))
    } catch (err) {
      setImportError(`Could not import: ${err instanceof Error ? err.message : 'unreadable file'}.`)
    }
  }

  return (
    <aside className="shelf" aria-label="Specimens and projects">
      <section className="shelf__section">
        <h2 className="shelf__heading">Specimen</h2>
        <div className="shelf__specimens" role="group" aria-label="Specimen">
          {SPECIMENS.map((s) => (
            <SpecimenButton key={s.kind} kind={s.kind} label={s.label} note={s.note} active={project.specimen === s.kind}
              onSelect={() => actions.setSpecimen(project, s.kind)} />
          ))}
        </div>
      </section>

      <section className="shelf__section">
        <h2 className="shelf__heading">Recipe</h2>
        <ul className="shelf__recipes">
          {(Object.keys(RECIPES) as RecipeId[]).map((id) => (
            <li key={id}>
              <button type="button" className="recipe" onClick={() => actions.applyRecipe(project, id)}>
                <span className="recipe__name">{RECIPES[id].label}</span>
                <span className="recipe__blurb">{RECIPES[id].blurb}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="shelf__note">Applying a recipe replaces this project’s behavior. Undo restores it.</p>
      </section>

      <section className="shelf__section shelf__section--grow">
        <div className="shelf__row">
          <h2 className="shelf__heading">Projects</h2>
          <button type="button" className="text-button" onClick={() => actions.create(project.specimen)}>New</button>
        </div>
        <ul className="shelf__projects">
          {projects.map((p) => (
            <ProjectRow key={p.id} p={p} current={p.id === project.id} studio={studio} />
          ))}
        </ul>
        <div className="shelf__row shelf__row--actions">
          <button type="button" className="text-button" onClick={() => actions.duplicate(project)}>Duplicate</button>
          <button type="button" className="text-button" onClick={() => fileInput.current?.click()}>Import config…</button>
          <input ref={fileInput} type="file" accept="application/json,.json" hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importFile(f)
              e.target.value = ''
            }} />
        </div>
        {importError && <p className="shelf__error" role="alert">{importError}</p>}
      </section>
    </aside>
  )
}

function SpecimenButton({ kind, label, note, active, onSelect }: { kind: SpecimenKind; label: string; note: string; active: boolean; onSelect: () => void }) {
  return (
    <button type="button" aria-pressed={active} className={`specimen-pick${active ? ' is-on' : ''}`} onClick={onSelect} data-kind={kind}>
      <span className={`specimen-pick__glyph specimen-pick__glyph--${kind}`} aria-hidden="true" />
      <span className="specimen-pick__text">
        <span className="specimen-pick__label">{label}</span>
        <span className="specimen-pick__note">{note}</span>
      </span>
    </button>
  )
}

function ProjectRow({ p, current, studio }: { p: HingeProject; current: boolean; studio: Studio }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <li className={`project${current ? ' is-current' : ''}`}>
      <button type="button" className="project__open" aria-current={current || undefined} onClick={() => studio.actions.open(p.id)}>
        <span className="project__name">{p.name}</span>
        <span className="project__meta">{p.specimen}</span>
      </button>
      {confirming ? (
        <span className="project__confirm">
          <button type="button" className="text-button text-button--danger" onClick={() => studio.actions.remove(p.id)}>Delete</button>
          <button type="button" className="text-button" onClick={() => setConfirming(false)}>Keep</button>
        </span>
      ) : (
        <button type="button" className="icon-button" aria-label={`Delete ${p.name}`} onClick={() => setConfirming(true)}>×</button>
      )}
    </li>
  )
}
