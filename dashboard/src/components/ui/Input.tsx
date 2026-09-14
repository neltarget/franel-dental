import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "h-9 w-full rounded-control border border-border-strong bg-surface px-3 text-xs text-foreground placeholder:text-muted-2 focus:outline-none focus:border-primary focus:ring-[var(--shadow-ring)] transition-shadow disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "min-h-20 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-xs text-foreground placeholder:text-muted-2 focus:outline-none focus:border-primary focus:ring-[var(--shadow-ring)] transition-shadow resize-none",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export interface FieldProps
  extends React.HTMLAttributes<HTMLDivElement> {
  label: string
  hint?: string
}

const Field = React.forwardRef<HTMLDivElement, FieldProps>(
  ({ className, label, hint, children, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col gap-1.5", className)} {...props}>
      <label className="text-xs font-semibold text-foreground">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted-2">{hint}</p>}
    </div>
  )
)
Field.displayName = "Field"

export { Input, Textarea, Field }