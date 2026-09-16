import { useState } from "react"
import { useLocation } from "react-router-dom"
import { LogoMark } from "@/components/brand/Logo"
import { InsightsChat } from "./InsightsChat"

export function InsightsBubble() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [maximized, setMaximized] = useState(false)

  if (pathname === "/insights") return null

  return (
    <>
      <button
        onClick={() => {
          setMaximized(false)
          setOpen(true)
        }}
        aria-label="Open the Franel Analyst"
        title="Franel Analyst · AI"
        className="group fixed bottom-8 right-5 z-[60] flex size-12 items-center justify-center rounded-full bg-navy text-white shadow-pop transition-all hover:bg-navy-2 hover:scale-105 active:scale-95"
      >
        <LogoMark size={22} sparkClassName="fill-primary-soft" />
        <span className="pointer-events-none absolute right-14 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-navy px-2.5 py-1.5 text-[11px] font-semibold text-white opacity-0 shadow-pop transition-opacity group-hover:opacity-100">
          Ask Franel Analyst
        </span>
      </button>
      <InsightsChat open={open} onClose={() => setOpen(false)} maximized={maximized} onToggleMax={() => setMaximized((v) => !v)} />
    </>
  )
}