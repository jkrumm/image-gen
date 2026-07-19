import react from '@vitejs/plugin-react'
import { basaltViteConfig } from 'basalt-ui/vite'
import { defineConfig, mergeConfig } from 'vite'

// Tauri needs a fixed dev-server port (matches tauri.conf.json's devUrl) and must ignore
// src-tauri/ in its watcher, or Rust build output triggers spurious HMR reloads.
export default defineConfig(
  mergeConfig(basaltViteConfig({ port: 1420 }), {
    plugins: [react()],
    clearScreen: false,
    server: {
      watch: { ignored: ['**/src-tauri/**'] },
    },
  }),
)
