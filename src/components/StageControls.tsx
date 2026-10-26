import { RECIPES, SPECIMENS, type RecipeId } from '../domain/schema'
import type { Studio } from '../state/useStudio'

/**
 * What the object is, and what it should feel like. Two short rows pinned to
 * the stage's upper left: the specimen changer and the three recipes.
 */
export function StageControls({ studio }: { studio: Studio }) {
  const { project, actions } = studio
  return (
    <div className="controls">
      <div className="controls__row" role="group" aria-labelledby="controls-object">
        <span id="controls-object" className="controls__label">Object</span>
        {SPECIMENS.map((s) => (
          <button key={s.kind} type="button" className="controls__pick" aria-pressed={project.specimen === s.kind}
            title={s.note} onClick={() => actions.setSpecimen(project, s.kind)}>
            <span className={`controls__glyph controls__glyph--${s.kind}`} aria-hidden="true" />
            {s.label}
          </button>
        ))}
      </div>
      <div className="controls__row" role="group" aria-labelledby="controls-feel">
        <span id="controls-feel" className="controls__label">Feel</span>
        {(Object.keys(RECIPES) as RecipeId[]).map((id) => (
          <button key={id} type="button" className="controls__pick controls__pick--recipe"
            title={`${RECIPES[id].blurb}. Replaces this project’s behavior — ⌘Z restores it.`}
            onClick={() => actions.applyRecipe(project, id)}>
            {RECIPES[id].label}
            <span className="visually-hidden">: {RECIPES[id].blurb}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
