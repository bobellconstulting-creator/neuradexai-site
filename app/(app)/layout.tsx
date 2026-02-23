import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { SessionProvider } from 'next-auth/react'
import { BridgeProvider } from '@/components/providers/BridgeProvider'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/signin')

  return (
    <SessionProvider session={session}>
      <BridgeProvider>
        {children}
      </BridgeProvider>
    </SessionProvider>
  )
}
