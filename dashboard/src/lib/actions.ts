import { supabase } from "@/lib/supabase"
import type { ClinicConfig, ConversationStatus, EscalationTier } from "@/lib/types"
import {
  getDemoSnapshot,
  isDemoClinic,
  demoCreateMessage,
  demoUpdateConversationStatus,
  demoCreateAppointment,
  demoCancelAppointment,
  demoMarkAttendance,
  demoCreateEscalation,
  demoSetEscalationStatus,
  demoUpdatePatient,
  demoUpsertClinicConfig,
  demoUpdateClinic,
} from "@/lib/demo/store"

interface OpResult {
  error: string | null
}

function errMsg(err: { message: string } | null): string | null {
  return err ? err.message : null
}

export async function sendStaffMessage(
  conversationId: string,
  content: string,
  staffId: string | null
): Promise<OpResult & { id?: string }> {
  const demo = getDemoSnapshot()
  if (demo) return demoCreateMessage(demo.rows, { conversation_id: conversationId, content, staff_id: staffId })

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender: "staff",
      staff_id: staffId,
      content,
      message_type: "text",
      metadata: {},
    })
    .select("id")
    .single()

  if (error) return { error: error.message }

  const now = new Date().toISOString()
  await supabase
    .from("conversations")
    .update({
      last_message_at: now,
      last_message_preview: content.length > 80 ? content.slice(0, 77) + "…" : content,
      updated_at: now,
    })
    .eq("id", conversationId)

  return { error: null, id: data?.id }
}

export async function updateConversationStatus(
  conversationId: string,
  status: ConversationStatus
): Promise<OpResult> {
  const demo = getDemoSnapshot()
  if (demo) return demoUpdateConversationStatus(demo.rows, conversationId, status)

  const { error } = await supabase
    .from("conversations")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", conversationId)
  return { error: errMsg(error) }
}

export interface NewAppointment {
  clinic_id: string
  patient_id: string
  conversation_id?: string | null
  appointment_date: string
  appointment_time: string
  service: string
  status?: "pending" | "confirmed"
  notes?: string | null
}

export async function createAppointment(a: NewAppointment): Promise<OpResult & { id?: string }> {
  const demo = getDemoSnapshot()
  if (demo) return demoCreateAppointment(demo.rows, a)

  const { data, error } = await supabase
    .from("appointments")
    .insert({
      clinic_id: a.clinic_id,
      patient_id: a.patient_id,
      conversation_id: a.conversation_id ?? null,
      appointment_date: a.appointment_date,
      appointment_time: a.appointment_time,
      service: a.service,
      status: a.status ?? "confirmed",
      attendance: "pending",
      notes: a.notes ?? null,
    })
    .select("id")
    .single()
  return { error: errMsg(error), id: data?.id }
}

export async function cancelAppointment(id: string): Promise<OpResult> {
  const demo = getDemoSnapshot()
  if (demo) return demoCancelAppointment(demo.rows, id)

  const { error } = await supabase
    .from("appointments")
    .update({ status: "cancelled", attendance: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id)
  return { error: errMsg(error) }
}

export async function markAttendance(
  id: string,
  attendance: "attended" | "no-show" | "pending"
): Promise<OpResult> {
  const demo = getDemoSnapshot()
  if (demo) return demoMarkAttendance(demo.rows, id, attendance)

  const { error } = await supabase
    .from("appointments")
    .update({
      attendance,
      status: attendance === "no-show" ? "no-show" : "confirmed",
      marked_by: "staff",
      marked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
  return { error: errMsg(error) }
}

export async function createEscalation(
  conversationId: string,
  clinicId: string,
  tier: EscalationTier,
  description: string
): Promise<OpResult & { id?: string }> {
  const demo = getDemoSnapshot()
  if (demo && isDemoClinic(clinicId)) {
    return demoCreateEscalation(demo.rows, { conversationId, clinicId, tier, description })
  }

  const { data, error } = await supabase
    .from("escalations")
    .insert({
      clinic_id: clinicId,
      conversation_id: conversationId,
      tier,
      status: "open",
      description,
    })
    .select("id")
    .single()
  return { error: errMsg(error), id: data?.id }
}

export async function setEscalationStatus(
  id: string,
  status: "in-progress" | "resolved"
): Promise<OpResult> {
  const demo = getDemoSnapshot()
  if (demo) return demoSetEscalationStatus(demo.rows, id, status)

  const patch: Record<string, unknown> = { status }
  if (status === "resolved") patch.resolved_at = new Date().toISOString()
  const { error } = await supabase.from("escalations").update(patch).eq("id", id)
  return { error: errMsg(error) }
}

export async function updatePatient(
  id: string,
  patch: { notes?: string | null }
): Promise<OpResult> {
  const demo = getDemoSnapshot()
  if (demo) return demoUpdatePatient(demo.rows, id, patch)

  const { error } = await supabase
    .from("patients")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
  return { error: errMsg(error) }
}

export async function upsertClinicConfig(
  clinicId: string,
  patch: Partial<
    Pick<
      ClinicConfig,
      "follow_up_intervals" | "reminder_hours_before" | "checkin_hours_after" | "checkin_flag_timeout_hours" | "whatsapp_templates"
    >
  >
): Promise<OpResult> {
  const demo = getDemoSnapshot()
  if (demo && isDemoClinic(clinicId)) return demoUpsertClinicConfig(demo.rows, clinicId, patch)

  const { error } = await supabase
    .from("clinic_config")
    .upsert(
      { clinic_id: clinicId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: "clinic_id" }
    )
  return { error: errMsg(error) }
}

export interface ClinicPatch {
  name?: string
  address?: string | null
  phone?: string | null
  email?: string | null
  logo_url?: string | null
  hours?: Record<string, string>
  services?: Array<{ name: string; description: string }>
  pricing?: Record<string, string>
  policies?: Record<string, unknown>
}

export async function updateClinic(clinicId: string, patch: ClinicPatch): Promise<OpResult> {
  const demo = getDemoSnapshot()
  if (demo && isDemoClinic(clinicId)) return demoUpdateClinic(demo.rows, clinicId, patch)

  const { error } = await supabase
    .from("clinics")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", clinicId)
  return { error: errMsg(error) }
}