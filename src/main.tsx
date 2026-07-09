import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// HashRouter keeps deep links working on static hosts (GitHub Pages, Supabase Storage)
// that don't rewrite unknown paths to index.html. On Netlify the netlify.toml SPA
// redirect also supports BrowserRouter, but HashRouter works everywhere with no config.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
)
