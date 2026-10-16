import type { MeowdlerApi } from '../shared/api'

declare global {
  interface Window {
    /** Injected by the preload bridge; typed surface for the React app. */
    meowdler: MeowdlerApi
  }
}

export {}
