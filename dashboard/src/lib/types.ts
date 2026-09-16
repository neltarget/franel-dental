export interface Clinic {
  id: string
  name: string
  address: string | null
  phone: string | null
  email: string | null
  logo_url: string | null
  hours: Record<string, string>
  services: ClinicService[]
  pricing: Record<string, string>
  policies: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface ClinicService {
  name: string
  description: string
}

export interface Staff {
  id: string
  clinic_id: string
  auth_user_id: string | null
  name: string
  role: 'owner' | 'manager' | 'receptionist'
  phone: string | null
  email: string | null
  is_active: boolean
  created_at: string
}

export interface Patient {
  id: string
  clinic_id: string
  name: string
  phone: string
  email: string | null
  source: string | null
  notes: string | null
  created_at: string
  updated_at?: string
}

export const CONVERSATION_STATUSES = ['new', 'qualified', 'booked', 'escalated', 'closed'] as const
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number]
export const LEAD_LEVELS = ['low', 'medium', 'high'] as const
export type LeadLevel = (typeof LEAD_LEVELS)[number]

export interface Conversation {
  id: string
  clinic_id: string
  patient_id: string
  status: ConversationStatus
  intent: string | null
  service_interest: string | null
  lead_level: LeadLevel | null
  last_message_at: string | null
  last_message_preview: string | null
  assigned_staff_id: string | null
  created_at: string
  updated_at: string
  patient?: Patient | null
  messages?: Message[]
  appointment?: Appointment | null
  appointments?: Appointment[] | null
  follow_ups?: FollowUp[] | null
  escalations?: Escalation[]
}

export interface Message {
  id: string
  conversation_id: string
  sender: 'patient' | 'franel' | 'staff'
  staff_id: string | null
  content: string
  message_type: 'text' | 'voice' | 'image' | 'system'
  metadata: Record<string, unknown>
  created_at: string
  staff?: Pick<Staff, 'id' | 'name'> | null
}

export interface Appointment {
  id: string
  clinic_id: string
  patient_id: string
  conversation_id: string | null
  appointment_date: string
  appointment_time: string
  service: string
  status: 'pending' | 'confirmed' | 'cancelled' | 'no-show'
  attendance: 'pending' | 'attended' | 'no-show' | 'cancelled'
  marked_by: 'patient' | 'staff' | 'system' | null
  marked_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
  patient?: Patient | null
}

export const ESCALATION_TIERS = [1, 2, 3] as const
export const ESCALATION_STATUSES = ['open', 'in-progress', 'resolved'] as const
export type EscalationTier = (typeof ESCALATION_TIERS)[number]
export type EscalationStatus = (typeof ESCALATION_STATUSES)[number]

export interface Escalation {
  id: string
  clinic_id: string
  conversation_id: string
  tier: EscalationTier
  status: EscalationStatus
  description: string | null
  assigned_to: string | null
  resolved_at: string | null
  created_at: string
  conversation?: Conversation
}

export const FOLLOW_UP_TYPES = ['non-booker', 'reminder', 'no-show-recovery'] as const
export type FollowUpType = (typeof FOLLOW_UP_TYPES)[number]

export interface FollowUp {
  id: string
  clinic_id: string
  conversation_id: string
  patient_id: string
  type: FollowUpType
  scheduled_at: string
  sent_at: string | null
  status: 'pending' | 'sent' | 'blocked' | 'cancelled'
  template_used: string | null
  created_at: string
  patient?: Pick<Patient, 'id' | 'name'> | null
}

export interface ClinicConfig {
  id: string
  clinic_id: string
  follow_up_intervals: number[]
  reminder_hours_before: number
  checkin_hours_after: number
  checkin_flag_timeout_hours: number
  whatsapp_templates: Record<string, string>
  created_at: string
  updated_at: string
}

export interface DashboardStats {
  messagesToday: number
  conversationsToday: number
  aiResolutionRate: number
  bookingsToday: number
  aiBooked: number
  awaitingHuman: number
  openEscalations: number
  qualifiedThisWeek: number
  attendedThisWeek: number
  noShowsThisWeek: number
}

export const AI_DEFAULT_STATS = {
  messagesToday: 0,
  conversationsToday: 0,
  aiResolutionRate: 0,
  bookingsToday: 0,
  aiBooked: 0,
  awaitingHuman: 0,
  openEscalations: 0,
  qualifiedThisWeek: 0,
  attendedThisWeek: 0,
  noShowsThisWeek: 0,
} as const

export type AiEventType =
  | 'lead_qualified'
  | 'appointment_booked'
  | 'appointment_reminder'
  | 'post_visit_checkin'
  | 'follow_up_sent'
  | 'escalation_created'
  | 'escalation_resolved'
  | 'no_show_flagged'
  | 'patient_replied'
  | 'conversation_closed'

export interface AiActivityEvent {
  id: string
  type: AiEventType
  label: string
  patientId: string
  patientName: string
  conversationId: string
  at: string
}

// ---------------------------------------------------------------------------
// Insights — owner AI analyst (thread persistence, see 0004_insights_chats.sql)
// ---------------------------------------------------------------------------

export type InsightsChatRole = 'user' | 'assistant'

export interface InsightsChat {
  id: string
  clinic_id: string
  staff_id: string
  title: string
  created_at: string
  updated_at: string
}

export interface InsightsChatMessage {
  id: string
  chat_id: string
  role: InsightsChatRole
  content: string
  metadata: Record<string, unknown>
  created_at: string
}