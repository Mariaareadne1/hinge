// Raw source text bundled into the app so exports contain the exact runtime
// Hinge itself runs. Vite inlines these at build time.
import spring from '../runtime/spring.ts?raw'
import runtime from '../runtime/runtime.ts?raw'
import useHinge from '../runtime/useHinge.ts?raw'
import card from '../specimens/HingeCard.tsx?raw'
import cardCss from '../specimens/hinge-card.css?raw'
import button from '../specimens/HingeButton.tsx?raw'
import buttonCss from '../specimens/hinge-button.css?raw'
import token from '../specimens/HingeToken.tsx?raw'
import tokenCss from '../specimens/hinge-token.css?raw'
import type { ExportSources } from './generateReact'

export const BUNDLED_SOURCES: ExportSources = {
  runtime: { 'spring.ts': spring, 'runtime.ts': runtime, 'useHinge.ts': useHinge },
  specimens: {
    card: { tsx: card, css: cardCss },
    button: { tsx: button, css: buttonCss },
    token: { tsx: token, css: tokenCss },
  },
}
