// Renders one exported component per ?case=… — nothing here imports Hinge itself.
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CASES } from './generated/cases'

function App() {
  const name = new URLSearchParams(location.search).get('case') ?? Object.keys(CASES)[0]!
  const Component = CASES[name]
  const [presses, setPresses] = useState(0)
  if (!Component) return <p>Unknown case {name}</p>
  return (
    <>
      <Component onPress={() => setPresses((n) => n + 1)} />
      <output data-testid="press-count" style={{ position: 'fixed', bottom: 8, left: 8 }}>{presses}</output>
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
