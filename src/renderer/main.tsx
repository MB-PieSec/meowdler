import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/main.css'
import './styles/components.css'
import './theme/flavors.css'

const container = document.getElementById('root')
if (!container) {
  throw new Error('Fatal: #root element missing from index.html')
}

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
