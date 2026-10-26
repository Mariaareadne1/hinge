import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-serif/400-italic.css'
import '@fontsource/ibm-plex-serif/400.css'
import './styles/app.css'
import '@fontsource/ibm-plex-sans/700.css'
import App from './App'
import { Studies } from './studies/Studies'

const study = import.meta.env.DEV ? new URLSearchParams(location.search).get('study') : null

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {study === 'a' || study === 'b' ? <Studies variant={study} /> : <App />}
  </StrictMode>,
)
