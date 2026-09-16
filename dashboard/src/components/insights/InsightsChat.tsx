import { Modal } from "@/components/ui/Modal"
import { InsightsChatBody } from "./InsightsChatBody"

export interface InsightsChatProps {
  open: boolean
  onClose: () => void
  maximized: boolean
  onToggleMax: () => void
}

export function InsightsChat({ open, onClose, maximized, onToggleMax }: InsightsChatProps) {
  return (
    <Modal open={open} onClose={onClose} maximized={maximized} title="Franel Analyst" description="Read-only analysis of your patient pipeline">
      <InsightsChatBody className={maximized ? "h-full min-h-0" : "h-[58vh]"} showMaximize maximized={maximized} onToggleMax={onToggleMax} />
    </Modal>
  )
}