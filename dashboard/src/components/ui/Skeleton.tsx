import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("shimmer rounded-lg bg-surface-2", className)} {...props} />
}

function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block size-4 animate-spin rounded-full border-2 border-border-strong border-t-primary",
        className
      )}
      role="status"
      aria-label="Loading"
    />
  )
}

export { Skeleton, Spinner }