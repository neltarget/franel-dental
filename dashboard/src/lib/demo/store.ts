import { useSyncExternalStore } from "react"
import type {
  Appointment,
  Clinic,
  ClinicConfig,
  Conversation,
  Escalation,
  FollowUp,
  Message,
  Patient,
  Staff,
} from "@/lib/types"
import { buildDemoSeed, DEMO_CLINIC_ID, DEMO_SIM_REPLIES, type DemoAppointment, type DemoMessage, type DemoRows } from "./seed"

export interface DemoSnapshot {
  version: number
  rows: DemoRows
}

let snapshot: DemoSnapshot | null = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): DemoSnapshot | null {
  return snapshot
}

function commit(rows: DemoRows) {
  snapshot = { version: (snapshot?.version ?? -1) + 1, rows }
  listeners.forEach((l) => l())
}

/** Re-seed fresh demo data (every login starts clean). */
export function enterDemo(): void {
  commit(buildDemoSeed(new Date()))
}

/** Clear demo state (sign out) — nothing ever leaves the browser. */
export function exitDemo(): void {
  snapshot = null
  listeners.forEach((l) => l())
}

/** Live demo rows while a demo session is active, else null. Re-renders subscribers on each mutation. */
export function useDemo(): DemoSnapshot | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Non-hook access to the live demo snapshot (used by lib/actions.ts). */
export function getDemoSnapshot(): DemoSnapshot | null {
  return snapshot
}

export const NOOP = () => undefined

export function isDemoClinic(clinicId: string | null): boolean {
  return clinicId === DEMO_CLINIC_ID
}

// ---------------------------------------------------------------------------
// Join helpers — mirror the exact shapes the Supabase hooks return
// ---------------------------------------------------------------------------

const staffName = (rows: DemoRows, id: string | null): Pick<Staff, "id" | "name"> | null => {
  if (!id) return null
  const s = rows.staff.find((x) => x.id === id)
  return s ? { id: s.id, name: s.name } : null
}

const patientById = (rows: DemoRows, id: string | null): Patient | null =>
  rows.patients.find((p) => p.id === id) ?? null

const clinicScoped = <T extends { clinic_id: string }>(rows: T[]): T[] =>
  rows.filter((r) => r.clinic_id === DEMO_CLINIC_ID)

export function demoConversations(rows: DemoRows): Conversation[] {
  const convs = clinicScoped(rows.conversations)
  return convs
    .map((c) => {
      const messages = rows.messages
        .filter((m) => m.conversation_id === c.id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((m) => ({ ...m, staff: staffName(rows, m.staff_id) })) as Message[]
      const followUps = clinicScoped(rows.followUps)
        .filter((f) => f.conversation_id === c.id)
        .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
        .map((f) => ({ ...f, patient: f.patient_id ? { id: f.patient_id, name: patientById(rows, f.patient_id)?.name ?? "" } : null })) as FollowUp[]
      const escalations = clinicScoped(rows.escalations).filter((e) => e.conversation_id === c.id) as Escalation[]
      return {
        ...c,
        patient: patientById(rows, c.patient_id),
        messages,
        follow_ups: followUps,
        escalations,
      } as Conversation
    })
    .sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""))
}

export function demoConversation(rows: DemoRows, id: string): Conversation | null {
  const base = clinicScoped(rows.conversations).find((c) => c.id === id)
  if (!base) return null
  const conv = demoConversations(rows).find((c) => c.id === id)
  if (!conv) return null
  const appointments = clinicScoped(rows.appointments)
    .filter((a) => a.conversation_id === id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at)) as Appointment[]
  const withAppt = { ...conv, appointments } as Conversation
  withAppt.appointment = appointments[0] ?? null
  return withAppt
}

export function demoAppointments(rows: DemoRows): Appointment[] {
  return clinicScoped(rows.appointments)
    .map((a) => ({ ...a, patient: patientById(rows, a.patient_id) }))
    .sort((a, b) =>
      `${a.appointment_date} ${a.appointment_time}`.localeCompare(`${b.appointment_date} ${b.appointment_time}`)
    ) as Appointment[]
}

export function demoEscalations(rows: DemoRows, status: "active" | "all"): Escalation[] {
  const list = clinicScoped(rows.escalations)
    .map((e) => {
      const conv = demoConversations(rows).find((c) => c.id === e.conversation_id)
      return { ...e, conversation: conv ?? undefined } as Escalation
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  if (status === "active") return list.filter((e) => e.status === "open" || e.status === "in-progress")
  return list
}

export function demoFollowUps(rows: DemoRows): FollowUp[] {
  return clinicScoped(rows.followUps)
    .map((f): FollowUp & { conversation?: Conversation | null } => {
      const conv = demoConversations(rows).find((c) => c.id === f.conversation_id)
      return {
        ...f,
        patient: f.patient_id ? { id: f.patient_id, name: patientById(rows, f.patient_id)?.name ?? "" } : null,
        conversation: conv ?? null,
      }
    })
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
}

export function demoPatients(rows: DemoRows): Patient[] {
  return [...clinicScoped(rows.patients)].sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export function demoStaffList(rows: DemoRows): Staff[] {
  return [...clinicScoped(rows.staff)].sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export function demoStaffByAuthUser(rows: DemoRows, authUserId: string): Staff | null {
  return clinicScoped(rows.staff).find((s) => s.auth_user_id === authUserId && s.is_active) ?? null
}

export function demoClinic(rows: DemoRows): Clinic | null {
  return rows.clinic
}

export function demoConfig(rows: DemoRows): ClinicConfig | null {
  return rows.config
}

// ---------------------------------------------------------------------------
// Write ops — same surface as lib/actions.ts, applied to the in-memory rows
// ---------------------------------------------------------------------------

const nowIso = () => new Date().toISOString()

function updateConversation(rows: DemoRows, id: string, patch: Partial<DemoRows["conversations"][number]>): DemoRows {
  return {
    ...rows,
    conversations: rows.conversations.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  }
}

export function demoCreateMessage(
  snapshotRows: DemoRows,
  args: { conversation_id: string; content: string; staff_id: string | null }
): { error: string | null; id?: string } {
  const id = `demo-msg-${Date.now()}`
  const now = nowIso()
  const content = args.content
  const message: Message = {
    id,
    conversation_id: args.conversation_id,
    sender: "staff",
    staff_id: args.staff_id,
    content,
    message_type: "text",
    metadata: {},
    created_at: now,
    staff: staffName(snapshotRows, args.staff_id),
  }
  const rows: DemoRows = {
    ...snapshotRows,
    messages: [...snapshotRows.messages, message],
    conversations: snapshotRows.conversations.map((c) =>
      c.id === args.conversation_id
        ? {
            ...c,
            last_message_at: now,
            last_message_preview: content.length > 80 ? content.slice(0, 77) + "…" : content,
            updated_at: now,
          }
        : c
    ),
  }
  commit(rows)
  return { error: null, id }
}

export function demoSimulatePatientMessage(
  snapshotRows: DemoRows,
  conversationId: string
): { error: string | null; id?: string } {
  const exists = clinicScoped(snapshotRows.conversations).some((c) => c.id === conversationId)
  if (!exists) return { error: "Conversation not found" }
  const content = DEMO_SIM_REPLIES[Math.floor(Math.random() * DEMO_SIM_REPLIES.length)]
  const now = nowIso()
  const id = `demo-sim-${Date.now()}`
  const message: DemoMessage = {
    id,
    conversation_id: conversationId,
    sender: "patient",
    staff_id: null,
    content,
    message_type: "text",
    metadata: {},
    created_at: now,
  }
  const rows: DemoRows = {
    ...snapshotRows,
    messages: [...snapshotRows.messages, message],
    conversations: snapshotRows.conversations.map((c) =>
      c.id === conversationId
        ? {
            ...c,
            last_message_at: now,
            last_message_preview: content.length > 80 ? content.slice(0, 77) + "…" : content,
            updated_at: now,
          }
        : c
    ),
  }
  commit(rows)
  return { error: null, id }
}

export function demoUpdateConversationStatus(
  snapshotRows: DemoRows,
  id: string,
  status: Conversation["status"]
): { error: string | null } {
  const rows = updateConversation(snapshotRows, id, { status, updated_at: nowIso() })
  commit(rows)
  return { error: null }
}

export function demoCreateAppointment(
  snapshotRows: DemoRows,
  a: {
    clinic_id: string
    patient_id: string
    conversation_id?: string | null
    appointment_date: string
    appointment_time: string
    service: string
    status?: "pending" | "confirmed"
    notes?: string | null
  }
): { error: string | null; id?: string } {
  const id = `demo-appt-${Date.now()}`
  const now = nowIso()
  const appt: DemoRows["appointments"][number] = {
    id,
    clinic_id: a.clinic_id,
    patient_id: a.patient_id,
    conversation_id: a.conversation_id ?? null,
    appointment_date: a.appointment_date,
    appointment_time: a.appointment_time,
    service: a.service,
    status: a.status ?? "confirmed",
    attendance: "pending",
    marked_by: null,
    marked_at: null,
    notes: a.notes ?? null,
    created_at: now,
    updated_at: now,
  }
  commit({ ...snapshotRows, appointments: [...snapshotRows.appointments, appt] })
  return { error: null, id }
}

export function demoCancelAppointment(snapshotRows: DemoRows, id: string): { error: string | null } {
  const rows = {
    ...snapshotRows,
    appointments: snapshotRows.appointments.map((a): DemoAppointment =>
      a.id === id ? { ...a, status: "cancelled", attendance: "cancelled", updated_at: nowIso() } : a
    ),
  }
  commit(rows)
  return { error: null }
}

export function demoMarkAttendance(
  snapshotRows: DemoRows,
  id: string,
  attendance: "attended" | "no-show" | "pending"
): { error: string | null } {
  const rows = {
    ...snapshotRows,
    appointments: snapshotRows.appointments.map((a): DemoAppointment =>
      a.id === id
        ? {
            ...a,
            attendance,
            status: attendance === "no-show" ? "no-show" : "confirmed",
            marked_by: "staff",
            marked_at: nowIso(),
            updated_at: nowIso(),
          }
        : a
    ),
  }
  commit(rows)
  return { error: null }
}

export function demoCreateEscalation(
  snapshotRows: DemoRows,
  args: { conversationId: string; clinicId: string; tier: 1 | 2 | 3; description: string }
): { error: string | null; id?: string } {
  const id = `demo-esc-${Date.now()}`
  const now = nowIso()
  const esc: DemoRows["escalations"][number] = {
    id,
    clinic_id: args.clinicId,
    conversation_id: args.conversationId,
    tier: args.tier,
    status: "open",
    description: args.description,
    assigned_to: null,
    resolved_at: null,
    created_at: now,
  }
  commit({ ...snapshotRows, escalations: [...snapshotRows.escalations, esc] })
  return { error: null, id }
}

export function demoSetEscalationStatus(
  snapshotRows: DemoRows,
  id: string,
  status: "in-progress" | "resolved"
): { error: string | null } {
  const now = nowIso()
  const rows = {
    ...snapshotRows,
    escalations: snapshotRows.escalations.map((e) =>
      e.id === id
        ? { ...e, status, resolved_at: status === "resolved" ? now : e.resolved_at }
        : e
    ),
  }
  commit(rows)
  return { error: null }
}

export function demoUpdatePatient(
  snapshotRows: DemoRows,
  id: string,
  patch: { notes?: string | null }
): { error: string | null } {
  const rows = {
    ...snapshotRows,
    patients: snapshotRows.patients.map((p) =>
      p.id === id ? { ...p, ...patch, updated_at: nowIso() } : p
    ),
  }
  commit(rows)
  return { error: null }
}

export function demoUpsertClinicConfig(
  snapshotRows: DemoRows,
  clinicId: string,
  patch: Partial<ClinicConfig>
): { error: string | null } {
  const now = nowIso()
  const rows = {
    ...snapshotRows,
    config: { ...snapshotRows.config, clinic_id: clinicId, ...patch, updated_at: now },
  }
  commit(rows)
  return { error: null }
}

export function demoUpdateClinic(
  snapshotRows: DemoRows,
  clinicId: string,
  patch: Partial<Clinic>
): { error: string | null } {
  const now = nowIso()
  const rows = {
    ...snapshotRows,
    clinic: { ...snapshotRows.clinic, id: clinicId, ...patch, updated_at: now },
  }
  commit(rows)
  return { error: null }
}