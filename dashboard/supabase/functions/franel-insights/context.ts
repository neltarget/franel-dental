// ---------------------------------------------------------------------------
// Context builder — assembles the clinic data slice the analyst reasons over.
//
// SECURITY: every query here is a postgREST GET made WITH THE CALLER'S OWN JWT.
// Row Level Security (0001_rls.sql) scopes every row to that caller's clinic.
// The service-role key is NEVER used for data reads. There is no free-form
// filter the model can steer — only these fixed, allowlisted selects run.
// ---------------------------------------------------------------------------

export interface InsightContext {
  clinic: ClinicProfile | null
  patients: { total: number; bySource: Record<string, number>; newLast7d: number }
  conversations: {
    total: number
    byStatus: Record<string, number>
    byLeadLevel: Record<string, number>
    avgFirstReplyMinutes: number | null
    awaitingHuman: number
  }
  services: { name: string; price: string | null; interestCount: number }[]
  topSources: { source: string; count: number }[]
  topIntents: { intent: string; count: number }[]
  noShow: { count: number; pct: number } | null
  upcoming: { date: string; time: string; service: string; patient: string; status: string }[]
  attention: { preview: string; status: string; leadLevel: string | null; service: string; lastAt: string }[]
  queries: string[]
}

export interface ClinicProfile {
  name: string
  address: string | null
  phone: string | null
  hours: Record<string, string>
  services: { name: string }[]
  pricing: Record<string, string>
  policies: Record<string, unknown>
}

const URL = () => Deno.env.get("SUPABASE_URL") ?? ""
const MAX_ROWS = 500
const CONVERSATION_CAP = 120

async function get(token: string, path: string, params: Record<string, string>): Promise<unknown[]> {
  const base = URL()
  if (!base) throw new Error("SUPABASE_URL is not configured")
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) qs.set(k, v)
  const url = `${base}/rest/v1/${path}?${qs.toString()}`
  const res = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "apikey": token,
      "Content-Type": "application/json",
      "Prefer": "count=exact",
    },
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`${res.status} ${res.statusText} on /${path} ${detail.slice(0, 200)}`)
  }
  const rows = (await res.json()) as unknown[]
  return rows
}

function countBy(rows: Record<string, unknown>[], key: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) {
    const v = r[key]
    const k = v === null || v === undefined ? "(none)" : String(v)
    out[k] = (out[k] ?? 0) + 1
  }
  return out
}

function topEntries(rec: Record<string, number>, n: number): { source: string; count: number }[] {
  return Object.entries(rec)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([source, count]) => ({ source, count }))
}

/** Trim the context to the essentials the model needs (keeps tokens small). */
export function compactContext(ctx: InsightContext): unknown {
  const clinic = ctx.clinic
  return {
    now: new Date().toISOString(),
    clinic: clinic
      ? {
          name: clinic.name,
          hours: clinic.hours,
          services: clinic.services.map((s) => s.name),
          pricing: clinic.pricing,
          policies: clinic.policies,
        }
      : null,
    patients: ctx.patients,
    conversations: ctx.conversations,
    services: ctx.services,
    topIntents: ctx.topIntents,
    noShow: ctx.noShow,
    upcomingAppointments: ctx.upcoming,
    openAttention: ctx.attention,
  }
}

export async function buildContext(token: string): Promise<InsightContext> {
  const queries: string[] = []

  const [clinics, patients, conversations, appointments, escalations] = await Promise.all([
    get(token, "clinics", { select: "id,name,address,phone,hours,services,pricing,policies", limit: "1" }),
    get(token, "patients", { select: "id,source,created_at" }),
    get(token, "conversations", {
      select: "id,status,lead_level,service_interest,intent,created_at,last_message_at,patient:patients(id,name,source),messages:messages(id,sender,message_type,created_at)",
      order: "created_at.desc",
      limit: String(CONVERSATION_CAP),
    }),
    get(token, "appointments", {
      select: "appointment_date,appointment_time,service,status,attendance,patient:patients(id,name)",
      order: "appointment_date.asc,appointment_time.asc",
      limit: String(MAX_ROWS),
    }),
    get(token, "escalations", {
      select: "tier,status,description",
      order: "created_at.desc",
      limit: "50",
    }),
  ])
  queries.push(
    "clinics (own clinic profile)",
    "patients (all, for source mix)",
    `conversations (latest ${CONVERSATION_CAP}, with embedded first-reply messages)`,
    "appointments (upcoming + recent, for no-show trend)",
    "escalations (latest 50, for open/attention)"
  )

  const clinicRow = (clinics[0] as Record<string, unknown> | undefined) ?? null
  return aggregate(clinicRow, patients as Record<string, unknown>[], conversations as Record<string, unknown>[], appointments as Record<string, unknown>[], escalations as Record<string, unknown>[], queries)
}

/**
 * Same aggregation as `buildContext`, fed from in-memory rows instead of the
 * database. Used by the demo route, where the caller's clinic data never
 * touched the DB. Row shapes must match the PostgREST selects in buildContext.
 */
export function buildContextFromSnapshot(snap: {
  clinic: Record<string, unknown> | null
  patients: Record<string, unknown>[]
  conversations: Record<string, unknown>[]
  appointments: Record<string, unknown>[]
  escalations: Record<string, unknown>[]
}): InsightContext {
  const queries = [
    "clinic snapshot (demo, in-memory)",
    "patient snapshot (demo)",
    "conversation snapshot (demo)",
    "appointment snapshot (demo)",
    "escalation snapshot (demo)",
  ]
  return aggregate(snap.clinic, snap.patients, snap.conversations, snap.appointments, snap.escalations, queries)
}

function aggregate(
  clinicRow: Record<string, unknown> | null,
  patients: Record<string, unknown>[],
  conversations: Record<string, unknown>[],
  appointments: Record<string, unknown>[],
  escalations: Record<string, unknown>[],
  queries: string[]
): InsightContext {
  const services: { name: string }[] = clinicRow?.services
    ? ((clinicRow.services as unknown[]).map((s) => {
        if (s && typeof s === "object") return { name: String((s as Record<string, unknown>).name ?? "") }
        return { name: String(s) }
      }).filter((s) => s.name))
    : []
  const pricing = (clinicRow?.pricing as Record<string, string> | undefined) ?? {}
  const clinic: ClinicProfile | null = clinicRow
    ? {
        name: String(clinicRow.name ?? "Unknown clinic"),
        address: (clinicRow.address as string | null) ?? null,
        phone: (clinicRow.phone as string | null) ?? null,
        hours: (clinicRow.hours as Record<string, string> | undefined) ?? {},
        services,
        pricing,
        policies: (clinicRow.policies as Record<string, unknown> | undefined) ?? {},
      }
    : null

  const patientRows = patients as Record<string, unknown>[]
  const now = Date.now()
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000
  const newLast7d = patientRows.filter((p) => {
    const t = new Date(String(p.created_at)).getTime()
    return !Number.isNaN(t) && t >= weekAgo
  }).length
  const bySource = countBy(patientRows, "source")

  const convRows = conversations as Record<string, unknown>[]
  const byStatus = countBy(convRows, "status")
  const byLead = countBy(convRows, "lead_level")
  const awaitingHuman = convRows.filter((c) => {
    const s = String(c.status ?? "")
    return s === "new" || s === "escalated"
  }).length

  // First-reply speed: per conversation, first patient msg -> first staff/franel msg.
  const firstReplies: number[] = []
  for (const c of convRows) {
    const msgs = (c.messages as Record<string, unknown>[] | null) ?? []
    const firstPatient = msgs.find((m) => m.sender === "patient" && m.message_type !== "system")
    if (!firstPatient) continue
    const t0 = new Date(String(firstPatient.created_at)).getTime()
    const reply = msgs.find((m) => (m.sender === "staff" || m.sender === "franel") && m.message_type !== "system")
    if (!reply) continue
    const t1 = new Date(String(reply.created_at)).getTime()
    const mins = (t1 - t0) / 60000
    if (mins >= 0 && mins < 24 * 60) firstReplies.push(mins)
  }
  const avgFirstReplyMinutes = firstReplies.length
    ? Math.round((firstReplies.reduce((a, b) => a + b, 0) / firstReplies.length) * 10) / 10
    : null

  // Services with interest + price.
  const interestCount: Record<string, number> = {}
  for (const c of convRows) {
    const si = c.service_interest
    if (si) interestCount[String(si)] = (interestCount[String(si)] ?? 0) + 1
  }
  const serviceList: { name: string; price: string | null; interestCount: number }[] = services.map((s) => ({
    name: s.name,
    price: pricing[s.name] ?? null,
    interestCount: interestCount[s.name] ?? 0,
  }))
  // Include any service_interest seen but not in the configured list (still tracked).
  for (const [name, n] of Object.entries(interestCount)) {
    if (!serviceList.some((s) => s.name === name)) serviceList.push({ name, price: null, interestCount: n })
  }
  serviceList.sort((a, b) => b.interestCount - a.interestCount)

  const intentCount = countBy(convRows, "intent")

  // Upcoming: not cancelled/no-show, date >= today.
  const todayStr = new Date().toISOString().slice(0, 10)
  const upcoming = (appointments as Record<string, unknown>[])
    .map((a) => {
      const pat = a.patient as { name?: string } | null | undefined
      return {
        date: String(a.appointment_date ?? "").slice(0, 10),
        time: String(a.appointment_time ?? "").slice(0, 5),
        service: String(a.service ?? ""),
        patient: pat && typeof pat === "object" && pat.name ? String(pat.name) : "Patient",
        status: String(a.status ?? ""),
      }
    })
    .filter((a) => a.date && a.date >= todayStr && a.status !== "cancelled" && a.status !== "no-show")
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
    .slice(0, 12)

  // Attention: open conversations, most recent first.
  const attention = convRows
    .filter((c) => {
      const s = String(c.status ?? "")
      return s === "new" || s === "qualified" || s === "escalated"
    })
    .slice(0, 10)
    .map((c) => {
      const pat = c.patient as { name?: string } | null | undefined
      return {
        preview: String(c.intent ?? (pat && typeof pat === "object" && pat.name ? pat.name : "—")),
        status: String(c.status ?? ""),
        leadLevel: c.lead_level == null ? null : String(c.lead_level),
        service: c.service_interest ? String(c.service_interest) : "",
        lastAt: String(c.last_message_at ?? ""),
      }
    })

  const escalOpen = (escalations as Record<string, unknown>[])?.filter(
    (e) => ["open", "in-progress"].includes(String(e.status ?? ""))
  )?.length ?? 0

  // No-show trend from appointment outcomes. DB rows carry `attendance`
// (attended | no-show once marked) with `status` as fallback; the demo
// snapshot sends both, so prefer `attendance` when present.
  const stateOf = (a: Record<string, unknown>): string => {
    const att = a.attendance == null ? "" : String(a.attendance)
    if (att === "attended" || att === "no-show") return att
    return String(a.status ?? "")
  }
  const apptRowsAll = appointments as Record<string, unknown>[]
  const apptDone = apptRowsAll.filter((a) => {
    const s = stateOf(a)
    return s === "attended" || s === "no-show"
  })
  const noShowCount = apptRowsAll.filter((a) => stateOf(a) === "no-show").length
  const noShow = apptDone.length
    ? { count: noShowCount, pct: Math.round((noShowCount / apptDone.length) * 1000) / 10 }
    : null

  return {
    clinic,
    patients: { total: patientRows.length, bySource, newLast7d },
    conversations: {
      total: convRows.length,
      byStatus,
      byLeadLevel: byLead,
      avgFirstReplyMinutes,
      awaitingHuman,
    },
    services: serviceList,
    topSources: topEntries(bySource, 6),
    topIntents: topEntries(intentCount, 6).map((t) => ({ intent: t.source, count: t.count })),
    noShow,
    upcoming,
    attention,
    queries: [...queries, `escalations (open: ${escalOpen})`, "appointments (no-show trend)"],
  }
}