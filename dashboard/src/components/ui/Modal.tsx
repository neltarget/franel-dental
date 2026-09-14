import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "./Button"

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  className?: string
}

function Modal({ open, onClose, title, description, children, className }: ModalProps) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/70 backdrop-blur-[2px] anim-fade" onClick={onClose} />
      <div
        className={cn(
          "relative w-full max-w-md rounded-card border border-border bg-card shadow-pop anim-pop",
          className
        )}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3 px-4 pt-4">
          <div>
            {title && <h2 className="font-display text-sm font-bold tracking-tight">{title}</h2>}
            {description && <p className="mt-1 text-[11px] text-muted">{description}</p>}
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close dialog">
            <X size={15} />
          </Button>
        </div>
        <div className="px-4 pb-4 pt-3">{children}</div>
      </div>
    </div>
  )
}

export { Modal }