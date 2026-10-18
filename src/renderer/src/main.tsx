import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/index.css'

async function boot(): Promise<void> {
  // Desktop: the preload script already exposed the bridge. Android / web:
  // run the core in-page (loaded on demand so the desktop bundle stays lean).
  if (!window.storyteller) {
    const { createWebApi } = await import('./platform/web')
    window.storyteller = await createWebApi()
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

boot()
