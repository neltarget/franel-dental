// ---------------------------------------------------------------------------
// Insights chat client.
//   - Live: POST to the `franel-insights` Supabase Edge Function with the user
//     JWT. The function is the only thing that holds any secret, and it reads
//     data under the caller's own JWT (RLS-scoped). This file holds NO key.
//   - Demo: the demo clinic lives entirely in the browser, so we post its
//     in-memory snapshot to the same function's demo route (shared public
//     gate + per-IP rate limit). If the function is unreachable we fall back
//     to a local heuristic so the demo never shows a dead end.
// ---------------------------------------------------------------------------

import { supabase, supabaseUrl } from "@/lib/supabase"
import { getDemoSnapshot, demoConversations, demoAppointments, demoPatients } from "@/lib/demo/store"
import type { DemoRows } from "@/lib/demo/seed"
import { computeInsights, contextDigest } from "@/lib/insights"
import type { Clinic } from "@/lib/types"

export interface ChatHistoryMsg {
  role: "user" | "assistant"
  content: string
}

export interface AnalystResult {
  answer: string
  model: string
  provider: string
  queries: string[]
}

export async function askInsights(args: { question: string; history: ChatHistoryMsg[] }): Promise<AnalystResult> {
  const demo = getDemoSnapshot()
  if (demo) return demoAnalyst(args.question, args.history)

  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error("Your session has expired. Sign in again to continue the analysis.")
  }

  const url = `${supabaseUrl}/functions/v1/franel-insights`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ question: args.question, history: args.history.slice(-8) }),
  })
  const raw = await res.text()
  let data: {
    error?: string
    answer?: string
    model?: string
    provider?: string
    queries?: string[]
  } = {}
  try {
    data = (JSON.parse(raw) as typeof data) ?? data
  } catch {
    // plain-text body (e.g. the function's 401) — surfaced as-is below
  }
  if (!res.ok || data.error) {
    // Surface the function's exact reason (its 401s are plain text).
    throw new Error(data.error ?? (raw ? raw.slice(0, 200) : `Analyst request failed (${res.status}).`))
  }
  return {
    answer: data.answer ?? "",
    model: data.model ?? "",
    provider: data.provider ?? "",
    queries: data.queries ?? [],
  }
}

// ---------------------------------------------------------------------------
// Demo analyst — the demo clinic lives entirely in the browser (no DB rows,
// no auth), so we post its in-memory snapshot to the same franel-insights
// function with a shared demo key and let the real model answer over it. If
// the function is unreachable or not configured yet, we fall back to a
// deterministic local heuristic so the demo never shows a dead end.
// ---------------------------------------------------------------------------

// Shared demo gate for the franel-insights edge function's demo route.
// Public by design (static Vercel build, no server): the edge function rate
// limits demo calls per-IP. Overridable via VITE_FRANEL_DEMO_KEY locally.
const DEFAULT_DEMO_KEY = "2d0bb2e432672829ee85be2a883e0b1285624939be19b9b2"
const DEMO_ANALYST_KEY: string = (import.meta.env.VITE_FRANEL_DEMO_KEY as string | undefined) ?? DEFAULT_DEMO_KEY

/** Project the in-memory demo rows into the shapes the edge function's context
 *  aggregator expects (mirrors its PostgREST selects). */
function demoSnapshotPayload(rows: DemoRows) {
  const nameOf = (id: string) => rows.patients.find((p) => p.id === id)?.name ?? ""
  return {
    clinic: rows.clinic,
    patients: rows.patients.map((p) => ({ id: p.id, source: p.source, created_at: p.created_at })),
    conversations: rows.conversations.map((c) => ({
      id: c.id,
      status: c.status,
      lead_level: c.lead_level,
      service_interest: c.service_interest,
      intent: c.intent,
      created_at: c.created_at,
      last_message_at: c.last_message_at,
      patient: { id: c.patient_id, name: nameOf(c.patient_id) },
      messages: rows.messages
        .filter((m) => m.conversation_id === c.id)
        .map((m) => ({ sender: m.sender, message_type: m.message_type, created_at: m.created_at })),
    })),
    appointments: rows.appointments.map((a) => ({
      appointment_date: a.appointment_date,
      appointment_time: a.appointment_time,
      service: a.service,
      status: a.status,
      attendance: a.attendance ?? null,
      patient: { id: a.patient_id, name: nameOf(a.patient_id) },
    })),
    escalations: rows.escalations.map((e) => ({ tier: e.tier, status: e.status, description: e.description })),
  }
}

async function askDemoAnalystRemote(question: string, history: ChatHistoryMsg[]): Promise<AnalystResult | null> {
  if (!DEMO_ANALYST_KEY) return null
  if (!getDemoSnapshot()) return null
  try {
    const snap = getDemoSnapshot()!
    const res = await fetch(`${supabaseUrl}/functions/v1/franel-insights`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        history: history.slice(-8),
        demo: { key: DEMO_ANALYST_KEY, snapshot: demoSnapshotPayload(snap.rows) },
      }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      answer?: string
      model?: string
      provider?: string
      queries?: string[]
      error?: string
    }
    if (!res.ok || data.error || !data.answer) return null
    return {
      answer: data.answer,
      model: data.model ?? "",
      provider: `demo-${data.provider ?? "llm"}`,
      queries: data.queries ?? [],
    }
  } catch {
    return null // offline / function not deployed yet
  }
}

async function demoAnalyst(question: string, history: ChatHistoryMsg[]): Promise<AnalystResult> {
  if (!getDemoSnapshot()) {
    return { answer: "Demo data is not initialised.", model: "local-heuristic", provider: "demo", queries: [] }
  }
  const live = await askDemoAnalystRemote(question, history)
  if (live) return live
  return heuristicAnalyst(question)
}

function heuristicAnalyst(question: string): AnalystResult {
  const snap = getDemoSnapshot()
  if (!snap) return { answer: "Demo data is not initialised.", model: "local-heuristic", provider: "demo", queries: [] }
  const { rows } = snap
  const convs = demoConversations(rows)
  const appts = demoAppointments(rows)
  const pats = demoPatients(rows)
  const clinic = (rows.clinic as Clinic) ?? null
  const ins = computeInsights(convs, appts, pats)
  const digest = contextDigest(clinic, ins)
  const queries = ["conversations (embedded messages)", "appointments", "patients", "escalations", "follow_ups"]

  const services = ins.serviceDemand.slice(0, 3).map((s) => s.name)
  const sources = ins.sourceMix.slice(0, 3).map((s) => `${s.name} (${s.count})`)
  const topService = services[0] ?? "a core service"
  const bestSource = sources[0]?.split(" (")[0] ?? "your strongest channel"
  const pricing = Object.entries(clinic?.pricing ?? {})
  const cheap = pricing.length ? pricing.reduce((a, b) => (parseFloat(a[1].replace(/[^0-9.]/g, "")) <= parseFloat(b[1].replace(/[^0-9.]/g, "")) ? a : b)) : null
  const pricey = pricing.length ? pricing.reduce((a, b) => (parseFloat(a[1].replace(/[^0-9.]/g, "")) >= parseFloat(b[1].replace(/[^0-9.]/g, "")) ? a : b)) : null
  const f = ins.funnel

  const q = question.toLowerCase()
  const hasAny = (ws: string[]) => ws.some((w) => q.includes(w))
  const priceAsk = hasAny([
    "pric", "cost", "charg", "fee", "quote", "how much", "expens", "cheap",
    "discount", "pay", "money", "amount", "bill", "ticket", "offer",
  ])
  const askHighest = hasAny(["most expensive", "most pricey", "most costly", "priciest", "highest price", "highest offer", "top offer"])
  const askLowest = hasAny(["cheapest", "least expensive", "least pricey", "least costly", "lowest price", "lowest offer"])
  const namedOffer: [string, string] | null = (() => {
    if (!priceAsk) return null
    let best: [string, string] | null = null
    let bestLen = 0
    for (const [name, price] of pricing) {
      for (const part of name.toLowerCase().split(/[^a-z0-9]+/)) {
        if (part.length >= 4 && part.length > bestLen && q.includes(part)) {
          best = [name, price]
          bestLen = part.length
        }
      }
    }
    return best
  })()

  let factLines: string[] | null = null
  if (pricing.length) {
    if (askHighest && pricey) {
      factLines = [`Your most expensive offer is **${pricey[0]}** at **${pricey[1]}.**`]
    } else if (askLowest && cheap) {
      factLines = [`Your cheapest offer is **${cheap[0]}** at **${cheap[1]}.**`]
    } else if (namedOffer) {
      factLines = [`**${namedOffer[0]}** is priced at **${namedOffer[1]}.**`]
    } else if (priceAsk) {
      const num = (p: string) => parseFloat(p.replace(/[^0-9.]/g, "")) || 0
      const sorted = [...pricing].sort((a, b) => num(b[1]) - num(a[1]))
      factLines = ["**Your full price list (high \u2192 low):**", ...sorted.map(([name, price]) => `- ${name} \u2014 ${price}`)]
    }
  }
  const topics: [string, string[]][] = [
    ["funnel", ["enquir", "book", "funnel", "conversion", "convert", "qualified", "pipeline", "lead"]],
    ["demand", ["ask for", "asking", "demand", "popular", "service", "most"]],
    ["sources", ["source", "channel", "come from", "origin", "referr"]],
    ["speed", ["reply", "response", "speed", "wait", "react"]],
    ["noshows", ["no-show", "noshow", "show up", "empty", "cancel", "attend"]],
    ["pricing", ["pric", "cost", "offer", "margin", "ticket", "split", "upsell", "up-sell", "revenue", "charg", "discount", "quick", "plan"]],
    ["actions", ["this week", "what should i do", "action", "plan", "next", "do now", "start"]],
  ]
  const matched = topics
    .filter(([, words]) => words.some((w) => q.includes(w)))
    .map(([key]) => key)
  const order = matched.length
    ? [...new Set([...matched.filter((k) => k !== "actions"), "actions"])]
    : ["funnel", "demand", "sources", "speed", "noshows", "pricing", "actions"]

  const sections: Record<string, () => string[] | null> = {
    funnel: () => {
      const biggestLever =
        f.enquiries > f.qualified * 1.5 ? "turning more enquiries into qualified leads" : "filling the gap between qualified and booked"
      return [
        "**Where the next booking comes from**",
        `- You have **${f.enquiries} enquiries → ${f.qualified} qualified → ${f.booked} booked → ${f.attended} attended** right now. Your biggest lever is ${biggestLever}.`,
      ]
    },
    demand: () =>
      services.length
        ? ["**What's in demand**", `- Patients keep asking for **${services.join(" · ")}**. Lead with these in every reply and in your WhatsApp profile.`]
        : null,
    sources: () =>
      sources.length
        ? ["**Who's already converting**", `- Your best channels are **${sources.join(", ")}**. Double the motion that's already working instead of guessing at new ones.`]
        : null,
    speed: () =>
      ins.avgFirstReplyMinutes !== null
        ? ["**Speed is a closing tool**", `- Your average first reply is **${ins.avgFirstReplyMinutes} min**. Sub-5-minute replies are the single cheapest thing you can do to lift booking rate — keep Franel on in-hours so nothing sits.`]
        : null,
    noshows: () =>
      ins.noShowPct !== null
        ? ["**Protect the revenue you already won**", `- No-show rate is **${ins.noShowPct}%**. Every no-show is a paid-for chair that went empty. Fire the day-before reminder + a 2-hour "you still in?" nudge on your biggest tickets.`]
        : null,
    pricing: () =>
      cheap && pricey
        ? [
            "**Fix the price ladder**",
            `- Keep pulling walk-ins up to margin with a clear ladder: **${cheap[0]} (${cheap[1]})** as the door-opener, then cross-sell into **${pricey[0]} (${pricey[1]})** once trust is in. Offer a 3-part split on ${topService}.`,
          ]
        : null,
    actions: () => [
      "**Do this this week**",
      `1. Reply to your ${f.enquiries - f.qualified || 0} unqualified enquiries within 10 minutes, leading with ${topService}.`,
      `2. Re-run the no-show recovery message on your ${ins.noShowPct ?? 0}% no-shows before Friday.`,
      `3. Ask every ${bestSource} patient for one referral — that channel is already your best.`,
    ],
  }

  const lines: string[] = []
  if (factLines) {
    lines.push(...factLines)
    const ladder = sections.pricing()
    if (ladder) lines.push(...ladder)
    const actions = sections.actions()
    if (actions) lines.push(...actions)
  } else {
    for (const key of order) {
      const body = sections[key]()
      if (body) lines.push(...body)
    }
    if (!lines.length) lines.push("I don't have data for that yet — try asking about bookings, no-shows, pricing, or where your patients come from.")
  }

  return {
    answer: lines.join("\n"),
    model: "local-heuristic",
    provider: "demo",
    queries: [...queries, "digest: " + digest.split("\n").length + " lines"],
  }
}