import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    // Sandboxed preloads must be CommonJS: emit a .js entry the sandboxed
    // wrapper can require (ESM preloads require `sandbox: false`).
    build: {
      rolldownOptions: { output: { format: 'cjs', entryFileNames: '[name].js' } },
    },
  },
  renderer: {
    plugins: [react()],
  },
})
