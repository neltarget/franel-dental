// ---------------------------------------------------------------------------
// Franel Insights — shared analytics. Pure functions over the row shapes the
// app already loads (live via useLayoutData / demo via the demo store). Both
// the InsightsPage charts and the demo-mode analyst feed off this so the
// numbers are ALWAYS consistent, whatever the data source.
// ---------------------------------------------------------------------------

import type { Appointment, Clinic, Conversation, Patient } from "@/lib/types"

export interface Funnel {
  enquiries: number
  qualified: number
  booked: number
  attended: number
}

export interface Conversion {
  enquiryToQualifiedPct: number
  qualifiedToBookedPct: number
  bookedAttendedPct: number
}

export interface ComputedInsights {
  funnel: Funnel
  conversion: Conversion
  serviceDemand: { name: string; count: number }[]
  sourceMix: { name: string; count: number }[]
  leadLevel: { low: number; medium: number; high: number }
  avgFirstReplyMinutes: number | null
  noShowPct: number | null
  upcomingCount: number
  awaitingHuman: number
  newPatientsLast7d: number
}

const PASSED = new Set(["qualified", "booked", "closed"])
const BOOKED = new Set(["booked", "closed"])

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0
  return Math.round((part / whole) * 100)
}

function countBy<T extends Record<string, unknown>>(rows: T[], key: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) {
    const v = r[key]
    const k = v === null || v === undefined ? "(none)" : String(v)
    out[k] = (out[k] ?? 0) + 1
  }
  return out
}

function topEntries(rec: Record<string, number>, n: number): { name: string; count: number }[] {
  return Object.entries(rec)
    .filter(([name]) => name !== "(none)")
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, count]) => ({ name, count }))
}

/** Average minutes from a patient's first message to the first Franel/staff reply. */
export function avgFirstReplyMinutes(conversations: Conversation[]): number | null {
  const samples: number[] = []
  for (const c of conversations) {
    const msgs = c.messages
    if (!msgs || !msgs.length) continue
    const firstPatient = msgs.find((m) => m.sender === "patient" && m.message_type !== "system")
    if (!firstPatient) continue
    const t0 = new Date(firstPatient.created_at).getTime()
    const reply = msgs.find((m) => (m.sender === "staff" || m.sender === "franel") && m.message_type !== "system")
    if (!reply) continue
    const mins = (new Date(reply.created_at).getTime() - t0) / 60000
    if (mins >= 0 && mins < 24 * 60) samples.push(mins)
  }
  if (!samples.length) return null
  return Math.round((samples.reduce((a, b) => a + b, 0) / samples.length) * 10) / 10
}

export function computeInsights(
  conversations: Conversation[],
  appointments: Appointment[],
  patients: Patient[]
): ComputedInsights {
  const enquiries = conversations.length

  const qualified = conversations.filter((c) => {
    const passedStatus = PASSED.has(c.status)
    const hotLead = c.lead_level === "high" || c.lead_level === "medium"
    return passedStatus || hotLead
  }).length

  const booked = conversations.filter((c) => BOOKED.has(c.status)).length
  const attended = appointments.filter((a) => a.attendance === "attended").length

  const serviceCounts = countBy(conversations as unknown as Record<string, unknown>[], "service_interest")
  const serviceDemand = topEntries(serviceCounts, 8)

  const sourceCounts = countBy(patients as unknown as Record<string, unknown>[], "source")
  const sourceMix = topEntries(sourceCounts, 8)

  const leadLevel = {
    low: conversations.filter((c) => c.lead_level === "low").length,
    medium: conversations.filter((c) => c.lead_level === "medium").length,
    high: conversations.filter((c) => c.lead_level === "high").length,
  }

  const noShows = appointments.filter((a) => a.attendance === "no-show").length
  const decided = attended + noShows
  const noShowPct = decided > 0 ? pct(noShows, decided) : null

  const todayStr = new Date().toISOString().slice(0, 10)
  const upcomingCount = appointments.filter(
    (a) =>
      a.appointment_date.slice(0, 10) >= todayStr &&
      a.status !== "cancelled" &&
      a.status !== "no-show"
  ).length

  const awaitingHuman = conversations.filter((c) => c.status === "new" || c.status === "escalated").length

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const newPatientsLast7d = patients.filter((p) => {
    const t = new Date(p.created_at).getTime()
    return !Number.isNaN(t) && t >= weekAgo
  }).length

  return {
    funnel: { enquiries, qualified, booked, attended },
    conversion: {
      enquiryToQualifiedPct: pct(qualified, enquiries),
      qualifiedToBookedPct: qualified > 0 ? pct(booked, qualified) : 0,
      bookedAttendedPct: booked > 0 ? pct(attended, booked) : 0,
    },
    serviceDemand,
    sourceMix,
    leadLevel,
    avgFirstReplyMinutes: avgFirstReplyMinutes(conversations),
    noShowPct,
    upcomingCount,
    awaitingHuman,
    newPatientsLast7d,
  }
}

/** Compact, model-ready digest used by the demo analyst + to enrich chat context. */
export function contextDigest(clinic: Clinic | null, ins: ComputedInsights): string {
  const lines: string[] = []
  lines.push(`Clinic: ${clinic?.name ?? "Unknown"}`)
  if (clinic?.hours) {
    const open = Object.entries(clinic.hours)
      .filter(([, v]) => v && !/closed/i.test(v))
      .map(([d, v]) => `${d} ${v}`)
    if (open.length) lines.push(`Hours: ${open.join("; ")}`)
  }
  if (clinic?.services?.length) lines.push(`Services: ${clinic.services.map((s) => s.name).join(", ")}`)
  if (clinic?.pricing && Object.keys(clinic.pricing).length) {
    lines.push(`Prices: ${Object.entries(clinic.pricing).map(([k, v]) => `${k} ${v}`).join(", ")}`)
  }
  const f = ins.funnel
  lines.push(
    `Pipeline: ${f.enquiries} enquiries → ${f.qualified} qualified → ${f.booked} booked → ${f.attended} attended`
  )
  lines.push(
    `Conversion: ${ins.conversion.enquiryToQualifiedPct}% enquiry→qualified, ${ins.conversion.qualifiedToBookedPct}% qualified→booked, ${ins.conversion.bookedAttendedPct}% booked→attended`
  )
  lines.push(
    `Lead levels: ${ins.leadLevel.high} high / ${ins.leadLevel.medium} medium / ${ins.leadLevel.low} low`
  )
  if (ins.avgFirstReplyMinutes !== null) lines.push(`Avg first reply: ${ins.avgFirstReplyMinutes} min`)
  if (ins.noShowPct !== null) lines.push(`No-show rate: ${ins.noShowPct}%`)
  if (ins.sourceMix.length) lines.push(`Patient sources: ${ins.sourceMix.map((s) => `${s.name} (${s.count})`).join(", ")}`)
  if (ins.serviceDemand.length) lines.push(`Top service interest: ${ins.serviceDemand.map((s) => `${s.name} (${s.count})`).join(", ")}`)
  lines.push(`Now: ${awaitingLabel(ins)}`)
  return lines.join("\n")
}

function awaitingLabel(ins: ComputedInsights): string {
  const bits: string[] = []
  if (ins.awaitingHuman) bits.push(`${ins.awaitingHuman} conversations need a human`)
  bits.push(`${ins.upcomingCount} upcoming appointments`)
  bits.push(`${ins.newPatientsLast7d} new patients in the last 7 days`)
  return bits.join(", ")
}