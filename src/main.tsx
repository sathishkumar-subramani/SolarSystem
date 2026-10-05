import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource/syncopate/latin-400.css'
import '@fontsource/syncopate/latin-700.css'
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-500.css'
import './styles.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(<App />)
