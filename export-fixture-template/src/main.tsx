// Renders one exported component per ?case=… — nothing here imports Hinge itself.
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CASES } from './generated/cases'

function App() {
  const name = new URLSearchParams(location.search).get('case') ?? Object.keys(CASES)[0]!
  const Component = CASES[name]
  const [presses, setPresses] = useState(0)
  const [mounted, setMounted] = useState(true)
  const [submits, setSubmits] = useState(0)
  if (!Component) return <p>Unknown case {name}</p>
  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setSubmits((n) => n + 1)
        }}
      >
        {mounted && <Component type="submit" onPress={() => setPresses((n) => n + 1)} />}
      </form>
      <output data-testid="submit-count" style={{ position: 'fixed', bottom: 8, right: 8 }}>{submits}</output>
      <button data-testid="toggle" style={{ position: 'fixed', top: 8, left: 8 }} onClick={() => setMounted((m) => !m)}>
        toggle
      </button>
      <output data-testid="press-count" style={{ position: 'fixed', bottom: 8, left: 8 }}>{presses}</output>
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
