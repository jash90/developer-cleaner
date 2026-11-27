import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { homeDir } from '@tauri-apps/api/path'
import './index.css'
import App from './App.tsx'
import { setHomeFolder } from './utils/categories'

// Paths read as `~/…` only under the real home folder, so it is known before the first render.
// If it cannot be read, paths are shown in full.
homeDir()
  .then(setHomeFolder, () => setHomeFolder(null))
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
