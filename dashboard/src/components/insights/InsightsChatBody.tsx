import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import {
  Sparkles,
  SendHorizontal,
  Plus,
  History,
  Maximize2,
  Minimize2,
  AlertTriangle,
} from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Spinner } from "@/components/ui/Skeleton"
import { useInsightsChat } from "@/hooks/useInsightsChat"
import { timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { InsightsChatMessage } from "@/lib/types"

const SUGGESTIONS = [
  "Where do my next bookings come from?",
  "What do patients ask for most?",
  "How can I cut my no-shows?",
  "What should I do this week?",
]

export interface InsightsChatBodyProps {
  className?: string
  showMaximize?: boolean
  maximized?: boolean
  onToggleMax?: () => void
}

export function InsightsChatBody({ className, showMaximize = false, maximized = false, onToggleMax }: InsightsChatBodyProps) {
  const { threads, activeChat, messages, loading, sending, error, selectChat, startNewChat, send } = useInsightsChat()
  const [draft, setDraft] = useState("")
  const [showHistory, setShowHistory] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const lastKey = messages.length ? messages[messages.length - 1].id : "none"
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lastKey, sending])

  const submit = useCallback(() => {
    const q = draft.trim()
    if (!q || sending) return
    setDraft("")
    void send(q)
  }, [draft, sending, send])

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 pb-2.5">
        <span className="truncate text-[11px] font-mid text-muted">
          {activeChat ? `Thread · ${activeChat.title}` : "New analysis"}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <Button
            variant={showHistory ? "secondary" : "ghost"}
            size="icon-sm"
            onClick={() => setShowHistory((v) => !v)}
            aria-label="Chat history"
            title="Chat history"
          >
            <History size={14} />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={startNewChat} aria-label="New chat" title="New chat">
            <Plus size={14} />
          </Button>
          {showMaximize && onToggleMax && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onToggleMax}
              aria-label={maximized ? "Restore size" : "Maximize"}
              title={maximized ? "Restore size" : "Maximize"}
            >
              {maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </Button>
          )}
        </span>
      </div>

      {/* Thread history */}
      {showHistory && (
        <div className="shrink-0 border-b border-border px-4 py-2">
          <p className="px-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-2">Past chats</p>
          <div className="mt-1.5 max-h-32 space-y-0.5 overflow-y-auto px-1">
            {threads.length === 0 && <p className="px-1 py-1.5 text-[11px] text-muted">No past chats yet.</p>}
            {threads.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  void selectChat(t.id)
                  setShowHistory(false)
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] transition-colors",
                  t.id === activeChat?.id ? "bg-surface-2 font-semibold" : "text-muted hover:bg-surface-2/70 hover:text-foreground"
                )}
              >
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                <span className="shrink-0 text-[10px] text-muted-2">{timeAgo(t.updated_at)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3">
        {loading ? (
          <div className="flex items-center gap-2 px-1 py-4 text-[11.5px] text-muted">
            <Spinner className="size-3.5" /> Loading…
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 py-4 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-primary-soft text-primary">
              <Sparkles size={17} strokeWidth={2} />
            </span>
            <div>
              <p className="text-xs font-bold">Ask about your patient pipeline</p>
              <p className="mx-auto mt-1 max-w-[300px] text-[11px] leading-relaxed text-muted">
                I can only <b>see</b> your clinic data (conversations, bookings, patients) — I
                <b> can’t send or change</b> anything. Every answer is based on your own numbers.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <MessageBubble key={m.id} msg={m} />
          ))
        )}
        {sending && (
          <div className="flex items-center gap-2 px-1 text-[11px] text-muted">
            <span className="flex size-6 items-center justify-center rounded-full bg-primary-soft text-primary">
              <Sparkles size={12} className="pulse-dot" />
            </span>
            Franel Analyst is reading your clinic data…
          </div>
        )}
        {error && !sending && (
          <div className="flex items-start gap-2 rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-[11px] text-danger">
            <AlertTriangle size={13} className="mt-px shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="flex shrink-0 items-end gap-2 border-t border-border px-4 pt-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
onKeyDown={(e) => {
             if (e.key === "Enter" && !e.shiftKey) {
               e.preventDefault()
               submit()
             }
           }}
          rows={1}
          placeholder="Ask about bookings, pricing pressure, no-shows…"
          aria-label="Ask Franel Analyst"
          className="max-h-28 min-h-[38px] flex-1 resize-none rounded-control border border-border-strong bg-background px-3 py-2 text-xs outline-none transition-shadow focus:ring-[var(--shadow-ring)]"
        />
        <Button size="icon" onClick={submit} disabled={!draft.trim() || sending} aria-label="Send question">
          <SendHorizontal size={15} />
        </Button>
      </div>
      <p className="shrink-0 px-4 pt-2 text-center text-[10px] text-muted-2">Franel Analyst · read-only · Enter to send · Shift + Enter for a new line</p>
    </div>
  )
}

export function MessageBubble({ msg }: { msg: InsightsChatMessage }) {
  const isUser = msg.role === "user"
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-3 py-2 text-xs leading-relaxed text-white">
          {msg.content}
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Sparkles size={11} strokeWidth={2.2} />
      </span>
      <div className="max-w-[88%] space-y-0.5 rounded-2xl rounded-tl-md border border-border bg-surface-2/60 px-3 py-2 text-xs leading-relaxed">
        <MarkdownLite text={msg.content} />
      </div>
    </div>
  )
}

/** Tiny markdown-lite: **bold**, "- " bullets, blank lines. */
function MarkdownLite({ text }: { text: string }): ReactNode {
  const lines = text.split("\n")
  return (
    <>
      {lines.map((line, i) => {
        const trimmed = line.trim()
        if (!trimmed) return <div key={i} className="h-1.5" />
        const isBullet = trimmed.startsWith("- ")
        const body = isBullet ? trimmed.slice(2) : trimmed
        const nodes = bold(body)
        if (isBullet) {
          return (
            <div key={i} className="flex gap-1.5">
              <span className="select-none text-muted-2">•</span>
              <span className="min-w-0">{nodes}</span>
            </div>
          )
        }
        return <div key={i}>{nodes}</div>
      })}
    </>
  )
}

function bold(s: string): ReactNode {
  const parts = s.split(/\*\*(.+?)\*\*/g)
  if (parts.length === 1) return s
  return parts.map((p, i) => (i % 2 === 1 ? <strong key={i} className="font-bold">{p}</strong> : <span key={i}>{p}</span>))
}