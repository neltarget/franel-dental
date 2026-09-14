import type { AiActivityEvent, Conversation, Escalation, FollowUp } from "@/lib/types"

interface FollowUpWithContext extends FollowUp {
  conversation?: Conversation | null
}

export interface ActivityInput {
  conversations: Conversation[]
  escalations?: Escalation[]
  followUps?: FollowUpWithContext[]
}

function eventLabel(type: AiActivityEvent['type'], patientName: string, service?: string | null): string {
  switch (type) {
    case "lead_qualified":
      return `Qualified ${patientName} — ${service ?? "lead"} (auto-QA passed)`
    case "appointment_booked":
      return `Booked ${patientName} from chat`
    case "appointment_reminder":
      return `Sent day-before booking reminder to ${patientName}`
    case "post_visit_checkin":
      return `Sent post-visit check-in to ${patientName}`
    case "follow_up_sent":
      return `Followed up with ${patientName}`
    case "escalation_created":
      return `Escalated ${patientName} to a human`
    case "escalation_resolved":
      return `Resolved the case for ${patientName}`
    case "no_show_flagged":
      return `Flagged ${patientName} as no-show`
    case "patient_replied":
      return `${patientName} replied to Franel`
    case "conversation_closed":
      return `Closed the conversation with ${patientName}`
  }
}

function patientNameOf(conv: Conversation | null | undefined): string {
  return conv?.patient?.name ?? "A patient"
}

export function deriveAiActivity(input: ActivityInput): AiActivityEvent[] {
  const { conversations, escalations = [], followUps = [] } = input
  const events: AiActivityEvent[] = []

  for (const conv of conversations) {
    const patientName = patientNameOf(conv)
    const service = conv.service_interest
    const base = {
      patientId: conv.patient_id,
      patientName,
      conversationId: conv.id,
    }

    // Message scan: AI outcomes + replies
    for (const msg of conv.messages ?? []) {
      if (msg.message_type === "system" && msg.metadata?.event) {
        const metaEvent = String(msg.metadata.event)
        let type: AiActivityEvent["type"] | null = null
        if (metaEvent === "lead_qualified") type = "lead_qualified"
        else if (metaEvent === "appointment_booked") type = "appointment_booked"
        else if (metaEvent === "escalation_created") type = "escalation_created"
        else if (metaEvent === "no_show") type = "no_show_flagged"
        if (type) {
          events.push({ id: `msg-${conv.id}-${msg.id}`, type, label: eventLabel(type, patientName, service), at: msg.created_at, ...base })
        }
      } else if (msg.message_type === "text") {
        if (msg.sender === "patient") {
          events.push({ id: `msg-${conv.id}-${msg.id}`, type: "patient_replied", label: eventLabel("patient_replied", patientName, service), at: msg.created_at, ...base })
        } else if (msg.sender === "franel" && conv.status === "booked") {
          // The last franel reply in a booked conversation ≈ the booking confirmation
          const isLastFranel = [...(conv.messages ?? [])].reverse().find((m) => m.sender === "franel")?.id === msg.id
          if (isLastFranel) {
            events.push({ id: `book-${conv.id}`, type: "appointment_booked", label: eventLabel("appointment_booked", patientName, service), at: msg.created_at, ...base })
          }
        }
      }
    }

    if (conv.status === "closed") {
      events.push({ id: `close-${conv.id}`, type: "conversation_closed", label: eventLabel("conversation_closed", patientName, service), at: conv.last_message_at ?? conv.created_at, ...base })
    }
  }

  for (const esc of escalations) {
    const patientName = patientNameOf(esc.conversation)
    const base = {
      patientId: esc.conversation?.patient_id ?? "",
      patientName,
      conversationId: esc.conversation_id,
    }
    const hasEscalationMsg = conversations.some(
      (c) =>
        c.id === esc.conversation_id &&
        (c.messages ?? []).some(
          (m) => m.message_type === "system" && m.metadata?.event === "escalation_created"
        )
    )
    if (!hasEscalationMsg) {
      events.push({ id: `esc-new-${esc.id}`, type: "escalation_created", label: eventLabel("escalation_created", patientName, null), at: esc.created_at, ...base })
    }
    if (esc.status === "resolved" && esc.resolved_at) {
      events.push({ id: `esc-res-${esc.id}`, type: "escalation_resolved", label: eventLabel("escalation_resolved", patientName, null), at: esc.resolved_at, ...base })
    }
  }

  for (const fu of followUps) {
    if (!fu.sent_at || fu.status !== "sent") continue
    const fname = fu.patient?.name ?? patientNameOf(fu.conversation)
    const type: AiActivityEvent["type"] = fu.type === "reminder" ? "appointment_reminder" : "follow_up_sent"
    events.push({
      id: `fu-${fu.id}`,
      type,
      label: eventLabel(type, fname),
      at: fu.sent_at,
      patientId: fu.patient_id,
      patientName: fname,
      conversationId: fu.conversation_id,
    })
  }

  const seen = new Set<string>()
  const deduped = events.filter((e) => {
    if (seen.has(e.id)) return false
    seen.add(e.id)
    return true
  })

  return deduped
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 40)
}