// ============================================================================
// Franel Insights — Supabase Edge Function
// ----------------------------------------------------------------------------
// The AI patient-acquisition analyst for the clinic owner.
//
// Security model (defense in depth):
//   1. CALLER identity: we take the dashboard's user JWT (Authorization: Bearer)
//      and VALIDATE it against GoTrue before doing anything else. No valid
//      user token -> 401. We never trust a client-supplied user/clinic id.
//   2. DATA access: every clinic-data read below is a PostgREST call made WITH
//      the caller's own JWT. Row Level Security (see 0001_rls.sql) then scopes
//      every row to the caller's clinic automatically. The service-role key is
//      used ONLY for the GoTrue validation hop — it is never used to read data.
//   3. QUERY safety: the data context is built from a SEVERE allowlist of
//      tables/columns/operations (see context.ts). There is no free-form
//      SQL or PostgREST string the LLM can steer — the LLM only sees the
//      already-aggregated, already-scoped context we hand it. No injection path.
//   4. RATE limit: 30 questions / hour / user (in-memory; best-effort).
//
// The LLM is PROVIDER-PLUGGABLE via env:
//   FRANEL_LLM_PROVIDER   "gemini" (default) | "openai" | "openai-compatible"
//   FRANEL_LLM_MODEL      model id (defaults per provider)
//   FRANEL_LLM_API_KEY    provider key
//   FRANEL_LLM_BASE_URL   optional override for openai-compatible gateways
// Swapping providers = change secrets, zero code change.
//
// Response shape: { answer, model, provider, queries: string[] }
// ============================================================================

import { cors, jsonOk, jsonErr, readBody, bearerToken, text401, text405 } from "./http.ts"
import { buildContext, buildContextFromSnapshot, type InsightContext } from "./context.ts"
import { runLlm, type HistoryMessage } from "./llm.ts"

const RATE_LIMIT_PER_HOUR = 30
const DEMO_RATE_LIMIT_PER_IP = 10
const HISTORY_TURNS = 8
const MAX_QUESTION_LEN = 2000
const MAX_SNAPSHOT_KB = 120

Deno.serve(async (req: Request) => {
  const corsHeaders = cors(req)
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== "POST") return text405(corsHeaders)

  const body = await readBody<{ question?: unknown; history?: unknown; demo?: unknown }>(req)
  const question = typeof body.question === "string" ? body.question.trim() : ""
  if (!question) return jsonErr(400, "question is required", corsHeaders)
  if (question.length > MAX_QUESTION_LEN) {
    return jsonErr(400, `question too long (max ${MAX_QUESTION_LEN} chars)`, corsHeaders)
  }
  const history = normalizeHistory(body.history)
  const isDemo = body.demo !== undefined

  let context: InsightContext

  if (isDemo) {
    // --- Demo route. Enabled only when FRANEL_DEMO_MODE=1. The caller
    // sends its in-memory demo snapshot (no DB rows, no user) plus a key
    // that must match the FRANEL_DEMO_KEY secret. Rate-limited per IP.
    const d = (body.demo ?? {}) as { key?: unknown; snapshot?: unknown }
    const modeOk = (Deno.env.get("FRANEL_DEMO_MODE") ?? "").trim() === "1"
    const expectedKey = Deno.env.get("FRANEL_DEMO_KEY")?.trim() ?? ""
    const sentKey = typeof d.key === "string" ? d.key.trim() : ""
    if (!modeOk || !expectedKey || sentKey !== expectedKey) {
      // Do not reveal the route exists to unauthenticated callers.
      return jsonErr(404, "Function route not found", corsHeaders)
    }
    const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown")
      .split(",")[0]
      .trim()
    const rl = rateLimit(`demo:${ip}`, DEMO_RATE_LIMIT_PER_IP)
    if (!rl.ok) {
      return jsonErr(429, `Demo rate limit reached — try again in ${rl.retryInMin} min`, corsHeaders, {
        "Retry-After": String(rl.retryInSec),
      })
    }
    const snap = normalizeSnapshot(d.snapshot)
    if (!snap) return jsonErr(400, "Malformed demo snapshot", corsHeaders)
    if (JSON.stringify(snap).length > MAX_SNAPSHOT_KB * 1024) {
      return jsonErr(400, "Demo snapshot too large", corsHeaders)
    }
    context = buildContextFromSnapshot(snap)
  } else {
    // --- Live route: validate the caller's identity against GoTrue.
    const token = bearerToken(req)
    if (!token) return text401("Missing Authorization: Bearer <user JWT>", corsHeaders)
    const authUser = await validateUser(token)
    if (!authUser) return text401("Invalid or expired session — sign in again.", corsHeaders)
    console.log(`[franel-insights] 200 user=${(authUser.id ?? "").slice(0, 8)} email=${authUser.email ?? "(none)"}`)

    // --- Rate limit (per user).
    const rl = rateLimit(authUser.id, RATE_LIMIT_PER_HOUR)
    if (!rl.ok) {
      const res = jsonErr(429, `Rate limit reached — try again in ${rl.retryInMin} min`, corsHeaders, {
        "Retry-After": String(rl.retryInSec),
      })
      return res
    }

    // --- Build the RLS-scoped data context (caller's JWT).
    try {
      context = await buildContext(token)
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      return jsonErr(502, `Failed to read clinic data: ${detail}`, corsHeaders)
    }
  }

  // --- Guarded LLM pass.
  const result = await runLlm({ question, history, context })
  if (!result.ok) {
    return jsonErr(502, `Franel Analyst unavailable: ${result.error}`, corsHeaders)
  }

  return jsonOk(corsHeaders, {
    answer: result.answer,
    model: result.model,
    provider: result.provider,
    queries: context.queries,
  })
})

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function normalizeHistory(raw: unknown): HistoryMessage[] {
  if (!Array.isArray(raw)) return []
  const out: HistoryMessage[] = []
  for (const item of raw) {
    if (item && typeof item === "object") {
      const role = (item as Record<string, unknown>).role
      const content = (item as Record<string, unknown>).content
      if ((role === "user" || role === "assistant") && typeof content === "string" && content.trim()) {
        out.push({ role, content: content.trim() })
      }
    }
  }
  return out.slice(-HISTORY_TURNS)
}

async function validateUser(jwt: string): Promise<{ id: string; email: string | null } | null> {
  const url = Deno.env.get("SUPABASE_URL")
  if (!url) return null
  // GoTrue's route sits behind Kong key-auth, which accepts the PROJECT's api
  // keys — not arbitrary JWTs. So: apikey = the anon key (injected runtime
  // env), Authorization = the caller's user JWT (what GoTrue actually checks).
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: {
        "Authorization": `Bearer ${jwt}`,
        "apikey": anonKey,
        "Content-Type": "application/json",
      },
    })
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 160)
      console.warn(`[franel-insights] validateUser hop failed: ${res.status} ${detail}`)
      return null
    }
    const data = (await res.json()) as { id?: string; email?: string | null }
    if (!data || !data.id) return null
    return { id: data.id, email: data.email ?? null }
  } catch {
    return null
  }
}

function normalizeSnapshot(raw: unknown):
  | {
      clinic: Record<string, unknown> | null
      patients: Record<string, unknown>[]
      conversations: Record<string, unknown>[]
      appointments: Record<string, unknown>[]
      escalations: Record<string, unknown>[]
    }
  | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const clinic = o.clinic && typeof o.clinic === "object" ? (o.clinic as Record<string, unknown>) : null
  const pick = (v: unknown, cap: number): Record<string, unknown>[] =>
    Array.isArray(v)
      ? (v as unknown[]).slice(0, cap).map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {}))
      : []
  return {
    clinic,
    patients: pick(o.patients, 1000),
    conversations: pick(o.conversations, 400),
    appointments: pick(o.appointments, 400),
    escalations: pick(o.escalations, 100),
  }
}

// In-memory rate limiter. Edge Function instances are ephemeral, so this is a
// best-effort per-instance guard (fine for a free-tier single-user tool).
const rlBuckets = new Map<string, number[]>()
function rateLimit(key: string, perHour: number): { ok: true } | { ok: false; retryInSec: number; retryInMin: number } {
  const now = Date.now()
  const windowStart = now - 60 * 60 * 1000
  const stamps = (rlBuckets.get(key) ?? []).filter((t) => t > windowStart)
  if (stamps.length >= perHour) {
    const oldest = Math.min(...stamps)
    const retryInSec = Math.max(5, Math.ceil((oldest + 60 * 60 * 1000 - now) / 1000))
    rlBuckets.set(key, stamps)
    const retryInMin = Math.max(1, Math.ceil(retryInSec / 60))
    return { ok: false, retryInSec, retryInMin }
  }
  stamps.push(now)
  // Keep the map from growing unbounded.
  if (rlBuckets.size > 5000) rlBuckets.clear()
  rlBuckets.set(key, stamps)
  return { ok: true }
}