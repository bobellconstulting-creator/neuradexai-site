import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getAgent } from '@/lib/agents'
import ChatWindow from '@/components/dashboard/chat/ChatWindow'

interface Props {
  params: { agentId: string }
}

export default function AgentPage({ params }: Props) {
  const agent = getAgent(params.agentId)
  if (!agent) notFound()

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb */}
      <div
        className="flex items-center gap-2 px-6 py-2 border-b border-neural-indigo-mid/15 shrink-0"
        style={{ background: 'rgba(5, 5, 10, 0.4)' }}
      >
        <Link
          href="/dashboard"
          className="font-mono text-[10px] text-neural-muted/40 hover:text-neural-muted/70 tracking-wider transition-colors"
        >
          ← BOARDROOM
        </Link>
        <span className="text-neural-indigo-mid/40 font-mono text-[10px]">›</span>
        <span
          className="font-mono text-[10px] tracking-wider font-bold"
          style={{ color: agent.color }}
        >
          {agent.label}
        </span>
      </div>

      {/* Chat — takes all remaining height */}
      <div className="flex-1 min-h-0">
        <ChatWindow agent={agent} />
      </div>
    </div>
  )
}

export function generateStaticParams() {
  // Ensures the dynamic segment is known at build time
  return [
    { agentId: 'main'      },
    { agentId: 'devops'    },
    { agentId: 'marketing' },
    { agentId: 'analyst'   },
  ]
}
