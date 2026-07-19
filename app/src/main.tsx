import '@mantine/core/styles.layer.css'
import '@mantine/notifications/styles.layer.css'
import 'basalt-ui/styles.css'
import './styles/app.css'

import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import { error as logError } from '@tauri-apps/plugin-log'
import { BasaltProvider, createBasaltTheme } from 'basalt-ui'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

// Persist uncaught webview errors to the app log (~/Library/Logs/<identifier>/imagegen.log).
window.addEventListener('error', (event) => {
  void logError(`uncaught: ${event.message} (${event.filename}:${event.lineno})`)
})
window.addEventListener('unhandledrejection', (event) => {
  void logError(`unhandled rejection: ${String(event.reason)}`)
})

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element not found')

createRoot(rootEl).render(
  <StrictMode>
    <BasaltProvider theme={createBasaltTheme()} defaultColorScheme="dark">
      <ModalsProvider>
        <Notifications />
        <App />
      </ModalsProvider>
    </BasaltProvider>
  </StrictMode>,
)
