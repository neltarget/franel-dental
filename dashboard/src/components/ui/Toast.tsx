import * as React from "react"
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "./Button"

type ToastVariant = "success" | "warning" | "danger" | "info"

interface ToastItem {
  id: number
  title: string
  description?: string
  variant: ToastVariant
}

interface ToastContextValue {
  toast: (title: string, opts?: { description?: string; variant?: ToastVariant }) => void
}

const ToastContext = React.createContext<ToastContextValue>({ toast: () => {} })

let nextId = 1

const ICONS = {
  success: <CheckCircle2 size={16} className="text-success" />,
  warning: <AlertTriangle size={16} className="text-warning" />,
  danger: <XCircle size={16} className="text-danger" />,
  info: <Info size={16} className="text-info" />,
} as const

function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([])

  const dismiss = React.useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = React.useCallback(
    (title: string, opts?: { description?: string; variant?: ToastVariant }) => {
      const id = nextId++
      setItems((prev) => [...prev.slice(-3), { id, title, variant: opts?.variant ?? "info", description: opts?.description }])
      window.setTimeout(() => dismiss(id), 4200)
    },
    [dismiss]
  )

  const value = React.useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[80] flex w-[320px] max-w-[calc(100vw-1.5rem)] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-2.5 rounded-control border border-border bg-card p-3 shadow-pop anim-slide-right"
            )}
            role="status"
          >
            <span className="mt-px shrink-0">{ICONS[t.variant]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold leading-tight">{t.title}</p>
              {t.description && (
                <p className="mt-0.5 text-[11px] leading-snug text-muted">{t.description}</p>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 rounded-md p-0.5 text-muted-2 hover:bg-surface-2 hover:text-foreground"
              aria-label="Dismiss notification"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function useToast() {
  return React.useContext(ToastContext)
}

export { ToastProvider, useToast }

// Re-export Button for consumers that import it alongside ToastProvider
export { Button }