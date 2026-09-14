import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "./Button"

export interface DrawerProps {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  subtitle?: React.ReactNode
  width?: number
  children: React.ReactNode
  footer?: React.ReactNode
}

function Drawer({ open, onClose, title, subtitle, width = 440, children, footer }: DrawerProps) {
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-background/70 backdrop-blur-[2px] anim-fade" onClick={onClose} />
      <aside
        className="absolute right-0 top-0 flex h-full w-full flex-col border-l border-border bg-card shadow-pop anim-slide-right sm:max-w-[var(--drawer-w)]"
        style={{ "--drawer-w": `${width}px` } as React.CSSProperties}
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5">
          <div className="min-w-0">
            {title && <h2 className="font-display text-sm font-bold tracking-tight">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[11px] text-muted">{subtitle}</p>}
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close drawer">
            <X size={15} />
          </Button>
        </header>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && (
          <footer className="border-t border-border bg-surface-2/50 px-4 py-3">{footer}</footer>
        )}
      </aside>
    </div>
  )
}

export { Drawer }