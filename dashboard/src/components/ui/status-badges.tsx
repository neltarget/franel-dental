import { CheckCircle2, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/Badge"
import { TIER_LABELS } from "@/lib/format"
import type { Appointment, ConversationStatus, EscalationStatus, EscalationTier, FollowUp, LeadLevel } from "@/lib/types"

const STATUS_META: Record<ConversationStatus, { label: string; variant: "teal" | "blue" | "green" | "red" | "neutral" }> = {
  new: { label: "New", variant: "teal" },
  qualified: { label: "Qualified", variant: "blue" },
  booked: { label: "Booked", variant: "green" },
  escalated: { label: "Escalated", variant: "red" },
  closed: { label: "Closed", variant: "neutral" },
}

export function StatusBadge({ status }: { status: ConversationStatus }) {
  const m = STATUS_META[status]
  return (
    <Badge variant={m.variant} dot>
      {m.label}
    </Badge>
  )
}

const LEAD_META: Record<LeadLevel, { label: string; variant: "gold" | "blue" | "neutral" }> = {
  high: { label: "High", variant: "gold" },
  medium: { label: "Medium", variant: "blue" },
  low: { label: "Low", variant: "neutral" },
}

export function LeadBadge({ level }: { level: LeadLevel | null }) {
  if (!level) return <span className="text-[11px] text-muted-2">—</span>
  const m = LEAD_META[level]
  return <Badge variant={m.variant}>{m.label}</Badge>
}

const TIER_VARIANTS: Record<EscalationTier, "red" | "gold" | "blue"> = {
  1: "red",
  2: "gold",
  3: "blue",
}

export function TierBadge({ tier }: { tier: EscalationTier }) {
  return (
    <Badge variant={TIER_VARIANTS[tier]} dot>
      {`Tier ${tier}`}
    </Badge>
  )
}

export function TierLabel({ tier }: { tier: EscalationTier }) {
  return <span className="text-[11px] font-medium text-muted">{TIER_LABELS[tier]}</span>
}

const ESC_STATUS_META: Record<EscalationStatus, { label: string; variant: "red" | "gold" | "green" }> = {
  open: { label: "Open", variant: "red" },
  "in-progress": { label: "In progress", variant: "gold" },
  resolved: { label: "Resolved", variant: "green" },
}

export function EscalationStatusBadge({ status }: { status: EscalationStatus }) {
  const m = ESC_STATUS_META[status]
  return (
    <Badge variant={m.variant} dot>
      {m.label}
    </Badge>
  )
}

const APPT_STATUS_META: Record<
  Appointment["status"],
  { label: string; variant: "blue" | "green" | "red" | "neutral" }
> = {
  pending: { label: "Pending", variant: "blue" },
  confirmed: { label: "Confirmed", variant: "green" },
  cancelled: { label: "Cancelled", variant: "neutral" },
  "no-show": { label: "No-show", variant: "red" },
}

export function AppointmentStatusBadge({ status }: { status: Appointment["status"] }) {
  const m = APPT_STATUS_META[status]
  return (
    <Badge variant={m.variant} dot>
      {m.label}
    </Badge>
  )
}

export function AttendanceBadge({ attendance }: { attendance: Appointment["attendance"] }) {
  if (attendance === "attended") {
    return (
      <Badge variant="solid-green">
        <CheckCircle2 size={11} strokeWidth={2.5} />
        Attended
      </Badge>
    )
  }
  if (attendance === "no-show") {
    return (
      <Badge variant="solid-orange">
        <XCircle size={11} strokeWidth={2.5} />
        No-show
      </Badge>
    )
  }
  return <Badge variant="neutral">Cancelled</Badge>
}

const FU_TYPE_LABELS: Record<FollowUp["type"], string> = {
  reminder: "Reminder",
  "non-booker": "Non-booker follow-up",
  "no-show-recovery": "No-show recovery",
}

export function FollowUpTypeBadge({ followUp }: { followUp: FollowUp }) {
  const variant =
    followUp.type === "reminder" ? "blue" : followUp.type === "no-show-recovery" ? "gold" : "violet"
  return <Badge variant={variant}>{FU_TYPE_LABELS[followUp.type]}</Badge>
}

export function SourceBadge({ source }: { source: string | null | undefined }) {
  if (!source) return <span className="text-[11px] text-muted-2">—</span>
  const s = source.toLowerCase()
  const variant = s.includes("whatsapp") || s === "ai" ? "teal" : "neutral"
  return (
    <Badge variant={variant}>
      {s === "ai" ? "Franel" : source}
    </Badge>
  )
}

export function PatientName({ name, id }: { name: string | null | undefined; id?: string | null }) {
  return <span className="font-semibold">{name || (id ? "Unknown patient" : "—")}</span>
}