import type {
  Clinic,
  ClinicConfig,
  Conversation,
  Escalation,
  FollowUp,
  Message,
  Patient,
  Staff,
} from "@/lib/types"

export const DEMO_EMAIL = "demo@franel.app"
export const DEMO_PASSWORD = "demo1234"
export const DEMO_CLINIC_ID = "demo-clinic-mile3"
export const DEMO_USER_ID = "demo-user-mile3"
export const DEMO_CLINIC_NAME = "Mile 3 Dental Studio"
export const DEMO_CLINIC_TAGLINE = "East Legon, Accra · sample data"

/** Canned patient replies used by the demo "simulate a WhatsApp inbound" control. */
export const DEMO_SIM_REPLIES: string[] = [
  "Actually, can you hold Thursday 11:15 for me after all?",
  "Is there a discount if I book whitening together with a check-up?",
  "I can only come after 3pm — do you have any slots in the evening?",
  "How much will the follow-up be after the wisdom tooth removal?",
  "The pain got worse this morning. Can I still come in today?",
  "Is mobile money accepted for the payment plan?",
  "Can we move my appointment to tomorrow morning if possible?",
  "Just confirming — my number is on file, right?",
  "Do you do X-rays on the same day as the filling?",
  "What time do you close on Saturdays?",
]

export type DemoMessage = Omit<Message, "staff">
export interface DemoAppointment {
  id: string
  clinic_id: string
  patient_id: string
  conversation_id: string | null
  appointment_date: string
  appointment_time: string
  service: string
  status: "pending" | "confirmed" | "cancelled" | "no-show"
  attendance: "pending" | "attended" | "no-show" | "cancelled"
  marked_by: "patient" | "staff" | "system" | null
  marked_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}
export interface DemoEscalation extends Omit<Escalation, "conversation"> {}
export interface DemoFollowUp extends Omit<FollowUp, "patient"> {}

export interface DemoRows {
  clinic: Clinic
  staff: Staff[]
  patients: Patient[]
  conversations: Omit<Conversation, "patient" | "messages" | "appointment" | "appointments" | "follow_ups" | "escalations">[]
  messages: DemoMessage[]
  appointments: DemoAppointment[]
  escalations: DemoEscalation[]
  followUps: DemoFollowUp[]
  config: ClinicConfig
}

export interface DemoRoiSnapshot {
  enquiriesThisMonth: number
  autoHandled: number
  autoHandledPct: number
  aiBookedAppointments: number
  revenueProtectedGhs: number
  frontDeskHoursSaved: number
  afterHoursReplies: number
  lastAfterHoursReply: string
}

export const DEMO_ROI: DemoRoiSnapshot = {
  enquiriesThisMonth: 231,
  autoHandled: 214,
  autoHandledPct: 93,
  aiBookedAppointments: 58,
  revenueProtectedGhs: 14200,
  frontDeskHoursSaved: 32,
  afterHoursReplies: 17,
  lastAfterHoursReply: "2:14 AM",
}

const pad = (n: number) => String(n).padStart(2, "0")
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** ISO timestamp `days` before/after now, at a local time of day. */
function ts(now: Date, days: number, hours: number, minutes: number, seconds = 0): string {
  const x = new Date(now)
  x.setDate(x.getDate() + days)
  x.setHours(hours, minutes, seconds, 0)
  return x.toISOString()
}

/** yyyy-MM-dd date string `days` before/after now (local). */
function day(now: Date, days: number): string {
  const x = new Date(now)
  x.setDate(x.getDate() + days)
  return dateKey(x)
}

const msg = (
  id: string,
  conversationId: string,
  sender: Message["sender"],
  content: string,
  at: string,
  extra: Partial<Pick<Message, "staff_id" | "message_type" | "metadata">> = {}
): DemoMessage => ({
  id,
  conversation_id: conversationId,
  sender,
  staff_id: extra.staff_id ?? null,
  content,
  message_type: extra.message_type ?? "text",
  metadata: extra.metadata ?? {},
  created_at: at,
})

const syst = (id: string, conversationId: string, event: string, at: string, note: string): DemoMessage =>
  msg(id, conversationId, "franel", note, at, { message_type: "system", metadata: { event } })

const SERVICES = [
  { name: "Dental check-up & scale/polish", description: "Full oral exam plus professional cleaning and polish." },
  { name: "Teeth whitening", description: "In-studio whitening with same-day visible results." },
  { name: "Root canal treatment", description: "Single-visit endodontics under local anaesthetic." },
  { name: "Dental implants", description: "Titanium implants with ceramic crown, staged over visits." },
  { name: "Braces & clear aligners", description: "Fixed braces or clear aligners for teens and adults." },
  { name: "Wisdom tooth removal", description: "Surgical removal with same-day aftercare plan." },
  { name: "Pediatric dentistry", description: "Gentle check-ups, fluoride and fillings for kids." },
  { name: "Emergency dental care", description: "Same-day slots for pain, swelling and fractures." },
]

const PRICING = {
  "Dental check-up & scale/polish": "GH₵350",
  "Teeth whitening": "GH₵1,800",
  "Root canal treatment": "GH₵950 per tooth",
  "Dental implants": "GH₵8,500 per arch",
  "Braces & clear aligners": "GH₵6,500",
  "Wisdom tooth removal": "GH₵600",
  "Pediatric dentistry": "GH₵250",
  "Emergency dental care": "GH₵450",
}

export function buildDemoSeed(now: Date): DemoRows {
  const C = DEMO_CLINIC_ID
  const at = (d: number, h: number, m: number, s = 0) => ts(now, d, h, m, s)
  const dd = (d: number) => day(now, d)

  const clinic: Clinic = {
    id: C,
    name: DEMO_CLINIC_NAME,
    address: "12 Dzorwulu Road, Mile 3, East Legon, Accra",
    phone: "+233 30 274 8890",
    email: "frontdesk@mile3dental.com.gh",
    logo_url: null,
    hours: {
      monday: "08:00 – 18:00",
      tuesday: "08:00 – 18:00",
      wednesday: "08:00 – 18:00",
      thursday: "08:00 – 18:00",
      friday: "08:00 – 18:00",
      saturday: "09:00 – 15:00",
      sunday: "Closed",
    },
    services: SERVICES,
    pricing: PRICING,
    policies: {
      cancellation: "Please give 24 hours' notice to reschedule.",
      deposits: "GH₵200 deposit for implant consultations.",
      first_visit: "First consultation fee of GH₵400 is waived for Franel bookings.",
    },
    created_at: at(-182, 9, 0),
    updated_at: at(-6, 11, 30),
  }

  const staff: Staff[] = [
    {
      id: "demo-staff-01",
      clinic_id: C,
      auth_user_id: DEMO_USER_ID,
      name: "Dr. Yaw Osei-Bonsu",
      role: "owner",
      phone: "+233 24 480 1122",
      email: DEMO_EMAIL,
      is_active: true,
      created_at: at(-182, 9, 5),
    },
    {
      id: "demo-staff-02",
      clinic_id: C,
      auth_user_id: null,
      name: "Akosua Mensimah",
      role: "manager",
      phone: "+233 20 887 3345",
      email: "akosua@mile3dental.com.gh",
      is_active: true,
      created_at: at(-150, 10, 0),
    },
    {
      id: "demo-staff-03",
      clinic_id: C,
      auth_user_id: null,
      name: "Efua Adjei",
      role: "receptionist",
      phone: "+233 55 902 6674",
      email: "efua@mile3dental.com.gh",
      is_active: true,
      created_at: at(-120, 8, 30),
    },
  ]

  const OWN = staff[0].id
  const MGR = staff[1].id

  const patients: Patient[] = [
    { id: "demo-p-01", clinic_id: C, name: "Kwame Boateng", phone: "+233 24 555 1201", email: "kwame.boateng@gmail.com", source: "WhatsApp enquiry", notes: "Prefers morning slots.", created_at: at(-4, 9, 2) },
    { id: "demo-p-02", clinic_id: C, name: "Ama Serwaa Mensah", phone: "+233 20 555 3342", email: "amas.mensah@gmail.com", source: "Instagram DM", notes: null, created_at: at(-3, 14, 12) },
    { id: "demo-p-03", clinic_id: C, name: "Nana Yaw Darko", phone: "+233 55 555 8710", email: null, source: "Google search", notes: "Asked about payment plans for implants.", created_at: at(-2, 8, 41) },
    { id: "demo-p-04", clinic_id: C, name: "Abena Ofori-Attah", phone: "+233 27 555 6621", email: "abena.oa@yahoo.com", source: "Referral from patient", notes: "Referred by Mrs. Ampofo (longtime patient).", created_at: at(-5, 16, 20) },
    { id: "demo-p-05", clinic_id: C, name: "Kojo Antwi", phone: "+233 26 555 9084", email: "kojo.antwi@gmail.com", source: "WhatsApp enquiry", notes: null, created_at: at(-1, 7, 55) },
    { id: "demo-p-06", clinic_id: C, name: "Esi Danso", phone: "+233 54 555 2277", email: "esi.danso@gmail.com", source: "Google search", notes: "Price-sensitive, comparing with two other clinics.", created_at: at(0, 8, 24) },
    { id: "demo-p-07", clinic_id: C, name: "Selorm Agbeko", phone: "+233 24 555 4419", email: null, source: "WhatsApp enquiry", notes: null, created_at: at(-2, 11, 8) },
    { id: "demo-p-08", clinic_id: C, name: "Adjoa Nyarko", phone: "+233 57 555 7150", email: "adjoa.nyarko@gmail.com", source: "Walk-in (first enquiry on WhatsApp)", notes: null, created_at: at(-4, 15, 2) },
    { id: "demo-p-09", clinic_id: C, name: "Fiifi Tetteh", phone: "+233 20 555 8830", email: "fiifi.tetteh@gmail.com", source: "WhatsApp enquiry", notes: "Works in Tema, available after 3 PM.", created_at: at(-6, 10, 47) },
    { id: "demo-p-10", clinic_id: C, name: "Efia Adu-Sarkodie", phone: "+233 55 555 0091", email: "efia.as@gmail.com", source: "Instagram DM", notes: "Booked whitening for her sister first.", created_at: at(0, 7, 40) },
  ]

  type ConvSeed = Omit<Conversation, "patient" | "messages" | "appointments" | "follow_ups" | "escalations">
  const conversations: ConvSeed[] = []
  const messages: DemoMessage[] = []

  const addConversation = (c: Partial<ConvSeed> & Pick<ConvSeed, "id" | "patient_id" | "status" | "created_at">, messagesFor: DemoMessage[]) => {
    const created = c.created_at
    const lastAt = messagesFor.length ? messagesFor[messagesFor.length - 1].created_at : created
    const lastText = [...messagesFor].reverse().find((m) => m.message_type === "text")
    conversations.push({
      clinic_id: C,
      intent: c.intent ?? null,
      service_interest: c.service_interest ?? null,
      lead_level: c.lead_level ?? null,
      last_message_at: c.last_message_at ?? lastAt,
      last_message_preview:
        c.last_message_preview ?? (lastText ? (lastText.content.length > 90 ? lastText.content.slice(0, 87) + "…" : lastText.content) : null),
      assigned_staff_id: c.assigned_staff_id ?? null,
      updated_at: c.updated_at ?? lastAt,
      ...c,
    })
    messages.push(...messagesFor)
  }

  // 1) Kwame Boateng — booked, scale/poliish confirmed for tomorrow (AI-handled end to end)
  {
    const cid = "demo-c-01"
    addConversation(
      { id: cid, patient_id: "demo-p-01", status: "booked", intent: "scale and polish", service_interest: "Dental check-up & scale/polish", lead_level: "high", created_at: at(-4, 9, 2) },
      [
        msg("demo-m-001", cid, "patient", "Good morning, do you do teeth cleaning and polishing?", at(-4, 9, 2)),
        msg("demo-m-002", cid, "franel", "Good morning Kwame! Yes we do. A full exam plus scale and polish is GH₵350 and takes about 45 minutes. I have Tuesday 11:30 AM or Wednesday 10:00 AM free. Which works for you?", at(-4, 9, 2, 38)),
        msg("demo-m-003", cid, "patient", "Tuesday 11:30 works for me.", at(-4, 9, 4)),
        msg("demo-m-004", cid, "franel", "Perfect. You're booked for Tuesday at 11:30 AM for your scale and polish. Our clinic is at 12 Dzorwulu Road, Mile 3, East Legon. I'll send a reminder the day before. See you then!", at(-4, 9, 4, 41)),
        syst("demo-m-005", cid, "lead_qualified", at(-4, 9, 4, 42), "Lead qualified: Kwame Boateng wants a scale/polish (high intent)."),
        syst("demo-m-006", cid, "appointment_booked", at(-4, 9, 4, 43), "Appointment booked: scale/polish on Tuesday 11:30 AM (confirmed automatically)."),
        msg("demo-m-007", cid, "patient", "Thanks, see you Tuesday.", at(-3, 18, 22)),
        msg("demo-m-008", cid, "franel", "You're welcome Kwame! We'll text you a reminder before then.", at(-3, 18, 22, 29)),
      ]
    )
  }

  // 2) Ama Serwaa Mensah — qualified, comparing whitening options (Franel handling price talk)
  {
    const cid = "demo-c-02"
    addConversation(
      { id: cid, patient_id: "demo-p-02", status: "qualified", intent: "teeth whitening", service_interest: "Teeth whitening", lead_level: "high", created_at: at(-1, 14, 12) },
      [
        msg("demo-m-009", cid, "patient", "Hi, I saw your whitening on Instagram. How much is it and does it hurt?", at(-1, 14, 12)),
        msg("demo-m-010", cid, "franel", "Hi Ama! In-studio whitening is GH₵1,800 for one session of 60–90 minutes. It's done with a desensitising gel, so most patients feel barely anything. Would you like a free 10-minute consult first?", at(-1, 14, 12, 33)),
        msg("demo-m-011", cid, "patient", "Does it last long? I drink a lot of tea.", at(-1, 14, 15)),
        msg("demo-m-012", cid, "franel", "Great question. With tea, we recommend a touch-up every 6–8 months to keep the brightness. We offer a maintenance plan at GH₵450/session if you'd like. Shall I check Thursday's slots for you?", at(-1, 14, 15, 27)),
        msg("demo-m-013", cid, "patient", "Yes please, Thursday morning.", at(-1, 14, 18)),
        msg("demo-m-014", cid, "franel", "Thursday 10:30 AM or 11:15 AM both available. Which one shall I hold for you?", at(-1, 14, 18, 22)),
        syst("demo-m-015", cid, "lead_qualified", at(-1, 14, 18, 23), "Lead qualified: Ama Serwaa Mensah wants in-studio whitening (high intent, price conversation completed)."),
      ]
    )
  }

  // 3) Nana Yaw Darko — impl4ants in progress, Franel explained payment plan, referral to Dr.
  {
    const cid = "demo-c-03"
    addConversation(
      { id: cid, patient_id: "demo-p-03", status: "qualified", intent: "dental implants with payment plan", service_interest: "Dental implants", lead_level: "medium", created_at: at(-2, 8, 41) },
      [
        msg("demo-m-016", cid, "patient", "Good evening. I lost a molar in 2024. What would an implant cost?", at(-2, 8, 41)),
        msg("demo-m-017", cid, "franel", "Good evening. A full implant with ceramic crown is GH₵8,500 per arch with us, and treatment is staged over 3 visits. We do offer a 3-month payment split (GH₵2,800 / GH₵2,800 / GH₵2,900). Would you like Dr. Osei-Bonsu to review your case in a free 15-minute consult?", at(-2, 8, 41, 40)),
        msg("demo-m-018", cid, "patient", "Can I pay monthly? What do I need to bring?", at(-2, 8, 45)),
        msg("demo-m-019", cid, "franel", "Yes, the 3-month split works like that. For the consult bring any old X-rays you have (if none, we take one digitally on-site). I can hold Friday 3:00 PM or next Tuesday 9:30 AM.", at(-2, 8, 45, 26)),
        msg("demo-m-020", cid, "patient", "Friday 3 PM is good. I'll come by.", at(-1, 20, 7)),
        msg("demo-m-021", cid, "franel", "Great, I've noted Friday 3:00 PM. I'll confirm with the team and send you a reminder on Thursday.", at(-1, 20, 7, 31)),
        syst("demo-m-022", cid, "lead_qualified", at(-1, 20, 7, 32), "Lead qualified: Nana Yaw Darko wants implant consult with payment plan (medium intent, price-sensitive)."),
      ]
    )
  }

  // 4) Abena Ofori-Attah — root canal, Franel triaged as urgent and escalated to Dr. (open Tier 2)
  {
    const cid = "demo-c-04"
    addConversation(
      { id: cid, patient_id: "demo-p-04", status: "escalated", intent: "severe tooth pain, possible root canal", service_interest: "Root canal treatment", lead_level: "high", created_at: at(0, 8, 12), assigned_staff_id: OWN },
      [
        msg("demo-m-023", cid, "patient", "Hello, my upper right tooth has been hurting badly for 2 days. I can barely sleep. Can I come in?", at(0, 8, 12)),
        msg("demo-m-024", cid, "franel", "I'm so sorry to hear that Abena. This sounds like it needs a same-day look. We have an emergency slot today at 12:30 PM. Root canal treatment is GH₵950 per tooth and done under local anaesthetic. Shall I put you at 12:30 PM?", at(0, 8, 12, 29)),
        msg("demo-m-025", cid, "patient", "Yes please, 12:30 is fine. Is it the one next to my wisdom tooth, the second from the back?", at(0, 8, 14)),
        msg("demo-m-026", cid, "franel", "Noted — second molar from the back, upper right. You're held at 12:30 PM today for a root canal evaluation. Please bring a light cloth and arrive 10 minutes early.", at(0, 8, 14, 24)),
        syst("demo-m-027", cid, "escalation_created", at(0, 8, 14, 25), "Escalated to a human: severe pain 2 days, possible root canal. Tier 2, assigned Dr. Osei-Bonsu."),
        msg("demo-m-028", cid, "staff", "Good morning Abena, this is Dr. Osei-Bonsu. See you at 12:30 — we have the chair ready. If the pain spikes before then, take paracetamol (1 tablet) and reply here.", at(0, 8, 26), { staff_id: OWN }),
      ]
    )
  }

  // 5) Kojo Antwi — wisdom tooth removal booked for tomorrow, reminder sent, check-in pending
  {
    const cid = "demo-c-05"
    addConversation(
      { id: cid, patient_id: "demo-p-05", status: "booked", intent: "wisdom tooth removal", service_interest: "Wisdom tooth removal", lead_level: "high", created_at: at(-6, 10, 47) },
      [
        msg("demo-m-029", cid, "patient", "Hi, one of my wisdom teeth is aching on and off. How long does removal take?", at(-6, 10, 47)),
        msg("demo-m-030", cid, "franel", "Hello Kojo! Wisdom tooth removal is GH₵600 and takes about 40 minutes, done under local anaesthetic. Recovery is usually 2 to 3 days. We have Wednesday 11:00 AM or 2:30 PM free.", at(-6, 10, 47, 35)),
        msg("demo-m-031", cid, "patient", "Wednesday 11 works for me.", at(-6, 11, 5)),
        msg("demo-m-032", cid, "franel", "Perfect, you're booked for Wednesday 11:00 AM. Please don't eat after 10 AM and bring a light cloth. I'll send a reminder tomorrow.", at(-6, 11, 5, 38)),
        syst("demo-m-033", cid, "lead_qualified", at(-6, 11, 5, 39), "Lead qualified: Kojo Antwi, wisdom tooth removal (high intent)."),
        syst("demo-m-034", cid, "appointment_booked", at(-6, 11, 5, 40), "Appointment booked: wisdom tooth removal, Wednesday 11:00 AM (auto-confirmed)."),
        msg("demo-m-035", cid, "franel", "Hi Kojo, gentle reminder that your wisdom tooth removal is tomorrow at 11:00 AM. Don't eat after 10 AM. See you then!", at(-1, 17, 0)),
      ]
    )
  }

  // 6) Esi Danso — new enquiry from this morning, Franel mid-conversation
  {
    const cid = "demo-c-06"
    addConversation(
      { id: cid, patient_id: "demo-p-06", status: "new", intent: "cleaning plus whitening prices", created_at: at(0, 8, 24) },
      [
        msg("demo-m-036", cid, "patient", "Hi, how much is a full cleaning with whitening?", at(0, 8, 24)),
        msg("demo-m-037", cid, "franel", "Hi Esi! A scale and polish is GH₵350, and in-studio whitening is GH₵1,800, so both together come to GH₵2,150. We can finish the same visit. Would you like Thursday's or Friday's slots?", at(0, 8, 24, 26)),
        msg("demo-m-038", cid, "patient", "Is the whitening safe for dentures?", at(0, 8, 31)),
        msg("demo-m-039", cid, "franel", "Great question. If you have dentures, we do a gentler in-tray whitening and check your natural teeth first. A 10-minute consult will tell us exactly which suits you. Shall I hold Thursday 10:00 AM for the consult?", at(0, 8, 31, 31)),
      ]
    )
  }

  // 7) Selorm Agbeko — closing with no-show recovery; recovered a no-show and rebooked
  {
    const cid = "demo-c-07"
    addConversation(
      { id: cid, patient_id: "demo-p-07", status: "booked", intent: "scale and polish after a no-show", service_interest: "Dental check-up & scale/polish", lead_level: "medium", created_at: at(-2, 11, 8) },
      [
        msg("demo-m-040", cid, "patient", "I'd like to book a cleaning, by my last one was missed so I'd prefer this week.", at(-2, 11, 8)),
        msg("demo-m-041", cid, "franel", "Hi Selorm! No problem at all. We have today 3:30 PM and tomorrow 9:45 AM. For the cleaning, GH₵350, we'll also do a quick gum check. Which fits you?", at(-2, 11, 8, 34)),
        msg("demo-m-042", cid, "patient", "Today 3:30 works.", at(-2, 11, 9)),
        msg("demo-m-043", cid, "franel", "Booked for today 3:30 PM. You're welcome — see you soon.", at(-2, 11, 9, 28)),
        syst("demo-m-044", cid, "no_show", at(-7, 10, 5), "No-show flagged: scale and polish missed, patient recovered via follow-up."),
        syst("demo-m-045", cid, "appointment_booked", at(-2, 11, 9, 29), "Appointment booked: scale/polish, today 3:30 PM (rebook after no-show recovery)."),
      ]
    )
  }

  // 8) Adjoa Nyarko — compared clinics, initial refusal, Franel recovered and booked
  {
    const cid = "demo-c-08"
    addConversation(
      { id: cid, patient_id: "demo-p-08", status: "booked", intent: "teeth whitening after comparison", service_interest: "Teeth whitening", lead_level: "medium", created_at: at(-4, 15, 2) },
      [
        msg("demo-m-046", cid, "patient", "Hi, I visited a clinic near Kalrom last week and they quoted GH₵1,200 for whitening. Why is yours GH₵1,800?", at(-4, 15, 2)),
        msg("demo-m-047", cid, "franel", "Hi Adjoa, honest answer: that price is usually one LED lamp pass with no assessment, no desensitiser and no follow-up. Ours includes a full oral exam, professional polish, desensitising gel and a 30-day sensitivity check at no extra cost. We also share the X-rays on file of any prior work so we don't over-treat. That's the difference.", at(-4, 15, 2, 44)),
        msg("demo-m-048", cid, "patient", "Okay, that's reasonable. How long until I can see results?", at(-4, 15, 6)),
        msg("demo-m-049", cid, "franel", "Results are visible the same day, and we do a 30-day check to fine-tune. Would you like Thursday 11:15 AM for the full session? It's 60 to 90 minutes.", at(-4, 15, 6, 29)),
        msg("demo-m-050", cid, "patient", "Actually yes. Thursday 11:15.", at(-4, 15, 9)),
        msg("demo-m-051", cid, "franel", "Done, you're booked Thursday 11:15 AM for whitening. Don't use strong toothpaste 48 hours after. See you then!", at(-4, 15, 9, 26)),
        syst("demo-m-052", cid, "lead_qualified", at(-4, 15, 9, 27), "Recovery: Adjoa Nyarko was ready to leave for a cheaper quote, recovered with value explanation (medium intent)."),
        syst("demo-m-053", cid, "appointment_booked", at(-4, 15, 9, 28), "Appointment booked: whitening, Thursday 11:15 AM (recovered lead)."),
      ]
    )
  }

  // 9) Fiifi Tetteh — walk-in converted to regular patient, closed after completed check-up
  {
    const cid = "demo-c-09"
    addConversation(
      { id: cid, patient_id: "demo-p-09", status: "closed", intent: "check-up and cleaning, follow-up scheduled", service_interest: "Dental check-up & scale/polish", created_at: at(-5, 16, 20) },
      [
        msg("demo-m-054", cid, "patient", "Hi, I've been a walk-in patient twice. Can I get a recurring cleaning date on WhatsApp next time?", at(-5, 16, 20)),
        msg("demo-m-055", cid, "franel", "Of course, Fiifi. Your next cleaning is due around now anyway. We have Saturday 10:30 AM or Monday 9:00 AM. Shall I book you in?", at(-5, 16, 20, 33)),
        msg("demo-m-056", cid, "patient", "Monday 9:00 is good.", at(-5, 16, 24)),
        msg("demo-m-057", cid, "franel", "Booked, Monday 9:00 AM. I'll remind you the day before.", at(-5, 16, 24, 27)),
        syst("demo-m-058", cid, "appointment_booked", at(-5, 16, 24, 28), "Appointment booked: check-up/polish, Monday 9:00 AM (walk-in converted to scheduled)."),
      ]
    )
  }

  // 10) Efia Adu-Sarkodie — whitening completed, check-in sent, closed
  {
    const cid = "demo-c-10"
    addConversation(
      { id: cid, patient_id: "demo-p-10", status: "closed", intent: "whitening completed, touch-up offered", service_interest: "Teeth whitening", created_at: at(-8, 9, 12) },
      [
        msg("demo-m-059", cid, "patient", "Hi, I'm on socials for the whitening. How much and does it hurt?", at(-8, 9, 12)),
        msg("demo-m-060", cid, "franel", "Hi Efia! In-studio whitening is GH₵1,800, 60 to 90 minutes, with desensitising gel so most patients feel nothing. We also do results that day and a follow-up 30 days later at no extra cost.", at(-8, 9, 12, 37)),
        msg("demo-m-061", cid, "patient", "Great, book me in for next week.", at(-8, 9, 15)),
        msg("demo-m-062", cid, "franel", "Of course. We'll see you next week at the session. If anything swells or you feel sensitivity, do let us know.", at(-8, 9, 15, 31)),
        syst("demo-m-063", cid, "appointment_booked", at(-8, 9, 15, 32), "Appointment booked: whitening session."),
        msg("demo-m-064", cid, "franel", "Hi Efia, following up after your whitening. How are you? Any sensitivity? If you'd like to keep the results, a maintainer session is GH₵450, we'd schedule it 6 to 8 months out.", at(-2, 10, 0)),
        msg("demo-m-065", cid, "patient", "All good, no sensitivity at all. I'll keep the maintenance in mind.", at(-2, 10, 4)),
        msg("demo-m-066", cid, "franel", "Wonderful to hear. We'll remind you when it's time for the maintenance. Have a nice day!", at(-2, 10, 4, 24)),
      ]
    )
  }

  // 11) Nana Yaw (second patient) — implant quote esc3alated as operational (Tier 3) to manager
  {
    const cid = "demo-c-11"
    addConversation(
      { id: cid, patient_id: "demo-p-03", status: "escalated", intent: "implant quote and insurance billing", service_interest: "Dental implants", lead_level: "medium", created_at: at(-1, 9, 30), assigned_staff_id: MGR },
      [
        msg("demo-m-067", cid, "patient", "Do you accept insurance for implants? My employer's plan covers 'restorative dentistry'.", at(-1, 9, 30)),
        msg("demo-m-068", cid, "franel", "Good question. We can invoice your insurer and provide a treatment plan with itemised costs for their assessment. I'll flag a manager to confirm your cover under your plan. Could you share the insurer name?", at(-1, 9, 30, 41)),
        msg("demo-m-069", cid, "patient", "It's Hollard. Policy is under my company.", at(-1, 9, 33)),
        syst("demo-m-070", cid, "escalation_created", at(-1, 9, 33, 30), "Escalated as operational: insurance billing (Hollard) confirmation needed. Tier 3, assigned Akosua Mensimah."),
      ]
    )
  }

  // 12) Kwame Boateng (second) — new after-hours enquiry, Franel auto-resolved and booked
  {
    const cid = "demo-c-12"
    addConversation(
      { id: cid, patient_id: "demo-p-01", status: "booked", intent: "after-hours scale and polish", service_interest: "Dental check-up & scale/polish", lead_level: "high", created_at: at(-1, 2, 14) },
      [
        msg("demo-m-071", cid, "patient", "Sorry it's so late, but my teeth feel sensitive. Can I come in tomorrow?", at(-1, 2, 14)),
        msg("demo-m-072", cid, "franel", "No worries at all, Kwame, we've got you. Sensitive teeth are often relieved by a polish plus a non-abrasive toothpaste. We have tomorrow 9:30 AM. Shall I book that?", at(-1, 2, 14, 36)),
        msg("demo-m-073", cid, "patient", "Yes please, 9:30 works.", at(-1, 2, 16)),
        msg("demo-m-074", cid, "franel", "Booked, tomorrow 9:30 AM. Rest easy, we'll see you in the morning.", at(-1, 2, 16, 28)),
        syst("demo-m-075", cid, "appointment_booked", at(-1, 2, 16, 29), "Appointment booked: scale/polish, tomorrow 9:30 AM (booked after hours, 2:14 AM)."),
      ]
    )
  }

  // ---- appointments
  const appointments: DemoAppointment[] = [
    { id: "demo-a-01", clinic_id: C, patient_id: "demo-p-01", conversation_id: "demo-c-12", appointment_date: dd(1), appointment_time: "09:30", service: "Dental check-up & scale/polish", status: "confirmed", attendance: "pending", marked_by: null, marked_at: null, notes: "Sensitive teeth, after-hours booking.", created_at: at(-1, 2, 16), updated_at: at(-1, 2, 16) },
    { id: "demo-a-02", clinic_id: C, patient_id: "demo-p-04", conversation_id: "demo-c-04", appointment_date: dd(0), appointment_time: "12:30", service: "Root canal treatment", status: "confirmed", attendance: "pending", marked_by: null, marked_at: null, notes: "Emergency, severe pain, 2 days.", created_at: at(0, 8, 14), updated_at: at(0, 8, 14) },
    { id: "demo-a-03", clinic_id: C, patient_id: "demo-p-07", conversation_id: "demo-c-07", appointment_date: dd(0), appointment_time: "15:30", service: "Dental check-up & scale/polish", status: "confirmed", attendance: "pending", marked_by: null, marked_at: null, notes: "Rebook after no-show recovery.", created_at: at(-2, 11, 9), updated_at: at(-2, 11, 9) },
    { id: "demo-a-04", clinic_id: C, patient_id: "demo-p-05", conversation_id: "demo-c-05", appointment_date: dd(1), appointment_time: "11:00", service: "Wisdom tooth removal", status: "confirmed", attendance: "pending", marked_by: null, marked_at: null, notes: "Fasting from 10 AM advised.", created_at: at(-6, 11, 5), updated_at: at(-6, 11, 5) },
    { id: "demo-a-05", clinic_id: C, patient_id: "demo-p-02", conversation_id: "demo-c-02", appointment_date: dd(3), appointment_time: "10:30", service: "Teeth whitening", status: "confirmed", attendance: "pending", marked_by: null, marked_at: null, notes: "Free 10-minute consult first.", created_at: at(-1, 14, 18), updated_at: at(-1, 14, 18) },
    { id: "demo-a-06", clinic_id: C, patient_id: "demo-p-03", conversation_id: "demo-c-03", appointment_date: dd(4), appointment_time: "15:00", service: "Dental implants", status: "confirmed", attendance: "pending", marked_by: null, marked_at: null, notes: "Free implant consult, payment plan discussed.", created_at: at(-1, 20, 7), updated_at: at(-1, 20, 7) },
    { id: "demo-a-07", clinic_id: C, patient_id: "demo-p-06", conversation_id: "demo-c-06", appointment_date: dd(2), appointment_time: "10:00", service: "Dental check-up & scale/polish", status: "pending", attendance: "pending", marked_by: null, marked_at: null, notes: "Consult re: dentures + whitening fit.", created_at: at(0, 8, 31), updated_at: at(0, 8, 31) },
    { id: "demo-a-08", clinic_id: C, patient_id: "demo-p-10", conversation_id: "demo-c-10", appointment_date: dd(-2), appointment_time: "10:00", service: "Teeth whitening", status: "confirmed", attendance: "attended", marked_by: "staff", marked_at: at(-2, 11, 5), notes: "Completed, touch-up offered.", created_at: at(-8, 9, 15), updated_at: at(-2, 11, 5) },
    { id: "demo-a-09", clinic_id: C, patient_id: "demo-p-09", conversation_id: "demo-c-09", appointment_date: dd(-1), appointment_time: "09:00", service: "Dental check-up & scale/polish", status: "confirmed", attendance: "attended", marked_by: "staff", marked_at: at(-1, 9, 50), notes: "Walk-in converted to scheduled patient.", created_at: at(-5, 16, 24), updated_at: at(-1, 9, 50) },
    { id: "demo-a-10", clinic_id: C, patient_id: "demo-p-07", conversation_id: "demo-c-07", appointment_date: dd(-7), appointment_time: "11:00", service: "Dental check-up & scale/polish", status: "no-show", attendance: "no-show", marked_by: "system", marked_at: at(-7, 10, 5), notes: "No-show, recovered and rebooked.", created_at: at(-9, 10, 0), updated_at: at(-7, 10, 5) },
  ]

  // ---- escalations
  const escalations: DemoEscalation[] = [
    { id: "demo-e-01", clinic_id: C, conversation_id: "demo-c-04", tier: 2, status: "open", description: "Severe tooth pain for 2 days, possible root canal. Same-day emergency slot offered and accepted.", assigned_to: OWN, resolved_at: null, created_at: at(0, 8, 14, 25) },
    { id: "demo-e-02", clinic_id: C, conversation_id: "demo-c-11", tier: 3, status: "in-progress", description: "Patient's employer insurance (Hollard) billing confirmation for implants. Awaiting cover check.", assigned_to: MGR, resolved_at: null, created_at: at(-1, 9, 33, 30) },
    { id: "demo-e-03", clinic_id: C, conversation_id: "demo-c-08", tier: 2, status: "resolved", description: "Price comparison with a cheaper competing quote. Value explanation led to converted booking.", assigned_to: OWN, resolved_at: at(-3, 9, 12), created_at: at(-4, 15, 20) },
  ]

  // ---- follow-ups
  const followUps: DemoFollowUp[] = [
    { id: "demo-f-01", clinic_id: C, conversation_id: "demo-c-05", patient_id: "demo-p-05", type: "reminder", scheduled_at: at(-1, 17, 0), sent_at: at(-1, 17, 0), status: "sent", template_used: "day_before_reminder", created_at: at(-2, 9, 0) },
    { id: "demo-f-02", clinic_id: C, conversation_id: "demo-c-05", patient_id: "demo-p-05", type: "non-booker", scheduled_at: at(1, 12, 0), sent_at: null, status: "pending", template_used: "post_visit_checkin", created_at: at(0, 8, 0) },
    { id: "demo-f-03", clinic_id: C, conversation_id: "demo-c-07", patient_id: "demo-p-07", type: "no-show-recovery", scheduled_at: at(-7, 10, 15), sent_at: at(-7, 10, 15), status: "sent", template_used: "no_show_recovery", created_at: at(-7, 10, 6) },
    { id: "demo-f-04", clinic_id: C, conversation_id: "demo-c-08", patient_id: "demo-p-08", type: "non-booker", scheduled_at: at(-4, 15, 30), sent_at: at(-4, 15, 30), status: "sent", template_used: "price_objection", created_at: at(-4, 15, 3) },
    { id: "demo-f-05", clinic_id: C, conversation_id: "demo-c-10", patient_id: "demo-p-10", type: "non-booker", scheduled_at: at(-2, 10, 0), sent_at: at(-2, 10, 0), status: "sent", template_used: "post_visit_checkin", created_at: at(-3, 9, 0) },
  ]

  // ---- clinic config
  const config: ClinicConfig = {
    id: "demo-config-01",
    clinic_id: C,
    follow_up_intervals: [1, 3, 7],
    reminder_hours_before: 24,
    checkin_hours_after: 48,
    checkin_flag_timeout_hours: 24,
    whatsapp_templates: {
      day_before_reminder: "Hi {{name}}, a reminder that your {{service}} is tomorrow at {{time}}. Reply R to confirm or C to cancel.",
      post_visit_checkin: "Hi {{name}}, how are you feeling after your visit on {{date}}? Let us know if anything feels off.",
      no_show_recovery: "Hi {{name}}, we noticed you couldn't make it on {{date}}. No worries, we have a fresh slot at {{time}}. Would that work?",
      price_objection: "Hi {{name}}, we understand price matters. Ours includes {{value_points}}. Happy to answer any questions.",
      lead_followup: "Hi {{name}}, following up on your {{service}} enquiry. Do you have a preferred time this week?",
    },
    created_at: at(-182, 9, 10),
    updated_at: at(-6, 11, 35),
  }

  return { clinic, staff, patients, conversations, messages, appointments, escalations, followUps, config }
}