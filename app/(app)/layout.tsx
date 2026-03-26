import { auth } from '@/auth'
import { SessionProvider } from 'next-auth/react'
import { BridgeProvider } from '@/components/providers/BridgeProvider'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  return (
    <SessionProvider session={session}>
      <BridgeProvider>
        {children}
      </BridgeProvider>
    </SessionProvider>
  )
}
