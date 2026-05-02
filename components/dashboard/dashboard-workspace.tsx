"use client"

import { useState } from "react"
import { AgentChartCanvas } from "@/components/dashboard/agent-chart-canvas"
import { AgentCapsulePanel, DEFAULT_BOXES } from "@/components/dashboard/agent-capsule-panel"
import type { PriceBox } from "@/components/dashboard/types"
export function DashboardWorkspace() {
  const [boxes, setBoxes] = useState<PriceBox[]>(DEFAULT_BOXES)
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null)
  const [agentStatus, setAgentStatus] = useState<"idle" | "armed" | "running">("running")

  return (
    <div className="max-w-[1600px] mx-auto">
      {/* Split: chart + floating capsule */}
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 lg:items-start">
        <div className="order-1 lg:order-1 lg:sticky lg:top-24 w-full shrink-0 lg:w-[300px] xl:w-[320px]">
          <AgentCapsulePanel
            agentStatus={agentStatus}
            onStatusChange={setAgentStatus}
            onApplyBoxes={setBoxes}
          />
        </div>

        <section className="flex-1 min-w-0 order-2 lg:order-2">
          <AgentChartCanvas
            boxes={boxes}
            selectedBoxId={selectedBoxId}
            onSelectBox={setSelectedBoxId}
            paused={agentStatus !== "running"}
          />
        </section>
      </div>
    </div>
  )
}
