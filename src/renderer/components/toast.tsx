import { createContext, useCallback, useContext, useState } from 'react'
import type { JSX, ReactNode } from 'react'

/**
 * Toast notifications (bottom-right, auto-dismiss). Used for quick feedback
 * like theme switches; error surfacing for downloads lands in Phase 2.
 */

type ToastKind = 'info' | 'success' | 'danger'

interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

type ToastFn = (message: string, kind?: ToastKind) => void

const ToastContext = createContext<ToastFn>(() => {})

export const useToast = (): ToastFn => useContext(ToastContext)

let nextToastId = 0

const AUTO_DISMISS_MS = 3200

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<readonly ToastItem[]>([])

  const push: ToastFn = useCallback((message, kind = 'info') => {
    const id = ++nextToastId
    setToasts((current) => [...current, { id, kind, message }])
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, AUTO_DISMISS_MS)
  }, [])

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-host">
        {toasts.map((toast) => (
          <div className={`toast toast-${toast.kind}`} key={toast.id} role="status">
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
