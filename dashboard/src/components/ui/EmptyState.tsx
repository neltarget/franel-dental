import * as React from "react"
import { cn } from "@/lib/utils"
import { Button, type ButtonProps } from "./Button"

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon: React.ReactNode
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  actionSize?: ButtonProps["size"]
}

function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionSize = "sm",
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border-strong px-6 py-10 text-center",
        className
      )}
      {...props}
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-surface-2 text-muted-2">
        {icon}
      </span>
      <p className="mt-1 text-[13px] font-semibold">{title}</p>
      {description && <p className="max-w-xs text-[11px] leading-relaxed text-muted">{description}</p>}
      {actionLabel && onAction && (
        <Button variant="outline" size={actionSize} className="mt-2.5" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  )
}

export { EmptyState }