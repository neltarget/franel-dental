// ---------------------------------------------------------------------------
// Pluggable LLM — provider chosen by SECRETS, not code.
//
//   FRANEL_LLM_PROVIDER   "gemini" (default) | "openai" | "openai-compatible"
//   FRANEL_LLM_MODEL      model id (defaults per provider)
//   FRANEL_LLM_API_KEY    provider key (required)
//   FRANEL_LLM_BASE_URL   optional; for "openai-compatible" gateways
//
// One call per question (single guarded pass). The data slice is pre-aggregated
// by context.ts and RLS-scoped to the caller's clinic — the prompt below is the
// only thing the model sees of it, and it is instructed to use ONLY that data.
// ---------------------------------------------------------------------------

import type { InsightContext } from "./context.ts"
import { compactContext } from "./context.ts"

export interface HistoryMessage {
  role: "user" | "assistant"
  content: string
}

export interface LlmRequest {
  question: string
  history: HistoryMessage[]
  context: InsightContext
}

export type LlmResult =
  | { ok: true; answer: string; model: string; provider: string }
  | { ok: false; error: string }

const TIMEOUT_MS = 45000

const DEFAULT_MODEL: Record<string, string> = {
  gemini: "gemini-2.5-flash",
  openai: "gpt-4o-mini",
  "openai-compatible": "",
}

export async function runLlm(req: LlmRequest): Promise<LlmResult> {
  const provider = (Deno.env.get("FRANEL_LLM_PROVIDER") ?? "gemini").trim() || "gemini"
  const apiKey = Deno.env.get("FRANEL_LLM_API_KEY")?.trim()
  if (!apiKey) {
    return {
      ok: false,
      error:
        provider === "gemini"
          ? "FRANEL_LLM_API_KEY is not set. Add your Gemini API key via `supabase secrets set FRANEL_LLM_API_KEY=...` in the dashboard's supabase/ folder."
          : `FRANEL_LLM_API_KEY is not set for provider "${provider}".`,
    }
  }
  let model = Deno.env.get("FRANEL_LLM_MODEL")?.trim()
  if (!model) model = DEFAULT_MODEL[provider] ?? DEFAULT_MODEL.gemini
  if (!model) {
    return { ok: false, error: `FRANEL_LLM_MODEL must be set for provider "${provider}".` }
  }

  const system = buildSystemPrompt(req.context)
  // Some providers (Gemini) reject conversations that don't start with a user turn.
  const histStart = req.history.findIndex((h) => h.role === "user")
  const history = histStart < 0 ? [] : req.history.slice(histStart)
  const messages = [
    { role: "system" as const, content: system },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user" as const, content: req.question },
  ]

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    let result: { text: string; model: string; finishReason: string }
    if (provider === "gemini") {
      result = await callGemini(model, apiKey, messages, controller)
    } else if (provider === "openai" || provider === "openai-compatible") {
      const baseUrl =
        (provider === "openai-compatible"
          ? Deno.env.get("FRANEL_LLM_BASE_URL") ?? "https://api.openai.com/v1"
          : "https://api.openai.com/v1").replace(/\/+$/, "")
      result = await callOpenAi(baseUrl, model, apiKey, messages, controller)
    } else {
      return { ok: false, error: `Unknown FRANEL_LLM_PROVIDER "${provider}".` }
    }
    const text = result.text.trim()
    if (!text) return { ok: false, error: "Model returned an empty answer." }
    if (result.finishReason === "length" || result.finishReason === "MAX_TOKENS") {
      console.warn("[franel-insights] response truncated by max_tokens — raise the cap in llm.ts")
    }
    return { ok: true, answer: text, model: result.model, provider }
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError"
    return {
      ok: false,
      error: aborted
        ? `The model took too long (${Math.round(TIMEOUT_MS / 1000)}s timeout). Try again.`
        : "The model call failed. Check FRANEL_LLM_* secrets and try again.",
    }
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(ctx: InsightContext): string {
  const dataJson = JSON.stringify(compactContext(ctx), null, 0)
  return (
    `You are Franel Analyst, a read-only AI analyst for a single dental clinic.\n` +
    `You only help the CLINIC OWNER understand and improve CUSTOMER ACQUISITION and REVENUE PROTECTION.\n\n` +
    `STRICT RULES:\n` +
    `1. Use ONLY the clinic data in DATA below. Never invent numbers, prices, services, hours, patients, or availability.\n` +
    `2. Every claim must carry the DATA's real figure (exact counts, percentages you compute from them, prices, reply times). If a figure is not in DATA, do not state a number at all.\n` +
    `3. Analysis and recommendations ONLY. Never claim to have messaged anyone, booked, changed, or sent anything. You cannot act.\n` +
    `4. Answer the question actually asked, first and directly. Name the single biggest opportunity or leak, its size in this clinic's numbers, and the exact play (which offer, which patients, when, and what to say). Tie every recommendation to this clinic's real service names, prices and hours from DATA — never to a generic clinic.\n` +
    `5. Vary your structure to the question: pricing questions lead with the price ladder from DATA; speed questions lead with the measured reply time; a no-show question leads with the no-show rate and the recovery play. Do not pad with sections the question did not ask for.\n` +
    `6. If DATA does not contain what was asked, say so in one line and answer from what is available.\n` +
    `7. Speak as an operator advising their owner — no "the data shows" preambles, no disclaimers, no restating the question.\n` +
    `8. Formatting: under 350 words. One short intro line, then a few sections with **bold** headers and "- " bullets. Plain text only (no tables, no code).\n\n` +
    `CLINIC DATA (authoritative, RLS-scoped to this clinic):\n${dataJson}`
  )
}

// ---------------------------------------------------------------------------
// providers
// ---------------------------------------------------------------------------

type ChatMessage = { role: "system" | "user" | "assistant"; content: string }

async function callGemini(
  model: string,
  apiKey: string,
  messages: ChatMessage[],
  controller: AbortController
): Promise<{ text: string; model: string; finishReason: string }> {
  const system = messages.find((m) => m.role === "system")
  const rest = messages.filter((m) => m.role !== "system")
  const body: Record<string, unknown> = {
    contents: rest.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
  }
  if (system) body.systemInstruction = { parts: [{ text: system.content }] }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = (await res.json()) as {
    modelVersion?: string
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
  }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? ""
  return { text, model: data.modelVersion ?? model, finishReason: data.candidates?.[0]?.finishReason ?? "" }
}

async function callOpenAi(
  baseUrl: string,
  model: string,
  apiKey: string,
  messages: ChatMessage[],
  controller: AbortController
): Promise<{ text: string; model: string; finishReason: string }> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      max_tokens: 2048,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
    signal: controller.signal,
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = (await res.json()) as {
    model?: string
    choices?: { message?: { content?: string }; finish_reason?: string }[]
  }
  const text = data.choices?.[0]?.message?.content ?? ""
  return { text, model: data.model ?? model, finishReason: data.choices?.[0]?.finish_reason ?? "" }
}