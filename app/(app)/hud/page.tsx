import dynamic from 'next/dynamic'

// Dynamic import keeps SSR off — Canvas + R3F cannot run on server
const HudScene = dynamic(
  () => import('@/components/boardroom/HudScene').then(m => m.HudScene),
  { ssr: false }
)

export default function HudPage() {
  return <HudScene />
}
