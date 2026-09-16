import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { useAuth } from "@/hooks/useAuth"
import {
  useClinic,
  useClinicConfig,
  useConversations,
  useEscalations,
  useFollowUps,
  useAppointments,
  usePatients,
  useStaffClinicId,
  useStaffList,
} from "@/hooks/useData"
import { useDashboardStats } from "@/hooks/useDashboardStats"
import { deriveAiActivity } from "@/lib/activity"
import { onRefresh } from "@/lib/refresh"
import type {
  AiActivityEvent,
  Appointment,
  Clinic,
  ClinicConfig,
  Conversation,
  DashboardStats,
  Escalation,
  FollowUp,
  Patient,
  Staff,
} from "@/lib/types"
import Sidebar from "./Sidebar"
import Topbar, { type DateRange } from "./Topbar"
import AiActivityDrawer from "./AiActivityDrawer"
import { InsightsBubble } from "@/components/insights/InsightsBubble"
import { Spinner } from "@/components/ui/Skeleton"

export interface LayoutData {
  clinicId: string
  clinic: Clinic | null
  config: ClinicConfig | null
  staff: Staff | null
  staffList: Staff[] | null
  conversations: Conversation[]
  patients: Patient[]
  appointments: Appointment[]
  escalations: Escalation[]
  followUps: FollowUp[]
  stats: DashboardStats
  activities: AiActivityEvent[]
  loading: boolean
  unreadCount: number
  escalateCount: number
  handledToday: number
  range: DateRange
  setRange: (r: DateRange) => void
  openActivity: () => void
  refetch: () => void
}

const LayoutContext = createContext<LayoutData | null>(null)

export function useLayoutData(): LayoutData {
  const ctx = useContext(LayoutContext)
  if (!ctx) throw new Error("useLayoutData must be used inside <Layout>")
  return ctx
}

export default function Layout({ children }: { children?: ReactNode }) {
  const { user, isDemo } = useAuth()
  const { clinicId, staff, loading: authLoading } = useStaffClinicId(user?.id ?? null)

  const { clinic, loading: clinicLoading } = useClinic(clinicId)
  const { config } = useClinicConfig(clinicId)
  const { conversations, loading: convLoading, refetch: refetchConv } = useConversations(clinicId)
  const { patients, loading: patLoading } = usePatients(clinicId)
  const { appointments, loading: apptLoading, refetch: refetchAppt } = useAppointments(clinicId)
  const { escalations, loading: escLoading } = useEscalations(clinicId, "all")
  const { followUps, loading: fuLoading } = useFollowUps(clinicId)
  const { staffList, refetch: refetchStaff } = useStaffList(clinicId)
  const { stats, loading: statsLoading, refetch: refetchStats } = useDashboardStats(clinicId)

  const [activityOpen, setActivityOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [range, setRange] = useState<DateRange>("today")
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("fr-sidebar-collapsed") === "1"
    } catch {
      return false
    }
  })

  const toggleSidebar = () => {
    setSidebarCollapsed((v) => {
      const next = !v
      try {
        localStorage.setItem("fr-sidebar-collapsed", next ? "1" : "0")
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const loading =
    authLoading || clinicLoading || convLoading || patLoading || apptLoading || escLoading || fuLoading || statsLoading

  const activities = useMemo(
    () => deriveAiActivity({ conversations, escalations, followUps }),
    [conversations, escalations, followUps]
  )

  const unreadCount = useMemo(
    () =>
      conversations.filter(
        (c) => c.status === "new" || (c.status === "escalated" && c.escalations?.some((e) => e.status !== "resolved"))
      ).length,
    [conversations]
  )

  const escalateCount = useMemo(() => escalations.filter((e) => e.status !== "resolved").length, [escalations])

  const handledToday = useMemo(() => {
    const dayMs = 24 * 60 * 60 * 1000
    return conversations.filter((c) => c.last_message_at && Date.now() - new Date(c.last_message_at).getTime() < dayMs).length
  }, [conversations])

  const refetch = useMemo(
    () => () => {
      if (isDemo) return
      refetchConv()
      refetchAppt()
      refetchStats()
      refetchStaff()
    },
    [refetchConv, refetchAppt, refetchStats, refetchStaff, isDemo]
  )

  // Global manual refresh from the Topbar
  useEffect(() => onRefresh(refetch), [refetch])

  const data: LayoutData = {
    clinicId: clinicId ?? "",
    clinic,
    config,
    staff,
    staffList,
    conversations,
    patients,
    appointments,
    escalations,
    followUps,
    stats,
    activities,
    loading,
    unreadCount,
    escalateCount,
    handledToday,
    range,
    setRange,
    openActivity: () => setActivityOpen(true),
    refetch,
  }

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Spinner className="size-6" />
      </div>
    )
  }
  if (!clinicId) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 bg-background text-center">
        <p className="text-sm font-semibold">No clinic found for this account</p>
        <p className="text-xs text-muted">
          Ask your clinic owner to add you as a team member, or sign in with a different account.
        </p>
      </div>
    )
  }

  return (
    <LayoutContext.Provider value={data}>
      <div className="flex h-screen overflow-hidden bg-background">
        <div className="hidden lg:block">
          <Sidebar
            handledToday={handledToday}
            staff={staff}
            clinic={clinic}
            unreadCount={unreadCount}
            escalateCount={escalateCount}
            collapsed={sidebarCollapsed}
            onToggle={toggleSidebar}
          />
        </div>

        {/* Mobile nav */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/50 anim-fade" onClick={() => setMobileNavOpen(false)} />
            <div className="absolute inset-y-0 left-0 anim-slide-up">
              <Sidebar
                handledToday={handledToday}
                staff={staff}
                clinic={clinic}
                unreadCount={unreadCount}
                escalateCount={escalateCount}
                onNavigate={() => setMobileNavOpen(false)}
              />
            </div>
          </div>
        )}

        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[1440px] p-4 lg:p-6">
              {children ?? null}
            </div>
          </div>
          <AiActivityDrawer open={activityOpen} onClose={() => setActivityOpen(false)} />
          <InsightsBubble />
        </main>
      </div>
    </LayoutContext.Provider>
  )
}