import * as React from "react"
import { cn } from "@/lib/utils"
import { initials } from "@/lib/format"

const PALETTE = [
  ["#0e8074", "#e0f2ef"],
  ["#4f5ded", "#e9ebfd"],
  ["#b45309", "#fef3c7"],
  ["#7c3aed", "#ede9fe"],
  ["#0369a1", "#e0f2fe"],
  ["#be123c", "#ffe4e6"],
  ["#15803d", "#dcfce7"],
  ["#5f7186", "#eef2f7"],
] as const

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export interface AvatarProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  name: string | null | undefined
  size?: "xs" | "sm" | "md" | "lg" | "xl"
  ring?: boolean
  online?: boolean
}

const SIZES = {
  xs: "size-6 text-[9px]",
  sm: "size-7 text-[10px]",
  md: "size-9 text-xs",
  lg: "size-11 text-sm",
  xl: "size-14 text-base",
} as const

function Avatar({
  name,
  size = "md",
  ring,
  online,
  className,
  ...props
}: AvatarProps) {
  const [fg, bg] = PALETTE[hashStr(name || "?") % PALETTE.length]
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full font-bold select-none",
          SIZES[size],
          ring && "ring-2 ring-card"
        )}
        style={{ color: fg, backgroundColor: bg }}
        {...props}
      >
        {initials(name)}
      </span>
      {online && (
        <span
          className="absolute -bottom-px -right-px size-2.5 rounded-full bg-success ring-2 ring-card"
          title="Online"
        />
      )}
    </span>
  )
}

export { Avatar }