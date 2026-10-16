import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import type { DownloadItem, DownloadOptions, SubmitResult } from '../../shared/downloads'

/**
 * Renderer state for the download pipeline. Subscribes once to the
 * `download:changed` snapshot stream (upsert by id; unknown ids prepend)
 * and exposes thin command wrappers the views can call.
 */

/**
 * Electron wraps resolver rejections; this strips its wrapper text and
 * surfaces the original DownloadError message only.
 */
export function errorText(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  if (!raw.startsWith('Error invoking remote method')) return raw
  const marker = ': '
  const start = raw.indexOf(marker, raw.indexOf("'") + 1) + marker.length
  return raw
    .slice(start)
    .replace(/^(Error|DownloadError):\s*/, '')
    .trim()
}

interface DownloadsContextValue {
  items: readonly DownloadItem[]
  /** Probes + enqueues; rejects with a readable message on failure. */
  add: (url: string, options?: DownloadOptions) => Promise<SubmitResult>
  pause: (id: string) => void
  resume: (id: string) => void
  cancel: (id: string) => void
  retry: (id: string) => void
  remove: (id: string) => void
  reveal: (id: string) => void
  /** Clears every completed/failed/cancelled item, then refreshes. */
  clearHistory: () => Promise<void>
}

const DownloadsContext = createContext<DownloadsContextValue>({
  items: [],
  add: () => Promise.resolve({ items: [], note: null }),
  pause: () => {},
  resume: () => {},
  cancel: () => {},
  retry: () => {},
  remove: () => {},
  reveal: () => {},
  clearHistory: () => Promise.resolve(),
})

export const useDownloads = (): DownloadsContextValue => useContext(DownloadsContext)

export function DownloadsProvider({ children }: { children: ReactNode }): JSX.Element {
  const [items, setItems] = useState<readonly DownloadItem[]>([])

  // Upsert a snapshot: replace by id, prepend when the item is new
  // (main sorts newest-first, so prepend matches that order).
  const upsert = useCallback((item: DownloadItem): void => {
    setItems((current) => {
      const index = current.findIndex((existing) => existing.id === item.id)
      if (index === -1) return [item, ...current]
      const next = [...current]
      next[index] = item
      return next
    })
  }, [])

  useEffect(() => {
    void window.meowdler
      .listDownloads()
      .then(setItems)
      .catch(() => {})
    return window.meowdler.onDownloadChanged(upsert)
  }, [upsert])

  const add = useCallback(
    (url: string, options?: DownloadOptions): Promise<SubmitResult> =>
      window.meowdler.submitDownload(url, options),
    [],
  )

  const pause = useCallback((id: string): void => {
    window.meowdler.pauseDownload(id)
  }, [])
  const resume = useCallback((id: string): void => {
    window.meowdler.resumeDownload(id)
  }, [])
  const cancel = useCallback((id: string): void => {
    window.meowdler.cancelDownload(id)
  }, [])
  const retry = useCallback((id: string): void => {
    window.meowdler.retryDownload(id)
  }, [])
  const remove = useCallback((id: string): void => {
    window.meowdler.removeDownload(id)
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])
  const reveal = useCallback((id: string): void => {
    window.meowdler.revealDownload(id)
  }, [])
  const clearHistory = useCallback(async (): Promise<void> => {
    await window.meowdler.clearHistory()
    // Main drops all final-state items; the cheapest guarantee is a re-sync.
    await window.meowdler
      .listDownloads()
      .then(setItems)
      .catch(() => {})
  }, [])

  return (
    <DownloadsContext.Provider
      value={{
        items,
        add,
        pause,
        resume,
        cancel,
        retry,
        remove,
        reveal,
        clearHistory,
      }}
    >
      {children}
    </DownloadsContext.Provider>
  )
}
