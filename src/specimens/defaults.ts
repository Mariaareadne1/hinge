// Default behaviors for specimens used inside Hinge. Exported components replace
// this import with the exact behavior the user tuned (see export/generateReact.ts).
import { behaviorForSpecimen } from '../domain/schema'

export const CARD_BEHAVIOR = behaviorForSpecimen('lift', 'card')
export const BUTTON_BEHAVIOR = behaviorForSpecimen('lift', 'button')
export const TOKEN_BEHAVIOR = behaviorForSpecimen('magnet', 'token')
