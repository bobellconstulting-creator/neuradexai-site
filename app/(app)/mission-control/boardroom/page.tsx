'use client'

import { useRouter } from 'next/navigation'
import { useMissionBridge } from '@/lib/useMissionBridge'
import { TopBar } from '@/components/mission-control/TopBar'
import { BottomBar } from '@/components/mission-control/BottomBar'
import { CommunalChat } from '@/components/mission-control/CommunalChat'
import { BOARDROOM } from '@/lib/missionChannels'

export default function BoardroomPage() {
  const router = useRouter()
  const { telemetry, connected } = useMissionBridge()

  return (
    <div className="mc-root">
      <div className="mc-grid-bg" />
      <div className="mc-scanlines" />
      <div className="mc-scanbar" />

      <div className="absolute inset-0 flex flex-col">
        <TopBar bridgeUp={connected || telemetry.bridgeUp} />

        <div className="flex-1 flex flex-col min-h-0 p-4 gap-3 overflow-hidden">
          {/* Header */}
          <div className="mc-panel mc-corners px-4 py-3 flex items-center gap-4 flex-shrink-0">
            <button
              onClick={() => router.push('/mission-control')}
              className="mc-mono text-[11px] tracking-widest px-3 py-1 border border-[var(--mc-border)] text-sand-dim hover:text-[var(--mc-cyan)] hover:border-[var(--mc-cyan)] rounded"
            >
              ← LOBBY
            </button>
            <span className="text-3xl" style={{ color: '#efb356' }}>⬢</span>
            <div className="flex flex-col">
              <span className="mc-mono text-lg tracking-[0.22em] font-semibold text-[#efb356]">
                THE BOARDROOM
              </span>
              <span className="mc-label">
                Shared room · everything here is visible to every agent&apos;s context window
              </span>
            </div>
            <div className="ml-auto mc-label text-[#efb356]">⚠ PUBLIC CHANNEL</div>
          </div>

          {/* Chat */}
          <div className="flex-1 min-h-0 flex">
            <div className="flex-1 min-h-0 flex flex-col max-w-4xl mx-auto w-full">
              <CommunalChat
                channel={BOARDROOM}
                title="BOARDROOM · ALL AGENTS"
                placeholder="@mention one agent for a private office chat, @mention multiple to meet here…"
              />
            </div>
          </div>
        </div>

        <BottomBar telemetry={telemetry} />
      </div>
    </div>
  )
}
