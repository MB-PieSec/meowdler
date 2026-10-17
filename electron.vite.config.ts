import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    // Sandboxed preloads must be CommonJS: emit a `.cjs` entry so the
    // packaged app (whose package.json is "type": "module") never treats
    // it as ESM — a plain `.js` CJS bundle broke that (`require` dies).
    build: {
      rolldownOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } },
    },
  },
  renderer: {
    plugins: [react()],
  },
})
