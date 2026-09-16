import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/hooks/useAuth"
import { useLayoutData } from "@/components/layout/Layout"
import { useToast } from "@/components/ui/Toast"
import { askInsights, type ChatHistoryMsg } from "@/lib/insightsChat"
import type { InsightsChat, InsightsChatMessage } from "@/lib/types"

// ---------------------------------------------------------------------------
// Demo threads are module-level so they survive modal open/close within the
// session (they never leave the browser). Live threads live in Supabase and
// are RLS-scoped to the signed-in staff member (0004_insights_chats.sql).
// ---------------------------------------------------------------------------

interface DemoThread {
  chat: InsightsChat
  messages: InsightsChatMessage[]
}

let demoThreads: DemoThread[] = []

const WAIT = (ms: number) => new Promise((r) => setTimeout(r, ms))
const nowIso = () => new Date().toISOString()
const uid = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const titleFrom = (question: string) => (question.length > 42 ? question.slice(0, 42).trimEnd() + "…" : question)

function toChat(row: Record<string, unknown>): InsightsChat {
  return row as unknown as InsightsChat
}

function emptyChat(clinicId: string, staffId: string | null, title: string): InsightsChat {
  const ts = nowIso()
  return { id: uid("demo-chat"), clinic_id: clinicId, staff_id: staffId ?? "demo", title, created_at: ts, updated_at: ts }
}

export function useInsightsChat() {
  const { user, isDemo } = useAuth()
  const { clinicId, staff } = useLayoutData()
  const { toast } = useToast()

  const [threads, setThreads] = useState<InsightsChat[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<InsightsChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeChat = threads.find((t) => t.id === activeId) ?? null
  const history: ChatHistoryMsg[] = messages.slice(-8).map((m) => ({ role: m.role, content: m.content }))

  // ---------------------------------------------------------------- load
  const loadThread = useCallback(
    async (id: string) => {
      setActiveId(id)
      setMessages([])
      if (isDemo) {
        const t = demoThreads.find((x) => x.chat.id === id)
        setMessages(t ? [...t.messages] : [])
        return
      }
      const { data, error: err } = await supabase
        .from("insights_chat_messages")
        .select("id, chat_id, role, content, metadata, created_at")
        .eq("chat_id", id)
        .order("created_at", { ascending: true })
      if (err) {
        toast("Couldn't open that chat", { description: err.message, variant: "danger" })
        return
      }
      setMessages((data ?? []).map(toChat) as unknown as InsightsChatMessage[])
    },
    [isDemo, toast]
  )

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (isDemo) {
        setThreads(demoThreads.map((t) => t.chat))
        const latest = demoThreads[0]
        if (latest) {
          setActiveId(latest.chat.id)
          setMessages([...latest.messages])
        }
        setLoading(false)
        return
      }
      if (!user || !clinicId) {
        setLoading(false)
        return
      }
      const { data, error: err } = await supabase
        .from("insights_chats")
        .select("id, clinic_id, staff_id, title, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(50)
      if (cancelled) return
      if (err) {
        toast("Couldn't load chat history", { description: err.message, variant: "danger" })
        setLoading(false)
        return
      }
      setThreads((data ?? []).map(toChat))
      const latest = (data ?? [])[0]
      if (latest) {
        const { data: msgs } = await supabase
          .from("insights_chat_messages")
          .select("id, chat_id, role, content, metadata, created_at")
          .eq("chat_id", latest.id)
          .order("created_at", { ascending: true })
        if (!cancelled) {
          setActiveId(latest.id)
          setMessages((msgs ?? []).map(toChat) as unknown as InsightsChatMessage[])
        }
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [isDemo, user, clinicId, toast])

  // ------------------------------------------------------------ mutations
  const startNewChat = useCallback(() => {
    setActiveId(null)
    setMessages([])
    setError(null)
  }, [])

  const touchChat = useCallback((id: string, title?: string) => {
    setThreads((prev) => {
      const ts = nowIso()
      const next = prev
        .map((t) => (t.id === id ? { ...t, title: title ?? t.title, updated_at: ts } : t))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      return next
    })
  }, [])

  const send = useCallback(
    async (question: string) => {
      const q = question.trim()
      if (!q || sending) return
      setError(null)
      setSending(true)

      // 1) ensure a thread exists
      let chatId = activeId
      if (!chatId) {
        if (isDemo) {
          const chat = emptyChat(clinicId, staff?.id ?? null, titleFrom(q))
          demoThreads = [{ chat, messages: [] }, ...demoThreads]
          chatId = chat.id
          setThreads((prev) => [chat, ...prev])
          setActiveId(chat.id)
        } else {
          if (!user || !staff) {
            setSending(false)
            toast("Sign in needed", { description: "Your session looks incomplete — sign in again.", variant: "danger" })
            return
          }
          const { data, error: err } = await supabase
            .from("insights_chats")
            .insert({ clinic_id: clinicId, staff_id: staff?.id, title: titleFrom(q) })
            .select("id, clinic_id, staff_id, title, created_at, updated_at")
            .single()
          if (err || !data) {
            setSending(false)
            toast("Couldn't start chat", { description: err?.message ?? "Unknown error", variant: "danger" })
            return
          }
          const chat = toChat(data)
          chatId = chat.id
          setThreads((prev) => [chat, ...prev])
          setActiveId(chat.id)
        }
      }

      // 2) user message
      const userMsg: InsightsChatMessage = {
        id: uid(isDemo ? "demo-msg" : "msg"),
        chat_id: chatId,
        role: "user",
        content: q,
        metadata: {},
        created_at: nowIso(),
      }
      setMessages((prev) => [...prev, userMsg])
      if (isDemo) {
        demoThreads = demoThreads.map((t) => (t.chat.id === chatId ? { ...t, messages: [...t.messages, userMsg] } : t))
      } else {
        supabase.from("insights_chat_messages").insert({ chat_id: chatId, role: "user", content: q }).then((res) => {
          if (res.error) toast("Message not saved", { description: res.error.message, variant: "warning" })
        })
      }

      // 3) analyst
      let answer: InsightsChatMessage
      try {
        const out = await askInsights({ question: q, history: history.length ? history : [] })
        if (isDemo) await WAIT(650)
        answer = {
          id: uid(isDemo ? "demo-ans" : "ans"),
          chat_id: chatId,
          role: "assistant",
          content: out.answer,
          metadata: { model: out.model, provider: out.provider, queries: out.queries },
          created_at: nowIso(),
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Something went wrong while analyzing."
        setError(msg)
        setSending(false)
        return
      }

      // 4) assistant message + thread touch
      setMessages((prev) => [...prev, answer])
      touchChat(chatId, messages.length === 0 ? titleFrom(q) : undefined)
      if (isDemo) {
        demoThreads = demoThreads.map((t) =>
          t.chat.id === chatId
            ? { ...t, chat: { ...t.chat, updated_at: nowIso(), title: t.chat.title === "New chat" ? titleFrom(q) : t.chat.title }, messages: [...t.messages, answer] }
            : t
        )
      } else {
        supabase.from("insights_chat_messages").insert({ chat_id: chatId, role: "assistant", content: answer.content, metadata: answer.metadata }).then((res) => {
          if (res.error) toast("Response not saved", { description: res.error.message, variant: "warning" })
        })
        supabase.from("insights_chats").update({ updated_at: nowIso() }).eq("id", chatId)
      }
      setSending(false)
    },
    [activeId, user, isDemo, clinicId, staff, history, messages.length, sending, toast, touchChat]
  )

  return {
    threads,
    activeChat,
    activeId,
    messages,
    loading,
    sending,
    error,
    selectChat: loadThread,
    startNewChat,
    send,
    history,
  }
}